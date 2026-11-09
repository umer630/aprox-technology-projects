// Project-scoped API keys (nbk_…, 256-bit, stored as SHA-256 — shown once), scopes, per-key rate limits,
// usage metrics, and the model inference endpoint (proxied to an operator-configured OpenAI-compatible
// server hosting a VERIFIED adapter; 503 otherwise — never a fabricated answer).
import { one, all, run, now, newId, audit, pj } from '../db.js';
import { readJson, sendJson, bad, notFound, unavailable, str, int } from '../http.js';
import { projectAccess } from '../iam.js';
import { randomToken, sha256, rateLimit } from '../security.js';
import { config } from '../config.js';

export const SCOPES = ['projects:read', 'files:read', 'files:write', 'compute:read', 'compute:write', 'jobs:read', 'jobs:write', 'inference'];
const pub = (k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: pj(k.scopes, []), rate_limit_per_min: k.rate_limit_per_min, created_at: k.created_at, last_used_at: k.last_used_at, expires_at: k.expires_at, revoked_at: k.revoked_at, user_id: k.user_id });

export function registerApiKeyRoutes(r) {
  r.get('/api/apikeys/scopes', async (req, res) => sendJson(res, 200, { scopes: SCOPES }));

  r.get('/api/projects/:id/apikeys', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'admin');
    const keys = all('SELECT * FROM api_keys WHERE project_id = ? ORDER BY created_at DESC', project.id).map(pub);
    const usage = all('SELECT api_key_id, COUNT(*) AS requests, SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors, MAX(created_at) AS last FROM request_logs WHERE project_id = ? GROUP BY api_key_id', project.id);
    sendJson(res, 200, { keys, usage });
  });

  r.post('/api/projects/:id/apikeys', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'admin');
    rateLimit(`apikey-create:${user.id}`, 20, 3600_000);
    const b = await readJson(req);
    const name = str(b.name, 'name', { min: 1, max: 80 });
    const scopes = Array.isArray(b.scopes) ? [...new Set(b.scopes)] : [];
    if (!scopes.length || !scopes.every((s) => SCOPES.includes(s))) throw bad(`scopes must be a non-empty subset of: ${SCOPES.join(', ')}`);
    const rpm = int(b.rate_limit_per_min, 'rate_limit_per_min', { min: 1, max: 6000, def: 60 });
    const days = int(b.expires_in_days, 'expires_in_days', { min: 1, max: 365, def: 90 });
    const key = `nbk_${randomToken(32)}`;
    const id = newId('key_');
    run('INSERT INTO api_keys (id,org_id,project_id,user_id,name,prefix,key_hash,scopes,rate_limit_per_min,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      id, project.org_id, project.id, user.id, name, key.slice(0, 12), sha256(key), JSON.stringify(scopes), rpm, now(), now() + days * 86400_000);
    audit(user.id, 'apikey.create', { orgId: project.org_id, projectId: project.id, target: id, detail: { name, scopes } });
    sendJson(res, 201, { key, api_key: pub(one('SELECT * FROM api_keys WHERE id = ?', id)), warning: 'Store this key now — it cannot be shown again.' });
  });

  r.delete('/api/projects/:id/apikeys/:kid', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'admin');
    const r2 = run('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND project_id = ? AND revoked_at IS NULL', now(), p.kid, project.id);
    if (!r2.changes) throw notFound('API key not found');
    audit(user.id, 'apikey.revoke', { orgId: project.org_id, projectId: project.id, target: p.kid });
    sendJson(res, 200, { status: 'revoked' });
  });

  // Model inference. Requires a VERIFIED model artifact in the project and a configured inference server.
  r.post('/api/v1/projects/:id/inference', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'read', { scope: 'inference' });
    const b = await readJson(req, 512 * 1024);
    const model = b.model_artifact_id
      ? one("SELECT * FROM model_artifacts WHERE id = ? AND project_id = ? AND status = 'VERIFIED'", String(b.model_artifact_id), project.id)
      : one("SELECT * FROM model_artifacts WHERE project_id = ? AND status = 'VERIFIED' ORDER BY created_at DESC LIMIT 1", project.id);
    if (!model) throw unavailable('No VERIFIED model in this project. Training must pass evidence verification first.', 'no_verified_model');
    if (!config.inference.url) throw unavailable('Inference backend is not configured on this server (NEBIUS_INFERENCE_URL).', 'inference_backend_unavailable');
    if (!Array.isArray(b.messages) || !b.messages.length || b.messages.length > 100) throw bad('messages must be a non-empty array');
    const messages = b.messages.map((m) => ({ role: ['system', 'user', 'assistant'].includes(m.role) ? m.role : 'user', content: String(m.content || '').slice(0, 32000) }));
    const upstream = await fetch(`${config.inference.url}/v1/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(config.inference.apiKey ? { authorization: `Bearer ${config.inference.apiKey}` } : {}) },
      body: JSON.stringify({ model: model.name, messages, max_tokens: int(b.max_tokens, 'max_tokens', { min: 1, max: 4096, def: 512 }), temperature: Math.min(2, Math.max(0, Number(b.temperature ?? 0.7))) }),
      signal: AbortSignal.timeout(120_000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
    if (!upstream.ok) throw unavailable(`Inference backend error (HTTP ${upstream.status})`, 'inference_backend_error');
    const data = await upstream.json();
    sendJson(res, 200, { model: { id: model.id, name: model.name, adapter_sha256: model.sha256 }, choices: data.choices, usage: data.usage || null });
  });
}
