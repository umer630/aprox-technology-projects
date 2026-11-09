import { get, post, put, del } from '../api.js';
import { h, card, table, btn, toast, errMsg, formDialog, ago, badge, confirmDialog } from '../ui.js';
import { needProject, go, render } from '../app.js';

const text = (s) => (Array.isArray(s) ? s.join('') : s || '');
function renderOutputs(outputs) {
  return (outputs || []).map((o) => {
    if (o.output_type === 'stream') return h(`pre.out.${o.name === 'stderr' ? 'err' : 'std'}`, {}, text(o.text));
    if (o.output_type === 'error') return h('pre.out.err', {}, `${o.ename}: ${o.evalue}\n`, (o.traceback || []).join('\n').replace(/\x1b\[[0-9;]*m/g, ''));
    const d = o.data || {};
    if (d['image/png']) return h('img.out-img', { src: `data:image/png;base64,${d['image/png']}`, alt: 'cell output' });
    return h('pre.out', {}, text(d['text/plain']));
  });
}

export async function notebooksView(route) {
  const project = needProject('Notebooks');
  const [fid] = route.parts;
  if (fid) return editor(project, fid);
  const [{ notebooks, sessions }, backend] = await Promise.all([get(`/api/projects/${project.id}/notebooks`), get('/api/notebooks/backend')]);
  const picker = h('input', { type: 'file', accept: '.ipynb', class: 'hidden', onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { const { uploadFile } = await import('../api.js'); await uploadFile(project.id, f, {}).promise; toast('Notebook uploaded'); render(); } catch (er) { toast(errMsg(er), 'error'); } } });
  return h('div.page', {}, h('div.page-head', {}, h('h1', {}, 'Notebooks'), h('div.row', {},
    btn('+ New notebook', async () => { const v = await formDialog('New notebook', [{ name: 'name', label: 'Name', placeholder: 'analysis' }], 'Create'); if (v) try { const r = await post(`/api/projects/${project.id}/notebooks`, { name: v.name }); go(`#/notebooks/${r.notebook.id}`); } catch (e) { toast(errMsg(e), 'error'); } }, 'primary'),
    btn('Upload .ipynb', () => picker.click()), picker)),
    h('div.banner', { class: backend.available ? '' : 'warn' }, backend.available ? `Kernels run in an isolated per-project container (${backend.image}): non-root, no Internet egress, CPU only.` : `Notebook execution unavailable: ${backend.detail || 'backend not configured'}. You can still create, edit, upload and download notebooks.`),
    card(null, table([{ label: 'Notebook', render: (n) => h('strong', {}, n.name) }, { label: 'Version', key: 'current_version' }, { label: 'Kernel', render: (n) => (sessions.some((s) => s.file_id === n.id) ? badge('ACTIVE') : '—') }, { label: 'Updated', render: (n) => ago(n.updated_at) }],
      notebooks, { empty: 'No notebooks yet. The Nick 4.8 Colab notebook can be found in an imported pipeline; upload any .ipynb here.', onRow: (n) => go(`#/notebooks/${n.id}`) })));
}

