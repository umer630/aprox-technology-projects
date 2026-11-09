import { get, post, patch, sse } from '../api.js';
import { h, card, table, badge, fmtTime, ago, btn, toast, errMsg, formDialog, kv } from '../ui.js';
import { needProject, go, render, selectProject, state } from '../app.js';

export async function jobsView(route) {
  const [maybePid, jid] = route.parts;
  if (maybePid?.startsWith('prj_') && state.projects.some((p) => p.id === maybePid)) selectProject(maybePid);
  const project = needProject('Jobs');
  if (jid || (maybePid && maybePid.startsWith('job_'))) return jobDetail(project, jid || maybePid);
  const status = route.query.get('status') || '';
  const { jobs } = await get(`/api/projects/${project.id}/jobs${status ? `?status=${status}` : ''}`);
  const create = async () => {
    const v = await formDialog('New CPU job', [{ name: 'name', label: 'Name', placeholder: 'data-check' }, { name: 'command', label: 'Command (runs in an isolated container, no network)', type: 'textarea', placeholder: 'echo hello && uname -a' },
      { name: 'priority', label: 'Priority (0–10)', type: 'number', value: 5 }, { name: 'timeout_s', label: 'Timeout (seconds)', type: 'number', value: 600 }, { name: 'max_attempts', label: 'Max attempts', type: 'number', value: 1 }], 'Queue job');
    if (!v) return;
    try { const r = await post(`/api/projects/${project.id}/jobs`, { type: 'command', name: v.name || 'command', spec: { command: v.command }, priority: Number(v.priority), timeout_s: Number(v.timeout_s), max_attempts: Number(v.max_attempts) }); go(`#/jobs/${project.id}/${r.job.id}`); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const filter = h('select', { 'aria-label': 'Filter by status', onchange: (e) => go(`#/jobs${e.target.value ? `?status=${e.target.value}` : ''}`) }, ['', 'QUEUED', 'WAITING_FOR_GPU', 'BLOCKED', 'RUNNING', 'PAUSED', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].map((s) => h('option', { value: s, selected: s === status }, s || 'All statuses')));
  return h('div.page', {}, h('div.page-head', {}, h('h1', {}, 'Jobs'), h('div.row', {}, filter, btn('+ New job', create, 'primary'))),
    card(null, table([{ label: 'Name', render: (j) => h('strong', {}, j.name) }, { label: 'Type', key: 'type' }, { label: 'Status', render: (j) => badge(j.status) }, { label: 'Priority', key: 'priority' },
      { label: 'Attempts', render: (j) => `${j.attempts}/${j.max_attempts}` }, { label: 'Provider', render: (j) => j.provider_id || '—' }, { label: 'Created', render: (j) => ago(j.created_at) }], jobs, { empty: 'No jobs yet.', onRow: (j) => go(`#/jobs/${project.id}/${j.id}`) })));
}

async function jobDetail(project, jid) {
  const d = await get(`/api/projects/${project.id}/jobs/${jid}`);
  const j = d.job;
  const logEl = h('pre.log', { 'aria-live': 'polite', 'aria-label': 'Job log' });
  const statusEl = badge(j.status);
  const act = (a) => async () => { try { const r = await post(`/api/projects/${project.id}/jobs/${jid}/${a}`); toast(`${a}: ${r.status}`); render(); } catch (e) { toast(errMsg(e), 'error'); } };
  const ctl = new AbortController();
  window.addEventListener('hashchange', () => ctl.abort(), { once: true });
  sse(`/api/projects/${project.id}/jobs/${jid}/logs/stream`, null, (ev, data) => {
    if (ev === 'log') { logEl.append(document.createTextNode(data.text)); logEl.scrollTop = logEl.scrollHeight; }
    if (ev === 'status') statusEl.replaceWith(Object.assign(statusEl, { textContent: data.status }));
  }, { method: 'GET', signal: ctl.signal }).catch(() => {});
  const prio = async () => { const v = await formDialog('Change priority', [{ name: 'priority', label: 'Priority (0–10)', type: 'number', value: j.priority }]); if (v) { await patch(`/api/projects/${project.id}/jobs/${jid}`, { priority: Number(v.priority) }); render(); } };
  return h('div.page', {},
    h('div.page-head', {}, h('div', {}, h('a.muted', { href: '#/jobs' }, '← Jobs'), h('h1', {}, j.name, ' ', statusEl))),
    j.status === 'WAITING_FOR_GPU' ? h('div.banner.warn', {}, h('strong', {}, 'NO FREE GPU AVAILABLE'), ` — ${j.blocked_reason || ''}. The job is preserved and starts automatically when an eligible free GPU is available.`) : null,
    j.status === 'BLOCKED' ? h('div.banner.warn', {}, h('strong', {}, 'BLOCKED'), ` — ${j.blocked_reason || j.error || ''}`) : null,
    h('div.row', {}, btn('Cancel', act('cancel'), 'ghost', { disabled: ['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(j.status) }), btn('Pause', act('pause'), 'ghost', { disabled: !['RUNNING', 'STARTING', 'QUEUED', 'WAITING_FOR_GPU'].includes(j.status) }),
      btn('Resume', act('resume'), 'ghost', { disabled: j.status !== 'PAUSED' }), btn('Retry', act('retry'), 'primary', { disabled: !['FAILED', 'TIMED_OUT', 'CANCELLED', 'BLOCKED'].includes(j.status) }), btn('Priority', prio), btn('Refresh', () => render())),
    card('Details', kv([['Job ID', h('code', {}, j.id)], ['Type', j.type], ['Priority', j.priority], ['Attempts', `${j.attempts}/${j.max_attempts}`], ['Timeout', `${j.timeout_s}s`], ['Provider', j.provider_id || '—'], ['Provider ref', j.provider_ref || '—'],
      ['Requirements', h('code.wrap', {}, JSON.stringify(j.requirements))], ['Progress', j.progress ? h('code.wrap', {}, JSON.stringify(j.progress)) : 'not reported'], ['Error', j.error || '—'], ['Result', j.result ? h('code.wrap', {}, JSON.stringify(j.result)) : '—'],
      ['Created', fmtTime(j.created_at)], ['Started', fmtTime(j.started_at)], ['Finished', fmtTime(j.finished_at)]])),
    card('Log (live)', logEl),
    card('Events', table([{ label: 'When', render: (e) => fmtTime(e.created_at) }, { label: 'Type', key: 'type' }, { label: 'Message', key: 'message' }], d.events)));
}
