import { get, post, patch, del } from '../api.js';
import { h, card, table, badge, fmtTime, ago, btn, toast, errMsg, formDialog, kv, stat, fmtBytes, unavailable, modal, confirmDialog } from '../ui.js';
import { needProject, go, render, state, currentProject, selectProject } from '../app.js';

export async function monitoringView() {
  const project = needProject('Monitoring');
  const [m, host] = await Promise.all([get(`/api/projects/${project.id}/monitoring`), get('/api/monitoring/host')]);
  const v = (x, f) => (x === null || x === undefined ? unavailable() : f ? f(x) : x);
  return h('div.page', {}, h('div.page-head', {}, h('h1', {}, 'Monitoring'), btn('Refresh', () => render())),
    h('p.muted', {}, 'Every value is measured live; anything that cannot be measured is shown as unavailable — never estimated.'),
    h('div.stats', {}, stat('Host CPU', v(host.cpu.usage_pct, (x) => `${x}%`), `load ${host.cpu.load_avg.join(' / ')}`), stat('Host RAM', `${host.memory.used_pct}%`, fmtBytes(host.memory.total_bytes)),
      stat('Disk (data)', host.disk.available ? `${host.disk.used_pct}%` : unavailable(host.disk.reason), host.disk.available ? `${fmtBytes(host.disk.free_bytes)} free` : null),
      stat('Network (host total)', host.network.available ? `↓${fmtBytes(host.network.rx_bytes_total)} ↑${fmtBytes(host.network.tx_bytes_total)}` : unavailable(host.network.reason)),
      stat('GPU utilisation', host.gpu.available ? host.gpu.devices.map((g) => `${g.utilization_pct}%`).join(' / ') : unavailable(host.gpu.reason)),
      stat('GPU memory', host.gpu.available ? host.gpu.devices.map((g) => `${g.memory_used_mb}/${g.vram_mb} MB`).join(' / ') : unavailable('no GPU'))),
    card('Training progress', table([{ label: 'Job', key: 'name' }, { label: 'Status', render: (j) => badge(j.status) }, { label: 'Epoch', render: (j) => v(j.progress.epoch) }, { label: 'Loss', render: (j) => v(j.progress.loss) }, { label: 'Note', render: (j) => j.progress.reason || j.progress.source || '' }], m.training, { empty: 'No training jobs.' })),
    card('Instances', table([{ label: 'Instance', key: 'name' }, { label: 'Status', render: (i) => badge(i.status) }, { label: 'CPU', render: (i) => (i.stats.available === false ? unavailable(i.stats.reason) : `${i.stats.cpu_pct}%`) }, { label: 'Memory', render: (i) => i.stats.mem_usage || '—' }, { label: 'Net I/O', render: (i) => i.stats.net_io || '—' }], m.instances, { empty: 'No instances.' })),
    h('div.grid2', {}, card('Jobs by status', table([{ label: 'Status', render: (r) => badge(r.status) }, { label: 'Count', key: 'n' }], m.jobs_by_status, { empty: 'No jobs.' })),
      card('Average job duration', table([{ label: 'Type', key: 'type' }, { label: 'Avg', render: (r) => `${Math.round(r.avg_ms / 1000)}s` }, { label: 'Runs', key: 'n' }], m.job_durations, { empty: 'No finished jobs.' })),
      card('Usage', table([{ label: 'Kind', key: 'kind' }, { label: 'Total', render: (r) => (r.unit === 'bytes' ? fmtBytes(r.total) : `${r.total} ${r.unit}`) }], m.usage, { empty: 'No usage recorded.' })),
      card('API (last 24 h)', kv([['Requests', m.api_last_24h.requests], ['Errors', m.api_last_24h.errors ?? 0], ['Avg latency', m.api_last_24h.avg_latency_ms ? `${Math.round(m.api_last_24h.avg_latency_ms)} ms` : '—']]))));
}

