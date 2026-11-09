// Cloud file manager: folders, files, versions, trash/restore, search/sort, quota, signed downloads,
// integrity verification, previews and a malware-scanning integration point.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { one, all, run, now, tx, audit, newId, signingKey } from '../db.js';
import { readJson, sendJson, bad, conflict, notFound, forbidden, HttpError, safeName, clientIp } from '../http.js';
import { projectAccess } from '../iam.js';
import { storage, receiveToTemp, sha256File, readObjectToBuffer } from '../storage/index.js';
import { onProjectDelete } from './projects.js';
import { config } from '../config.js';

const EXT_KIND = [
  [/\.(jsonl|csv|tsv|parquet|arrow)$/i, 'dataset'],
  [/\.ipynb$/i, 'notebook'],
  [/\.(safetensors|bin|pt|pth|gguf|onnx|ckpt)$/i, 'model'],
  [/\.(py|js|mjs|ts|java|go|rs|c|cpp|h|sh|rb|php|sql|yaml|yml|toml|ini|cfg)$/i, 'source'],
  [/\.(log|out|err)$/i, 'log'],
  [/\.(tar|gz|tgz|zip|7z|xz|zst)$/i, 'archive'],
  [/\.(png|jpe?g|gif|webp)$/i, 'image'],
  [/\.(md|txt|pdf|json|html?|xml|docx?)$/i, 'document'],
];
const MIME = { '.json': 'application/json', '.jsonl': 'application/x-ndjson', '.csv': 'text/csv', '.txt': 'text/plain', '.md': 'text/markdown', '.py': 'text/x-python',
  '.ipynb': 'application/x-ipynb+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
  '.log': 'text/plain', '.yaml': 'text/yaml', '.yml': 'text/yaml', '.safetensors': 'application/octet-stream', '.gz': 'application/gzip', '.zip': 'application/zip' };
const TEXT_PREVIEW = /\.(txt|md|json|jsonl|csv|tsv|py|js|mjs|ts|java|go|rs|c|cpp|h|sh|sql|yaml|yml|toml|ini|cfg|log|out|err|ipynb|xml)$/i;
const IMAGE_PREVIEW = /\.(png|jpe?g|gif|webp)$/i;
const BLOCKED_EXT = /\.(exe|dll|scr|com|msi|bat|cmd|vbs|cpl|pif)$/i;

export const fileKind = (name) => {
  if (/checkpoint/i.test(name)) return 'checkpoint';
  for (const [re, k] of EXT_KIND) if (re.test(name)) return k;
  return 'other';
};
const mimeFor = (name) => MIME[path.extname(name).toLowerCase()] || 'application/octet-stream';

export function storageUsed(projectId) {
  return one('SELECT COALESCE(SUM(size_bytes),0) AS n FROM storage_objects WHERE project_id = ? AND deleted_at IS NULL', projectId).n;
}

