import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebius-test-'));
process.env.NEBIUS_DATA_DIR = dir;
process.env.NEBIUS_ENV = 'test';
process.env.NEBIUS_TRAIN_POLL_MS = '20';
process.env.PROVIDER_HEALTH_INTERVAL_SEC = '3600';
if (!process.env.APPROX_REPO_PATH && fs.existsSync('/home/user/umer630/approx-ai/.git')) process.env.APPROX_REPO_PATH = '/home/user/umer630/approx-ai';

const { createServer, shutdown } = await import('../src/server.js');
export const db = await import('../src/db.js');
export const scheduler = await import('../src/scheduler.js');
export const providers = await import('../src/providers/index.js');

export const server = createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
export const BASE = `http://127.0.0.1:${server.address().port}`;
export const DATA_DIR = dir;

export async function req(method, p, { body, token, cookie, csrf, headers = {}, raw } = {}) {
  const h = { ...headers };
  if (body !== undefined && !raw) h['content-type'] = 'application/json';
  if (token) h.authorization = `Bearer ${token}`;
  if (cookie) h.cookie = cookie;
  if (csrf) h['x-csrf-token'] = csrf;
  const res = await fetch(BASE + p, { method, headers: h, body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined, duplex: raw ? 'half' : undefined });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : ct.includes('event-stream') ? await res.text() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data, headers: res.headers };
}

let n = 0;
export async function makeUser({ verify = true, password = 'GoodPassw0rd!', superadmin = false } = {}) {
  db.run("DELETE FROM rate_buckets");
  const email = `user${++n}_${Date.now()}@example.com`;
  const s = await req('POST', '/api/auth/signup', { body: { email, password, display_name: `User ${n}` } });
  if (s.status !== 202) throw new Error('signup failed ' + JSON.stringify(s.data));
  const user = db.one('SELECT * FROM users WHERE email = ?', email);
  if (verify) db.run('UPDATE users SET email_verified = 1 WHERE id = ?', user.id);
  if (superadmin) db.run("UPDATE users SET platform_role = 'superadmin' WHERE id = ?", user.id);
  const l = await req('POST', '/api/auth/login', { body: { email, password, client: 'mobile' } });
  const org = db.one('SELECT org_id FROM org_memberships WHERE user_id = ?', user.id);
  return { email, password, id: user.id, token: l.data.token, orgId: org.org_id };
}

export async function makeProject(u, name = 'Test Project') {
  const r = await req('POST', '/api/projects', { token: u.token, body: { org_id: u.orgId, name } });
  if (r.status !== 201) throw new Error('project create failed ' + JSON.stringify(r.data));
  return r.data.project;
}

export async function upload(u, projectId, name, content, { folderId, overwrite, sha } = {}) {
  const q = new URLSearchParams({ name, ...(folderId ? { folder_id: folderId } : {}), ...(overwrite ? { overwrite: '1' } : {}) });
  return req('PUT', `/api/projects/${projectId}/upload?${q}`, { token: u.token, raw: true, body: Buffer.isBuffer(content) ? content : Buffer.from(content), headers: { 'content-type': 'application/octet-stream', ...(sha ? { 'x-expected-sha256': sha } : {}) } });
}

export const dockerOk = (await import('node:child_process')).execSync('docker version --format {{.Server.Version}} 2>/dev/null || true').toString().trim() !== '';

export function parseSse(text) {
  return text.split('\n\n').filter(Boolean).map((b) => ({ event: /event: (.*)/.exec(b)?.[1], data: JSON.parse(/data: (.*)/.exec(b)?.[1] || 'null') }));
}

export function close() { shutdown(server); }
