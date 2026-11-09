import { get, post, patch, del, uploadFile } from '../api.js';
import { h, card, table, badge, fmtBytes, fmtTime, ago, btn, toast, errMsg, formDialog, confirmDialog, modal, kv } from '../ui.js';
import { needProject, go, render } from '../app.js';

const icon = { dataset: '▦', notebook: '✎', model: '◈', checkpoint: '◉', source: '{}', log: '≡', archive: '▣', image: '▨', document: '▤', other: '·' };

export async function filesView(route) {
  const project = needProject('Storage & Files');
  const pid = project.id;
  const folderId = route.query.get('folder') || '';
  const trash = route.query.get('view') === 'trash';
  const sort = route.query.get('sort') || 'name'; const order = route.query.get('order') || 'asc';
  const q = route.query.get('q') || '';
  const nav = (o) => { const p = new URLSearchParams({ ...(folderId ? { folder: folderId } : {}), sort, order, ...(q ? { q } : {}), ...o }); for (const [k, v] of [...p]) if (!v) p.delete(k); go(`#/files?${p}`); };
  const data = trash ? await get(`/api/projects/${pid}/trash`) : q ? { search: (await get(`/api/projects/${pid}/files?q=${encodeURIComponent(q)}&sort=${sort}&order=${order}`)).files } : await get(`/api/projects/${pid}/browse?${new URLSearchParams({ ...(folderId ? { folder_id: folderId } : {}), sort, order })}`);
  const storage = data.storage || (await get(`/api/projects/${pid}/storage`).then((s) => ({ used_bytes: s.used_bytes, quota_bytes: s.quota_bytes })));
  const uploads = h('div.uploads', { 'aria-live': 'polite' });

  const doUpload = (files, overwrite = false) => {
    for (const file of files) {
      const bar = h('progress', { max: 1, value: 0 });
      const row = h('div.upload-row', {}, h('span', {}, file.name), bar);
      const u = uploadFile(pid, file, { folderId, overwrite, onProgress: (x) => { bar.value = x; } });
      row.append(btn('Cancel', () => u.abort()));
      uploads.append(row);
      u.promise.then(() => { row.remove(); toast(`Uploaded ${file.name}`); render(); }).catch(async (e) => {
        row.remove();
        if (e.code === 'name_taken' && await confirmDialog('File exists', `${file.name} already exists here. Upload as a new version?`, 'Upload new version')) return doUpload([file], true);
        toast(`${file.name}: ${errMsg(e)}`, e.code === 'aborted' ? 'info' : 'error');
      });
    }
  };
  const picker = h('input', { type: 'file', multiple: true, class: 'hidden', onchange: (e) => doUpload([...e.target.files]) });
  const newFolder = async () => {
    const v = await formDialog('New folder', [{ name: 'name', label: 'Folder name' }], 'Create');
    if (v) try { await post(`/api/projects/${pid}/folders`, { name: v.name, parent_id: folderId || null }); render(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const download = async (f) => { try { const r = await post(`/api/projects/${pid}/files/${f.id}/download-url`, {}); const a = h('a', { href: r.url, download: f.name }); document.body.append(a); a.click(); a.remove(); } catch (e) { toast(errMsg(e), 'error'); } };
  const folderOptions = async () => {
    const opts = [{ value: '', label: '/ (project root)' }];
    if (data.breadcrumbs) data.breadcrumbs.forEach((b) => opts.push({ value: b.id, label: `/${data.breadcrumbs.slice(0, data.breadcrumbs.indexOf(b) + 1).map((x) => x.name).join('/')}` }));
    (data.folders || []).forEach((f) => opts.push({ value: f.id, label: `${data.breadcrumbs?.length ? '/' + data.breadcrumbs.map((x) => x.name).join('/') : ''}/${f.name}` }));
    return opts;
  };
  const fileActions = (f) => h('div.row-actions', { onclick: (e) => e.stopPropagation() },
    btn('Download', () => download(f)),
    btn('Rename', async () => { const v = await formDialog('Rename file', [{ name: 'name', label: 'Name', value: f.name }]); if (v) try { await patch(`/api/projects/${pid}/files/${f.id}`, { name: v.name }); render(); } catch (e) { toast(errMsg(e), 'error'); } }),
    btn('Move', async () => { const v = await formDialog('Move file', [{ name: 'folder_id', label: 'Destination', type: 'select', options: await folderOptions() }], 'Move'); if (v) try { await patch(`/api/projects/${pid}/files/${f.id}`, { folder_id: v.folder_id || null }); render(); } catch (e) { toast(errMsg(e), 'error'); } }),
    btn('Copy', async () => { try { await post(`/api/projects/${pid}/files/${f.id}/copy`, {}); toast('Copied'); render(); } catch (e) { toast(errMsg(e), 'error'); } }),
    btn('Delete', async () => { if (await confirmDialog('Move to trash', `Move ${f.name} to trash? You can restore it from Trash.`, 'Move to trash', true)) try { await del(`/api/projects/${pid}/files/${f.id}`); render(); } catch (e) { toast(errMsg(e), 'error'); } }, 'ghost'));

  const openFile = async (f) => {
    if (f.kind === 'notebook') return go(`#/notebooks/${f.id}`);
    const [meta, pv] = await Promise.all([get(`/api/projects/${pid}/files/${f.id}`), get(`/api/projects/${pid}/files/${f.id}/preview`)]);
    const preview = pv.kind === 'text' ? h('pre.preview', {}, pv.content, pv.truncated ? '\n… (truncated)' : '') : pv.kind === 'image' ? h('img.preview-img', { src: pv.url, alt: f.name }) : h('p.muted', {}, pv.message);
    const verifyOut = h('span');
    await modal(f.name, h('div', {},
      kv([['Type', `${meta.file.kind} (${meta.file.mime})`], ['Size', fmtBytes(meta.file.size_bytes)], ['SHA-256', h('code.wrap', {}, meta.file.sha256)], ['Version', meta.file.version], ['Malware scan', badge(meta.file.scan_status)], ['Updated', fmtTime(meta.file.updated_at)]]),
      h('div.row', {}, btn('Verify integrity', async () => { const r = await post(`/api/projects/${pid}/files/${f.id}/verify`); verifyOut.replaceChildren(r.ok ? badge('verified') : badge('integrity_failed'), ` ${r.actual_sha256.slice(0, 16)}…`); }), verifyOut, btn('Download', () => download(f))),
      h('h4', {}, 'Preview'), preview,
      h('h4', {}, 'Versions'), table([{ label: 'v', key: 'version' }, { label: 'Size', render: (v) => fmtBytes(v.size_bytes) }, { label: 'SHA-256', render: (v) => h('code', {}, v.sha256.slice(0, 12) + '…') }, { label: 'When', render: (v) => fmtTime(v.created_at) },
        { label: '', render: (v) => v.version === meta.file.version ? 'current' : btn('Restore', async () => { await post(`/api/projects/${pid}/files/${f.id}/versions/${v.version}/restore`); toast(`Restored v${v.version} as a new version`); render(); }) }], meta.versions)), []);
  };

  const sortBtn = (key, label) => h('button.linkish', { type: 'button', onclick: () => nav({ sort: key, order: sort === key && order === 'asc' ? 'desc' : 'asc' }) }, label, sort === key ? (order === 'asc' ? ' ▲' : ' ▼') : '');
  const quotaPct = storage.quota_bytes ? Math.min(100, (storage.used_bytes / storage.quota_bytes) * 100) : 0;
  const head = h('div.page-head', {}, h('h1', {}, trash ? 'Trash' : 'Storage & Files'),
    h('div.row', {}, trash ? btn('← Back to files', () => go('#/files')) : [btn('+ Folder', newFolder), btn('⇪ Upload', () => picker.click(), 'primary'), btn('Trash', () => go('#/files?view=trash'))], picker));
  const quota = h('div.quota', {}, h('div.quota-bar', { role: 'progressbar', 'aria-valuenow': Math.round(quotaPct), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Storage quota used' }, h('div.quota-fill', { dataset: { pct: String(Math.round(quotaPct)) } })),
    h('small.muted', {}, `${fmtBytes(storage.used_bytes)} of ${fmtBytes(storage.quota_bytes)} used`));
  queueMicrotask(() => { const el = document.querySelector('.quota-fill'); if (el) el.style.width = `${quotaPct}%`; });

  if (trash) {
    return h('div.page', {}, head, card('Deleted files', btn('Empty trash', async () => { if (await confirmDialog('Empty trash', 'Permanently delete every file in trash? This cannot be undone.', 'Delete permanently', true)) { await post(`/api/projects/${pid}/trash/empty`); render(); } }, 'danger'),
      table([{ label: 'Name', key: 'name' }, { label: 'Size', render: (f) => fmtBytes(f.size_bytes) }, { label: 'Deleted', render: (f) => ago(f.deleted_at) },
        { label: '', render: (f) => h('div.row-actions', {}, btn('Restore', async () => { await post(`/api/projects/${pid}/files/${f.id}/restore`); render(); }), btn('Delete forever', async () => { if (await confirmDialog('Delete permanently', `Delete ${f.name} permanently?`, 'Delete', true)) { await del(`/api/projects/${pid}/files/${f.id}?permanent=1`); render(); } }, 'danger')) }], data.files, { empty: 'Trash is empty.' })),
    card('Deleted folders', table([{ label: 'Name', key: 'name' }, { label: 'Deleted', render: (f) => ago(f.deleted_at) }, { label: '', render: (f) => btn('Restore', async () => { await post(`/api/projects/${pid}/folders/${f.id}/restore`); render(); }) }], data.folders, { empty: 'No deleted folders.' })));
  }

  const searchBox = h('input.search-inline', { type: 'search', placeholder: 'Search files in project', value: q, 'aria-label': 'Search files', onkeydown: (e) => { if (e.key === 'Enter') nav({ q: e.target.value.trim(), folder: '' }); } });
  const crumbs = h('nav.crumbs', { 'aria-label': 'Folder path' }, h('a', { href: '#/files' }, project.name), ...(data.breadcrumbs || []).flatMap((b) => [' / ', h('a', { href: `#/files?folder=${b.id}` }, b.name)]));
  const drop = h('div.dropzone', { ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'), ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); doUpload([...e.dataTransfer.files]); } }, 'Drop files here to upload');
  const rows = q ? data.search.map((f) => ({ ...f, _type: 'file' })) : [...data.folders.map((f) => ({ ...f, _type: 'folder' })), ...data.files.map((f) => ({ ...f, _type: 'file' }))];
  return h('div.page', {}, head, quota, h('div.row', {}, searchBox, q ? btn('Clear search', () => nav({ q: '' })) : null), q ? h('p.muted', {}, `Results for “${q}”`) : crumbs, uploads,
    card(null, table([
      { label: sortBtn('name', 'Name'), render: (r) => h('span.fname', {}, h('span.ficon', { 'aria-hidden': 'true' }, r._type === 'folder' ? '🗀' : icon[r.kind] || '·'), r.name, r.path ? h('small.muted', {}, `  /${r.path}`) : null) },
      { label: sortBtn('kind', 'Type'), render: (r) => (r._type === 'folder' ? 'folder' : r.kind) },
      { label: sortBtn('size', 'Size'), render: (r) => (r._type === 'folder' ? '—' : fmtBytes(r.size_bytes)) },
      { label: sortBtn('updated', 'Updated'), render: (r) => ago(r.updated_at) },
      { label: 'Actions', render: (r) => r._type === 'folder'
        ? h('div.row-actions', { onclick: (e) => e.stopPropagation() }, btn('Rename', async () => { const v = await formDialog('Rename folder', [{ name: 'name', label: 'Name', value: r.name }]); if (v) try { await patch(`/api/projects/${pid}/folders/${r.id}`, { name: v.name }); render(); } catch (e) { toast(errMsg(e), 'error'); } }),
          btn('Delete', async () => { if (await confirmDialog('Move folder to trash', `Move ${r.name} and everything inside to trash?`, 'Move to trash', true)) { await del(`/api/projects/${pid}/folders/${r.id}`); render(); } }))
        : fileActions(r) },
    ], rows, { empty: 'This folder is empty. Upload files or create a folder.', onRow: (r) => (r._type === 'folder' ? nav({ folder: r.id, q: '' }) : openFile(r)) })), drop);
}
