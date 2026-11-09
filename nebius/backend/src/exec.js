import { execFile } from 'node:child_process';
// Run a binary with an argument array (no shell). Resolves with exit code + output; never throws.
export function execText(bin, args, timeoutMs = 15_000, opts = {}) {
  return new Promise((resolve) => execFile(bin, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout, stderr) =>
    resolve({ code: err ? (typeof err.code === 'number' ? err.code : 127) : 0, stdout: String(stdout), stderr: String(stderr || (err && !stderr ? err.message : '') || ''), timedOut: !!err?.killed })));
}
