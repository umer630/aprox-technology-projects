// Minimal S3-compatible client (AWS Signature V4, path-style addressing) using only node:crypto + fetch.
// Works with MinIO, AWS S3, Cloudflare R2, etc. Credentials come from the environment only.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Readable } from 'node:stream';

const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const encKey = (k) => k.split('/').map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');

export class S3Backend {
  constructor({ endpoint, region, bucket, accessKey, secretKey }) {
    this.name = 's3';
    this.endpoint = endpoint; this.region = region; this.bucket = bucket; this.ak = accessKey; this.sk = secretKey;
    this.configured = !!(endpoint && bucket && accessKey && secretKey);
  }

  sign(method, key, { payloadHash = 'UNSIGNED-PAYLOAD', headers = {}, query = '' } = {}) {
    if (!this.configured) throw new Error('S3 storage is not configured (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY)');
    const url = new URL(`${this.endpoint}/${this.bucket}${key ? '/' + encKey(key) : ''}${query ? '?' + query : ''}`);
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = amzDate.slice(0, 8);
    const h = { host: url.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash, ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)])) };
    const names = Object.keys(h).sort();
    const canonicalHeaders = names.map((n) => `${n}:${h[n].trim()}\n`).join('');
    const signedHeaders = names.join(';');
    const canonicalQuery = query ? query.split('&').sort().join('&') : '';
    const canonical = [method, url.pathname, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const scope = `${date}/${this.region}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, hex(canonical)].join('\n');
    const kSigning = hmac(hmac(hmac(hmac('AWS4' + this.sk, date), this.region), 's3'), 'aws4_request');
    const sig = crypto.createHmac('sha256', kSigning).update(toSign).digest('hex');
    h.authorization = `AWS4-HMAC-SHA256 Credential=${this.ak}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;
    delete h.host;
    return { url: url.toString(), headers: h };
  }

  async put(key, srcFile, size, sha256) {
    const { url, headers } = this.sign('PUT', key, { payloadHash: sha256 || 'UNSIGNED-PAYLOAD', headers: { 'content-length': size } });
    const r = await fetch(url, { method: 'PUT', headers, body: Readable.toWeb(fs.createReadStream(srcFile)), duplex: 'half' });
    if (!r.ok) throw new Error(`S3 PUT failed: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  async get(key) {
    const { url, headers } = this.sign('GET', key);
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`S3 GET failed: HTTP ${r.status}`);
    return Readable.fromWeb(r.body);
  }
  async delete(key) {
    const { url, headers } = this.sign('DELETE', key);
    const r = await fetch(url, { method: 'DELETE', headers });
    if (!r.ok && r.status !== 404) throw new Error(`S3 DELETE failed: HTTP ${r.status}`);
  }
  async exists(key) {
    const { url, headers } = this.sign('HEAD', key);
    const r = await fetch(url, { method: 'HEAD', headers });
    return r.ok;
  }
  async health() {
    if (!this.configured) return { ok: false, backend: 's3', detail: 'not configured' };
    const { url, headers } = this.sign('HEAD', '');
    const r = await fetch(url, { method: 'HEAD', headers, signal: AbortSignal.timeout(5000) });
    return { ok: r.ok, backend: 's3', bucket: this.bucket, status: r.status };
  }
}
