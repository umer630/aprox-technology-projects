# NEBIUS — Database Design

Engine: SQLite (WAL, `foreign_keys=ON`, `busy_timeout=5000`) via `node:sqlite`. Migrations are forward-only and versioned in
`backend/src/db.js#MIGRATIONS`, recorded in `schema_migrations`; each runs in a transaction. NEBIUS uses its **own** database
(`$NEBIUS_DATA_DIR/nebius.db`) — it never opens or alters the Approx AI database, so no Approx data can be destroyed.

Large blobs never enter the database: `storage_objects` holds only the object key, size and SHA-256.

## Entities (master prompt §19 → tables)

| Entity | Table | Key columns / constraints |
|---|---|---|
| Users | `users` | email UNIQUE NOCASE, scrypt hash, `platform_role` ∈ user/superadmin, status, lockout fields |
| Sessions | `sessions` | SHA-256 token hash UNIQUE, CSRF token, client web/mobile, expiry, revocation |
| Email tokens | `email_tokens` | purpose verify/reset, hashed, single-use, expiring |
| Organizations | `organizations` | slug UNIQUE |
| Organization memberships | `org_memberships` | PK(org, user), role ∈ org_admin/developer/viewer |
| Invitations | `invitations` | hashed token, email-bound, expiring, revocable |
| Projects | `projects` | `project_code` UNIQUE (user-visible Project ID), status active/archived/deleted, storage quota |
| Project memberships | `project_memberships` | PK(project, user), role ∈ project_admin/developer/viewer |
| Folders | `folders` | parent_id (nesting), UNIQUE(project, parent, name) among non-deleted, soft delete |
| Files | `files` | UNIQUE(project, folder, name) among non-deleted, kind, mime, sha256, current_version, scan_status, soft delete |
| File versions | `file_versions` | UNIQUE(file, version) → storage object |
| Storage objects | `storage_objects` | backend, object_key UNIQUE, size, sha256 |
| GPU providers | `provider_state` (+ static `providers/catalog.js`) | admin verification (who/when/notes), enabled, last health, last success |
| GPU resources | `gpu_resources` | only what a provider/runtime reported at the last health check (replaced each check) |
| Compute instances | `compute_instances` | status CHECK in the 7 required states + DELETED, provider_ref, limits, confirmed_at |
| Instance history | `instance_events` | from → to, detail, actor |
| Notebook sessions | `notebook_sessions` | kernel id, backend mode, user, activity |
| Terminal sessions | `terminal_sessions`, `terminal_history` | container, expiry, every command + exit code + output |
| Training jobs / jobs | `jobs` | status CHECK, priority, spec, requirements (gpu, min_vram_gb, depends_on), lease, attempts, idempotency UNIQUE(project, key) |
| Job events | `job_events` | |
| Checkpoints | `checkpoints` | job, step, location, sha256 |
| Source imports | `source_imports` | repo, commit, local path, manifest (file hashes, config, datasets), problems |
| Model artifacts | `model_artifacts` | status CHECK ∈ VERIFIED/REJECTED, adapter sha256, evidence, reasons |
| API keys | `api_keys` | SHA-256 hash UNIQUE, project-bound, scopes, rate limit, expiry, revocation |
| Notifications | `notifications` | |
| Usage records | `usage_records` | storage_write bytes, cpu/gpu job wall seconds, api_call |
| Audit logs | `audit_logs` | actor, org, project, action, target, ip, detail |
| Security / API logs | `security_events`, `request_logs` | |
| Misc | `rate_buckets`, `mail_outbox`, `system_kv` (signing key) | |

Every tenant row carries `org_id` and `project_id`; `ON DELETE CASCADE` from `projects` cleans dependent rows, and project deletion
also deletes stored objects and containers through registered hooks.

## Backup & recovery
`node src/cli.js backup [dir]` or `POST /api/admin/backup`: `VACUUM INTO` snapshot (consistent while running) + copy of local objects +
`MANIFEST.json` with SHA-256 of every file. Restore: stop the server, copy `nebius.db` and `objects/` into `NEBIUS_DATA_DIR`, verify
hashes against the manifest, start. For S3, use bucket versioning/replication.

## PostgreSQL migration path (not done in v1)
SQL is kept portable (no SQLite-only functions in queries except the `COALESCE` expression indexes, which PostgreSQL supports).
Work needed: a `pg` client (first runtime dependency), `BEGIN IMMEDIATE` → `BEGIN`, `INSERT … ON CONFLICT` already compatible,
`INTEGER` epoch-ms timestamps → `BIGINT`, migration runner per dialect.
