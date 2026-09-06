import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export const DEFAULT_PATHS = Object.freeze({
  policy: 'coordination/kidults/track-z/track-z-operating-system-v1.json',
  routing: 'coordination/kidults/internalization/external-provider-track-z-routing-gate-v1.json',
  providerState: 'coordination/kidults/registry/provider/records/provider-operating-state-v1.json',
  providerRegistry: 'coordination/kidults/registry/provider/index.json',
  sourcing: 'coordination/kidults/governance/ih-group-provider-sourcing-contract-v1.json',
  writtenOnly: 'coordination/kidults/governance/provider-written-email-only-negotiation-policy-v1.json',
  portfolio: 'coordination/kidults/internalization/provider-product-portfolio-v1.json',
  commercialRights: 'coordination/kidults/internalization/provider-commercial-rights-ledger-v1.json'
});

const REQUIRED_AUTHORITY_CHAIN = ['TRACK_Z_REVIEW', 'KPMO_INTEGRATED_REPORT', 'FOUNDER_DECISION'];
const REQUIRED_BOUNDARIES = [
  'external_communication', 'contract_or_eula', 'spend', 'credential_or_account_activation',
  'external_data_acquisition', 'provider_activation', 'production', 'public', 'g5'
];
const PROVIDER_REQUIRED_FIELDS = [
  'provider_id', 'provider_name', 'source_layer', 'brands_or_verticals', 'owner', 'state',
  'evidence_date', 'next_action', 'cost_exposure', 'blocker', 'rights_state', 'schema_state',
  'adapter_state', 'communication', 'evidence_refs', 'acquisition_authorized',
  'external_communication_authorized', 'credential_authorized', 'new_spend_authorized',
  'public_release', 'production'
];

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  const material = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  return `sha256:${crypto.createHash('sha256').update(material).digest('hex')}`;
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

export function loadTrackZInputs(paths = DEFAULT_PATHS) {
  const inputs = {};
  const inputDigests = {};
  for (const [key, path] of Object.entries(paths)) {
    const raw = fs.readFileSync(path);
    inputs[key] = JSON.parse(raw.toString('utf8'));
    inputDigests[key] = { path, sha256: sha256(raw) };
  }
  return { inputs, inputDigests };
}

function equalOrdered(actual = [], expected = []) {
  return Array.isArray(actual) &&
    actual.length === expected.length &&
    expected.every((value, index) => actual[index] === value);
}

function assert(condition, code, errors) {
  if (!condition) errors.push(code);
}

function evidenceAgeDays(evidenceDate, observedAt) {
  const evidence = Date.parse(`${evidenceDate}T23:59:59Z`);
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(evidence) || !Number.isFinite(observed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((observed - evidence) / 86_400_000));
}

