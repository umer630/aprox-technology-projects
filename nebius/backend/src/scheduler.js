// Job scheduler. Durable queue in SQLite with atomic claims + leases (no duplicate execution), priorities,
// dependencies, timeouts, cancellation, pause/resume (for checkpointable jobs), automatic and manual retry,
// and crash recovery. GPU jobs are only dispatched to a provider that passes the free-only policy; otherwise
// they wait in WAITING_FOR_GPU and are never silently run on CPU.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { one, all, run, now, newId, j, pj, notify, audit } from './db.js';
import { config } from './config.js';
import { selectGpuProvider } from './providers/index.js';
import { bad, conflict, HttpError } from './http.js';

export const ACTIVE = ['QUEUED', 'WAITING_FOR_GPU', 'BLOCKED', 'STARTING', 'RUNNING', 'PAUSED'];
export const TERMINAL = ['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'];
const WORKER = `w_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const MAX_CONCURRENT = 4;

const handlers = new Map();
const running = new Map(); // jobId → { abort, reason }

export function registerJobHandler(type, h) { handlers.set(type, h); }
export const jobTypes = () => [...handlers.entries()].map(([type, h]) => ({ type, gpu: !!h.requiresGpu, pausable: !!h.pausable, description: h.description || '' }));

export const jobDir = (id) => { const d = path.join(config.dataDir, 'jobs', id); fs.mkdirSync(d, { recursive: true }); return d; };
export const jobLogPath = (id) => path.join(jobDir(id), 'job.log');

export function jobEvent(jobId, type, message, data) {
  run('INSERT INTO job_events (id,job_id,type,message,data,created_at) VALUES (?,?,?,?,?,?)', newId('jev_'), jobId, type, String(message).slice(0, 2000), j(data), now());
}

function setStatus(job, status, { message, error, result, blocked } = {}) {
  const t = now();
  const finished = TERMINAL.includes(status) ? t : null;
  run(`UPDATE jobs SET status = ?, updated_at = ?, error = COALESCE(?, error), result = COALESCE(?, result), blocked_reason = ?,
       finished_at = COALESCE(?, finished_at), lease_owner = CASE WHEN ? THEN NULL ELSE lease_owner END WHERE id = ?`,
    status, t, error ? String(error).slice(0, 4000) : null, result !== undefined ? j(result) : null, blocked || null, finished, TERMINAL.includes(status) || ['PAUSED', 'QUEUED', 'WAITING_FOR_GPU', 'BLOCKED'].includes(status) ? 1 : 0, job.id);
  if (job.status !== status) jobEvent(job.id, 'status', `${job.status} → ${status}${message ? ': ' + message : ''}`, { from: job.status, to: status });
  if (TERMINAL.includes(status) || (status === 'WAITING_FOR_GPU' && job.status !== 'WAITING_FOR_GPU') || status === 'BLOCKED') {
    notify(job.created_by, 'job', `Job ${job.name}: ${status}`, message || error || '', { orgId: job.org_id, projectId: job.project_id, link: `#/jobs/${job.project_id}/${job.id}` });
  }
  job.status = status;
}

