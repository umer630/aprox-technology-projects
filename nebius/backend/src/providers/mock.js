// TEST DOUBLE ONLY. Registered exclusively when NEBIUS_ENV=test, to exercise scheduler/compute/provider interfaces.
// Everything it reports is labelled MOCK; the evidence verifier rejects any output that came from it.
import fs from 'node:fs';
import path from 'node:path';

const runs = new Map();
const instances = new Map();

export class MockAdapter {
  static entry = {
    name: 'MOCK GPU provider (automated tests only — not real hardware)', kind: 'gpu-batch', automation: 'api',
    facts: { signup_eligibility: 'test', country_availability: 'test', credit_card_required: false, billing_required: false, gpu_types: ['MOCK-GPU'], gpu_vram_gb: 16,
      cuda_capability: 'mock', session_duration: 'test', usage_limits: 'test', training_eligible: true, restrictions: 'Test double. Never available outside NEBIUS_ENV=test.', facts_source: 'test', facts_reviewed_on: 'n/a' },
  };
  constructor(id) { this.id = id; this.supportsInstances = true; this.supportsBatch = true; this.behaviour = 'complete'; }
  async health() { return { status: 'healthy', detail: 'MOCK provider (test double)', mock: true }; }
  async resources() { return [{ name: 'MOCK-GPU (test double, not real hardware)', vram_mb: 16384, cuda_capability: 'mock', source: 'mock' }]; }
  machineTypes() { return [{ id: 'mock-gpu-16', cpus: 4, ram_mb: 16384, disk_gb: 10, gpu: 'MOCK-GPU' }]; }
  async create(inst) { instances.set(inst.id, 'RUNNING'); return { ok: true, ref: `mock-${inst.id}` }; }
  async start(inst) { instances.set(inst.id, 'RUNNING'); return { ok: true }; }
  async stop(inst) { instances.set(inst.id, 'STOPPED'); return { ok: true }; }
  async restart(inst) { instances.set(inst.id, 'RUNNING'); return { ok: true }; }
  async remove(inst) { instances.delete(inst.id); return { ok: true }; }
  async observe(inst) { const s = instances.get(inst.id); return s ? { status: s, detail: 'mock' } : { status: 'UNAVAILABLE', detail: 'mock instance not found' }; }
  async stats() { return null; }
  async submit({ job, log }) { const ref = `mock-${job.id}`; runs.set(ref, { polls: 0, behaviour: this.behaviour }); log('[mock] submitted (test double)'); return { ref }; }
  async poll(ref) {
    const r = runs.get(ref); if (!r) return { state: 'LOST', detail: 'unknown' };
    r.polls++;
    if (r.cancelled) return { state: 'CANCELLED', detail: 'mock' };
    if (r.polls < 2) return { state: 'RUNNING', detail: 'mock running' };
    return { state: r.behaviour === 'fail' ? 'FAILED' : 'COMPLETE', detail: 'mock finished' };
  }
  async cancel(ref) { const r = runs.get(ref); if (r) r.cancelled = true; return { ok: true }; }
  async fetchOutputs(ref, dest) {
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'MOCK_OUTPUT.txt'), 'Produced by the MOCK provider. Not a training result.\n');
    fs.writeFileSync(path.join(dest, 'train_metadata.json'), JSON.stringify({ status: 'completed', mock: true, smoke_test: true, gpu: null }));
    return { dir: dest };
  }
}
