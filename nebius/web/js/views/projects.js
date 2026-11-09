import { get, post, patch, put, del } from '../api.js';
import { h, card, table, badge, fmtBytes, fmtTime, ago, kv, btn, toast, errMsg, formDialog, confirmDialog, modal, stat } from '../ui.js';
import { state, go, loadProjects, selectProject, render } from '../app.js';

async function createProject() {
  const v = await formDialog('Create project', [
    { name: 'name', label: 'Project name', required: true, placeholder: 'e.g. Nick 4.8 training' },
    { name: 'project_code', label: 'Project ID (optional)', placeholder: 'auto-generated if empty', help: '6–30 lowercase letters, digits, hyphens. Cannot be changed later.' },
    { name: 'description', label: 'Description', type: 'textarea' },
  ], 'Create');
  if (!v) return;
  try {
    const r = await post('/api/projects', { org_id: state.orgId, name: v.name, description: v.description, ...(v.project_code ? { project_code: v.project_code } : {}) });
    await loadProjects(); selectProject(r.project.id); toast(`Project ${r.project.project_code} created`); go(`#/projects/${r.project.id}`);
  } catch (e) { toast(errMsg(e), 'error'); }
}

export async function projectsView(route) {
  const [pid, tab = 'overview'] = route.parts;
  if (pid) return projectDetail(pid, tab);
  const list = (await get(`/api/projects?org_id=${state.orgId}&include_archived=1`)).projects;
  return h('div.page', {},
    h('div.page-head', {}, h('h1', {}, 'Projects'), btn('+ Create project', createProject, 'primary')),
    card(null, table([
      { label: 'Name', render: (p) => h('strong', {}, p.name) }, { label: 'Project ID', render: (p) => h('code', {}, p.project_code) },
      { label: 'Status', render: (p) => badge(p.status) }, { label: 'Your role', key: 'my_role' }, { label: 'Updated', render: (p) => ago(p.updated_at) },
    ], list, { empty: 'No projects in this organization yet. Create one to start.', onRow: (p) => { selectProject(p.id); go(`#/projects/${p.id}`); } })));
}

async function projectDetail(pid, tab) {
  selectProject(pid);
  const { project, resources } = await get(`/api/projects/${pid}`);
  const isAdmin = ['project_admin', 'org_admin', 'superadmin'].includes(project.my_role);
  const tabs = h('div.tabs', { role: 'tablist' }, ['overview', 'members', 'activity', 'settings'].map((t) => h('a', { href: `#/projects/${pid}/${t}`, role: 'tab', class: t === tab ? 'active' : '', 'aria-selected': t === tab ? 'true' : 'false' }, t[0].toUpperCase() + t.slice(1))));
  let body;
  if (tab === 'members') body = await membersTab(project, isAdmin);
  else if (tab === 'activity') body = card('Activity history', table([{ label: 'Action', key: 'action' }, { label: 'Target', render: (a) => h('code', {}, a.target || '') }, { label: 'By', render: (a) => a.actor_email || 'system' }, { label: 'When', render: (a) => fmtTime(a.created_at) }], (await get(`/api/projects/${pid}/activity`)).activity));
  else if (tab === 'settings') body = settingsTab(project, isAdmin);
  else body = h('div', {},
    h('div.stats', {}, stat('Files', resources.files), stat('Storage', fmtBytes(resources.storage_bytes), `quota ${fmtBytes(project.storage_quota_bytes)}`), stat('Instances', resources.instances, `${resources.running_instances} running`),
      stat('Jobs', resources.jobs, `${resources.active_jobs} active`), stat('Model artifacts', resources.model_artifacts), stat('API keys', resources.api_keys)),
    card('Details', kv([['Name', project.name], ['Project ID', h('code', {}, project.project_code)], ['Internal ID', h('code', {}, project.id)], ['Status', badge(project.status)], ['Your role', project.my_role], ['Description', project.description || '—'], ['Created', fmtTime(project.created_at)]])),
    card('Quick links', h('div.links', {}, [['files', 'Files'], ['notebooks', 'Notebooks'], ['training', 'AI Training (Nick 4.8)'], ['jobs', 'Jobs'], ['compute', 'Compute Engine'], ['terminal', 'Terminal'], ['monitoring', 'Monitoring'], ['api', 'API keys']].map(([r, l]) => h('a.btn.ghost', { href: `#/${r}` }, l)))));
  return h('div.page', {}, h('div.page-head', {}, h('div', {}, h('a.muted', { href: '#/projects' }, '← Projects'), h('h1', {}, project.name, ' ', badge(project.status)))), tabs, body);
}

