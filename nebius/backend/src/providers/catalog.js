// Static provider facts. These are DOCUMENTATION, not live data: each entry records where the claim came from
// and when it was last reviewed. They can only ever *disqualify* a provider (paid / card / billing). They never
// make a provider usable on their own — that needs (1) a passing live health check and (2) a superadmin's
// recorded verification that the account in use satisfies the free-only policy. Re-verify before activation:
// providers change their free tiers without notice.
//
// credit_card_required / billing_required: true | false | null (null = unknown → treated as NOT free-eligible).

const REVIEWED = '2026-11-09';
const UNVERIFIED = 'Not verifiable from the build environment (provider site blocked by network policy). Re-verify on the provider site before activation.';

export const CATALOG = {
  'kaggle': {
    name: 'Kaggle Notebooks',
    kind: 'gpu-batch',
    automation: 'api', // push notebook → poll → download outputs (via Approx-Ai training/kaggle/kaggle_runner.py)
    facts: {
      signup_eligibility: 'Free Kaggle account; phone verification required to enable GPU and Internet in notebooks',
      country_availability: 'Most countries; subject to Kaggle Terms and US export regulations',
      credit_card_required: false,
      billing_required: false,
      gpu_types: ['NVIDIA Tesla T4 (x1 or x2)', 'NVIDIA Tesla P100'],
      gpu_vram_gb: 16,
      cuda_capability: 'T4: 7.5 · P100: 6.0',
      session_duration: 'Up to ~12 h per session/commit (reported)',
      usage_limits: 'Weekly GPU quota (≈30 h/week reported; varies — shown only on kaggle.com)',
      training_eligible: true,
      restrictions: 'Kaggle Terms of Use; notebooks run as the account owner; no guaranteed GPU attachment. Approx-Ai diagnostics recorded that this account\'s sessions did not get a GPU/Internet attached.',
      facts_source: 'Kaggle public documentation as summarised in Approx-Ai training/README.md; ' + UNVERIFIED,
      facts_reviewed_on: REVIEWED,
    },
  },
  'google-colab-free': {
    name: 'Google Colab (free tier)',
    kind: 'gpu-manual',
    automation: 'manual', // no official API to provision free runtimes → user runs notebook, NEBIUS verifies the evidence
    facts: {
      signup_eligibility: 'Google account',
      country_availability: 'Countries where Colab is offered',
      credit_card_required: false,
      billing_required: false,
      gpu_types: ['NVIDIA T4 (when available)'],
      gpu_vram_gb: 15,
      cuda_capability: '7.5 (T4)',
      session_duration: 'Up to ~12 h, idle disconnects; not guaranteed (reported)',
      usage_limits: 'Dynamic and undisclosed; GPU may be unavailable',
      training_eligible: true,
      restrictions: 'No public API for provisioning free runtimes. NEBIUS cannot start or monitor Colab sessions; it generates the run instructions and verifies uploaded evidence only.',
      facts_source: 'Colab FAQ (reported); ' + UNVERIFIED,
      facts_reviewed_on: REVIEWED,
    },
  },
  'sagemaker-studio-lab': {
    name: 'Amazon SageMaker Studio Lab',
    kind: 'gpu-manual',
    automation: 'manual',
    facts: {
      signup_eligibility: 'Account request with approval queue; no AWS account needed (reported)',
      country_availability: 'Unknown — check provider',
      credit_card_required: false,
      billing_required: false,
      gpu_types: ['NVIDIA T4 (reported)'],
      gpu_vram_gb: 15,
      cuda_capability: '7.5 (T4)',
      session_duration: 'Short GPU sessions with daily limits (reported)',
      usage_limits: 'Daily GPU time cap (reported)',
      training_eligible: true,
      restrictions: 'Manual only (no provisioning API). ' + UNVERIFIED,
      facts_source: UNVERIFIED,
      facts_reviewed_on: REVIEWED,
    },
  },
  'local-nvidia': {
    name: 'Self-hosted NVIDIA GPU (this server)',
    kind: 'gpu-local',
    automation: 'local',
    facts: {
      signup_eligibility: 'Operator-owned hardware',
      country_availability: 'n/a',
      credit_card_required: false,
      billing_required: false,
      gpu_types: ['Detected at runtime via nvidia-smi'],
      gpu_vram_gb: null,
      cuda_capability: 'Detected at runtime',
      session_duration: 'Unlimited (operator controlled)',
      usage_limits: 'Operator controlled',
      training_eligible: true,
      restrictions: 'Only available when nvidia-smi reports a GPU on the NEBIUS host.',
      facts_source: 'Runtime detection',
      facts_reviewed_on: REVIEWED,
    },
  },
  'local-docker-cpu': {
    name: 'Local Docker CPU sandbox (this server)',
    kind: 'cpu-container',
    automation: 'local',
    facts: {
      signup_eligibility: 'Operator-owned hardware',
      country_availability: 'n/a',
      credit_card_required: false,
      billing_required: false,
      gpu_types: [],
      gpu_vram_gb: 0,
      cuda_capability: 'none — CPU only',
      session_duration: 'Operator controlled',
      usage_limits: `Per-project instance cap; CPU/RAM/PID limits per container`,
      training_eligible: false,
      restrictions: 'CPU only. Never used for GPU jobs and never reported as a GPU.',
      facts_source: 'Runtime detection (docker version)',
      facts_reviewed_on: REVIEWED,
    },
  },
};

