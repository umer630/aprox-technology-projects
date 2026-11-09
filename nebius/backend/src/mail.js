// Mail transport. 'outbox' stores (and in development prints) messages — used for local dev and tests.
// 'http' posts JSON to a transactional mail provider configured by the operator.
import { run, now, newId } from './db.js';
import { config } from './config.js';

export async function sendMail(to, subject, body) {
  const id = newId('mail_');
  run('INSERT INTO mail_outbox (id,recipient,subject,body,created_at) VALUES (?,?,?,?,?)', id, to, subject, body, now());
  if (config.mail.transport === 'http' && config.mail.httpEndpoint) {
    try {
      const r = await fetch(config.mail.httpEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.mail.httpApiKey}` },
        body: JSON.stringify({ from: config.mail.from, to, subject, text: body }),
        signal: AbortSignal.timeout(10_000),
      });
      run('UPDATE mail_outbox SET sent_at = ?, error = ? WHERE id = ?', now(), r.ok ? null : `HTTP ${r.status}`, id);
    } catch (e) { run('UPDATE mail_outbox SET error = ? WHERE id = ?', String(e.message).slice(0, 200), id); }
  } else if (config.env === 'development') {
    console.log(`\n[mail outbox] To: ${to}\nSubject: ${subject}\n${body}\n`);
  }
  return id;
}
export const appLink = (p) => `${config.publicUrl || 'http://localhost:' + config.port}${p}`;