function getFolder(project, id, { includeDeleted = false } = {}) {
  if (!id) return null;
  const f = one(`SELECT * FROM folders WHERE id = ? AND project_id = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`, id, project.id);
  if (!f) throw notFound('Folder not found');
  return f;
}
function getFile(project, id, { includeDeleted = false } = {}) {
  const f = one(`SELECT * FROM files WHERE id = ? AND project_id = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`, id, project.id);
  if (!f) throw notFound('File not found');
  return f;
}
function breadcrumbs(project, folderId) {
  const out = [];
  let cur = folderId; let guard = 0;
  while (cur && guard++ < 100) {
    const f = one('SELECT id, name, parent_id FROM folders WHERE id = ? AND project_id = ?', cur, project.id);
    if (!f) break;
    out.unshift({ id: f.id, name: f.name });
    cur = f.parent_id;
  }
  return out;
}
function descendantFolderIds(projectId, folderId) {
  const ids = [folderId]; const queue = [folderId];
  while (queue.length) {
    const kids = all('SELECT id FROM folders WHERE project_id = ? AND parent_id = ?', projectId, queue.shift());
    for (const k of kids) { ids.push(k.id); queue.push(k.id); }
  }
  return ids;
}
function nameTaken(projectId, folderId, name, { exceptFileId = null } = {}) {
  return !!one('SELECT id FROM files WHERE project_id = ? AND COALESCE(folder_id, \'\') = ? AND name = ? AND deleted_at IS NULL AND id IS NOT ?', projectId, folderId || '', name, exceptFileId)
    || !!one('SELECT id FROM folders WHERE project_id = ? AND COALESCE(parent_id, \'\') = ? AND name = ? AND deleted_at IS NULL', projectId, folderId || '', name);
}
const publicFile = (f) => ({ id: f.id, project_id: f.project_id, folder_id: f.folder_id, name: f.name, kind: f.kind, mime: f.mime, size_bytes: f.size_bytes, sha256: f.sha256,
  version: f.current_version, scan_status: f.scan_status, created_by: f.created_by, created_at: f.created_at, updated_at: f.updated_at, deleted_at: f.deleted_at });

// Malware scanning integration point: CLAMDSCAN_PATH=/usr/bin/clamdscan enables it.
function scanFile(file) {
  if (!config.storage.clamdscan) return Promise.resolve('not_scanned');
  return new Promise((resolve) => {
    execFile(config.storage.clamdscan, ['--no-summary', '--fdpass', file], { timeout: 120_000 }, (err) => {
      if (!err) return resolve('clean');
      resolve(err.code === 1 ? 'infected' : 'scan_error');
    });
  });
}

// Signed download URLs: HMAC-SHA256 over (file, version, object, user, expiry). Short-lived; revalidated against DB.
export function signDownload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', signingKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyDownload(token) {
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', signingKey()).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.e > now() ? p : null; } catch { return null; }
}