export function validateTrackZInputs({ policy, routing, providerState, providerRegistry, sourcing, writtenOnly }) {
  const errors = [];
  assert(policy?.id === 'KIDULTS_TRACK_Z_OPERATING_SYSTEM_V1', 'POLICY_ID_INVALID', errors);
  assert(policy?.status === 'MANDATORY_FAIL_CLOSED', 'POLICY_STATUS_INVALID', errors);
  assert(equalOrdered(policy?.authority_chain, REQUIRED_AUTHORITY_CHAIN), 'AUTHORITY_CHAIN_INVALID', errors);
  assert(equalOrdered(routing?.mandatory_route, REQUIRED_AUTHORITY_CHAIN), 'ROUTING_CHAIN_INVALID', errors);
  assert(routing?.cross_track_rule?.must_route_external_provider_decision_to_track_z === true,
    'TRACK_Z_ROUTING_NOT_MANDATORY', errors);
  assert(sourcing?.negotiation_communication_policy?.channel === 'WRITTEN_EMAIL_ONLY',
    'GROUP_WRITTEN_ONLY_POLICY_MISSING', errors);
  assert(writtenOnly?.status === 'MANDATORY_NON_BYPASS', 'WRITTEN_ONLY_POLICY_NOT_MANDATORY', errors);
  assert(writtenOnly?.authority_boundary?.external_communication === 'SEPARATE_EXPLICIT_AUTHORITY_REQUIRED',
    'WRITTEN_POLICY_EXTERNAL_AUTHORITY_DRIFT', errors);
  for (const boundary of REQUIRED_BOUNDARIES) assert(policy?.non_bypass?.[boundary], `BOUNDARY_MISSING:${boundary}`, errors);
  assert(policy?.non_bypass?.production === 'HOLD', 'PRODUCTION_BOUNDARY_DRIFT', errors);
  assert(policy?.non_bypass?.public === 'HOLD', 'PUBLIC_BOUNDARY_DRIFT', errors);
  assert(policy?.communication_controls?.duplicate_outreach_forbidden === true,
    'DUPLICATE_OUTREACH_GUARD_MISSING', errors);
  assert(policy?.communication_controls?.automatic_followup_forbidden === true,
    'AUTOMATIC_FOLLOWUP_GUARD_MISSING', errors);
  assert(policy?.scale_and_resilience?.deterministic_idempotent_replay_required === true,
    'IDEMPOTENT_REPLAY_GUARD_MISSING', errors);
  assert(policy?.scale_and_resilience?.provider_off_test_required_before_pilot === true,
    'PROVIDER_OFF_GATE_MISSING', errors);
  assert(providerState?.id === 'provider-operating-state-v1', 'PROVIDER_STATE_ID_INVALID', errors);
  assert(providerState?.status === 'ACTIVE_FAIL_CLOSED', 'PROVIDER_STATE_NOT_FAIL_CLOSED', errors);
  assert(providerRegistry?.status === 'ACTIVE', 'PROVIDER_REGISTRY_NOT_ACTIVE', errors);
  assert(providerRegistry?.current_operating_state_record_id === 'provider-operating-state-v1',
    'PROVIDER_REGISTRY_STATE_BINDING_INVALID', errors);
  const providers = providerState?.providers ?? [];
  assert(providers.length > 0, 'PROVIDER_UNIVERSE_EMPTY', errors);
  const ids = providers.map(provider => provider.provider_id);
  assert(new Set(ids).size === ids.length, 'DUPLICATE_PROVIDER_ID', errors);
  for (const provider of providers) {
    for (const field of PROVIDER_REQUIRED_FIELDS) {
      assert(Object.hasOwn(provider, field), `PROVIDER_FIELD_MISSING:${provider.provider_id ?? 'UNKNOWN'}:${field}`, errors);
    }
    assert(Array.isArray(provider.brands_or_verticals) && provider.brands_or_verticals.length > 0,
      `PROVIDER_VERTICALS_EMPTY:${provider.provider_id}`, errors);
    assert(Array.isArray(provider.evidence_refs) && provider.evidence_refs.length > 0,
      `PROVIDER_EVIDENCE_EMPTY:${provider.provider_id}`, errors);
    for (const field of ['acquisition_authorized', 'external_communication_authorized', 'credential_authorized', 'new_spend_authorized']) {
      assert(provider[field] === false, `PROTECTED_AUTHORITY_OPEN:${provider.provider_id}:${field}`, errors);
    }
    assert(provider.public_release === 'HOLD', `PUBLIC_NOT_HOLD:${provider.provider_id}`, errors);
    assert(provider.production === 'HOLD', `PRODUCTION_NOT_HOLD:${provider.provider_id}`, errors);
    assert(provider.communication?.duplicate_outreach_prohibited === true,
      `DUPLICATE_OUTREACH_NOT_PROHIBITED:${provider.provider_id}`, errors);
    assert(provider.communication?.resend_authorized === false,
      `RESEND_AUTHORITY_PRESENT:${provider.provider_id}`, errors);
    assert(provider.communication?.automatic_followup_authorized === false,
      `AUTOMATIC_FOLLOWUP_AUTHORITY_PRESENT:${provider.provider_id}`, errors);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { providerCount: providers.length };
}

function classifyRights(provider) {
  const rights = provider.rights_state ?? '';
  if (/NO_GO|NOT_AUTHORIZED|PROHIBITED/.test(rights)) return 'NO_GO';
  if (/UNKNOWN|NEEDS_CLARIFICATION|UNCONFIRMED/.test(rights)) return 'HOLD';
  if (/WRITTEN|BOUNDED/.test(rights)) return 'HOLD';
  return 'HOLD';
}

function classifyQueue(provider) {
  const communicationState = provider.communication?.state ?? '';
  if (provider.state === 'CLOSED') return 'TERMINAL_ARCHIVE';
  if (/AWAITING|FOLLOWUP_SENT|OUTBOUND_SENT/.test(communicationState)) return 'WAITING_WRITTEN_RESPONSE';
  if (/RESPONSE_RECEIVED|PARTIAL_RESPONSE/.test(communicationState)) return 'INTERNAL_DILIGENCE';
  return 'INTERNAL_DILIGENCE';
}

function classifyOutbound(provider) {
  const state = provider.communication?.state ?? '';
  if (provider.state === 'CLOSED') return 'NO_OUTBOUND_REOPEN_ONLY_ON_MATERIAL_WRITTEN_CHANGE';
  if (/AWAITING|FOLLOWUP_SENT|OUTBOUND_SENT/.test(state)) return 'WAIT_NO_DUPLICATE_OUTREACH';
  if (/RESPONSE_RECEIVED|PARTIAL_RESPONSE/.test(state)) return 'ASSESS_EXISTING_WRITTEN_RESPONSE';
  return 'PREPARE_INTERNAL_WRITTEN_RFI_DRAFT_FOUNDER_SEND_AUTHORITY_REQUIRED';
}

function evaluateProvider(provider, policy, observedAt) {
  const ageDays = evidenceAgeDays(provider.evidence_date, observedAt);
  const maxAgeDays = policy.evidence_freshness_days?.[provider.state];
  const stale = !Number.isInteger(maxAgeDays) || ageDays > maxAgeDays;
  let verdict = provider.state === 'CLOSED' ? 'WAIT' : classifyRights(provider);
  let reason = provider.state === 'CLOSED' ? 'CLOSED_WITHOUT_AUTHORIZED_REOPEN' : 'MATERIAL_GATE_UNRESOLVED';
  if (stale) {
    verdict = 'HOLD';
    reason = 'EVIDENCE_STALE';
  } else if (verdict === 'NO_GO') {
    reason = 'PUBLIC_WEB_OR_PRODUCT_RIGHTS_PROHIBIT_REQUIRED_USE';
  } else if (/AWAITING|FOLLOWUP_SENT|OUTBOUND_SENT/.test(provider.communication?.state ?? '')) {
    verdict = 'WAIT';
    reason = 'AWAITING_WRITTEN_PROVIDER_RESPONSE_NO_RESEND_AUTHORITY';
  } else if (provider.state !== 'CLOSED') {
    reason = 'RIGHTS_SCHEMA_ECONOMICS_OR_REMOVAL_GATE_INCOMPLETE';
  }
  return {
    case_id: `TRACK_Z:${provider.provider_id}:CURRENT_PROVIDER_STATE`,
    provider_id: provider.provider_id,
    provider_name: provider.provider_name,
    operator_id: provider.operator_id ?? provider.provider_id,
    ultimate_parent_id: provider.ultimate_parent_id ?? 'UNKNOWN_FAIL_CLOSED',
    source_layer: provider.source_layer,
    brands_or_verticals: provider.brands_or_verticals,
    provider_state: provider.state,
    track_z_verdict: verdict,
    verdict_reason: reason,
    rights_state: provider.rights_state,
    schema_state: provider.schema_state,
    evidence_date: provider.evidence_date,
    evidence_age_days: ageDays,
    evidence_stale: stale,
    queue: classifyQueue(provider),
    outbound_disposition: classifyOutbound(provider),
    recommended_internal_action: provider.next_action,
    blocker: provider.blocker,
    evidence_refs: provider.evidence_refs,
    external_action_authorized: false,
    contract_spend_credential_acquisition_authorized: false,
    production_public_g5_authorized: false
  };
}

export function runTrackZControlCycle({
  policy, routing, providerState, providerRegistry, sourcing, writtenOnly,
  portfolio, commercialRights, inputDigests = {}, observedAt, sourceRef
}) {
  validateTrackZInputs({ policy, routing, providerState, providerRegistry, sourcing, writtenOnly, portfolio, commercialRights });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(observedAt ?? '')) {
    throw new Error('OBSERVED_AT_INVALID');
  }
  if (!sourceRef || typeof sourceRef !== 'string') throw new Error('SOURCE_REF_REQUIRED');
  const caseDecisions = providerState.providers.map(provider => evaluateProvider(provider, policy, observedAt));
  const queueSummary = Object.fromEntries(Object.keys(policy.work_queues).map(queue => [
    queue,
    caseDecisions.filter(item => item.queue === queue).length
  ]));
  const overflowQueues = Object.entries(queueSummary)
    .filter(([queue, count]) => count > policy.work_queues[queue].wip_limit)
    .map(([queue, count]) => ({ queue, count, wip_limit: policy.work_queues[queue].wip_limit }));
  const verdictSummary = Object.fromEntries(policy.decision_states.map(verdict => [
    verdict,
    caseDecisions.filter(item => item.track_z_verdict === verdict).length
  ]));
  const receipt = {
    id: policy.receipt_contract.id,
    version: '1.0.0',
    state: 'VERIFIED_PASS_INTERNAL_CONTROL_ONLY',
    source_ref: sourceRef,
    observed_at: observedAt,
    provider_state_as_of: providerState.as_of,
    input_digests: inputDigests,
    summary: {
      provider_count: caseDecisions.length,
      verdicts: verdictSummary,
      external_actions_authorized: 0,
      contract_spend_credential_acquisition_authorized: 0,
      production_public_g5_authorized: 0,
      queue_overflow_count: overflowQueues.length
    },
    case_decisions: caseDecisions,
    queue_summary: queueSummary,
    overflow_queues: overflowQueues,
    invariants: {
      mandatory_route: REQUIRED_AUTHORITY_CHAIN,
      provider_ids_unique: true,
      duplicate_outreach_blocked: true,
      written_email_only: true,
      deterministic_replay: true,
      provider_failures_isolated_per_case: true,
      receipt_grants_approval_authority: false,
      receipt_grants_production_authority: false
    },
    authority_boundary: {
      external_communication: 'HOLD',
      contract_or_eula: 'HOLD',
      spend: 'HOLD',
      credential_or_account_activation: 'HOLD',
      external_data_acquisition: 'HOLD',
      provider_activation: 'HOLD',
      production: 'HOLD',
      public: 'HOLD',
      g5: 'HOLD'
    },
    four_principles_effect: policy.four_principles_effect
  };
  receipt.receipt_digest = sha256(stableStringify(receipt));
  return receipt;
}

export function currentGitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'UNKNOWN_LOCAL_HEAD';
  }
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
