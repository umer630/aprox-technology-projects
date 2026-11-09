# NEBIUS API Specification (v1)

Base URL: your server (e.g. `https://nebius.example.com`). All bodies are JSON unless noted. Live machine-readable
route list: `GET /api/meta/endpoints`.

## Authentication
| Credential | How | Used by | CSRF |
|---|---|---|---|
| Web session | `POST /api/auth/login` → `nebius_session` cookie (HttpOnly, SameSite=Strict, Secure on HTTPS) | Console | `X-CSRF-Token` header required on POST/PUT/PATCH/DELETE (token from login / `GET /api/auth/me`) |
| Mobile session | `POST /api/auth/login` with `"client":"mobile"` → `token` in body; send `Authorization: Bearer <token>` | Android app | not needed (not ambient) |
| API key | `Authorization: Bearer nbk_…` — bound to ONE project, scoped, rate-limited, expiring | Automation | not needed |

API-key scopes: `projects:read files:read files:write compute:read compute:write jobs:read jobs:write inference`.
API keys can never call account, organization or admin endpoints, nor project admin operations.

Method override: clients without PATCH/PUT/DELETE may `POST` with `X-HTTP-Method-Override: PATCH|PUT|DELETE`.

## Errors
```json
{ "error": { "code": "insufficient_role", "message": "Requires developer role on this project", "request_id": "req_…" } }
```
Notable codes: `unauthorized` 401 · `csrf_failed` 403 · `email_not_verified` 403 · `insufficient_role` / `insufficient_scope` 403 ·
`not_found` 404 (also returned when you lack access — existence is not leaked) · `duplicate_job`, `name_taken`, `invalid_state`,
`last_admin` 409 · `INELIGIBLE_FOR_FREE_ONLY_MODE` 409 · `quota_exceeded` / `payload_too_large` 413 · `rate_limited` 429 (with `Retry-After`) ·
`account_locked` 423 · `no_verified_model`, `inference_backend_unavailable`, `terminal_unavailable`, `notebook_backend_unavailable` 503.

## Key request/response shapes

**Create project** `POST /api/projects` `{ "org_id", "name", "description?", "project_code?" }` → `201 { project }`.
**Delete project** `POST /api/projects/:id/delete` `{ "confirm": "<project_code>" }`.
**Upload** `PUT /api/projects/:id/upload?name=<file>&folder_id=<id>&overwrite=1` — raw body (streamed), optional header
`X-Expected-Sha256`. → `201 { file: { id, sha256, size_bytes, version, kind, scan_status } }`.
**Signed download** `POST /api/projects/:id/files/:fid/download-url` → `{ url: "/api/dl/<token>", expires_at, sha256 }`; the URL needs
no credentials, expires in 5 min (configurable), is HMAC-bound to file+version+object+user, and re-checks the user's access.
**Create instance** `POST /api/projects/:id/instances` `{ name, provider_id, machine_type, image }` → status is whatever the provider
reports (`RUNNING` only when confirmed).
**Create job** `POST /api/projects/:id/jobs` `{ type: "command", name, spec: { command, instance_id? }, priority 0–10, timeout_s, max_attempts, idempotency_key?, allow_duplicate?, depends_on? }`.
**Nick 4.8** `POST /api/projects/:id/nick48/import {ref?}` → `POST …/nick48/preflight {config?}` → `POST …/nick48/train {config?}` (creates
`training.prepare` [CPU] + `training.qlora` [GPU, depends on prepare]). Status `GET …/nick48` → `nick48_status` ∈
`NOT_IMPORTED NOT_TRAINED QUEUED WAITING_FOR_GPU BLOCKED STARTING RUNNING PAUSED FAILED COMPLETE`.
**Evidence (manual providers)** `POST /api/projects/:id/training/evidence { folder_id }` → `{ status: COMPLETE|REJECTED, reasons, evidence }`.
**Inference** `POST /api/v1/projects/:id/inference { messages:[{role,content}], max_tokens?, temperature?, model_artifact_id? }` (scope `inference`).
**Terminal exec** `POST …/terminal/sessions/:sid/exec { command }` → `text/event-stream`: `out {text}` … `exit {code, timed_out}`.
**Job log stream** `GET …/jobs/:jid/logs/stream` → `text/event-stream`: `log {text, offset}`, `status {status, progress}`.

