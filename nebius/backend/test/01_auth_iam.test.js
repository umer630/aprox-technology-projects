import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { req, makeUser, makeProject, db, close } from './helpers.js';

after(close);

test('signup → email verification → login (web cookie + CSRF) → logout', async () => {
  const email = `web_${Date.now()}@example.com`;
  assert.equal((await req('POST', '/api/auth/signup', { body: { email, password: 'short' } })).status, 400);
  assert.equal((await req('POST', '/api/auth/signup', { body: { email, password: 'GoodPassw0rd!' } })).status, 202);
  // duplicate signup does not reveal existence
  const dup = await req('POST', '/api/auth/signup', { body: { email, password: 'GoodPassw0rd!' } });
  assert.equal(dup.status, 202);
  const mail = db.one("SELECT * FROM mail_outbox WHERE recipient = ? AND subject LIKE 'Verify%'", email);
  const token = /Verification code: (\S+)/.exec(mail.body)[1];
  const login = await req('POST', '/api/auth/login', { body: { email, password: 'GoodPassw0rd!' } });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const csrf = login.data.csrf_token;
  // unverified user cannot create projects
  const org = db.one('SELECT org_id FROM org_memberships m JOIN users u ON u.id = m.user_id WHERE u.email = ?', email).org_id;
  assert.equal((await req('POST', '/api/projects', { cookie, csrf, body: { org_id: org, name: 'x project' } })).data.error.code, 'email_not_verified');
  assert.equal((await req('POST', '/api/auth/verify-email', { body: { token } })).status, 200);
  assert.equal((await req('POST', '/api/auth/verify-email', { body: { token } })).status, 400, 'token single-use');
  // CSRF enforced for cookie sessions
  assert.equal((await req('POST', '/api/projects', { cookie, body: { org_id: org, name: 'No CSRF' } })).data.error.code, 'csrf_failed');
  assert.equal((await req('POST', '/api/projects', { cookie, csrf, body: { org_id: org, name: 'With CSRF' } })).status, 201);
  assert.equal((await req('POST', '/api/auth/logout', { cookie, csrf })).status, 200);
  assert.equal((await req('GET', '/api/auth/me', { cookie })).status, 401);
});

test('lockout after repeated failures; password reset revokes sessions', async () => {
  const u = await makeUser();
  for (let i = 0; i < 8; i++) await req('POST', '/api/auth/login', { body: { email: u.email, password: 'wrong-password-1' } });
  assert.equal((await req('POST', '/api/auth/login', { body: { email: u.email, password: u.password } })).status, 423);
  db.run('UPDATE users SET locked_until = NULL WHERE id = ?', u.id);
  db.run('DELETE FROM rate_buckets');
  await req('POST', '/api/auth/forgot-password', { body: { email: u.email } });
  const mail = db.one("SELECT * FROM mail_outbox WHERE recipient = ? AND subject LIKE 'Reset%' ORDER BY created_at DESC", u.email);
  const token = /Reset code: (\S+)/.exec(mail.body)[1];
  assert.equal((await req('POST', '/api/auth/reset-password', { body: { token, password: 'NewPassw0rd!!' } })).status, 200);
  assert.equal((await req('GET', '/api/auth/me', { token: u.token })).status, 401, 'old session revoked');
  assert.equal((await req('POST', '/api/auth/login', { body: { email: u.email, password: 'NewPassw0rd!!', client: 'mobile' } })).status, 200);
});

test('organizations: invite, accept (email-bound), roles, last-admin protection, removal', async () => {
  const admin = await makeUser();
  const dev = await makeUser();
  const other = await makeUser();
  const inv = await req('POST', `/api/orgs/${admin.orgId}/invitations`, { token: admin.token, body: { email: dev.email, role: 'viewer' } });
  assert.equal(inv.status, 201);
  const token = /Invitation code: (\S+)/.exec(db.one('SELECT body FROM mail_outbox WHERE recipient = ? ORDER BY created_at DESC', dev.email).body)[1];
  assert.equal((await req('POST', '/api/invitations/accept', { token: other.token, body: { token } })).data.error.code, 'invitation_email_mismatch');
  assert.equal((await req('POST', '/api/invitations/accept', { token: dev.token, body: { token } })).status, 200);
  // viewer can read org but not invite
  assert.equal((await req('GET', `/api/orgs/${admin.orgId}`, { token: dev.token })).status, 200);
  assert.equal((await req('POST', `/api/orgs/${admin.orgId}/invitations`, { token: dev.token, body: { email: 'z@example.com' } })).status, 403);
  // outsider sees 404 (no existence leak)
  assert.equal((await req('GET', `/api/orgs/${admin.orgId}`, { token: other.token })).status, 404);
  assert.equal((await req('PATCH', `/api/orgs/${admin.orgId}/members/${admin.id}`, { token: admin.token, body: { role: 'viewer' } })).data.error.code, 'last_admin');
  assert.equal((await req('PATCH', `/api/orgs/${admin.orgId}/members/${dev.id}`, { token: admin.token, body: { role: 'developer' } })).status, 200);
  assert.equal((await req('DELETE', `/api/orgs/${admin.orgId}/members/${dev.id}`, { token: admin.token })).status, 200);
  assert.equal((await req('GET', `/api/orgs/${admin.orgId}`, { token: dev.token })).status, 404);
});

