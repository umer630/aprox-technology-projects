# NEBIUS — AI Cloud Console (provisional name)

> **Name notice:** "NEBIUS" is a provisional internal development name. It is **not affiliated** with Nebius Group N.V. or Nebius AI
> Cloud. Trademark, domain and app-store clearance are required before any release.

NEBIUS is an AI cloud platform by Approx Technology: organizations and projects, a cloud file manager on S3-compatible storage, a Compute
Engine of isolated sandboxes, a **free-only** GPU provider framework, a job scheduler, Jupyter notebooks, a browser terminal, monitoring,
API keys, an admin console — and a training engine wired to the existing **Approx AI Nick 4.8** QLoRA pipeline
(`umer630/Approx-Ai`), which it uses read-only.

**Status (v0.1.0):** platform implemented and tested (24/24 backend tests, browser E2E, APK network layer 22/22). **Nick 4.8 is not
trained yet — no free GPU was available**; jobs wait in `WAITING_FOR_GPU` and success is reported only after evidence verification.
See `docs/EVIDENCE_REPORT.md` and `docs/KNOWN_LIMITATIONS.md`.

| Part | Path |
|---|---|
| Backend (Node 22, zero npm deps, SQLite, Docker sandboxes) | `backend/` |
| Web console (no build step, strict CSP, responsive, 3-button nav) | `web/` |
| Android app (native Java) + debug APK | `android/`, `release/` |
| Deployment (Dockerfile, compose, Jupyter kernel image, env example) | `deploy/` |
| Documentation | `docs/` — AUDIT · ARCHITECTURE · DATABASE · API · SECURITY · GPU_PROVIDERS · ANDROID · DEPLOYMENT · TEST_REPORT · KNOWN_LIMITATIONS · ROADMAP · EVIDENCE_REPORT |

## Quick start
```bash
cd nebius/backend
npm run dev                                   # http://localhost:8090
node src/cli.js verify-email you@example.com && node src/cli.js promote you@example.com
docker build -t nebius-jupyter:local -f ../deploy/jupyter.Dockerfile ../deploy   # notebook kernels
npm test                                      # 24 integration tests (needs Docker)
```
Android: `cd nebius/android && ./build.sh debug` (see `docs/ANDROID.md`).
