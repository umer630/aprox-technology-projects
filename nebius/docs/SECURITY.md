# NEBIUS — Security Plan & Implemented Controls

## RBAC matrix (enforced server-side in `backend/src/iam.js`)

| Capability | Viewer | Developer | Project admin | Org admin | Superadmin |
|---|:-:|:-:|:-:|:-:|:-:|
| Read project, files, jobs, instances, logs, monitoring | ✔ | ✔ | ✔ | ✔ (all org projects) | ✔ |
| Upload/edit files, notebooks, run jobs, instances, terminal | | ✔ | ✔ | ✔ | ✔ |
| Project settings, members, API keys, archive, delete | | | ✔ | ✔ | ✔ |
| Create projects in org | | ✔ | ✔ | ✔ | ✔ |
| Org settings, invite/remove members, org audit log | | | | ✔ | ✔ |
| Provider verification/enabling, users, backups, global logs | | | | | ✔ |

Effective project role = highest of (explicit project role, org role); org admins act as admins of every org project. API keys are
capped at developer and limited by their scopes and to one project. No-access → **404** (no existence leak). Writes require a
verified email and a non-archived project.

## Controls
| Area | Control |
|---|---|
| Passwords | scrypt N=2^15 r=8 p=1, 16-byte salt; policy (≥10 chars, letters+digits, common-prefix block); timing-safe compare; dummy hash for unknown users |
| Sessions | 256-bit random tokens stored as SHA-256; 7-day expiry; revocable list; password change/reset revokes other/all sessions |
| Web | `HttpOnly; SameSite=Strict` cookie (+`Secure` on HTTPS), per-session CSRF token on all unsafe methods |
| Account abuse | login lockout (8 failures → 15 min), IP + email rate limits on signup/login/forgot/reset/verify, no account enumeration |
| Email verification / reset / invitations | single-use, hashed, expiring tokens; invitations bound to the invited email |
| API keys | `nbk_` + 256-bit, SHA-256 at rest, shown once, scopes, expiry, per-key rate limit, revocation, usage + request logs |
| Headers | CSP (`default-src 'self'`, no inline script/style, `frame-ancestors 'none'`), `nosniff`, `X-Frame-Options: DENY`, `no-referrer`, COOP, HSTS on HTTPS |
| Input | typed validators (`str/int/num/oneOf/safeName`), JSON body size limits, path-traversal guards for static files and storage keys |
| Files | per-file and per-project quota; executable types blocked by extension and `MZ` magic; optional ClamAV (`CLAMDSCAN_PATH`), infected uploads rejected; downloads `attachment` + `nosniff` + sandbox CSP; signed URLs HMAC-bound and re-authorised; SHA-256 on upload, optional client checksum, integrity re-verification |
| Code execution | only in Docker: `--network none` (or internal-only for notebooks), `--cap-drop ALL`, `no-new-privileges`, UID 1000, read-only rootfs (terminal/instances/jobs), tmpfs scratch, memory/CPU/PID limits, timeouts; terminal commands audit-logged with output |
| Free-only policy | catalog facts can only disqualify; card/billing unknown ⇒ ineligible; superadmin verification with written notes and explicit confirmation; enable gate; health gate; no create path for paid providers |
| Secrets | env only (`KAGGLE_API_TOKEN`, `S3_*`, `NEBIUS_SIGNING_SECRET`, inference key); never returned by the API or logged; Jupyter tokens random per container, server-side only |
| SSRF | outbound URLs come from operator config only (HF API, inference, Kaggle via runner, S3) — never from users |
| Imported pipeline | read-only checkout + SHA-256 manifest re-verified before every run; tampering blocks preflight and jobs |
| Audit | `audit_logs` for every state change, `security_events`, `request_logs` |
| Android | Keystore AES-256-GCM token storage, backups disabled, HTTPS-only (release), session-expiry handling |
| Backup | consistent snapshots with SHA-256 manifest |

## Known gaps (also in KNOWN_LIMITATIONS.md)
- Run the NEBIUS process as a **non-root** user: as root, read-only permissions on the imported pipeline do not stop writes (hash
  verification still detects them).
- The Docker socket is a privileged interface; the NEBIUS host must be dedicated and the process user limited to the `docker` group. For
  multi-tenant production use gVisor/Kata runtimes (`--runtime=runsc`) — not configured here.
- Notebook kernels of the same project share one container (isolation is per project, not per user).
- No 2FA/SSO yet. No external security audit has been performed.
