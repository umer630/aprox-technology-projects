// Nick 4.8 integration with the EXISTING Approx-Ai pipeline. NEBIUS never edits that repository:
// it clones it read-only at a recorded commit, hashes the pipeline files, and runs the pipeline's own
// scripts from a per-job writable COPY of training/ so outputs never land in the source tree.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { one, all, run, now, newId, j, pj, audit } from '../db.js';
import { config } from '../config.js';
import { execText } from '../exec.js';
import { bad, notFound } from '../http.js';
import { registerJobHandler, jobDir } from '../scheduler.js';
import { adapter, selectGpuProvider } from '../providers/index.js';
import { validateTrainingConfig, estimateVram, validateBaseModel, toPipelineConfig } from './engine.js';
import { evaluateEvidence, evidenceMarkdown } from './evidence.js';
import { docker, dockerAvailable, ensureImage } from '../docker.js';

export const REQUIRED_FILES = [
  'training/colab/nick_4_8_qlora_colab.ipynb',
  'training/colab/colab_pipeline.py',
  'training/colab/requirements-colab.txt',
  'training/train_qlora.py',
  'training/verify_adapter.py',
  'training/package_adapter.py',
  'training/configs/nick-4.8-qlora.json',
  'training/configs/dataset_sources.json',
  'training/approx_data/build.py',
  'training/kaggle/kaggle_pipeline.py',
  'training/kaggle/kaggle_runner.py',
  'training/kaggle/nick_4_8_qlora.ipynb',
];
// Pipeline preflight refuses GPUs with < 14 GB (kaggle_pipeline.py / colab_pipeline.py).
export const PIPELINE_MIN_VRAM_GB = 14;
export const PYTHON_IMAGE = process.env.NEBIUS_PYTHON_IMAGE || 'python:3.12-slim';

const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function countJsonl(p) {
  const out = { lines: 0, valid_records: 0, invalid_lines: 0, domains: {} };
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    out.lines++;
    try { const r = JSON.parse(line); if (Array.isArray(r.messages)) { out.valid_records++; out.domains[r.domain || 'unknown'] = (out.domains[r.domain || 'unknown'] || 0) + 1; } else out.invalid_lines++; } catch { out.invalid_lines++; }
  }
  return out;
}

export async function importApproxRepo({ project, user, ref = null, repoUrl = null }) {
  const id = newId('imp_');
  const dest = path.join(config.dataDir, 'imports', id, 'repo');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const env = { ...process.env, GIT_LFS_SKIP_SMUDGE: '1', GIT_TERMINAL_PROMPT: '0' };
  const url = repoUrl || config.approx.repoUrl;
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/.test(url) && !config.approx.localPath) throw bad('repo_url must be an https://github.com/<owner>/<repo> URL');
  if (ref !== null && !/^[\w./-]{1,100}$/.test(ref)) throw bad('ref must be a branch, tag or commit');
  const src = config.approx.localPath || url;
  const args = config.approx.localPath ? ['clone', '--no-hardlinks', '--quiet', src, dest] : ['clone', '--depth', '1', '--quiet', ...(ref ? ['--branch', ref] : []), src, dest];
  const r = await execText('git', args, 600_000, { env });
  if (r.code !== 0) throw bad(`git clone failed: ${r.stderr.trim().slice(0, 300)}`, 'import_failed');
  if (config.approx.localPath && ref) await execText('git', ['-C', dest, 'checkout', '--quiet', ref], 60_000);
  const commit = (await execText('git', ['-C', dest, 'rev-parse', 'HEAD'])).stdout.trim();
  const problems = [];
  const files = {};
  for (const f of REQUIRED_FILES) {
    const p = path.join(dest, f);
    if (fs.existsSync(p)) files[f] = { sha256: sha256File(p), bytes: fs.statSync(p).size };
    else problems.push(`missing ${f}`);
  }
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(path.join(dest, 'training/configs/nick-4.8-qlora.json'), 'utf8')); } catch (e) { problems.push(`config unreadable: ${e.message}`); }
  const datasets = [];
  try {
    const sources = JSON.parse(fs.readFileSync(path.join(dest, 'training/configs/dataset_sources.json'), 'utf8')).sources || [];
    for (const s of sources) {
      const p = path.join(dest, 'training', s.path);
      const present = fs.existsSync(p);
      datasets.push({ id: s.id, path: `training/${s.path}`, approved: !!s.approved, license: s.license, present, ...(present && s.path.endsWith('.jsonl') ? countJsonl(p) : {}), sha256: present ? sha256File(p) : null });
    }
  } catch (e) { problems.push(`dataset registry unreadable: ${e.message}`); }
  if (!datasets.some((d) => d.approved && d.present && d.valid_records > 0)) problems.push('no approved dataset with valid records present');
  const totalRecords = datasets.filter((d) => d.approved && d.present).reduce((s, d) => s + (d.valid_records || 0), 0);
  const manifest = { files, config: cfg, datasets, approved_records: totalRecords, production_ready_dataset: totalRecords >= 20000,
    dataset_note: totalRecords < 20000 ? `Only ${totalRecords} approved records — the pipeline itself marks this NOT production-ready (< 20,000). Training on it validates the pipeline only.` : null };
  // Protect the imported source tree from modification.
  await execText('chmod', ['-R', 'a-w', dest]);
  const status = problems.length ? 'INCOMPLETE' : 'IMPORTED';
  run('INSERT INTO source_imports (id,org_id,project_id,kind,repo_url,commit_sha,local_path,manifest,status,problems,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    id, project.org_id, project.id, 'approx-nick48', config.approx.localPath ? `local:${config.approx.localPath}` : url, commit, dest, j(manifest), status, j(problems), user.id, now());
  audit(user.id, 'nick48.import', { orgId: project.org_id, projectId: project.id, target: id, detail: { commit, status } });
  return getImport(project, id);
}

