// Training evidence verifier. NEBIUS reports training as successful ONLY when this returns COMPLETE.
// It does not trust a pipeline's own "COMPLETE" flag alone: it re-hashes every file listed in SHA256SUMS,
// parses the adapter safetensors header, and checks that LoRA-B weights are non-zero (LoRA-B is
// zero-initialised, so non-zero values prove optimisation actually happened).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function walk(dir, out = [], root = dir, depth = 0) {
  if (depth > 6 || !fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue; // never follow links out of the evidence dir
    if (e.isDirectory()) walk(p, out, root, depth + 1); else out.push(p);
  }
  return out;
}
const sha256File = (p) => { const h = crypto.createHash('sha256'); const fd = fs.openSync(p, 'r'); const buf = Buffer.alloc(1 << 20); let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); fs.closeSync(fd); return h.digest('hex'); };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

export function inspectSafetensors(file) {
  const out = { ok: false };
  try {
    const size = fs.statSync(file).size;
    if (size < 16) return { ...out, error: 'file too small' };
    const fd = fs.openSync(file, 'r');
    const lenBuf = Buffer.alloc(8); fs.readSync(fd, lenBuf, 0, 8, 0);
    const n = Number(lenBuf.readBigUInt64LE(0));
    if (n <= 0 || n > 100 * 1024 * 1024 || 8 + n > size) { fs.closeSync(fd); return { ...out, error: 'invalid safetensors header length' }; }
    const hb = Buffer.alloc(n); fs.readSync(fd, hb, 0, n, 8);
    const header = JSON.parse(hb.toString('utf8'));
    const tensors = Object.entries(header).filter(([k]) => k !== '__metadata__');
    const dataLen = size - 8 - n;
    const maxEnd = Math.max(0, ...tensors.map(([, t]) => t.data_offsets?.[1] || 0));
    const loraA = tensors.filter(([k]) => /lora_A/.test(k)); const loraB = tensors.filter(([k]) => /lora_B/.test(k));
    let nonZeroB = 0; let checkedB = 0;
    for (const [, t] of loraB.slice(0, 8)) {
      const [s, e] = t.data_offsets; const len = Math.min(e - s, 4 * 1024 * 1024);
      const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, 8 + n + s);
      checkedB++;
      if (b.some((x) => x !== 0)) nonZeroB++;
    }
    fs.closeSync(fd);
    return { ok: tensors.length > 0 && maxEnd === dataLen, tensors: tensors.length, lora_a_tensors: loraA.length, lora_b_tensors: loraB.length,
      lora_b_checked: checkedB, lora_b_nonzero: nonZeroB, data_bytes: dataLen, header_consistent: maxEnd === dataLen, metadata: header.__metadata__ || null };
  } catch (e) { return { ...out, error: `unparseable safetensors: ${e.message}` }; }
}

/**
 * @param dir directory containing pipeline outputs (Kaggle layout, Colab Drive layout, or uploaded evidence)
 * @param opts.providerId provider that produced it ('mock-gpu' is always rejected)
 * @param opts.expectedBaseModel base model the job was configured with
 */
