import { one, all, run, now } from '../db.js';
import { sendJson, notFound } from '../http.js';
import { requireUser } from '../security.js';
import { orgAccess, effectiveProjectRole } from '../iam.js';
import { listProviders, selectGpuProvider } from '../providers/index.js';
import { hostMetrics } from '../metrics.js';

function accessibleProjectIds(u, orgId = null) {
  const rows = orgId ? all("SELECT * FROM projects WHERE org_id = ? AND status IN ('active','archived')", orgId)
    : u.platform_role === 'superadmin' ? all("SELECT * FROM projects WHERE status IN ('active','archived')")
      : all(`SELECT * FROM projects WHERE status IN ('active','archived') AND (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = ?) OR id IN (SELECT project_id FROM project_memberships WHERE user_id = ?))`, u.id, u.id);
  return rows.filter((p) => effectiveProjectRole(u, p)).map((p) => p.id);
}
const inList = (ids) => (ids.length ? ids.map(() => '?').join(',') : "''");

export function registerMiscRoutes(r) {
  // Console dashboard: every number is a real count/measurement; unmeasurable items say so.
  r.get('/api/dashboard', async (req, res, ctx, p, url) => {
    const u = requireUser(ctx);
    const orgId = url.searchParams.get('org_id');
    if (orgId) orgAccess(ctx, orgId);
    const ids = accessibleProjectIds(u, orgId);
    const L = inList(ids);
    const count = (sql) => one(sql.replace('$IDS', L), ...ids).n;
    const providers = listProviders();
    const gpu = selectGpuProvider(0);
    const jobStatus = all(`SELECT status, COUNT(*) AS n FROM jobs WHERE project_id IN (${L}) GROUP BY status`, ...ids);
    sendJson(res, 200, {
      projects: count("SELECT COUNT(*) AS n FROM projects WHERE id IN ($IDS) AND status = 'active'"),
      archived_projects: count("SELECT COUNT(*) AS n FROM projects WHERE id IN ($IDS) AND status = 'archived'"),
      gpu_providers: { free_eligible_dispatchable: providers.filter((x) => x.capabilities.gpu && x.dispatchable).length, listed: providers.filter((x) => x.capabilities.gpu).length,
        status: gpu.none ? 'NO FREE GPU AVAILABLE' : `available via ${gpu.provider}` },
      active_gpu_jobs: count("SELECT COUNT(*) AS n FROM jobs WHERE project_id IN ($IDS) AND status IN ('STARTING','RUNNING') AND requirements LIKE '%\"gpu\":true%'"),
      waiting_for_gpu: count("SELECT COUNT(*) AS n FROM jobs WHERE project_id IN ($IDS) AND status = 'WAITING_FOR_GPU'"),
      running_instances: count("SELECT COUNT(*) AS n FROM compute_instances WHERE project_id IN ($IDS) AND status = 'RUNNING'"),
      storage_bytes: one(`SELECT COALESCE(SUM(size_bytes),0) AS n FROM storage_objects WHERE project_id IN (${L}) AND deleted_at IS NULL`, ...ids).n,
      job_status: jobStatus,
      recent_activity: all(`SELECT a.action, a.target, a.project_id, a.created_at, u.email AS actor FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id WHERE a.project_id IN (${L}) ORDER BY a.created_at DESC LIMIT 15`, ...ids),
      recent_jobs: all(`SELECT id, project_id, name, type, status, created_at FROM jobs WHERE project_id IN (${L}) ORDER BY created_at DESC LIMIT 10`, ...ids),
      notifications_unread: one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', u.id).n,
      host: await hostMetrics(),
    });
  });

  r.get('/api/search', async (req, res, ctx, p, url) => {
    const u = requireUser(ctx);
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (q.length < 2) return sendJson(res, 200, { results: [] });
    const ids = accessibleProjectIds(u); const L = inList(ids);
    const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    const results = [
      ...all(`SELECT 'project' AS type, id, name AS title, project_code AS subtitle, id AS project_id FROM projects WHERE id IN (${L}) AND (name LIKE ? ESCAPE '\\' OR project_code LIKE ? ESCAPE '\\') LIMIT 10`, ...ids, like, like),
      ...all(`SELECT 'file' AS type, id, name AS title, kind AS subtitle, project_id FROM files WHERE project_id IN (${L}) AND deleted_at IS NULL AND name LIKE ? ESCAPE '\\' LIMIT 20`, ...ids, like),
      ...all(`SELECT 'job' AS type, id, name AS title, status AS subtitle, project_id FROM jobs WHERE project_id IN (${L}) AND (name LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\') LIMIT 10`, ...ids, like, like),
      ...all(`SELECT 'instance' AS type, id, name AS title, status AS subtitle, project_id FROM compute_instances WHERE project_id IN (${L}) AND status != 'DELETED' AND name LIKE ? ESCAPE '\\' LIMIT 10`, ...ids, like),
    ];
    sendJson(res, 200, { results });
  });

  r.get('/api/notifications', async (req, res, ctx, p, url) => {
    const u = requireUser(ctx);
    const unread = url.searchParams.get('unread') === '1';
    sendJson(res, 200, { notifications: all(`SELECT * FROM notifications WHERE user_id = ? ${unread ? 'AND read_at IS NULL' : ''} ORDER BY created_at DESC LIMIT 100`, u.id),
      unread: one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', u.id).n });
  });
  r.post('/api/notifications/:nid/read', async (req, res, ctx, p) => {
    const u = requireUser(ctx);
    const r2 = run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', now(), p.nid, u.id);
    if (!r2.changes && !one('SELECT id FROM notifications WHERE id = ? AND user_id = ?', p.nid, u.id)) throw notFound('Notification not found');
    sendJson(res, 200, { status: 'read' });
  });
  r.post('/api/notifications/read-all', async (req, res, ctx) => {
    const u = requireUser(ctx);
    run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now(), u.id);
    sendJson(res, 200, { status: 'read' });
  });
}
