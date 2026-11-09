// Tiny DOM toolkit. All text goes through textContent — never innerHTML with data.
export function h(tag, attrs = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

export function toast(msg, kind = 'info') {
  const host = $('#toasts');
  const t = h(`div.toast.${kind}`, { role: kind === 'error' ? 'alert' : 'status' }, msg);
  host.append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 7000 : 4000);
}
export function errMsg(e) { return e?.message || String(e); }

export function modal(title, body, actions = []) {
  return new Promise((resolve) => {
    const close = (v) => { overlay.remove(); resolve(v); };
    const overlay = h('div.overlay', { onclick: (e) => { if (e.target === overlay) close(null); } },
      h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', {}, title), h('div.modal-body', {}, body),
        h('div.modal-actions', {}, h('button.btn.ghost', { type: 'button', onclick: () => close(null) }, 'Cancel'),
          ...actions.map((a) => h(`button.btn${a.danger ? '.danger' : '.primary'}`, { type: 'button', onclick: () => close(a.value ?? true) }, a.label)))));
    document.body.append(overlay);
    overlay.querySelector('input,select,textarea,button.primary,button.danger')?.focus();
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); });
  });
}
export async function confirmDialog(title, message, label = 'Confirm', danger = false) {
  return !!(await modal(title, h('p', {}, message), [{ label, danger }]));
}
/** Simple form modal. fields: [{ name, label, type, value, options, placeholder, required }] → values or null. */
export async function formDialog(title, fields, submitLabel = 'Save') {
  const inputs = {};
  const body = h('div.form', {}, fields.map((f) => {
    let input;
    if (f.type === 'select') input = h('select', { name: f.name }, f.options.map((o) => h('option', { value: o.value ?? o, selected: (o.value ?? o) === f.value }, o.label ?? o)));
    else if (f.type === 'textarea') input = h('textarea', { name: f.name, rows: f.rows || 4, placeholder: f.placeholder || '' }, f.value || '');
    else input = h('input', { name: f.name, type: f.type || 'text', value: f.value ?? '', placeholder: f.placeholder || '', required: f.required, autocomplete: 'off', step: f.step });
    inputs[f.name] = input;
    return h('label.field', {}, h('span', {}, f.label), input, f.help ? h('small.muted', {}, f.help) : null);
  }));
  const ok = await modal(title, body, [{ label: submitLabel }]);
  if (!ok) return null;
  const out = {};
  for (const [k, el] of Object.entries(inputs)) out[k] = el.type === 'checkbox' ? el.checked : el.value;
  return out;
}

export const fmtBytes = (n) => { if (n === null || n === undefined) return '—'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let x = Number(n); while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; } return `${x.toFixed(i ? 1 : 0)} ${u[i]}`; };
export const fmtTime = (t) => (t ? new Date(t).toLocaleString() : '—');
export const ago = (t) => { if (!t) return '—'; const s = Math.round((Date.now() - t) / 1000); if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.round(s / 60)}m ago`; if (s < 86400) return `${Math.round(s / 3600)}h ago`; return `${Math.round(s / 86400)}d ago`; };
export const badge = (status) => h(`span.badge.s-${String(status || '').toLowerCase().replace(/[^a-z_]/g, '')}`, {}, String(status || '—'));
export const unavailable = (reason) => h('span.unavailable', { title: reason || '' }, 'Unavailable', reason ? h('small', {}, ` — ${reason}`) : null);

export function table(columns, rows, { empty = 'Nothing here yet.', onRow } = {}) {
  if (!rows.length) return h('p.empty', {}, empty);
  return h('div.table-wrap', {}, h('table', {},
    h('thead', {}, h('tr', {}, columns.map((c) => h('th', {}, c.label)))),
    h('tbody', {}, rows.map((r) => h('tr', { class: onRow ? 'clickable' : '', onclick: onRow ? () => onRow(r) : null, tabindex: onRow ? 0 : null, onkeydown: onRow ? (e) => { if (e.key === 'Enter') onRow(r); } : null },
      columns.map((c) => h('td', { 'data-label': c.label }, c.render ? c.render(r) : (r[c.key] ?? '—'))))))));
}
export const card = (title, ...body) => h('section.card', {}, title ? h('h3', {}, title) : null, ...body);
export const stat = (label, value, note) => h('div.stat', {}, h('div.stat-label', {}, label), h('div.stat-value', {}, value), note ? h('div.stat-note', {}, note) : null);
export const kv = (pairs) => h('dl.kv', {}, pairs.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v ?? '—')]));
export const btn = (label, onclick, kind = 'ghost', attrs = {}) => h(`button.btn.${kind}`, { type: 'button', onclick, ...attrs }, label);