export function getImport(project, id) {
  const imp = id ? one('SELECT * FROM source_imports WHERE id = ? AND project_id = ?', id, project.id)
    : one("SELECT * FROM source_imports WHERE project_id = ? AND kind = 'approx-nick48' ORDER BY created_at DESC LIMIT 1", project.id);
  if (!imp) throw notFound('No Nick 4.8 import found for this project — import the Approx-Ai repository first');
  return { ...imp, manifest: pj(imp.manifest, {}), problems: pj(imp.problems, []) };
}

/** Verify the imported files are still byte-identical to what was recorded at import time. */
export function verifyImportIntegrity(imp) {
  const changed = [];
  for (const [f, rec] of Object.entries(imp.manifest.files || {})) {
    const p = path.join(imp.local_path, f);
    if (!fs.existsSync(p) || sha256File(p) !== rec.sha256) changed.push(f);
  }
  return { ok: changed.length === 0, changed };
}

export async function preflight(project, imp, overrides = {}) {
  const report = { import_id: imp.id, commit: imp.commit_sha, checked_at: new Date().toISOString(), checks: {}, reasons: [] };
  const integ = verifyImportIntegrity(imp);
  report.checks.repository = { ok: imp.status === 'IMPORTED' && integ.ok, problems: [...imp.problems, ...integ.changed.map((c) => `modified since import: ${c}`)] };
  const cfg = toPipelineConfig(imp.manifest.config || {}, overrides);
  const v = validateTrainingConfig(cfg);
  report.checks.config = { ok: v.ok, errors: v.errors, warnings: v.warnings, effective: v.config };
  const ds = imp.manifest.datasets || [];
  report.checks.dataset = { ok: ds.some((d) => d.approved && d.present && d.valid_records > 0), approved_records: imp.manifest.approved_records, production_ready: imp.manifest.production_ready_dataset, note: imp.manifest.dataset_note,
    sources: ds.map((d) => ({ id: d.id, approved: d.approved, present: d.present, valid_records: d.valid_records ?? null })) };
  const bm = await validateBaseModel(cfg.base_model, cfg.base_model_revision);
  report.checks.base_model = bm;
  const est = estimateVram(cfg, bm.architecture?.hidden_size ? bm.architecture : null);
  const required = Math.max(PIPELINE_MIN_VRAM_GB, est.estimate_gb ? Math.ceil(est.estimate_gb * 1.15) : 0);
  report.checks.memory = { ...est, required_vram_gb: required, pipeline_minimum_gb: PIPELINE_MIN_VRAM_GB };
  const gpu = selectGpuProvider(required);
  report.checks.gpu = gpu.none ? { ok: false, message: 'NO FREE GPU AVAILABLE', reasons: gpu.reasons } : { ok: true, provider: gpu.provider, gpu: gpu.gpu, gpu_source: gpu.gpu_source };
  if (!report.checks.repository.ok) report.reasons.push('repository import incomplete or modified');
  if (!v.ok) report.reasons.push('invalid training configuration');
  if (!report.checks.dataset.ok) report.reasons.push('no approved dataset records');
  if (!bm.ok) report.reasons.push(`base model check failed: ${bm.error}`);
  const blocking = report.reasons.length > 0;
  report.status = blocking ? 'BLOCKED' : gpu.none ? 'WAITING_FOR_GPU' : 'READY';
  report.required_vram_gb = required;
  report.pipeline_config = cfg;
  return report;
}