async function editor(project, fid) {
  const d = await get(`/api/projects/${project.id}/notebooks/${fid}`);
  const nb = d.notebook;
  let session = d.session;
  let dirty = false;
  const cellsEl = h('div.cells');
  const kernelEl = h('span');
  const setKernel = () => kernelEl.replaceChildren(session ? badge('kernel ACTIVE') : badge('no kernel'));
  setKernel();
  const save = async () => { try { const r = await put(`/api/projects/${project.id}/notebooks/${fid}`, { notebook: nb }); dirty = false; toast(`Saved (version ${r.version})`); } catch (e) { toast(errMsg(e), 'error'); } };
  const ensureKernel = async () => { if (session) return true; try { toast('Starting kernel…'); const r = await post(`/api/projects/${project.id}/notebooks/${fid}/session`); session = r.session; setKernel(); return true; } catch (e) { toast(errMsg(e), 'error'); return false; } };
  const runCell = async (i, outEl, runBtn) => {
    if (dirty) await save();
    if (!(await ensureKernel())) return;
    runBtn.disabled = true; outEl.replaceChildren(h('small.muted', {}, 'Running…'));
    try { const r = await post(`/api/projects/${project.id}/notebooks/${fid}/execute`, { cell_index: i }); nb.cells[i].outputs = r.outputs; nb.cells[i].execution_count = r.execution_count; outEl.replaceChildren(...renderOutputs(r.outputs), r.status === 'timeout' ? h('p.error', {}, 'Timed out — kernel interrupted.') : ''); }
    catch (e) { outEl.replaceChildren(h('p.error', {}, errMsg(e))); } finally { runBtn.disabled = false; }
  };
  const draw = () => cellsEl.replaceChildren(...nb.cells.map((c, i) => {
    const ta = h('textarea.code', { rows: Math.max(2, text(c.source).split('\n').length), spellcheck: 'false', 'aria-label': `Cell ${i + 1} source`, oninput: (e) => { c.source = e.target.value; dirty = true; } }, text(c.source));
    const outEl = h('div.outputs', {}, ...renderOutputs(c.outputs));
    const runBtn = btn('▶ Run', () => runCell(i, outEl, runBtn), 'primary');
    return h('div.cell', {}, h('div.cell-bar', {}, h('span.muted', {}, c.cell_type === 'code' ? `[${c.execution_count ?? ' '}]` : c.cell_type),
      c.cell_type === 'code' ? runBtn : null, btn('↑', () => { if (i) { [nb.cells[i - 1], nb.cells[i]] = [nb.cells[i], nb.cells[i - 1]]; dirty = true; draw(); } }), btn('↓', () => { if (i < nb.cells.length - 1) { [nb.cells[i + 1], nb.cells[i]] = [nb.cells[i], nb.cells[i + 1]]; dirty = true; draw(); } }),
      btn('✕', () => { nb.cells.splice(i, 1); dirty = true; draw(); })), ta, c.cell_type === 'code' ? outEl : null);
  }));
  draw();
  const addCell = (type) => { nb.cells.push(type === 'code' ? { cell_type: 'code', source: '', metadata: {}, outputs: [], execution_count: null } : { cell_type: 'markdown', source: '', metadata: {} }); dirty = true; draw(); };
  const download = async () => { const r = await post(`/api/projects/${project.id}/files/${fid}/download-url`, {}); const a = h('a', { href: r.url, download: d.file.name }); document.body.append(a); a.click(); a.remove(); };
  const mount = async () => {
    const { files } = await get(`/api/projects/${project.id}/files?sort=updated`);
    const v = await formDialog('Mount dataset / checkpoint into kernel', [{ name: 'file_id', label: 'Project file', type: 'select', options: files.filter((f) => f.kind !== 'notebook').map((f) => ({ value: f.id, label: `${f.path ? f.path + '/' : ''}${f.name}` })) }], 'Copy into ./data');
    if (!v) return; if (!(await ensureKernel())) return;
    try { const r = await post(`/api/projects/${project.id}/notebooks/mount`, { file_id: v.file_id }); toast(`Available in the kernel at ${r.path}`); } catch (e) { toast(errMsg(e), 'error'); }
  };
  return h('div.page', {}, h('div.page-head', {}, h('div', {}, h('a.muted', { href: '#/notebooks' }, '← Notebooks'), h('h1', {}, d.file.name)), kernelEl),
    h('div.row.sticky', {}, btn('Save', save, 'primary'), btn('+ Code', () => addCell('code')), btn('+ Markdown', () => addCell('markdown')), btn('Start kernel', ensureKernel), btn('Interrupt', async () => { try { await post(`/api/projects/${project.id}/notebooks/${fid}/interrupt`); toast('Interrupted'); } catch (e) { toast(errMsg(e), 'error'); } }),
      btn('Restart', async () => { try { await post(`/api/projects/${project.id}/notebooks/${fid}/restart`); toast('Kernel restarted'); } catch (e) { toast(errMsg(e), 'error'); } }),
      btn('Shut down', async () => { if (await confirmDialog('Shut down kernel', 'Stop the kernel? Variables in memory are lost.', 'Shut down')) { try { await del(`/api/projects/${project.id}/notebooks/${fid}/session`); session = null; setKernel(); } catch (e) { toast(errMsg(e), 'error'); } } }),
      btn('Mount data', mount), btn('Download', download)),
    cellsEl,
    h('details', {}, h('summary', {}, `History (${d.history.length} versions)`), table([{ label: 'Version', key: 'version' }, { label: 'Saved', render: (v) => ago(v.created_at) }], d.history)));
}