async function membersTab(project, isAdmin) {
  const m = await get(`/api/projects/${project.id}/members`);
  const add = async () => {
    const v = await formDialog('Grant project role', [
      { name: 'user_id', label: 'Organization member', type: 'select', options: m.org_members.map((x) => ({ value: x.user_id, label: `${x.display_name || x.email} (${x.email})` })) },
      { name: 'role', label: 'Role', type: 'select', options: ['viewer', 'developer', 'project_admin'] }], 'Grant');
    if (!v) return;
    try { await put(`/api/projects/${project.id}/members/${v.user_id}`, { role: v.role }); toast('Role granted'); render(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  return h('div', {},
    card('Project roles', isAdmin ? btn('+ Grant role', add, 'primary') : null,
      table([{ label: 'User', render: (x) => `${x.display_name || ''} ${x.email}` }, { label: 'Role', render: (x) => badge(x.role) }, { label: '', render: (x) => isAdmin ? btn('Remove', async (e) => { e.stopPropagation(); if (await confirmDialog('Remove member', `Remove ${x.email} from this project?`, 'Remove', true)) { try { await del(`/api/projects/${project.id}/members/${x.user_id}`); render(); } catch (er) { toast(errMsg(er), 'error'); } } }, 'ghost') : '' }], m.members)),
    card('Inherited from organization', h('p.muted', {}, 'Organization admins administer every project; other organization members get their organization role on every project.'),
      table([{ label: 'User', render: (x) => x.email }, { label: 'Org role', render: (x) => badge(x.org_role) }], m.org_members)));
}

function settingsTab(project, isAdmin) {
  if (!isAdmin) return card('Settings', h('p.muted', {}, 'Only project admins can change project settings.'));
  const edit = async () => {
    const v = await formDialog('Edit project', [{ name: 'name', label: 'Name', value: project.name }, { name: 'description', label: 'Description', type: 'textarea', value: project.description }]);
    if (!v) return;
    try { await patch(`/api/projects/${project.id}`, v); await loadProjects(); toast('Saved'); render(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const archive = async () => {
    const a = project.status === 'archived';
    if (!(await confirmDialog(a ? 'Unarchive project' : 'Archive project', a ? 'The project becomes writable again.' : 'Archived projects are read-only. Running jobs must be stopped first.', a ? 'Unarchive' : 'Archive'))) return;
    try { await post(`/api/projects/${project.id}/${a ? 'unarchive' : 'archive'}`); await loadProjects(); render(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const remove = async () => {
    const input = h('input', { 'aria-label': 'Project ID', placeholder: project.project_code });
    const ok = await modal('Delete project', h('div', {}, h('p', {}, 'This permanently deletes all files, notebooks, instances and API keys of this project. Type the project ID to confirm:'), h('p', {}, h('code', {}, project.project_code)), input), [{ label: 'Delete project', danger: true }]);
    if (!ok) return;
    try { await post(`/api/projects/${project.id}/delete`, { confirm: input.value.trim() }); await loadProjects(); toast('Project deleted'); go('#/projects'); } catch (e) { toast(errMsg(e), 'error'); }
  };
  return h('div', {}, card('General', btn('Edit name & description', edit, 'primary')),
    card('Lifecycle', h('div.row', {}, btn(project.status === 'archived' ? 'Unarchive project' : 'Archive project', archive), btn('Delete project…', remove, 'danger'))));
}

export async function iamView() {
  if (!state.orgId) return card('IAM', h('p', {}, 'No organization.'));
  const org = (await get(`/api/orgs/${state.orgId}`)).organization;
  const m = await get(`/api/orgs/${state.orgId}/members`);
  const isAdmin = ['org_admin', 'superadmin'].includes(org.my_role);
  const invite = async () => {
    const v = await formDialog('Invite member', [{ name: 'email', label: 'Email', type: 'email' }, { name: 'role', label: 'Role', type: 'select', options: ['viewer', 'developer', 'org_admin'], value: 'developer' }], 'Send invitation');
    if (!v) return;
    try { await post(`/api/orgs/${org.id}/invitations`, v); toast('Invitation sent'); render(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const newOrg = async () => {
    const v = await formDialog('Create organization', [{ name: 'name', label: 'Name' }, { name: 'description', label: 'Description', type: 'textarea' }], 'Create');
    if (!v) return;
    try { await post('/api/orgs', v); state.user = null; toast('Organization created'); render(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const editOrg = async () => {
    const v = await formDialog('Organization settings', [{ name: 'name', label: 'Name', value: org.name }, { name: 'description', label: 'Description', type: 'textarea', value: org.description }]);
    if (!v) return;
    try { await patch(`/api/orgs/${org.id}`, v); state.user = null; render(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  return h('div.page', {},
    h('div.page-head', {}, h('h1', {}, 'IAM & Members'), h('div.row', {}, isAdmin ? btn('Organization settings', editOrg) : null, btn('+ New organization', newOrg))),
    card(`${org.name}`, kv([['Slug', h('code', {}, org.slug)], ['Your role', badge(org.my_role)], ['Projects', org.projects], ['Members', org.members]])),
    card('Members', isAdmin ? btn('+ Invite member', invite, 'primary') : null,
      table([{ label: 'User', render: (x) => `${x.display_name || ''} <${x.email}>` }, { label: 'Role', render: (x) => isAdmin && x.user_id !== state.user.id
        ? h('select', { 'aria-label': `Role for ${x.email}`, onchange: async (e) => { try { await patch(`/api/orgs/${org.id}/members/${x.user_id}`, { role: e.target.value }); toast('Role updated'); } catch (er) { toast(errMsg(er), 'error'); render(); } } }, ['viewer', 'developer', 'org_admin'].map((r) => h('option', { value: r, selected: r === x.role }, r)))
        : badge(x.role) },
      { label: 'Since', render: (x) => fmtTime(x.created_at) },
      { label: '', render: (x) => (isAdmin || x.user_id === state.user.id) ? btn(x.user_id === state.user.id ? 'Leave' : 'Remove', async () => { if (await confirmDialog('Remove member', `Remove ${x.email} from ${org.name}? Their project roles and API keys in this organization are revoked.`, 'Remove', true)) { try { await del(`/api/orgs/${org.id}/members/${x.user_id}`); state.user = null; render(); } catch (e) { toast(errMsg(e), 'error'); } } }) : '' }], m.members)),
    card('Pending invitations', table([{ label: 'Email', key: 'email' }, { label: 'Role', key: 'role' }, { label: 'Expires', render: (i) => fmtTime(i.expires_at) }, { label: '', render: (i) => isAdmin ? btn('Revoke', async () => { await del(`/api/orgs/${org.id}/invitations/${i.id}`); render(); }) : '' }], m.invitations, { empty: 'No pending invitations.' })),
    card('Accept an invitation', h('p', {}, 'Got an invitation code by email? ', h('a', { href: '#/invite' }, 'Enter it here'), '.')),
    isAdmin ? card('Organization audit log', h('div', { id: 'org-audit' }, btn('Load audit log', async (e) => { const a = await get(`/api/orgs/${org.id}/audit`); e.target.replaceWith(table([{ label: 'Action', key: 'action' }, { label: 'By', render: (x) => x.actor_email || 'system' }, { label: 'Target', key: 'target' }, { label: 'When', render: (x) => fmtTime(x.created_at) }], a.audit)); }))) : null);
}
