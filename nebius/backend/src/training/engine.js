// Training configuration validation, GPU-memory estimation and base-model validation.
// Estimates are labelled as estimates; the GPU-side pipeline preflight remains the source of truth.
import { config } from '../config.js';

const RANGES = {
  per_device_batch_size: [1, 64, true],
  gradient_accumulation_steps: [1, 512, true],
  learning_rate: [1e-7, 1e-2, false],
  epochs: [0.1, 50, false],
  max_seq_length: [128, 32768, true],
  'lora.r': [1, 512, true],
  'lora.alpha': [1, 1024, true],
  'lora.dropout': [0, 0.5, false],
  checkpoints_per_epoch: [1, 100, true],
  warmup_ratio: [0, 0.5, false],
};
const get = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);

/**
 * Normalise a UI/API training config (flat-ish) into the Approx pipeline config schema
 * (training/configs/nick-4.8-qlora.json) so the existing train_qlora.py can consume it unchanged.
 */
export function toPipelineConfig(base, overrides = {}) {
  const c = JSON.parse(JSON.stringify(base));
  const o = overrides || {};
  if (o.base_model !== undefined) c.base_model = o.base_model;
  if (o.base_model_revision !== undefined) c.base_model_revision = o.base_model_revision || null;
  if (o.max_seq_length !== undefined) c.max_seq_length = o.max_seq_length;
  if (o.output_dir !== undefined) c.output_dir = o.output_dir;
  c.lora = { ...c.lora, ...(o.lora || {}) };
  c.quantization = { ...c.quantization, ...(o.quantization || {}) };
  const t = c.train || (c.train = {});
  for (const k of ['per_device_batch_size', 'gradient_accumulation_steps', 'learning_rate', 'epochs', 'checkpoints_per_epoch', 'warmup_ratio', 'save_total_limit']) if (o[k] !== undefined) t[k] = o[k];
  return c;
}

/** Flatten a pipeline config for validation/display. */
export function flatten(c) {
  return {
    base_model: c.base_model, base_model_revision: c.base_model_revision ?? null, max_seq_length: c.max_seq_length, output_dir: c.output_dir,
    per_device_batch_size: c.train?.per_device_batch_size, gradient_accumulation_steps: c.train?.gradient_accumulation_steps,
    learning_rate: c.train?.learning_rate, epochs: c.train?.epochs, checkpoints_per_epoch: c.train?.checkpoints_per_epoch, warmup_ratio: c.train?.warmup_ratio,
    lora: c.lora, quantization: c.quantization,
  };
}

export function validateTrainingConfig(c, { gpu = null } = {}) {
  const errors = []; const warnings = [];
  const f = flatten(c);
  if (typeof f.base_model !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(f.base_model)) errors.push('base_model must be a Hugging Face model id like "org/name"');
  if (f.base_model_revision !== null && !(typeof f.base_model_revision === 'string' && /^[\w.-]{1,64}$/.test(f.base_model_revision))) errors.push('base_model_revision must be null or a branch/tag/commit');
  for (const [k, [min, max, isInt]] of Object.entries(RANGES)) {
    const v = get(f, k);
    if (v === undefined || v === null) { if (!['warmup_ratio'].includes(k)) errors.push(`${k} is required`); continue; }
    if (typeof v !== 'number' || !Number.isFinite(v)) { errors.push(`${k} must be a number`); continue; }
    if (isInt && !Number.isInteger(v)) errors.push(`${k} must be an integer`);
    if (v < min || v > max) errors.push(`${k} must be between ${min} and ${max}`);
  }
  if (!Array.isArray(f.lora?.target_modules) || !f.lora.target_modules.length || !f.lora.target_modules.every((m) => /^[\w.]+$/.test(m))) errors.push('lora.target_modules must be a non-empty list of module names');
  const q = f.quantization || {};
  if (q.load_in_4bit !== true) warnings.push('load_in_4bit is false: this is plain LoRA, needs far more VRAM than QLoRA');
  if (q.load_in_4bit && !['nf4', 'fp4'].includes(q.bnb_4bit_quant_type)) errors.push('quantization.bnb_4bit_quant_type must be nf4 or fp4');
  if (!['bfloat16', 'float16', 'float32'].includes(q.bnb_4bit_compute_dtype)) errors.push('quantization.bnb_4bit_compute_dtype must be bfloat16, float16 or float32');
  if (typeof f.output_dir !== 'string' || !/^[\w./-]{1,200}$/.test(f.output_dir) || f.output_dir.includes('..') || f.output_dir.startsWith('/')) errors.push('output_dir must be a relative path without ".."');
  if (f.lora?.alpha && f.lora?.r && f.lora.alpha / f.lora.r > 8) warnings.push('lora.alpha / lora.r > 8 is unusually high');
  if (gpu?.cuda_capability && parseFloat(gpu.cuda_capability) < 8 && q.bnb_4bit_compute_dtype === 'bfloat16') {
    warnings.push(`GPU compute capability ${gpu.cuda_capability} has no native bf16; the pipeline falls back to fp16 compute`);
  }
  return { ok: errors.length === 0, errors, warnings, config: f };
}

