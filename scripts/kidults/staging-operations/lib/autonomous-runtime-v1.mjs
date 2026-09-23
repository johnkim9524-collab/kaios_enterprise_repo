import { idFrom } from './canonical-v1.mjs';

const terminal = new Set(['COMPLETE_VERIFIED', 'DENIED', 'QUARANTINED']);

export class MemoryTransitionLedger {
  constructor() {
    this.transitions = [];
    this.activeLeases = new Map();
    this.leaseGenerations = new Map();
    this.terminalTasks = new Set();
  }

  acquire(taskId, now, ttlMs) {
    if (this.terminalTasks.has(taskId)) return null;
    const current = this.activeLeases.get(taskId);
    if (current && current.expires_at_ms > now) return null;
    const generation = (this.leaseGenerations.get(taskId) ?? 0) + 1;
    this.leaseGenerations.set(taskId, generation);
    const lease = {
      lease_id: idFrom('lease', { task_id: taskId, generation, acquired_at_ms: now }),
      generation,
      acquired_at_ms: now,
      expires_at_ms: now + ttlMs,
    };
    this.activeLeases.set(taskId, lease);
    return lease;
  }

  transition(taskId, lease, state, detail = {}) {
    const current = this.activeLeases.get(taskId);
    if (!current || current.lease_id !== lease?.lease_id || current.generation !== lease?.generation) {
      throw new Error('STALE_LEASE_FENCE');
    }
    const row = {
      sequence: this.transitions.length + 1,
      task_id: taskId,
      lease_id: lease.lease_id,
      lease_generation: lease.generation,
      state,
      detail: structuredClone(detail),
    };
    this.transitions.push(row);
    if (terminal.has(state)) {
      this.terminalTasks.add(taskId);
      this.activeLeases.delete(taskId);
    }
    return row;
  }

  release(taskId, lease) {
    const current = this.activeLeases.get(taskId);
    if (!current || current.lease_id !== lease?.lease_id || current.generation !== lease?.generation) return false;
    this.activeLeases.delete(taskId);
    return true;
  }
  rows(taskId) { return this.transitions.filter(row => row.task_id === taskId); }
}

export class AutonomousRuntime {
  constructor({ now, ledger, providerControl, broker, durability, leaseTtlMs = 1000, maximumAttempts = 3 }) {
    Object.assign(this, { now, ledger, providerControl, broker, durability, leaseTtlMs, maximumAttempts });
  }

  async tick(request) {
    const lease = await this.ledger.acquire(request.task_id, this.now(), this.leaseTtlMs);
    if (!lease) return { state: 'DUPLICATE_SUPPRESSED', task_id: request.task_id };
    await this.ledger.transition(request.task_id, lease, 'LEASED', lease);
    const verdict = await this.providerControl.decide(request, { lease });
    await this.ledger.transition(request.task_id, lease, 'DECIDED', verdict);
    if (verdict.decision === 'DENY') return this.#terminal(request, lease, verdict, 'DENIED');
    if (verdict.decision === 'QUARANTINE') return this.#terminal(request, lease, verdict, 'QUARANTINED');

    let brokered;
    for (let attempt = 1; attempt <= this.maximumAttempts; attempt += 1) {
      try {
        brokered = await this.broker.fetch({ decision: verdict });
        await this.ledger.transition(request.task_id, lease, 'BROKERED_SHADOW', { attempt, mode: brokered.mode });
        break;
      } catch (error) {
        const state = attempt === this.maximumAttempts ? 'QUARANTINED' : 'RETRY_WAIT';
        await this.ledger.transition(request.task_id, lease, state, { attempt, error: error.message });
        if (attempt === this.maximumAttempts) {
          return {
            state: 'QUARANTINED',
            task_id: request.task_id,
            lease_id: lease.lease_id,
            lease_generation: lease.generation,
            external_provider_requests: this.broker.externalCalls,
            reason: error.message,
            attempt,
          };
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
      lease_generation: lease.generation,
      attempt: this.broker.calls,
      fixture: brokered.fixture,
      external_provider_requests: this.broker.externalCalls,
      state: 'EVIDENCE_PENDING',
    };
    const durable = await this.durability.seal(evidence);
    await this.ledger.transition(request.task_id, lease, durable.verified ? 'COMPLETE_VERIFIED' : 'EVIDENCE_PENDING', durable);
    if (!durable.verified) await this.ledger.release(request.task_id, lease);
    return {
      ...durable,
      task_id: request.task_id,
      lease_id: lease.lease_id,
      lease_generation: lease.generation,
      external_provider_requests: this.broker.externalCalls,
      state: durable.verified ? 'COMPLETE_VERIFIED' : 'EVIDENCE_PENDING',
    };
  }

  async #terminal(request, lease, verdict, state) {
    await this.ledger.transition(request.task_id, lease, state, verdict);
    return {
      task_id: request.task_id,
      lease_id: lease.lease_id,
      lease_generation: lease.generation,
      external_provider_requests: this.broker.externalCalls,
      state,
      reason: verdict.reason,
    };
  }
}