function makeWorkspace(job, imp, cfg) {
  const ws = path.join(jobDir(job.id), 'workspace');
  if (!fs.existsSync(path.join(ws, 'training'))) {
    fs.cpSync(path.join(imp.local_path, 'training'), path.join(ws, 'training'), { recursive: true });
    for (const f of ['README.md']) if (fs.existsSync(path.join(imp.local_path, f))) fs.copyFileSync(path.join(imp.local_path, f), path.join(ws, f));
    execText('chmod', ['-R', 'u+w', ws]);
  }
  if (cfg) fs.writeFileSync(path.join(ws, 'training/configs/nick-4.8-qlora.json'), JSON.stringify(cfg, null, 2)); // the COPY only
  return ws;
}

// Parses Hugging Face Trainer log lines like {'loss': 1.23, 'grad_norm': ..., 'learning_rate': ..., 'epoch': 0.5}
const LOSS_RE = /\{'loss': ([\d.eE+-]+).*?'epoch': ([\d.]+)\}/;
function trackProgress(job, line) {
  const m = LOSS_RE.exec(line);
  if (!m) return;
  const point = { loss: Number(m[1]), epoch: Number(m[2]), t: now() };
  fs.appendFileSync(path.join(jobDir(job.id), 'metrics.jsonl'), JSON.stringify(point) + '\n');
  run('UPDATE jobs SET progress = ?, updated_at = ? WHERE id = ?', j({ ...point, source: 'trainer log' }), now(), job.id);
}

// CPU stage: run the pipeline's dataset builder + train_qlora.py --dry-run in an isolated container (no network).
registerJobHandler('training.prepare', {
  description: 'Build and validate the training dataset with the Approx pipeline (CPU, isolated container)',
  requiresGpu: false,
  validate(spec, project) { getImport(project, spec.import_id); },
  async run(job, io) {
    const project = one('SELECT * FROM projects WHERE id = ?', job.project_id);
    const imp = getImport(project, io.spec.import_id);
    const integ = verifyImportIntegrity(imp);
    if (!integ.ok) return { status: 'FAILED', error: `imported pipeline modified since import: ${integ.changed.join(', ')}` };
    const d = await dockerAvailable();
    if (!d.ok) return { status: 'FAILED', error: `container runtime unavailable: ${d.detail}` };
    const img = await ensureImage(PYTHON_IMAGE);
    if (!img.ok) return { status: 'FAILED', error: `python image unavailable: ${img.detail}` };
    const cfg = io.spec.config ? toPipelineConfig(imp.manifest.config, io.spec.config) : null;
    const ws = makeWorkspace(job, imp, cfg);
    await execText('chmod', ['-R', 'a+rwX', ws]);
    io.setRunning('dataset build in isolated container');
    const name = `nebius-prep-${job.id}`;
    const script = 'set -e; cd /ws/training; python -m approx_data.build --out data/processed --version nick-sft-nebius; python train_qlora.py --dry-run';
    const args = ['run', '--rm', '--name', name, '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '256', '--memory', '1g', '--cpus', '1',
      '--user', '1000:1000', '-v', `${ws}:/ws`, PYTHON_IMAGE, 'sh', '-c', script];
    const code = await new Promise((resolve) => {
      const child = spawn(config.docker.bin, args);
      child.stdout.on('data', (b) => io.log(String(b))); child.stderr.on('data', (b) => io.log(String(b)));
      const kill = () => docker(['rm', '-f', name]);
      io.signal.addEventListener('abort', kill, { once: true });
      child.on('close', (c) => { io.signal.removeEventListener('abort', kill); resolve(c ?? 137); });
      child.on('error', (e) => { io.log(e.message); resolve(127); });
    });
    const mf = path.join(ws, 'training/data/processed/manifest.json');
    const manifest = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : null;
    const summary = manifest ? { dataset_version: manifest.dataset_version, production_ready: manifest.production_ready, outputs: manifest.files || manifest.outputs || null, counts: manifest.counts || manifest.split_counts || null } : null;
    if (code !== 0) return { status: 'FAILED', error: `dataset build/dry-run exited ${code}`, result: { manifest: summary } };
    return { status: 'SUCCEEDED', result: { manifest: summary, workspace: 'job workspace (copy)', note: 'Real CPU dataset build + config dry-run. This is NOT training.' } };
  },
});