export async function logsView(route) {
  const project = needProject('Logs');
  const type = route.query.get('type') || 'audit';
  const r = await get(`/api/projects/${project.id}/logs?type=${type}`);
  const cols = { audit: [{ label: 'When', render: (x) => fmtTime(x.created_at) }, { label: 'Action', key: 'action' }, { label: 'By', render: (x) => x.actor || 'system' }, { label: 'Target', key: 'target' }],
    api: [{ label: 'When', render: (x) => fmtTime(x.created_at) }, { label: 'Method', key: 'method' }, { label: 'Route', key: 'route' }, { label: 'Status', key: 'status' }, { label: 'Latency', render: (x) => `${x.latency_ms} ms` }],
    jobs: [{ label: 'When', render: (x) => fmtTime(x.created_at) }, { label: 'Job', key: 'job_name' }, { label: 'Event', key: 'type' }, { label: 'Message', key: 'message' }],
    terminal: [{ label: 'When', render: (x) => fmtTime(x.created_at) }, { label: 'Command', render: (x) => h('code', {}, x.command) }, { label: 'Exit', key: 'exit_code' }] };
  return h('div.page', {}, h('div.page-head', {}, h('h1', {}, 'Logs')),
    h('div.tabs', {}, [['audit', 'Audit / application'], ['jobs', 'Training & job'], ['api', 'API'], ['terminal', 'Terminal']].map(([t, l]) => h('a', { href: `#/logs?type=${t}`, class: t === type ? 'active' : '' }, l))),
    h('p.muted', {}, 'Security and system logs are in the Admin Console (superadmin).'), card(null, table(cols[type], r.logs, { empty: 'No log entries.' })));
}

export async function apiView() {
  const project = needProject('API Management');
  let keys; try { keys = await get(`/api/projects/${project.id}/apikeys`); } catch (e) { if (e.status === 403) return card('API Management', h('p', {}, 'Only project admins can manage API keys.')); throw e; }
  const { scopes } = await get('/api/apikeys/scopes');
  const { endpoints } = await get('/api/meta/endpoints');
  const usage = Object.fromEntries(keys.usage.map((u) => [u.api_key_id, u]));
  const create = async () => {
    const box = h('div.form', {}, h('label.field', {}, h('span', {}, 'Name'), h('input', { name: 'name', placeholder: 'ci-pipeline' })),
      h('fieldset', {}, h('legend', {}, 'Scopes'), scopes.map((s) => h('label.check', {}, h('input', { type: 'checkbox', value: s, checked: s.endsWith(':read') }), ` ${s}`))),
      h('label.field', {}, h('span', {}, 'Rate limit (requests / minute)'), h('input', { name: 'rpm', type: 'number', value: 60 })), h('label.field', {}, h('span', {}, 'Expires in (days)'), h('input', { name: 'days', type: 'number', value: 90 })));
    if (!(await modal('Create API key', box, [{ label: 'Create key' }]))) return;
    try {
      const r = await post(`/api/projects/${project.id}/apikeys`, { name: box.querySelector('[name=name]').value, scopes: [...box.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value), rate_limit_per_min: Number(box.querySelector('[name=rpm]').value), expires_in_days: Number(box.querySelector('[name=days]').value) });
      await modal('Your new API key', h('div', {}, h('p', {}, r.warning), h('code.wrap.secret', {}, r.key), btn('Copy', () => navigator.clipboard?.writeText(r.key).then(() => toast('Copied')))));
      render();
    } catch (e) { toast(errMsg(e), 'error'); }
  };
  return h('div.page', {}, h('div.page-head', {}, h('h1', {}, 'API Management'), btn('+ Create API key', create, 'primary')),
    card('Keys', table([{ label: 'Name', key: 'name' }, { label: 'Prefix', render: (k) => h('code', {}, `${k.prefix}…`) }, { label: 'Scopes', render: (k) => k.scopes.join(', ') }, { label: 'Rate', render: (k) => `${k.rate_limit_per_min}/min` },
      { label: 'Requests', render: (k) => usage[k.id]?.requests ?? 0 }, { label: 'Last used', render: (k) => ago(k.last_used_at) }, { label: 'Status', render: (k) => badge(k.revoked_at ? 'revoked' : k.expires_at < Date.now() ? 'expired' : 'active') },
      { label: '', render: (k) => (k.revoked_at ? '' : btn('Revoke', async () => { if (await confirmDialog('Revoke key', `Revoke ${k.name}? Clients using it stop working immediately.`, 'Revoke', true)) { await del(`/api/projects/${project.id}/apikeys/${k.id}`); render(); } }, 'danger')) }], keys.keys, { empty: 'No API keys.' })),
    card('Usage', h('pre.code-sample', {}, `curl -H "Authorization: Bearer nbk_…" ${location.origin}/api/projects/${project.id}/browse\n\ncurl -X POST -H "Authorization: Bearer nbk_…" -H "content-type: application/json" \\\n  -d '{"messages":[{"role":"user","content":"Hello"}]}' ${location.origin}/api/v1/projects/${project.id}/inference`),
      h('p.muted', {}, 'Inference returns 503 until this project has an evidence-VERIFIED model and the operator configures an inference server. It never returns simulated answers.')),
    card(`API reference (${endpoints.length} endpoints)`, h('details', {}, h('summary', {}, 'Show all endpoints'), table([{ label: 'Method', key: 'method' }, { label: 'Path', render: (e) => h('code', {}, e.path) }], endpoints)), h('p', {}, 'Full documentation: nebius/docs/API.md in the repository.')));
}

