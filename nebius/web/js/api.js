// API client: cookie session + CSRF header, uniform errors, streaming uploads with progress/cancel, SSE reader.
let csrf = '';
export const setCsrf = (t) => { csrf = t || ''; };

export class ApiError extends Error {
  constructor(status, body) { super(body?.error?.message || `HTTP ${status}`); this.status = status; this.code = body?.error?.code; this.body = body; }
}

export async function api(method, path, body, { signal } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
  let res;
  try { res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin', signal }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new ApiError(0, { error: { code: 'offline', message: 'Cannot reach the NEBIUS server. Check your connection.' } }); }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, typeof data === 'object' ? data : { error: { message: String(data).slice(0, 200) } });
  return data;
}
export const get = (p, o) => api('GET', p, undefined, o);
export const post = (p, b = {}) => api('POST', p, b);
export const patch = (p, b) => api('PATCH', p, b);
export const put = (p, b) => api('PUT', p, b);
export const del = (p) => api('DELETE', p);

/** Upload a File with progress; returns { promise, abort }. */
export function uploadFile(projectId, file, { folderId, overwrite, onProgress }) {
  const xhr = new XMLHttpRequest();
  const q = new URLSearchParams({ name: file.name });
  if (folderId) q.set('folder_id', folderId);
  if (overwrite) q.set('overwrite', '1');
  const promise = new Promise((resolve, reject) => {
    xhr.open('PUT', `/api/projects/${projectId}/upload?${q}`);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.setRequestHeader('x-csrf-token', csrf);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => { let b = {}; try { b = JSON.parse(xhr.responseText); } catch { /* not json */ } xhr.status < 300 ? resolve(b) : reject(new ApiError(xhr.status, b)); };
    xhr.onerror = () => reject(new ApiError(0, { error: { message: 'Network error during upload' } }));
    xhr.onabort = () => reject(new ApiError(0, { error: { code: 'aborted', message: 'Upload cancelled' } }));
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}

/** POST and read a text/event-stream response, calling onEvent(event, data). */
export async function sse(path, body, onEvent, { method = 'POST', signal } = {}) {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: method === 'GET' ? undefined : JSON.stringify(body || {}), credentials: 'same-origin', signal });
  if (!res.ok) { let b = {}; try { b = await res.json(); } catch { /* */ } throw new ApiError(res.status, b); }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /event: (.*)/.exec(block)?.[1]; const d = /data: (.*)/.exec(block)?.[1];
      if (ev) onEvent(ev, d ? JSON.parse(d) : null);
    }
  }
}
