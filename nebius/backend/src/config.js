// Central configuration. Secrets come only from the environment — never from source, never returned by the API.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

export const VERSION = '0.1.0';

export const config = {
  env: env.NEBIUS_ENV || 'production',
  port: int(env.PORT, 8090),
  host: env.HOST || '0.0.0.0',
  publicUrl: (env.NEBIUS_PUBLIC_URL || '').replace(/\/$/, ''),
  dataDir: env.NEBIUS_DATA_DIR || path.resolve(here, '../../data'),
  webDir: path.resolve(here, '../../web'),
  trustProxy: bool(env.NEBIUS_TRUST_PROXY),
  corsOrigins: (env.NEBIUS_CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  // HMAC key for signed download URLs. Generated per data dir if unset (see db.js#signingKey).
  signingSecret: env.NEBIUS_SIGNING_SECRET || '',

  auth: {
    sessionDays: int(env.SESSION_DAYS, 7),
    maxFailedLogins: int(env.MAX_FAILED_LOGINS, 8),
    lockMinutes: int(env.LOCK_MINUTES, 15),
    requireVerifiedEmail: bool(env.REQUIRE_VERIFIED_EMAIL, true),
  },

  storage: {
    backend: env.NEBIUS_STORAGE || 'local', // local | s3
    maxUploadBytes: int(env.MAX_UPLOAD_BYTES, 2 * 1024 * 1024 * 1024), // 2 GiB per file (model weights)
    defaultProjectQuotaBytes: int(env.PROJECT_QUOTA_BYTES, 20 * 1024 * 1024 * 1024),
    signedUrlTtlSec: int(env.SIGNED_URL_TTL_SEC, 300),
    clamdscan: env.CLAMDSCAN_PATH || '', // malware scanning integration point (optional)
    s3: {
      endpoint: (env.S3_ENDPOINT || '').replace(/\/$/, ''),
      region: env.S3_REGION || 'us-east-1',
      bucket: env.S3_BUCKET || '',
      accessKey: env.S3_ACCESS_KEY || '',
      secretKey: env.S3_SECRET_KEY || '',
    },
  },

  mail: {
    transport: env.MAIL_TRANSPORT || 'outbox', // outbox (dev: stored + printed) | http
    httpEndpoint: env.MAIL_HTTP_ENDPOINT || '',
    httpApiKey: env.MAIL_HTTP_API_KEY || '',
    from: env.MAIL_FROM || 'NEBIUS <no-reply@nebius.invalid>',
  },

  docker: {
    enabled: bool(env.NEBIUS_DOCKER, true),
    bin: env.DOCKER_BIN || 'docker',
    sandboxImage: env.NEBIUS_SANDBOX_IMAGE || 'alpine:3.20',
    // Images users may pick for CPU instances (allow-list; never arbitrary images).
    instanceImages: (env.NEBIUS_INSTANCE_IMAGES || 'alpine:3.20').split(',').map((s) => s.trim()).filter(Boolean),
    maxInstancesPerProject: int(env.MAX_INSTANCES_PER_PROJECT, 3),
  },

  terminal: {
    idleTimeoutSec: int(env.TERMINAL_IDLE_TIMEOUT_SEC, 900),
    maxSessionSec: int(env.TERMINAL_MAX_SESSION_SEC, 3600),
    commandTimeoutSec: int(env.TERMINAL_COMMAND_TIMEOUT_SEC, 60),
    memory: env.TERMINAL_MEMORY || '256m',
    cpus: env.TERMINAL_CPUS || '0.5',
    pids: int(env.TERMINAL_PIDS, 128),
  },

  jupyter: {
    url: (env.NEBIUS_JUPYTER_URL || '').replace(/\/$/, ''),
    token: env.NEBIUS_JUPYTER_TOKEN || '',
    // 'shared' = one operator-run Jupyter server (NOT tenant-isolated; dev only). Production must run one per project.
    mode: env.NEBIUS_JUPYTER_MODE || 'shared',
    execTimeoutSec: int(env.NOTEBOOK_EXEC_TIMEOUT_SEC, 120),
  },

  providers: {
    pythonBin: env.NEBIUS_PYTHON || 'python3',
    kaggleRunner: env.NEBIUS_KAGGLE_RUNNER || '', // path to Approx-Ai training/kaggle/kaggle_runner.py
    kaggleConfigured: !!(env.KAGGLE_API_TOKEN),
    kaggleUser: env.KAGGLE_USERNAME || '',
    nvidiaSmi: env.NVIDIA_SMI_BIN || 'nvidia-smi',
    healthIntervalSec: int(env.PROVIDER_HEALTH_INTERVAL_SEC, 300),
  },

  approx: {
    // Where to import the existing Approx AI repository from (read-only).
    repoUrl: env.APPROX_REPO_URL || 'https://github.com/umer630/Approx-Ai',
    localPath: env.APPROX_REPO_PATH || '', // optional existing checkout (used read-only)
    hfApi: env.HF_API_URL || 'https://huggingface.co/api',
  },

  scheduler: {
    enabled: bool(env.NEBIUS_SCHEDULER, true),
    tickMs: int(env.SCHEDULER_TICK_MS, 3000),
    leaseSec: int(env.SCHEDULER_LEASE_SEC, 120),
  },

  inference: {
    // OpenAI-compatible server hosting a VERIFIED adapter (e.g. vLLM). Unset → 503, never a fake answer.
    url: (env.NEBIUS_INFERENCE_URL || '').replace(/\/$/, ''),
    apiKey: env.NEBIUS_INFERENCE_API_KEY || '',
  },
};

export const isTest = () => config.env === 'test';
export const isProd = () => config.env === 'production';
