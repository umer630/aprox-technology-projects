// Notebook engine. Notebooks are .ipynb files in project storage (versioned like any file).
// Execution goes to a Jupyter Server through its REST + kernel-channel WebSocket API:
//  - docker mode (default, production): one hardened container per PROJECT from NEBIUS_JUPYTER_IMAGE on an
//    internal Docker network (no Internet egress), non-root, cap-drop ALL, memory/CPU/PID limits.
//  - shared mode (dev only): an operator-run Jupyter server — NOT tenant-isolated; refused in production.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { one, all, run, now, newId, audit } from '../db.js';
import { readJson, sendJson, bad, notFound, conflict, unavailable, safeName, int } from '../http.js';
import { projectAccess } from '../iam.js';
import { config, isProd } from '../config.js';
import { docker, dockerAvailable, inspect } from '../docker.js';
import { storeBuffer, currentObject } from './files.js';
import { storage, readObjectToBuffer, tmpDir } from '../storage/index.js';

const IMAGE = process.env.NEBIUS_JUPYTER_IMAGE || 'nebius-jupyter:local';
const NETWORK = process.env.NEBIUS_JUPYTER_NETWORK || 'nebius-nb';
const MODE = config.jupyter.mode === 'shared' && config.jupyter.url ? 'shared' : 'docker';
const servers = new Map(); // projectId → { base, token, container }

export function blankNotebook() {
  return { cells: [{ cell_type: 'code', execution_count: null, metadata: {}, outputs: [], source: ['import sys\n', 'print(sys.version)'] }],
    metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' }, language_info: { name: 'python' } }, nbformat: 4, nbformat_minor: 5 };
}
export function validateNotebook(nb) {
  if (!nb || typeof nb !== 'object' || nb.nbformat !== 4 || !Array.isArray(nb.cells)) throw bad('Not a valid nbformat 4 notebook', 'invalid_notebook');
  if (nb.cells.length > 2000) throw bad('Too many cells');
  for (const c of nb.cells) {
    if (!['code', 'markdown', 'raw'].includes(c.cell_type)) throw bad('Invalid cell_type', 'invalid_notebook');
    if (!(typeof c.source === 'string' || (Array.isArray(c.source) && c.source.every((s) => typeof s === 'string')))) throw bad('Invalid cell source', 'invalid_notebook');
    c.metadata ||= {};
    if (c.cell_type === 'code') { c.outputs ||= []; if (c.execution_count === undefined) c.execution_count = null; }
  }
  nb.metadata ||= {}; nb.nbformat_minor ??= 5;
  return nb;
}
const src = (c) => (Array.isArray(c.source) ? c.source.join('') : c.source);

async function loadNotebook(project, fileId) {
  const f = one("SELECT * FROM files WHERE id = ? AND project_id = ? AND deleted_at IS NULL AND kind = 'notebook'", fileId, project.id);
  if (!f) throw notFound('Notebook not found');
  const buf = await readObjectToBuffer(currentObject(f).object_key, 50 * 1024 * 1024);
  let nb; try { nb = JSON.parse(buf.toString('utf8')); } catch { throw bad('Notebook file is not valid JSON', 'invalid_notebook'); }
  return { file: f, nb: validateNotebook(nb) };
}

async function jfetch(server, p, opts = {}) {
  const r = await fetch(`${server.base}${p}`, { ...opts, headers: { authorization: `token ${server.token}`, 'content-type': 'application/json', ...(opts.headers || {}) }, signal: AbortSignal.timeout(opts.timeout || 15_000) });
  const text = await r.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: r.ok, status: r.status, body };
}

