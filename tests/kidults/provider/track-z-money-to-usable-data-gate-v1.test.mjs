import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  DECISION_STATES,
  gatePath,
  PROVIDER_RECORD_FIELDS,
  PROTECTED_GATES,
  REQUIRED_CHAIN,
  REQUIRED_LINKS,
  REQUIRED_ORDER,
  validateBindings,
  validateGate
} from '../../../scripts/kidults/provider/validate-track-z-money-to-usable-data-gate-v1.mjs';

const canonical = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
const clone = () => structuredClone(canonical);
const expectGateError = (mutate, code) => {
  const gate = clone();
  mutate(gate);
  assert.ok(validateGate(gate).includes(code), `expected ${code}`);
};

const machine = 'coordination/kidults/governance/track-z-money-to-usable-data-gate-v1.json';
const doc = 'docs/strategy/TRACK_Z_MONEY_TO_USABLE_DATA_GATE_V1.md';
const validSourcing = () => ({
  mandatory_strategy_addenda: [doc],
  machine_readable_strategy_addenda: [machine],
  money_to_usable_data_gate: {
    status: 'MANDATORY_FAIL_CLOSED',
    canonical_addendum: machine,
    required_chain: [...REQUIRED_CHAIN],
    missing_or_unknown_state: 'NO_PAY_HOLD',
    payment_before_complete_evidence_forbidden: true,
    paid_or_auto_converting_trial_before_complete_evidence_forbidden: true
  }
});
const validAgents = `${doc} ${machine} NO_PAY_HOLD`;
const validStrategy = `${doc} ${machine} PAYMENT -> ACCESS -> INPUT -> DATA -> RIGHTS -> PRODUCT`;

test('canonical Track Z money-to-usable-data gate passes exact contract', () => {
  assert.deepEqual(validateGate(clone()), []);
  assert.deepEqual(validateBindings(clone(), validSourcing(), validAgents, validStrategy), []);
});

test('identity, authority and scope cannot drift', () => {
  for (const [field, value, code] of [
    ['id', 'replacement-gate', 'ID'],
    ['version', '2.0.0', 'VERSION'],
    ['status', 'OPTIONAL', 'STATUS'],
    ['authority', ['KPMO'], 'AUTHORITY'],
    ['scope', 'SOME_PROVIDERS', 'SCOPE']
  ]) expectGateError(gate => { gate[field] = value; }, code);
});

test('required chain and every link require exact ordered fields', () => {
  expectGateError(gate => { gate.required_chain.reverse(); }, 'CHAIN');
  expectGateError(gate => { gate.links.EXTRA = ['claim']; }, 'LINK_KEYS');
  for (const link of REQUIRED_CHAIN) {
    expectGateError(gate => { delete gate.links[link]; }, `LINK_${link}`);
    expectGateError(gate => { gate.links[link][0] = 'arbitrary-field'; }, `LINK_${link}`);
    expectGateError(gate => { gate.links[link].pop(); }, `LINK_${link}`);
    if (REQUIRED_LINKS[link].length > 1) {
      expectGateError(gate => { [gate.links[link][0], gate.links[link][1]] = [gate.links[link][1], gate.links[link][0]]; }, `LINK_${link}`);
    }
  }
});

test('execution order, decisions and provider record schema require exact ordered equality', () => {
  expectGateError(gate => { gate.required_order = [...REQUIRED_ORDER].reverse(); }, 'REQUIRED_ORDER');
  expectGateError(gate => { gate.required_order.pop(); }, 'REQUIRED_ORDER');
  expectGateError(gate => { gate.decision_states = [...DECISION_STATES, 'PAY']; }, 'DECISION_STATES');
  expectGateError(gate => { gate.provider_record_required_fields = PROVIDER_RECORD_FIELDS.filter(field => field !== 'provenance_receipt'); }, 'PROVIDER_RECORD_FIELDS');
  expectGateError(gate => { gate.protected_gates = PROTECTED_GATES.filter(item => item !== 'G5'); }, 'PROTECTED_GATES');
  expectGateError(gate => { gate.protected_gates.reverse(); }, 'PROTECTED_GATES');
});