// GPU stage: dispatched by the scheduler only to a free-only-eligible provider. SUCCEEDED requires COMPLETE evidence.
export const POLL_MS = { value: Number(process.env.NEBIUS_TRAIN_POLL_MS || 60_000) };
registerJobHandler('training.qlora', {
  description: 'QLoRA fine-tuning on a free GPU provider using the Approx pipeline; success requires verified evidence',
  requiresGpu: true,
  pausable: true,
  minVramGb: PIPELINE_MIN_VRAM_GB,
  onLog: trackProgress,
  validate(spec, project) {
    const imp = getImport(project, spec.import_id);
    if (imp.status !== 'IMPORTED') throw bad('Import is incomplete; fix the repository first');
    if (spec.config) { const v = validateTrainingConfig(toPipelineConfig(imp.manifest.config, spec.config)); if (!v.ok) throw bad(`Invalid training config: ${v.errors.join('; ')}`, 'invalid_config'); }
  },
  async run(job, io) {
    const project = one('SELECT * FROM projects WHERE id = ?', job.project_id);
    const imp = getImport(project, io.spec.import_id);
    const integ = verifyImportIntegrity(imp);
    if (!integ.ok) return { status: 'FAILED', error: `imported pipeline modified since import: ${integ.changed.join(', ')}` };
    const providerId = one('SELECT provider_id FROM jobs WHERE id = ?', job.id).provider_id;
    const a = adapter(providerId);
    if (providerId === 'kaggle' && io.spec.config) return { status: 'BLOCKED', error: 'Kaggle path runs the repository notebook unchanged; custom configs need local-nvidia' };
    const cfg = io.spec.config ? toPipelineConfig(imp.manifest.config, io.spec.config) : null;
    const ws = makeWorkspace(job, imp, cfg);
    const outputDir = path.join(jobDir(job.id), 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    let ref = one('SELECT provider_ref FROM jobs WHERE id = ?', job.id).provider_ref;
    if (!ref || !io.resume) {
      const sub = await a.submit({ job, workspace: ws, outputDir, log: io.log });
      ref = sub.ref; io.setProviderRef(ref);
      io.event('provider', `submitted to ${providerId}`, { ref, url: sub.url || null });
    } else io.event('provider', `resuming provider run ${ref}`);
    io.setRunning(`running on ${providerId}${io.gpu?.name ? ` (${io.gpu.name})` : ''}`);
    let st;
    for (;;) {
      if (io.signal.aborted) {
        const c = await a.cancel(ref);
        io.event('provider', `stop requested at provider: ${c.ok ? 'ok' : c.detail}`);
        run('UPDATE jobs SET provider_ref = NULL WHERE id = ?', job.id); // resume re-submits; the pipeline resumes from its checkpoints
        return { status: 'FAILED', error: 'interrupted' };
      }
      st = await a.poll(ref);
      if (['COMPLETE', 'FAILED', 'CANCELLED', 'LOST'].includes(st.state)) break;
      await new Promise((r) => { const t = setTimeout(r, POLL_MS.value); io.signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });
    }
    io.event('provider', `provider state ${st.state}: ${st.detail || ''}`);
    let dir = outputDir;
    try { dir = (await a.fetchOutputs(ref, outputDir, { outputDir })).dir || outputDir; } catch (e) { io.log(`[nebius] output download failed: ${e.message}`); }
    const result = evaluateEvidence(dir, { providerId, expectedBaseModel: (cfg || imp.manifest.config).base_model, expectedModelId: (cfg || imp.manifest.config).model_id });
    const artifact = await recordEvidence({ project, userId: job.created_by, jobId: job.id, result, imp, providerId, dir });
    if (result.status === 'COMPLETE') return { status: 'SUCCEEDED', result: { evidence: result.evidence, artifact_id: artifact.id, adapter_sha256: result.adapter_sha256 }, message: 'Training verified COMPLETE' };
    return { status: 'FAILED', error: `Training NOT verified (provider state ${st.state}): ${result.reasons.join('; ')}`.slice(0, 3000), result: { evidence: result.evidence, artifact_id: artifact.id } };
  },
});

/** Persist evidence report (job dir + project storage) and register a model artifact (VERIFIED or REJECTED). */
export async function recordEvidence({ project, userId, jobId, result, imp, providerId, dir }) {
  const { storeBuffer, storeFile } = await import('../routes/files.js');
  const user = one('SELECT * FROM users WHERE id = ?', userId);
  const md = evidenceMarkdown(result, { job: jobId ? one('SELECT * FROM jobs WHERE id = ?', jobId) : null, project, importInfo: imp, provider: providerId });
  const folderId = ensureFolderPath(project, user, ['nick-4.8', 'evidence', jobId || `upload-${Date.now()}`]);
  await storeBuffer({ project, user, folderId, name: 'evidence_report.md', buffer: Buffer.from(md) });
  await storeBuffer({ project, user, folderId, name: 'evidence.json', buffer: Buffer.from(JSON.stringify(result, null, 2)) });
  let fileId = null;
  if (result.status === 'COMPLETE' && result.package) {
    const pkgPath = findFile(dir, result.package.name);
    if (pkgPath) {
      const tmp = path.join(config.dataDir, 'tmp', 'pkg_' + newId());
      fs.mkdirSync(path.dirname(tmp), { recursive: true });
      fs.copyFileSync(pkgPath, tmp);
      const f = await storeFile({ project, user, folderId, name: result.package.name, tmp: { file: tmp, size: result.package.bytes, sha256: result.package.sha256 }, overwrite: true, scan: false });
      fileId = f.id;
    }
  }
  const meta = result.details.train_metadata || {};
  const id = newId('mdl_');
  run('INSERT INTO model_artifacts (id,org_id,project_id,job_id,name,kind,base_model,version,status,sha256,file_id,evidence,reasons,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, project.org_id, project.id, jobId, meta.model_id || 'nick-4.8', 'lora-adapter', meta.base_model || null, meta.adapter_version || null,
    result.status === 'COMPLETE' ? 'VERIFIED' : 'REJECTED', result.adapter_sha256, fileId, j(result.evidence), j(result.reasons), userId, now());
  audit(userId, 'training.evidence', { orgId: project.org_id, projectId: project.id, target: id, detail: { status: result.status, job: jobId, provider: providerId } });
  return one('SELECT * FROM model_artifacts WHERE id = ?', id);
}

function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const f = findFile(p, name); if (f) return f; } else if (e.name === name) return p;
  }
  return null;
}

