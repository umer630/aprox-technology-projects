// GPU / compute provider registry + free-only policy engine.
// A provider can receive work only when ALL hold:
//   1. catalog facts: no credit card, no billing (unknown counts as "required")
//   2. a superadmin recorded a verification of the account in use (provider_state.admin_verified)
//   3. it is enabled by a superadmin
//   4. its most recent live health check passed (and is recent)
// The mock provider exists only when NEBIUS_ENV=test and is labelled as a test double everywhere.
import os from 'node:os';
import { one, all, run, now, newId, pj } from '../db.js';
import { config, isTest } from '../config.js';
import { CATALOG, FREE_ONLY, freeOnlyVerdict } from './catalog.js';
import { dockerAvailable } from '../docker.js';
import { DockerCpuAdapter } from './dockercpu.js';
import { KaggleAdapter } from './kaggle.js';
import { LocalNvidiaAdapter } from './localnvidia.js';
import { MockAdapter } from './mock.js';

class ManualAdapter {
  constructor(id) { this.id = id; this.supportsInstances = false; this.supportsBatch = false; }
  async health() { return { status: 'manual', detail: 'No provisioning API. Run the generated notebook yourself and upload the evidence; NEBIUS verifies it.' }; }
  async resources() { return []; }
}
class CatalogOnlyAdapter {
  constructor(id) { this.id = id; this.supportsInstances = false; this.supportsBatch = false; }
  async health() { return { status: 'ineligible', detail: FREE_ONLY.INELIGIBLE }; }
  async resources() { return []; }
}

const adapters = new Map();
export function adapter(id) {
  if (adapters.has(id)) return adapters.get(id);
  const entry = CATALOG[id] || (id === 'mock-gpu' && isTest() ? MockAdapter.entry : null);
  if (!entry) return null;
  let a;
  if (id === 'local-docker-cpu') a = new DockerCpuAdapter(id);
  else if (id === 'kaggle') a = new KaggleAdapter(id);
  else if (id === 'local-nvidia') a = new LocalNvidiaAdapter(id);
  else if (id === 'mock-gpu') a = new MockAdapter(id);
  else if (entry.automation === 'manual') a = new ManualAdapter(id);
  else a = new CatalogOnlyAdapter(id);
  adapters.set(id, a);
  return a;
}

export function providerIds() {
  const ids = Object.keys(CATALOG);
  if (isTest()) ids.push('mock-gpu');
  return ids;
}
export const entryOf = (id) => (id === 'mock-gpu' && isTest() ? MockAdapter.entry : CATALOG[id]);

function state(id) {
  let s = one('SELECT * FROM provider_state WHERE provider_id = ?', id);
  if (!s) {
    // Self-hosted CPU sandbox is on by default (no billing possible); everything else starts disabled.
    const e = entryOf(id);
    run('INSERT INTO provider_state (provider_id, enabled, admin_verified) VALUES (?,?,?)', id, e?.kind === 'cpu-container' ? 1 : 0, e?.kind === 'cpu-container' ? 1 : 0);
    s = one('SELECT * FROM provider_state WHERE provider_id = ?', id);
  }
  return s;
}

export function describeProvider(id) {
  const e = entryOf(id);
  if (!e) return null;
  const s = state(id);
  const verdict = freeOnlyVerdict(e, s);
  const health = pj(s.last_health, null);
  const resources = all('SELECT name, vram_mb, cuda_capability, driver_version, cuda_version, utilization_pct, memory_used_mb, source, available, detected_at FROM gpu_resources WHERE provider_id = ?', id);
  const a = adapter(id);
  return {
    id, name: e.name, kind: e.kind, automation: e.automation, mock: id === 'mock-gpu',
    facts: e.facts,
    free_only_status: verdict,
    admin_verified: !!s.admin_verified, verified_at: s.verified_at, verification_notes: s.verification_notes,
    enabled: !!s.enabled,
    health, last_health_check_at: s.last_health_at, last_successful_health_check_at: s.last_success_at,
    resources,
    capabilities: { instances: !!a?.supportsInstances, batch_jobs: !!a?.supportsBatch, gpu: e.kind.startsWith('gpu') },
    dispatchable: isDispatchable(id),
  };
}
export const listProviders = () => providerIds().map(describeProvider);

export function isDispatchable(id) {
  const e = entryOf(id);
  const s = state(id);
  const verdict = freeOnlyVerdict(e, s);
  if (![FREE_ONLY.ELIGIBLE, FREE_ONLY.NOT_GPU].includes(verdict)) return false;
  if (!s.enabled || !s.admin_verified) return false;
  const h = pj(s.last_health, null);
  if (!h || h.status !== 'healthy') return false;
  return now() - (s.last_health_at || 0) < Math.max(2 * config.providers.healthIntervalSec * 1000, 600_000);
}

