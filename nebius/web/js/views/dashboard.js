import { get } from '../api.js';
import { h, card, stat, table, badge, fmtBytes, ago, unavailable } from '../ui.js';
import { state, go } from '../app.js';

const pct = (x) => (typeof x === 'number' ? `${x}%` : null);
export async function dashboard() {
  const d = await get(`/api/dashboard${state.orgId ? `?org_id=${state.orgId}` : ''}`);
  const hm = d.host;
  const gpuNone = d.gpu_providers.status === 'NO FREE GPU AVAILABLE';
  return h('div.page', {},
    h('div.page-head', {}, h('h1', {}, 'Dashboard'), h('small.muted', {}, `Measured ${new Date(hm.measured_at).toLocaleTimeString()}`)),
    gpuNone ? h('div.banner.warn', { role: 'status' }, h('strong', {}, 'NO FREE GPU AVAILABLE'), ' — GPU jobs are queued and preserved until an eligible free provider is verified, enabled and healthy. ', h('a', { href: '#/compute' }, 'Provider status →')) : null,
    h('div.stats', {},
      stat('Projects', d.projects, d.archived_projects ? `${d.archived_projects} archived` : null),
      stat('Free GPU providers ready', `${d.gpu_providers.free_eligible_dispatchable} / ${d.gpu_providers.listed}`, d.gpu_providers.status),
      stat('Active GPU jobs', d.active_gpu_jobs, d.waiting_for_gpu ? `${d.waiting_for_gpu} waiting for GPU` : null),
      stat('Running instances', d.running_instances),
      stat('Storage used', fmtBytes(d.storage_bytes)),
      stat('Host CPU', pct(hm.cpu.usage_pct) ?? '—', `${hm.cpu.cores} cores · load ${hm.cpu.load_avg.join(' / ')}`),
      stat('Host RAM', pct(hm.memory.used_pct), `${fmtBytes(hm.memory.total_bytes - hm.memory.free_bytes)} of ${fmtBytes(hm.memory.total_bytes)}`),
      stat('Host GPU', hm.gpu.available ? hm.gpu.devices.map((g) => g.name).join(', ') : unavailable(hm.gpu.reason))),
    h('div.grid2', {},
      card('Job status', d.job_status.length ? h('div.chips', {}, d.job_status.map((s) => h('span.chip', {}, badge(s.status), ` ${s.n}`))) : null,
        table([{ label: 'Job', render: (j) => j.name }, { label: 'Status', render: (j) => badge(j.status) }, { label: 'Created', render: (j) => ago(j.created_at) }], d.recent_jobs, { empty: 'No jobs yet.', onRow: (j) => go(`#/jobs/${j.project_id}/${j.id}`) })),
      card('Recent activity', table([{ label: 'Action', key: 'action' }, { label: 'By', render: (a) => a.actor || 'system' }, { label: 'When', render: (a) => ago(a.created_at) }], d.recent_activity, { empty: 'No activity yet.' })),
      card('System health', h('div', { id: 'health' }, h('p.muted', {}, 'Checking…'))),
      card('Notifications', h('p', {}, `${d.notifications_unread} unread. `, h('a', { href: '#/notifications' }, 'Open notifications')))),
    loadHealth());
}
function loadHealth() {
  get('/api/monitoring/health').then((hl) => {
    const el = document.getElementById('health'); if (!el) return;
    el.replaceChildren(table([{ label: 'Component', key: 'c' }, { label: 'Status', render: (r) => badge(r.s) }, { label: 'Detail', key: 'd' }], [
      { c: 'Database', s: hl.database.ok ? 'healthy' : 'error', d: 'SQLite' },
      { c: 'Object storage', s: hl.storage.ok ? 'healthy' : 'error', d: hl.storage.backend },
      { c: 'Container runtime', s: hl.container_runtime.ok ? 'healthy' : 'unavailable', d: hl.container_runtime.detail },
      ...hl.providers.map((p) => ({ c: p.name, s: p.status, d: p.detail || '' })),
    ]));
  }).catch(() => {});
  return null;
}