export function ensureFolderPath(project, user, parts) {
  let parent = null;
  for (const name of parts) {
    let f = one("SELECT * FROM folders WHERE project_id = ? AND COALESCE(parent_id,'') = ? AND name = ? AND deleted_at IS NULL", project.id, parent || '', name);
    if (!f) {
      const id = newId('fld_');
      run('INSERT INTO folders (id,org_id,project_id,parent_id,name,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', id, project.org_id, project.id, parent, name, user.id, now(), now());
      f = { id };
    }
    parent = f.id;
  }
  return parent;
}

/** Evaluate evidence uploaded into a project folder (manual providers such as Colab). */
export async function evaluateUploadedEvidence(project, user, folderId, imp) {
  const { storage } = await import('../storage/index.js');
  const { pipeline } = await import('node:stream/promises');
  const root = path.join(config.dataDir, 'tmp', 'evidence_' + newId());
  const walkFolder = async (fid, rel) => {
    for (const f of all('SELECT * FROM files WHERE project_id = ? AND COALESCE(folder_id,\'\') = ? AND deleted_at IS NULL', project.id, fid || '')) {
      const obj = one('SELECT o.* FROM file_versions v JOIN storage_objects o ON o.id = v.storage_object_id WHERE v.file_id = ? AND v.version = ?', f.id, f.current_version);
      const dest = path.join(root, rel, f.name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await pipeline(await storage().get(obj.object_key), fs.createWriteStream(dest));
    }
    for (const sub of all('SELECT * FROM folders WHERE project_id = ? AND parent_id = ? AND deleted_at IS NULL', project.id, fid)) await walkFolder(sub.id, path.join(rel, sub.name));
  };
  await walkFolder(folderId, '');
  const cfg = imp?.manifest?.config || {};
  const result = evaluateEvidence(root, { providerId: 'manual-upload', expectedBaseModel: cfg.base_model || null, expectedModelId: cfg.model_id || null });
  const artifact = await recordEvidence({ project, userId: user.id, jobId: null, result, imp, providerId: 'manual-upload (e.g. Google Colab)', dir: root });
  fs.rmSync(root, { recursive: true, force: true });
  return { result, artifact };
}
