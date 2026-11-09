import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { req, makeUser, makeProject, db, scheduler, providers, close, dockerOk } from './helpers.js';

after(async () => {
  for (const i of db.all("SELECT * FROM compute_instances WHERE status != 'DELETED'")) await (await import('../src/docker.js')).docker(['rm', '-f', `nebius-inst-${i.id}`]);
  close();
});

test('free-only policy: paid providers are ineligible and cannot be verified or enabled', async () => {
  const admin = await makeUser({ superadmin: true });
  const list = await req('GET', '/api/providers', { token: admin.token });
  const byId = Object.fromEntries(list.data.providers.map((p) => [p.id, p]));
  for (const id of ['aws-ec2', 'gcp-compute', 'runpod', 'nebius-ai-cloud', 'lightning-ai']) assert.equal(byId[id].free_only_status, 'INELIGIBLE_FOR_FREE_ONLY_MODE', id);
  assert.equal(byId['google-colab-free'].free_only_status, 'MANUAL_ONLY');
  assert.equal(byId.kaggle.free_only_status, 'PENDING_ADMIN_VERIFICATION');
  assert.equal(byId.kaggle.facts.credit_card_required, false);
  assert.ok(!JSON.stringify(list.data).includes('KAGGLE_API_TOKEN=') && !/token":"[^"]{10,}/.test(JSON.stringify(list.data)), 'no secrets');
  const v = await req('POST', '/api/admin/providers/aws-ec2/verify', { token: admin.token, body: { notes: 'trying to verify a paid provider here', confirm_free_only: true } });
  assert.equal(v.status, 409);
  assert.equal(v.data.error.code, 'INELIGIBLE_FOR_FREE_ONLY_MODE');
  assert.equal((await req('POST', '/api/admin/providers/runpod/enabled', { token: admin.token, body: { enabled: true } })).data.error.code, 'INELIGIBLE_FOR_FREE_ONLY_MODE');
  assert.equal((await req('POST', '/api/admin/providers/google-colab-free/enabled', { token: admin.token, body: { enabled: true } })).status, 409);
  assert.equal((await req('POST', '/api/admin/providers/kaggle/enabled', { token: admin.token, body: { enabled: true } })).data.error.code, 'ADMIN_VERIFICATION_REQUIRED');
  assert.equal((await req('POST', '/api/admin/providers/kaggle/verify', { token: admin.token, body: { notes: 'short' } })).status, 400);
  assert.equal((await req('POST', '/api/admin/providers/kaggle/verify', { token: admin.token, body: { notes: 'Checked account: phone verified, no card on file.' } })).data.error.code, 'confirmation_required');
  // health check is live: without credentials Kaggle is reported unconfigured, never "available"
  const h = await req('POST', '/api/providers/kaggle/health', { token: admin.token });
  assert.equal(h.data.provider.health.status, 'unconfigured');
  assert.equal(h.data.provider.dispatchable, false);
});

test('GPU availability is honest: NO FREE GPU AVAILABLE when no eligible provider', async () => {
  const u = await makeUser();
  const r = await req('GET', '/api/gpu/availability?min_vram_gb=14', { token: u.token });
  assert.equal(r.data.available, false);
  assert.equal(r.data.message, 'NO FREE GPU AVAILABLE');
  assert.ok(r.data.reasons.length > 0);
  assert.ok(!r.data.detected_resources.some((g) => g.provider_id !== 'mock-gpu'), 'no fabricated GPUs');
});

test('Compute Engine: real Docker CPU instance lifecycle, state only from provider', { skip: !dockerOk && 'docker not available' }, async () => {
  const u = await makeUser();
  const p = await makeProject(u, 'Compute One');
  await providers.checkHealth('local-docker-cpu');
  const types = await req('GET', '/api/providers/local-docker-cpu', { token: u.token });
  assert.ok(types.data.machine_types.some((t) => t.id === 'cpu-small'));
  assert.equal((await req('POST', `/api/projects/${p.id}/instances`, { token: u.token, body: { name: 'gpu-box', provider_id: 'aws-ec2', machine_type: 'x' } })).status, 400);
  assert.equal((await req('POST', `/api/projects/${p.id}/instances`, { token: u.token, body: { name: 'bad', provider_id: 'local-docker-cpu', machine_type: 'cpu-small', image: 'ubuntu:latest' } })).data.error.code, 'invalid_image');
  const c = await req('POST', `/api/projects/${p.id}/instances`, { token: u.token, body: { name: 'worker-1', provider_id: 'local-docker-cpu', machine_type: 'cpu-small', image: 'alpine:3.20' } });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  assert.equal(c.data.instance.status, 'RUNNING');
  assert.equal(c.data.instance.gpu, null);
  const id = c.data.instance.id;
  const d = await req('GET', `/api/projects/${p.id}/instances/${id}`, { token: u.token });
  assert.equal(d.data.instance.observed.status, 'RUNNING');
  assert.ok(d.data.stats && typeof d.data.stats.cpu_pct === 'number', 'live docker stats');
  // job attached to the instance runs inside it
  const jb = await req('POST', `/api/projects/${p.id}/jobs`, { token: u.token, body: { type: 'command', name: 'attached', spec: { command: 'id -u; cat /etc/alpine-release', instance_id: id } } });
  const done = await scheduler.waitFor(jb.data.job.id, ['SUCCEEDED', 'FAILED'], 60_000);
  assert.equal(done.status, 'SUCCEEDED');
  assert.match((await req('GET', `/api/projects/${p.id}/jobs/${jb.data.job.id}/logs`, { token: u.token })).data.text, /^1000\n3\.20/m);
  assert.equal((await req('POST', `/api/projects/${p.id}/instances/${id}/stop`, { token: u.token })).data.instance.status, 'STOPPED');
  assert.equal((await req('POST', `/api/projects/${p.id}/instances/${id}/stop`, { token: u.token })).data.error.code, 'invalid_state');
  assert.equal((await req('POST', `/api/projects/${p.id}/instances/${id}/start`, { token: u.token })).data.instance.status, 'RUNNING');
  // external kill is detected (never shows RUNNING without confirmation)
  await (await import('../src/docker.js')).docker(['rm', '-f', `nebius-inst-${id}`]);
  assert.equal((await req('GET', `/api/projects/${p.id}/instances/${id}`, { token: u.token })).data.instance.status, 'UNAVAILABLE');
  assert.equal((await req('DELETE', `/api/projects/${p.id}/instances/${id}`, { token: u.token })).status, 200);
  const ev = db.all('SELECT to_status FROM instance_events WHERE instance_id = ? ORDER BY created_at', id).map((e) => e.to_status);
  assert.deepEqual(ev.slice(0, 2), ['PROVISIONING', 'RUNNING']);
  assert.ok(ev.includes('UNAVAILABLE') && ev.at(-1) === 'DELETED');
});

test('scheduler: sandboxed command jobs, network isolation, failure, timeout, cancel, duplicates, idempotency, dependencies', { skip: !dockerOk && 'docker not available' }, async () => {
  const u = await makeUser();
  const p = await makeProject(u, 'Jobs One');
  await providers.checkHealth('local-docker-cpu');
  const mk = (body) => req('POST', `/api/projects/${p.id}/jobs`, { token: u.token, body: { type: 'command', ...body } });
  const ok = await mk({ name: 'hello', spec: { command: 'echo hello-nebius; id -u' } });
  assert.equal(ok.status, 201);
  assert.equal((await mk({ name: 'hello', spec: { command: 'echo hello-nebius; id -u' } })).data.error.code, 'duplicate_job');
  const net = await mk({ name: 'net', spec: { command: 'wget -q -T 3 -O- http://example.com && echo REACHED || echo NO_NETWORK' } });
  const fail = await mk({ name: 'fail', spec: { command: 'exit 3' } });
  const slow = await mk({ name: 'slow', spec: { command: 'sleep 30' }, timeout_s: 10 });
  const s1 = await scheduler.waitFor(ok.data.job.id, ['SUCCEEDED', 'FAILED'], 60_000);
  assert.equal(s1.status, 'SUCCEEDED');
  assert.match((await req('GET', `/api/projects/${p.id}/jobs/${ok.data.job.id}/logs`, { token: u.token })).data.text, /hello-nebius\n1000/);
  await scheduler.waitFor(net.data.job.id, ['SUCCEEDED'], 60_000);
  assert.match((await req('GET', `/api/projects/${p.id}/jobs/${net.data.job.id}/logs`, { token: u.token })).data.text, /NO_NETWORK/);
  const f = await scheduler.waitFor(fail.data.job.id, ['FAILED'], 60_000);
  assert.match(f.error, /exit code 3/);
  const t = await scheduler.waitFor(slow.data.job.id, ['TIMED_OUT'], 60_000);
  assert.equal(t.status, 'TIMED_OUT');
  // retry a failed job
  assert.equal((await req('POST', `/api/projects/${p.id}/jobs/${fail.data.job.id}/retry`, { token: u.token })).status, 200);
  assert.equal((await scheduler.waitFor(fail.data.job.id, ['FAILED'], 60_000)).attempts, 2);
  // cancel a running job
  const long = await mk({ name: 'long', spec: { command: 'sleep 60' } });
  await scheduler.waitFor(long.data.job.id, ['RUNNING'], 60_000);
  assert.equal((await req('POST', `/api/projects/${p.id}/jobs/${long.data.job.id}/cancel`, { token: u.token })).data.status, 'cancel_requested');
  assert.equal((await scheduler.waitFor(long.data.job.id, ['CANCELLED'], 30_000)).status, 'CANCELLED');
  assert.equal((await req('POST', `/api/projects/${p.id}/jobs/${long.data.job.id}/pause`, { token: u.token })).data.error.code, 'pause_not_supported');
  // idempotency key returns the same job
  const i1 = await mk({ name: 'idem', spec: { command: 'true' }, idempotency_key: 'build-42' });
  const i2 = await mk({ name: 'idem', spec: { command: 'true' }, idempotency_key: 'build-42', allow_duplicate: true });
  assert.equal(i2.data.duplicate, true);
  assert.equal(i2.data.job.id, i1.data.job.id);
  // dependency on a failed job → BLOCKED
  const dep = await mk({ name: 'after-fail', spec: { command: 'echo never' }, depends_on: [t.id] });
  assert.equal((await scheduler.waitFor(dep.data.job.id, ['BLOCKED'], 10_000)).status, 'BLOCKED');
  const ev = await req('GET', `/api/projects/${p.id}/jobs/${ok.data.job.id}`, { token: u.token });
  assert.ok(ev.data.events.some((e) => /STARTING/.test(e.message)));
  assert.ok(db.one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', u.id).n > 0);
});

test('GPU jobs wait (never run on CPU); MOCK provider output is never accepted as training success', async () => {
  const admin = await makeUser({ superadmin: true });
  const p = await makeProject(admin, 'Gpu Wait');
  const imp = await req('POST', `/api/projects/${p.id}/nick48/import`, { token: admin.token, body: {} });
  assert.equal(imp.status, 201, JSON.stringify(imp.data));
  // create the GPU job directly (preflight path is covered in the training tests)
  const { createJob } = scheduler;
  const user = db.one('SELECT * FROM users WHERE id = ?', admin.id);
  const project = db.one('SELECT * FROM projects WHERE id = ?', p.id);
  const { job } = createJob({ project, user, type: 'training.qlora', name: 'gpu', spec: { import_id: imp.data.import.id }, requirements: { min_vram_gb: 14 } });
  await scheduler.tick();
  let cur = db.one('SELECT * FROM jobs WHERE id = ?', job.id);
  assert.equal(cur.status, 'WAITING_FOR_GPU');
  assert.match(cur.blocked_reason, /NO FREE GPU AVAILABLE/);
  // enable the test-only mock provider: job runs, but evidence verification rejects it
  await req('POST', '/api/admin/providers/mock-gpu/verify', { token: admin.token, body: { notes: 'test double for interface tests only', confirm_free_only: true } });
  await req('POST', '/api/admin/providers/mock-gpu/enabled', { token: admin.token, body: { enabled: true } });
  await providers.checkHealth('mock-gpu');
  cur = await scheduler.waitFor(job.id, ['SUCCEEDED', 'FAILED'], 30_000);
  assert.equal(cur.status, 'FAILED');
  assert.match(cur.error, /MOCK test provider/);
  const art = db.one('SELECT * FROM model_artifacts WHERE job_id = ?', job.id);
  assert.equal(art.status, 'REJECTED');
  await req('POST', '/api/admin/providers/mock-gpu/enabled', { token: admin.token, body: { enabled: false } });
});
