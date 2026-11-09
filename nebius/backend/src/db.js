// SQLite (node:sqlite, WAL) persistence with forward-only, versioned migrations.
// Every tenant resource carries org_id + project_id; route code reaches rows only through iam.js checks.
// SQL is kept portable (no SQLite-only functions in queries) to ease the planned PostgreSQL migration.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

export const MIGRATIONS = [
  {
    version: 1,
    name: 'core_iam_projects',
    sql: `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  email_verified INTEGER NOT NULL DEFAULT 0,
  platform_role TEXT NOT NULL DEFAULT 'user' CHECK (platform_role IN ('user','superadmin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  client TEXT NOT NULL DEFAULT 'web',
  ip TEXT, user_agent TEXT,
  created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE TABLE email_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL, used_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE org_memberships (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('org_admin','developer','viewer')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX idx_orgm_user ON org_memberships(user_id);
CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('org_admin','developer','viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL, accepted_at INTEGER, revoked_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','deleted')),
  storage_quota_bytes INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX idx_projects_org ON projects(org_id);
CREATE TABLE project_memberships (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('project_admin','developer','viewer')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, user_id)
);
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT, org_id TEXT, project_id TEXT,
  action TEXT NOT NULL, target TEXT, ip TEXT, detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_project ON audit_logs(project_id, created_at);
CREATE INDEX idx_audit_org ON audit_logs(org_id, created_at);
CREATE TABLE security_events (
  id TEXT PRIMARY KEY, user_id TEXT, type TEXT NOT NULL, severity TEXT NOT NULL, ip TEXT, detail TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE request_logs (
  id TEXT PRIMARY KEY, method TEXT NOT NULL, route TEXT NOT NULL, status INTEGER NOT NULL, latency_ms INTEGER NOT NULL,
  user_id TEXT, api_key_id TEXT, project_id TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX idx_reqlogs_time ON request_logs(created_at);
CREATE TABLE rate_buckets (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
CREATE TABLE mail_outbox (id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, sent_at INTEGER, error TEXT);
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT, project_id TEXT,
  type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', link TEXT,
  read_at INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX idx_notif_user ON notifications(user_id, created_at);
CREATE TABLE system_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`,
  },
  {
    version: 2,
    name: 'storage',
    sql: `
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES folders(id),
  name TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE UNIQUE INDEX uq_folder_name ON folders(project_id, COALESCE(parent_id, ''), name) WHERE deleted_at IS NULL;
CREATE TABLE storage_objects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL, project_id TEXT NOT NULL,
  backend TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
  created_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX idx_objects_project ON storage_objects(project_id);
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES folders(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  scan_status TEXT NOT NULL DEFAULT 'not_scanned' CHECK (scan_status IN ('not_scanned','clean','infected','scan_error')),
  created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE UNIQUE INDEX uq_file_name ON files(project_id, COALESCE(folder_id, ''), name) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_project ON files(project_id, deleted_at);
CREATE TABLE file_versions (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  storage_object_id TEXT NOT NULL REFERENCES storage_objects(id),
  size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
  UNIQUE (file_id, version)
);
`,
  },
  {
    version: 3,
    name: 'compute_providers_jobs_training',
    sql: `
CREATE TABLE provider_state (
  provider_id TEXT PRIMARY KEY,
  admin_verified INTEGER NOT NULL DEFAULT 0,
  verified_by TEXT, verified_at INTEGER, verification_notes TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  last_health TEXT, last_health_at INTEGER, last_success_at INTEGER
);
CREATE TABLE gpu_resources (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL, vram_mb INTEGER, cuda_capability TEXT, driver_version TEXT, cuda_version TEXT,
  utilization_pct REAL, memory_used_mb INTEGER,
  source TEXT NOT NULL, available INTEGER NOT NULL DEFAULT 1,
  detected_at INTEGER NOT NULL
);
CREATE TABLE compute_instances (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  machine_type TEXT NOT NULL,
  image TEXT,
  status TEXT NOT NULL CHECK (status IN ('AVAILABLE','PROVISIONING','RUNNING','STOPPING','STOPPED','FAILED','UNAVAILABLE','DELETED')),
  provider_ref TEXT,
  cpu_limit REAL, ram_mb INTEGER, disk_gb INTEGER, gpu TEXT,
  network TEXT NOT NULL DEFAULT 'none',
  status_confirmed_at INTEGER, last_error TEXT,
  created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX idx_instances_project ON compute_instances(project_id);
CREATE TABLE instance_events (
  id TEXT PRIMARY KEY, instance_id TEXT NOT NULL REFERENCES compute_instances(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL, detail TEXT, actor_id TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','WAITING_FOR_GPU','BLOCKED','STARTING','RUNNING','PAUSED','SUCCEEDED','FAILED','CANCELLED','TIMED_OUT')),
  priority INTEGER NOT NULL DEFAULT 5,
  spec TEXT NOT NULL,
  requirements TEXT NOT NULL DEFAULT '{}',
  provider_id TEXT, instance_id TEXT, provider_ref TEXT,
  idempotency_key TEXT,
  attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 1,
  timeout_s INTEGER NOT NULL DEFAULT 3600,
  lease_owner TEXT, lease_expires_at INTEGER,
  cancel_requested INTEGER NOT NULL DEFAULT 0, pause_requested INTEGER NOT NULL DEFAULT 0,
  blocked_reason TEXT,
  result TEXT, error TEXT,
  progress TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL, queued_at INTEGER, started_at INTEGER, finished_at INTEGER, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX uq_job_idem ON jobs(project_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_jobs_status ON jobs(status, priority);
CREATE INDEX idx_jobs_project ON jobs(project_id, created_at);
CREATE TABLE job_events (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type TEXT NOT NULL, message TEXT NOT NULL, data TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX idx_jobevents_job ON job_events(job_id, created_at);
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL, project_id TEXT NOT NULL,
  step INTEGER, location TEXT NOT NULL, sha256 TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE source_imports (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  repo_url TEXT NOT NULL, commit_sha TEXT, local_path TEXT NOT NULL,
  manifest TEXT NOT NULL, status TEXT NOT NULL, problems TEXT,
  created_by TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE model_artifacts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_id TEXT,
  name TEXT NOT NULL, kind TEXT NOT NULL, base_model TEXT, version TEXT,
  status TEXT NOT NULL CHECK (status IN ('VERIFIED','REJECTED')),
  sha256 TEXT, file_id TEXT, evidence TEXT NOT NULL, reasons TEXT,
  created_by TEXT NOT NULL, created_at INTEGER NOT NULL
);
`,
  },
  {
    version: 4,
    name: 'notebooks_terminal_api_usage',
    sql: `
CREATE TABLE notebook_sessions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL, user_id TEXT NOT NULL,
  kernel_id TEXT, backend TEXT NOT NULL,
  status TEXT NOT NULL, created_at INTEGER NOT NULL, last_activity_at INTEGER NOT NULL, ended_at INTEGER
);
CREATE TABLE terminal_sessions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, container TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('STARTING','ACTIVE','CLOSED','EXPIRED','FAILED')),
  created_at INTEGER NOT NULL, last_activity_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, ended_at INTEGER, error TEXT
);
CREATE TABLE terminal_history (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES terminal_sessions(id) ON DELETE CASCADE,
  command TEXT NOT NULL, exit_code INTEGER, output TEXT, timed_out INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, prefix TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL, rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
  created_at INTEGER NOT NULL, last_used_at INTEGER, expires_at INTEGER, revoked_at INTEGER
);
CREATE TABLE usage_records (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, project_id TEXT NOT NULL,
  kind TEXT NOT NULL, quantity REAL NOT NULL, unit TEXT NOT NULL, source TEXT NOT NULL, ref TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX idx_usage_project ON usage_records(project_id, kind, created_at);
`,
  },
];

