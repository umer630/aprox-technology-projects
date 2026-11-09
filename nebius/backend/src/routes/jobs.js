import fs from 'node:fs';
import path from 'node:path';
import { one, all, pj } from '../db.js';
import { readJson, sendJson, notFound, str, int, startSse, bad } from '../http.js';
import { requireUser } from '../security.js';
import { projectAccess } from '../iam.js';
import { createJob, requestCancel, requestPause, resumeJob, retryJob, jobTypes, jobLogPath, jobDir, TERMINAL } from '../scheduler.js';
import { run, now } from '../db.js';

export const publicJob = (jb) => ({ ...jb, spec: pj(jb.spec, {}), requirements: pj(jb.requirements, {}), result: pj(jb.result, null), progress: pj(jb.progress, null), lease_owner: undefined });
function getJob(project, id) {
  const jb = one('SELECT * FROM jobs WHERE id = ? AND project_id = ?', id, project.id);
  if (!jb) throw notFound('Job not found');
  return jb;
}
function readLog(id, offset = 0, max = 256 * 1024) {
  const p = jobLogPath(id);
  if (!fs.existsSync(p)) return { text: '', next_offset: 0, size: 0 };
  const size = fs.statSync(p).size;
  const start = Math.max(0, Math.min(offset, size));
  const len = Math.min(max, size - start);
  const buf = Buffer.alloc(len);
  if (len) { const fd = fs.openSync(p, 'r'); fs.readSync(fd, buf, 0, len, start); fs.closeSync(fd); }
  return { text: buf.toString('utf8'), next_offset: start + len, size };
}

export function registerJobRoutes(r) {
  r.get('/api/jobs/types', async (req, res, ctx) => { requireUser(ctx, { allowApiKey: true }); sendJson(res, 200, { types: jobTypes() }); });

  r.get('/api/projects/:id/jobs', async (req, res, ctx, p, url) => {
    const { project } = projectAccess(ctx, p.id, 'read', { scope: 'jobs:read' });
    const status = url.searchParams.get('status');
    const rows = status ? all('SELECT * FROM jobs WHERE project_id = ? AND status = ? ORDER BY created_at DESC LIMIT 200', project.id, status)
      : all('SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 200', project.id);
    sendJson(res, 200, { jobs: rows.map(publicJob) });
  });

  r.post('/api/projects/:id/jobs', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'jobs:write' });
    const b = await readJson(req, 256 * 1024);
    const type = str(b.type, 'type', { max: 40 });
    if (type.startsWith('training.')) throw bad('Use the training endpoints to start training jobs (they run preflight first)', 'use_training_endpoint');
    const { job, duplicate } = createJob({
      project, user, type, name: str(b.name, 'name', { min: 1, max: 120, required: false }) || type,
      spec: b.spec && typeof b.spec === 'object' ? b.spec : {}, priority: int(b.priority, 'priority', { min: 0, max: 10, def: 5 }),
      idempotencyKey: b.idempotency_key ? str(b.idempotency_key, 'idempotency_key', { max: 100 }) : null,
      maxAttempts: int(b.max_attempts, 'max_attempts', { min: 1, max: 5, def: 1 }), timeoutS: int(b.timeout_s, 'timeout_s', { min: 10, max: 86400, def: 3600 }),
      allowDuplicate: b.allow_duplicate === true, requirements: Array.isArray(b.depends_on) ? { depends_on: b.depends_on.map(String).slice(0, 10) } : {},
    });
    sendJson(res, duplicate ? 200 : 201, { job: publicJob(job), duplicate });
  });

  r.get('/api/projects/:id/jobs/:jid', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'read', { scope: 'jobs:read' });
    const jb = getJob(project, p.jid);
    const events = all('SELECT id, type, message, data, created_at FROM job_events WHERE job_id = ? ORDER BY created_at ASC LIMIT 1000', jb.id).map((e) => ({ ...e, data: pj(e.data) }));
    const checkpoints = all('SELECT * FROM checkpoints WHERE job_id = ? ORDER BY created_at', jb.id);
    sendJson(res, 200, { job: publicJob(jb), events, checkpoints });
  });

  r.get('/api/projects/:id/jobs/:jid/logs', async (req, res, ctx, p, url) => {
    const { project } = projectAccess(ctx, p.id, 'read', { scope: 'jobs:read' });
    const jb = getJob(project, p.jid);
    sendJson(res, 200, { ...readLog(jb.id, Number(url.searchParams.get('offset')) || 0), status: jb.status });
  });

  // Live log stream (SSE). Ends when the job reaches a terminal state or after 30 minutes.
  r.get('/api/projects/:id/jobs/:jid/logs/stream', async (req, res, ctx, p, url) => {
    const { project } = projectAccess(ctx, p.id, 'read', { scope: 'jobs:read' });
    const jb = getJob(project, p.jid);
    const sse = startSse(res);
    let offset = Number(url.searchParams.get('offset')) || 0;
    const end = Date.now() + 30 * 60_000;
    let closed = false; req.on('close', () => { closed = true; });
    while (!closed && Date.now() < end) {
      const chunk = readLog(jb.id, offset);
      if (chunk.text) { sse.send('log', { text: chunk.text, offset: chunk.next_offset }); offset = chunk.next_offset; }
      const cur = one('SELECT status, progress FROM jobs WHERE id = ?', jb.id);
      sse.send('status', { status: cur.status, progress: pj(cur.progress) });
      if (TERMINAL.includes(cur.status) && !chunk.text) break;
      await new Promise((r2) => setTimeout(r2, 1000));
    }
    sse.end();
  });

  r.get('/api/projects/:id/jobs/:jid/metrics', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'read', { scope: 'jobs:read' });
    const jb = getJob(project, p.jid);
    const f = path.join(jobDir(jb.id), 'metrics.jsonl');
    const points = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
    sendJson(res, 200, { points, source: points.length ? 'parsed from trainer log output' : 'no training metrics reported yet' });
  });

  const act = (name, fn) => r.post(`/api/projects/:id/jobs/:jid/${name}`, async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'jobs:write' });
    const jb = getJob(project, p.jid);
    const outcome = fn(jb, user);
    sendJson(res, 200, { status: outcome || 'ok', job: publicJob(one('SELECT * FROM jobs WHERE id = ?', jb.id)) });
  });
  act('cancel', requestCancel);
  act('pause', requestPause);
  act('resume', resumeJob);
  act('retry', retryJob);

  r.patch('/api/projects/:id/jobs/:jid', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'write', { scope: 'jobs:write' });
    const jb = getJob(project, p.jid);
    const b = await readJson(req);
    const priority = int(b.priority, 'priority', { min: 0, max: 10 });
    run('UPDATE jobs SET priority = ?, updated_at = ? WHERE id = ?', priority, now(), jb.id);
    sendJson(res, 200, { job: publicJob(one('SELECT * FROM jobs WHERE id = ?', jb.id)) });
  });
}
