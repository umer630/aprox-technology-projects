# NEBIUS — Architecture & Component Inventory

> Provisional internal name; not affiliated with Nebius Group / Nebius AI Cloud.

## 1. System overview

```
 Web console (vanilla ES modules, strict CSP) ─┐
 Android app (native Java, no WebView)       ─┼─ HTTPS ─▶ NEBIUS backend (Node 22, zero npm deps, single process)
 Automation (nbk_ API keys)                   ─┘            http.js → security.js (auth/CSRF/rate limit) → iam.js (RBAC) → routes/*
                                                            scheduler.js (SQLite-leased queue) · background.js (health, reconcile, reap)
                                                            providers/ (free-only policy) · compute.js · training/ · storage/
                    ┌───────────────────────────┬───────────────┼─────────────────────────┬────────────────────────────┐
              SQLite (WAL) metadata     Object storage     Docker engine (CPU sandboxes)   GPU providers (free only)
              nebius.db                 local fs | S3      instances · terminal · jobs ·   kaggle (API, via Approx runner)
                                        (SigV4)            notebook kernels (per project)  local-nvidia (nvidia-smi)
                                                                                           colab / studio-lab (manual evidence)
                                                                                           paid clouds → INELIGIBLE
                                                     Approx-Ai repo (read-only import @ commit) → pipeline scripts run from per-job copies
```

## 2. Modules (A–R of the master prompt) → implementation

| # | Module | Where | Status |
|---|---|---|---|
| A | Frontend console | `web/` (`js/app.js` shell, `js/views/*`) | Implemented, browser-tested (Playwright desktop + Pixel 7) |
| B | Backend API | `backend/src/server.js`, `http.js`, `routes/*` — 129 endpoints | Implemented, tested |
| C | Authentication & IAM | `routes/auth.js`, `security.js`, `iam.js` | Implemented, tested |
| D | Organizations & projects | `routes/orgs.js`, `routes/projects.js` | Implemented, tested |
| E | File management | `routes/files.js` | Implemented, tested |
| F | Object storage | `storage/index.js` (local), `storage/s3.js` (S3 SigV4) | Both implemented; S3 tested against a live SigV4-enforcing server (SeaweedFS) |
| G | Compute Engine | `compute.js`, `providers/dockercpu.js`, `routes/compute.js` | Real Docker CPU instances; tested |
| H | GPU provider adapters | `providers/catalog.js`, `providers/index.js`, `kaggle.js`, `localnvidia.js`, `mock.js` (test-only) | Implemented; **no free GPU reachable from this build environment** |
| I | Notebook engine | `routes/notebooks.js`, `deploy/jupyter.Dockerfile` | Real Jupyter kernels in per-project containers; tested |
| J | Terminal | `routes/terminal.js` | Docker-sandboxed command terminal; tested |
| K | AI training engine | `training/engine.js`, `training/evidence.js` | Config validation, VRAM estimate, HF validation, evidence verifier; tested |
| L | Job scheduler | `scheduler.js`, `jobs/command.js` | Implemented; tested |
| M | Monitoring & logging | `metrics.js`, `routes/monitoring.js`, request/audit/security/job/terminal logs | Implemented; real measurements only |
| N | API gateway | API keys, scopes, per-key rate limit, usage, request logs (`routes/apikeys.js`, `server.js`) | Implemented; tested |
| O | Notifications | `notifications` table, `routes/misc.js`; Android system notifications by polling | Implemented |
| P | Admin console | `routes/admin.js`, web `#/admin` | Implemented |
| Q | Android app | `android/` | Debug APK built; network layer tested on JVM against the backend; **not run on a device** |
| R | Database & backup | `db.js` (versioned migrations), `backup.js`, `cli.js backup` | Implemented; backup tested |

## 3. Key design decisions
- **Same stack as Approx AI** (Node 22 built-ins, SQLite, vanilla JS, native Java Android): see `AUDIT.md §4`. No npm dependencies → no supply-chain exposure, and both products share the audited auth/CSRF/HTTP code.
- **Nothing runs on the API host.** User code runs only in Docker containers with `--network none` (jobs, terminal, instances) or an
  `--internal` network (notebook kernels), `--cap-drop ALL`, `no-new-privileges`, non-root UID 1000, memory/CPU/PID limits.
- **Truth over appearance.** Instance state comes from `docker inspect`; GPU facts from `nvidia-smi` or the provider; metrics from the OS;
  anything unmeasurable is returned as `{available:false, reason}`. The mock GPU provider exists only when `NEBIUS_ENV=test`.
- **Training success is a verification result, not a process exit code.** `training/evidence.js` re-hashes all files, parses the
  safetensors header and checks LoRA-B ≠ 0 before a `training.qlora` job may become `SUCCEEDED`.
- **Approx-Ai is integrated by reference**: cloned at a recorded commit, made read-only, SHA-256 of 12 pipeline files recorded and
  re-checked before every run; scripts run from a per-job copy.

## 4. Request lifecycle
`server.js` → static files (non-API) or: security headers → CORS allow-list → method override → route match → `resolveAuth`
(cookie / bearer session / API key) → per-API-key rate limit → CSRF (cookie sessions) → handler → `iam.projectAccess(ctx, id, perm, {scope})`
→ business logic → JSON. Every API request is logged in `request_logs` (route, status, latency, user, key).

## 5. Job lifecycle
`QUEUED` → (deps) `BLOCKED` | (GPU required & none eligible) `WAITING_FOR_GPU` → atomic claim with lease → `STARTING` → `RUNNING` →
`SUCCEEDED | FAILED | TIMED_OUT | CANCELLED`, or `PAUSED` (checkpointable jobs) → `QUEUED` on resume. Auto-retry up to `max_attempts`;
manual retry; crash recovery re-queues orphaned jobs whose lease expired. Duplicate prevention: identical active spec → 409 unless
`allow_duplicate`; `idempotency_key` returns the existing job.

## 6. Nick 4.8 flow
1. `import` → `git clone` Approx-Ai (or `APPROX_REPO_PATH`) → verify 12 required files, hash them, parse `nick-4.8-qlora.json`, count
   approved dataset records → `chmod -R a-w`.
2. `preflight` → integrity, config validation, dataset, Hugging Face base-model check (resolved SHA, license, params, architecture),
   VRAM estimate (≥ pipeline minimum 14 GB), free-GPU selection → `READY | WAITING_FOR_GPU | BLOCKED`.
3. `train` → `training.prepare` (CPU, isolated `python:3.12-slim`, no network: `approx_data.build` + `train_qlora.py --dry-run`) then
   `training.qlora` (GPU): Kaggle (push repo notebook via `kaggle_runner.py`, poll, download outputs) or local NVIDIA (pipeline stages
   `preflight → data → train → verify → package → status`).
4. Outputs → evidence verifier → model artifact `VERIFIED` (adapter package stored in project storage) or `REJECTED` with reasons;
   evidence report (`evidence_report.md` + `evidence.json`) saved under `nick-4.8/evidence/<job>/`.
5. Manual providers (Colab free tier): user runs the notebook and uploads the output folder → same verifier.
