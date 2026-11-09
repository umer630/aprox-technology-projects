import { get, post, setCsrf, ApiError } from './api.js';
import { h, $, clear, toast, errMsg, btn } from './ui.js';
import { views } from './views/index.js';

const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

export const state = { user: null, orgs: [], orgId: null, projects: [], projectId: null, unread: 0 };
export const currentProject = () => state.projects.find((p) => p.id === state.projectId) || null;

export const NAV = [
  { group: 'Overview', items: [['dashboard', 'Dashboard', '◧'], ['projects', 'Projects', '▤'], ['compute', 'Compute Engine', '⚙']] },
  { group: 'Build', items: [['files', 'Storage & Files', '🗀'], ['notebooks', 'Notebooks', '✎'], ['terminal', 'Terminal', '›_'], ['training', 'AI Training', '◈'], ['jobs', 'Jobs', '☰']] },
  { group: 'Operate', items: [['monitoring', 'Monitoring', '∿'], ['logs', 'Logs', '≡'], ['api', 'API Management', '⌘']] },
  { group: 'Manage', items: [['iam', 'IAM & Members', '👥'], ['notifications', 'Notifications', '🔔'], ['settings', 'Settings', '⚒'], ['admin', 'Admin Console', '★'], ['help', 'Help', '?']] },
];
const PUBLIC = new Set(['login', 'signup', 'verify', 'forgot', 'reset']);

export function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
export function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || 'dashboard', parts: parts.slice(1), query: new URLSearchParams(qs || '') };
}

export async function loadContext() {
  const me = await get('/api/auth/me');
  state.user = me.user; setCsrf(me.csrf_token);
  state.orgs = (await get('/api/orgs')).organizations;
  state.orgId = state.orgs.find((o) => o.id === store.get('nebius.org'))?.id || state.orgs[0]?.id || null;
  await loadProjects();
}
export async function loadProjects() {
  state.projects = state.orgId ? (await get(`/api/projects?org_id=${state.orgId}&include_archived=1`)).projects : [];
  if (!state.projects.find((p) => p.id === state.projectId)) state.projectId = state.projects.find((p) => p.id === store.get('nebius.project'))?.id || state.projects.find((p) => p.status === 'active')?.id || null;
}
export function selectProject(id) { state.projectId = id; store.set('nebius.project', id || ''); }
function selectOrg(id) { state.orgId = id; store.set('nebius.org', id); state.projectId = null; loadProjects().then(render); }

function topbar(route) {
  const search = h('input.search', { type: 'search', placeholder: 'Search projects, files, jobs, instances', 'aria-label': 'Global search', onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) go(`#/search?q=${encodeURIComponent(e.target.value.trim())}`); } });
  if (route.name === 'search') search.value = route.query.get('q') || '';
  return h('header.topbar', {},
    h('button.icon-btn.menu-btn', { type: 'button', 'aria-label': 'Open navigation menu', onclick: () => document.body.classList.toggle('drawer-open') }, '☰'),
    h('a.brand', { href: '#/dashboard', 'aria-label': 'NEBIUS home' }, h('img', { src: '/assets/logo.svg', alt: '', width: 26, height: 26 }), h('span', {}, 'NEBIUS')),
    h('select.org-select', { 'aria-label': 'Organization', onchange: (e) => selectOrg(e.target.value) }, state.orgs.map((o) => h('option', { value: o.id, selected: o.id === state.orgId }, o.name))),
    h('select.project-select', { 'aria-label': 'Project', onchange: (e) => { selectProject(e.target.value); render(); } },
      h('option', { value: '' }, state.projects.length ? 'Select a project' : 'No projects'), state.projects.map((p) => h('option', { value: p.id, selected: p.id === state.projectId }, `${p.name}${p.status === 'archived' ? ' (archived)' : ''}`))),
    search,
    h('div.top-actions', {},
      h('a.icon-btn', { href: '#/help', 'aria-label': 'Help' }, '?'),
      h('a.icon-btn.bell', { href: '#/notifications', 'aria-label': `Notifications (${state.unread} unread)` }, '🔔', state.unread ? h('span.dot', {}, String(Math.min(99, state.unread))) : null),
      h('a.avatar', { href: '#/settings', 'aria-label': 'Profile and settings', title: state.user.email }, (state.user.display_name || state.user.email)[0].toUpperCase())));
}

