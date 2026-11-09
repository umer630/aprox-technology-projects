# NEBIUS — Automated Test Report

Run date: 2026-11-09 · Node v22.23.4 · Docker 29.9.2 · No GPU on the test host.

## Backend: `cd nebius/backend && npm test` → **24 tests, 24 pass, 0 fail, 0 skipped** (≈39 s)
(The S3 test runs when `S3_TEST_ENDPOINT` is set; it ran against a local SeaweedFS S3 gateway with SigV4 credentials enforced.)

| File | Test | What it proves |
|---|---|---|
| 01_auth_iam | signup → verification → web login + CSRF → logout | email tokens single-use; unverified users can't write; CSRF enforced; cookie flags |
| | lockout; password reset revokes sessions | 8 failures → 423; reset token from mail; old bearer token → 401 |
| | organizations | invite → accept bound to email; viewer can't invite; outsider 404; last-admin protection; removal revokes access |
| | projects | create (Project ID), edit, archive = read-only, unarchive, delete requires typed Project ID, activity history |
| | isolation & RBAC | 6 project endpoints → 404 for strangers; org viewer read-only; project-level grant raises role |
| | API keys | raw key never stored; scope enforcement; bound to one project; no account access; revocation → 401; inference 503 `no_verified_model`; per-key rate limit 429 |
| | security headers | nosniff, DENY, CSP; provisional-name notice |
| 02_storage | folders, integrity upload, signed download, preview, versions | nested folders; checksum mismatch rejected; download bytes + `X-Checksum-Sha256`; tampered link 403; overwrite → v2; restore v1 → v3 |
| | rename/move/copy/trash/restore/purge/search/sort | no folder cycles; copy re-hashes; sort by size; search with path; folder tree trash/restore; purge deletes the object from disk |
| | integrity & policy | at-rest tampering detected by verify; `.exe` and `MZ` content blocked; empty file; quota 413; cross-project 404; signed link dies after access revoked |
| 03_compute_scheduler | free-only policy | paid providers `INELIGIBLE_FOR_FREE_ONLY_MODE`, verify/enable refused (409); Colab manual-only; Kaggle needs verification + confirmation; live health = `unconfigured`; no secrets in responses |
| | GPU availability honest | `NO FREE GPU AVAILABLE` with reasons; no fabricated GPUs |
| | Compute Engine (real Docker) | create → RUNNING (observed via docker inspect) with live `docker stats`; attached job runs inside it as UID 1000; stop/start; invalid transitions 409; container killed externally → `UNAVAILABLE`; delete; event history |
| | scheduler (real Docker) | sandbox job output; **no network** inside; failure exit 3; timeout → TIMED_OUT; manual retry; cancel running job; pause unsupported for commands; duplicate 409; idempotency key; failed dependency → BLOCKED; notifications |
| | GPU job never on CPU; mock never accepted | `training.qlora` → `WAITING_FOR_GPU` (`NO FREE GPU AVAILABLE`); with test-only mock provider enabled the job runs but ends **FAILED** and the model artifact is **REJECTED** |
| 04_training | evidence verifier | full fixture COMPLETE; smoke run, all-zero LoRA-B, tampered package, verification false, no GPU, mock provider, wrong base model, empty dir, corrupt safetensors → REJECTED |
| | config validation & VRAM | invalid lr/rank/path/model rejected; bf16-on-T4 warning; estimate 5–16 GB for Nick config; exact LoRA param count (29,933,568) |
| | **Nick 4.8 end-to-end (real)** | import of the real Approx-Ai repo @ 7333e18 → IMPORTED with hashes; read-only bits; preflight: repo/config/dataset pass, **Hugging Face check of Qwen/Qwen2.5-3B-Instruct passes (resolved SHA)**, GPU = NO FREE GPU AVAILABLE → `WAITING_FOR_GPU`; train → **`training.prepare` runs the real dataset build + `train_qlora.py --dry-run` in an isolated container → SUCCEEDED**; `training.qlora` → WAITING_FOR_GPU; no model claimed; tampering with `train_qlora.py` → preflight BLOCKED |
| | manual evidence upload | a folder claiming COMPLETE without weights/verification/hashes → REJECTED; report stored in project storage |
| 05_notebooks_terminal_ops | notebooks (real Jupyter) | per-project container; `6*7` → stream `answer 42` + result `42`; **Internet blocked** in kernel; kernel UID 1000; dataset mount; outputs saved as versions; other user 404; invalid notebook rejected |
| | terminal (real Docker) | `id -u` = 1000; network blocked; read-only rootfs; history for reconnect; audit log per command; other user 404; closed session refuses commands |
| | dashboard/monitoring/logs | real counts; host CPU measured; GPU reported unavailable; health OK |
| | search/notifications/backup | search respects isolation; read-all; backup manifest with objects; non-admin 403 |
| 06_s3_storage | S3 (SigV4) | bucket create; wrong secret refused by server; API upload lands in bucket; signed download byte-identical; integrity; purge removes object |

## Web console: Playwright (`/tmp` script, Chromium) — **0 console errors, 0 page errors**
Desktop 1366×860: login → create project → folder → upload → file detail + integrity verify → provider health check → GPU tab
(`NO FREE GPU AVAILABLE`) → create instance → instance detail → AI Training import + preflight → notebook create + run cell (real
kernel output) → terminal session (`uid=1000`) → jobs, monitoring, logs, API, IAM, notifications, settings, admin, help, search.
Phone (Pixel 7 emulation): login, dashboard, drawer, bottom 3-button nav; **no horizontal overflow**.

## Android
`./build.sh debug` → APK built, `apksigner verify` v2/v3 OK, `aapt dump badging` OK; `./build.sh release` without a keystore refuses.
`jvmtest/run.sh` (APK's own `Api.java` vs live backend): **22/22 pass**. Not installed on a device/emulator (none available).

## Existing Approx AI
`umer630/Approx-Ai/backend npm test`: **28/28 pass** before and after this work; the checkout has no modifications (`git status` clean).

## Not tested (cannot be, here)
Real GPU training, Kaggle API (kaggle.com blocked by network policy), ClamAV, real mail delivery, PostgreSQL, deployment image build,
APK on a device.
