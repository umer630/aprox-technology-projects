import { one, all, run, now } from '../db.js';
import { readJson, sendJson, notFound, bad, str, oneOf } from '../http.js';
import { requireUser, rateLimit } from '../security.js';
import { projectAccess } from '../iam.js';
import { listProviders, describeProvider, checkHealth, adapter, selectGpuProvider, providerIds, hostResources } from '../providers/index.js';
import { createInstance, instanceAction, deleteInstance, reconcile } from '../compute.js';
import { onProjectDelete } from './projects.js';

onProjectDelete(async (project) => {
  for (const inst of all("SELECT * FROM compute_instances WHERE project_id = ? AND status != 'DELETED'", project.id)) {
    try { await deleteInstance(inst, null); } catch { /* best effort; reconciler marks leftovers */ }
  }
});

function getInstance(project, id) {
  const inst = one("SELECT * FROM compute_instances WHERE id = ? AND project_id = ? AND status != 'DELETED'", id, project.id);
  if (!inst) throw notFound('Instance not found');
  return inst;
}

export function registerComputeRoutes(r) {
  // Provider facts, free-only verdicts and last live health. Contains no secrets.
  r.get('/api/providers', async (req, res, ctx) => {
    requireUser(ctx);
    sendJson(res, 200, { providers: listProviders() });
  });
  r.get('/api/providers/:pid', async (req, res, ctx, p) => {
    requireUser(ctx);
    const d = describeProvider(p.pid);
    if (!d) throw notFound('Provider not found');
    const a = adapter(p.pid);
    sendJson(res, 200, { provider: d, machine_types: a?.machineTypes ? a.machineTypes() : [] });
  });
  r.post('/api/providers/:pid/health', async (req, res, ctx, p) => {
    const u = requireUser(ctx);
    rateLimit(`health:${u.id}`, 30, 3600_000);
    if (!providerIds().includes(p.pid)) throw notFound('Provider not found');
    sendJson(res, 200, { provider: await checkHealth(p.pid) });
  });

  // GPU availability: real detected/dispatchable resources only. Answers "NO FREE GPU AVAILABLE" honestly.
  r.get('/api/gpu/availability', async (req, res, ctx, p, url) => {
    requireUser(ctx);
    const minVram = Math.max(0, Number(url.searchParams.get('min_vram_gb')) || 0);
    const sel = selectGpuProvider(minVram);
    const detected = all('SELECT g.*, g.provider_id FROM gpu_resources g ORDER BY detected_at DESC');
    sendJson(res, 200, sel.none
      ? { available: false, message: 'NO FREE GPU AVAILABLE', reasons: sel.reasons, detected_resources: detected, host: hostResources() }
      : { available: true, provider: sel.provider, gpu: sel.gpu, gpu_source: sel.gpu_source, detected_resources: detected, host: hostResources() });
  });

  r.get('/api/projects/:id/instances', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'read', { scope: 'compute:read' });
    sendJson(res, 200, { instances: all("SELECT * FROM compute_instances WHERE project_id = ? AND status != 'DELETED' ORDER BY created_at DESC", project.id) });
  });

  r.post('/api/projects/:id/instances', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'compute:write' });
    rateLimit(`inst-create:${user.id}`, 30, 3600_000);
    const b = await readJson(req);
    const name = str(b.name, 'name', { min: 2, max: 60 });
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw bad('name: lowercase letters, digits and hyphens; start with a letter', 'invalid_name');
    const inst = await createInstance({ project, user, name, providerId: str(b.provider_id, 'provider_id', { max: 60 }), machineType: str(b.machine_type, 'machine_type', { max: 40 }), image: b.image ? str(b.image, 'image', { max: 120 }) : 'alpine:3.20' });
    sendJson(res, inst.status === 'FAILED' ? 502 : 201, { instance: inst });
  });

  r.get('/api/projects/:id/instances/:iid', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'read', { scope: 'compute:read' });
    const inst = await reconcile(getInstance(project, p.iid));
    const a = adapter(inst.provider_id);
    const stats = inst.status === 'RUNNING' && a?.stats ? await a.stats(inst) : null;
    const events = all('SELECT * FROM instance_events WHERE instance_id = ? ORDER BY created_at DESC LIMIT 100', inst.id);
    const jobs = all('SELECT id, name, type, status, created_at FROM jobs WHERE instance_id = ? ORDER BY created_at DESC LIMIT 50', inst.id);
    sendJson(res, 200, { instance: inst, stats, stats_note: stats ? 'live from docker stats' : 'metrics unavailable (instance not running or provider exposes none)', events, jobs });
  });

  for (const action of ['start', 'stop', 'restart']) {
    r.post(`/api/projects/:id/instances/:iid/${action}`, async (req, res, ctx, p) => {
      const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'compute:write' });
      sendJson(res, 200, { instance: await instanceAction(getInstance(project, p.iid), action, user) });
    });
  }

  r.delete('/api/projects/:id/instances/:iid', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'compute:write' });
    await deleteInstance(getInstance(project, p.iid), user);
    sendJson(res, 200, { status: 'deleted' });
  });
  void oneOf; void run; void now;
}