// Paid / credit-based providers: listed so the policy decision is explicit and auditable. No create path exists.
const paid = (name, why) => ({
  name, kind: 'catalog-only', automation: 'none',
  facts: { signup_eligibility: 'Paid account', country_availability: 'varies', credit_card_required: true, billing_required: true, gpu_types: ['various (paid)'],
    gpu_vram_gb: null, cuda_capability: 'varies', session_duration: 'billed per use', usage_limits: 'billing-based', training_eligible: true,
    restrictions: why, facts_source: 'Provider pricing pages (reported); listed only to record ineligibility', facts_reviewed_on: REVIEWED },
});
Object.assign(CATALOG, {
  'nebius-ai-cloud': paid('Nebius AI Cloud', 'Paid GPU cloud; billing account required. (Unrelated company that shares the provisional name.)'),
  'aws-ec2': paid('AWS EC2 GPU instances', 'Billing account + card required; GPU instances are not in the free tier.'),
  'gcp-compute': paid('Google Cloud Compute Engine GPUs', 'Billing account required; free-trial credits are time-limited, not permanently free.'),
  'azure': paid('Microsoft Azure GPU VMs', 'Billing account + card; trial credits are not permanently free.'),
  'lambda-cloud': paid('Lambda Cloud', 'Paid GPU instances; card required.'),
  'runpod': paid('RunPod', 'Prepaid credits required.'),
  'vast-ai': paid('Vast.ai', 'Prepaid credits required.'),
  'paperspace': paid('Paperspace / DigitalOcean Gradient', 'Free GPU tiers have historically required a payment method; treated as ineligible.'),
  'lightning-ai': paid('Lightning AI Studios', 'Free monthly credits are credits, not a permanently free GPU; verification/payment may be required.'),
});

export const FREE_ONLY = {
  ELIGIBLE: 'ELIGIBLE',                                   // facts pass + admin verified (still needs healthy check to dispatch)
  PENDING_VERIFICATION: 'PENDING_ADMIN_VERIFICATION',     // facts pass, nobody has verified the account yet
  MANUAL_ONLY: 'MANUAL_ONLY',                             // free, but cannot be automated — evidence import only
  INELIGIBLE: 'INELIGIBLE_FOR_FREE_ONLY_MODE',            // card/billing required or unknown
  NOT_GPU: 'NOT_APPLICABLE_CPU_ONLY',
};

export function freeOnlyVerdict(entry, state) {
  const f = entry.facts;
  if (f.credit_card_required !== false || f.billing_required !== false) return FREE_ONLY.INELIGIBLE;
  if (entry.kind === 'cpu-container') return FREE_ONLY.NOT_GPU;
  if (entry.automation === 'manual') return FREE_ONLY.MANUAL_ONLY;
  return state?.admin_verified ? FREE_ONLY.ELIGIBLE : FREE_ONLY.PENDING_VERIFICATION;
}
