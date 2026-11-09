// 'command' job: runs a shell command inside an isolated container — either an ephemeral sandbox or an
// attached RUNNING compute instance of the same project. Never on the API host.
import { spawn } from 'node:child_process';
import { one } from '../db.js';
import { bad } from '../http.js';
import { config } from '../config.js';
import { docker, hardenedRunArgs, execStream, ensureImage, dockerAvailable } from '../docker.js';
import { registerJobHandler } from '../scheduler.js';

registerJobHandler('command', {
  description: 'Run a shell command in an isolated CPU container (ephemeral sandbox or an attached instance)',
  requiresGpu: false,
  validate(spec, project) {
    if (typeof spec.command !== 'string' || !spec.command.trim() || spec.command.length > 4000) throw bad('spec.command is required (max 4000 chars)');
    if (spec.instance_id) {
      const inst = one("SELECT * FROM compute_instances WHERE id = ? AND project_id = ? AND status != 'DELETED'", spec.instance_id, project.id);
      if (!inst) throw bad('spec.instance_id not found in this project');
      if (inst.provider_id !== 'local-docker-cpu') throw bad('Commands can only be attached to local-docker-cpu instances');
    }
    if (spec.image && !config.docker.instanceImages.includes(spec.image)) throw bad(`spec.image must be one of: ${config.docker.instanceImages.join(', ')}`);
  },
  async run(job, io) {
    const d = await dockerAvailable();
    if (!d.ok) return { status: 'FAILED', error: `container runtime unavailable: ${d.detail}` };
    const { command, instance_id: instanceId } = io.spec;
    if (instanceId) {
      const inst = one('SELECT * FROM compute_instances WHERE id = ?', instanceId);
      if (!inst || inst.status !== 'RUNNING') return { status: 'FAILED', error: `attached instance is ${inst?.status || 'missing'}, not RUNNING` };
      const { run } = await import('../db.js');
      run('UPDATE jobs SET instance_id = ? WHERE id = ?', inst.id, job.id);
      io.setRunning(`attached to instance ${inst.name}`);
      const r = await execStream(`nebius-inst-${inst.id}`, command, { timeoutMs: job.timeout_s * 1000, onData: io.log, signal: io.signal });
      io.log(`[nebius] exit code ${r.code}`);
      return r.code === 0 ? { status: 'SUCCEEDED', result: { exit_code: 0, instance_id: inst.id } } : { status: 'FAILED', error: `exit code ${r.code}`, result: { exit_code: r.code } };
    }
    const image = io.spec.image || config.docker.sandboxImage;
    const img = await ensureImage(image);
    if (!img.ok) return { status: 'FAILED', error: `image unavailable: ${img.detail}` };
    const name = `nebius-job-${job.id}`;
    const args = hardenedRunArgs({ name, labels: { 'nebius.job': job.id, 'nebius.project': job.project_id }, memory: '512m', cpus: 1, pids: 256 });
    args[1] = '--rm'; // replace -d: run attached so we can stream output
    args.push(image, 'sh', '-c', command);
    io.setRunning('ephemeral sandbox container');
    const code = await new Promise((resolve) => {
      const child = spawn(config.docker.bin, args);
      child.stdout.on('data', (b) => io.log(String(b)));
      child.stderr.on('data', (b) => io.log(String(b)));
      const kill = () => { docker(['rm', '-f', name]); };
      io.signal.addEventListener('abort', kill, { once: true });
      child.on('close', (c) => { io.signal.removeEventListener('abort', kill); resolve(c ?? 137); });
      child.on('error', (e) => { io.log(`spawn error: ${e.message}`); resolve(127); });
    });
    io.log(`[nebius] exit code ${code}`);
    return code === 0 ? { status: 'SUCCEEDED', result: { exit_code: 0 } } : { status: 'FAILED', error: `exit code ${code}`, result: { exit_code: code } };
  },
});
