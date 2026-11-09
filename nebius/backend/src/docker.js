// Thin, argument-array (never shell-string) wrapper around the docker CLI. Used for sandboxed CPU instances,
// terminal sessions, isolated CPU jobs and per-project notebook servers. Nothing user-supplied is ever
// interpolated into a shell on the host: user commands run *inside* containers via `docker exec … sh -c`.
import { execFile, spawn } from 'node:child_process';
import { config } from './config.js';

export function docker(args, { timeoutMs = 60_000, input } = {}) {
  return new Promise((resolve) => {
    const child = execFile(config.docker.bin, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout), stderr: String(stderr), timedOut: !!err?.killed });
    });
    if (input !== undefined) { child.stdin.end(input); }
  });
}

let cached = { at: 0, ok: false, detail: '' };
export async function dockerAvailable() {
  if (!config.docker.enabled) return { ok: false, detail: 'disabled by NEBIUS_DOCKER=0' };
  if (Date.now() - cached.at < 30_000) return cached;
  const r = await docker(['version', '--format', '{{.Server.Version}}'], { timeoutMs: 8000 });
  cached = { at: Date.now(), ok: r.code === 0, detail: r.code === 0 ? `docker ${r.stdout.trim()}` : (r.stderr.trim().split('\n')[0] || 'docker daemon unreachable').slice(0, 200) };
  return cached;
}

// Hardened defaults for every NEBIUS-managed container.
export function hardenedRunArgs({ name, labels = {}, memory, cpus, pids, network = 'none', readOnly = true, tmpfsSize = '64m', user = '1000:1000' }) {
  const args = ['run', '-d', '--name', name, '--network', network, '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--pids-limit', String(pids), '--memory', memory, '--memory-swap', memory, '--cpus', String(cpus), '--user', user,
    '--tmpfs', `/tmp:rw,nosuid,nodev,size=${tmpfsSize}`, '--tmpfs', `/workspace:rw,nosuid,nodev,size=${tmpfsSize},uid=1000,gid=1000`, '--workdir', '/workspace'];
  if (readOnly) args.push('--read-only');
  for (const [k, v] of Object.entries(labels)) args.push('--label', `${k}=${v}`);
  return args;
}

export async function inspect(name) {
  const r = await docker(['inspect', '--format', '{{json .State}}', name], { timeoutMs: 10_000 });
  if (r.code !== 0) return { exists: false, error: r.stderr.trim().slice(0, 200) };
  try { return { exists: true, state: JSON.parse(r.stdout) }; } catch { return { exists: false, error: 'unparseable inspect output' }; }
}

/** Run a command inside a container, streaming output to onData; returns { code, timedOut }. */
export function execStream(container, cmd, { timeoutMs = 60_000, onData = () => {}, signal } = {}) {
  return new Promise((resolve) => {
    const child = spawn(config.docker.bin, ['exec', container, 'sh', '-c', cmd], { stdio: ['ignore', 'pipe', 'pipe'] });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    const onAbort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (d) => onData(String(d)));
    child.stderr.on('data', (d) => onData(String(d)));
    child.on('close', (code) => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolve({ code: code ?? 137, timedOut }); });
    child.on('error', (e) => { clearTimeout(timer); onData(`[nebius] exec error: ${e.message}\n`); resolve({ code: 127, timedOut }); });
  });
}

export async function imagePresent(image) {
  return (await docker(['image', 'inspect', image], { timeoutMs: 10_000 })).code === 0;
}
export async function ensureImage(image, timeoutMs = 300_000) {
  if (await imagePresent(image)) return { ok: true };
  const r = await docker(['pull', '-q', image], { timeoutMs });
  return r.code === 0 ? { ok: true } : { ok: false, detail: r.stderr.trim().slice(0, 300) };
}
