import { idFrom } from './canonical-v1.mjs';

export class ProviderControl {
  constructor({ now, providers, consumedApprovals = new Set() }) {
    this.now = now;
    this.providers = new Map(providers.map(provider => [provider.provider_id, structuredClone(provider)]));
    this.consumedApprovals = consumedApprovals;
  }

  decide(request) {
    const provider = this.providers.get(request.provider_id);
    if (!provider || provider.kill_switch === true) return this.#result('DENY', 'PROVIDER_DISABLED_OR_UNKNOWN');
    if (request.environment !== 'STAGING' || request.production !== 'HOLD'
      || request.public !== 'HOLD' || request.g5 !== 'HOLD') {
      return this.#result('DENY', 'PROTECTED_BOUNDARY');
    }
    if (!request.rights || Date.parse(request.rights.expires_at) <= this.now()) {
      return this.#result('QUARANTINE', 'RIGHTS_EXPIRED_OR_MISSING');
    }
    const approvals = [request.approval_a, request.approval_z];
    if (approvals.some(value => !value)) return this.#result('DENY', 'DUAL_APPROVAL_REQUIRED');
    if (request.approval_a.role !== 'TRACK_A' || request.approval_z.role !== 'TRACK_Z'
      || request.approval_a.approver_id === request.approval_z.approver_id) {
      return this.#result('DENY', 'APPROVAL_SEPARATION_INVALID');
    }
    for (const approval of approvals) {
      if (approval.task_id !== request.task_id || Date.parse(approval.expires_at) <= this.now()) {
        return this.#result('DENY', 'APPROVAL_BINDING_INVALID');
      }
      if (this.consumedApprovals.has(approval.approval_id)) return this.#result('DENY', 'APPROVAL_REPLAY');
    }
    approvals.forEach(approval => this.consumedApprovals.add(approval.approval_id));
    return this.#result('ALLOW_SHADOW', 'DUAL_KEY_AND_RIGHTS_VERIFIED');
  }

  #result(decision, reason) {
    return { decision, reason, decision_id: idFrom('decision', { decision, reason, observed_at_ms: this.now() }) };
  }
}

export class ShadowFetchBroker {
  constructor({ fixture, failAttempts = 0, network = () => { throw new Error('BROKER_EXTERNAL_NETWORK_FORBIDDEN'); } }) {
    this.fixture = structuredClone(fixture);
    this.failAttempts = failAttempts;
    this.network = network;
    this.calls = 0;
    this.externalCalls = 0;
  }

  fetch({ decision, directNetwork = false }) {
    if (decision !== 'ALLOW_SHADOW') throw new Error('BROKER_DECISION_NOT_ALLOWED');
    if (directNetwork) {
      this.externalCalls += 1;
      this.network();
    }
    this.calls += 1;
    if (this.calls <= this.failAttempts) throw new Error('PROVIDER_TIMEOUT');
    return { mode: 'SHADOW_NO_FETCH', external_requests: 0, fixture: structuredClone(this.fixture) };
  }
}
