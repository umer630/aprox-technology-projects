// Compute Engine: instance lifecycle. The stored status is only ever set from what the provider reports
// (adapter.observe) — an instance is never shown RUNNING unless the provider confirmed it.
import { one, all, run, now, newId, audit, notify } from './db.js';
import { adapter, isDispatchable, entryOf } from './providers/index.js';
import { bad, conflict, HttpError } from './http.js';
import { config } from './config.js';

export const STATES = ['AVAILABLE', 'PROVISIONING', 'RUNNING', 'STOPPING', 'STOPPED', 'FAILED', 'UNAVAILABLE'];

export function transition(inst, to, detail, actorId = null) {
  if (inst.status === to && !detail) return;
  run('UPDATE compute_instances SET status = ?, updated_at = ?, status_confirmed_at = ?, last_error = ? WHERE id = ?',
    to, now(), now(), to === 'FAILED' ? String(detail || '').slice(0, 500) : null, inst.id);
  if (inst.status !== to) {
    run('INSERT INTO instance_events (id,instance_id,from_status,to_status,detail,actor_id,created_at) VALUES (?,?,?,?,?,?,?)', newId('iev_'), inst.id, inst.status, to, detail ? String(detail).slice(0, 500) : null, actorId, now());
    if (to === 'FAILED') notify(inst.created_by, 'instance', `Instance ${inst.name} failed`, String(detail || ''), { orgId: inst.org_id, projectId: inst.project_id, link: `#/compute/${inst.project_id}/${inst.id}` });
  }
  inst.status = to;
}

export async function reconcile(inst) {
  if (inst.status === 'DELETED') return inst;
  const a = adapter(inst.provider_id);
  if (!a?.observe) return inst;
  const o = await a.observe(inst);
  if (o.status !== inst.status) transition(inst, o.status, o.detail);
  else run('UPDATE compute_instances SET status_confirmed_at = ? WHERE id = ?', now(), inst.id);
  return { ...one('SELECT * FROM compute_instances WHERE id = ?', inst.id), observed: o };
}

function requireInstanceProvider(providerId) {
  const e = entryOf(providerId);
  const a = adapter(providerId);
  if (!e || !a) throw bad('Unknown provider', 'unknown_provider');
  if (!a.supportsInstances) throw bad(`${e.name} does not offer persistent instances${a.supportsBatch ? ' — submit a job instead' : ''}`, 'instances_not_supported');
  if (!isDispatchable(providerId)) throw new HttpError(409, 'provider_not_available', `${e.name} is not available (free-only policy, verification, enablement or health check)`);
  return a;
}

export async function createInstance({ project, user, name, providerId, machineType, image }) {
  const a = requireInstanceProvider(providerId);
  const types = a.machineTypes();
  const mt = types.find((t) => t.id === machineType);
  if (!mt) throw bad(`machine_type must be one of: ${types.map((t) => t.id).join(', ')}`, 'invalid_machine_type');
  if (providerId === 'local-docker-cpu' && !config.docker.instanceImages.includes(image)) throw bad(`image must be one of: ${config.docker.instanceImages.join(', ')}`, 'invalid_image');
  const active = one("SELECT COUNT(*) AS n FROM compute_instances WHERE project_id = ? AND status NOT IN ('DELETED')", project.id).n;
  if (active >= config.docker.maxInstancesPerProject) throw conflict(`Instance limit reached (${config.docker.maxInstancesPerProject} per project)`, 'instance_limit');
  const id = newId('ins_');
  const t = now();
  run(`INSERT INTO compute_instances (id,org_id,project_id,name,provider_id,machine_type,image,status,cpu_limit,ram_mb,disk_gb,gpu,network,created_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,'PROVISIONING',?,?,?,?,'none',?,?,?)`, id, project.org_id, project.id, name, providerId, machineType, image || null, mt.cpus, mt.ram_mb, mt.disk_gb, mt.gpu || null, user.id, t, t);
  run('INSERT INTO instance_events (id,instance_id,from_status,to_status,detail,actor_id,created_at) VALUES (?,?,NULL,?,?,?,?)', newId('iev_'), id, 'PROVISIONING', 'create requested', user.id, t);
  let inst = one('SELECT * FROM compute_instances WHERE id = ?', id);
  const r = await a.create(inst);
  if (!r.ok) { transition(inst, 'FAILED', r.error, user.id); return one('SELECT * FROM compute_instances WHERE id = ?', id); }
  run('UPDATE compute_instances SET provider_ref = ? WHERE id = ?', r.ref, id);
  inst = await reconcile(one('SELECT * FROM compute_instances WHERE id = ?', id));
  audit(user.id, 'instance.create', { orgId: project.org_id, projectId: project.id, target: id, detail: { providerId, machineType, image } });
  return inst;
}

export async function instanceAction(inst, action, user) {
  const a = adapter(inst.provider_id);
  if (!a?.supportsInstances) throw bad('Provider does not support instances');
  if (inst.status === 'DELETED') throw bad('Instance is deleted');
  const allowed = { start: ['STOPPED', 'FAILED'], stop: ['RUNNING'], restart: ['RUNNING', 'STOPPED', 'FAILED'] }[action];
  if (!allowed.includes(inst.status)) throw conflict(`Cannot ${action} an instance in state ${inst.status}`, 'invalid_state');
  if (action !== 'stop' && !isDispatchable(inst.provider_id)) throw new HttpError(409, 'provider_not_available', 'Provider is not currently available');
  transition(inst, action === 'stop' ? 'STOPPING' : 'PROVISIONING', `${action} requested`, user.id);
  const r = await a[action](inst);
  if (!r.ok) transition(inst, 'FAILED', r.error, user.id);
  const out = await reconcile(one('SELECT * FROM compute_instances WHERE id = ?', inst.id));
  audit(user.id, `instance.${action}`, { orgId: inst.org_id, projectId: inst.project_id, target: inst.id, detail: { result: out.status } });
  return out;
}

export async function deleteInstance(inst, user) {
  const a = adapter(inst.provider_id);
  const busy = one("SELECT COUNT(*) AS n FROM jobs WHERE instance_id = ? AND status IN ('STARTING','RUNNING')", inst.id).n;
  if (busy) throw conflict('A job is running on this instance', 'instance_busy');
  const r = await a.remove(inst);
  if (!r.ok) throw new HttpError(502, 'provider_error', `Provider refused delete: ${r.error}`);
  transition(inst, 'DELETED', 'deleted', user?.id);
  run('UPDATE compute_instances SET deleted_at = ? WHERE id = ?', now(), inst.id);
  audit(user?.id || null, 'instance.delete', { orgId: inst.org_id, projectId: inst.project_id, target: inst.id });
}

export async function reconcileAll() {
  for (const inst of all("SELECT * FROM compute_instances WHERE status NOT IN ('DELETED')")) {
    try { await reconcile(inst); } catch { /* keep going */ }
  }
}
