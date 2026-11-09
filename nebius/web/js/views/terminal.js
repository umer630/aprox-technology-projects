import { get, post, del, sse } from '../api.js';
import { h, card, btn, toast, errMsg, badge, ago, table } from '../ui.js';
import { needProject, render } from '../app.js';

export async function terminalView(route) {
  const project = needProject('Terminal');
  const d = await get(`/api/projects/${project.id}/terminal/sessions`);
  const sid = route.parts[0] || (route.query.get('list') ? null : d.sessions.find((s) => s.status === 'ACTIVE')?.id);
  const L = d.limits;
  const intro = h('div.banner', {}, `Each session is an isolated container: no network, non-root, read-only system, ${L.memory} RAM, ${L.cpus} CPU, ${L.pids} processes, ${L.command_timeout_sec}s per command, idle timeout ${Math.round(L.idle_timeout_sec / 60)} min. Commands are audit-logged. This is a command terminal (no full-screen programs).`);
  const open = async () => { try { const r = await post(`/api/projects/${project.id}/terminal/sessions`); location.hash = `#/terminal/${r.session.id}`; } catch (e) { toast(errMsg(e), 'error'); } };
  if (!sid) return h('div.page', {}, h('div.page-head', {}, h('h1', {}, 'Terminal')), intro, card(null, btn('Open terminal session', open, 'primary')),
    card('Previous sessions', table([{ label: 'Session', key: 'id' }, { label: 'Status', render: (s) => badge(s.status) }, { label: 'Started', render: (s) => ago(s.created_at) }], d.sessions, { empty: 'No sessions yet.' })));
  const s = await get(`/api/projects/${project.id}/terminal/sessions/${sid}`);
  const screen = h('pre.terminal', { 'aria-live': 'polite', 'aria-label': 'Terminal output' });
  const write = (t, cls) => { screen.append(cls ? h(`span.${cls}`, {}, t) : document.createTextNode(t)); screen.scrollTop = screen.scrollHeight; };
  for (const x of s.history) { write(`$ ${x.command}\n`, 'cmd'); write(x.output || ''); if (x.exit_code) write(`[exit ${x.exit_code}${x.timed_out ? ', timed out' : ''}]\n`, 'muted'); }
  const hist = s.history.map((x) => x.command); let hi = hist.length;
  const input = h('input.term-input', { 'aria-label': 'Command', autocomplete: 'off', spellcheck: 'false', placeholder: s.session.status === 'ACTIVE' ? 'type a command and press Enter' : `session ${s.session.status}`, disabled: s.session.status !== 'ACTIVE' });
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); input.value = hist[hi] || ''; e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ''; e.preventDefault(); return; }
    if (e.key === 'c' && e.ctrlKey) { await post(`/api/projects/${project.id}/terminal/sessions/${sid}/interrupt`); return; }
    if (e.key !== 'Enter' || !input.value.trim()) return;
    const command = input.value; input.value = ''; hist.push(command); hi = hist.length;
    write(`$ ${command}\n`, 'cmd'); input.disabled = true;
    try { await sse(`/api/projects/${project.id}/terminal/sessions/${sid}/exec`, { command }, (ev, data) => { if (ev === 'out') write(data.text); if (ev === 'exit' && data.code) write(`[exit ${data.code}${data.timed_out ? ', timed out' : ''}]\n`, 'muted'); }); }
    catch (er) { write(`${errMsg(er)}\n`, 'err'); } finally { input.disabled = false; input.focus(); }
  });
  queueMicrotask(() => input.focus());
  return h('div.page', {}, h('div.page-head', {}, h('h1', {}, 'Terminal'), badge(s.session.status)), intro,
    h('div.row', {}, btn('Interrupt (Ctrl+C)', () => post(`/api/projects/${project.id}/terminal/sessions/${sid}/interrupt`)), btn('Disconnect', () => { location.hash = '#/terminal?list=1'; }),
      btn('Close session', async () => { await del(`/api/projects/${project.id}/terminal/sessions/${sid}`); location.hash = '#/terminal'; render(); }, 'danger'), s.session.status !== 'ACTIVE' ? btn('New session', open, 'primary') : null),
    h('div.term-wrap', {}, screen, h('div.term-line', {}, h('span.prompt', {}, '$'), input)));
}
