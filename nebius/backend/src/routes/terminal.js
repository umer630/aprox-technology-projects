// Browser terminal. Each session is a dedicated hardened container (no network, no capabilities, non-root,
// read-only rootfs, tmpfs workspace, CPU/memory/PID limits). Commands are executed inside it with `docker exec`,
// streamed to the browser over SSE, stored in session history and audit-logged. The host OS is never exposed.
// Note: this is a command-at-a-time terminal (no PTY) — full-screen interactive programs are not supported.
import { one, all, run, now, newId, audit } from '../db.js';
import { readJson, sendJson, bad, notFound, conflict, unavailable, startSse, str } from '../http.js';
import { projectAccess } from '../iam.js';
import { rateLimit } from '../security.js';
import { config } from '../config.js';
import { docker, dockerAvailable, hardenedRunArgs, execStream, inspect, ensureImage } from '../docker.js';
import { onProjectDelete } from './projects.js';

const MAX_OUTPUT = 256 * 1024;
const active = new Map(); // sessionId → AbortController of the running command

async function closeSession(s, status) {
  await docker(['rm', '-f', s.container]);
  run('UPDATE terminal_sessions SET status = ?, ended_at = ? WHERE id = ?', status, now(), s.id);
}
export async function reapTerminals() {
  const t = now();
  for (const s of all("SELECT * FROM terminal_sessions WHERE status IN ('ACTIVE','STARTING') AND (expires_at < ? OR last_activity_at < ?)", t, t - config.terminal.idleTimeoutSec * 1000)) {
    await closeSession(s, 'EXPIRED');
  }
}
onProjectDelete(async (project) => { for (const s of all("SELECT * FROM terminal_sessions WHERE project_id = ? AND status = 'ACTIVE'", project.id)) await closeSession(s, 'CLOSED'); });

function getSession(project, user, id) {
  const s = one('SELECT * FROM terminal_sessions WHERE id = ? AND project_id = ? AND user_id = ?', id, project.id, user.id);
  if (!s) throw notFound('Terminal session not found');
  return s;
}

