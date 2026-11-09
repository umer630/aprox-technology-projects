// Storage abstraction. Large blobs (datasets, checkpoints, model weights) live in an object store —
// never in the relational database. Backends: 'local' (filesystem, dev/single node) and 's3' (any
// S3-compatible store, e.g. MinIO / AWS S3 / R2) implemented with SigV4 on node:crypto (no SDK).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { config } from '../config.js';
import { S3Backend } from './s3.js';

class LocalBackend {
  constructor(root) { this.name = 'local'; this.root = root; fs.mkdirSync(root, { recursive: true }); }
  pathFor(key) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('invalid object key');
    return full;
  }
  async put(key, srcFile, size) {
    const dst = this.pathFor(key);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    await fs.promises.copyFile(srcFile, dst);
    if (fs.statSync(dst).size !== size) throw new Error('size mismatch after write');
  }
  async get(key) { return fs.createReadStream(this.pathFor(key)); }
  async delete(key) { await fs.promises.rm(this.pathFor(key), { force: true }); }
  async exists(key) { return fs.existsSync(this.pathFor(key)); }
  async health() { fs.accessSync(this.root, fs.constants.W_OK); return { ok: true, backend: 'local', root: '[data dir]/objects' }; }
}

let backend;
export function storage() {
  if (backend) return backend;
  if (config.storage.backend === 's3') backend = new S3Backend(config.storage.s3);
  else backend = new LocalBackend(path.join(config.dataDir, 'objects'));
  return backend;
}
export function setStorageForTests(b) { backend = b; }

export const tmpDir = () => { const d = path.join(config.dataDir, 'tmp'); fs.mkdirSync(d, { recursive: true }); return d; };

/**
 * Stream an incoming request body to a temp file, enforcing a byte limit and computing SHA-256 on the fly.
 * Aborted uploads (client cancel) reject and the temp file is removed.
 */
export async function receiveToTemp(readable, maxBytes) {
  const file = path.join(tmpDir(), 'up_' + crypto.randomBytes(12).toString('hex'));
  const hash = crypto.createHash('sha256');
  let size = 0;
  const meter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > maxBytes) return cb(Object.assign(new Error('too large'), { code: 'TOO_LARGE' }));
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  try {
    await pipeline(readable, meter, fs.createWriteStream(file, { mode: 0o600 }));
  } catch (e) {
    fs.rmSync(file, { force: true });
    throw e;
  }
  return { file, size, sha256: hash.digest('hex') };
}

export async function sha256File(file) {
  const h = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), new Transform({ transform(c, _e, cb) { h.update(c); cb(); } }));
  return h.digest('hex');
}

export async function readObjectToBuffer(key, limit = 1024 * 1024) {
  const s = await storage().get(key);
  const chunks = []; let n = 0;
  for await (const c of s) { n += c.length; if (n > limit) { s.destroy?.(); break; } chunks.push(c); }
  return Buffer.concat(chunks).subarray(0, limit);
}

export { Readable };
