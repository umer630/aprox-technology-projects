import { one, all, run, now, tx, audit, newId } from '../db.js';
import { readJson, sendJson, bad, conflict, notFound, str, oneOf, clientIp } from '../http.js';
import { requireUser } from '../security.js';
import { orgAccess, projectAccess, PROJECT_ROLES, effectiveProjectRole, rank } from '../iam.js';
import { config } from '../config.js';
import { slugify } from './orgs.js';

// Other modules register cleanup (storage objects, containers) to run when a project is deleted.
const deleteHooks = [];
export const onProjectDelete = (fn) => deleteHooks.push(fn);

export function projectSummary(projectId) {
  return one(`SELECT
    (SELECT COUNT(*) FROM files WHERE project_id = ? AND deleted_at IS NULL) AS files,
    (SELECT COUNT(*) FROM folders WHERE project_id = ? AND deleted_at IS NULL) AS folders,
    (SELECT COALESCE(SUM(size_bytes),0) FROM storage_objects WHERE project_id = ? AND deleted_at IS NULL) AS storage_bytes,
    (SELECT COUNT(*) FROM compute_instances WHERE project_id = ? AND status != 'DELETED') AS instances,
    (SELECT COUNT(*) FROM compute_instances WHERE project_id = ? AND status = 'RUNNING') AS running_instances,
    (SELECT COUNT(*) FROM jobs WHERE project_id = ?) AS jobs,
    (SELECT COUNT(*) FROM jobs WHERE project_id = ? AND status IN ('QUEUED','WAITING_FOR_GPU','STARTING','RUNNING','PAUSED','BLOCKED')) AS active_jobs,
    (SELECT COUNT(*) FROM model_artifacts WHERE project_id = ?) AS model_artifacts,
    (SELECT COUNT(*) FROM api_keys WHERE project_id = ? AND revoked_at IS NULL) AS api_keys`,
  ...Array(9).fill(projectId));
}