export async function notificationsView() {
  const { notifications } = await get('/api/notifications');
  return h('div.page', {}, h('div.page-head', {}, h('h1', {}, 'Notifications'), btn('Mark all read', async () => { await post('/api/notifications/read-all'); state.unread = 0; render(); })),
    card(null, table([{ label: '', render: (n) => (n.read_at ? '' : badge('new')) }, { label: 'Title', render: (n) => h('strong', {}, n.title) }, { label: 'Detail', key: 'body' }, { label: 'When', render: (n) => ago(n.created_at) }],
      notifications, { empty: 'No notifications.', onRow: async (n) => { if (!n.read_at) await post(`/api/notifications/${n.id}/read`); if (n.link) go(n.link.replace(/^#\/(jobs|compute)\/prj_[^/]+\//, '#/$1/')); else render(); } })));
}

export async function settingsView() {
  const [me, sessions, version] = await Promise.all([get('/api/auth/me'), get('/api/auth/sessions'), get('/api/version')]);
  const u = me.user;
  return h('div.page', {}, h('div.page-head', {}, h('h1', {}, 'Settings & Profile')),
    card('Profile', kv([['Name', u.display_name], ['Email', u.email], ['Email verified', u.email_verified ? 'yes' : h('span', {}, 'no — ', btn('Resend verification', async () => { await post('/api/auth/resend-verification'); toast('Verification email sent'); }))], ['Platform role', u.platform_role], ['Member since', fmtTime(u.created_at)]]),
      h('div.row', {}, btn('Edit name', async () => { const v = await formDialog('Edit profile', [{ name: 'display_name', label: 'Name', value: u.display_name }]); if (v) { await patch('/api/auth/me', v); state.user = null; render(); } }),
        btn('Change password', async () => { const v = await formDialog('Change password', [{ name: 'current_password', label: 'Current password', type: 'password' }, { name: 'new_password', label: 'New password', type: 'password' }]); if (v) try { await post('/api/auth/change-password', v); toast('Password changed; other sessions signed out'); } catch (e) { toast(errMsg(e), 'error'); } }),
        btn('Sign out', async () => { await post('/api/auth/logout'); state.user = null; go('#/login'); }, 'danger'))),
    card('Active sessions', table([{ label: 'Client', key: 'client' }, { label: 'IP', key: 'ip' }, { label: 'Last seen', render: (s) => ago(s.last_seen_at) }, { label: 'Expires', render: (s) => fmtTime(s.expires_at) },
      { label: '', render: (s) => (s.current ? badge('this device') : btn('Revoke', async () => { await del(`/api/auth/sessions/${s.id}`); render(); })) }], sessions.sessions)),
    card('About', kv([['Product', `${version.product} ${version.version}`], ['Name status', version.name_status], ['API', version.api], ['Environment', version.env]])));
}

export async function adminView(route) {
  if (state.user.platform_role !== 'superadmin') return card('Admin Console', h('p', {}, 'Superadmin access required.'));
  const type = route.query.get('logs') || 'security';
  const [sys, users, logs] = await Promise.all([get('/api/admin/system'), get('/api/admin/users'), get(`/api/admin/logs?type=${type}&limit=100`)]);
  return h('div.page', {}, h('div.page-head', {}, h('h1', {}, 'Admin Console'), h('div.row', {}, btn('Run all provider health checks', async () => { await post('/api/admin/providers/health'); toast('Health checks complete'); go('#/compute?tab=providers'); }),
    btn('Create backup', async () => { try { const b = await post('/api/admin/backup'); toast(`Backup ${b.name}: DB sha256 ${b.database_sha256.slice(0, 12)}…, ${b.objects} objects`); } catch (e) { toast(errMsg(e), 'error'); } }, 'primary'))),
    h('div.stats', {}, Object.entries(sys.counts).map(([k, v]) => stat(k.replace('_', ' '), k === 'storage_bytes' ? fmtBytes(v) : v))),
    card('Users', table([{ label: 'Email', key: 'email' }, { label: 'Verified', render: (x) => (x.email_verified ? 'yes' : 'no') }, { label: 'Role', key: 'platform_role' }, { label: 'Status', render: (x) => badge(x.status) },
      { label: '', render: (x) => (x.id === state.user.id ? 'you' : h('div.row-actions', {}, btn(x.status === 'active' ? 'Suspend' : 'Reactivate', async () => { await patch(`/api/admin/users/${x.id}`, { status: x.status === 'active' ? 'suspended' : 'active' }); render(); }, x.status === 'active' ? 'danger' : 'ghost'),
        btn(x.platform_role === 'superadmin' ? 'Make user' : 'Make superadmin', async () => { if (await confirmDialog('Change platform role', `Change ${x.email}'s platform role?`, 'Change')) { try { await patch(`/api/admin/users/${x.id}`, { platform_role: x.platform_role === 'superadmin' ? 'user' : 'superadmin' }); render(); } catch (e) { toast(errMsg(e), 'error'); } } }))) }], users.users)),
    card('Logs', h('div.tabs', {}, [['security', 'Security'], ['audit', 'Audit'], ['api', 'API requests'], ['mail', 'Mail outbox']].map(([t, l]) => h('a', { href: `#/admin?logs=${t}`, class: t === type ? 'active' : '' }, l))),
      table(Object.keys(logs.logs[0] || { created_at: 1 }).filter((k) => !['id'].includes(k)).slice(0, 7).map((k) => ({ label: k, render: (r) => (k.endsWith('_at') ? fmtTime(r[k]) : String(r[k] ?? '')) })), logs.logs, { empty: 'No entries.' })),
    card('Database migrations', table([{ label: 'Version', key: 'version' }, { label: 'Name', key: 'name' }, { label: 'Applied', render: (m) => fmtTime(m.applied_at) }], sys.migrations)));
}

export async function searchView(route) {
  const q = route.query.get('q') || '';
  const { results } = await get(`/api/search?q=${encodeURIComponent(q)}`);
  const open = (r) => { selectProject(r.project_id); go(r.type === 'project' ? `#/projects/${r.id}` : r.type === 'file' ? `#/files?q=${encodeURIComponent(r.title)}` : r.type === 'job' ? `#/jobs/${r.project_id}/${r.id}` : `#/compute/${r.id}`); };
  return h('div.page', {}, h('div.page-head', {}, h('h1', {}, `Search: “${q}”`)), card(null, table([{ label: 'Type', render: (r) => badge(r.type) }, { label: 'Name', key: 'title' }, { label: '', key: 'subtitle' }], results, { empty: 'No results in projects you can access.', onRow: open })));
}

export async function helpView() {
  const p = currentProject();
  return h('div.page', {}, h('div.page-head', {}, h('h1', {}, 'Help')),
    card('Getting started', h('ol', {}, h('li', {}, 'Create a project (Projects → Create project).'), h('li', {}, 'Upload datasets and notebooks (Storage & Files).'), h('li', {}, 'AI Training → Import Approx-Ai pipeline → Run preflight → Start training.'),
      h('li', {}, 'GPU jobs run only on free, verified providers. If none is available you will see NO FREE GPU AVAILABLE and the job waits.'), h('li', {}, 'Training is reported COMPLETE only after the evidence verifier re-hashes the adapter and checks inference results.'))),
    card('Roles', table([{ label: 'Role', key: 'r' }, { label: 'Can', key: 'c' }], [{ r: 'Superadmin', c: 'Everything, provider verification, users, backups' }, { r: 'Organization admin', c: 'Org settings, members, all org projects' }, { r: 'Project admin', c: 'Project settings, members, API keys, archive/delete' }, { r: 'Developer', c: 'Files, notebooks, jobs, instances, terminal' }, { r: 'Viewer', c: 'Read-only' }])),
    card('Free-only GPU policy', h('p', {}, 'NEBIUS never enables billing, starts paid trials or uses credit cards. Paid clouds are listed as INELIGIBLE_FOR_FREE_ONLY_MODE. Colab is MANUAL_ONLY: run the notebook yourself and upload the evidence for verification.')),
    card('Name', h('p', {}, 'NEBIUS is a provisional internal development name. It is not affiliated with Nebius Group N.V. or Nebius AI Cloud. Trademark, domain and app-store clearance are required before any release.')),
    p ? card('Current project', kv([['Name', p.name], ['Project ID', p.project_code]])) : null);
}
