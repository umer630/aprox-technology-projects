// Self-hosted NVIDIA GPU on the NEBIUS host. Everything is detected from nvidia-smi — nothing is assumed.
// Batch jobs run the existing Approx-Ai pipeline stages (kaggle/kaggle_pipeline.py, which also works off-Kaggle
// with APPROX_OUTPUT_DIR) as local processes from the job's private workspace copy.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { execText } from '../exec.js';

const runs = new Map(); // ref → { child, state, stage, code }

export async function nvidiaSmi() {
  const q = await execText(config.providers.nvidiaSmi, ['--query-gpu=name,memory.total,memory.used,utilization.gpu,driver_version,compute_cap', '--format=csv,noheader,nounits'], 15_000);
  if (q.code !== 0) return { ok: false, detail: (q.stderr || 'nvidia-smi not found').trim().split('\n')[0].slice(0, 200) };
  const header = await execText(config.providers.nvidiaSmi, [], 15_000);
  const cuda = /CUDA Version:\s*([\d.]+)/.exec(header.stdout)?.[1] || null;
  const gpus = q.stdout.trim().split('\n').filter(Boolean).map((line) => {
    const [name, total, used, util, driver, cap] = line.split(',').map((s) => s.trim());
    return { name, vram_mb: Number(total), memory_used_mb: Number(used), utilization_pct: Number(util), driver_version: driver, cuda_capability: cap, cuda_version: cuda, source: 'nvidia-smi' };
  });
  return { ok: gpus.length > 0, gpus, detail: gpus.length ? `${gpus.length} GPU(s)` : 'nvidia-smi reported no GPUs' };
}

export class LocalNvidiaAdapter {
  constructor(id) { this.id = id; this.supportsInstances = false; this.supportsBatch = true; }
  async health() {
    const r = await nvidiaSmi();
    return r.ok ? { status: 'healthy', detail: r.detail } : { status: 'unavailable', detail: r.detail };
  }
  async resources() { const r = await nvidiaSmi(); return r.ok ? r.gpus : []; }

  async submit({ job, workspace, outputDir, log }) {
    const ref = `local-${job.id}`;
    const stages = ['preflight', 'data', 'train', 'verify', 'package', 'status'];
    const st = { state: 'RUNNING', stage: null, code: null, child: null };
    runs.set(ref, st);
    const env = { ...process.env, APPROX_OUTPUT_DIR: outputDir, CUDA_VISIBLE_DEVICES: process.env.CUDA_VISIBLE_DEVICES || '0' };
    (async () => {
      for (const stage of stages) {
        if (st.state === 'CANCELLED') return;
        st.stage = stage;
        log(`[local-nvidia] stage ${stage}`);
        const code = await new Promise((resolve) => {
          const child = spawn(config.providers.pythonBin, ['kaggle/kaggle_pipeline.py', stage], { cwd: path.join(workspace, 'training'), env });
          st.child = child;
          child.stdout.on('data', (d) => log(String(d)));
          child.stderr.on('data', (d) => log(String(d)));
          child.on('close', (c) => resolve(c ?? 1));
          child.on('error', (e) => { log(`spawn error: ${e.message}`); resolve(127); });
        });
        if (code !== 0) { st.state = st.state === 'CANCELLED' ? 'CANCELLED' : 'FAILED'; st.code = code; return; }
      }
      st.state = 'COMPLETE';
    })();
    return { ref };
  }
  async poll(ref) { const s = runs.get(ref); return s ? { state: s.state, detail: s.stage ? `stage ${s.stage}${s.code !== null ? ` exit ${s.code}` : ''}` : '' } : { state: 'LOST', detail: 'process not tracked (server restarted)' }; }
  async cancel(ref) { const s = runs.get(ref); if (s) { s.state = 'CANCELLED'; s.child?.kill('SIGTERM'); } return { ok: true }; }
  async fetchOutputs(ref, dest, { outputDir }) { return { dir: fs.existsSync(outputDir) ? outputDir : dest }; }
}