test('every prepayment fail-close predicate is mandatory', () => {
  for (const [field, value, code] of [
    ['all_links_required', false, 'ALL_LINKS'],
    ['unknown_or_ambiguous_fails_closed', false, 'UNKNOWN_FAIL_CLOSED'],
    ['post_payment_discovery_of_material_terms_forbidden', false, 'POST_PAYMENT_DISCOVERY'],
    ['paid_trial_before_gate_pass_forbidden', false, 'PAID_TRIAL'],
    ['auto_converting_trial_before_gate_pass_forbidden', false, 'AUTO_CONVERT'],
    ['annual_prepayment_before_successful_bounded_pilot_forbidden', false, 'ANNUAL_PREPAYMENT'],
    ['consumer_membership_is_data_license', true, 'CONSUMER_LICENSE'],
    ['token_or_http_success_is_usable_data_proof', true, 'TOKEN_PROOF'],
    ['missing_link_state', 'READY_FOR_SPEND_REVIEW', 'MISSING_LINK_STATE']
  ]) expectGateError(gate => { gate.prepayment_policy[field] = value; }, code);
});

test('sample exception cannot waive INPUT, RIGHTS, PAYMENT or PRODUCT evidence', () => {
  expectGateError(gate => { gate.sample_exception.provider_prohibits_live_precontract_canary = 'PROVIDER_CLAIM'; }, 'SAMPLE_EXCEPTION');
  expectGateError(gate => { gate.sample_exception.waives_input_rights_payment_or_product_evidence = true; }, 'SAMPLE_NON_WAIVER');
});

test('spend and release authority remain independently held', () => {
  expectGateError(gate => { gate.ready_for_spend_review_grants_spend_authority = true; }, 'SPEND_AUTHORITY');
  expectGateError(gate => { gate.protected_gate_owner = 'KPMO'; }, 'PROTECTED_GATE_OWNER');
  for (const field of ['production', 'public_release', 'g5']) {
    expectGateError(gate => { gate[field] = 'AUTHORIZED'; }, 'RELEASE_HOLD');
  }
});

test('PSA control incident cannot change identity, class, rights or spend boundary', () => {
  for (const [field, value, code] of [
    ['provider', 'OTHER', 'CONTROL_INCIDENT_PROVIDER'],
    ['failure_class', 'SUCCESS', 'CONTROL_INCIDENT_CLASS'],
    ['rights_expansion_authorized', true, 'CONTROL_INCIDENT_RIGHTS'],
    ['additional_spend_authorized', true, 'CONTROL_INCIDENT_SPEND']
  ]) expectGateError(gate => { gate.control_incident[field] = value; }, code);
});

test('sourcing contract must retain the exact fail-closed Track Z binding', () => {
  const cases = [
    ['SOURCING_DOC_BINDING', sourcing => { sourcing.mandatory_strategy_addenda = []; }],
    ['SOURCING_MACHINE_BINDING', sourcing => { sourcing.machine_readable_strategy_addenda = []; }],
    ['SOURCING_STATUS', sourcing => { sourcing.money_to_usable_data_gate.status = 'OPTIONAL'; }],
    ['SOURCING_CANONICAL_ADDENDUM', sourcing => { sourcing.money_to_usable_data_gate.canonical_addendum = 'other.json'; }],
    ['SOURCING_CHAIN', sourcing => { sourcing.money_to_usable_data_gate.required_chain.reverse(); }],
    ['SOURCING_FAIL_CLOSED', sourcing => { sourcing.money_to_usable_data_gate.missing_or_unknown_state = 'PASS'; }],
    ['SOURCING_PAYMENT', sourcing => { sourcing.money_to_usable_data_gate.payment_before_complete_evidence_forbidden = false; }],
    ['SOURCING_TRIAL', sourcing => { sourcing.money_to_usable_data_gate.paid_or_auto_converting_trial_before_complete_evidence_forbidden = false; }]
  ];
  for (const [code, mutate] of cases) {
    const sourcing = validSourcing();
    mutate(sourcing);
    assert.ok(validateBindings(clone(), sourcing, validAgents, validStrategy).includes(code), `expected ${code}`);
  }
});

test('human-readable bootstrap and strategy bindings cannot be dropped', () => {
  assert.ok(validateBindings(clone(), validSourcing(), 'NO_PAY_HOLD', validStrategy).includes('AGENT_BOOTSTRAP_BINDING'));
  assert.ok(validateBindings(clone(), validSourcing(), validAgents, machine).includes('STRATEGY_BINDING'));
});

test('binding validation independently preserves PSA non-expansion boundary', () => {
  const gate = clone();
  gate.control_incident.additional_spend_authorized = true;
  assert.ok(validateBindings(gate, validSourcing(), validAgents, validStrategy).includes('PSA_INCIDENT_BOUNDARY'));
});
