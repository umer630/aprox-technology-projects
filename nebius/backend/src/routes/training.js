import { one, all, pj } from '../db.js';
import { readJson, sendJson, notFound, conflict, str, int, bad } from '../http.js';
import { projectAccess } from '../iam.js';
import { rateLimit } from '../security.js';
import { createJob } from '../scheduler.js';
import { importApproxRepo, getImport, preflight, evaluateUploadedEvidence, verifyImportIntegrity, PIPELINE_MIN_VRAM_GB } from '../training/nick48.js';
import { validateTrainingConfig, estimateVram, toPipelineConfig } from '../training/engine.js';
import { publicJob } from './jobs.js';

const publicImport = (imp) => ({ id: imp.id, repo_url: imp.repo_url, commit_sha: imp.commit_sha, status: imp.status, problems: imp.problems, manifest: imp.manifest, created_at: imp.created_at });

export function registerTrainingRoutes(r) {
  r.post('/api/projects/:id/nick48/import', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write');
    rateLimit(`import:${user.id}`, 10, 3600_000);
    const b = await readJson(req);
    const imp = await importApproxRepo({ project, user, ref: b.ref ? str(b.ref, 'ref', { max: 100 }) : null });
    sendJson(res, 201, { import: publicImport(imp) });
  });

  r.get('/api/projects/:id/nick48', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'read');
    const imports = all("SELECT id, repo_url, commit_sha, status, created_at FROM source_imports WHERE project_id = ? AND kind = 'approx-nick48' ORDER BY created_at DESC", project.id);
    let latest = null; let integrity = null;
    if (imports.length) { latest = getImport(project, imports[0].id); integrity = verifyImportIntegrity(latest); }
    const jobs = all("SELECT * FROM jobs WHERE project_id = ? AND type LIKE 'training.%' ORDER BY created_at DESC LIMIT 50", project.id).map(publicJob);
    const models = all('SELECT * FROM model_artifacts WHERE project_id = ? ORDER BY created_at DESC', project.id).map((m) => ({ ...m, evidence: pj(m.evidence), reasons: pj(m.reasons) }));
    const verified = models.find((m) => m.status === 'VERIFIED');
    const active = jobs.find((jb) => ['QUEUED', 'WAITING_FOR_GPU', 'STARTING', 'RUNNING', 'PAUSED', 'BLOCKED'].includes(jb.status));
    const status = verified ? 'COMPLETE' : active ? active.status : jobs[0]?.status === 'FAILED' ? 'FAILED' : latest ? 'NOT_TRAINED' : 'NOT_IMPORTED';
    sendJson(res, 200, { nick48_status: status, imports, latest_import: latest ? publicImport(latest) : null, integrity, jobs, models });
  });

  r.post('/api/projects/:id/nick48/preflight', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'read');
    rateLimit(`preflight:${user.id}`, 60, 3600_000);
    const b = await readJson(req);
    const imp = getImport(project, b.import_id || null);
    sendJson(res, 200, { preflight: await preflight(project, imp, b.config || {}) });
  });

  r.post('/api/projects/:id/nick48/train', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'jobs:write' });
    const b = await readJson(req);
    const imp = getImport(project, b.import_id || null);
    const overrides = b.config && typeof b.config === 'object' ? b.config : null;
    const pf = await preflight(project, imp, overrides || {});
    if (pf.status === 'BLOCKED') throw conflict(`Preflight BLOCKED: ${pf.reasons.join('; ')}`, 'preflight_blocked');
    const priority = int(b.priority, 'priority', { min: 0, max: 10, def: 5 });
    const prep = createJob({ project, user, type: 'training.prepare', name: 'Nick 4.8 — dataset build & validation (CPU)', spec: { import_id: imp.id, config: overrides }, priority, timeoutS: 1800 });
    const train = createJob({ project, user, type: 'training.qlora', name: 'Nick 4.8 — QLoRA training (free GPU)', spec: { import_id: imp.id, config: overrides },
      requirements: { depends_on: [prep.job.id], min_vram_gb: pf.required_vram_gb }, priority, timeoutS: int(b.timeout_s, 'timeout_s', { min: 600, max: 172800, def: 43200 }), maxAttempts: 2 });
    sendJson(res, 201, { preflight_status: pf.status, message: pf.status === 'WAITING_FOR_GPU' ? 'NO FREE GPU AVAILABLE — jobs queued and preserved; training starts when an eligible free GPU is available' : 'Jobs queued',
      jobs: [publicJob(prep.job), publicJob(train.job)], preflight: pf });
  });

  r.post('/api/projects/:id/training/validate', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'read');
    const b = await readJson(req);
    let base;
    try { base = getImport(project, b.import_id || null).manifest.config; } catch { base = null; }
    if (!base) throw bad('Import the Approx-Ai pipeline first: its config is the template for training configs', 'no_import');
    const cfg = toPipelineConfig(base, b.config || {});
    const v = validateTrainingConfig(cfg, { gpu: b.gpu || null });
    const est = estimateVram(cfg);
    sendJson(res, 200, { validation: v, memory: { ...est, required_vram_gb: Math.max(PIPELINE_MIN_VRAM_GB, est.estimate_gb ? Math.ceil(est.estimate_gb * 1.15) : 0) } });
  });

  // Manual providers (e.g. Colab): user uploads the pipeline output folder; NEBIUS verifies it independently.
  r.post('/api/projects/:id/training/evidence', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write');
    const b = await readJson(req);
    const folderId = str(b.folder_id, 'folder_id', { max: 60 });
    if (!one('SELECT id FROM folders WHERE id = ? AND project_id = ? AND deleted_at IS NULL', folderId, project.id)) throw notFound('Folder not found');
    let imp = null; try { imp = getImport(project, b.import_id || null); } catch { /* evidence can be checked without an import */ }
    const { result, artifact } = await evaluateUploadedEvidence(project, user, folderId, imp);
    sendJson(res, 200, { status: result.status, reasons: result.reasons, evidence: result.evidence, artifact });
  });

  r.get('/api/projects/:id/models', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'read', { scope: 'projects:read' });
    sendJson(res, 200, { models: all('SELECT * FROM model_artifacts WHERE project_id = ? ORDER BY created_at DESC', project.id).map((m) => ({ ...m, evidence: pj(m.evidence), reasons: pj(m.reasons) })) });
  });

  r.get('/api/projects/:id/nick48/manual-run', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'read');
    const imp = getImport(project, null);
    sendJson(res, 200, {
      provider: 'google-colab-free (manual)',
      notebook: 'training/colab/nick_4_8_qlora_colab.ipynb', commit: imp.commit_sha,
      steps: [
        'Open the notebook in Colab: File → Open notebook → GitHub → umer630/Approx-Ai (use the commit shown above).',
        'Runtime → Change runtime type → T4 GPU (free tier; availability is not guaranteed).',
        'Run all. Cells before training are checks only; training starts only if the notebook prints TRAINING_READY: YES.',
        'When it prints NICK 4.8 TRAINING STATUS: COMPLETE, download MyDrive/ApproxAI/Nick_4_8/ (adapter/, evaluation/, metadata/, SHA256SUMS, the .tar.gz).',
        'Upload that folder into this project (Files), then use “Verify uploaded evidence”. NEBIUS re-hashes every file and inspects the adapter before accepting it.',
      ],
      note: 'NEBIUS cannot start, monitor or bill Colab sessions. Nothing is reported as trained until the uploaded evidence passes verification.',
    });
  });
}
