import { idFrom } from './canonical-v1.mjs';

const validFutureExpiry = (value, now) => {
  if (typeof value !== 'string' || !Number.isFinite(now)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()
    || hour > 23 || minute > 59 || second > 59) return false;
  const expires = Date.parse(value);
  return Number.isFinite(expires) && expires > now;
};
const validIdentity = value => typeof value === 'string' && value.length > 0 && value === value.trim();

export class ProviderControl {
  constructor({ now, providers, consumedApprovals = new Set() }) {
    this.now = now;
    this.providers = new Map(providers.map(provider => [provider.provider_id, structuredClone(provider)]));
    this.consumedApprovals = consumedApprovals;
  }

  decide(request) {
    const now = this.now();
    if (!request || !validIdentity(request.task_id) || !validIdentity(request.provider_id)) {
      return this.#result('DENY', 'REQUEST_BINDING_INVALID');
    }
    const provider = this.providers.get(request.provider_id);
    if (!provider || provider.kill_switch === true) return this.#result('DENY', 'PROVIDER_DISABLED_OR_UNKNOWN');
    if (request.environment !== 'STAGING' || request.production !== 'HOLD'
      || request.public !== 'HOLD' || request.g5 !== 'HOLD') {
      return this.#result('DENY', 'PROTECTED_BOUNDARY');
    }
    if (!request.rights || !validFutureExpiry(request.rights.expires_at, now)) {
      return this.#result('QUARANTINE', 'RIGHTS_EXPIRED_OR_MISSING');
    }
    // Runtime evidence names this existing snapshot; absence cannot be
    // presented as a verified rights lineage.
    if (!validIdentity(request.rights.snapshot_id)) return this.#result('QUARANTINE', 'RIGHTS_IDENTITY_INVALID');
    const approvals = [request.approval_a, request.approval_z];
    if (approvals.some(value => !value)) return this.#result('DENY', 'DUAL_APPROVAL_REQUIRED');
    if (request.approval_a.role !== 'TRACK_A' || request.approval_z.role !== 'TRACK_Z'
      || request.approval_a.approver_id === request.approval_z.approver_id
      || request.approval_a.approval_id === request.approval_z.approval_id) {
      return this.#result('DENY', 'APPROVAL_SEPARATION_INVALID');
    }
    for (const approval of approvals) {
      if (!validIdentity(approval.approval_id) || !validIdentity(approval.approver_id)
        || !validIdentity(approval.task_id) || approval.task_id !== request.task_id
        || !validFutureExpiry(approval.expires_at, now)) {
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
  constructor(options = {}) {
    if ('network' in options || 'directNetwork' in options) throw new Error('BROKER_EXTERNAL_NETWORK_CONFIGURATION_FORBIDDEN');
    const { fixture, failAttempts = 0 } = options;
    this.fixture = structuredClone(fixture);
    this.failAttempts = failAttempts;
    this.calls = 0;
    this.externalCalls = 0;
  }

  fetch(input = {}) {
    if ('directNetwork' in input || 'network' in input || 'url' in input) {
      throw new Error('BROKER_EXTERNAL_NETWORK_ARGUMENT_FORBIDDEN');
    }
    const { decision } = input;
    if (!decision || decision.decision !== 'ALLOW_SHADOW' || typeof decision.decision_id !== 'string') {
      throw new Error('BROKER_DECISION_NOT_ALLOWED');
    }
    this.calls += 1;
    if (this.calls <= this.failAttempts) throw new Error('PROVIDER_TIMEOUT');
    return { mode: 'SHADOW_NO_FETCH', external_requests: this.externalCalls, fixture: structuredClone(this.fixture) };
  }
}