async function ensureServer(project) {
  if (MODE === 'shared') {
    if (isProd() && process.env.NEBIUS_JUPYTER_ALLOW_SHARED !== '1') throw unavailable('Shared Jupyter mode is not tenant-isolated and is disabled in production', 'notebook_isolation_required');
    return { base: config.jupyter.url, token: config.jupyter.token, shared: true };
  }
  const d = await dockerAvailable();
  if (!d.ok) throw unavailable(`Notebook execution unavailable: container runtime not reachable (${d.detail})`, 'notebook_backend_unavailable');
  const name = `nebius-nb-${project.id}`;
  const cached = servers.get(project.id);
  if (cached) {
    const i = await inspect(name);
    if (i.exists && i.state.Running) return cached;
    servers.delete(project.id);
  }
  if ((await docker(['image', 'inspect', IMAGE])).code !== 0) throw unavailable(`Notebook image ${IMAGE} not built on this server (see nebius/deploy/jupyter.Dockerfile)`, 'notebook_backend_unavailable');
  await docker(['network', 'create', '--internal', NETWORK]); // idempotent: fails harmlessly if it exists
  await docker(['rm', '-f', name]);
  const token = crypto.randomBytes(24).toString('hex');
  const r = await docker(['run', '-d', '--name', name, '--network', NETWORK, '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--memory', process.env.NOTEBOOK_MEMORY || '2g', '--cpus', process.env.NOTEBOOK_CPUS || '1', '--pids-limit', '512', '--label', `nebius.project=${project.id}`, '--label', 'nebius.kind=notebook',
    IMAGE, 'jupyter', 'server', '--ip=0.0.0.0', '--port=8888', '--no-browser', `--IdentityProvider.token=${token}`, '--ServerApp.root_dir=/home/nb/work'], { timeoutMs: 60_000 });
  if (r.code !== 0) throw unavailable(`Could not start notebook server: ${r.stderr.trim().slice(0, 200)}`, 'notebook_backend_unavailable');
  const ip = (await docker(['inspect', '-f', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', name])).stdout.trim();
  const server = { base: `http://${ip}:8888`, token, container: name };
  for (let i = 0; i < 60; i++) {
    try { const s = await jfetch(server, '/api/status', { timeout: 2000 }); if (s.ok) { servers.set(project.id, server); return server; } } catch { /* starting */ }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw unavailable('Notebook server did not become ready in time', 'notebook_backend_unavailable');
}

/** Execute code on a kernel via the Jupyter kernel-channels WebSocket; returns nbformat outputs. */
function executeOnKernel(server, kernelId, code, timeoutMs) {
  return new Promise((resolve) => {
    const wsUrl = `${server.base.replace(/^http/, 'ws')}/api/kernels/${kernelId}/channels?token=${server.token}`;
    const ws = new WebSocket(wsUrl);
    const msgId = crypto.randomUUID();
    const session = crypto.randomUUID();
    const outputs = []; let execCount = null; let status = 'ok'; let done = false; let gotReply = false; let idle = false;
    const finish = (extra = {}) => { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch { /* closed */ } resolve({ outputs, execution_count: execCount, status, ...extra }); };
    const timer = setTimeout(() => finish({ status: 'timeout' }), timeoutMs);
    ws.onopen = () => ws.send(JSON.stringify({
      header: { msg_id: msgId, username: 'nebius', session, msg_type: 'execute_request', version: '5.3', date: new Date().toISOString() },
      parent_header: {}, metadata: {}, channel: 'shell', buffers: [],
      content: { code, silent: false, store_history: true, user_expressions: {}, allow_stdin: false, stop_on_error: true },
    }));
    ws.onerror = () => finish({ status: 'error', transport_error: 'kernel websocket error' });
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString()); } catch { return; }
      if (m.parent_header?.msg_id !== msgId) return;
      const t = m.msg_type || m.header?.msg_type; const c = m.content || {};
      if (t === 'stream') outputs.push({ output_type: 'stream', name: c.name, text: c.text });
      else if (t === 'execute_result') { outputs.push({ output_type: 'execute_result', execution_count: c.execution_count, data: c.data, metadata: c.metadata || {} }); }
      else if (t === 'display_data') outputs.push({ output_type: 'display_data', data: c.data, metadata: c.metadata || {} });
      else if (t === 'error') { status = 'error'; outputs.push({ output_type: 'error', ename: c.ename, evalue: c.evalue, traceback: c.traceback }); }
      else if (t === 'execute_input') execCount = c.execution_count;
      else if (t === 'execute_reply') { gotReply = true; execCount = c.execution_count ?? execCount; if (c.status && c.status !== 'ok') status = c.status; }
      else if (t === 'status' && c.execution_state === 'idle') idle = true;
      if (gotReply && idle) finish();
    };
  });
}

function activeSession(project, fileId, userId) {
  return one("SELECT * FROM notebook_sessions WHERE project_id = ? AND file_id = ? AND user_id = ? AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1", project.id, fileId, userId);
}

export async function shutdownIdleNotebooks(maxIdleMs = 30 * 60_000) {
  for (const s of all("SELECT * FROM notebook_sessions WHERE status = 'ACTIVE' AND last_activity_at < ?", now() - maxIdleMs)) {
    run("UPDATE notebook_sessions SET status = 'EXPIRED', ended_at = ? WHERE id = ?", now(), s.id);
  }
  for (const [pid, srv] of servers) {
    const active = one("SELECT COUNT(*) AS n FROM notebook_sessions WHERE project_id = ? AND status = 'ACTIVE'", pid).n;
    if (!active && srv.container) { await docker(['rm', '-f', srv.container]); servers.delete(pid); }
  }
}

export function registerNotebookRoutes(r) {
  r.get('/api/notebooks/backend', async (req, res) => {
    const d = MODE === 'docker' ? await dockerAvailable() : { ok: !!config.jupyter.url };
    const img = MODE === 'docker' && d.ok ? (await docker(['image', 'inspect', IMAGE])).code === 0 : null;
    sendJson(res, 200, { mode: MODE, isolated: MODE === 'docker', available: MODE === 'docker' ? d.ok && img : !!config.jupyter.url, image: MODE === 'docker' ? IMAGE : null, detail: d.detail || null });
  });

  r.get('/api/projects/:id/notebooks', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'read', { scope: 'files:read' });
    const files = all("SELECT id, name, folder_id, size_bytes, current_version, updated_at FROM files WHERE project_id = ? AND kind = 'notebook' AND deleted_at IS NULL ORDER BY updated_at DESC", project.id);
    const sessions = all("SELECT id, file_id, status, created_at, last_activity_at FROM notebook_sessions WHERE project_id = ? AND user_id = ? AND status = 'ACTIVE'", project.id, user.id);
    sendJson(res, 200, { notebooks: files, sessions });
  });

  r.post('/api/projects/:id/notebooks', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const b = await readJson(req);
    let name = safeName(b.name, 'name', 150);
    if (!name.endsWith('.ipynb')) name += '.ipynb';
    if (one("SELECT id FROM files WHERE project_id = ? AND COALESCE(folder_id,'') = ? AND name = ? AND deleted_at IS NULL", project.id, b.folder_id || '', name)) throw conflict('A file with this name exists', 'name_taken');
    if (b.folder_id && !one('SELECT id FROM folders WHERE id = ? AND project_id = ? AND deleted_at IS NULL', b.folder_id, project.id)) throw notFound('Folder not found');
    const f = await storeBuffer({ project, user, folderId: b.folder_id || null, name, buffer: Buffer.from(JSON.stringify(blankNotebook(), null, 1)), overwrite: false });
    audit(user.id, 'notebook.create', { orgId: project.org_id, projectId: project.id, target: f.id });
    sendJson(res, 201, { notebook: { id: f.id, name: f.name } });
  });

  r.get('/api/projects/:id/notebooks/:fid', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'read', { scope: 'files:read' });
    const { file, nb } = await loadNotebook(project, p.fid);
    const versions = all('SELECT version, created_at, created_by FROM file_versions WHERE file_id = ? ORDER BY version DESC LIMIT 50', file.id);
    sendJson(res, 200, { file: { id: file.id, name: file.name, version: file.current_version }, notebook: nb, session: activeSession(project, file.id, user.id) || null, history: versions });
  });

  r.put('/api/projects/:id/notebooks/:fid', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const { file } = await loadNotebook(project, p.fid);
    const b = await readJson(req, 20 * 1024 * 1024);
    const nb = validateNotebook(b.notebook);
    const saved = await storeBuffer({ project, user, folderId: file.folder_id, name: file.name, buffer: Buffer.from(JSON.stringify(nb, null, 1)) });
    audit(user.id, 'notebook.save', { orgId: project.org_id, projectId: project.id, target: file.id, detail: { version: saved.current_version } });
    sendJson(res, 200, { version: saved.current_version });
  });

  r.post('/api/projects/:id/notebooks/:fid/session', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const { file } = await loadNotebook(project, p.fid);
    const existing = activeSession(project, file.id, user.id);
    const server = await ensureServer(project);
    if (existing) {
      const k = await jfetch(server, `/api/kernels/${existing.kernel_id}`);
      if (k.ok) return sendJson(res, 200, { session: existing, kernel: k.body });
      run("UPDATE notebook_sessions SET status = 'ENDED', ended_at = ? WHERE id = ?", now(), existing.id);
    }
    const k = await jfetch(server, '/api/kernels', { method: 'POST', body: JSON.stringify({ name: 'python3' }) });
    if (!k.ok) throw unavailable(`Kernel start failed (HTTP ${k.status})`, 'kernel_start_failed');
    const id = newId('nbs_');
    run("INSERT INTO notebook_sessions (id,org_id,project_id,file_id,user_id,kernel_id,backend,status,created_at,last_activity_at) VALUES (?,?,?,?,?,?,?,'ACTIVE',?,?)", id, project.org_id, project.id, file.id, user.id, k.body.id, MODE, now(), now());
    audit(user.id, 'notebook.kernel_start', { orgId: project.org_id, projectId: project.id, target: file.id, detail: { mode: MODE } });
    sendJson(res, 201, { session: one('SELECT * FROM notebook_sessions WHERE id = ?', id), kernel: k.body, isolated: MODE === 'docker' });
  });

  r.post('/api/projects/:id/notebooks/:fid/execute', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const { file, nb } = await loadNotebook(project, p.fid);
    const s = activeSession(project, file.id, user.id);
    if (!s) throw conflict('Start a kernel session first', 'no_session');
    const b = await readJson(req);
    const idx = int(b.cell_index, 'cell_index', { min: 0, max: nb.cells.length - 1 });
    const cell = nb.cells[idx];
    if (cell.cell_type !== 'code') throw bad('Only code cells can be executed');
    const server = await ensureServer(project);
    const result = await executeOnKernel(server, s.kernel_id, src(cell), (int(b.timeout_s, 'timeout_s', { min: 1, max: 3600, def: config.jupyter.execTimeoutSec })) * 1000);
    if (result.status === 'timeout') await jfetch(server, `/api/kernels/${s.kernel_id}/interrupt`, { method: 'POST' });
    cell.outputs = result.outputs; cell.execution_count = result.execution_count;
    const saved = await storeBuffer({ project, user, folderId: file.folder_id, name: file.name, buffer: Buffer.from(JSON.stringify(nb, null, 1)) });
    run('UPDATE notebook_sessions SET last_activity_at = ? WHERE id = ?', now(), s.id);
    audit(user.id, 'notebook.execute', { orgId: project.org_id, projectId: project.id, target: file.id, detail: { cell: idx, status: result.status } });
    sendJson(res, 200, { status: result.status, cell_index: idx, outputs: result.outputs, execution_count: result.execution_count, version: saved.current_version });
  });

  for (const action of ['interrupt', 'restart']) {
    r.post(`/api/projects/:id/notebooks/:fid/${action}`, async (req, res, ctx, p) => {
      const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
      const s = activeSession(project, p.fid, user.id);
      if (!s) throw conflict('No active kernel session', 'no_session');
      const r2 = await jfetch(await ensureServer(project), `/api/kernels/${s.kernel_id}/${action}`, { method: 'POST', timeout: 60_000 });
      sendJson(res, r2.ok ? 200 : 502, { status: r2.ok ? `${action}ed` : 'failed' });
    });
  }

  r.delete('/api/projects/:id/notebooks/:fid/session', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const s = activeSession(project, p.fid, user.id);
    if (!s) throw notFound('No active session');
    try { await jfetch(await ensureServer(project), `/api/kernels/${s.kernel_id}`, { method: 'DELETE' }); } catch { /* server already gone */ }
    run("UPDATE notebook_sessions SET status = 'ENDED', ended_at = ? WHERE id = ?", now(), s.id);
    sendJson(res, 200, { status: 'ended' });
  });

  // Dataset / checkpoint mounting: copy a project file into the project's notebook container at ./data/<name>.
  r.post('/api/projects/:id/notebooks/mount', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    if (MODE !== 'docker') throw bad('Mounting is only supported in docker notebook mode');
    const b = await readJson(req);
    const f = one('SELECT * FROM files WHERE id = ? AND project_id = ? AND deleted_at IS NULL', String(b.file_id || ''), project.id);
    if (!f) throw notFound('File not found');
    const server = await ensureServer(project);
    const dir = fs.mkdtempSync(path.join(tmpDir(), 'mnt_'));
    const local = path.join(dir, f.name);
    await pipeline(await storage().get(currentObject(f).object_key), fs.createWriteStream(local));
    await docker(['exec', server.container, 'mkdir', '-p', '/home/nb/work/data']);
    const cp = await docker(['cp', local, `${server.container}:/home/nb/work/data/${f.name}`], { timeoutMs: 600_000 });
    fs.rmSync(dir, { recursive: true, force: true });
    if (cp.code !== 0) throw unavailable(`copy failed: ${cp.stderr.slice(0, 200)}`);
    audit(user.id, 'notebook.mount', { orgId: project.org_id, projectId: project.id, target: f.id });
    sendJson(res, 200, { path: `data/${f.name}`, sha256: f.sha256 });
  });
}