## All endpoints (generated from the router)

### Health & meta

| Method | Path |
|---|---|
| `GET` | `/healthz` |
| `GET` | `/api/version` |
| `GET` | `/api/meta/endpoints` |

### Authentication & sessions

| Method | Path |
|---|---|
| `POST` | `/api/auth/signup` |
| `POST` | `/api/auth/verify-email` |
| `POST` | `/api/auth/resend-verification` |
| `POST` | `/api/auth/login` |
| `POST` | `/api/auth/logout` |
| `GET` | `/api/auth/me` |
| `PATCH` | `/api/auth/me` |
| `POST` | `/api/auth/forgot-password` |
| `POST` | `/api/auth/reset-password` |
| `POST` | `/api/auth/change-password` |
| `GET` | `/api/auth/sessions` |
| `DELETE` | `/api/auth/sessions/:id` |

### Organizations, invitations

| Method | Path |
|---|---|
| `GET` | `/api/orgs` |
| `POST` | `/api/orgs` |
| `GET` | `/api/orgs/:id` |
| `PATCH` | `/api/orgs/:id` |
| `GET` | `/api/orgs/:id/members` |
| `POST` | `/api/orgs/:id/invitations` |
| `DELETE` | `/api/orgs/:id/invitations/:inv` |
| `POST` | `/api/invitations/accept` |
| `PATCH` | `/api/orgs/:id/members/:uid` |
| `DELETE` | `/api/orgs/:id/members/:uid` |
| `GET` | `/api/orgs/:id/audit` |
| `GET` | `/api/orgs/:id/usage` |

### Projects & members

| Method | Path |
|---|---|
| `POST` | `/api/projects/:id/archive` |
| `POST` | `/api/projects/:id/unarchive` |
| `POST` | `/api/projects/:id/delete` |
| `GET` | `/api/projects/:id/members` |
| `PUT` | `/api/projects/:id/members/:uid` |
| `DELETE` | `/api/projects/:id/members/:uid` |
| `GET` | `/api/projects/:id/activity` |

### Files, folders, storage

| Method | Path |
|---|---|
| `GET` | `/api/projects/:id/browse` |
| `GET` | `/api/projects/:id/files` |
| `GET` | `/api/projects/:id/storage` |
| `POST` | `/api/projects/:id/folders` |
| `PATCH` | `/api/projects/:id/folders/:fid` |
| `DELETE` | `/api/projects/:id/folders/:fid` |
| `POST` | `/api/projects/:id/folders/:fid/restore` |
| `PUT` | `/api/projects/:id/upload` |
| `GET` | `/api/projects/:id/files/:fid` |
| `PATCH` | `/api/projects/:id/files/:fid` |
| `POST` | `/api/projects/:id/files/:fid/copy` |
| `DELETE` | `/api/projects/:id/files/:fid` |
| `POST` | `/api/projects/:id/files/:fid/restore` |
| `GET` | `/api/projects/:id/trash` |
| `POST` | `/api/projects/:id/trash/empty` |
| `POST` | `/api/projects/:id/files/:fid/versions/:v/restore` |
| `POST` | `/api/projects/:id/files/:fid/download-url` |
| `GET` | `/api/dl/:token` |
| `GET` | `/api/projects/:id/files/:fid/preview` |
| `POST` | `/api/projects/:id/files/:fid/verify` |
| `PUT` | `/api/projects/:id/files/:fid/content` |

### GPU providers & Compute Engine

| Method | Path |
|---|---|
| `GET` | `/api/providers` |
| `GET` | `/api/providers/:pid` |
| `POST` | `/api/providers/:pid/health` |
| `GET` | `/api/gpu/availability` |
| `GET` | `/api/projects/:id/instances` |
| `POST` | `/api/projects/:id/instances` |
| `GET` | `/api/projects/:id/instances/:iid` |
| `POST` | `/api/projects/:id/instances/:iid/start` |
| `POST` | `/api/projects/:id/instances/:iid/stop` |
| `POST` | `/api/projects/:id/instances/:iid/restart` |
| `DELETE` | `/api/projects/:id/instances/:iid` |

### Jobs (scheduler)

