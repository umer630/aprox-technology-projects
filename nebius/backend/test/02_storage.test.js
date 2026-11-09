import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { req, makeUser, makeProject, upload, db, close, DATA_DIR } from './helpers.js';

after(close);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

test('folders (nested), upload with integrity, signed download, preview, versions', async () => {
  const u = await makeUser();
  const p = await makeProject(u, 'Storage One');
  const ds = await req('POST', `/api/projects/${p.id}/folders`, { token: u.token, body: { name: 'datasets' } });
  const sub = await req('POST', `/api/projects/${p.id}/folders`, { token: u.token, body: { name: 'v1', parent_id: ds.data.folder.id } });
  assert.equal(sub.status, 201);
  assert.equal((await req('POST', `/api/projects/${p.id}/folders`, { token: u.token, body: { name: '../evil' } })).data.error.code, 'invalid_name');
  const content = '{"messages":[{"role":"user","content":"hi"}]}\n';
  assert.equal((await upload(u, p.id, 'train.jsonl', content, { folderId: sub.data.folder.id, sha: '0'.repeat(64) })).data.error.code, 'checksum_mismatch');
  const up = await upload(u, p.id, 'train.jsonl', content, { folderId: sub.data.folder.id, sha: sha(content) });
  assert.equal(up.status, 201);
  assert.equal(up.data.file.sha256, sha(content));
  assert.equal(up.data.file.kind, 'dataset');
  const browse = await req('GET', `/api/projects/${p.id}/browse?folder_id=${sub.data.folder.id}`, { token: u.token });
  assert.deepEqual(browse.data.breadcrumbs.map((b) => b.name), ['datasets', 'v1']);
  assert.equal(browse.data.files.length, 1);
  // signed URL download
  const url = await req('POST', `/api/projects/${p.id}/files/${up.data.file.id}/download-url`, { token: u.token });
  const dl = await req('GET', url.data.url);
  assert.equal(dl.status, 200);
  assert.equal(dl.data.toString(), content);
  assert.equal(dl.headers.get('x-checksum-sha256'), sha(content));
  assert.match(dl.headers.get('content-disposition'), /^attachment/);
  const tampered = url.data.url.slice(0, -3) + (url.data.url.endsWith('AAA') ? 'BBB' : 'AAA');
  assert.equal((await req('GET', tampered)).status, 403);
  // preview
  const pv = await req('GET', `/api/projects/${p.id}/files/${up.data.file.id}/preview`, { token: u.token });
  assert.equal(pv.data.kind, 'text');
  assert.equal(pv.data.content, content);
  // new version (overwrite) and version restore
  assert.equal((await upload(u, p.id, 'train.jsonl', 'v2\n', { folderId: sub.data.folder.id })).data.error.code, 'name_taken');
  const v2 = await upload(u, p.id, 'train.jsonl', 'v2\n', { folderId: sub.data.folder.id, overwrite: true });
  assert.equal(v2.data.file.version, 2);
  const restored = await req('POST', `/api/projects/${p.id}/files/${up.data.file.id}/versions/1/restore`, { token: u.token });
  assert.equal(restored.data.file.version, 3);
  assert.equal(restored.data.file.sha256, sha(content));
  const meta = await req('GET', `/api/projects/${p.id}/files/${up.data.file.id}`, { token: u.token });
  assert.equal(meta.data.versions.length, 3);
});

