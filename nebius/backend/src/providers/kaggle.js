// Kaggle adapter. Delegates to the existing, tested Approx-Ai runner (training/kaggle/kaggle_runner.py, official
// kagglesdk) instead of re-implementing Kaggle's API. Credentials: KAGGLE_API_TOKEN in the server environment
// (never stored by NEBIUS, never returned by the API). Kaggle exposes no remaining-quota API, so GPU availability
// is unknown until the notebook's own preflight confirms the GPU.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { one } from '../db.js';
import { execText } from '../exec.js';

function runnerPath() {
  if (config.providers.kaggleRunner) return config.providers.kaggleRunner;
  const imp = one("SELECT local_path FROM source_imports WHERE kind = 'approx-nick48' AND status = 'IMPORTED' ORDER BY created_at DESC LIMIT 1");
  const p = imp ? path.join(imp.local_path, 'training/kaggle/kaggle_runner.py') : '';
  return p && fs.existsSync(p) ? p : '';
}
async function runner(args, timeoutMs = 60_000) {
  const r = await execText(config.providers.pythonBin, [runnerPath(), ...args], timeoutMs);
  let json = null;
  for (const line of r.stdout.trim().split('\n').reverse()) { try { json = JSON.parse(line); break; } catch { /* keep looking */ } }
  if (!json) { try { json = JSON.parse(r.stdout); } catch { /* not json */ } }
  return { ...r, json };
}

export class KaggleAdapter {
  constructor(id) { this.id = id; this.supportsInstances = false; this.supportsBatch = true; }
  async health() {
    if (!process.env.KAGGLE_API_TOKEN) return { status: 'unconfigured', detail: 'KAGGLE_API_TOKEN is not set on the server' };
    if (!process.env.KAGGLE_USERNAME) return { status: 'unconfigured', detail: 'KAGGLE_USERNAME is not set on the server' };
    if (!runnerPath()) return { status: 'unconfigured', detail: 'kaggle_runner.py not found — import the Approx-Ai repository (Nick 4.8) or set NEBIUS_KAGGLE_RUNNER' };
    const r = await runner(['whoami'], 45_000);
    if (r.code === 0 && r.json?.authenticated) return { status: 'healthy', detail: `authenticated; GPU quota/availability not exposed by Kaggle API` };
    return { status: 'unreachable', detail: (r.stderr || r.stdout).trim().split('\n').slice(-1)[0]?.slice(0, 300) || 'runner failed' };
  }
  async resources() { return []; } // not observable via API; see catalog offering + runtime preflight
  slug(job) { return `${process.env.KAGGLE_USERNAME}/nebius-nick48-${job.id.slice(-10).toLowerCase()}`; }
  async submit({ job, workspace, log }) {
    const nb = path.join(workspace, 'training/kaggle/nick_4_8_qlora.ipynb');
    if (!fs.existsSync(nb)) throw new Error('Kaggle notebook not found in workspace');
    const slug = this.slug(job);
    const r = await runner(['push', '--notebook', nb, '--slug', slug, '--title', `NEBIUS Nick 4.8 ${job.id.slice(-10)}`, '--gpu', '--internet', '--timeout', String(Math.min(job.timeout_s, 43200))], 120_000);
    log(`[kaggle] push → ${JSON.stringify(r.json || r.stderr.slice(0, 300))}`);
    if (r.code !== 0) throw new Error(`Kaggle push failed: ${(r.json?.error || r.stderr).slice(0, 300)}`);
    return { ref: slug, url: r.json?.url };
  }
  async poll(ref) {
    const r = await runner(['status', '--slug', ref], 60_000);
    if (r.code !== 0 || !r.json) return { state: 'POLL_ERROR', detail: r.stderr.slice(0, 200) };
    const s = r.json.status;
    const state = s === 'COMPLETE' ? 'COMPLETE' : s === 'ERROR' ? 'FAILED' : /CANCEL/.test(s) ? 'CANCELLED' : 'RUNNING';
    return { state, detail: `${s}${r.json.failure_message ? ': ' + r.json.failure_message : ''}` };
  }
  async cancel() { return { ok: false, detail: 'Kaggle sessions cannot be cancelled through the runner API; the session stops at its timeout or can be stopped on kaggle.com.' }; }
  async fetchOutputs(ref, dest) {
    const r = await runner(['output', '--slug', ref, '--dest', dest], 3600_000);
    if (r.code !== 0) throw new Error(`Kaggle output download failed: ${r.stderr.slice(0, 300)}`);
    return { dir: dest, listing: r.json };
  }
}
