import { one, all, run, now, tx, audit, securityEvent, newId } from '../db.js';
import { readJson, sendJson, bad, unauthorized, HttpError, isEmail, str, clientIp } from '../http.js';
import {
  hashPassword, verifyPassword, burnPasswordCheck, passwordPolicy, randomToken, sha256, rateLimit,
  createSession, revokeSessions, sessionCookie, requireUser,
} from '../security.js';
import { sendMail, appLink } from '../mail.js';
import { config } from '../config.js';
import { createOrganization } from './orgs.js';

const HOUR = 3600_000;

async function issueEmailToken(userId, purpose, ttlMs) {
  const token = randomToken(32);
  run('UPDATE email_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL', now(), userId, purpose);
  run('INSERT INTO email_tokens (id,user_id,purpose,token_hash,expires_at,created_at) VALUES (?,?,?,?,?,?)',
    newId('et_'), userId, purpose, sha256(token), now() + ttlMs, now());
  return token;
}
function consumeEmailToken(token, purpose) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw bad('Invalid or expired token', 'invalid_token');
  const row = one('SELECT * FROM email_tokens WHERE token_hash = ? AND purpose = ?', sha256(token), purpose);
  if (!row || row.used_at || row.expires_at < now()) throw bad('Invalid or expired token', 'invalid_token');
  run('UPDATE email_tokens SET used_at = ? WHERE id = ?', now(), row.id);
  return row;
}

export function publicUser(u) {
  return { id: u.id, email: u.email, display_name: u.display_name, email_verified: !!u.email_verified, platform_role: u.platform_role, created_at: u.created_at };
}

function sessionResponse(res, req, user, client) {
  const s = createSession(user.id, req, client);
  const body = { user: publicUser(user), csrf_token: s.csrf, session_expires_at: now() + config.auth.sessionDays * 86400_000 };
  if (client === 'mobile') body.token = s.token; // Android keeps it in Keystore-encrypted storage
  else res.setHeader('Set-Cookie', sessionCookie(s.token, config.auth.sessionDays * 86400));
  return body;
}

