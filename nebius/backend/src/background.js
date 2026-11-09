// Periodic maintenance: provider health checks, instance state reconciliation, terminal/notebook reaping, temp cleanup.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { checkAllHealth } from './providers/index.js';
import { reconcileAll } from './compute.js';
import { reapTerminals } from './routes/terminal.js';
import { shutdownIdleNotebooks } from './routes/notebooks.js';

const timers = [];
function every(ms, fn) { const go = async () => { try { await fn(); } catch (e) { console.error('[background]', e.message); } }; go(); timers.push(setInterval(go, ms)); }
function cleanTmp() {
  const d = path.join(config.dataDir, 'tmp');
  if (!fs.existsSync(d)) return;
  for (const f of fs.readdirSync(d)) { const p = path.join(d, f); try { if (Date.now() - fs.statSync(p).mtimeMs > 6 * 3600_000) fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ } }
}
export function startBackgroundTasks() {
  every(config.providers.healthIntervalSec * 1000, checkAllHealth);
  every(60_000, reconcileAll);
  every(60_000, reapTerminals);
  every(5 * 60_000, () => shutdownIdleNotebooks());
  every(3600_000, cleanTmp);
}
export function stopBackgroundTasks() { while (timers.length) clearInterval(timers.pop()); }