export function evaluateEvidence(dir, { providerId = null, expectedBaseModel = null, expectedModelId = null } = {}) {
  const files = walk(dir);
  const byName = (name) => files.filter((f) => path.basename(f) === name);
  const first = (name) => byName(name)[0] || null;
  const ev = {}; const reasons = []; const details = {};

  if (providerId === 'mock-gpu') reasons.push('output came from the MOCK test provider — never accepted as training evidence');

  // 1. GPU training actually completed (pipeline metadata), not a smoke test
  const metaPath = first('train_metadata.json');
  const meta = metaPath ? readJson(metaPath) : null;
  details.train_metadata = meta ? { status: meta.status, smoke_test: meta.smoke_test, gpu: meta.gpu, base_model: meta.base_model, base_model_revision: meta.base_model_revision,
    model_id: meta.model_id, adapter_version: meta.adapter_version, metrics: meta.metrics, dataset: meta.dataset ? { version: meta.dataset.version, fingerprint: meta.dataset.fingerprint, production_ready: meta.dataset.production_ready } : null, git_commit: meta.git_commit, finished_at: meta.finished_at } : null;
  ev.gpu_training_completed = !!meta && meta.status === 'completed' && meta.smoke_test === false && !!meta.gpu && !meta.mock;
  if (!meta) reasons.push('train_metadata.json missing');
  else {
    if (meta.status !== 'completed') reasons.push(`training status is "${meta.status}"`);
    if (meta.smoke_test !== false) reasons.push('smoke-test run (tiny CPU model) — not a real training result');
    if (!meta.gpu) reasons.push('no GPU recorded in train_metadata.json');
    if (meta.mock) reasons.push('metadata is marked mock');
  }
  ev.base_model_matches = !!meta && (!expectedBaseModel || meta.base_model === expectedBaseModel);
  if (meta && expectedBaseModel && meta.base_model !== expectedBaseModel) reasons.push(`base model ${meta.base_model} ≠ expected ${expectedBaseModel}`);
  if (meta && expectedModelId && meta.model_id !== expectedModelId) { ev.model_id_matches = false; reasons.push(`model_id ${meta.model_id} ≠ expected ${expectedModelId}`); } else ev.model_id_matches = !!meta;

  // 2. Adapter weights exist and are a valid, trained LoRA safetensors file
  const weights = first('adapter_model.safetensors');
  const st = weights ? inspectSafetensors(weights) : null;
  details.adapter_safetensors = st;
  ev.adapter_weights_valid = !!st?.ok && st.lora_b_tensors > 0;
  ev.lora_b_nonzero = !!st && st.lora_b_checked > 0 && st.lora_b_nonzero === st.lora_b_checked;
  if (!weights) reasons.push('adapter_model.safetensors missing');
  else if (!st.ok) reasons.push(`adapter safetensors invalid: ${st.error || 'header/data size mismatch'}`);
  else if (!st.lora_b_tensors) reasons.push('no LoRA tensors in adapter');
  else if (!ev.lora_b_nonzero) reasons.push('LoRA-B weights are all zero — adapter was never trained');

  // 3. Adapter reload + real inference verification (pipeline verify_adapter.py)
  const verPath = first('verification.json');
  const ver = verPath ? readJson(verPath) : null;
  details.verification = ver ? { verification_passed: ver.verification_passed, checks: ver.checks, capability_pass_rate: ver.capability_pass_rate, safety_passed: ver.safety_passed,
    failed_probes: ver.failed_probes, eval_perplexity: ver.eval_perplexity, probes: Array.isArray(ver.probes) ? ver.probes.length : (ver.probes ? Object.keys(ver.probes).length : 0) } : null;
  ev.adapter_reloaded = ver?.checks?.adapter_loads === true;
  ev.real_inference_verified = ver?.checks?.generation_works === true && !!ver?.probes && (Array.isArray(ver.probes) ? ver.probes.length > 0 : Object.keys(ver.probes).length > 0);
  ev.verification_passed = ver?.verification_passed === true;
  if (!ver) reasons.push('verification.json missing');
  else {
    if (!ev.adapter_reloaded) reasons.push('adapter reload check did not pass');
    if (!ev.real_inference_verified) reasons.push('real inference was not verified');
    if (!ev.verification_passed) reasons.push('verification_passed is not true');
  }

  // 4. SHA-256: recompute every entry of SHA256SUMS ourselves
  const sumsPath = first('SHA256SUMS');
  const sums = []; let mismatches = 0;
  if (sumsPath) {
    const base = path.dirname(sumsPath);
    for (const line of fs.readFileSync(sumsPath, 'utf8').split('\n').filter(Boolean)) {
      const m = /^([0-9a-f]{64}) [ *]?(.+)$/.exec(line.trim());
      if (!m) { sums.push({ line, ok: false, error: 'malformed line' }); mismatches++; continue; }
      const rel = m[2].trim();
      const p = path.resolve(base, rel);
      if (!p.startsWith(path.resolve(dir) + path.sep)) { sums.push({ file: rel, ok: false, error: 'path escapes evidence dir' }); mismatches++; continue; }
      if (!fs.existsSync(p)) { sums.push({ file: rel, ok: false, error: 'missing' }); mismatches++; continue; }
      const actual = sha256File(p);
      const ok = actual === m[1];
      if (!ok) mismatches++;
      sums.push({ file: rel, expected: m[1], actual, ok });
    }
  }
  details.sha256 = sums;
  const weightsListed = weights && sums.some((s) => s.ok && path.basename(s.file) === 'adapter_model.safetensors');
  const tarball = files.find((f) => /^nick-[\d.]+-adapter-.+\.tar\.gz$|adapter.*\.tar\.gz$/.test(path.basename(f)));
  const tarListed = tarball && sums.some((s) => s.ok && path.basename(s.file) === path.basename(tarball));
  ev.sha256_verified = !!sumsPath && sums.length > 0 && mismatches === 0 && (!!weightsListed || !!tarListed);
  if (!sumsPath) reasons.push('SHA256SUMS missing');
  else if (mismatches) reasons.push(`${mismatches} SHA-256 mismatch(es)`);
  else if (!weightsListed && !tarListed) reasons.push('SHA256SUMS does not cover the adapter weights or package');

  // 5. Package
  ev.package_exists = !!tarball;
  if (!tarball) reasons.push('adapter package (.tar.gz) missing');

  // 6. The pipeline's own strict verdict must agree (never sufficient alone)
  const comp = readJson(first('completion_status.json') || '') || readJson(first('completion_report.json') || '');
  details.pipeline_verdict = comp ? { COMPLETE: comp.COMPLETE, status: comp.status, evidence: comp.evidence } : null;
  ev.pipeline_reports_complete = !!comp && (comp.COMPLETE === true || comp.status === 'COMPLETE');
  if (!comp) reasons.push('pipeline completion report missing');
  else if (!ev.pipeline_reports_complete) reasons.push('pipeline itself reports NOT COMPLETE');

  const complete = reasons.length === 0 && Object.values(ev).every(Boolean);
  return {
    status: complete ? 'COMPLETE' : 'REJECTED', evidence: ev, reasons, details,
    adapter_sha256: weights && fs.existsSync(weights) ? sha256File(weights) : null,
    package: tarball ? { name: path.basename(tarball), sha256: sha256File(tarball), bytes: fs.statSync(tarball).size } : null,
    files_examined: files.length, evaluated_at: new Date().toISOString(), verifier: 'nebius-evidence-verifier/1',
  };
}