let db;
export const now = () => Date.now();
export const newId = (prefix = '') => prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 24);

export function migrate(d) {
  d.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)');
  const applied = new Set(d.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    d.exec('BEGIN');
    try {
      d.exec(m.sql);
      d.prepare('INSERT INTO schema_migrations (version,name,applied_at) VALUES (?,?,?)').run(m.version, m.name, now());
      d.exec('COMMIT');
    } catch (e) { d.exec('ROLLBACK'); throw new Error(`migration ${m.version} (${m.name}) failed: ${e.message}`); }
  }
}

export function getDb() {
  if (db) return db;
  fs.mkdirSync(config.dataDir, { recursive: true });
  db = new DatabaseSync(path.join(config.dataDir, 'nebius.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

const stmtCache = new Map();
function stmt(sql) {
  const d = getDb();
  let s = stmtCache.get(sql);
  if (!s) { s = d.prepare(sql); stmtCache.set(sql, s); }
  return s;
}
export const one = (sql, ...p) => stmt(sql).get(...p);
export const all = (sql, ...p) => stmt(sql).all(...p);
export const run = (sql, ...p) => stmt(sql).run(...p);

let depth = 0;
export function tx(fn) {
  const d = getDb();
  if (depth > 0) return fn();
  d.exec('BEGIN IMMEDIATE');
  depth++;
  try { const r = fn(); d.exec('COMMIT'); return r; } catch (e) { d.exec('ROLLBACK'); throw e; } finally { depth--; }
}

export const j = (v) => (v === undefined ? null : JSON.stringify(v));
export const pj = (s, d = null) => { if (s === null || s === undefined) return d; try { return JSON.parse(s); } catch { return d; } };

export function audit(actorId, action, { orgId = null, projectId = null, target = null, ip = null, detail = null } = {}) {
  run('INSERT INTO audit_logs (id,actor_id,org_id,project_id,action,target,ip,detail,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    newId('aud_'), actorId, orgId, projectId, action, target, ip, detail ? JSON.stringify(detail) : null, now());
}
export function securityEvent(userId, type, severity, ip, detail) {
  run('INSERT INTO security_events (id,user_id,type,severity,ip,detail,created_at) VALUES (?,?,?,?,?,?,?)',
    newId('sev_'), userId, type, severity, ip, detail ? JSON.stringify(detail) : null, now());
}
export function notify(userId, type, title, body = '', { orgId = null, projectId = null, link = null } = {}) {
  run('INSERT INTO notifications (id,user_id,org_id,project_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    newId('ntf_'), userId, orgId, projectId, type, title, body, link, now());
}
export function kvGet(key) { return one('SELECT value FROM system_kv WHERE key = ?', key)?.value ?? null; }
export function kvSet(key, value) { run('INSERT INTO system_kv (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value); }

// HMAC key for signed URLs: env-provided, else generated once per installation and kept in the DB.
export function signingKey() {
  if (config.signingSecret) return config.signingSecret;
  let k = kvGet('signing_key');
  if (!k) { k = crypto.randomBytes(32).toString('base64url'); kvSet('signing_key', k); }
  return k;
}

export function closeDb() { if (db) { db.close(); db = undefined; stmtCache.clear(); } }
