import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { req, makeUser, makeProject, upload, db, scheduler, close, dockerOk } from './helpers.js';
import { evaluateEvidence, inspectSafetensors } from '../src/training/evidence.js';
import { validateTrainingConfig, estimateVram, toPipelineConfig } from '../src/training/engine.js';

after(close);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hasApprox = !!process.env.APPROX_REPO_PATH;

// ---- Synthetic evidence fixtures. These exist ONLY to unit-test the verifier's decision logic. ----
function safetensors(tensors) {
  const header = {}; let off = 0; const bufs = [];
  for (const [name, data] of Object.entries(tensors)) { header[name] = { dtype: 'F32', shape: [data.length / 4], data_offsets: [off, off + data.length] }; off += data.length; bufs.push(data); }
  const h = Buffer.from(JSON.stringify(header)); const len = Buffer.alloc(8); len.writeBigUInt64LE(BigInt(h.length));
  return Buffer.concat([len, h, ...bufs]);
}
function fixture({ smoke = false, loraB = Buffer.from(new Float32Array([0.5, -0.25]).buffer), tamper = false, verified = true, gpu = { name: 'Tesla T4' } } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-'));
  fs.mkdirSync(path.join(dir, 'adapter'));
  const st = safetensors({ 'base_model.model.layers.0.self_attn.q_proj.lora_A.weight': Buffer.from(new Float32Array([0.1, 0.2]).buffer), 'base_model.model.layers.0.self_attn.q_proj.lora_B.weight': loraB });
  fs.writeFileSync(path.join(dir, 'adapter/adapter_model.safetensors'), st);
  fs.writeFileSync(path.join(dir, 'train_metadata.json'), JSON.stringify({ status: 'completed', smoke_test: smoke, gpu, base_model: 'Qwen/Qwen2.5-3B-Instruct', model_id: 'nick-4.8', adapter_version: '1.0.0' }));
  fs.writeFileSync(path.join(dir, 'verification.json'), JSON.stringify({ verification_passed: verified, checks: { adapter_loads: true, generation_works: true }, probes: [{ id: 'identity', passed: true }] }));
  fs.writeFileSync(path.join(dir, 'nick-4.8-adapter-1.0.0.tar.gz'), Buffer.from('tarball-bytes'));
  fs.writeFileSync(path.join(dir, 'completion_status.json'), JSON.stringify({ COMPLETE: true }));
  const files = ['adapter/adapter_model.safetensors', 'verification.json', 'nick-4.8-adapter-1.0.0.tar.gz'];
  fs.writeFileSync(path.join(dir, 'SHA256SUMS'), files.map((f) => `${sha(fs.readFileSync(path.join(dir, f)))}  ${f}\n`).join(''));
  if (tamper) fs.appendFileSync(path.join(dir, 'nick-4.8-adapter-1.0.0.tar.gz'), 'x');
  return dir;
}

test('evidence verifier: every failure mode is rejected; only full, re-hashed evidence is COMPLETE', () => {
  const opts = { providerId: 'kaggle', expectedBaseModel: 'Qwen/Qwen2.5-3B-Instruct', expectedModelId: 'nick-4.8' };
  assert.equal(evaluateEvidence(fixture(), opts).status, 'COMPLETE');
  const cases = {
    smoke: [fixture({ smoke: true }), /smoke-test/],
    untrained: [fixture({ loraB: Buffer.alloc(8) }), /LoRA-B weights are all zero/],
    tampered: [fixture({ tamper: true }), /SHA-256 mismatch/],
    unverified: [fixture({ verified: false }), /verification_passed is not true/],
    noGpu: [fixture({ gpu: null }), /no GPU recorded/],
  };
  for (const [name, [dir, re]] of Object.entries(cases)) {
    const r = evaluateEvidence(dir, opts);
    assert.equal(r.status, 'REJECTED', name);
    assert.ok(r.reasons.some((x) => re.test(x)), `${name}: ${r.reasons.join('; ')}`);
  }
  assert.equal(evaluateEvidence(fixture(), { ...opts, providerId: 'mock-gpu' }).status, 'REJECTED');
  assert.equal(evaluateEvidence(fixture(), { ...opts, expectedBaseModel: 'other/model' }).status, 'REJECTED');
  assert.equal(evaluateEvidence(fs.mkdtempSync(path.join(os.tmpdir(), 'empty-')), opts).status, 'REJECTED');
  const bad = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'st-')), 'x.safetensors');
  fs.writeFileSync(bad, Buffer.from('not a safetensors file at all'));
  assert.equal(inspectSafetensors(bad).ok, false);
});

