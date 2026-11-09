# NEBIUS — Final Implementation Evidence Report

Date 2026-11-09 · Branch `claude/nebius-platform-build-1j2641` · Approx-Ai reference commit `7333e18dfaef1abc52dbde5a123263ba7989046b`

## Headline facts
- **Nick 4.8 is NOT trained.** No free GPU was reachable from the build environment. NEBIUS reports this as `NO FREE GPU AVAILABLE` /
  `WAITING_FOR_GPU`, and no model artifact was created. Nothing in this report claims otherwise.
- The rest of the platform is implemented and exercised against real components (Docker sandboxes, Jupyter kernels, an S3 server with
  SigV4 auth, the real Approx-Ai repository, the Hugging Face Hub, a real browser, and the APK's network code on a JVM).

## Acceptance conditions (master prompt §22)
| Condition | Status | Evidence |
|---|---|---|
| Existing Approx AI application remains functional | ✅ | Approx-Ai backend tests 28/28 pass before and after; repo untouched (`git status` clean); NEBIUS never writes to it |
| Existing Nick 4.8 pipeline preserved | ✅ | Imported read-only; SHA-256 of 12 pipeline files recorded; tampering blocks runs (test 04) |
| Projects, folders, files connected to backend storage | ✅ | Tests 02 + 06 (local + S3), Playwright upload/verify |
| Compute instances reflect real provider state | ✅ | Docker inspect drives state; external kill → `UNAVAILABLE` (test 03) |
| GPU resources never fabricated | ✅ | Only nvidia-smi / provider data; this host reports no GPU; mock provider is test-only and rejected |
| Free-only policy enforced | ✅ | Paid providers `INELIGIBLE_FOR_FREE_ONLY_MODE`; verify/enable refused (test 03) |
| Training success only after real verification | ✅ (gate) / ⛔ (no run) | Evidence verifier tests (test 04); mock output → FAILED/REJECTED (test 03) |
| Android APK builds | ✅ | `release/NEBIUS-0.1.0-debug.apk`, SHA-256 `f18c7843…6eb18`, v2/v3 signed |
| APK connects to backend | ✅ (network layer) / ⚠ (UI on device) | 22/22 JVM checks of the APK's `Api.java` against a live backend; no device available |
| Security and access-control tests pass | ✅ | 24/24 backend tests incl. isolation, RBAC, CSRF, API keys |

## Real Nick 4.8 pipeline output captured in this environment (CPU stage, isolated container, no network)
`python -m approx_data.build` + `python train_qlora.py --dry-run` from a copy of the imported pipeline:
```
dataset_version nick-sft-nebius · read 45 · rejected 0 · pii_redactions 0
train.jsonl 41 records  sha256 fccfa9ae065706f5950c1b9063e15d15a8295f01fc08ad5f3a6a26bcfc806547
eval.jsonl   4 records  sha256 f3016d82b6da30a303323c0b4ba6ec43fc1ed92feac482ff96f5e7d874197f02
languages en 33 · roman-ur 9 · ur 3 · content fingerprint 18c09e6644df3c0b974cf28fade78c27bb3ed802b8a7ec0e7390838a706e151d
production_ready: false — only 45 records (< 20000); 18 domains below 500 examples
dataset OK: 41 train / 4 eval · plan: examples_per_step 16, steps_per_epoch 2, total_steps 6
dry run: config + dataset validated; no model loaded
```
Preflight (live): repository ✔ · config ✔ · dataset ✔ (not production-ready) · base model `Qwen/Qwen2.5-3B-Instruct` ✔ resolved on the
Hub (3.09 B params) · VRAM estimate ≈ 9–10 GB → requirement ≥ 14 GB (pipeline minimum) · GPU ✖ `NO FREE GPU AVAILABLE` → status
`WAITING_FOR_GPU`.

## Final deliverables (master prompt §22) → location
| # | Deliverable | Location |
|---|---|---|
| 1 | Source code | `nebius/` |
| 2 | Console frontend | `nebius/web/` · screenshots `docs/screenshots/` |
| 3 | Backend APIs | `nebius/backend/src/` (129 endpoints) · `docs/API.md` |
| 4 | Schema & migrations | `backend/src/db.js` · `docs/DATABASE.md` |
| 5 | Org & project management | `routes/orgs.js`, `routes/projects.js` |
| 6 | File & storage system | `routes/files.js`, `storage/` |
| 7 | Compute Engine | `compute.js`, `providers/dockercpu.js` |
| 8 | Free-only GPU adapters | `providers/` · `docs/GPU_PROVIDERS.md` |
| 9 | Notebook integration | `routes/notebooks.js`, `deploy/jupyter.Dockerfile` |
| 10 | Secure terminal | `routes/terminal.js` |
| 11 | AI training engine | `training/engine.js`, `training/evidence.js` |
| 12 | Nick 4.8 integration | `training/nick48.js`, `routes/training.js` |
| 13 | Job scheduler | `scheduler.js`, `jobs/command.js` |
| 14 | Monitoring & logs | `metrics.js`, `routes/monitoring.js` |
| 15 | API management | `routes/apikeys.js` |
| 16 | Security & IAM | `security.js`, `iam.js` · `docs/SECURITY.md` |
| 17 | Android APK | `release/NEBIUS-0.1.0-debug.apk` + `release/SHA256SUMS` · source `android/` |
| 18 | APK build documentation | `docs/ANDROID.md` |
| 19 | Installation instructions | `docs/DEPLOYMENT.md`, `docs/ANDROID.md`, `README.md` |
| 20 | Automated test report | `docs/TEST_REPORT.md` |
| 21 | Deployment guide | `docs/DEPLOYMENT.md` |
| 22 | Known limitations | `docs/KNOWN_LIMITATIONS.md` |
| 23 | Evidence report | this file |

## Code size
Backend 4,774 lines (zero dependencies) · tests 737 · web console 1,172 · Android 989 (Java) — plus docs.
