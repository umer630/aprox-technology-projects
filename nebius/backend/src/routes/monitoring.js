import { one, all, pj } from '../db.js';
import { sendJson } from '../http.js';
import { requireUser } from '../security.js';
import { projectAccess, orgAccess } from '../iam.js';
import { hostMetrics } from '../metrics.js';
import { listProviders, adapter } from '../providers/index.js';
import { storage } from '../storage/index.js';
import { dockerAvailable } from '../docker.js';

export function registerMonitoringRoutes(r) {
  r.get('/api/monitoring/host', async (req, res, ctx) => { requireUser(ctx); sendJson(res, 200, await hostMetrics()); });

  r.get('/api/monitoring/health', async (req, res, ctx) => {
    requireUser(ctx);
    let st; try { st = await storage().health(); } catch (e) { st = { ok: false, detail: e.message }; }
    const d = await dockerAvailable();
    const providers = listProviders().filter((p) => p.kind !== 'catalog-only').map((p) => ({ id: p.id, name: p.name, status: p.health?.status || 'never_checked', detail: p.health?.detail || null, checked_at: p.last_health_check_at, dispatchable: p.dispatchable }));
    sendJson(res, 200, { database: { ok: !!one('SELECT 1 AS ok').ok }, storage: st, container_runtime: d, providers });
  });

  r.get('/api/projects/:id/monitoring', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'read', { scope: 'jobs:read' });
    const instances = all("SELECT * FROM compute_instances WHERE project_id = ? AND status != 'DELETED'", project.id);
    const inst = [];
    for (const i of instances) {
      const a = adapter(i.provider_id);
      const stats = i.status === 'RUNNING' && a?.stats ? await a.stats(i) : null;
      inst.push({ id: i.id, name: i.name, status: i.status, provider: i.provider_id, machine_type: i.machine_type, stats: stats || { available: false, reason: i.status === 'RUNNING' ? 'provider exposes no metrics' : `instance ${i.status}` } });
    }
    const jobs = all('SELECT status, COUNT(*) AS n FROM jobs WHERE project_id = ? GROUP BY status', project.id);
    const durations = all("SELECT type, AVG(finished_at - started_at) AS avg_ms, COUNT(*) AS n FROM jobs WHERE project_id = ? AND finished_at IS NOT NULL AND started_at IS NOT NULL GROUP BY type", project.id);
    const training = all("SELECT id, name, status, progress, provider_id, started_at FROM jobs WHERE project_id = ? AND type = 'training.qlora' ORDER BY created_at DESC LIMIT 5", project.id).map((j) => ({ ...j, progress: pj(j.progress) || { available: false, reason: 'no trainer metrics reported yet' } }));
    const usage = all('SELECT kind, unit, SUM(quantity) AS total FROM usage_records WHERE project_id = ? GROUP BY kind, unit', project.id);
    const api = one('SELECT COUNT(*) AS requests, AVG(latency_ms) AS avg_latency_ms, SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors FROM request_logs WHERE project_id = ? AND created_at > ?', project.id, Date.now() - 86400_000);
    sendJson(res, 200, { instances: inst, jobs_by_status: jobs, job_durations: durations, training, usage, api_last_24h: api,
      gpu: { available: false, reason: 'GPU metrics are reported only by a running GPU provider; see training progress and provider health' }, measured_at: new Date().toISOString() });
  });

  // Logs: audit (project activity), api (requests made with this project's API keys), jobs (job events)
  r.get('/api/projects/:id/logs', async (req, res, ctx, p, url) => {
    const type = url.searchParams.get('type') || 'audit';
    const { project } = projectAccess(ctx, p.id, type === 'audit' ? 'read' : 'read', { scope: 'jobs:read' });
    const limit = Math.min(500, Number(url.searchParams.get('limit')) || 200);
    let rows;
    if (type === 'api') rows = all('SELECT method, route, status, latency_ms, api_key_id, created_at FROM request_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?', project.id, limit);
    else if (type === 'jobs') rows = all('SELECT e.created_at, e.type, e.message, j.id AS job_id, j.name AS job_name FROM job_events e JOIN jobs j ON j.id = e.job_id WHERE j.project_id = ? ORDER BY e.created_at DESC LIMIT ?', project.id, limit);
    else if (type === 'terminal') rows = all('SELECT h.created_at, h.command, h.exit_code, h.timed_out, s.user_id FROM terminal_history h JOIN terminal_sessions s ON s.id = h.session_id WHERE s.project_id = ? ORDER BY h.created_at DESC LIMIT ?', project.id, limit);
    else rows = all('SELECT a.created_at, a.action, a.target, a.detail, u.email AS actor FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id WHERE a.project_id = ? ORDER BY a.created_at DESC LIMIT ?', project.id, limit);
    sendJson(res, 200, { type, logs: rows });
  });

  r.get('/api/orgs/:id/usage', async (req, res, ctx, p) => {
    const { org } = orgAccess(ctx, p.id);
    sendJson(res, 200, { usage: all('SELECT project_id, kind, unit, SUM(quantity) AS total FROM usage_records WHERE org_id = ? GROUP BY project_id, kind, unit', org.id) });
  });
}