export function registerProjectRoutes(r) {
  r.get('/api/projects', async (req, res, ctx, p, url) => {
    const u = requireUser(ctx);
    const orgId = url.searchParams.get('org_id');
    const includeArchived = url.searchParams.get('include_archived') === '1';
    const statuses = includeArchived ? "('active','archived')" : "('active')";
    let rows;
    if (orgId) {
      orgAccess(ctx, orgId);
      rows = all(`SELECT * FROM projects WHERE org_id = ? AND status IN ${statuses} ORDER BY updated_at DESC`, orgId);
    } else if (u.platform_role === 'superadmin') {
      rows = all(`SELECT * FROM projects WHERE status IN ${statuses} ORDER BY updated_at DESC LIMIT 500`);
    } else {
      rows = all(`SELECT p.* FROM projects p WHERE p.status IN ${statuses} AND (
        p.org_id IN (SELECT org_id FROM org_memberships WHERE user_id = ?) OR
        p.id IN (SELECT project_id FROM project_memberships WHERE user_id = ?)) ORDER BY p.updated_at DESC`, u.id, u.id);
    }
    const out = rows.map((pr) => ({ ...pr, my_role: effectiveProjectRole(u, pr) })).filter((pr) => pr.my_role);
    sendJson(res, 200, { projects: out });
  });

  r.post('/api/projects', async (req, res, ctx) => {
    const b = await readJson(req);
    const { org, user } = orgAccess(ctx, b.org_id, 'developer');
    const name = str(b.name, 'name', { min: 2, max: 80 });
    const description = str(b.description, 'description', { max: 1000, required: false }) || '';
    let code = b.project_code ? str(b.project_code, 'project_code', { min: 6, max: 30 }) : `${slugify(name).slice(0, 20)}-${newId().slice(0, 6)}`;
    if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(code)) throw bad('project_code must be 6–30 chars: lowercase letters, digits, hyphens; start with a letter', 'invalid_project_code');
    if (one('SELECT id FROM projects WHERE project_code = ?', code)) throw conflict('Project ID already taken', 'project_code_taken');
    const id = newId('prj_');
    const t = now();
    tx(() => {
      run('INSERT INTO projects (id,org_id,project_code,name,description,storage_quota_bytes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
        id, org.id, code, name, description, config.storage.defaultProjectQuotaBytes, user.id, t, t);
      run("INSERT INTO project_memberships (project_id,user_id,role,created_at) VALUES (?,?,'project_admin',?)", id, user.id, t);
    });
    audit(user.id, 'project.create', { orgId: org.id, projectId: id, target: id, ip: clientIp(req), detail: { name, code } });
    sendJson(res, 201, { project: one('SELECT * FROM projects WHERE id = ?', id) });
  });

  r.get('/api/projects/:id', async (req, res, ctx, p) => {
    const { project, role } = projectAccess(ctx, p.id, 'read', { scope: 'projects:read' });
    sendJson(res, 200, { project: { ...project, my_role: role }, resources: projectSummary(project.id) });
  });

  r.patch('/api/projects/:id', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'admin');
    const b = await readJson(req);
    const name = b.name !== undefined ? str(b.name, 'name', { min: 2, max: 80 }) : project.name;
    const description = b.description !== undefined ? str(b.description, 'description', { max: 1000 }) : project.description;
    run('UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?', name, description, now(), project.id);
    audit(user.id, 'project.update', { orgId: project.org_id, projectId: project.id, target: project.id, ip: clientIp(req) });
    sendJson(res, 200, { project: one('SELECT * FROM projects WHERE id = ?', project.id) });
  });

  r.post('/api/projects/:id/archive', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'admin');
    const active = one("SELECT COUNT(*) AS n FROM jobs WHERE project_id = ? AND status IN ('STARTING','RUNNING')", project.id).n;
    if (active) throw conflict('Stop running jobs before archiving', 'project_busy');
    run("UPDATE projects SET status = 'archived', updated_at = ? WHERE id = ?", now(), project.id);
    audit(user.id, 'project.archive', { orgId: project.org_id, projectId: project.id, target: project.id });
    sendJson(res, 200, { status: 'archived' });
  });

  r.post('/api/projects/:id/unarchive', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'admin', { allowArchived: true });
    run("UPDATE projects SET status = 'active', updated_at = ? WHERE id = ?", now(), project.id);
    audit(user.id, 'project.unarchive', { orgId: project.org_id, projectId: project.id, target: project.id });
    sendJson(res, 200, { status: 'active' });
  });

  // Delete requires typing the project ID (project_code) as confirmation.
  r.post('/api/projects/:id/delete', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'admin', { allowArchived: true });
    const b = await readJson(req);
    if (b.confirm !== project.project_code) throw bad(`Type the project ID "${project.project_code}" to confirm deletion`, 'confirmation_required');
    const active = one("SELECT COUNT(*) AS n FROM jobs WHERE project_id = ? AND status IN ('STARTING','RUNNING')", project.id).n;
    if (active) throw conflict('Cancel running jobs before deleting', 'project_busy');
    for (const h of deleteHooks) await h(project);
    tx(() => {
      run("UPDATE projects SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?", now(), now(), project.id);
      run('UPDATE api_keys SET revoked_at = ? WHERE project_id = ? AND revoked_at IS NULL', now(), project.id);
      run("UPDATE jobs SET status = 'CANCELLED', finished_at = ?, updated_at = ? WHERE project_id = ? AND status IN ('QUEUED','WAITING_FOR_GPU','BLOCKED','PAUSED')", now(), now(), project.id);
    });
    audit(user.id, 'project.delete', { orgId: project.org_id, projectId: project.id, target: project.id, ip: clientIp(req) });
    sendJson(res, 200, { status: 'deleted' });
  });

  r.get('/api/projects/:id/members', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'read');
    const explicit = all('SELECT u.id AS user_id, u.email, u.display_name, m.role, m.created_at FROM project_memberships m JOIN users u ON u.id = m.user_id WHERE m.project_id = ?', project.id);
    const viaOrg = all('SELECT u.id AS user_id, u.email, u.display_name, m.role AS org_role FROM org_memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ?', project.org_id);
    sendJson(res, 200, { members: explicit, org_members: viaOrg });
  });

  r.put('/api/projects/:id/members/:uid', async (req, res, ctx, p) => {
    const { project, user, role: myRole } = projectAccess(ctx, p.id, 'admin');
    const b = await readJson(req);
    const role = oneOf(b.role, 'role', PROJECT_ROLES);
    if (rank(role) > rank(myRole) && myRole !== 'superadmin') throw bad('Cannot grant a role higher than your own');
    if (!one('SELECT 1 AS x FROM org_memberships WHERE org_id = ? AND user_id = ?', project.org_id, p.uid)) throw bad('User must be a member of the organization first', 'not_org_member');
    run('INSERT INTO project_memberships (project_id,user_id,role,created_at) VALUES (?,?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET role = excluded.role', project.id, p.uid, role, now());
    audit(user.id, 'project.member_set', { orgId: project.org_id, projectId: project.id, target: p.uid, detail: { role } });
    sendJson(res, 200, { status: 'updated', role });
  });

  r.delete('/api/projects/:id/members/:uid', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'admin');
    const admins = one("SELECT COUNT(*) AS n FROM project_memberships WHERE project_id = ? AND role = 'project_admin'", project.id).n;
    const m = one('SELECT role FROM project_memberships WHERE project_id = ? AND user_id = ?', project.id, p.uid);
    if (!m) throw notFound('Member not found');
    if (m.role === 'project_admin' && admins <= 1) throw conflict('A project needs at least one project admin', 'last_admin');
    run('DELETE FROM project_memberships WHERE project_id = ? AND user_id = ?', project.id, p.uid);
    audit(user.id, 'project.member_removed', { orgId: project.org_id, projectId: project.id, target: p.uid });
    sendJson(res, 200, { status: 'removed' });
  });

  r.get('/api/projects/:id/activity', async (req, res, ctx, p, url) => {
    const { project } = projectAccess(ctx, p.id, 'read');
    const rows = all('SELECT a.id, a.action, a.target, a.detail, a.created_at, u.email AS actor_email FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id WHERE a.project_id = ? ORDER BY a.created_at DESC LIMIT ?',
      project.id, Math.min(500, Number(url.searchParams.get('limit')) || 100));
    sendJson(res, 200, { activity: rows });
  });
}