export function createJob({ project, user, type, name, spec = {}, requirements = {}, priority = 5, idempotencyKey = null, maxAttempts = 1, timeoutS = 3600, allowDuplicate = false }) {
  const h = handlers.get(type);
  if (!h) throw bad(`Unknown job type '${type}'`, 'unknown_job_type');
  if (h.validate) h.validate(spec, project);
  const reqs = { ...requirements, gpu: !!h.requiresGpu, min_vram_gb: requirements.min_vram_gb ?? h.minVramGb ?? 0 };
  const specText = JSON.stringify(spec);
  if (idempotencyKey) {
    const ex = one('SELECT * FROM jobs WHERE project_id = ? AND idempotency_key = ?', project.id, idempotencyKey);
    if (ex) return { job: ex, duplicate: true };
  }
  if (!allowDuplicate) {
    const dup = one(`SELECT id, status FROM jobs WHERE project_id = ? AND type = ? AND spec = ? AND status IN (${ACTIVE.map(() => '?').join(',')})`, project.id, type, specText, ...ACTIVE);
    if (dup) throw conflict(`An identical ${type} job is already ${dup.status} (${dup.id}). Set allow_duplicate to run it again.`, 'duplicate_job');
  }
  for (const dep of reqs.depends_on || []) {
    if (!one('SELECT id FROM jobs WHERE id = ? AND project_id = ?', dep, project.id)) throw bad(`Dependency ${dep} not found in this project`);
  }
  const id = newId('job_');
  const t = now();
  run(`INSERT INTO jobs (id,org_id,project_id,type,name,status,priority,spec,requirements,idempotency_key,max_attempts,timeout_s,created_by,created_at,queued_at,updated_at)
       VALUES (?,?,?,?,?,'QUEUED',?,?,?,?,?,?,?,?,?,?)`, id, project.org_id, project.id, type, name, priority, specText, j(reqs), idempotencyKey, maxAttempts, timeoutS, user.id, t, t, t);
  jobEvent(id, 'created', `Job created (${type})`, { priority, requirements: reqs });
  audit(user.id, 'job.create', { orgId: project.org_id, projectId: project.id, target: id, detail: { type, name } });
  return { job: one('SELECT * FROM jobs WHERE id = ?', id), duplicate: false };
}

export function requestCancel(job, user) {
  if (TERMINAL.includes(job.status)) throw conflict(`Job already ${job.status}`, 'invalid_state');
  audit(user.id, 'job.cancel', { orgId: job.org_id, projectId: job.project_id, target: job.id });
  if (['STARTING', 'RUNNING'].includes(job.status)) {
    run('UPDATE jobs SET cancel_requested = 1, updated_at = ? WHERE id = ?', now(), job.id);
    const r = running.get(job.id);
    if (r) { r.reason = 'cancel'; r.abort.abort(); }
    jobEvent(job.id, 'cancel_requested', 'Cancellation requested');
    return 'cancel_requested';
  }
  setStatus(job, 'CANCELLED', { message: 'cancelled by user' });
  return 'cancelled';
}

export function requestPause(job, user) {
  const h = handlers.get(job.type);
  if (!h?.pausable) throw bad('This job type cannot be paused (no checkpoint support)', 'pause_not_supported');
  if (!['RUNNING', 'STARTING', 'QUEUED', 'WAITING_FOR_GPU'].includes(job.status)) throw conflict(`Cannot pause a ${job.status} job`, 'invalid_state');
  audit(user.id, 'job.pause', { orgId: job.org_id, projectId: job.project_id, target: job.id });
  const r = running.get(job.id);
  if (r) { run('UPDATE jobs SET pause_requested = 1 WHERE id = ?', job.id); r.reason = 'pause'; r.abort.abort(); return 'pause_requested'; }
  setStatus(job, 'PAUSED', { message: 'paused by user' });
  return 'paused';
}

export function resumeJob(job, user) {
  if (job.status !== 'PAUSED') throw conflict('Only paused jobs can be resumed', 'invalid_state');
  run("UPDATE jobs SET status = 'QUEUED', pause_requested = 0, cancel_requested = 0, queued_at = ?, updated_at = ? WHERE id = ?", now(), now(), job.id);
  jobEvent(job.id, 'status', 'PAUSED → QUEUED: resumed (will continue from the latest checkpoint where supported)', { resume: true });
  audit(user.id, 'job.resume', { orgId: job.org_id, projectId: job.project_id, target: job.id });
}

export function retryJob(job, user) {
  if (!['FAILED', 'TIMED_OUT', 'CANCELLED', 'BLOCKED'].includes(job.status)) throw conflict('Only failed, timed-out, cancelled or blocked jobs can be retried', 'invalid_state');
  run("UPDATE jobs SET status = 'QUEUED', cancel_requested = 0, pause_requested = 0, error = NULL, blocked_reason = NULL, finished_at = NULL, max_attempts = attempts + 1, queued_at = ?, updated_at = ? WHERE id = ?", now(), now(), job.id);
  jobEvent(job.id, 'status', `${job.status} → QUEUED: manual retry`, { retry: true });
  audit(user.id, 'job.retry', { orgId: job.org_id, projectId: job.project_id, target: job.id });
}

