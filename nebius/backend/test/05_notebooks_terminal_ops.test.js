import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { req, makeUser, makeProject, upload, db, close, dockerOk, parseSse } from './helpers.js';
import { docker } from '../src/docker.js';

const jupyterImage = dockerOk && (await docker(['image', 'inspect', 'nebius-jupyter:local'])).code === 0;
const cleanup = [];
after(async () => { for (const c of cleanup) await docker(['rm', '-f', c]); close(); });

test('notebooks: create, real kernel execution in an isolated per-project container, outputs saved as versions', { skip: !jupyterImage && 'nebius-jupyter image not built' }, async () => {
  const u = await makeUser();
  const p = await makeProject(u, 'Notebook Project');
  cleanup.push(`nebius-nb-${p.id}`);
  const be = await req('GET', '/api/notebooks/backend', { token: u.token });
  assert.equal(be.data.isolated, true);
  const nb = await req('POST', `/api/projects/${p.id}/notebooks`, { token: u.token, body: { name: 'explore' } });
  assert.equal(nb.status, 201);
  const fid = nb.data.notebook.id;
  const doc = (await req('GET', `/api/projects/${p.id}/notebooks/${fid}`, { token: u.token })).data.notebook;
  doc.cells = [
    { cell_type: 'code', source: 'x = 6 * 7\nprint("answer", x)\nx', metadata: {}, outputs: [], execution_count: null },
    { cell_type: 'code', source: 'import urllib.request\nurllib.request.urlopen("https://pypi.org", timeout=3)', metadata: {}, outputs: [], execution_count: null },
    { cell_type: 'code', source: 'import os; print(os.getuid())', metadata: {}, outputs: [], execution_count: null },
  ];
  assert.equal((await req('PUT', `/api/projects/${p.id}/notebooks/${fid}`, { token: u.token, body: { notebook: doc } })).status, 200);
  assert.equal((await req('POST', `/api/projects/${p.id}/notebooks/${fid}/execute`, { token: u.token, body: { cell_index: 0 } })).data.error.code, 'no_session');
  const s = await req('POST', `/api/projects/${p.id}/notebooks/${fid}/session`, { token: u.token });
  assert.equal(s.status, 201, JSON.stringify(s.data));
  const e0 = await req('POST', `/api/projects/${p.id}/notebooks/${fid}/execute`, { token: u.token, body: { cell_index: 0 } });
  assert.equal(e0.data.status, 'ok');
  assert.equal(e0.data.outputs[0].text, 'answer 42\n');
  assert.equal(e0.data.outputs[1].data['text/plain'], '42');
  const e1 = await req('POST', `/api/projects/${p.id}/notebooks/${fid}/execute`, { token: u.token, body: { cell_index: 1, timeout_s: 30 } });
  assert.equal(e1.data.status, 'error', 'no Internet egress from notebook containers');
  const e2 = await req('POST', `/api/projects/${p.id}/notebooks/${fid}/execute`, { token: u.token, body: { cell_index: 2 } });
  assert.equal(e2.data.outputs[0].text.trim(), '1000', 'kernel runs as non-root');
  // dataset mounting
  const f = await upload(u, p.id, 'tiny.csv', 'a,b\n1,2\n');
  const m = await req('POST', `/api/projects/${p.id}/notebooks/mount`, { token: u.token, body: { file_id: f.data.file.id } });
  assert.equal(m.data.path, 'data/tiny.csv');
  const saved = (await req('GET', `/api/projects/${p.id}/notebooks/${fid}`, { token: u.token })).data;
  assert.equal(saved.notebook.cells[0].execution_count, 1);
  assert.ok(saved.history.length >= 4, 'each save/execution is a version');
  // other users cannot use this kernel
  const other = await makeUser();
  assert.equal((await req('POST', `/api/projects/${p.id}/notebooks/${fid}/session`, { token: other.token })).status, 404);
  assert.equal((await req('DELETE', `/api/projects/${p.id}/notebooks/${fid}/session`, { token: u.token })).status, 200);
  assert.equal((await req('PUT', `/api/projects/${p.id}/notebooks/${fid}`, { token: u.token, body: { notebook: { cells: 'nope' } } })).data.error.code, 'invalid_notebook');
});