/** Store a temp file as a new file or a new version. Shared by uploads, notebook saves and job artifact import. */
export async function storeFile({ project, user, folderId, name, tmp, overwrite = false, scan = true }) {
  const existing = one('SELECT * FROM files WHERE project_id = ? AND COALESCE(folder_id, \'\') = ? AND name = ? AND deleted_at IS NULL', project.id, folderId || '', name);
  if (existing && !overwrite) { fs.rmSync(tmp.file, { force: true }); throw conflict('A file with this name already exists in the folder (use overwrite to create a new version)', 'name_taken'); }
  if (!existing && nameTaken(project.id, folderId, name)) { fs.rmSync(tmp.file, { force: true }); throw conflict('A folder with this name exists', 'name_taken'); }
  if (storageUsed(project.id) + tmp.size > project.storage_quota_bytes) { fs.rmSync(tmp.file, { force: true }); throw new HttpError(413, 'quota_exceeded', 'Project storage quota exceeded'); }
  const scanStatus = scan ? await scanFile(tmp.file) : 'not_scanned';
  if (scanStatus === 'infected') { fs.rmSync(tmp.file, { force: true }); audit(user.id, 'file.malware_rejected', { orgId: project.org_id, projectId: project.id, target: name }); throw bad('File rejected by malware scanner', 'malware_detected'); }
  const objId = newId('obj_');
  const key = `${project.org_id}/${project.id}/${objId}`;
  try { await storage().put(key, tmp.file, tmp.size, tmp.sha256); } finally { fs.rmSync(tmp.file, { force: true }); }
  const t = now();
  const fileId = tx(() => {
    run('INSERT INTO storage_objects (id,org_id,project_id,backend,object_key,size_bytes,sha256,created_at) VALUES (?,?,?,?,?,?,?,?)', objId, project.org_id, project.id, storage().name, key, tmp.size, tmp.sha256, t);
    let id; let version = 1;
    if (existing) {
      id = existing.id; version = existing.current_version + 1;
      run('UPDATE files SET size_bytes = ?, sha256 = ?, current_version = ?, scan_status = ?, updated_at = ? WHERE id = ?', tmp.size, tmp.sha256, version, scanStatus, t, id);
    } else {
      id = newId('fil_');
      run('INSERT INTO files (id,org_id,project_id,folder_id,name,kind,mime,size_bytes,sha256,current_version,scan_status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        id, project.org_id, project.id, folderId || null, name, fileKind(name), mimeFor(name), tmp.size, tmp.sha256, 1, scanStatus, user.id, t, t);
    }
    run('INSERT INTO file_versions (id,file_id,version,storage_object_id,size_bytes,sha256,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)', newId('fv_'), id, version, objId, tmp.size, tmp.sha256, user.id, t);
    run("INSERT INTO usage_records (id,org_id,project_id,kind,quantity,unit,source,ref,created_at) VALUES (?,?,?,'storage_write',?,'bytes','upload',?,?)", newId('use_'), project.org_id, project.id, tmp.size, id, t);
    return id;
  });
  return one('SELECT * FROM files WHERE id = ?', fileId);
}

export async function storeBuffer({ project, user, folderId, name, buffer, overwrite = true }) {
  const { tmpDir } = await import('../storage/index.js');
  const file = path.join(tmpDir(), 'buf_' + crypto.randomBytes(8).toString('hex'));
  fs.writeFileSync(file, buffer, { mode: 0o600 });
  return storeFile({ project, user, folderId, name, tmp: { file, size: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') }, overwrite });
}

export function currentObject(file) {
  return one('SELECT o.* FROM file_versions v JOIN storage_objects o ON o.id = v.storage_object_id WHERE v.file_id = ? AND v.version = ?', file.id, file.current_version);
}

async function purgeFile(file) {
  const objs = all('SELECT o.* FROM file_versions v JOIN storage_objects o ON o.id = v.storage_object_id WHERE v.file_id = ?', file.id);
  for (const o of objs) await storage().delete(o.object_key);
  tx(() => {
    run('DELETE FROM file_versions WHERE file_id = ?', file.id);
    for (const o of objs) run('UPDATE storage_objects SET deleted_at = ? WHERE id = ?', now(), o.id);
    run('DELETE FROM files WHERE id = ?', file.id);
  });
}

onProjectDelete(async (project) => {
  const objs = all('SELECT * FROM storage_objects WHERE project_id = ? AND deleted_at IS NULL', project.id);
  for (const o of objs) await storage().delete(o.object_key);
  run('UPDATE storage_objects SET deleted_at = ? WHERE project_id = ? AND deleted_at IS NULL', now(), project.id);
});

const SORTS = { name: 'name COLLATE NOCASE', size: 'size_bytes', updated: 'updated_at', created: 'created_at', kind: 'kind' };

export function registerFileRoutes(r) {
  r.get('/api/projects/:id/browse', async (req, res, ctx, p, url) => {
    const { project } = projectAccess(ctx, p.id, 'read', { scope: 'files:read' });
    const folderId = url.searchParams.get('folder_id') || null;
    const folder = getFolder(project, folderId);
    const sort = SORTS[url.searchParams.get('sort')] || SORTS.name;
    const order = url.searchParams.get('order') === 'desc' ? 'DESC' : 'ASC';
    const folders = all(`SELECT id, name, parent_id, created_at, updated_at FROM folders WHERE project_id = ? AND COALESCE(parent_id,'') = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE ${order}`, project.id, folderId || '');
    const files = all(`SELECT * FROM files WHERE project_id = ? AND COALESCE(folder_id,'') = ? AND deleted_at IS NULL ORDER BY ${sort} ${order}`, project.id, folderId || '');
    sendJson(res, 200, { folder, breadcrumbs: breadcrumbs(project, folderId), folders, files: files.map(publicFile),
      storage: { used_bytes: storageUsed(project.id), quota_bytes: project.storage_quota_bytes, max_upload_bytes: config.storage.maxUploadBytes } });
  });

  r.get('/api/projects/:id/files', async (req, res, ctx, p, url) => {
    const { project } = projectAccess(ctx, p.id, 'read', { scope: 'files:read' });
    const q = (url.searchParams.get('q') || '').slice(0, 100);
    const kind = url.searchParams.get('kind');
    const sort = SORTS[url.searchParams.get('sort')] || SORTS.updated;
    const order = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
    const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    const rows = all(`SELECT * FROM files WHERE project_id = ? AND deleted_at IS NULL AND name LIKE ? ESCAPE '\\' ${kind ? 'AND kind = ?' : ''} ORDER BY ${sort} ${order} LIMIT 500`,
      ...[project.id, like, ...(kind ? [kind] : [])]);
    sendJson(res, 200, { files: rows.map((f) => ({ ...publicFile(f), path: breadcrumbs(project, f.folder_id).map((b) => b.name).join('/') })) });
  });

  r.get('/api/projects/:id/storage', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'read', { scope: 'files:read' });
    const byKind = all('SELECT kind, COUNT(*) AS files, COALESCE(SUM(size_bytes),0) AS bytes FROM files WHERE project_id = ? AND deleted_at IS NULL GROUP BY kind', project.id);
    sendJson(res, 200, { used_bytes: storageUsed(project.id), quota_bytes: project.storage_quota_bytes, by_kind: byKind, backend: storage().name });
  });

  r.post('/api/projects/:id/folders', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const b = await readJson(req);
    const name = safeName(b.name, 'name', 120);
    const parent = getFolder(project, b.parent_id || null);
    if (nameTaken(project.id, parent?.id, name)) throw conflict('An item with this name already exists here', 'name_taken');
    const id = newId('fld_');
    run('INSERT INTO folders (id,org_id,project_id,parent_id,name,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', id, project.org_id, project.id, parent?.id || null, name, user.id, now(), now());
    audit(user.id, 'folder.create', { orgId: project.org_id, projectId: project.id, target: id, detail: { name } });
    sendJson(res, 201, { folder: one('SELECT * FROM folders WHERE id = ?', id) });
  });

  r.patch('/api/projects/:id/folders/:fid', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const folder = getFolder(project, p.fid);
    const b = await readJson(req);
    const name = b.name !== undefined ? safeName(b.name, 'name', 120) : folder.name;
    let parentId = folder.parent_id;
    if (b.parent_id !== undefined) {
      parentId = b.parent_id || null;
      if (parentId) {
        getFolder(project, parentId);
        if (descendantFolderIds(project.id, folder.id).includes(parentId)) throw bad('Cannot move a folder into itself', 'invalid_move');
      }
    }
    if ((name !== folder.name || parentId !== folder.parent_id) && nameTaken(project.id, parentId, name)) throw conflict('An item with this name already exists there', 'name_taken');
    run('UPDATE folders SET name = ?, parent_id = ?, updated_at = ? WHERE id = ?', name, parentId, now(), folder.id);
    audit(user.id, 'folder.update', { orgId: project.org_id, projectId: project.id, target: folder.id, detail: { name, parent_id: parentId } });
    sendJson(res, 200, { folder: one('SELECT * FROM folders WHERE id = ?', folder.id) });
  });

  r.delete('/api/projects/:id/folders/:fid', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const folder = getFolder(project, p.fid);
    const ids = descendantFolderIds(project.id, folder.id);
    const t = now();
    tx(() => {
      for (const id of ids) {
        run('UPDATE folders SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', t, id);
        run('UPDATE files SET deleted_at = ? WHERE folder_id = ? AND deleted_at IS NULL', t, id);
      }
    });
    audit(user.id, 'folder.trash', { orgId: project.org_id, projectId: project.id, target: folder.id, detail: { folders: ids.length } });
    sendJson(res, 200, { status: 'trashed', folders: ids.length });
  });

  r.post('/api/projects/:id/folders/:fid/restore', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const folder = getFolder(project, p.fid, { includeDeleted: true });
    if (!folder.deleted_at) throw bad('Folder is not in trash');
    const t = folder.deleted_at;
    let parentId = folder.parent_id;
    if (parentId && one('SELECT deleted_at FROM folders WHERE id = ?', parentId)?.deleted_at) parentId = null; // parent gone → restore to root
    let name = folder.name;
    if (nameTaken(project.id, parentId, name)) name = `${name} (restored ${new Date().toISOString().slice(0, 10)})`;
    const ids = descendantFolderIds(project.id, folder.id);
    tx(() => {
      run('UPDATE folders SET deleted_at = NULL, parent_id = ?, name = ? WHERE id = ?', parentId, name, folder.id);
      for (const id of ids) {
        run('UPDATE folders SET deleted_at = NULL WHERE id = ? AND deleted_at = ?', id, t);
        run('UPDATE files SET deleted_at = NULL WHERE folder_id = ? AND deleted_at = ?', id, t);
      }
    });
    audit(user.id, 'folder.restore', { orgId: project.org_id, projectId: project.id, target: folder.id });
    sendJson(res, 200, { status: 'restored', name });
  });

  // Upload: raw body stream. Query: folder_id, name (or X-Filename header), overwrite=1. Optional X-Expected-Sha256.
  r.put('/api/projects/:id/upload', async (req, res, ctx, p, url) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const rawName = url.searchParams.get('name') || (req.headers['x-filename'] ? decodeURIComponent(String(req.headers['x-filename'])) : '');
    const name = safeName(rawName, 'name', 200);
    if (BLOCKED_EXT.test(name)) throw bad('Executable file types are not allowed', 'file_type_blocked');
    const folder = getFolder(project, url.searchParams.get('folder_id') || null);
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > config.storage.maxUploadBytes) throw new HttpError(413, 'payload_too_large', `File exceeds ${config.storage.maxUploadBytes} bytes`);
    if (declared && storageUsed(project.id) + declared > project.storage_quota_bytes) throw new HttpError(413, 'quota_exceeded', 'Project storage quota exceeded');
    let tmp;
    try { tmp = await receiveToTemp(req, config.storage.maxUploadBytes); } catch (e) {
      if (e.code === 'TOO_LARGE') throw new HttpError(413, 'payload_too_large', `File exceeds ${config.storage.maxUploadBytes} bytes`);
      throw new HttpError(400, 'upload_aborted', 'Upload was interrupted or cancelled');
    }
    if (!tmp.size) { fs.rmSync(tmp.file, { force: true }); throw bad('Empty file', 'empty_file'); }
    const head = Buffer.alloc(2); const fd = fs.openSync(tmp.file, 'r'); fs.readSync(fd, head, 0, 2, 0); fs.closeSync(fd);
    if (head.toString('latin1') === 'MZ') { fs.rmSync(tmp.file, { force: true }); throw bad('Executable file types are not allowed', 'file_type_blocked'); }
    const expected = String(req.headers['x-expected-sha256'] || '').toLowerCase();
    if (expected && expected !== tmp.sha256) { fs.rmSync(tmp.file, { force: true }); throw bad(`Integrity check failed: expected ${expected}, received ${tmp.sha256}`, 'checksum_mismatch'); }
    const file = await storeFile({ project, user, folderId: folder?.id, name, tmp, overwrite: url.searchParams.get('overwrite') === '1' });
    audit(user.id, 'file.upload', { orgId: project.org_id, projectId: project.id, target: file.id, ip: clientIp(req), detail: { name, size: file.size_bytes, sha256: file.sha256, version: file.current_version } });
    sendJson(res, 201, { file: publicFile(file) });
  });

  r.get('/api/projects/:id/files/:fid', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'read', { scope: 'files:read' });
    const file = getFile(project, p.fid, { includeDeleted: true });
    const versions = all('SELECT version, size_bytes, sha256, created_by, created_at FROM file_versions WHERE file_id = ? ORDER BY version DESC', file.id);
    sendJson(res, 200, { file: publicFile(file), versions, path: breadcrumbs(project, file.folder_id) });
  });

  r.patch('/api/projects/:id/files/:fid', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const file = getFile(project, p.fid);
    const b = await readJson(req);
    const name = b.name !== undefined ? safeName(b.name, 'name', 200) : file.name;
    if (BLOCKED_EXT.test(name)) throw bad('Executable file types are not allowed', 'file_type_blocked');
    const folderId = b.folder_id !== undefined ? (getFolder(project, b.folder_id || null)?.id || null) : file.folder_id;
    if (nameTaken(project.id, folderId, name, { exceptFileId: file.id })) throw conflict('An item with this name already exists there', 'name_taken');
    run('UPDATE files SET name = ?, folder_id = ?, kind = ?, mime = ?, updated_at = ? WHERE id = ?', name, folderId, fileKind(name), mimeFor(name), now(), file.id);
    audit(user.id, b.folder_id !== undefined ? 'file.move' : 'file.rename', { orgId: project.org_id, projectId: project.id, target: file.id, detail: { name, folder_id: folderId } });
    sendJson(res, 200, { file: publicFile(one('SELECT * FROM files WHERE id = ?', file.id)) });
  });

  r.post('/api/projects/:id/files/:fid/copy', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const file = getFile(project, p.fid);
    const b = await readJson(req);
    const folder = getFolder(project, b.folder_id !== undefined ? b.folder_id : file.folder_id);
    let name = b.name ? safeName(b.name, 'name', 200) : file.name;
    if (nameTaken(project.id, folder?.id, name)) {
      const ext = path.extname(name); name = `${name.slice(0, name.length - ext.length)} (copy)${ext}`;
      if (nameTaken(project.id, folder?.id, name)) throw conflict('An item with this name already exists there', 'name_taken');
    }
    const obj = currentObject(file);
    const { tmpDir } = await import('../storage/index.js');
    const tmpFile = path.join(tmpDir(), 'cp_' + crypto.randomBytes(8).toString('hex'));
    const { pipeline } = await import('node:stream/promises');
    await pipeline(await storage().get(obj.object_key), fs.createWriteStream(tmpFile, { mode: 0o600 }));
    const sha = await sha256File(tmpFile);
    if (sha !== obj.sha256) { fs.rmSync(tmpFile, { force: true }); throw new HttpError(500, 'integrity_error', 'Stored object failed integrity check during copy'); }
    const copy = await storeFile({ project, user, folderId: folder?.id, name, tmp: { file: tmpFile, size: obj.size_bytes, sha256: sha }, scan: false });
    audit(user.id, 'file.copy', { orgId: project.org_id, projectId: project.id, target: copy.id, detail: { from: file.id } });
    sendJson(res, 201, { file: publicFile(copy) });
  });

  r.delete('/api/projects/:id/files/:fid', async (req, res, ctx, p, url) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const file = getFile(project, p.fid, { includeDeleted: true });
    if (url.searchParams.get('permanent') === '1') {
      if (!file.deleted_at) throw bad('Move the file to trash before deleting it permanently', 'not_in_trash');
      await purgeFile(file);
      audit(user.id, 'file.purge', { orgId: project.org_id, projectId: project.id, target: file.id, detail: { name: file.name } });
      return sendJson(res, 200, { status: 'deleted' });
    }
    if (file.deleted_at) throw bad('File is already in trash');
    run('UPDATE files SET deleted_at = ? WHERE id = ?', now(), file.id);
    audit(user.id, 'file.trash', { orgId: project.org_id, projectId: project.id, target: file.id, detail: { name: file.name } });
    sendJson(res, 200, { status: 'trashed' });
  });

  r.post('/api/projects/:id/files/:fid/restore', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const file = getFile(project, p.fid, { includeDeleted: true });
    if (!file.deleted_at) throw bad('File is not in trash');
    let folderId = file.folder_id;
    if (folderId && one('SELECT deleted_at FROM folders WHERE id = ?', folderId)?.deleted_at) folderId = null;
    let name = file.name;
    if (nameTaken(project.id, folderId, name, { exceptFileId: file.id })) { const ext = path.extname(name); name = `${name.slice(0, name.length - ext.length)} (restored)${ext}`; }
    run('UPDATE files SET deleted_at = NULL, folder_id = ?, name = ?, updated_at = ? WHERE id = ?', folderId, name, now(), file.id);
    audit(user.id, 'file.restore', { orgId: project.org_id, projectId: project.id, target: file.id });
    sendJson(res, 200, { file: publicFile(one('SELECT * FROM files WHERE id = ?', file.id)) });
  });

  r.get('/api/projects/:id/trash', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'read', { scope: 'files:read' });
    const files = all('SELECT * FROM files WHERE project_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500', project.id).map(publicFile);
    const folders = all('SELECT id, name, parent_id, deleted_at FROM folders WHERE project_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 200', project.id);
    sendJson(res, 200, { files, folders });
  });

  r.post('/api/projects/:id/trash/empty', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const files = all('SELECT * FROM files WHERE project_id = ? AND deleted_at IS NOT NULL', project.id);
    for (const f of files) await purgeFile(f);
    audit(user.id, 'trash.empty', { orgId: project.org_id, projectId: project.id, detail: { files: files.length } });
    sendJson(res, 200, { status: 'emptied', files: files.length });
  });

  r.post('/api/projects/:id/files/:fid/versions/:v/restore', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const file = getFile(project, p.fid);
    const v = one('SELECT * FROM file_versions WHERE file_id = ? AND version = ?', file.id, Number(p.v));
    if (!v) throw notFound('Version not found');
    const newV = file.current_version + 1;
    tx(() => {
      run('INSERT INTO file_versions (id,file_id,version,storage_object_id,size_bytes,sha256,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)', newId('fv_'), file.id, newV, v.storage_object_id, v.size_bytes, v.sha256, user.id, now());
      run('UPDATE files SET current_version = ?, size_bytes = ?, sha256 = ?, updated_at = ? WHERE id = ?', newV, v.size_bytes, v.sha256, now(), file.id);
    });
    audit(user.id, 'file.version_restore', { orgId: project.org_id, projectId: project.id, target: file.id, detail: { from_version: v.version, new_version: newV } });
    sendJson(res, 200, { file: publicFile(one('SELECT * FROM files WHERE id = ?', file.id)) });
  });

  r.post('/api/projects/:id/files/:fid/download-url', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'read', { scope: 'files:read' });
    const file = getFile(project, p.fid);
    const b = req.headers['content-type']?.includes('json') ? await readJson(req) : {};
    const version = b.version ? Number(b.version) : file.current_version;
    const v = one('SELECT * FROM file_versions WHERE file_id = ? AND version = ?', file.id, version);
    if (!v) throw notFound('Version not found');
    if (file.scan_status === 'infected') throw forbidden('File is quarantined');
    const exp = now() + config.storage.signedUrlTtlSec * 1000;
    const token = signDownload({ f: file.id, v: version, o: v.storage_object_id, u: user.id, e: exp, i: b.inline === true && IMAGE_PREVIEW.test(file.name) ? 1 : 0 });
    audit(user.id, 'file.download_url', { orgId: project.org_id, projectId: project.id, target: file.id, detail: { version } });
    sendJson(res, 200, { url: `/api/dl/${token}`, expires_at: exp, sha256: v.sha256 });
  });

  // Signed download. No session needed (lets Android/browser download managers fetch), but token is
  // HMAC-bound to file+version+object+user and short-lived; user's current access is re-checked.
  r.get('/api/dl/:token', async (req, res, ctx, p) => {
    const t = verifyDownload(p.token);
    if (!t) throw forbidden('Download link is invalid or expired', 'invalid_link');
    const file = one('SELECT * FROM files WHERE id = ?', t.f);
    const obj = one('SELECT * FROM storage_objects WHERE id = ? AND deleted_at IS NULL', t.o);
    const user = one("SELECT * FROM users WHERE id = ? AND status = 'active'", t.u);
    if (!file || !obj || !user) throw notFound('File not found');
    projectAccess({ auth: { user, kind: 'internal' } }, file.project_id, 'read'); // access may have been revoked since signing
    const stream = await storage().get(obj.object_key);
    const disp = t.i ? 'inline' : 'attachment';
    res.writeHead(200, {
      'Content-Type': t.i ? file.mime : 'application/octet-stream',
      'Content-Length': obj.size_bytes,
      'Content-Disposition': `${disp}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'X-Checksum-Sha256': obj.sha256,
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    });
    stream.pipe(res);
  });

  r.get('/api/projects/:id/files/:fid/preview', async (req, res, ctx, p) => {
    const { project } = projectAccess(ctx, p.id, 'read', { scope: 'files:read' });
    const file = getFile(project, p.fid);
    if (file.scan_status === 'infected') throw forbidden('File is quarantined');
    if (TEXT_PREVIEW.test(file.name)) {
      const limit = 256 * 1024;
      const buf = await readObjectToBuffer(currentObject(file).object_key, limit);
      return sendJson(res, 200, { kind: 'text', truncated: file.size_bytes > limit, content: buf.toString('utf8') });
    }
    if (IMAGE_PREVIEW.test(file.name) && file.size_bytes <= 10 * 1024 * 1024) {
      const tok = signDownload({ f: file.id, v: file.current_version, o: currentObject(file).id, u: ctx.auth.user.id, e: now() + 120_000, i: 1 });
      return sendJson(res, 200, { kind: 'image', url: `/api/dl/${tok}` });
    }
    sendJson(res, 200, { kind: 'none', message: 'Preview is not available for this file type. Download it instead.' });
  });

  r.post('/api/projects/:id/files/:fid/verify', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'read', { scope: 'files:read' });
    const file = getFile(project, p.fid);
    const obj = currentObject(file);
    const crypto2 = crypto.createHash('sha256');
    let size = 0;
    for await (const c of await storage().get(obj.object_key)) { crypto2.update(c); size += c.length; }
    const actual = crypto2.digest('hex');
    const ok = actual === obj.sha256 && size === obj.size_bytes;
    audit(user.id, 'file.verify', { orgId: project.org_id, projectId: project.id, target: file.id, detail: { ok } });
    sendJson(res, 200, { ok, expected_sha256: obj.sha256, actual_sha256: actual, expected_size: obj.size_bytes, actual_size: size });
  });

  // Small text files (e.g. source code) can be created/edited directly.
  r.put('/api/projects/:id/files/:fid/content', async (req, res, ctx, p) => {
    const { project, user } = projectAccess(ctx, p.id, 'write', { scope: 'files:write' });
    const file = getFile(project, p.fid);
    if (!TEXT_PREVIEW.test(file.name)) throw bad('Only text files can be edited in place');
    const b = await readJson(req, 2 * 1024 * 1024);
    if (typeof b.content !== 'string' || b.content.length > 2 * 1024 * 1024) throw bad('content must be a string up to 2 MiB');
    const content = b.content;
    const updated = await storeBuffer({ project, user, folderId: file.folder_id, name: file.name, buffer: Buffer.from(content, 'utf8') });
    audit(user.id, 'file.edit', { orgId: project.org_id, projectId: project.id, target: file.id, detail: { version: updated.current_version } });
    sendJson(res, 200, { file: publicFile(updated) });
  });
}
