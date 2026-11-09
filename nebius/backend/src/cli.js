// Operator CLI:  node src/cli.js <command>
//   promote <email> [superadmin|user]   set platform role
//   verify-email <email>                mark email verified (operator action for self-hosted setups without mail)
//   backup [dir]                        consistent DB snapshot + local objects + SHA-256 manifest
//   migrate                             apply pending migrations
//   health                              run provider health checks and print verdicts
import { getDb, one, run, now, audit } from './db.js';
import { createBackup } from './backup.js';
import { checkAllHealth, listProviders } from './providers/index.js';
import './training/nick48.js';

const [cmd, a, b] = process.argv.slice(2);
getDb();
if (cmd === 'promote') {
  const u = one('SELECT * FROM users WHERE email = ?', String(a || '').toLowerCase());
  if (!u) { console.error('user not found'); process.exit(1); }
  run('UPDATE users SET platform_role = ?, updated_at = ? WHERE id = ?', b === 'user' ? 'user' : 'superadmin', now(), u.id);
  audit(null, 'cli.promote', { target: u.id, detail: { role: b || 'superadmin' } });
  console.log(`${u.email} → ${b === 'user' ? 'user' : 'superadmin'}`);
} else if (cmd === 'verify-email') {
  const r = run('UPDATE users SET email_verified = 1 WHERE email = ?', String(a || '').toLowerCase());
  console.log(r.changes ? 'verified' : 'user not found');
} else if (cmd === 'backup') {
  console.log(JSON.stringify(await createBackup(a), null, 2));
} else if (cmd === 'migrate') {
  console.log('migrations applied:', getDb().prepare('SELECT version, name FROM schema_migrations').all());
} else if (cmd === 'health') {
  await checkAllHealth();
  for (const p of listProviders()) console.log(`${p.id.padEnd(22)} ${p.free_only_status.padEnd(32)} health=${p.health?.status || '-'} dispatchable=${p.dispatchable} ${p.health?.detail || ''}`);
} else {
  console.log('usage: node src/cli.js promote <email> [superadmin|user] | verify-email <email> | backup [dir] | migrate | health');
}
