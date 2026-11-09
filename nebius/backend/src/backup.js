// Backup: consistent SQLite snapshot (VACUUM INTO) + copy of local object storage + SHA-256 manifest.
// For S3 storage, object backup is delegated to the bucket's versioning/replication (documented).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb } from './db.js';
import { config } from './config.js';

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export async function createBackup(destRoot = path.join(config.dataDir, 'backups')) {
  const name = `nebius-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const dir = path.join(destRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  const dbFile = path.join(dir, 'nebius.db');
  getDb().exec(`VACUUM INTO '${dbFile.replace(/'/g, "''")}'`);
  const manifest = { created_at: new Date().toISOString(), database: { file: 'nebius.db', sha256: sha(dbFile), bytes: fs.statSync(dbFile).size }, objects: [] };
  const objRoot = path.join(config.dataDir, 'objects');
  if (config.storage.backend === 'local' && fs.existsSync(objRoot)) {
    fs.cpSync(objRoot, path.join(dir, 'objects'), { recursive: true });
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else manifest.objects.push({ key: path.relative(path.join(dir, 'objects'), p), sha256: sha(p) }); } };
    walk(path.join(dir, 'objects'));
  } else manifest.objects_note = 'S3 backend: back up the bucket with provider versioning/replication.';
  fs.writeFileSync(path.join(dir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
  return { name, path: dir, database_sha256: manifest.database.sha256, objects: manifest.objects.length };
}