test('projects: create, edit, archive (read-only), delete requires typed confirmation, activity history', async () => {
  const u = await makeUser();
  const p = await makeProject(u, 'Vision Lab');
  assert.match(p.project_code, /^vision-lab-/);
  assert.equal((await req('PATCH', `/api/projects/${p.id}`, { token: u.token, body: { description: 'CV experiments' } })).data.project.description, 'CV experiments');
  assert.equal((await req('POST', `/api/projects/${p.id}/archive`, { token: u.token })).status, 200);
  assert.equal((await req('POST', `/api/projects/${p.id}/folders`, { token: u.token, body: { name: 'data' } })).data.error.code, 'project_archived');
  assert.equal((await req('POST', `/api/projects/${p.id}/unarchive`, { token: u.token })).status, 200);
  assert.equal((await req('POST', `/api/projects/${p.id}/delete`, { token: u.token, body: { confirm: 'wrong' } })).data.error.code, 'confirmation_required');
  const act = await req('GET', `/api/projects/${p.id}/activity`, { token: u.token });
  assert.ok(act.data.activity.some((a) => a.action === 'project.archive'));
  assert.equal((await req('POST', `/api/projects/${p.id}/delete`, { token: u.token, body: { confirm: p.project_code } })).status, 200);
  assert.equal((await req('GET', `/api/projects/${p.id}`, { token: u.token })).status, 404);
});

test('project isolation and RBAC are enforced on the server', async () => {
  const owner = await makeUser();
  const stranger = await makeUser();
  const p = await makeProject(owner, 'Private Project');
  for (const path of [`/api/projects/${p.id}`, `/api/projects/${p.id}/browse`, `/api/projects/${p.id}/jobs`, `/api/projects/${p.id}/instances`, `/api/projects/${p.id}/notebooks`, `/api/projects/${p.id}/models`]) {
    assert.equal((await req('GET', path, { token: stranger.token })).status, 404, path);
  }
  const list = await req('GET', '/api/projects', { token: stranger.token });
  assert.ok(!list.data.projects.some((x) => x.id === p.id));
  // add stranger to the org as viewer → read ok, write forbidden
  db.run("INSERT INTO org_memberships (org_id,user_id,role,created_at) VALUES (?,?,'viewer',?)", owner.orgId, stranger.id, Date.now());
  assert.equal((await req('GET', `/api/projects/${p.id}`, { token: stranger.token })).status, 200);
  assert.equal((await req('POST', `/api/projects/${p.id}/folders`, { token: stranger.token, body: { name: 'x' } })).data.error.code, 'insufficient_role');
  assert.equal((await req('POST', `/api/projects/${p.id}/apikeys`, { token: stranger.token, body: { name: 'k', scopes: ['files:read'] } })).status, 403);
  // project-level grant raises the role
  assert.equal((await req('PUT', `/api/projects/${p.id}/members/${stranger.id}`, { token: owner.token, body: { role: 'developer' } })).status, 200);
  assert.equal((await req('POST', `/api/projects/${p.id}/folders`, { token: stranger.token, body: { name: 'x' } })).status, 201);
});

test('API keys: hashed, project-bound, scoped, revocable; admin endpoints need superadmin', async () => {
  const u = await makeUser();
  const p = await makeProject(u, 'Api Project');
  const other = await makeProject(u, 'Other Project');
  const k = await req('POST', `/api/projects/${p.id}/apikeys`, { token: u.token, body: { name: 'ci', scopes: ['files:read'] } });
  assert.equal(k.status, 201);
  assert.match(k.data.key, /^nbk_/);
  assert.ok(!db.one('SELECT * FROM api_keys WHERE key_hash = ?', k.data.key), 'raw key never stored');
  assert.equal((await req('GET', `/api/projects/${p.id}/browse`, { token: k.data.key })).status, 200);
  assert.equal((await req('POST', `/api/projects/${p.id}/folders`, { token: k.data.key, body: { name: 'x' } })).data.error.code, 'insufficient_scope');
  assert.equal((await req('GET', `/api/projects/${other.id}/browse`, { token: k.data.key })).status, 404, 'key bound to one project');
  assert.equal((await req('GET', '/api/auth/me', { token: k.data.key })).status, 403);
  assert.equal((await req('GET', '/api/admin/users', { token: u.token })).status, 403);
  assert.equal((await req('DELETE', `/api/projects/${p.id}/apikeys/${k.data.api_key.id}`, { token: u.token })).status, 200);
  assert.equal((await req('GET', `/api/projects/${p.id}/browse`, { token: k.data.key })).status, 401);
  // inference never fabricates: no verified model → 503
  const k2 = await req('POST', `/api/projects/${p.id}/apikeys`, { token: u.token, body: { name: 'inf', scopes: ['inference'], rate_limit_per_min: 2 } });
  const inf = await req('POST', `/api/v1/projects/${p.id}/inference`, { token: k2.data.key, body: { messages: [{ role: 'user', content: 'hi' }] } });
  assert.equal(inf.status, 503);
  assert.equal(inf.data.error.code, 'no_verified_model');
  await req('POST', `/api/v1/projects/${p.id}/inference`, { token: k2.data.key, body: { messages: [] } });
  assert.equal((await req('POST', `/api/v1/projects/${p.id}/inference`, { token: k2.data.key, body: { messages: [] } })).status, 429, 'per-key rate limit');
});

test('security headers present on API responses', async () => {
  const r = await req('GET', '/api/version');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(r.data.name_status, /provisional/);
});