test('training config validation and VRAM estimate', () => {
  const base = { base_model: 'Qwen/Qwen2.5-3B-Instruct', base_model_revision: null, model_id: 'nick-4.8', output_dir: 'outputs/x', max_seq_length: 2048,
    quantization: { load_in_4bit: true, bnb_4bit_quant_type: 'nf4', bnb_4bit_use_double_quant: true, bnb_4bit_compute_dtype: 'bfloat16' },
    lora: { r: 16, alpha: 32, dropout: 0.05, target_modules: ['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'] },
    train: { epochs: 3, per_device_batch_size: 2, gradient_accumulation_steps: 8, learning_rate: 2e-4, checkpoints_per_epoch: 2, warmup_ratio: 0.03 } };
  assert.equal(validateTrainingConfig(base).ok, true);
  const bad = validateTrainingConfig(toPipelineConfig(base, { learning_rate: 5, lora: { r: 0 }, output_dir: '../../etc', base_model: 'nope' }));
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length >= 4);
  const t4 = validateTrainingConfig(base, { gpu: { cuda_capability: '7.5' } });
  assert.ok(t4.warnings.some((w) => /bf16/.test(w)));
  const est = estimateVram(base);
  assert.ok(est.estimate_gb > 5 && est.estimate_gb < 16, `estimate ${est.estimate_gb}`);
  assert.equal(est.trainable_lora_parameters, 16 * 51968 * 36);
  assert.ok(estimateVram(toPipelineConfig(base, { per_device_batch_size: 8 })).estimate_gb > est.estimate_gb);
});

