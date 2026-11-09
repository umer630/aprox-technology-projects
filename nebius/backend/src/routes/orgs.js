import { one, all, run, now, tx, audit, notify, newId } from '../db.js';
import { readJson, sendJson, bad, conflict, notFound, forbidden, str, oneOf, isEmail, clientIp } from '../http.js';
import { requireUser, requireVerified, randomToken, sha256, rateLimit } from '../security.js';
import { orgAccess, ORG_ROLES } from '../iam.js';
import { sendMail, appLink } from '../mail.js';

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'org';
}

export function createOrganization(userId, name, description) {
  const id = newId('org_');
  const t = now();
  const slug = `${slugify(name)}-${id.slice(4, 10)}`;
  run('INSERT INTO organizations (id,name,slug,description,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', id, name, slug, description || '', userId, t, t);
  run("INSERT INTO org_memberships (org_id,user_id,role,created_at) VALUES (?,?,'org_admin',?)", id, userId, t);
  audit(userId, 'org.create', { orgId: id, target: id });
  return id;
}

const adminCount = (orgId) => one("SELECT COUNT(*) AS n FROM org_memberships WHERE org_id = ? AND role = 'org_admin'", orgId).n;

export function registerOrgRoutes(r) {
  r.get('/api/orgs', async (req, res, ctx) => {
    const u = requireUser(ctx);
    const rows = u.platform_role === 'superadmin'
      ? all("SELECT o.*, COALESCE(m.role,'superadmin') AS my_role FROM organizations o LEFT JOIN org_memberships m ON m.org_id = o.id AND m.user_id = ? WHERE o.status = 'active' ORDER BY o.created_at", u.id)
      : all("SELECT o.*, m.role AS my_role FROM organizations o JOIN org_memberships m ON m.org_id = o.id WHERE m.user_id = ? AND o.status = 'active' ORDER BY o.created_at", u.id);
    sendJson(res, 200, { organizations: rows });
  });

  r.post('/api/orgs', async (req, res, ctx) => {
    const u = requireUser(ctx);
    requireVerified(u);
    rateLimit(`org-create:${u.id}`, 10, 3600_000);
    const b = await readJson(req);
    const name = str(b.name, 'name', { min: 2, max: 80 });
    const id = tx(() => createOrganization(u.id, name, str(b.description, 'description', { max: 500, required: false })));
    sendJson(res, 201, { organization: one('SELECT * FROM organizations WHERE id = ?', id) });
  });

  r.get('/api/orgs/:id', async (req, res, ctx, p) => {
    const { org, role } = orgAccess(ctx, p.id);
    const counts = one("SELECT (SELECT COUNT(*) FROM projects WHERE org_id = ? AND status != 'deleted') AS projects, (SELECT COUNT(*) FROM org_memberships WHERE org_id = ?) AS members", org.id, org.id);
    sendJson(res, 200, { organization: { ...org, my_role: role, ...counts } });
  });

  r.patch('/api/orgs/:id', async (req, res, ctx, p) => {
    const { org, user } = orgAccess(ctx, p.id, 'org_admin');
    const b = await readJson(req);
    const name = b.name !== undefined ? str(b.name, 'name', { min: 2, max: 80 }) : org.name;
    const description = b.description !== undefined ? str(b.description, 'description', { max: 500 }) : org.description;
    run('UPDATE organizations SET name = ?, description = ?, updated_at = ? WHERE id = ?', name, description, now(), org.id);
    audit(user.id, 'org.update', { orgId: org.id, target: org.id, ip: clientIp(req) });
    sendJson(res, 200, { organization: one('SELECT * FROM organizations WHERE id = ?', org.id) });
  });

  r.get('/api/orgs/:id/members', async (req, res, ctx, p) => {
    const { org } = orgAccess(ctx, p.id);
    const members = all('SELECT u.id AS user_id, u.email, u.display_name, m.role, m.created_at FROM org_memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.created_at', org.id);
    const invitations = all('SELECT id, email, role, expires_at, created_at FROM invitations WHERE org_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?', org.id, now());
    sendJson(res, 200, { members, invitations });
  });

  r.post('/api/orgs/:id/invitations', async (req, res, ctx, p) => {
    const { org, user } = orgAccess(ctx, p.id, 'org_admin');
    rateLimit(`invite:${user.id}`, 50, 3600_000);
    const b = await readJson(req);
    const email = str(b.email, 'email', { max: 254 }).toLowerCase();
    if (!isEmail(email)) throw bad('A valid email address is required');
    const role = oneOf(b.role, 'role', ORG_ROLES, 'developer');
    const existing = one('SELECT u.id FROM users u JOIN org_memberships m ON m.user_id = u.id WHERE m.org_id = ? AND u.email = ?', org.id, email);
    if (existing) throw conflict('User is already a member', 'already_member');
    const token = randomToken(32);
    const id = newId('inv_');
    run('UPDATE invitations SET revoked_at = ? WHERE org_id = ? AND email = ? AND accepted_at IS NULL AND revoked_at IS NULL', now(), org.id, email);
    run('INSERT INTO invitations (id,org_id,email,role,token_hash,invited_by,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?)',
      id, org.id, email, role, sha256(token), user.id, now() + 7 * 86400_000, now());
    await sendMail(email, `You're invited to ${org.name} on NEBIUS`, `${user.display_name || user.email} invited you to join "${org.name}" as ${role}.\n\nAccept: ${appLink('/#/invite?token=' + token)}\n\nInvitation code: ${token}\n\nExpires in 7 days.`);
    const invitee = one('SELECT id FROM users WHERE email = ?', email);
    if (invitee) notify(invitee.id, 'invitation', `Invitation to ${org.name}`, `Role: ${role}. Open the link in your email to accept.`, { orgId: org.id });
    audit(user.id, 'org.invite', { orgId: org.id, target: email, ip: clientIp(req), detail: { role } });
    sendJson(res, 201, { invitation: { id, email, role } });
  });

  r.delete('/api/orgs/:id/invitations/:inv', async (req, res, ctx, p) => {
    const { org, user } = orgAccess(ctx, p.id, 'org_admin');
    const r2 = run('UPDATE invitations SET revoked_at = ? WHERE id = ? AND org_id = ? AND accepted_at IS NULL', now(), p.inv, org.id);
    if (!r2.changes) throw notFound('Invitation not found');
    audit(user.id, 'org.invite_revoked', { orgId: org.id, target: p.inv });
    sendJson(res, 200, { status: 'revoked' });
  });

  r.post('/api/invitations/accept', async (req, res, ctx) => {
    const u = requireUser(ctx);
    requireVerified(u);
    const b = await readJson(req);
    const token = str(b.token, 'token', { min: 20, max: 100 });
    const inv = one('SELECT * FROM invitations WHERE token_hash = ?', sha256(token));
    if (!inv || inv.accepted_at || inv.revoked_at || inv.expires_at < now()) throw bad('Invalid or expired invitation', 'invalid_token');
    if (inv.email.toLowerCase() !== u.email.toLowerCase()) throw forbidden('This invitation was sent to a different email address', 'invitation_email_mismatch');
    tx(() => {
      run('INSERT INTO org_memberships (org_id,user_id,role,created_at) VALUES (?,?,?,?) ON CONFLICT(org_id,user_id) DO NOTHING', inv.org_id, u.id, inv.role, now());
      run('UPDATE invitations SET accepted_at = ? WHERE id = ?', now(), inv.id);
    });
    audit(u.id, 'org.join', { orgId: inv.org_id, target: u.id, detail: { role: inv.role } });
    sendJson(res, 200, { organization: one('SELECT * FROM organizations WHERE id = ?', inv.org_id), role: inv.role });
  });

  r.patch('/api/orgs/:id/members/:uid', async (req, res, ctx, p) => {
    const { org, user } = orgAccess(ctx, p.id, 'org_admin');
    const b = await readJson(req);
    const role = oneOf(b.role, 'role', ORG_ROLES);
    const m = one('SELECT * FROM org_memberships WHERE org_id = ? AND user_id = ?', org.id, p.uid);
    if (!m) throw notFound('Member not found');
    if (m.role === 'org_admin' && role !== 'org_admin' && adminCount(org.id) <= 1) throw conflict('An organization needs at least one admin', 'last_admin');
    run('UPDATE org_memberships SET role = ? WHERE org_id = ? AND user_id = ?', role, org.id, p.uid);
    audit(user.id, 'org.member_role', { orgId: org.id, target: p.uid, detail: { from: m.role, to: role } });
    sendJson(res, 200, { status: 'updated', role });
  });

  r.delete('/api/orgs/:id/members/:uid', async (req, res, ctx, p) => {
    const { org, user } = orgAccess(ctx, p.id, p.uid === ctx.auth?.user?.id ? 'viewer' : 'org_admin'); // members may leave
    const m = one('SELECT * FROM org_memberships WHERE org_id = ? AND user_id = ?', org.id, p.uid);
    if (!m) throw notFound('Member not found');
    if (m.role === 'org_admin' && adminCount(org.id) <= 1) throw conflict('An organization needs at least one admin', 'last_admin');
    tx(() => {
      run('DELETE FROM org_memberships WHERE org_id = ? AND user_id = ?', org.id, p.uid);
      run('DELETE FROM project_memberships WHERE user_id = ? AND project_id IN (SELECT id FROM projects WHERE org_id = ?)', p.uid, org.id);
      run('UPDATE api_keys SET revoked_at = ? WHERE user_id = ? AND org_id = ? AND revoked_at IS NULL', now(), p.uid, org.id);
    });
    audit(user.id, 'org.member_removed', { orgId: org.id, target: p.uid });
    sendJson(res, 200, { status: 'removed' });
  });

  r.get('/api/orgs/:id/audit', async (req, res, ctx, p, url) => {
    const { org } = orgAccess(ctx, p.id, 'org_admin');
    const rows = all('SELECT a.*, u.email AS actor_email FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id WHERE a.org_id = ? ORDER BY a.created_at DESC LIMIT ?', org.id, Math.min(500, Number(url.searchParams.get('limit')) || 100));
    sendJson(res, 200, { audit: rows });
  });
}
