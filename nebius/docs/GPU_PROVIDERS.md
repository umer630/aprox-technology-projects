# Free-only GPU Provider Framework

## Policy (enforced in `backend/src/providers/`)
A provider receives GPU work only when **all** of these hold:
1. Catalog facts say `credit_card_required: false` **and** `billing_required: false` (unknown ⇒ ineligible).
2. A superadmin recorded a verification of the actual account (`POST /api/admin/providers/:id/verify` with ≥20 characters of notes
   and `confirm_free_only: true` — "no credit card, no billing account, no paid trial, no auto-upgrade").
3. It is enabled by a superadmin.
4. Its latest **live** health check passed and is recent.

Otherwise GPU jobs stay in `WAITING_FOR_GPU` with the reason `NO FREE GPU AVAILABLE …` and are preserved. They are never run on CPU.
NEBIUS never creates accounts, never enables billing, never starts trials, never evades quotas.

## Adapter contract
`health()` · `resources()` (real detected GPUs only) · instance ops `create/start/stop/restart/remove/observe/stats` (if `supportsInstances`)
· batch ops `submit/poll/cancel/fetchOutputs` (if `supportsBatch`). Every provider reports: name, signup eligibility, country availability,
card requirement, billing requirement, GPU types, VRAM, CUDA capability, session duration, usage limits, live availability (health +
detected resources), training eligibility, restrictions, last check and last successful check.

## Providers in v1
| Provider | Verdict | Automation | Notes |
|---|---|---|---|
| Kaggle Notebooks | `PENDING_ADMIN_VERIFICATION` → `ELIGIBLE` after verification | API via Approx-Ai `kaggle_runner.py` (official kagglesdk) | Needs `KAGGLE_API_TOKEN`, `KAGGLE_USERNAME`, Python with `kaggle` installed, phone-verified account. GPU quota is not exposed by Kaggle's API — real GPU confirmed by the pipeline preflight inside the run. Approx-Ai diagnostics recorded that this account's sessions did not get a GPU/Internet attached. |
| Self-hosted NVIDIA | `PENDING_ADMIN_VERIFICATION` | local processes | Activates only if `nvidia-smi` reports a GPU. Runs `kaggle_pipeline.py` stages from the job's workspace copy. |
| Google Colab (free) | `MANUAL_ONLY` | none (no provisioning API) | NEBIUS shows run steps; user uploads output; evidence verifier decides. |
| SageMaker Studio Lab | `MANUAL_ONLY` | none | as above |
| Local Docker CPU | `NOT_APPLICABLE_CPU_ONLY` | local | Compute Engine instances, sandbox jobs, terminal. Never presented as GPU. |
| Nebius AI Cloud, AWS, GCP, Azure, Lambda, RunPod, Vast.ai, Paperspace, Lightning AI | `INELIGIBLE_FOR_FREE_ONLY_MODE` | none | Paid / card / billing / credit-based. Verification and enabling are refused (HTTP 409). |
| `mock-gpu` | test double | — | Exists only when `NEBIUS_ENV=test`; its output is always rejected by the evidence verifier. |

Facts carry `facts_source` and `facts_reviewed_on`. The provider sites (kaggle.com, colab) were **not reachable from the build
environment**, so facts are marked unverified there; re-verify on the provider site before activation.

## Live state in this build environment (2026-11-09, `node src/cli.js health`)
```
kaggle                 PENDING_ADMIN_VERIFICATION  health=unconfigured  KAGGLE_API_TOKEN is not set on the server
google-colab-free      MANUAL_ONLY                 health=manual
sagemaker-studio-lab   MANUAL_ONLY                 health=manual
local-nvidia           PENDING_ADMIN_VERIFICATION  health=unavailable   spawn nvidia-smi ENOENT
local-docker-cpu       NOT_APPLICABLE_CPU_ONLY     health=healthy       docker 29.9.2
(paid providers)       INELIGIBLE_FOR_FREE_ONLY_MODE
```
Result: **NO FREE GPU AVAILABLE** — reported as such everywhere.

## Activating Kaggle (operator steps)
1. On kaggle.com: phone-verify the account; confirm no payment method/paid plan.
2. Server env: `KAGGLE_USERNAME`, `KAGGLE_API_TOKEN`, `NEBIUS_PYTHON` pointing to a Python with `pip install kaggle requests`.
3. Import the Approx-Ai pipeline in a project (provides `kaggle_runner.py`), or set `NEBIUS_KAGGLE_RUNNER`.
4. Admin Console → Compute Engine → GPU providers → Kaggle → *Run health check* (must show `healthy`) → *Verify free-only account…* → *Enable*.
5. Queued `training.qlora` jobs start automatically.
