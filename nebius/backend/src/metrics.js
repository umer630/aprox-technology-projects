// Real host/runtime measurements only. Anything we cannot measure is returned as { available: false, reason }.
import os from 'node:os';
import fs from 'node:fs';
import { config } from './config.js';
import { nvidiaSmi } from './providers/localnvidia.js';

function cpuTimes() { return os.cpus().map((c) => c.times).reduce((a, t) => ({ idle: a.idle + t.idle, total: a.total + t.user + t.nice + t.sys + t.idle + t.irq }), { idle: 0, total: 0 }); }
export async function cpuUsage(sampleMs = 250) {
  const a = cpuTimes(); await new Promise((r) => setTimeout(r, sampleMs)); const b = cpuTimes();
  const total = b.total - a.total; return total > 0 ? Math.round((1 - (b.idle - a.idle) / total) * 1000) / 10 : null;
}
function netCounters() {
  try {
    const lines = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2).filter(Boolean);
    let rx = 0; let tx = 0;
    for (const l of lines) { const [iface, rest] = l.split(':'); if (iface.trim() === 'lo') continue; const f = rest.trim().split(/\s+/).map(Number); rx += f[0]; tx += f[8]; }
    return { available: true, rx_bytes_total: rx, tx_bytes_total: tx, source: '/proc/net/dev' };
  } catch { return { available: false, reason: 'network counters not available on this OS' }; }
}
export async function hostMetrics() {
  let disk;
  try { const s = fs.statfsSync(config.dataDir); disk = { available: true, total_bytes: s.blocks * s.bsize, free_bytes: s.bavail * s.bsize, used_pct: Math.round((1 - s.bavail / s.blocks) * 1000) / 10, path: 'data dir' }; }
  catch (e) { disk = { available: false, reason: e.message }; }
  const g = await nvidiaSmi();
  return {
    measured_at: new Date().toISOString(),
    cpu: { available: true, cores: os.cpus().length, usage_pct: await cpuUsage(), load_avg: os.loadavg().map((x) => Math.round(x * 100) / 100) },
    memory: { available: true, total_bytes: os.totalmem(), free_bytes: os.freemem(), used_pct: Math.round((1 - os.freemem() / os.totalmem()) * 1000) / 10 },
    disk,
    network: netCounters(),
    gpu: g.ok ? { available: true, devices: g.gpus, source: 'nvidia-smi' } : { available: false, reason: `No GPU on this host (${g.detail})` },
    uptime_sec: Math.round(os.uptime()),
  };
}
