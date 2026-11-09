# NEBIUS — Known Limitations & Blockers (honest list)

## Blockers outside the code
| # | Blocker | Effect | What unblocks it |
|---|---|---|---|
| B1 | **No free GPU reachable** from the build environment (no NVIDIA GPU; kaggle.com blocked by network policy; no `KAGGLE_API_TOKEN`; Approx-Ai diagnostics show this Kaggle account did not get GPUs attached) | **Nick 4.8 has NOT been trained.** Training jobs correctly sit in `WAITING_FOR_GPU`. No model artifact exists. | Verified free Kaggle account + token on a server that can reach kaggle.com, or a self-hosted NVIDIA GPU, or a manual Colab run + evidence upload |
| B2 | **Trademark**: "Nebius" belongs to an existing AI cloud company | Name cannot ship | Rename or obtain trademark, domain and app-store clearance before any release |
| B3 | No Android device/emulator | APK UI not exercised on Android | Install the debug APK on a device (ANDROID.md) |
| B4 | No release signing key supplied | Only a debug APK exists | Provide a protected keystore; `./build.sh release` |
| B5 | No hosting/mail/S3 credentials | Not deployed; mail uses the dev outbox | Operator configuration (DEPLOYMENT.md) |
| B6 | Debian mirrors blocked inside image builds in this sandbox | `deploy/Dockerfile` not verified by a build here | Build on a normal network |

## Product limitations (v0.1.0)
- **Database is SQLite**, not PostgreSQL (migration path in DATABASE.md). Single node; scheduler leases make it safe per node, but
  horizontal scaling needs Postgres + a shared queue (Redis) first.
- **Terminal** is command-at-a-time over SSE (no PTY): full-screen programs (vim, top) are not supported. WebSocket PTY is a roadmap item.
- **Notebook isolation is per project** (one kernel container per project), not per user. The editor is NEBIUS's own cell editor
  calling Jupyter's API — not the full JupyterLab UI. Kernels are CPU-only and have no Internet; packages must be in the image.
- **Containers rely on Docker's default runtime** (namespaces + cgroups + seccomp). For hostile multi-tenant use, run a sandboxed runtime
  (gVisor/Kata) and a dedicated Docker engine.
- **Process must run as non-root**; as root the imported pipeline's read-only bits are not enforced (SHA-256 checks still catch edits).
- **Kaggle path** runs the repository's Kaggle notebook unchanged (custom training configs need the local-NVIDIA path). Kaggle exposes
  no GPU-quota API, so availability is confirmed only by the pipeline's in-run preflight. Kaggle sessions cannot be cancelled via the
  runner API. Kaggle resume across sessions requires attaching the previous output (pipeline feature) — not automated by NEBIUS.
- **Pause/resume** is implemented for training jobs by stopping the provider run and re-submitting; the pipeline resumes from its own
  checkpoints. `checkpoints` table is populated only when a provider reports checkpoints (not wired for Kaggle).
- **Compute Engine** offers CPU sandbox instances only (no SSH, no persistent disks, no public networking). GPU work is job-based.
- **Malware scanning** is an integration point (ClamAV) — off unless `CLAMDSCAN_PATH` is set; uploads are marked `not_scanned`.
- **Provider facts** for Kaggle/Colab/Studio Lab could not be re-verified from this environment (sites blocked); they are labelled so.
- **Dataset**: the Approx seed set has 45 records and is *not production-ready* (the pipeline's own verdict). A run on it validates the
  pipeline only. Licensed external datasets must be approved in `dataset_sources.json` (Approx-Ai repo) first.
- **Inference endpoint** proxies to an operator-provided OpenAI-compatible server; NEBIUS does not host models itself.
- No 2FA/SSO, no billing (by design), no email change flow, no org deletion UI, no folder copy (file copy only).
- Android: compiled against the `android-23` platform; notebooks open in the browser (no on-device notebook editor); system
  notifications only while the app is running (no push service).
- No external penetration test has been performed.