export function registerAuthRoutes(r) {
  r.post('/api/auth/signup', async (req, res) => {
    const ip = clientIp(req);
    rateLimit(`signup:${ip}`, 10, HOUR);
    const b = await readJson(req);
    const email = str(b.email, 'email', { max: 254 }).toLowerCase();
    if (!isEmail(email)) throw bad('A valid email address is required');
    const pwErr = passwordPolicy(b.password);
    if (pwErr) throw bad(pwErr, 'weak_password');
    rateLimit(`signup-email:${email}`, 3, HOUR);
    const name = str(b.display_name, 'display_name', { max: 80, required: false }) || email.split('@')[0];
    const msg = { status: 'verification_sent', message: 'If this email can be registered, a verification link has been sent.' };
    if (one('SELECT id FROM users WHERE email = ?', email)) {
      await sendMail(email, 'NEBIUS sign-up attempt', 'Someone tried to create a NEBIUS account with this email. If it was you, sign in or reset your password.');
      return sendJson(res, 202, msg); // no account enumeration
    }
    const hash = await hashPassword(b.password);
    const id = newId('usr_');
    const t = now();
    tx(() => {
      run('INSERT INTO users (id,email,password_hash,display_name,created_at,updated_at) VALUES (?,?,?,?,?,?)', id, email, hash, name, t, t);
      createOrganization(id, `${name}'s organization`, null);
    });
    const token = await issueEmailToken(id, 'verify', 24 * HOUR);
    await sendMail(email, 'Verify your NEBIUS email', `Welcome to NEBIUS.\n\nVerify your email: ${appLink('/#/verify?token=' + token)}\n\nVerification code: ${token}\n\nExpires in 24 hours.`);
    audit(id, 'auth.signup', { target: id, ip });
    sendJson(res, 202, msg);
  });

  r.post('/api/auth/verify-email', async (req, res) => {
    rateLimit(`verify:${clientIp(req)}`, 30, HOUR);
    const b = await readJson(req);
    const row = consumeEmailToken(b.token, 'verify');
    run('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?', now(), row.user_id);
    audit(row.user_id, 'auth.email_verified', { target: row.user_id, ip: clientIp(req) });
    sendJson(res, 200, { status: 'verified' });
  });

  r.post('/api/auth/resend-verification', async (req, res, ctx) => {
    const u = requireUser(ctx);
    rateLimit(`resend:${u.id}`, 3, HOUR);
    if (u.email_verified) return sendJson(res, 200, { status: 'already_verified' });
    const token = await issueEmailToken(u.id, 'verify', 24 * HOUR);
    await sendMail(u.email, 'Verify your NEBIUS email', `Verify your email: ${appLink('/#/verify?token=' + token)}\n\nVerification code: ${token}`);
    sendJson(res, 200, { status: 'verification_sent' });
  });

  r.post('/api/auth/login', async (req, res) => {
    const ip = clientIp(req);
    rateLimit(`login-ip:${ip}`, 30, 15 * 60_000);
    const b = await readJson(req);
    const email = str(b.email, 'email', { max: 254 }).toLowerCase();
    const password = typeof b.password === 'string' ? b.password : '';
    const client = b.client === 'mobile' ? 'mobile' : 'web';
    const user = one("SELECT * FROM users WHERE email = ? AND status = 'active'", email);
    if (!user) { await burnPasswordCheck(password); throw unauthorized('Invalid email or password'); }
    if (user.locked_until && user.locked_until > now()) {
      securityEvent(user.id, 'login_while_locked', 'medium', ip, null);
      throw new HttpError(423, 'account_locked', 'Too many failed attempts. Try again later.', { retryAfter: Math.ceil((user.locked_until - now()) / 1000) });
    }
    if (!(await verifyPassword(password, user.password_hash))) {
      const fails = user.failed_logins + 1;
      const lock = fails >= config.auth.maxFailedLogins ? now() + config.auth.lockMinutes * 60_000 : null;
      run('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', lock ? 0 : fails, lock, user.id);
      securityEvent(user.id, lock ? 'account_locked' : 'login_failed', lock ? 'high' : 'low', ip, null);
      throw unauthorized('Invalid email or password');
    }
    run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', user.id);
    audit(user.id, 'auth.login', { target: user.id, ip, detail: { client } });
    sendJson(res, 200, sessionResponse(res, req, user, client));
  });

  r.post('/api/auth/logout', async (req, res, ctx) => {
    const u = requireUser(ctx);
    run('UPDATE sessions SET revoked_at = ? WHERE id = ?', now(), ctx.auth.session.id);
    res.setHeader('Set-Cookie', sessionCookie('', 0));
    audit(u.id, 'auth.logout', { ip: clientIp(req) });
    sendJson(res, 200, { status: 'logged_out' });
  });

  r.get('/api/auth/me', async (req, res, ctx) => {
    const u = requireUser(ctx);
    sendJson(res, 200, { user: publicUser(u), csrf_token: ctx.auth.session.csrf_token, session_expires_at: ctx.auth.session.expires_at });
  });

  r.patch('/api/auth/me', async (req, res, ctx) => {
    const u = requireUser(ctx);
    const b = await readJson(req);
    const name = str(b.display_name, 'display_name', { min: 1, max: 80 });
    run('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?', name, now(), u.id);
    sendJson(res, 200, { user: publicUser(one('SELECT * FROM users WHERE id = ?', u.id)) });
  });

  r.post('/api/auth/forgot-password', async (req, res) => {
    rateLimit(`forgot:${clientIp(req)}`, 10, HOUR);
    const b = await readJson(req);
    const email = str(b.email, 'email', { max: 254 }).toLowerCase();
    rateLimit(`forgot-email:${email}`, 3, HOUR);
    const user = one("SELECT * FROM users WHERE email = ? AND status = 'active'", email);
    if (user) {
      const token = await issueEmailToken(user.id, 'reset', HOUR);
      await sendMail(email, 'Reset your NEBIUS password', `Reset your password: ${appLink('/#/reset?token=' + token)}\n\nReset code: ${token}\n\nExpires in 1 hour. If you did not request this, ignore this email.`);
    }
    sendJson(res, 202, { status: 'reset_sent', message: 'If an account exists for this email, a reset link has been sent.' });
  });

  r.post('/api/auth/reset-password', async (req, res) => {
    rateLimit(`reset:${clientIp(req)}`, 20, HOUR);
    const b = await readJson(req);
    const pwErr = passwordPolicy(b.password);
    if (pwErr) throw bad(pwErr, 'weak_password');
    const row = consumeEmailToken(b.token, 'reset');
    run('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?', await hashPassword(b.password), now(), row.user_id);
    revokeSessions(row.user_id);
    audit(row.user_id, 'auth.password_reset', { target: row.user_id, ip: clientIp(req) });
    sendJson(res, 200, { status: 'password_reset' });
  });

  r.post('/api/auth/change-password', async (req, res, ctx) => {
    const u = requireUser(ctx);
    const b = await readJson(req);
    if (!(await verifyPassword(String(b.current_password || ''), u.password_hash))) throw unauthorized('Current password is incorrect');
    const pwErr = passwordPolicy(b.new_password);
    if (pwErr) throw bad(pwErr, 'weak_password');
    run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', await hashPassword(b.new_password), now(), u.id);
    revokeSessions(u.id, ctx.auth.session.id);
    audit(u.id, 'auth.password_changed', { ip: clientIp(req) });
    sendJson(res, 200, { status: 'password_changed' });
  });

  r.get('/api/auth/sessions', async (req, res, ctx) => {
    const u = requireUser(ctx);
    const rows = all('SELECT id, client, ip, user_agent, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC', u.id, now());
    sendJson(res, 200, { sessions: rows.map((s) => ({ ...s, current: s.id === ctx.auth.session.id })) });
  });

  r.delete('/api/auth/sessions/:id', async (req, res, ctx, p) => {
    const u = requireUser(ctx);
    const r2 = run('UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL', now(), p.id, u.id);
    if (!r2.changes) throw bad('Session not found', 'not_found');
    audit(u.id, 'auth.session_revoked', { target: p.id, ip: clientIp(req) });
    sendJson(res, 200, { status: 'revoked' });
  });
}
