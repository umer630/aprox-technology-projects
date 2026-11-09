# NEBIUS — Repository Audit (performed before any change)

Audit date: 2026-11-09 · Auditor: build agent · Branch: `claude/nebius-platform-build-1j2641`

> **Branding note.** "Nebius" is also the name of an existing AI cloud company (Nebius Group / Nebius AI Cloud).
> NEBIUS is used here only as a **provisional internal development name**. This project has no affiliation with
> that company. Trademark, domain and app-store name clearance is a **pre-release blocker** (see `KNOWN_LIMITATIONS.md`).

## 1. What was inspected

| Repository | Access | Contents |
|---|---|---|
| `umer630/aprox-technology-projects` (this repo, push access) | `main` = 1 commit, `README.md` only. Other branches: `claude/ab-travel-splash-3d-prod-04i5sc` (3D animation renderer, 66 files), `claude/video-conversion-3d-huftxh` (video→3D script, 4 files) | **No Approx AI application code and no Nick 4.8 pipeline here.** |
| `umer630/Approx-Ai` (public, read-only from this session, HEAD `7333e18`) | 101 files, 8.1 MB | **The existing Approx AI application and the Nick 4.8 training pipeline.** |

Consequence: NEBIUS is built in this repository under `nebius/`, and integrates with Approx AI **by reference**
(it imports the Approx-Ai repository at a pinned commit into a read-only workspace). No file of Approx-Ai was
modified, moved or deleted; this session cannot push to it.

## 2. Existing Approx AI architecture (umer630/Approx-Ai)

| Area | Technology | Notes |
|---|---|---|
| Backend | **Node.js 22, zero npm dependencies** (`node:http`, `node:sqlite`, `node:crypto`) | Custom router (`http.js`), auth/CSRF/rate-limit (`security.js`), SQLite WAL (`db.js`), SSRF-safe fetch, quota, Master Router over Nick/Hike/Sona/FAB model families |
| Database | SQLite via `node:sqlite` | ~30 tables; tenant isolation by `user_id` filters |
| Auth | scrypt (N=2^15), SHA-256-hashed 256-bit session tokens, HttpOnly SameSite=Strict cookie + CSRF header (web), bearer token (Android), `apx_` API keys | Email verification / reset via outbox transport in dev |
| Web | Vanilla ES-module SPA, **no build step**, strict CSP (`script-src 'self'`) | Three-button navigation (New chat · History · Settings) |
| Android | **Native Java, no Gradle, no WebView, no third-party libs**; built by `android/build.sh` with Ubuntu `aapt`, `dalvik-exchange`, `zipalign`, `apksigner` against `android-23` | Keystore AES-GCM token storage; `jvmtest/ApiJvmTest.java` tests the network layer on the JVM |
| Training | Python: `train_qlora.py`, `verify_adapter.py`, `package_adapter.py`, `approx_data/` builder, `colab/colab_pipeline.py` + `nick_4_8_qlora_colab.ipynb`, `kaggle/kaggle_pipeline.py` + `kaggle_runner.py` | Base `Qwen/Qwen2.5-3B-Instruct`, QLoRA NF4 + double quant, LoRA r16/α32/dropout .05, seed 4848 |
| Deploy | `deploy/Dockerfile`, `docker-compose.yml`, `approx.env.example` | Not deployed |
| Tests | `backend/test/api.test.js` (node:test), `training/tests/*.py` | **Baseline run in this session: 28/28 backend tests pass.** |
| CI | none (`.github/workflows` absent) | — |

### Nick 4.8 pipeline — files that must be preserved
`training/colab/nick_4_8_qlora_colab.ipynb`, `training/colab/colab_pipeline.py`, `training/colab/requirements-colab.txt`
(the master prompt names `requirements-colab.txt`; it lives in `training/colab/`), `training/train_qlora.py`,
`training/verify_adapter.py`, `training/package_adapter.py`, `training/configs/nick-4.8-qlora.json`,
`training/configs/dataset_sources.json`, `training/data/seed/approx_seed_v0_1.jsonl` (45 records),
`training/approx_data/*`, `training/kaggle/*`.

Pipeline status per its own README: **Nick 4.8 is NOT trained.** Dataset is the 45-record seed set
(`production_ready: false`). Completion requires evidence: GPU training completed (not smoke), adapter
safetensors present, adapter reload + inference, `verification_passed=true`, SHA256SUMS verified, metadata.

Evidence files the pipeline writes (consumed by NEBIUS): `train_metadata.json`, `verification.json`,
`SHA256SUMS`, `nick-4.8-adapter-<ver>.tar.gz`, `completion_status.json` (Kaggle) / `completion_report.json` (Colab).

