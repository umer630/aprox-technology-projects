# NEBIUS — Deployment Guide

## Requirements
- Linux host dedicated to NEBIUS, Node.js ≥ 22.13, Docker Engine, git, Python 3 (Kaggle runner, optional).
- TLS-terminating reverse proxy (Caddy / nginx) — NEBIUS itself speaks HTTP on `PORT` (default 8090).
- Optional: S3-compatible bucket, ClamAV daemon, transactional mail API, NVIDIA GPU + drivers, OpenAI-compatible inference server.

## Local development
```bash
cd nebius/backend
npm run dev                                  # http://localhost:8090 — mail is printed to the console (outbox)
node src/cli.js verify-email you@example.com  # if you don't want to copy the code from the console
node src/cli.js promote you@example.com       # superadmin
docker build -t nebius-jupyter:local -f ../deploy/jupyter.Dockerfile ../deploy   # enables notebook execution
APPROX_REPO_PATH=/path/to/Approx-Ai npm run dev   # optional: import Nick 4.8 from a local checkout instead of GitHub
```

## Production (single node)
```bash
cp nebius/deploy/nebius.env.example nebius/deploy/nebius.env   # fill in; never commit
docker build -t nebius-jupyter:local -f nebius/deploy/jupyter.Dockerfile nebius/deploy
cd nebius/deploy && DOCKER_GID=$(getent group docker | cut -d: -f3) docker compose up -d --build
docker compose exec nebius node backend/src/cli.js promote admin@example.com
```
Or without containers: create user `nebius` (member of `docker`), `NEBIUS_ENV=production NEBIUS_DATA_DIR=/var/lib/nebius node backend/src/server.js`
under systemd. **Never run as root** (see SECURITY.md).

Reverse proxy must forward `X-Forwarded-For` (set `NEBIUS_TRUST_PROXY=1`), allow request bodies up to `MAX_UPLOAD_BYTES` (2 GiB default),
and disable buffering for `text/event-stream` (job logs, terminal).

## Security notes
- Mounting the Docker socket gives the NEBIUS process root-equivalent power on the host. Use a dedicated host, keep NEBIUS patched,
  and prefer a separate Docker engine (`DOCKER_HOST`) with a sandboxed runtime (gVisor `runsc`) for multi-tenant use.
- Set `NEBIUS_SIGNING_SECRET`, real mail transport, `NEBIUS_PUBLIC_URL=https://…` (enables `Secure` cookies + HSTS).

## Operations
- Health: `GET /healthz`; component health `GET /api/monitoring/health` (authenticated).
- Provider checks: `node backend/src/cli.js health` (also every `PROVIDER_HEALTH_INTERVAL_SEC`).
- Backups: `node backend/src/cli.js backup /backups` (cron), or Admin Console → Create backup. Restore steps in DATABASE.md.
- Migrations run automatically at start-up (`schema_migrations`).

## Verified in the build environment
- Backend + console run (`npm run dev`), 24/24 automated tests, Playwright UI flow. 
- `deploy/jupyter.Dockerfile` **built** (`nebius-jupyter:local`) and used by the tests.
- `deploy/Dockerfile` **not built here**: the sandbox's network proxy blocks Debian package mirrors inside image builds (HTTP 403 /
  untrusted proxy CA). It uses only standard Debian packages and is expected to build on a normal network — verify before relying on it.
- Not deployed anywhere (no hosting credentials).
