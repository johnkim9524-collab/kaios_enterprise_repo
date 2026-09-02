import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const gatePath = path.join(root, 'coordination/kidults/governance/track-z-money-to-usable-data-gate-v1.json');

export const REQUIRED_CHAIN = ['PAYMENT', 'ACCESS', 'INPUT', 'DATA', 'RIGHTS', 'PRODUCT'];
export const REQUIRED_LINKS = {
  PAYMENT: ['exact-fee', 'billing-trigger', 'auto-conversion', 'renewal', 'cancellation-deadline', 'refund-position', 'maximum-bounded-exposure'],
  ACCESS: ['licensed-product', 'endpoint-or-export', 'credential-prerequisites', 'rate-and-volume-limits', 'activation-owner'],
  INPUT: ['lawful-seed-source', 'non-enumeration', 'input-supplier', 'provenance-receipt'],
  DATA: ['schema-matching-sample', 'required-record-fields', 'field-semantics', 'coverage', 'correction-path'],
  RIGHTS: ['collection', 'storage', 'retention', 'normalization', 'matching', 'human-qa', 'derived-artifacts', 'display', 'attribution', 'deletion', 'termination'],
  PRODUCT: ['named-product-decision', 'measurable-success-criteria', 'stop-criteria', 'end-to-end-adapter', 'claim-support']
};
export const REQUIRED_ORDER = [
  'WRITTEN_PRODUCT_AND_RIGHTS_REVIEW',
  'SCHEMA_MATCHING_SAMPLE',
  'LAWFUL_INPUT_SOURCE_CLOSURE',
  'ONE_RECORD_END_TO_END_PROOF',
  'FIVE_RECORD_CANARY',
  'THIRTY_TO_ONE_HUNDRED_TWENTY_RECORD_BOUNDED_PILOT',
  'SPEND_APPROVAL',
  'CONTRACT_AND_CREDENTIAL_ACTIVATION'
];
export const DECISION_STATES = ['NO_PAY_HOLD', 'READY_FOR_SPEND_REVIEW', 'BOUNDED_ACTIVE', 'REPLACE', 'DROP'];
export const PROVIDER_RECORD_FIELDS = [
  'provider', 'licensed_product', 'brand_or_vertical', 'required_fields', 'claim_classes',
  'chain_evidence_refs', 'chain_observed_at', 'sample_digest', 'adapter_result',
  'lawful_input_owner', 'provenance_receipt', 'price', 'maximum_exposure',
  'billing_renewal_cancellation_controls', 'rights_result', 'retention_deletion_result',
  'derived_output_result', 'termination_result', 'success_criteria', 'stop_criteria',
  'rollback_criteria', 'replacement_criteria', 'decision'
];
export const PROTECTED_GATES = ['SPEND', 'CONTRACT', 'EXPANDED_CREDENTIAL', 'PUBLIC', 'PRODUCTION', 'G5'];

const equal = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

