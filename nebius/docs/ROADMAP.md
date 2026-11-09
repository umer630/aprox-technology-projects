# NEBIUS — Implementation Roadmap

## Done in v0.1.0 (this branch: `claude/nebius-platform-build-1j2641`)
1. Repository audit, dependency/compatibility report, security risks, safe plan (AUDIT.md)
2. Backend core: migrations, auth (verification/reset/lockout/sessions), IAM (5 roles), organizations, invitations, projects
3. Storage: local + S3 SigV4, folders, versions, trash/restore, quota, signed URLs, integrity, previews, scanning hook
4. Free-only provider framework, GPU detection, Compute Engine on Docker CPU sandboxes
5. Scheduler with leases, priorities, dependencies, retries, timeouts, cancel/pause/resume, duplicate prevention
6. Training engine + Nick 4.8 integration (import, preflight, CPU data stage, GPU stage, evidence verifier, model registry)
7. Notebooks (isolated Jupyter kernels), terminal (sandboxed), monitoring, logs, API keys + inference proxy, notifications, admin, backups
8. Web console (responsive, 3-button nav), Android debug APK, tests, docs

## Next (ordered)
| Priority | Item | Why |
|---|---|---|
| P0 | Clear the name (B2) | Release blocker |
| P0 | Obtain a verified free GPU path and run Nick 4.8 for real (B1) | The core goal; evidence verifier is ready |
| P0 | Run the APK on a device, fix UI issues, release-sign (B3/B4) | Distribution |
| P1 | Deploy behind TLS with real mail + S3; run as non-root; gVisor runtime | Production safety |
| P1 | Licensed datasets ≥ 20k records approved in the Approx registry | Meaningful Nick 4.8 quality |
| P1 | PostgreSQL adapter + Redis queue | Multi-node scaling |
| P2 | WebSocket PTY terminal; JupyterLab UI embedding per project | Developer experience |
| P2 | Per-user notebook containers; GPU notebook kernels when a free GPU host exists | Isolation, capability |
| P2 | Push notifications (FCM requires Google services — evaluate) | Mobile |
| P2 | 2FA/SSO, org deletion, email change, folder copy | Completeness |
| P3 | External security review / pentest | Assurance |