| Method | Path |
|---|---|
| `GET` | `/api/jobs/types` |
| `GET` | `/api/projects/:id/jobs` |
| `POST` | `/api/projects/:id/jobs` |
| `GET` | `/api/projects/:id/jobs/:jid` |
| `GET` | `/api/projects/:id/jobs/:jid/logs` |
| `GET` | `/api/projects/:id/jobs/:jid/logs/stream` |
| `GET` | `/api/projects/:id/jobs/:jid/metrics` |
| `POST` | `/api/projects/:id/jobs/:jid/cancel` |
| `POST` | `/api/projects/:id/jobs/:jid/pause` |
| `POST` | `/api/projects/:id/jobs/:jid/resume` |
| `POST` | `/api/projects/:id/jobs/:jid/retry` |
| `PATCH` | `/api/projects/:id/jobs/:jid` |

### AI training & Nick 4.8

| Method | Path |
|---|---|
| `POST` | `/api/projects/:id/nick48/import` |
| `GET` | `/api/projects/:id/nick48` |
| `POST` | `/api/projects/:id/nick48/preflight` |
| `POST` | `/api/projects/:id/nick48/train` |
| `POST` | `/api/projects/:id/training/validate` |
| `POST` | `/api/projects/:id/training/evidence` |
| `GET` | `/api/projects/:id/models` |
| `GET` | `/api/projects/:id/nick48/manual-run` |

### Notebooks

| Method | Path |
|---|---|
| `GET` | `/api/notebooks/backend` |
| `GET` | `/api/projects/:id/notebooks` |
| `POST` | `/api/projects/:id/notebooks` |
| `GET` | `/api/projects/:id/notebooks/:fid` |
| `PUT` | `/api/projects/:id/notebooks/:fid` |
| `POST` | `/api/projects/:id/notebooks/:fid/session` |
| `POST` | `/api/projects/:id/notebooks/:fid/execute` |
| `POST` | `/api/projects/:id/notebooks/:fid/interrupt` |
| `POST` | `/api/projects/:id/notebooks/:fid/restart` |
| `DELETE` | `/api/projects/:id/notebooks/:fid/session` |
| `POST` | `/api/projects/:id/notebooks/mount` |

### Terminal

| Method | Path |
|---|---|
| `GET` | `/api/projects/:id/terminal/sessions` |
| `POST` | `/api/projects/:id/terminal/sessions` |
| `GET` | `/api/projects/:id/terminal/sessions/:sid` |
| `POST` | `/api/projects/:id/terminal/sessions/:sid/exec` |
| `POST` | `/api/projects/:id/terminal/sessions/:sid/interrupt` |
| `DELETE` | `/api/projects/:id/terminal/sessions/:sid` |

### Monitoring & logs

| Method | Path |
|---|---|
| `GET` | `/api/monitoring/host` |
| `GET` | `/api/monitoring/health` |
| `GET` | `/api/projects/:id/monitoring` |
| `GET` | `/api/projects/:id/logs` |
| `GET` | `/api/admin/logs` |

### API keys & inference

| Method | Path |
|---|---|
| `GET` | `/api/apikeys/scopes` |
| `GET` | `/api/projects/:id/apikeys` |
| `POST` | `/api/projects/:id/apikeys` |
| `DELETE` | `/api/projects/:id/apikeys/:kid` |
| `POST` | `/api/v1/projects/:id/inference` |

### Dashboard, search, notifications

| Method | Path |
|---|---|
| `GET` | `/api/dashboard` |
| `GET` | `/api/search` |
| `GET` | `/api/notifications` |
| `POST` | `/api/notifications/:nid/read` |
| `POST` | `/api/notifications/read-all` |

### Admin (superadmin)

| Method | Path |
|---|---|
| `GET` | `/api/admin/users` |
| `PATCH` | `/api/admin/users/:uid` |
| `POST` | `/api/admin/providers/:pid/verify` |
| `POST` | `/api/admin/providers/:pid/enabled` |
| `POST` | `/api/admin/providers/health` |
| `GET` | `/api/admin/system` |
| `POST` | `/api/admin/backup` |

### Projects (core)

| Method | Path |
|---|---|
| `GET` | `/api/projects` |
| `POST` | `/api/projects` |
| `GET` | `/api/projects/:id` |
| `PATCH` | `/api/projects/:id` |
