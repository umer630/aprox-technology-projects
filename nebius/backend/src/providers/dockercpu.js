// Local Docker CPU sandbox provider: real containers with hard limits. CPU only — never presented as a GPU.
import os from 'node:os';
import { config } from '../config.js';
import { docker, dockerAvailable, hardenedRunArgs, inspect, ensureImage } from '../docker.js';

export const MACHINE_TYPES = {
  'cpu-micro': { cpus: 0.25, ram_mb: 256, disk_gb: 1 },
  'cpu-small': { cpus: 0.5, ram_mb: 512, disk_gb: 1 },
  'cpu-medium': { cpus: 1, ram_mb: 1024, disk_gb: 2 },
  'cpu-large': { cpus: 2, ram_mb: 2048, disk_gb: 4 },
};

export class DockerCpuAdapter {
  constructor(id) { this.id = id; this.supportsInstances = true; this.supportsBatch = false; }
  async health() {
    const d = await dockerAvailable();
    return d.ok ? { status: 'healthy', detail: d.detail } : { status: 'unavailable', detail: d.detail };
  }
  async resources() { return []; } // CPU provider: no GPU resources, by definition
  machineTypes() {
    const hostCpus = os.cpus().length; const hostMem = os.totalmem() / 1048576;
    return Object.entries(MACHINE_TYPES).filter(([, m]) => m.cpus <= hostCpus && m.ram_mb <= hostMem / 2).map(([id, m]) => ({ id, ...m, gpu: null }));
  }
  containerName(inst) { return `nebius-inst-${inst.id}`; }
  async create(inst) {
    const mt = MACHINE_TYPES[inst.machine_type];
    const img = await ensureImage(inst.image);
    if (!img.ok) return { ok: false, error: `image unavailable: ${img.detail}` };
    const args = hardenedRunArgs({ name: this.containerName(inst), labels: { 'nebius.instance': inst.id, 'nebius.project': inst.project_id }, memory: `${mt.ram_mb}m`, cpus: mt.cpus, pids: 256, tmpfsSize: `${mt.disk_gb * 1024}m` });
    args.push(inst.image, 'sleep', 'infinity');
    const r = await docker(args, { timeoutMs: 120_000 });
    if (r.code !== 0) return { ok: false, error: r.stderr.trim().slice(0, 300) };
    return { ok: true, ref: r.stdout.trim().slice(0, 64) };
  }
  async start(inst) { const r = await docker(['start', this.containerName(inst)]); return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim().slice(0, 300) }; }
  async stop(inst) { const r = await docker(['stop', '-t', '10', this.containerName(inst)], { timeoutMs: 30_000 }); return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim().slice(0, 300) }; }
  async restart(inst) { const r = await docker(['restart', '-t', '10', this.containerName(inst)], { timeoutMs: 40_000 }); return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim().slice(0, 300) }; }
  async remove(inst) { const r = await docker(['rm', '-f', this.containerName(inst)], { timeoutMs: 30_000 }); return r.code === 0 || /No such container/i.test(r.stderr) ? { ok: true } : { ok: false, error: r.stderr.trim().slice(0, 300) }; }
  /** Real state from the Docker daemon. Maps to NEBIUS states; RUNNING only if docker says running. */
  async observe(inst) {
    const i = await inspect(this.containerName(inst));
    if (!i.exists) return { status: 'UNAVAILABLE', detail: 'container not found on host' };
    const s = i.state;
    if (s.Running && !s.Paused) return { status: 'RUNNING', detail: `running since ${s.StartedAt}`, pid: s.Pid };
    if (s.Status === 'created') return { status: 'PROVISIONING', detail: 'created' };
    if (s.Status === 'exited' && s.ExitCode !== 0 && s.ExitCode !== 137 && s.ExitCode !== 143) return { status: 'FAILED', detail: `exited with code ${s.ExitCode}${s.OOMKilled ? ' (OOM killed)' : ''}` };
    return { status: 'STOPPED', detail: `${s.Status} (exit ${s.ExitCode})` };
  }
  async stats(inst) {
    const r = await docker(['stats', '--no-stream', '--format', '{{json .}}', this.containerName(inst)], { timeoutMs: 15_000 });
    if (r.code !== 0) return null;
    try { const s = JSON.parse(r.stdout); return { cpu_pct: parseFloat(s.CPUPerc), mem_usage: s.MemUsage, mem_pct: parseFloat(s.MemPerc), net_io: s.NetIO, block_io: s.BlockIO, pids: Number(s.PIDs) }; } catch { return null; }
  }
}
void config;
