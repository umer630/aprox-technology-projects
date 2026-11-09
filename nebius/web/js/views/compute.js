import { get, post, del } from '../api.js';
import { h, card, table, badge, fmtTime, ago, btn, toast, errMsg, formDialog, confirmDialog, kv, unavailable, stat } from '../ui.js';
import { currentProject, go, render, state } from '../app.js';

export async function computeView(route) {
  const [a] = route.parts;
  const tab = route.query.get('tab') || 'instances';
  const project = currentProject();
  if (a && project) return instanceDetail(project, a);
  const tabs = h('div.tabs', { role: 'tablist' }, [['instances', 'VM instances'], ['providers', 'GPU providers'], ['gpu', 'GPU availability']].map(([t, l]) => h('a', { href: `#/compute?tab=${t}`, role: 'tab', class: t === tab ? 'active' : '', 'aria-selected': t === tab ? 'true' : 'false' }, l)));
  let body;
  if (tab === 'providers') body = await providersTab();
  else if (tab === 'gpu') body = await gpuTab();
  else body = project ? await instancesTab(project) : card('VM instances', h('p', {}, 'Select a project in the top bar to manage its instances.'));
  return h('div.page', {}, h('div.page-head', {}, h('h1', {}, 'Compute Engine')), tabs, body);
}

async function instancesTab(project) {
  const [{ instances }, { providers }] = await Promise.all([get(`/api/projects/${project.id}/instances`), get('/api/providers')]);
  const usable = providers.filter((p) => p.capabilities.instances && p.dispatchable);
  const create = async () => {
    if (!usable.length) return toast('No instance provider is currently available (see GPU providers tab).', 'error');
    const prov = usable[0];
    const detail = await get(`/api/providers/${prov.id}`);
    const v = await formDialog('Create VM instance', [
      { name: 'name', label: 'Name', placeholder: 'worker-1', help: 'lowercase letters, digits, hyphens' },
      { name: 'provider_id', label: 'Provider', type: 'select', options: usable.map((p) => ({ value: p.id, label: p.name })) },
      { name: 'machine_type', label: 'Machine type', type: 'select', options: detail.machine_types.map((m) => ({ value: m.id, label: `${m.id} — ${m.cpus} vCPU, ${m.ram_mb} MB RAM, ${m.disk_gb} GB scratch${m.gpu ? `, ${m.gpu}` : ', no GPU'}` })) },
      { name: 'image', label: 'Image', type: 'select', options: ['alpine:3.20'] },
    ], 'Create');
    if (!v) return;
    try { const r = await post(`/api/projects/${project.id}/instances`, v); toast(`Instance ${r.instance.name}: ${r.instance.status}`); render(); } catch (e) { toast(errMsg(e), 'error'); render(); }
  };
  return card('VM instances', h('div.row', {}, btn('+ Create instance', create, 'primary'), h('small.muted', {}, usable.length ? `CPU sandboxes on ${usable.map((p) => p.name).join(', ')}. GPU work runs as jobs on free GPU providers.` : 'No instance provider is available right now.')),
    table([{ label: 'Name', render: (i) => h('strong', {}, i.name) }, { label: 'Status', render: (i) => badge(i.status) }, { label: 'Machine', key: 'machine_type' }, { label: 'Provider', key: 'provider_id' },
      { label: 'GPU', render: (i) => i.gpu || 'none' }, { label: 'Confirmed', render: (i) => ago(i.status_confirmed_at) }], instances, { empty: 'No instances. Create one to get an isolated CPU machine.', onRow: (i) => go(`#/compute/${i.id}`) }));
}

