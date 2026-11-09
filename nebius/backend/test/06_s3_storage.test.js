// Runs only when an S3-compatible endpoint is provided (e.g. SeaweedFS / MinIO in CI):
//   S3_TEST_ENDPOINT=http://127.0.0.1:8333 S3_TEST_ACCESS_KEY=... S3_TEST_SECRET_KEY=... npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const E = process.env.S3_TEST_ENDPOINT;
if (E) Object.assign(process.env, { NEBIUS_STORAGE: 's3', S3_ENDPOINT: E, S3_BUCKET: `nebius-test-${Date.now()}`, S3_ACCESS_KEY: process.env.S3_TEST_ACCESS_KEY, S3_SECRET_KEY: process.env.S3_TEST_SECRET_KEY });
const h = await import('./helpers.js');
const { S3Backend } = await import('../src/storage/s3.js');
after(h.close);

test('S3 backend (SigV4): bucket, upload via API, signed download, integrity, delete; bad credentials rejected', { skip: !E && 'S3_TEST_ENDPOINT not set' }, async () => {
  const s3 = new S3Backend({ endpoint: E, region: 'us-east-1', bucket: process.env.S3_BUCKET, accessKey: process.env.S3_ACCESS_KEY, secretKey: process.env.S3_SECRET_KEY });
  const mk = s3.sign('PUT', '');
  assert.ok((await fetch(mk.url, { method: 'PUT', headers: mk.headers })).ok, 'bucket created');
  assert.equal((await s3.health()).ok, true);
  const bad = new S3Backend({ endpoint: E, region: 'us-east-1', bucket: process.env.S3_BUCKET, accessKey: process.env.S3_ACCESS_KEY, secretKey: 'wrong-secret' });
  assert.equal((await bad.health()).ok, false, 'wrong secret refused by server');
  const u = await h.makeUser();
  const p = await h.makeProject(u, 'S3 Project');
  const body = crypto.randomBytes(300_000);
  const up = await h.upload(u, p.id, 'weights.bin', body, { sha: crypto.createHash('sha256').update(body).digest('hex') });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  const key = h.db.one('SELECT o.object_key, o.backend FROM file_versions v JOIN storage_objects o ON o.id = v.storage_object_id WHERE v.file_id = ?', up.data.file.id);
  assert.equal(key.backend, 's3');
  assert.equal(await s3.exists(key.object_key), true);
  const url = await h.req('POST', `/api/projects/${p.id}/files/${up.data.file.id}/download-url`, { token: u.token });
  const dl = await h.req('GET', url.data.url);
  assert.ok(Buffer.compare(dl.data, body) === 0, 'downloaded bytes identical');
  assert.equal((await h.req('POST', `/api/projects/${p.id}/files/${up.data.file.id}/verify`, { token: u.token })).data.ok, true);
  await h.req('DELETE', `/api/projects/${p.id}/files/${up.data.file.id}`, { token: u.token });
  await h.req('DELETE', `/api/projects/${p.id}/files/${up.data.file.id}?permanent=1`, { token: u.token });
  assert.equal(await s3.exists(key.object_key), false, 'object removed from bucket');
});