test('rename, move, copy, trash, restore, permanent delete, search and sort', async () => {
  const u = await makeUser();
  const p = await makeProject(u, 'Storage Two');
  const a = await req('POST', `/api/projects/${p.id}/folders`, { token: u.token, body: { name: 'a' } });
  const b = await req('POST', `/api/projects/${p.id}/folders`, { token: u.token, body: { name: 'b', parent_id: a.data.folder.id } });
  assert.equal((await req('PATCH', `/api/projects/${p.id}/folders/${a.data.folder.id}`, { token: u.token, body: { parent_id: b.data.folder.id } })).data.error.code, 'invalid_move', 'no cycles');
  const f = (await upload(u, p.id, 'notes.txt', 'hello world')).data.file;
  await upload(u, p.id, 'big.bin', Buffer.alloc(5000, 1));
  assert.equal((await req('PATCH', `/api/projects/${p.id}/files/${f.id}`, { token: u.token, body: { name: 'readme.md' } })).data.file.kind, 'document');
  assert.equal((await req('PATCH', `/api/projects/${p.id}/files/${f.id}`, { token: u.token, body: { folder_id: b.data.folder.id } })).data.file.folder_id, b.data.folder.id);
  const cp = await req('POST', `/api/projects/${p.id}/files/${f.id}/copy`, { token: u.token, body: {} });
  assert.equal(cp.data.file.name, 'readme (copy).md');
  assert.equal(cp.data.file.sha256, sha('hello world'));
  const sorted = await req('GET', `/api/projects/${p.id}/files?sort=size&order=desc`, { token: u.token });
  assert.equal(sorted.data.files[0].name, 'big.bin');
  const search = await req('GET', `/api/projects/${p.id}/files?q=readme`, { token: u.token });
  assert.equal(search.data.files.length, 2);
  assert.equal(search.data.files.find((x) => x.id === f.id).path, 'a/b');
  // trash a folder tree, restore it
  assert.equal((await req('DELETE', `/api/projects/${p.id}/folders/${a.data.folder.id}`, { token: u.token })).data.folders, 2);
  assert.equal((await req('GET', `/api/projects/${p.id}/files?q=readme`, { token: u.token })).data.files.length, 0);
  const trash = await req('GET', `/api/projects/${p.id}/trash`, { token: u.token });
  assert.equal(trash.data.files.length, 2);
  assert.equal((await req('POST', `/api/projects/${p.id}/folders/${a.data.folder.id}/restore`, { token: u.token })).status, 200);
  assert.equal((await req('GET', `/api/projects/${p.id}/files?q=readme`, { token: u.token })).data.files.length, 2);
  // permanent delete removes the object from storage
  const obj = db.one('SELECT o.object_key FROM file_versions v JOIN storage_objects o ON o.id = v.storage_object_id WHERE v.file_id = ?', cp.data.file.id);
  assert.ok(fs.existsSync(path.join(DATA_DIR, 'objects', obj.object_key)));
  assert.equal((await req('DELETE', `/api/projects/${p.id}/files/${cp.data.file.id}?permanent=1`, { token: u.token })).data.error.code, 'not_in_trash');
  await req('DELETE', `/api/projects/${p.id}/files/${cp.data.file.id}`, { token: u.token });
  assert.equal((await req('DELETE', `/api/projects/${p.id}/files/${cp.data.file.id}?permanent=1`, { token: u.token })).status, 200);
  assert.ok(!fs.existsSync(path.join(DATA_DIR, 'objects', obj.object_key)));
});

test('integrity verification detects tampering at rest; blocked types; quota; cross-project denial', async () => {
  const u = await makeUser();
  const p = await makeProject(u, 'Storage Three');
  const f = (await upload(u, p.id, 'model.safetensors', Buffer.alloc(1024, 7))).data.file;
  assert.equal(f.kind, 'model');
  assert.equal((await req('POST', `/api/projects/${p.id}/files/${f.id}/verify`, { token: u.token })).data.ok, true);
  const obj = db.one('SELECT o.object_key FROM file_versions v JOIN storage_objects o ON o.id = v.storage_object_id WHERE v.file_id = ?', f.id);
  fs.writeFileSync(path.join(DATA_DIR, 'objects', obj.object_key), Buffer.alloc(1024, 8));
  assert.equal((await req('POST', `/api/projects/${p.id}/files/${f.id}/verify`, { token: u.token })).data.ok, false);
  assert.equal((await upload(u, p.id, 'setup.exe', 'MZ...')).data.error.code, 'file_type_blocked');
  assert.equal((await upload(u, p.id, 'renamed.dat', 'MZ\x90\x00')).data.error.code, 'file_type_blocked');
  assert.equal((await upload(u, p.id, 'empty.txt', '')).data.error.code, 'empty_file');
  db.run('UPDATE projects SET storage_quota_bytes = 2000 WHERE id = ?', p.id);
  assert.equal((await upload(u, p.id, 'over.bin', Buffer.alloc(1500))).data.error.code, 'quota_exceeded');
  const other = await makeUser();
  assert.equal((await req('GET', `/api/projects/${p.id}/files/${f.id}`, { token: other.token })).status, 404);
  const url = await req('POST', `/api/projects/${p.id}/files/${f.id}/download-url`, { token: u.token });
  // access revoked after signing → signed link stops working
  db.run('DELETE FROM project_memberships WHERE project_id = ?', p.id);
  db.run('DELETE FROM org_memberships WHERE user_id = ?', u.id);
  assert.equal((await req('GET', url.data.url)).status, 404);
});