test('terminal: isolated sandbox, audited commands, no network, non-root, reconnect history, close', { skip: !dockerOk && 'docker not available' }, async () => {
  const u = await makeUser();
  const p = await makeProject(u, 'Terminal Project');
  const s = await req('POST', `/api/projects/${p.id}/terminal/sessions`, { token: u.token });
  assert.equal(s.status, 201, JSON.stringify(s.data));
  const sid = s.data.session.id;
  cleanup.push(`nebius-term-${sid}`);
  const exec = async (command) => parseSse((await req('POST', `/api/projects/${p.id}/terminal/sessions/${sid}/exec`, { token: u.token, body: { command } })).data);
  const ev = await exec('id -u; echo hi > /workspace/a.txt; cat /workspace/a.txt');
  assert.equal(ev.filter((e) => e.event === 'out').map((e) => e.data.text).join(''), '1000\nhi\n');
  assert.equal(ev.at(-1).data.code, 0);
  const net = await exec('wget -q -T 3 -O- http://example.com; echo rc=$?');
  assert.match(net.map((e) => e.data?.text || '').join(''), /rc=[1-9]/);
  const ro = await exec('touch /etc/x 2>&1; echo rc=$?');
  assert.match(ro.map((e) => e.data?.text || '').join(''), /rc=1/, 'read-only root filesystem');
  const h = await req('GET', `/api/projects/${p.id}/terminal/sessions/${sid}`, { token: u.token });
  assert.equal(h.data.history.length, 3);
  assert.ok(db.one("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'terminal.exec' AND target = ?", sid).n === 3);
  const other = await makeUser();
  assert.equal((await req('GET', `/api/projects/${p.id}/terminal/sessions/${sid}`, { token: other.token })).status, 404);
  assert.equal((await req('DELETE', `/api/projects/${p.id}/terminal/sessions/${sid}`, { token: u.token })).status, 200);
  assert.equal((await req('POST', `/api/projects/${p.id}/terminal/sessions/${sid}/exec`, { token: u.token, body: { command: 'ls' } })).data.error.code, 'session_closed');
});

test('dashboard, monitoring and logs report only real measurements', async () => {
  const u = await makeUser();
  const p = await makeProject(u, 'Ops Project');
  await upload(u, p.id, 'a.txt', 'abc');
  const d = await req('GET', `/api/dashboard?org_id=${u.orgId}`, { token: u.token });
  assert.equal(d.data.projects, 1);
  assert.equal(d.data.storage_bytes, 3);
  assert.equal(d.data.gpu_providers.status, 'NO FREE GPU AVAILABLE');
  assert.equal(typeof d.data.host.cpu.usage_pct, 'number');
  assert.equal(d.data.host.gpu.available, false);
  const mon = await req('GET', `/api/projects/${p.id}/monitoring`, { token: u.token });
  assert.equal(mon.data.gpu.available, false);
  const logs = await req('GET', `/api/projects/${p.id}/logs?type=audit`, { token: u.token });
  assert.ok(logs.data.logs.some((l) => l.action === 'file.upload'));
  const health = await req('GET', '/api/monitoring/health', { token: u.token });
  assert.equal(health.data.database.ok, true);
  assert.equal(health.data.storage.ok, true);
});

test('global search, notifications, admin backup', async () => {
  const admin = await makeUser({ superadmin: true });
  const p = await makeProject(admin, 'Searchable Galaxy');
  await upload(admin, p.id, 'galaxy-notes.md', '# notes');
  const s = await req('GET', '/api/search?q=galaxy', { token: admin.token });
  assert.ok(s.data.results.some((r) => r.type === 'project'));
  assert.ok(s.data.results.some((r) => r.type === 'file'));
  const other = await makeUser();
  assert.equal((await req('GET', '/api/search?q=galaxy', { token: other.token })).data.results.length, 0, 'search respects isolation');
  db.notify(admin.id, 'test', 'Hello', 'body');
  const n = await req('GET', '/api/notifications', { token: admin.token });
  assert.ok(n.data.unread >= 1);
  await req('POST', '/api/notifications/read-all', { token: admin.token });
  assert.equal((await req('GET', '/api/notifications', { token: admin.token })).data.unread, 0);
  const b = await req('POST', '/api/admin/backup', { token: admin.token });
  assert.equal(b.status, 201);
  assert.ok(fs.existsSync(`${b.data.path}/MANIFEST.json`));
  assert.ok(b.data.objects >= 1);
  assert.equal((await req('POST', '/api/admin/backup', { token: other.token })).status, 403);
});
