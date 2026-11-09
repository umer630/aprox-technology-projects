import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, VERSION, isTest } from './config.js';
import { getDb, run, newId as dbId, now } from './db.js';
import { Router, sendJson, sendError, securityHeaders, applyCors, newId, notFound, HttpError } from './http.js';
import { resolveAuth, enforceCsrf, rateLimit } from './security.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerOrgRoutes } from './routes/orgs.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerFileRoutes } from './routes/files.js';
import { registerComputeRoutes } from './routes/compute.js';
import { registerJobRoutes } from './routes/jobs.js';
import { registerTrainingRoutes } from './routes/training.js';
import { registerNotebookRoutes } from './routes/notebooks.js';
import { registerTerminalRoutes } from './routes/terminal.js';
import { registerMonitoringRoutes } from './routes/monitoring.js';
import { registerApiKeyRoutes } from './routes/apikeys.js';
import { registerMiscRoutes } from './routes/misc.js';
import { registerAdminRoutes } from './routes/admin.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import './jobs/command.js';
import { startBackgroundTasks, stopBackgroundTasks } from './background.js';

export function buildRouter() {
  const r = new Router();
  r.get('/healthz', async (req, res) => sendJson(res, 200, { ok: true }));
  r.get('/api/version', async (req, res) => sendJson(res, 200, {
    product: 'NEBIUS', name_status: 'provisional internal development name — not affiliated with Nebius Group / Nebius AI Cloud',
    company: 'Approx Technology', version: VERSION, api: 'v1', env: config.env,
  }));
  registerAuthRoutes(r);
  registerOrgRoutes(r);
  registerProjectRoutes(r);
  registerFileRoutes(r);
  registerComputeRoutes(r);
  registerJobRoutes(r);
  registerTrainingRoutes(r);
  registerNotebookRoutes(r);
  registerTerminalRoutes(r);
  registerMonitoringRoutes(r);
  registerApiKeyRoutes(r);
  registerMiscRoutes(r);
  registerAdminRoutes(r);
  r.get('/api/meta/endpoints', async (req, res) => sendJson(res, 200, { endpoints: r.list }));
  return r;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

function serveStatic(req, res, pathname) {
  const root = config.webDir;
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const full = path.resolve(root, '.' + rel);
  if (!full.startsWith(root + path.sep)) return false;
  let file = full;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (!path.extname(rel)) file = path.join(root, 'index.html'); else return false;
  }
  if (!fs.existsSync(file)) return false;
  securityHeaders(res);
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300' });
  fs.createReadStream(file).pipe(res);
  return true;
}

export function createServer() {
  getDb();
  const router = buildRouter();
  return http.createServer(async (req, res) => {
    const requestId = 'req_' + newId();
    const started = Date.now();
    res.setHeader('X-Request-Id', requestId);
    let routePath = null; let ctx = null;
    try {
      const url = new URL(req.url, 'http://local');
      const isApi = url.pathname.startsWith('/api/') || url.pathname === '/healthz';
      if (!isApi) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method_not_allowed', 'Method not allowed');
        if (serveStatic(req, res, url.pathname)) return;
        throw notFound();
      }
      securityHeaders(res);
      applyCors(req, res);
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      const method = req.method === 'POST' && String(req.headers['x-http-method-override'] || '').toUpperCase() === 'PATCH' ? 'PATCH'
        : req.method === 'POST' && String(req.headers['x-http-method-override'] || '').toUpperCase() === 'DELETE' ? 'DELETE'
          : req.method === 'POST' && String(req.headers['x-http-method-override'] || '').toUpperCase() === 'PUT' ? 'PUT' : req.method;
      const m = router.match(method, url.pathname);
      if (m === 'method') throw new HttpError(405, 'method_not_allowed', 'Method not allowed');
      if (!m) throw notFound('Unknown endpoint');
      routePath = m.route.re.source;
      ctx = { requestId, auth: resolveAuth(req) };
      if (ctx.auth?.kind === 'api_key') rateLimit(`apikey:${ctx.auth.apiKey.id}`, ctx.auth.apiKey.rate_limit_per_min, 60_000);
      enforceCsrf(req, ctx.auth);
      for (const h of m.route.handlers) await h(req, res, ctx, m.params, url);
    } catch (err) {
      sendError(res, err, requestId);
    } finally {
      if (routePath && !url_is_health(req)) {
        res.on('finish', () => {
          try {
            const k = ctx?.auth?.apiKey;
            run('INSERT INTO request_logs (id,method,route,status,latency_ms,user_id,api_key_id,project_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
              dbId('rq_'), req.method, req.url.split('?')[0].replace(/\/(dl)\/[^/]+$/, '/$1/[token]').slice(0, 200), res.statusCode, Date.now() - started, ctx?.auth?.user?.id || null, k?.id || null, k?.project_id || null, now());
            if (k) run("INSERT INTO usage_records (id,org_id,project_id,kind,quantity,unit,source,ref,created_at) VALUES (?,?,?,'api_call',1,'request','api_key',?,?)", dbId('use_'), k.org_id, k.project_id, k.id, now());
          } catch { /* logging must never break a request */ }
        });
      }
    }
  });
}
const url_is_health = (req) => req.url === '/healthz';

export function shutdown(server) {
  stopScheduler();
  stopBackgroundTasks();
  server?.close();
  server?.closeAllConnections?.();
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const server = createServer();
  server.requestTimeout = 0; // large uploads; per-route limits apply
  server.headersTimeout = 30_000;
  server.listen(config.port, config.host, () => {
    console.log(`NEBIUS backend ${VERSION} (${config.env}) on http://${config.host}:${config.port}`);
    if (!isTest()) { startScheduler(); startBackgroundTasks(); }
  });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { shutdown(server); process.exit(0); });
}
