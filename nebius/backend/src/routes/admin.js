import { one, all, run, now, audit } from '../db.js';
import { readJson, sendJson, bad, notFound, conflict, str, oneOf } from '../http.js';
import { requireSuperadmin, revokeSessions } from '../security.js';
import { setVerification, setEnabled, checkAllHealth, listProviders } from '../providers/index.js';
import { hostMetrics } from '../metrics.js';
import { createBackup } from '../backup.js';

export function registerAdminRoutes(r) {
  r.get('/api/admin/users', async (req, res, ctx, p, url) => {
    requireSuperadmin(ctx);
    const q = `%${(url.searchParams.get('q') || '').slice(0, 100)}%`;
    sendJson(res, 200, { users: all('SELECT id, email, display_name, email_verified, platform_role, status, created_at FROM users WHERE email LIKE ? ORDER BY created_at DESC LIMIT 200', q) });
  });
  r.patch('/api/admin/users/:uid', async (req, res, ctx, p) => {
    const admin = requireSuperadmin(ctx);
    const b = await readJson(req);
    const u = one('SELECT * FROM users WHERE id = ?', p.uid);
    if (!u) throw notFound('User not found');
    if (u.id === admin.id) throw bad('You cannot change your own account here');
    const status = oneOf(b.status, 'status', ['active', 'suspended'], u.status);
    const role = oneOf(b.platform_role, 'platform_role', ['user', 'superadmin'], u.platform_role);
    if (u.platform_role === 'superadmin' && role !== 'superadmin' && one("SELECT COUNT(*) AS n FROM users WHERE platform_role = 'superadmin' AND status = 'active'").n <= 1) throw conflict('Keep at least one superadmin');
    run('UPDATE users SET status = ?, platform_role = ?, updated_at = ? WHERE id = ?', status, role, now(), u.id);
    if (status === 'suspended') { revokeSessions(u.id); run('UPDATE api_keys SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', now(), u.id); }
    audit(admin.id, 'admin.user_update', { target: u.id, detail: { status, platform_role: role } });
    sendJson(res, 200, { status: 'updated' });
  });

  // Free-only policy administration. Verification records WHO checked the provider account and WHAT they checked.
  r.post('/api/admin/providers/:pid/verify', async (req, res, ctx, p) => {
    const admin = requireSuperadmin(ctx);
    const b = await readJson(req);
    const verified = b.verified !== false;
    const notes = str(b.notes, 'notes', { min: verified ? 20 : 0, max: 1000, required: verified });
    if (verified && b.confirm_free_only !== true) throw bad('Set confirm_free_only=true to confirm: no credit card, no billing account, no paid trial, no auto-upgrade on this provider account', 'confirmation_required');
    const out = setVerification(p.pid, admin.id, verified, notes);
    if (!out) throw notFound('Provider not found');
    if (out.error) throw conflict(`Provider is ${out.error}`, out.error);
    audit(admin.id, verified ? 'provider.verified' : 'provider.unverified', { target: p.pid, detail: { notes } });
    sendJson(res, 200, { provider: out });
  });
  r.post('/api/admin/providers/:pid/enabled', async (req, res, ctx, p) => {
    const admin = requireSuperadmin(ctx);
    const b = await readJson(req);
    const out = setEnabled(p.pid, b.enabled === true);
    if (!out) throw notFound('Provider not found');
    if (out.error) throw conflict(`Cannot enable: ${out.error}`, out.error);
    audit(admin.id, b.enabled ? 'provider.enabled' : 'provider.disabled', { target: p.pid });
    sendJson(res, 200, { provider: out });
  });
  r.post('/api/admin/providers/health', async (req, res, ctx) => { requireSuperadmin(ctx); await checkAllHealth(); sendJson(res, 200, { providers: listProviders() }); });

  r.get('/api/admin/system', async (req, res, ctx) => {
    requireSuperadmin(ctx);
    const counts = one(`SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM organizations) AS organizations, (SELECT COUNT(*) FROM projects WHERE status != 'deleted') AS projects,
      (SELECT COUNT(*) FROM jobs) AS jobs, (SELECT COUNT(*) FROM compute_instances WHERE status != 'DELETED') AS instances, (SELECT COALESCE(SUM(size_bytes),0) FROM storage_objects WHERE deleted_at IS NULL) AS storage_bytes`);
    const migrations = all('SELECT * FROM schema_migrations ORDER BY version');
    sendJson(res, 200, { counts, migrations, host: await hostMetrics() });
  });
  r.get('/api/admin/logs', async (req, res, ctx, p, url) => {
    requireSuperadmin(ctx);
    const type = url.searchParams.get('type') || 'audit';
    const limit = Math.min(1000, Number(url.searchParams.get('limit')) || 200);
    const rows = type === 'security' ? all('SELECT * FROM security_events ORDER BY created_at DESC LIMIT ?', limit)
      : type === 'api' ? all('SELECT * FROM request_logs ORDER BY created_at DESC LIMIT ?', limit)
        : type === 'mail' ? all('SELECT id, recipient, subject, created_at, sent_at, error FROM mail_outbox ORDER BY created_at DESC LIMIT ?', limit)
          : all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?', limit);
    sendJson(res, 200, { type, logs: rows });
  });
  r.post('/api/admin/backup', async (req, res, ctx) => {
    const admin = requireSuperadmin(ctx);
    const out = await createBackup();
    audit(admin.id, 'admin.backup', { detail: { dir: out.name } });
    sendJson(res, 201, out);
  });
}