test('Nick 4.8: read-only import, preflight, real CPU dataset stage, GPU stage waits', { skip: !hasApprox && 'Approx-Ai checkout not available' }, async () => {
  const u = await makeUser();
  const p = await makeProject(u, 'Nick Training');
  const imp = await req('POST', `/api/projects/${p.id}/nick48/import`, { token: u.token, body: {} });
  assert.equal(imp.status, 201, JSON.stringify(imp.data));
  const im = imp.data.import;
  assert.equal(im.status, 'IMPORTED', JSON.stringify(im.problems));
  assert.match(im.commit_sha, /^[0-9a-f]{40}$/);
  assert.ok(im.manifest.files['training/colab/nick_4_8_qlora_colab.ipynb'].sha256);
  assert.equal(im.manifest.config.base_model, 'Qwen/Qwen2.5-3B-Instruct');
  assert.equal(im.manifest.production_ready_dataset, false, 'seed set is honestly not production-ready');
  // imported tree is read-only and the original repo is untouched
  const local = db.one('SELECT local_path FROM source_imports WHERE id = ?', im.id).local_path;
  assert.equal(fs.statSync(path.join(local, 'training/train_qlora.py')).mode & 0o222, 0, 'write bits removed (root bypasses this; run NEBIUS as non-root — hashes catch edits regardless)');

  const pf = await req('POST', `/api/projects/${p.id}/nick48/preflight`, { token: u.token, body: {} });
  const r = pf.data.preflight;
  assert.equal(r.checks.repository.ok, true);
  assert.equal(r.checks.config.ok, true);
  assert.equal(r.checks.dataset.ok, true);
  assert.equal(r.checks.gpu.ok, false);
  assert.equal(r.checks.gpu.message, 'NO FREE GPU AVAILABLE');
  assert.ok(r.required_vram_gb >= 14);
  if (r.checks.base_model.ok) {
    assert.match(r.checks.base_model.resolved_sha, /^[0-9a-f]{40}$/);
    assert.equal(r.status, 'WAITING_FOR_GPU');
  } else assert.equal(r.status, 'BLOCKED'); // Hub unreachable → honest BLOCKED

  const v = await req('POST', `/api/projects/${p.id}/training/validate`, { token: u.token, body: { config: { learning_rate: 1 } } });
  assert.equal(v.data.validation.ok, false);
  if (!r.checks.base_model.ok || !dockerOk) return;

  const tr = await req('POST', `/api/projects/${p.id}/nick48/train`, { token: u.token, body: {} });
  assert.equal(tr.status, 201, JSON.stringify(tr.data));
  assert.match(tr.data.message, /NO FREE GPU AVAILABLE/);
  const [prep, train] = tr.data.jobs;
  const prepDone = await scheduler.waitFor(prep.id, ['SUCCEEDED', 'FAILED'], 300_000);
  const log = (await req('GET', `/api/projects/${p.id}/jobs/${prep.id}/logs`, { token: u.token })).data.text;
  assert.equal(prepDone.status, 'SUCCEEDED', `${prepDone.error}\n${log.slice(-2000)}`);
  assert.match(prepDone.result, /NOT training/);
  await scheduler.tick();
  const t = db.one('SELECT * FROM jobs WHERE id = ?', train.id);
  assert.equal(t.status, 'WAITING_FOR_GPU');
  const status = await req('GET', `/api/projects/${p.id}/nick48`, { token: u.token });
  assert.equal(status.data.nick48_status, 'WAITING_FOR_GPU');
  assert.equal(status.data.integrity.ok, true);
  assert.equal(status.data.models.length, 0, 'no model claimed');
  // tampering with the imported pipeline is detected
  fs.chmodSync(path.join(local, 'training'), 0o755); fs.chmodSync(path.join(local, 'training/train_qlora.py'), 0o644);
  fs.appendFileSync(path.join(local, 'training/train_qlora.py'), '\n# tampered\n');
  const pf2 = await req('POST', `/api/projects/${p.id}/nick48/preflight`, { token: u.token, body: {} });
  assert.equal(pf2.data.preflight.status, 'BLOCKED');
  assert.ok(pf2.data.preflight.checks.repository.problems.some((x) => /modified since import/.test(x)));
});

test('manual-provider evidence upload is verified independently (incomplete upload rejected)', async () => {
  const u = await makeUser();
  const p = await makeProject(u, 'Colab Evidence');
  const f = await req('POST', `/api/projects/${p.id}/folders`, { token: u.token, body: { name: 'colab-output' } });
  await upload(u, p.id, 'train_metadata.json', JSON.stringify({ status: 'completed', smoke_test: false, gpu: { name: 'Tesla T4' } }), { folderId: f.data.folder.id });
  await upload(u, p.id, 'completion_report.json', JSON.stringify({ status: 'COMPLETE' }), { folderId: f.data.folder.id });
  const r = await req('POST', `/api/projects/${p.id}/training/evidence`, { token: u.token, body: { folder_id: f.data.folder.id } });
  assert.equal(r.status, 200);
  assert.equal(r.data.status, 'REJECTED', 'a claimed COMPLETE without weights/verification/hashes is rejected');
  assert.ok(r.data.reasons.some((x) => /adapter_model.safetensors missing/.test(x)));
  assert.equal(r.data.artifact.status, 'REJECTED');
  const files = await req('GET', `/api/projects/${p.id}/files?q=evidence_report`, { token: u.token });
  assert.equal(files.data.files.length, 1, 'evidence report stored in project storage');
});