export function evidenceMarkdown(result, { job = null, project = null, importInfo = null, provider = null } = {}) {
  const yes = (b) => (b ? 'YES' : 'NO');
  const lines = [
    `# Training evidence report — ${result.status}`, '',
    `- Verifier: ${result.verifier} · evaluated ${result.evaluated_at}`,
    project ? `- Project: ${project.name} (${project.project_code})` : null,
    job ? `- Job: ${job.id} (${job.name})` : null,
    provider ? `- Provider: ${provider}` : null,
    importInfo ? `- Source: ${importInfo.repo_url} @ ${importInfo.commit_sha}` : null,
    result.adapter_sha256 ? `- adapter_model.safetensors SHA-256: \`${result.adapter_sha256}\`` : null,
    result.package ? `- Package: ${result.package.name} (${result.package.bytes} bytes) SHA-256 \`${result.package.sha256}\`` : null,
    '', '## Evidence checks', '', '| Check | Result |', '|---|---|',
    ...Object.entries(result.evidence).map(([k, v]) => `| ${k} | ${yes(v)} |`),
    '', result.reasons.length ? '## Why it is not complete' : '## Result', '',
    ...(result.reasons.length ? result.reasons.map((r) => `- ${r}`) : ['All evidence checks passed. Training is verified as complete.']),
    '', '## SHA-256 verification', '', ...(result.details.sha256?.length ? result.details.sha256.map((s) => `- ${s.ok ? 'OK ' : 'FAIL'} ${s.file || s.line}${s.error ? ' — ' + s.error : ''}`) : ['- (no SHA256SUMS)']),
    '', '## Training metadata', '', '```json', JSON.stringify(result.details.train_metadata, null, 2), '```',
    '', '## Verification summary', '', '```json', JSON.stringify(result.details.verification, null, 2), '```',
  ].filter((l) => l !== null);
  return lines.join('\n') + '\n';
}
