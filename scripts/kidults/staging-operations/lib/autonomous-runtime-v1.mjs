import { idFrom } from './canonical-v1.mjs';

const terminal = new Set(['COMPLETE_VERIFIED', 'DENIED', 'QUARANTINED']);

export class MemoryTransitionLedger {
  constructor() {
    this.transitions = [];
    this.activeLeases = new Map();
    this.terminalTasks = new Set();
  }

  acquire(taskId, now, ttlMs) {
    if (this.terminalTasks.has(taskId)) return null;
    const current = this.activeLeases.get(taskId);
    if (current && current.expires_at_ms > now) return null;
    const lease = { lease_id: idFrom('lease', { task_id: taskId, acquired_at_ms: now }), acquired_at_ms: now, expires_at_ms: now + ttlMs };
    this.activeLeases.set(taskId, lease);
    return lease;
  }

  transition(taskId, state, detail = {}) {
    const row = { sequence: this.transitions.length + 1, task_id: taskId, state, detail: structuredClone(detail) };
    this.transitions.push(row);
    if (terminal.has(state)) {
      this.terminalTasks.add(taskId);
      this.activeLeases.delete(taskId);
    }
    return row;
  }

  release(taskId) { this.activeLeases.delete(taskId); }
  rows(taskId) { return this.transitions.filter(row => row.task_id === taskId); }
}

export class AutonomousRuntime {
  constructor({ now, ledger, providerControl, broker, durability, leaseTtlMs = 1000, maximumAttempts = 3 }) {
    Object.assign(this, { now, ledger, providerControl, broker, durability, leaseTtlMs, maximumAttempts });
  }

  tick(request) {
    const lease = this.ledger.acquire(request.task_id, this.now(), this.leaseTtlMs);
    if (!lease) return { state: 'DUPLICATE_SUPPRESSED', task_id: request.task_id };
    this.ledger.transition(request.task_id, 'LEASED', lease);
    const verdict = this.providerControl.decide(request);
    this.ledger.transition(request.task_id, 'DECIDED', verdict);
    if (verdict.decision === 'DENY') return this.#terminal(request, lease, verdict, 'DENIED');
    if (verdict.decision === 'QUARANTINE') return this.#terminal(request, lease, verdict, 'QUARANTINED');

    let brokered;
    for (let attempt = 1; attempt <= this.maximumAttempts; attempt += 1) {
      try {
        brokered = this.broker.fetch({ decision: verdict });
        this.ledger.transition(request.task_id, 'BROKERED_SHADOW', { attempt, mode: brokered.mode });
        break;
      } catch (error) {
        this.ledger.transition(request.task_id, attempt === this.maximumAttempts ? 'QUARANTINED' : 'RETRY_WAIT', {
          attempt, error: error.message,
        });
        if (attempt === this.maximumAttempts) {
          this.ledger.release(request.task_id);
          return { state: 'QUARANTINED', task_id: request.task_id, reason: error.message, attempt };
        }
      }
    }

    const evidence = {
      task_id: request.task_id,
      provider_id: request.provider_id,
      policy_version: request.policy_version,
      rights_snapshot_id: request.rights.snapshot_id,
      approval_a: request.approval_a,
      approval_z: request.approval_z,
      decision: verdict.decision,
      lease_id: lease.lease_id,
      attempt: this.broker.calls,
      fixture: brokered.fixture,
      external_provider_requests: this.broker.externalCalls,
      state: 'EVIDENCE_PENDING',
    };
    const durable = this.durability.seal(evidence);
    this.ledger.transition(request.task_id, durable.verified ? 'COMPLETE_VERIFIED' : 'EVIDENCE_PENDING', durable);
    if (!durable.verified) this.ledger.release(request.task_id);
    return { ...durable, task_id: request.task_id, external_provider_requests: this.broker.externalCalls, state: durable.verified ? 'COMPLETE_VERIFIED' : 'EVIDENCE_PENDING' };
  }

  #terminal(request, lease, verdict, state) {
    this.ledger.transition(request.task_id, state, verdict);
    return { task_id: request.task_id, lease_id: lease.lease_id, external_provider_requests: this.broker.externalCalls, state, reason: verdict.reason };
  }
}