// Known architectures (also fetched live from the Hub config.json when reachable).
const KNOWN = {
  'Qwen/Qwen2.5-3B-Instruct': { hidden_size: 2048, intermediate_size: 11008, num_hidden_layers: 36, num_attention_heads: 16, num_key_value_heads: 2, vocab_size: 151936, tie_word_embeddings: true, params: 3.09e9 },
};
const MODULE_DIMS = (a) => {
  const head = a.hidden_size / a.num_attention_heads; const kv = (a.num_key_value_heads || a.num_attention_heads) * head;
  return { q_proj: [a.hidden_size, a.hidden_size], k_proj: [a.hidden_size, kv], v_proj: [a.hidden_size, kv], o_proj: [a.hidden_size, a.hidden_size],
    gate_proj: [a.hidden_size, a.intermediate_size], up_proj: [a.hidden_size, a.intermediate_size], down_proj: [a.intermediate_size, a.hidden_size] };
};

/**
 * Rough peak-VRAM estimate (GB) for QLoRA SFT with gradient checkpointing. Components are returned so the UI can
 * show where memory goes. This is an ESTIMATE; real usage depends on kernels, padding and allocator behaviour.
 */
export function estimateVram(c, arch) {
  const a = arch || KNOWN[c.base_model];
  if (!a) return { estimate_gb: null, note: 'architecture unknown — cannot estimate; GPU preflight will measure' };
  const f = flatten(c);
  const B = f.per_device_batch_size; const S = f.max_seq_length; const H = a.hidden_size; const L = a.num_hidden_layers; const V = a.vocab_size;
  const params = a.params || (12 * L * H * H + V * H);
  const embed = V * H * (a.tie_word_embeddings ? 1 : 2);
  const fourBit = f.quantization?.load_in_4bit !== false;
  const weights = fourBit ? (params - embed) * 0.5 * 1.06 + embed * 2 : params * 2;
  const dims = MODULE_DIMS(a);
  const loraParams = (f.lora.target_modules || []).reduce((s, m) => s + (dims[m] ? f.lora.r * (dims[m][0] + dims[m][1]) : 0), 0) * L;
  const lora = loraParams * 16; // fp32 weight + grad + 2 Adam moments
  const checkpoints = B * S * H * 2 * L;
  const layerPeak = B * S * (H * 16 + a.intermediate_size * 3) * 2;
  const logits = B * S * V * 4 * 2; // fp32 logits + grad for the loss
  const overhead = 0.8e9;
  const total = weights + lora + checkpoints + layerPeak + logits + overhead;
  const gb = (x) => Math.round((x / 1e9) * 100) / 100;
  return {
    estimate_gb: gb(total),
    components_gb: { base_weights: gb(weights), lora_and_optimizer: gb(lora), activation_checkpoints: gb(checkpoints), layer_recompute_peak: gb(layerPeak), logits_and_loss: gb(logits), cuda_context_and_fragmentation: gb(overhead) },
    trainable_lora_parameters: loraParams,
    note: 'Estimate only. QLoRA, gradient checkpointing assumed. The pipeline preflight on the GPU is authoritative.',
  };
}

export async function fetchJson(url, timeoutMs = 15_000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  if (!r.ok) return { ok: false, status: r.status };
  return { ok: true, status: r.status, json: await r.json() };
}

/** Validate a base model against the Hugging Face Hub (real network call). */
export async function validateBaseModel(modelId, revision = null) {
  const out = { model_id: modelId, requested_revision: revision, checked_at: new Date().toISOString() };
  try {
    const url = `${config.approx.hfApi}/models/${modelId}${revision ? `/revision/${encodeURIComponent(revision)}` : ''}`;
    const r = await fetchJson(url);
    if (!r.ok) return { ...out, ok: false, error: r.status === 404 ? 'model or revision not found on the Hub' : r.status === 401 ? 'model is gated/private (needs Hub token)' : `Hub returned HTTP ${r.status}` };
    const m = r.json;
    const arch = await fetchJson(`https://huggingface.co/${modelId}/resolve/${m.sha}/config.json`).catch(() => ({ ok: false }));
    const a = arch.ok ? arch.json : null;
    return {
      ...out, ok: true, resolved_sha: m.sha, gated: m.gated || false, private: !!m.private,
      license: m.cardData?.license || (m.tags || []).find((t) => t.startsWith('license:'))?.slice(8) || null,
      parameters: m.safetensors?.total || null, library: m.library_name || null, pipeline_tag: m.pipeline_tag || null,
      architecture: a ? { model_type: a.model_type, hidden_size: a.hidden_size, intermediate_size: a.intermediate_size, num_hidden_layers: a.num_hidden_layers,
        num_attention_heads: a.num_attention_heads, num_key_value_heads: a.num_key_value_heads, vocab_size: a.vocab_size, tie_word_embeddings: a.tie_word_embeddings, params: m.safetensors?.total || null } : null,
    };
  } catch (e) {
    return { ...out, ok: false, error: `Hub unreachable: ${e.message}` };
  }
}
