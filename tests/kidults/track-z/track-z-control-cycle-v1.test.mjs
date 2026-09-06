import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clone,
  DEFAULT_PATHS,
  loadTrackZInputs,
  runTrackZControlCycle
} from '../../../scripts/kidults/track-z/lib/track-z-control-engine-v1.mjs';

const OBSERVED_AT = '2026-09-07T00:00:00Z';
const SOURCE_REF = 'TEST_EXACT_HEAD';

function fixture() {
  const { inputs, inputDigests } = loadTrackZInputs(DEFAULT_PATHS);
  return { ...inputs, inputDigests, observedAt: OBSERVED_AT, sourceRef: SOURCE_REF };
}

test('evaluates the complete current provider universe without opening protected authority', () => {
  const receipt = runTrackZControlCycle(fixture());
  assert.equal(receipt.state, 'VERIFIED_PASS_INTERNAL_CONTROL_ONLY');
  assert.equal(receipt.summary.provider_count, 18);
  assert.equal(receipt.summary.external_actions_authorized, 0);
  assert.equal(receipt.summary.contract_spend_credential_acquisition_authorized, 0);
  assert.equal(receipt.summary.production_public_g5_authorized, 0);
  assert.equal(receipt.summary.queue_overflow_count, 0);
  assert.equal(receipt.summary.case_validation_failure_count, 0);
  assert.equal(receipt.case_decisions.length, 18);
  assert.equal(new Set(receipt.case_decisions.map(item => item.provider_id)).size, 18);
  assert.ok(receipt.case_decisions.every(item => item.external_action_authorized === false));
  assert.ok(receipt.case_decisions.every(item => item.production_public_g5_authorized === false));
  assert.match(receipt.receipt_digest, /^sha256:[0-9a-f]{64}$/);
});

test('replay is deterministic for exact inputs, time and source ref', () => {
  const left = runTrackZControlCycle(fixture());
  const right = runTrackZControlCycle(fixture());
  assert.deepEqual(left, right);
});

test('closed provider cannot be converted into outbound work', () => {
  const receipt = runTrackZControlCycle(fixture());
  const ebay = receipt.case_decisions.find(item => item.provider_id === 'EBAY_MARKETPLACE_INSIGHTS');
  assert.equal(ebay.track_z_verdict, 'WAIT');
  assert.equal(ebay.queue, 'TERMINAL_ARCHIVE');
  assert.equal(ebay.outbound_disposition, 'NO_OUTBOUND_REOPEN_ONLY_ON_MATERIAL_WRITTEN_CHANGE');
});

test('awaiting cases prohibit duplicate outreach', () => {
  const receipt = runTrackZControlCycle(fixture());
  const awaiting = receipt.case_decisions.filter(item => item.queue === 'WAITING_WRITTEN_RESPONSE');
  assert.ok(awaiting.length > 0);
  assert.ok(awaiting.every(item => item.outbound_disposition === 'WAIT_NO_DUPLICATE_OUTREACH'));
});

const mutations = [
  ['authority chain reorder', input => input.policy.authority_chain.reverse(), /AUTHORITY_CHAIN_INVALID/],
  ['routing bypass', input => { input.routing.cross_track_rule.must_route_external_provider_decision_to_track_z = false; }, /TRACK_Z_ROUTING_NOT_MANDATORY/],
  ['written channel drift', input => { input.sourcing.negotiation_communication_policy.channel = 'PHONE'; }, /GROUP_WRITTEN_ONLY_POLICY_MISSING/],
  ['duplicate provider identity', input => input.providerState.providers.push(clone(input.providerState.providers[0])), /DUPLICATE_PROVIDER_ID/],
  ['provider-off gate removal', input => { input.policy.scale_and_resilience.provider_off_test_required_before_pilot = false; }, /PROVIDER_OFF_GATE_MISSING/]
];

for (const [name, mutate, expected] of mutations) {
  test(`fails closed: ${name}`, () => {
    const input = fixture();
    mutate(input);
    assert.throws(() => runTrackZControlCycle(input), expected);
  });
}