function drawer(route) {
  return h('nav.drawer', { 'aria-label': 'All modules' },
    NAV.map((g) => h('div.nav-group', {}, h('div.nav-title', {}, g.group),
      g.items.filter(([id]) => id !== 'admin' || state.user.platform_role === 'superadmin').map(([id, label, icon]) =>
        h('a.nav-item', { href: `#/${id}`, class: route.name === id ? 'active' : '', onclick: () => document.body.classList.remove('drawer-open') }, h('span.nav-icon', { 'aria-hidden': 'true' }, icon), label)))),
    h('div.nav-foot', {}, h('small.muted', {}, 'NEBIUS is a provisional internal name. Not affiliated with Nebius Group.')));
}

// The three-button primary navigation (mobile bottom bar).
function bottomNav(route) {
  return h('nav.bottom-nav', { 'aria-label': 'Primary' },
    [['dashboard', 'Dashboard', '◧'], ['projects', 'Projects', '▤'], ['compute', 'Compute', '⚙']].map(([id, label, icon]) =>
      h('a', { href: `#/${id}`, class: route.name === id ? 'active' : '', 'aria-current': route.name === id ? 'page' : null }, h('span', { 'aria-hidden': 'true' }, icon), h('small', {}, label))));
}

let renderSeq = 0;
export async function render() {
  const route = parseRoute();
  const seq = ++renderSeq;
  const root = $('#app');
  if (!state.user && !PUBLIC.has(route.name)) {
    try { await loadContext(); } catch (e) {
      if (e instanceof ApiError && e.status === 401) { try { sessionStorage.setItem('nebius.after', location.hash); } catch { /* */ } return go('#/login'); }
      clear(root).append(h('div.center', {}, h('div.card.offline', {}, h('h2', {}, 'Cannot reach NEBIUS'), h('p', {}, errMsg(e)), btn('Retry', () => render(), 'primary'))));
      return;
    }
  }
  if (PUBLIC.has(route.name)) { clear(root).append(views[route.name](route)); return; }
  get('/api/notifications?unread=1').then((n) => { if (state.unread !== n.unread) { state.unread = n.unread; const b = $('.bell'); if (b) b.replaceWith(topbar(route).querySelector('.bell')); } }).catch(() => {});
  const main = h('main.content', { id: 'main', tabindex: '-1' }, h('div.loading', {}, 'Loading…'));
  clear(root).append(topbar(route), h('div.shell', {}, drawer(route), h('div.scrim', { onclick: () => document.body.classList.remove('drawer-open') }), main), bottomNav(route));
  const view = views[route.name] || views.notfound;
  try {
    const node = await view(route);
    if (seq !== renderSeq) return;
    clear(main).append(node);
  } catch (e) {
    if (seq !== renderSeq) return;
    if (e instanceof ApiError && e.status === 401) { state.user = null; return go('#/login'); }
    clear(main).append(h('div.card.error-state', {}, h('h2', {}, e.status === 404 ? 'Not found' : 'Something went wrong'), h('p', {}, errMsg(e)), btn('Retry', () => render(), 'primary')));
  }
}

export function needProject(title) {
  const p = currentProject();
  if (p) return p;
  throw Object.assign(new Error(`${title}: select or create a project first (top bar → project selector).`), { status: 400 });
}

window.addEventListener('hashchange', render);
window.addEventListener('offline', () => toast('You are offline. Actions will fail until the connection returns.', 'error'));
window.addEventListener('online', () => toast('Back online.'));
window.addEventListener('unhandledrejection', (e) => { if (e.reason instanceof ApiError) { toast(errMsg(e.reason), 'error'); e.preventDefault(); } });
render();