export function registerTerminalRoutes(r) {
  r.get('/api/projects/:id/terminal/sessions', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write');
    await reapTerminals();
    sendJson(res, 200, { sessions: all("SELECT id, status, created_at, last_activity_at, expires_at, ended_at FROM terminal_sessions WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 20", project.id, user.id),
      limits: { idle_timeout_sec: config.terminal.idleTimeoutSec, max_session_sec: config.terminal.maxSessionSec, command_timeout_sec: config.terminal.commandTimeoutSec, memory: config.terminal.memory, cpus: config.terminal.cpus, pids: config.terminal.pids, network: 'none' } });
  });

  r.post('/api/projects/:id/terminal/sessions', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write');
    rateLimit(`term-create:${user.id}`, 20, 3600_000);
    const d = await dockerAvailable();
    if (!d.ok) throw unavailable(`Terminal unavailable: isolated container runtime not reachable (${d.detail})`, 'terminal_unavailable');
    const open = one("SELECT COUNT(*) AS n FROM terminal_sessions WHERE user_id = ? AND status = 'ACTIVE'", user.id).n;
    if (open >= 3) throw conflict('Close an existing terminal session first (max 3 per user)', 'too_many_sessions');
    const img = await ensureImage(config.docker.sandboxImage);
    if (!img.ok) throw unavailable(`Sandbox image unavailable: ${img.detail}`, 'terminal_unavailable');
    const id = newId('trm_');
    const container = `nebius-term-${id}`;
    const t = now();
    run("INSERT INTO terminal_sessions (id,org_id,project_id,user_id,container,status,created_at,last_activity_at,expires_at) VALUES (?,?,?,?,?,'STARTING',?,?,?)", id, project.org_id, project.id, user.id, container, t, t, t + config.terminal.maxSessionSec * 1000);
    const args = hardenedRunArgs({ name: container, labels: { 'nebius.terminal': id, 'nebius.project': project.id }, memory: config.terminal.memory, cpus: config.terminal.cpus, pids: config.terminal.pids });
    args.push(config.docker.sandboxImage, 'sleep', String(config.terminal.maxSessionSec));
    const rr = await docker(args, { timeoutMs: 60_000 });
    if (rr.code !== 0) {
      run("UPDATE terminal_sessions SET status = 'FAILED', error = ?, ended_at = ? WHERE id = ?", rr.stderr.slice(0, 300), now(), id);
      throw unavailable(`Could not start sandbox: ${rr.stderr.trim().slice(0, 200)}`, 'terminal_unavailable');
    }
    run("UPDATE terminal_sessions SET status = 'ACTIVE' WHERE id = ?", id);
    audit(user.id, 'terminal.open', { orgId: project.org_id, projectId: project.id, target: id });
    sendJson(res, 201, { session: one('SELECT id, status, created_at, expires_at FROM terminal_sessions WHERE id = ?', id) });
  });

  // Reconnect: returns history so a client can restore the screen.
  r.get('/api/projects/:id/terminal/sessions/:sid', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write');
    const s = getSession(project, user, p.sid);
    const i = s.status === 'ACTIVE' ? await inspect(s.container) : null;
    if (s.status === 'ACTIVE' && !(i?.exists && i.state.Running)) { run("UPDATE terminal_sessions SET status = 'EXPIRED', ended_at = ? WHERE id = ?", now(), s.id); s.status = 'EXPIRED'; }
    sendJson(res, 200, { session: { id: s.id, status: s.status, created_at: s.created_at, expires_at: s.expires_at }, history: all('SELECT command, exit_code, output, timed_out, duration_ms, created_at FROM terminal_history WHERE session_id = ? ORDER BY created_at ASC LIMIT 500', s.id) });
  });

  // Execute a command; output streams back as SSE events (`out`, then `exit`).
  r.post('/api/projects/:id/terminal/sessions/:sid/exec', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write');
    const s = getSession(project, user, p.sid);
    if (s.status !== 'ACTIVE') throw conflict(`Session is ${s.status}`, 'session_closed');
    if (s.expires_at < now()) { await closeSession(s, 'EXPIRED'); throw conflict('Session expired', 'session_closed'); }
    if (active.has(s.id)) throw conflict('A command is already running in this session', 'busy');
    rateLimit(`term-exec:${user.id}`, 600, 3600_000);
    const b = await readJson(req);
    const command = str(b.command, 'command', { min: 1, max: 4000 });
    if (/[\x00]/.test(command)) throw bad('Invalid characters in command');
    audit(user.id, 'terminal.exec', { orgId: project.org_id, projectId: project.id, target: s.id, detail: { command: command.slice(0, 500) } });
    const sse = startSse(res);
    const ac = new AbortController();
    active.set(s.id, ac);
    req.on('close', () => { /* client gone; command continues to completion/timeout, history is kept for reconnect */ });
    let output = '';
    const started = now();
    const r2 = await execStream(s.container, command, { timeoutMs: config.terminal.commandTimeoutSec * 1000, signal: ac.signal,
      onData: (text) => { if (output.length < MAX_OUTPUT) output += text; sse.send('out', { text }); } });
    active.delete(s.id);
    // On timeout/interrupt, kill everything the user started (PID 1 = the session's `sleep` survives).
    if (r2.timedOut || ac.signal.aborted) await docker(['exec', s.container, 'kill', '-9', '-1']);
    run('INSERT INTO terminal_history (id,session_id,command,exit_code,output,timed_out,duration_ms,created_at) VALUES (?,?,?,?,?,?,?,?)', newId('th_'), s.id, command, r2.code, output.slice(0, MAX_OUTPUT), r2.timedOut ? 1 : 0, now() - started, now());
    run('UPDATE terminal_sessions SET last_activity_at = ? WHERE id = ?', now(), s.id);
    sse.send('exit', { code: r2.code, timed_out: r2.timedOut });
    sse.end();
  });

  r.post('/api/projects/:id/terminal/sessions/:sid/interrupt', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write');
    const s = getSession(project, user, p.sid);
    const ac = active.get(s.id);
    if (ac) ac.abort();
    sendJson(res, 200, { status: ac ? 'interrupted' : 'idle' });
  });

  r.delete('/api/projects/:id/terminal/sessions/:sid', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write');
    const s = getSession(project, user, p.sid);
    await closeSession(s, 'CLOSED');
    audit(user.id, 'terminal.close', { orgId: project.org_id, projectId: project.id, target: s.id });
    sendJson(res, 200, { status: 'closed' });
  });
}