export function validateGate(gate) {
  const errors = [];
  const require = (condition, code) => { if (!condition) errors.push(code); };

  require(gate?.id === 'track-z-money-to-usable-data-gate-v1', 'ID');
  require(gate?.version === '1.0.0', 'VERSION');
  require(gate?.status === 'MANDATORY_FAIL_CLOSED', 'STATUS');
  require(equal(gate?.authority, ['PROGRAM_OWNER', 'KPMO']), 'AUTHORITY');
  require(gate?.scope === 'ALL_EXTERNAL_DATA_PROVIDER_PAYMENTS_TRIALS_CONTRACTS_CREDENTIALS_AND_ACQUISITIONS', 'SCOPE');
  require(equal(gate?.required_chain, REQUIRED_CHAIN), 'CHAIN');
  require(equal(Object.keys(gate?.links ?? {}), REQUIRED_CHAIN), 'LINK_KEYS');
  for (const link of REQUIRED_CHAIN) require(equal(gate?.links?.[link], REQUIRED_LINKS[link]), `LINK_${link}`);
  require(equal(gate?.required_order, REQUIRED_ORDER), 'REQUIRED_ORDER');

  const policy = gate?.prepayment_policy;
  require(policy?.all_links_required === true, 'ALL_LINKS');
  require(policy?.unknown_or_ambiguous_fails_closed === true, 'UNKNOWN_FAIL_CLOSED');
  require(policy?.post_payment_discovery_of_material_terms_forbidden === true, 'POST_PAYMENT_DISCOVERY');
  require(policy?.paid_trial_before_gate_pass_forbidden === true, 'PAID_TRIAL');
  require(policy?.auto_converting_trial_before_gate_pass_forbidden === true, 'AUTO_CONVERT');
  require(policy?.annual_prepayment_before_successful_bounded_pilot_forbidden === true, 'ANNUAL_PREPAYMENT');
  require(policy?.consumer_membership_is_data_license === false, 'CONSUMER_LICENSE');
  require(policy?.token_or_http_success_is_usable_data_proof === false, 'TOKEN_PROOF');
  require(policy?.missing_link_state === 'NO_PAY_HOLD', 'MISSING_LINK_STATE');

  require(gate?.sample_exception?.provider_prohibits_live_precontract_canary === 'SCHEMA_MATCHING_PROVIDER_SAMPLE_PLUS_VALIDATED_INTERNAL_DRY_RUN', 'SAMPLE_EXCEPTION');
  require(gate?.sample_exception?.waives_input_rights_payment_or_product_evidence === false, 'SAMPLE_NON_WAIVER');
  require(equal(gate?.decision_states, DECISION_STATES), 'DECISION_STATES');
  require(gate?.ready_for_spend_review_grants_spend_authority === false, 'SPEND_AUTHORITY');
  require(equal(gate?.provider_record_required_fields, PROVIDER_RECORD_FIELDS), 'PROVIDER_RECORD_FIELDS');
  require(equal(gate?.protected_gates, PROTECTED_GATES), 'PROTECTED_GATES');
  require(gate?.protected_gate_owner === 'PROGRAM_OWNER', 'PROTECTED_GATE_OWNER');
  require(gate?.production === 'HOLD' && gate?.public_release === 'HOLD' && gate?.g5 === 'HOLD', 'RELEASE_HOLD');

  const incident = gate?.control_incident;
  require(incident?.provider === 'PSA', 'CONTROL_INCIDENT_PROVIDER');
  require(incident?.failure_class === 'PAYMENT_WITHOUT_LAWFUL_USABLE_INPUT_PATH', 'CONTROL_INCIDENT_CLASS');
  require(incident?.rights_expansion_authorized === false, 'CONTROL_INCIDENT_RIGHTS');
  require(incident?.additional_spend_authorized === false, 'CONTROL_INCIDENT_SPEND');
  return errors;
}

export function validateBindings(gate, sourcing, agents, strategy) {
  const errors = [];
  const doc = 'docs/strategy/TRACK_Z_MONEY_TO_USABLE_DATA_GATE_V1.md';
  const machine = 'coordination/kidults/governance/track-z-money-to-usable-data-gate-v1.json';
  const bound = sourcing?.money_to_usable_data_gate;
  if (!sourcing?.mandatory_strategy_addenda?.includes(doc)) errors.push('SOURCING_DOC_BINDING');
  if (!sourcing?.machine_readable_strategy_addenda?.includes(machine)) errors.push('SOURCING_MACHINE_BINDING');
  if (bound?.status !== 'MANDATORY_FAIL_CLOSED') errors.push('SOURCING_STATUS');
  if (bound?.canonical_addendum !== machine) errors.push('SOURCING_CANONICAL_ADDENDUM');
  if (!equal(bound?.required_chain, REQUIRED_CHAIN)) errors.push('SOURCING_CHAIN');
  if (bound?.missing_or_unknown_state !== 'NO_PAY_HOLD') errors.push('SOURCING_FAIL_CLOSED');
  if (bound?.payment_before_complete_evidence_forbidden !== true) errors.push('SOURCING_PAYMENT');
  if (bound?.paid_or_auto_converting_trial_before_complete_evidence_forbidden !== true) errors.push('SOURCING_TRIAL');
  if (!agents.includes(doc) || !agents.includes(machine) || !agents.includes('NO_PAY_HOLD')) errors.push('AGENT_BOOTSTRAP_BINDING');
  if (!strategy.includes(doc) || !strategy.includes(machine) || !strategy.includes('PAYMENT -> ACCESS -> INPUT -> DATA -> RIGHTS -> PRODUCT')) errors.push('STRATEGY_BINDING');
  if (gate?.control_incident?.rights_expansion_authorized !== false || gate?.control_incident?.additional_spend_authorized !== false) errors.push('PSA_INCIDENT_BOUNDARY');
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const gate = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
  const sourcing = JSON.parse(fs.readFileSync(path.join(root, 'coordination/kidults/governance/ih-group-provider-sourcing-contract-v1.json'), 'utf8'));
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  const strategy = fs.readFileSync(path.join(root, 'docs/strategy/IH_GROUP_GLOBAL_PROVIDER_STRATEGY_V6.md'), 'utf8');
  const errors = [...validateGate(gate), ...validateBindings(gate, sourcing, agents, strategy)];
  if (errors.length) {
    console.error(JSON.stringify({ state: 'VERIFIED_FAIL', errors }));
    process.exit(1);
  }
  console.log(JSON.stringify({ state: 'VERIFIED_PASS', gate: gate.id, chain: gate.required_chain }));
}