export async function checkHealth(id) {
  const a = adapter(id);
  if (!a) return null;
  state(id);
  let h;
  try { h = await a.health(); } catch (e) { h = { status: 'error', detail: String(e.message).slice(0, 300) }; }
  h.checked_at = now();
  const ok = h.status === 'healthy';
  run('UPDATE provider_state SET last_health = ?, last_health_at = ?, last_success_at = CASE WHEN ? THEN ? ELSE last_success_at END WHERE provider_id = ?',
    JSON.stringify(h), h.checked_at, ok ? 1 : 0, h.checked_at, id);
  // Replace detected resources with what the provider/runtime reports *now* (never kept stale as "available").
  let res = [];
  if (ok) { try { res = await a.resources(); } catch (e) { h.resources_error = String(e.message).slice(0, 200); } }
  run('DELETE FROM gpu_resources WHERE provider_id = ?', id);
  for (const r of res) {
    run('INSERT INTO gpu_resources (id,provider_id,name,vram_mb,cuda_capability,driver_version,cuda_version,utilization_pct,memory_used_mb,source,available,detected_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      newId('gpu_'), id, r.name, r.vram_mb ?? null, r.cuda_capability ?? null, r.driver_version ?? null, r.cuda_version ?? null, r.utilization_pct ?? null, r.memory_used_mb ?? null, r.source, r.available === false ? 0 : 1, now());
  }
  return describeProvider(id);
}
export async function checkAllHealth() {
  for (const id of providerIds()) {
    const e = entryOf(id);
    if (e.kind === 'catalog-only') { state(id); continue; }
    await checkHealth(id);
  }
}

export function setVerification(id, adminId, verified, notes) {
  const e = entryOf(id);
  if (!e) return null;
  state(id);
  if (verified && (e.facts.credit_card_required !== false || e.facts.billing_required !== false)) {
    return { error: FREE_ONLY.INELIGIBLE };
  }
  run('UPDATE provider_state SET admin_verified = ?, verified_by = ?, verified_at = ?, verification_notes = ?, enabled = CASE WHEN ? THEN enabled ELSE 0 END WHERE provider_id = ?',
    verified ? 1 : 0, adminId, now(), String(notes || '').slice(0, 1000), verified ? 1 : 0, id);
  return describeProvider(id);
}
export function setEnabled(id, enabled) {
  const e = entryOf(id);
  if (!e) return null;
  const s = state(id);
  const verdict = freeOnlyVerdict(e, s);
  if (enabled) {
    if (verdict === FREE_ONLY.INELIGIBLE) return { error: FREE_ONLY.INELIGIBLE };
    if (verdict === FREE_ONLY.MANUAL_ONLY) return { error: 'MANUAL_ONLY_PROVIDER_CANNOT_RECEIVE_JOBS' };
    if (!s.admin_verified) return { error: 'ADMIN_VERIFICATION_REQUIRED' };
  }
  run('UPDATE provider_state SET enabled = ? WHERE provider_id = ?', enabled ? 1 : 0, id);
  return describeProvider(id);
}

/**
 * Select a GPU provider for a job. Returns { provider, gpu } or { none: true, reasons }.
 * minVramGb is the job's requirement. For batch providers whose hardware is only known at runtime, the
 * declared offering is used for matching and the pipeline's own preflight confirms the real GPU.
 */
export function selectGpuProvider(minVramGb, { allowMock = isTest() } = {}) {
  const reasons = [];
  for (const id of providerIds()) {
    const e = entryOf(id);
    if (!e.kind.startsWith('gpu')) continue;
    if (id === 'mock-gpu' && !allowMock) continue;
    const a = adapter(id);
    if (!a.supportsBatch) { reasons.push(`${id}: ${e.automation === 'manual' ? 'manual-only provider' : 'no batch support'}`); continue; }
    if (!isDispatchable(id)) { reasons.push(`${id}: ${describeProvider(id).free_only_status}${state(id).enabled ? '' : ', not enabled'}${pj(state(id).last_health)?.status === 'healthy' ? '' : ', health ' + (pj(state(id).last_health)?.status || 'never checked')}`); continue; }
    const res = all('SELECT * FROM gpu_resources WHERE provider_id = ? AND available = 1', id);
    if (e.kind === 'gpu-local') {
      const fit = res.find((r) => (r.vram_mb || 0) / 1024 >= minVramGb);
      if (!fit) { reasons.push(`${id}: no detected GPU with ≥${minVramGb} GB`); continue; }
      return { provider: id, gpu: fit, gpu_source: 'detected' };
    }
    const declared = e.facts.gpu_vram_gb || 0;
    const detected = res[0];
    if ((detected ? (detected.vram_mb || 0) / 1024 : declared) < minVramGb) { reasons.push(`${id}: offering ${declared} GB < ${minVramGb} GB`); continue; }
    return { provider: id, gpu: detected || { name: e.facts.gpu_types.join(' / '), vram_mb: declared * 1024, source: 'provider_offering_declared' }, gpu_source: detected ? 'detected' : 'declared_confirmed_at_runtime' };
  }
  return { none: true, message: 'NO FREE GPU AVAILABLE', reasons };
}

export function hostResources() {
  return { cpus: os.cpus().length, cpu_model: os.cpus()[0]?.model || 'unknown', total_mem_mb: Math.round(os.totalmem() / 1048576), free_mem_mb: Math.round(os.freemem() / 1048576), platform: `${os.platform()} ${os.release()}` };
}

export { execText } from '../exec.js';
export { dockerAvailable, FREE_ONLY };