function depsState(job) {
  const deps = pj(job.requirements, {}).depends_on || [];
  for (const d of deps) {
    const dj = one('SELECT status FROM jobs WHERE id = ?', d);
    if (!dj || ['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(dj.status)) return { blocked: `dependency ${d} ${dj ? dj.status : 'missing'}` };
    if (dj.status !== 'SUCCEEDED') return { waiting: true };
  }
  return { ok: true };
}

function recoverOrphans() {
  const t = now();
  const rows = all("SELECT * FROM jobs WHERE status IN ('STARTING','RUNNING') AND (lease_owner IS NULL OR lease_owner != ? OR lease_expires_at < ?)", WORKER, t);
  for (const job of rows) {
    if (running.has(job.id)) continue;
    const h = handlers.get(job.type);
    if (job.attempts < job.max_attempts || h?.pausable) {
      run("UPDATE jobs SET status = 'QUEUED', lease_owner = NULL, queued_at = ?, updated_at = ? WHERE id = ?", t, t, job.id);
      jobEvent(job.id, 'recovered', 'Worker lost the job (restart/crash); re-queued — checkpointable jobs resume from their last checkpoint', { attempts: job.attempts });
    } else {
      setStatus(job, 'FAILED', { error: 'worker lost the job (server restart) and no attempts remain' });
    }
  }
}

export async function tick() {
  recoverOrphans();
  // Renew leases of jobs this worker is running.
  for (const id of running.keys()) run('UPDATE jobs SET lease_expires_at = ? WHERE id = ? AND lease_owner = ?', now() + config.scheduler.leaseSec * 1000, id, WORKER);
  const candidates = all("SELECT * FROM jobs WHERE status IN ('QUEUED','WAITING_FOR_GPU','BLOCKED') ORDER BY priority DESC, queued_at ASC LIMIT 50");
  for (const job of candidates) {
    if (running.size >= MAX_CONCURRENT) break;
    const ds = depsState(job);
    if (ds.blocked) { if (job.status !== 'BLOCKED') setStatus(job, 'BLOCKED', { blocked: ds.blocked, message: ds.blocked }); continue; }
    if (ds.waiting) continue;
    if (job.status === 'BLOCKED' && !ds.ok) continue;
    const reqs = pj(job.requirements, {});
    let providerId = null; let gpu = null;
    if (reqs.gpu) {
      const sel = selectGpuProvider(reqs.min_vram_gb || 0);
      if (sel.none) {
        const reason = `NO FREE GPU AVAILABLE (needs ≥${reqs.min_vram_gb || 0} GB). ${sel.reasons.join('; ')}`.slice(0, 1000);
        if (job.status !== 'WAITING_FOR_GPU') setStatus(job, 'WAITING_FOR_GPU', { blocked: reason, message: 'NO FREE GPU AVAILABLE — job preserved, waiting for an eligible free GPU' });
        else run('UPDATE jobs SET blocked_reason = ?, updated_at = ? WHERE id = ?', reason, now(), job.id);
        continue;
      }
      providerId = sel.provider; gpu = sel.gpu;
    }
    const claim = run(`UPDATE jobs SET status = 'STARTING', lease_owner = ?, lease_expires_at = ?, attempts = attempts + 1, started_at = COALESCE(started_at, ?),
      provider_id = COALESCE(?, provider_id), blocked_reason = NULL, updated_at = ? WHERE id = ? AND status IN ('QUEUED','WAITING_FOR_GPU','BLOCKED')`,
    WORKER, now() + config.scheduler.leaseSec * 1000, now(), providerId, now(), job.id);
    if (claim.changes !== 1) continue; // someone else claimed it
    const claimed = one('SELECT * FROM jobs WHERE id = ?', job.id);
    jobEvent(job.id, 'status', `${job.status} → STARTING (attempt ${claimed.attempts})${providerId ? ` on ${providerId}` : ''}`, { provider: providerId, gpu });
    launch(claimed, { gpu });
  }
}

function launch(job, { gpu }) {
  const h = handlers.get(job.type);
  const abort = new AbortController();
  const entry = { abort, reason: null };
  running.set(job.id, entry);
  const logFile = jobLogPath(job.id);
  const log = (text) => { try { fs.appendFileSync(logFile, String(text).endsWith('\n') ? String(text) : String(text) + '\n'); } catch { /* disk issue */ } h.onLog?.(job, String(text)); };
  const timer = setTimeout(() => { entry.reason = 'timeout'; abort.abort(); }, job.timeout_s * 1000);
  const io = {
    log, signal: abort.signal, gpu, workdir: jobDir(job.id),
    setRunning: (detail) => { const cur = one('SELECT * FROM jobs WHERE id = ?', job.id); if (cur.status === 'STARTING') setStatus(cur, 'RUNNING', { message: detail }); },
    setProgress: (p) => run('UPDATE jobs SET progress = ?, updated_at = ? WHERE id = ?', j(p), now(), job.id),
    setProviderRef: (ref) => run('UPDATE jobs SET provider_ref = ? WHERE id = ?', ref, job.id),
    event: (type, msg, data) => jobEvent(job.id, type, msg, data),
    spec: pj(job.spec, {}),
    resume: job.attempts > 1,
  };
  const started = now();
  (async () => {
    let outcome;
    try { outcome = await h.run(job, io); } catch (e) { outcome = { status: 'FAILED', error: e.message || String(e) }; }
    clearTimeout(timer);
    running.delete(job.id);
    if (entry.reason === 'shutdown') return; // left RUNNING with an expiring lease → recovered on next start
    const cur = one('SELECT * FROM jobs WHERE id = ?', job.id);
    if (entry.reason === 'cancel' || cur.cancel_requested) setStatus(cur, 'CANCELLED', { message: 'cancelled' });
    else if (entry.reason === 'pause') setStatus(cur, 'PAUSED', { message: 'paused; resume continues from the latest checkpoint' });
    else if (entry.reason === 'timeout') setStatus(cur, 'TIMED_OUT', { error: `exceeded timeout of ${job.timeout_s}s` });
    else if (outcome?.status === 'SUCCEEDED') setStatus(cur, 'SUCCEEDED', { result: outcome.result, message: outcome.message });
    else if (outcome?.status === 'BLOCKED') setStatus(cur, 'BLOCKED', { blocked: outcome.error, error: outcome.error, message: outcome.error });
    else if (cur.attempts < cur.max_attempts) {
      run("UPDATE jobs SET status = 'QUEUED', lease_owner = NULL, error = ?, queued_at = ?, updated_at = ? WHERE id = ?", String(outcome?.error || 'failed').slice(0, 4000), now(), now(), job.id);
      jobEvent(job.id, 'status', `RUNNING → QUEUED: attempt ${cur.attempts} failed, retrying (${outcome?.error || ''})`.slice(0, 1000));
    } else setStatus(cur, 'FAILED', { error: outcome?.error || 'failed', result: outcome?.result });
    const secs = Math.round((now() - started) / 1000);
    const kind = gpu ? 'gpu_job_wall_seconds' : 'cpu_job_wall_seconds';
    if (!(job.provider_id === 'mock-gpu')) run('INSERT INTO usage_records (id,org_id,project_id,kind,quantity,unit,source,ref,created_at) VALUES (?,?,?,?,?,?,?,?,?)', newId('use_'), job.org_id, job.project_id, kind, secs, 'seconds', job.provider_id || 'local', job.id, now());
  })();
}

/** Await a job reaching a state (tests / CLI). */
export async function waitFor(jobId, states, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const jb = one('SELECT * FROM jobs WHERE id = ?', jobId);
    if (states.includes(jb.status)) return jb;
    await tick();
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new HttpError(500, 'timeout', `job ${jobId} did not reach ${states}`);
}

let loop = null;
export function startScheduler() {
  if (loop || !config.scheduler.enabled) return;
  const go = async () => { try { await tick(); } catch (e) { console.error('[scheduler]', e); } loop = setTimeout(go, config.scheduler.tickMs); };
  loop = setTimeout(go, 500);
}
export function stopScheduler() { if (loop) clearTimeout(loop); loop = null; for (const r of running.values()) { r.reason = 'shutdown'; r.abort.abort(); } }
export const runningJobs = () => [...running.keys()];