const protectedCaseMutations = [
  ['external communication authority', input => { input.providerState.providers[0].external_communication_authorized = true; }],
  ['spend authority', input => { input.providerState.providers[0].new_spend_authorized = true; }],
  ['credential authority', input => { input.providerState.providers[0].credential_authorized = true; }],
  ['acquisition authority', input => { input.providerState.providers[0].acquisition_authorized = true; }],
  ['public release', input => { input.providerState.providers[0].public_release = 'PASS'; }],
  ['production release', input => { input.providerState.providers[0].production = 'PASS'; }],
  ['resend authority', input => { input.providerState.providers[0].communication.resend_authorized = true; }],
  ['automatic followup authority', input => { input.providerState.providers[0].communication.automatic_followup_authorized = true; }]
];

for (const [name, mutate] of protectedCaseMutations) {
  test(`isolates and neutralizes protected case mutation: ${name}`, () => {
    const input = fixture();
    mutate(input);
    const receipt = runTrackZControlCycle(input);
    assert.equal(receipt.state, 'VERIFIED_HOLD_CASE_ERRORS');
    assert.equal(receipt.summary.case_validation_failure_count, 1);
    assert.equal(receipt.case_decisions[0].verdict_reason, 'PROVIDER_CASE_INVALID_ISOLATED');
    assert.equal(receipt.case_decisions[0].external_action_authorized, false);
    assert.equal(receipt.case_decisions[0].production_public_g5_authorized, false);
  });
}

test('stale evidence narrows to HOLD without authorizing an outbound action', () => {
  const input = fixture();
  const target = input.providerState.providers.find(provider => provider.provider_id === 'GOODING_CHRISTIES');
  target.evidence_date = '2020-01-01';
  const receipt = runTrackZControlCycle(input);
  const decision = receipt.case_decisions.find(item => item.provider_id === 'GOODING_CHRISTIES');
  assert.equal(decision.track_z_verdict, 'HOLD');
  assert.equal(decision.verdict_reason, 'EVIDENCE_STALE');
  assert.equal(decision.external_action_authorized, false);
});

test('isolates a malformed provider case while preserving decisions for healthy providers', () => {
  const input = fixture();
  input.providerState.providers[0].evidence_refs = [];
  const receipt = runTrackZControlCycle(input);
  assert.equal(receipt.state, 'VERIFIED_HOLD_CASE_ERRORS');
  assert.equal(receipt.summary.case_validation_failure_count, 1);
  assert.equal(receipt.case_decisions.length, 18);
  assert.equal(receipt.case_decisions[0].verdict_reason, 'PROVIDER_CASE_INVALID_ISOLATED');
  assert.equal(receipt.case_decisions[0].outbound_disposition, 'NO_OUTBOUND_INVALID_CASE');
  assert.ok(receipt.case_decisions.slice(1).every(item => item.verdict_reason !== 'PROVIDER_CASE_INVALID_ISOLATED'));
});

test('future evidence is held as out-of-order and cannot authorize action', () => {
  const input = fixture();
  input.providerState.providers[1].evidence_date = '2026-09-08';
  const receipt = runTrackZControlCycle(input);
  const decision = receipt.case_decisions[1];
  assert.equal(decision.track_z_verdict, 'HOLD');
  assert.equal(decision.verdict_reason, 'EVIDENCE_FROM_FUTURE_OUT_OF_ORDER');
  assert.equal(decision.external_action_authorized, false);
});

test('queue overflow is a terminal internal hold rather than bypass authority', () => {
  const input = fixture();
  input.policy.work_queues.WAITING_WRITTEN_RESPONSE.wip_limit = 0;
  const receipt = runTrackZControlCycle(input);
  assert.equal(receipt.state, 'VERIFIED_HOLD_BACKPRESSURE');
  assert.equal(receipt.summary.queue_overflow_count, 1);
  assert.equal(receipt.summary.external_actions_authorized, 0);
});