## 3. Build environment facts (this session)

| Capability | Result |
|---|---|
| Node | v22.23.4 (`node:sqlite`, global `fetch`/`WebSocket` available) |
| Python | 3.13; `jupyter_server` + `ipykernel` installable |
| Java | OpenJDK 21 |
| Android toolchain | Installed from Ubuntu: `aapt`, `dalvik-exchange`, `zipalign`, `apksigner`, `android-sdk-platform-23`. No emulator/device. |
| Docker | Daemon startable; sandboxed containers (`--network none --cap-drop ALL`) run |
| GPU | **None** (`nvidia-smi` absent) |
| Network | `huggingface.co` reachable; `www.kaggle.com` and `dl.google.com` **blocked (proxy 403)** |

## 4. Dependency & compatibility report

The master prompt *prefers* Next.js/FastAPI/PostgreSQL/Redis "if compatible" and states these are "not
permission to rewrite". Decision, with justification:

| Preference | Decision | Why |
|---|---|---|
| Next.js + React + Tailwind | **Not adopted for v1.** Vanilla ES modules, no build step (same as Approx AI) | Same security model (strict CSP, no inline script), same team skills, zero supply chain; a second front-end stack would split the codebase. Revisit if the console outgrows it. |
| Python FastAPI | **Not adopted.** Node 22 zero-dependency backend (same as Approx AI) | Reuses the proven Approx auth/CSRF/HTTP code paths; Python is still used where it belongs — the training pipeline is invoked as subprocesses. |
| PostgreSQL | **SQLite (WAL) in v1**, all SQL kept portable; Postgres is a roadmap item | A Postgres driver would be the first runtime dependency; node has no built-in client. Flagged as a production limitation. |
| Redis + task queue | **SQLite-backed queue with leases** | Single-node correctness (no duplicate execution) without a second service. Redis needed only for multi-node scaling. |
| S3 / MinIO | **Implemented**: local adapter + S3 SigV4 adapter (zero deps) | — |
| JupyterLab | Jupyter Server REST + kernel WebSocket gateway | Node 22 ships a WebSocket client |
| Capacitor | **Rejected** — existing Android client is native Java without Gradle; Capacitor needs Gradle + Android SDK downloads (`dl.google.com` blocked). Separate native client on the shared API. |
| PyTorch/Transformers/PEFT/bitsandbytes | Unchanged — used by the existing pipeline on the GPU host only | Versions pinned by `requirements-colab.txt` / `requirements-kaggle.txt` |

## 5. Security risks identified

| # | Risk | Severity | Mitigation in NEBIUS |
|---|---|---|---|
| R1 | Browser terminal / notebooks = remote code execution by design | Critical | Execution only inside Docker sandboxes (`--network none`, `--cap-drop ALL`, `no-new-privileges`, non-root, read-only rootfs, pids/mem/cpu limits); never on the API host; every command audit-logged |
| R2 | Cross-tenant access to files/models | High | Every resource row carries `org_id` + `project_id`; all access goes through `iam.js#projectAccess` on the server; isolation tests |
| R3 | Accidental paid cloud spend | High | Free-only policy engine: providers requiring a card/billing are `INELIGIBLE_FOR_FREE_ONLY_MODE` and have no create code path; activation requires superadmin verification + passing health check |
| R4 | Fabricated GPU/training claims | High | No metric is synthesized; mock provider exists only under `NEBIUS_ENV=test` and is labelled; training `SUCCEEDED` requires the evidence verifier to recompute SHA-256 itself |
| R5 | Secrets (provider tokens) leakage | High | Env-only; never returned by the API, never logged; API keys hashed |
| R6 | Malicious uploads | Medium | Size limits, name sanitisation, content-type sniff, optional ClamAV hook, downloads always `attachment` + `nosniff` |
| R7 | Trademark conflict with "Nebius" | Legal | Pre-release blocker, documented |
| R8 | SSRF via provider/notebook URLs | Medium | URLs only from operator env, never from users |
| R9 | SQLite single-writer limits | Operational | WAL + busy timeout; Postgres roadmap |

## 6. Safe implementation plan
1. New top-level folder `nebius/` in this repo; nothing outside it changes except the root README link.
2. Approx-Ai is never modified; it is imported read-only by commit SHA, hashed, and its scripts are run from a
   per-job **copy** so outputs never land in the source tree.
3. Build order: backend core (auth/IAM/orgs/projects) → storage → providers/compute → scheduler/training/Nick →
   notebooks/terminal/monitoring/API → web console → Android → docs/test reports. Tests after each module.
4. Re-run the Approx AI test suite at the end to confirm it is unaffected.
