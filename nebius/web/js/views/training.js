import { get, post } from '../api.js';
import { h, card, table, badge, fmtTime, ago, btn, toast, errMsg, formDialog, kv, modal } from '../ui.js';
import { needProject, go, render } from '../app.js';

const check = (ok) => badge(ok ? 'pass' : 'fail');
function preflightCard(pf) {
  const c = pf.checks;
  return card(`Preflight — ${pf.status}`, h('div.banner', { class: pf.status === 'READY' ? 'ok' : 'warn' }, pf.status === 'WAITING_FOR_GPU' ? 'NO FREE GPU AVAILABLE — everything else is ready; a training job will wait for an eligible free GPU.' : pf.status === 'READY' ? 'Ready to train.' : `BLOCKED: ${pf.reasons.join('; ')}`),
    table([{ label: 'Check', key: 'k' }, { label: 'Result', render: (r) => check(r.ok) }, { label: 'Detail', key: 'd' }], [
      { k: 'Repository & integrity', ok: c.repository.ok, d: c.repository.problems.join('; ') || `commit ${pf.commit.slice(0, 12)}` },
      { k: 'Training config', ok: c.config.ok, d: [...c.config.errors, ...c.config.warnings].join('; ') || 'valid' },
      { k: 'Dataset', ok: c.dataset.ok, d: `${c.dataset.approved_records} approved records${c.dataset.production_ready ? '' : ' — NOT production-ready (pipeline threshold 20,000)'}` },
      { k: 'Base model (Hugging Face)', ok: c.base_model.ok, d: c.base_model.ok ? `${c.base_model.model_id} @ ${c.base_model.resolved_sha?.slice(0, 12)} · license ${c.base_model.license || '?'} · ${c.base_model.parameters ? (c.base_model.parameters / 1e9).toFixed(2) + 'B params' : ''}` : c.base_model.error },
      { k: 'GPU memory', ok: true, d: `estimate ${c.memory.estimate_gb ?? '?'} GB → requires ≥ ${c.memory.required_vram_gb} GB (pipeline minimum ${c.memory.pipeline_minimum_gb} GB). ${c.memory.note || ''}` },
      { k: 'Free GPU', ok: c.gpu.ok, d: c.gpu.ok ? `${c.gpu.provider}: ${c.gpu.gpu?.name} (${c.gpu.gpu_source})` : `${c.gpu.message}: ${c.gpu.reasons.join('; ')}` },
    ]));
}
function lossChart(points) {
  if (!points.length) return h('p.muted', {}, 'No training metrics reported yet (loss appears here from real trainer logs only).');
  const W = 600; const H = 160; const ys = points.map((p) => p.loss); const min = Math.min(...ys); const max = Math.max(...ys);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'chart'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Training loss from ${ys[0]} to ${ys.at(-1)}`);
  const path = document.createElementNS(ns, 'polyline');
  path.setAttribute('points', points.map((p, i) => `${(i / Math.max(1, points.length - 1)) * (W - 20) + 10},${H - 10 - ((p.loss - min) / (max - min || 1)) * (H - 20)}`).join(' '));
  path.setAttribute('class', 'line'); svg.append(path);
  return h('div', {}, svg, h('small.muted', {}, `${points.length} points · last loss ${ys.at(-1)} at epoch ${points.at(-1).epoch}`));
}

export async function trainingView() {
  const project = needProject('AI Training');
  const s = await get(`/api/projects/${project.id}/nick48`);
  const imp = s.latest_import;
  const out = h('div', { id: 'pf' });
  const doImport = async () => { toast('Importing Approx-Ai repository (read-only)…'); try { await post(`/api/projects/${project.id}/nick48/import`, {}); render(); } catch (e) { toast(errMsg(e), 'error'); } };
  const runPreflight = async (cfg = {}) => { out.replaceChildren(h('p.muted', {}, 'Running preflight (repository, config, dataset, Hugging Face, GPU)…')); try { const r = await post(`/api/projects/${project.id}/nick48/preflight`, { config: cfg }); out.replaceChildren(preflightCard(r.preflight)); } catch (e) { out.replaceChildren(h('p.error', {}, errMsg(e))); } };
  const cfgForm = async () => {
    const c = imp.manifest.config; const t = c.train;
    const v = await formDialog('Training configuration (overrides)', [
      { name: 'base_model', label: 'Base model', value: c.base_model }, { name: 'base_model_revision', label: 'Model revision (empty = latest, recorded)', value: c.base_model_revision || '' },
      { name: 'per_device_batch_size', label: 'Batch size', type: 'number', value: t.per_device_batch_size }, { name: 'gradient_accumulation_steps', label: 'Gradient accumulation', type: 'number', value: t.gradient_accumulation_steps },
      { name: 'learning_rate', label: 'Learning rate', type: 'number', step: 'any', value: t.learning_rate }, { name: 'epochs', label: 'Epochs', type: 'number', step: 'any', value: t.epochs },
      { name: 'max_seq_length', label: 'Sequence length', type: 'number', value: c.max_seq_length }, { name: 'r', label: 'LoRA rank', type: 'number', value: c.lora.r }, { name: 'alpha', label: 'LoRA alpha', type: 'number', value: c.lora.alpha },
      { name: 'dropout', label: 'LoRA dropout', type: 'number', step: 'any', value: c.lora.dropout }, { name: 'quant', label: 'Quantization', type: 'select', options: ['nf4', 'fp4'], value: c.quantization.bnb_4bit_quant_type },
      { name: 'checkpoints_per_epoch', label: 'Checkpoints per epoch', type: 'number', value: t.checkpoints_per_epoch }, { name: 'output_dir', label: 'Output directory', value: c.output_dir }], 'Validate');
    if (!v) return null;
    return { base_model: v.base_model, base_model_revision: v.base_model_revision || null, per_device_batch_size: +v.per_device_batch_size, gradient_accumulation_steps: +v.gradient_accumulation_steps, learning_rate: +v.learning_rate, epochs: +v.epochs, max_seq_length: +v.max_seq_length,
      lora: { r: +v.r, alpha: +v.alpha, dropout: +v.dropout }, quantization: { bnb_4bit_quant_type: v.quant }, checkpoints_per_epoch: +v.checkpoints_per_epoch, output_dir: v.output_dir };
  };
  const startTraining = async (cfg = null) => {
    try { const r = await post(`/api/projects/${project.id}/nick48/train`, { config: cfg }); toast(r.message); out.replaceChildren(preflightCard(r.preflight)); setTimeout(render, 600); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const verifyUpload = async () => {
    const browse = await get(`/api/projects/${project.id}/browse`);
    const v = await formDialog('Verify uploaded evidence', [{ name: 'folder_id', label: 'Folder containing the pipeline output (top level of this project)', type: 'select', options: browse.folders.map((f) => ({ value: f.id, label: f.name })) }], 'Verify');
    if (!v) return;
    try { const r = await post(`/api/projects/${project.id}/training/evidence`, { folder_id: v.folder_id }); await modal(`Evidence ${r.status}`, h('div', {}, r.reasons.length ? h('ul', {}, r.reasons.map((x) => h('li', {}, x))) : h('p', {}, 'All evidence checks passed.'), kv(Object.entries(r.evidence).map(([k, x]) => [k, check(x)])))); render(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const manual = async () => { const m = await get(`/api/projects/${project.id}/nick48/manual-run`); await modal('Run on Google Colab (manual, free tier)', h('div', {}, h('p', {}, `Notebook ${m.notebook} @ ${m.commit.slice(0, 12)}`), h('ol', {}, m.steps.map((x) => h('li', {}, x))), h('p.muted', {}, m.note))); };
  const active = s.jobs.find((j) => j.type === 'training.qlora');
  let metrics = null;
  if (active) metrics = await get(`/api/projects/${project.id}/jobs/${active.id}/metrics`);
  return h('div.page', {},
    h('div.page-head', {}, h('h1', {}, 'AI Training · Nick 4.8'), badge(s.nick48_status)),
    card('Status', h('p', {}, {
      NOT_IMPORTED: 'The Approx AI Nick 4.8 pipeline is not imported into this project yet.', NOT_TRAINED: 'Pipeline imported. Nick 4.8 has NOT been trained in this project.',
      WAITING_FOR_GPU: 'Training is queued and waiting: NO FREE GPU AVAILABLE. Nothing has been trained.', COMPLETE: 'A Nick 4.8 adapter passed evidence verification.', FAILED: 'The last training attempt failed or did not pass verification. Nothing is reported as trained.',
    }[s.nick48_status] || `Training job is ${s.nick48_status}.`),
    h('div.row', {}, btn(imp ? 'Re-import (new snapshot)' : 'Import Approx-Ai pipeline', doImport, imp ? 'ghost' : 'primary'), imp ? [btn('Run preflight', () => runPreflight()), btn('Configure & validate…', async () => { const c = await cfgForm(); if (c) runPreflight(c); }),
      btn('Start training', () => startTraining(), 'primary'), btn('Manual run on Colab…', manual), btn('Verify uploaded evidence…', verifyUpload)] : null)),
    out,
    imp ? card('Imported pipeline (read-only)', kv([['Source', imp.repo_url], ['Commit', h('code', {}, imp.commit_sha)], ['Status', badge(imp.status)], ['Integrity', s.integrity?.ok ? badge('verified') : h('span', {}, badge('modified'), ` ${s.integrity?.changed.join(', ')}`)],
      ['Base model', imp.manifest.config?.base_model], ['Method', `QLoRA ${imp.manifest.config?.quantization?.bnb_4bit_quant_type} · LoRA r${imp.manifest.config?.lora?.r}/α${imp.manifest.config?.lora?.alpha}`], ['Dataset', imp.manifest.dataset_note || `${imp.manifest.approved_records} approved records`], ['Imported', fmtTime(imp.created_at)]]),
    h('details', {}, h('summary', {}, 'Pipeline file hashes (SHA-256)'), table([{ label: 'File', key: 'f' }, { label: 'SHA-256', render: (r) => h('code', {}, r.sha256) }], Object.entries(imp.manifest.files).map(([f, x]) => ({ f, ...x }))))) : null,
    active ? card(`Training progress — ${active.name}`, lossChart(metrics.points), h('small.muted', {}, metrics.source)) : null,
    card('Training jobs', table([{ label: 'Job', key: 'name' }, { label: 'Status', render: (j) => badge(j.status) }, { label: 'Provider', render: (j) => j.provider_id || '—' }, { label: 'Note', render: (j) => j.blocked_reason || j.error || '' }, { label: 'Created', render: (j) => ago(j.created_at) }], s.jobs, { empty: 'No training jobs yet.', onRow: (j) => go(`#/jobs/${project.id}/${j.id}`) })),
    card('Model artifacts (evidence-verified only)', table([{ label: 'Model', key: 'name' }, { label: 'Status', render: (m) => badge(m.status) }, { label: 'Adapter SHA-256', render: (m) => (m.sha256 ? h('code', {}, m.sha256.slice(0, 16) + '…') : '—') }, { label: 'Reasons', render: (m) => (m.reasons || []).join('; ') || '—' }, { label: 'When', render: (m) => fmtTime(m.created_at) }], s.models, { empty: 'No model artifacts. A model appears here only after its evidence is verified.' })));
}
