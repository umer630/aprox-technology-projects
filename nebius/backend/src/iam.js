// Authorization: the single place that decides whether a caller may touch an organization or project.
// Every route that reads/writes a tenant resource calls projectAccess()/orgAccess() — never frontend-only checks.
// No-access returns 404 (not 403) so resource existence is not leaked across tenants.
import { one } from './db.js';
import { notFound, forbidden, unauthorized } from './http.js';
import { requireVerified } from './security.js';

export const ORG_ROLES = ['org_admin', 'developer', 'viewer'];
export const PROJECT_ROLES = ['project_admin', 'developer', 'viewer'];
const RANK = { viewer: 1, developer: 2, project_admin: 3, org_admin: 4, superadmin: 5 };
export const rank = (r) => RANK[r] || 0;

// Permission → minimum project role. Documented in docs/SECURITY.md (RBAC matrix).
export const PERMS = {
  read: 'viewer',
  write: 'developer',        // files, notebooks, jobs, instances, terminal
  admin: 'project_admin',    // members, settings, archive/delete, API keys
};

export function orgRole(userId, orgId) {
  return one('SELECT role FROM org_memberships WHERE org_id = ? AND user_id = ?', orgId, userId)?.role || null;
}

export function effectiveProjectRole(user, project) {
  if (user.platform_role === 'superadmin') return 'superadmin';
  const o = orgRole(user.id, project.org_id);
  if (o === 'org_admin') return 'org_admin';
  const p = one('SELECT role FROM project_memberships WHERE project_id = ? AND user_id = ?', project.id, user.id)?.role || null;
  // Org developers/viewers see every org project at their org role; explicit project role can raise it.
  const candidates = [p, o].filter(Boolean);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => rank(b) - rank(a))[0];
}

/**
 * @param ctx request context (ctx.auth)
 * @param projectId project id
 * @param perm 'read' | 'write' | 'admin'
 * @param opts.scope API-key scope required when called with an API key
 * @param opts.allowArchived allow writes on archived projects (only admin ops like unarchive)
 */
export function projectAccess(ctx, projectId, perm = 'read', { scope = null, allowArchived = false } = {}) {
  if (!ctx.auth) throw unauthorized();
  const user = ctx.auth.user;
  const project = one("SELECT * FROM projects WHERE id = ? AND status != 'deleted'", String(projectId || ''));
  if (!project) throw notFound('Project not found');
  let role;
  if (ctx.auth.kind === 'api_key') {
    const k = ctx.auth.apiKey;
    if (k.project_id !== project.id) throw notFound('Project not found');
    if (!scope || !k.scopes.includes(scope)) throw forbidden(`API key lacks scope '${scope || 'n/a'}'`, 'insufficient_scope');
    if (perm === 'admin') throw forbidden('API keys cannot perform admin operations', 'api_key_not_allowed');
    const owner = effectiveProjectRole(user, project); // key is capped by its owner's current role
    if (!owner) throw notFound('Project not found');
    role = rank(owner) >= rank('developer') ? 'developer' : 'viewer';
  } else {
    role = effectiveProjectRole(user, project);
    if (!role) throw notFound('Project not found');
  }
  if (rank(role) < rank(PERMS[perm])) throw forbidden(`Requires ${PERMS[perm]} role on this project`, 'insufficient_role');
  if (perm !== 'read') {
    requireVerified(user);
    if (project.status === 'archived' && !allowArchived) throw forbidden('Project is archived (read-only)', 'project_archived');
  }
  return { project, role, user };
}

export function orgAccess(ctx, orgId, minRole = 'viewer') {
  if (!ctx.auth) throw unauthorized();
  if (ctx.auth.kind === 'api_key') throw forbidden('API keys cannot access organization endpoints', 'api_key_not_allowed');
  const user = ctx.auth.user;
  const org = one("SELECT * FROM organizations WHERE id = ? AND status = 'active'", String(orgId || ''));
  if (!org) throw notFound('Organization not found');
  const role = user.platform_role === 'superadmin' ? 'superadmin' : orgRole(user.id, org.id);
  if (!role) throw notFound('Organization not found');
  if (rank(role) < rank(minRole)) throw forbidden(`Requires ${minRole} role in this organization`, 'insufficient_role');
  if (minRole !== 'viewer') requireVerified(user);
  return { org, role, user };
}