async function instanceDetail(project, iid) {
  const d = await get(`/api/projects/${project.id}/instances/${iid}`);
  const i = d.instance;
  const act = (a) => async () => { try { const r = await post(`/api/projects/${project.id}/instances/${iid}/${a}`); toast(`${a}: ${r.instance.status}`); } catch (e) { toast(errMsg(e), 'error'); } render(); };
  const runCmd = async () => {
    const v = await formDialog('Run command on instance', [{ name: 'command', label: 'Shell command', placeholder: 'uname -a && df -h' }], 'Run as job');
    if (!v) return;
    try { const r = await post(`/api/projects/${project.id}/jobs`, { type: 'command', name: `cmd on ${i.name}`, spec: { command: v.command, instance_id: i.id }, allow_duplicate: true }); go(`#/jobs/${project.id}/${r.job.id}`); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const s = d.stats;
  return h('div.page', {},
    h('div.page-head', {}, h('div', {}, h('a.muted', { href: '#/compute' }, '← Instances'), h('h1', {}, i.name, ' ', badge(i.status)))),
    h('div.row', {}, btn('Start', act('start'), 'primary', { disabled: !['STOPPED', 'FAILED'].includes(i.status) }), btn('Stop', act('stop'), 'ghost', { disabled: i.status !== 'RUNNING' }), btn('Restart', act('restart'), 'ghost', { disabled: !['RUNNING', 'STOPPED', 'FAILED'].includes(i.status) }),
      btn('Run command', runCmd, 'ghost', { disabled: i.status !== 'RUNNING' }), btn('Refresh', () => render()),
      btn('Delete', async () => { if (await confirmDialog('Delete instance', `Delete ${i.name}? The container and its scratch disk are destroyed.`, 'Delete', true)) { try { await del(`/api/projects/${project.id}/instances/${iid}`); go('#/compute'); } catch (e) { toast(errMsg(e), 'error'); } } }, 'danger')),
    h('div.stats', {}, stat('CPU', s ? `${s.cpu_pct}%` : unavailable(), `limit ${i.cpu_limit} vCPU`), stat('Memory', s ? s.mem_usage : unavailable(), `limit ${i.ram_mb} MB`), stat('Network', s ? s.net_io : unavailable(), `mode: ${i.network} (isolated)`), stat('Processes', s ? s.pids : unavailable())),
    h('p.muted', {}, d.stats_note),
    card('Details', kv([['Provider', i.provider_id], ['Machine type', i.machine_type], ['Image', i.image], ['vCPU', i.cpu_limit], ['RAM', `${i.ram_mb} MB`], ['Scratch disk', `${i.disk_gb} GB (tmpfs)`], ['GPU', i.gpu || 'none'], ['Provider state', i.observed ? `${i.observed.status} — ${i.observed.detail}` : '—'], ['Last confirmed', fmtTime(i.status_confirmed_at)], ['Last error', i.last_error || '—'], ['Created', fmtTime(i.created_at)]])),
    card('Attached jobs', table([{ label: 'Job', key: 'name' }, { label: 'Status', render: (j) => badge(j.status) }, { label: 'Created', render: (j) => ago(j.created_at) }], d.jobs, { empty: 'No jobs have run on this instance.', onRow: (j) => go(`#/jobs/${project.id}/${j.id}`) })),
    card('History', table([{ label: 'From', render: (e) => e.from_status || '—' }, { label: 'To', render: (e) => badge(e.to_status) }, { label: 'Detail', key: 'detail' }, { label: 'When', render: (e) => fmtTime(e.created_at) }], d.events)));
}

async function providersTab() {
  const { providers } = await get('/api/providers');
  const admin = state.user.platform_role === 'superadmin';
  const yesno = (v) => (v === false ? 'No' : v === true ? 'Yes' : 'Unknown');
  return h('div', {},
    h('div.banner', {}, 'Free-only policy: a provider receives work only if it requires no credit card and no billing, a superadmin has verified the account, it is enabled, and its live health check passes. Facts below are documentation with a review date — never live availability.'),
    providers.map((p) => card(null,
      h('div.prov-head', {}, h('h3', {}, p.name, p.mock ? ' (TEST DOUBLE)' : ''), badge(p.free_only_status), p.dispatchable ? badge('dispatchable') : null),
      kv([['Kind', p.kind], ['Credit card required', yesno(p.facts.credit_card_required)], ['Billing required', yesno(p.facts.billing_required)], ['GPU types', p.facts.gpu_types.join(', ') || 'none'],
        ['GPU VRAM', p.facts.gpu_vram_gb ? `${p.facts.gpu_vram_gb} GB` : p.facts.gpu_vram_gb === 0 ? 'none' : 'detected at runtime'], ['CUDA capability', p.facts.cuda_capability], ['Session duration', p.facts.session_duration], ['Usage limits', p.facts.usage_limits],
        ['Signup', p.facts.signup_eligibility], ['Countries', p.facts.country_availability], ['Training eligible', yesno(p.facts.training_eligible)], ['Restrictions', p.facts.restrictions],
        ['Facts source', `${p.facts.facts_source} (reviewed ${p.facts.facts_reviewed_on})`],
        ['Live health', p.health ? `${p.health.status} — ${p.health.detail || ''}` : 'never checked'], ['Last check', fmtTime(p.last_health_check_at)], ['Last successful check', fmtTime(p.last_successful_health_check_at)],
        ['Detected GPUs', p.resources.length ? p.resources.map((r) => `${r.name} ${r.vram_mb ? Math.round(r.vram_mb / 1024) + ' GB' : ''} (${r.source})`).join('; ') : 'none detected'],
        ['Admin verification', p.admin_verified ? `verified ${fmtTime(p.verified_at)} — ${p.verification_notes}` : 'not verified'], ['Enabled', p.enabled ? 'yes' : 'no']]),
      h('div.row', {}, p.kind !== 'catalog-only' ? btn('Run health check', async () => { try { await post(`/api/providers/${p.id}/health`); render(); } catch (e) { toast(errMsg(e), 'error'); } }) : null,
        admin && p.free_only_status !== 'INELIGIBLE_FOR_FREE_ONLY_MODE' && p.free_only_status !== 'MANUAL_ONLY' && p.kind !== 'cpu-container' ? [
          btn(p.admin_verified ? 'Revoke verification' : 'Verify free-only account…', async () => {
            if (p.admin_verified) { await post(`/api/admin/providers/${p.id}/verify`, { verified: false, notes: '' }); return render(); }
            const v = await formDialog(`Verify ${p.name}`, [{ name: 'notes', label: 'What did you check? (min 20 chars)', type: 'textarea', placeholder: 'e.g. Account X: phone verified, no payment method on file, no paid plan, GPU quota visible on provider site.' },
              { name: 'confirm', label: 'I confirm: no credit card, no billing account, no paid trial and no auto-upgrade on this account', type: 'select', options: [{ value: '', label: 'Not confirmed' }, { value: 'yes', label: 'Confirmed' }] }], 'Record verification');
            if (!v) return;
            try { await post(`/api/admin/providers/${p.id}/verify`, { verified: true, notes: v.notes, confirm_free_only: v.confirm === 'yes' }); render(); } catch (e) { toast(errMsg(e), 'error'); }
          }),
          btn(p.enabled ? 'Disable' : 'Enable', async () => { try { await post(`/api/admin/providers/${p.id}/enabled`, { enabled: !p.enabled }); render(); } catch (e) { toast(errMsg(e), 'error'); } }, p.enabled ? 'ghost' : 'primary')] : null))));
}

async function gpuTab() {
  const g = await get('/api/gpu/availability?min_vram_gb=14');
  return h('div', {},
    g.available ? card('GPU available', kv([['Provider', g.provider], ['GPU', g.gpu.name], ['VRAM', g.gpu.vram_mb ? `${Math.round(g.gpu.vram_mb / 1024)} GB` : '—'], ['Source', g.gpu_source]]))
      : h('div.banner.warn', { role: 'status' }, h('strong', {}, 'NO FREE GPU AVAILABLE'), h('ul', {}, g.reasons.map((r) => h('li', {}, r)))),
    card('Detected GPU resources', table([{ label: 'Provider', key: 'provider_id' }, { label: 'GPU', key: 'name' }, { label: 'VRAM', render: (r) => (r.vram_mb ? `${Math.round(r.vram_mb / 1024)} GB` : '—') }, { label: 'CUDA cap.', key: 'cuda_capability' }, { label: 'Driver', key: 'driver_version' }, { label: 'CUDA', key: 'cuda_version' }, { label: 'Util.', render: (r) => (r.utilization_pct !== null ? `${r.utilization_pct}%` : '—') }, { label: 'Source', key: 'source' }, { label: 'Detected', render: (r) => ago(r.detected_at) }], g.detected_resources, { empty: 'No GPU detected by any provider or runtime diagnostic.' })),
    card('This server', kv([['CPU', `${g.host.cpus} × ${g.host.cpu_model}`], ['RAM', `${g.host.total_mem_mb} MB`], ['OS', g.host.platform]])));
}
