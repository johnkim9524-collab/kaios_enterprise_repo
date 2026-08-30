import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const read = path => readFile(resolve(root, path), 'utf8');
const parse = async path => JSON.parse(await read(path));
const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};

const paths = {
  sample: 'coordination/kidults/governance/provider-evidence-zero-defect-sample-policy-v1.json',
  negotiation: 'coordination/kidults/provider/provider-sample-governance-negotiation-v1.json',
  sourcing: 'coordination/kidults/governance/ih-group-provider-sourcing-contract-v1.json',
  contact: 'coordination/kidults/provider/provider-contact-readiness-gate-v1.json',
  adapter: 'coordination/kidults/provider/provider-adapter-contract-v1.json',
  raci: 'coordination/kidults/provider/provider-live-execution-raci-v1.json',
  content: 'coordination/kidults/provider/templates/provider-staged-evaluation-content-v1.md',
  strategy: 'docs/strategy/IH_PROVIDER_SAMPLE_GOVERNANCE_NEGOTIATION_V1.md',
  phase2: 'coordination/kidults/provider/PHASE2_CONTENT_DATA_PROVIDER_PLAN_V1.md',
};

const [sample, negotiation, sourcing, contact, adapter, raci, content, strategy, phase2] = await Promise.all([
  parse(paths.sample),
  parse(paths.negotiation),
  parse(paths.sourcing),
  parse(paths.contact),
  parse(paths.adapter),
  parse(paths.raci),
  read(paths.content),
  read(paths.strategy),
  read(paths.phase2),
]);

const tier = id => sample.tiers.find(entry => entry.id === id);
const zeroFailureN = tolerance => Math.ceil(Math.log(sample.statistical_method.alpha) / Math.log(1 - tolerance));

assert(sample.id === 'KIDULTS_PROVIDER_EVIDENCE_ZERO_DEFECT_SAMPLE_POLICY_V1', 'SAMPLE_POLICY_ID_INVALID');
assert(sample.statistical_method.interval === 'ONE_SIDED_EXACT_CLOPPER_PEARSON_UPPER_BOUND', 'STATISTICAL_METHOD_INVALID');
assert(sample.statistical_method.confidence === 0.99 && sample.statistical_method.alpha === 0.01, 'CONFIDENCE_INVALID');
assert(sample.statistical_method.optional_stopping === false, 'OPTIONAL_STOPPING_MUST_BE_FALSE');
assert(sample.statistical_method.threshold_change_after_observation === false, 'POST_OBSERVATION_THRESHOLD_CHANGE_FORBIDDEN');
assert(sample.rights_and_schema_census.required_for_every_record === true, 'RIGHTS_CENSUS_REQUIRED');
assert(sample.defect_taxonomy.CRITICAL.tolerance === 0, 'CRITICAL_DEFECT_TOLERANCE_NOT_ZERO');

const canary = tier('CANARY');
const pilot = tier('BOUNDED_FUNCTIONAL_PILOT');
const qualification = tier('ADAPTER_QUALIFICATION');
const privateReliability = tier('PRIVATE_E2E_RELIABILITY');
const beta = tier('BETA_RELIABILITY');
const production = tier('PRODUCTION_READINESS');

assert(canary?.min_n === 5 && canary?.max_n === 5 && canary?.statistical_claim === false, 'CANARY_TIER_INVALID');
assert(pilot?.min_n === 30 && pilot?.max_n === 120 && pilot?.statistical_claim === false, 'FUNCTIONAL_PILOT_TIER_INVALID');
assert(qualification?.zero_failure_n === 459, 'QUALIFICATION_DECLARED_N_INVALID');
assert(privateReliability?.zero_failure_n === 1840, 'PRIVATE_RELIABILITY_DECLARED_N_INVALID');
assert(beta?.zero_failure_n === 4603, 'BETA_DECLARED_N_INVALID');
assert(zeroFailureN(qualification.defect_tolerance) === qualification.zero_failure_n, 'QUALIFICATION_FORMULA_MISMATCH');
assert(zeroFailureN(privateReliability.defect_tolerance) === privateReliability.zero_failure_n, 'PRIVATE_RELIABILITY_FORMULA_MISMATCH');
assert(zeroFailureN(beta.defect_tolerance) === beta.zero_failure_n, 'BETA_FORMULA_MISMATCH');
assert(production?.required_natural_scheduled_runs === 30 && production?.required_observation_window_days === 7, 'PRODUCTION_NATURAL_RUN_GATE_INVALID');
assert(sample.coverage_gate.single_provider_can_prove_platform_market_representativeness === false, 'SINGLE_PROVIDER_MARKET_CLAIM_MUST_BE_FALSE');
assert(sample.provider_volume_semantics.fixed_120_as_universal_launch_requirement === 'PROHIBITED', 'UNIVERSAL_120_NOT_PROHIBITED');

assert(negotiation.id === 'KIDULTS_PROVIDER_SAMPLE_GOVERNANCE_NEGOTIATION_V1', 'NEGOTIATION_POLICY_ID_INVALID');
assert(negotiation.canonical_sample_policy === paths.sample, 'NEGOTIATION_SAMPLE_POLICY_REF_INVALID');
assert(negotiation.staged_negotiation_sequence.some(stage => stage.stage === 'CANARY' && stage.volume === 5), 'NEGOTIATION_CANARY_MISSING');
assert(negotiation.staged_negotiation_sequence.some(stage => stage.stage === 'BOUNDED_FUNCTIONAL_PILOT' && stage.volume_band?.min === 30 && stage.volume_band?.max === 120), 'NEGOTIATION_PILOT_MISSING');
assert(negotiation.staged_negotiation_sequence.some(stage => stage.stage === 'ADAPTER_QUALIFICATION_OPTION' && stage.volume_target_if_ZERO_FAILURE === 459), 'NEGOTIATION_QUALIFICATION_MISSING');
assert(negotiation.commercial_negotiation.default_terms.includes('NO_TAKE_OR_PAY_ON_STATISTICAL_TARGETS'), 'NO_TAKE_OR_PAY_TERM_MISSING');
assert(negotiation.external_content_policy.first_contact_should_not.includes('CALL_120_A_UNIVERSAL_MINIMUM_OR_LAUNCH_REQUIREMENT'), 'EXTERNAL_120_GUARD_MISSING');
assert(negotiation.external_content_policy.first_contact_should_not.includes('PROMISE_459_1840_OR_4603_PURCHASE_VOLUME'), 'EXTERNAL_PURCHASE_PROMISE_GUARD_MISSING');
assert(negotiation.current_external_execution_state.provider_messages === 'DRAFT_ONLY_NO_SEND', 'PROVIDER_MESSAGE_HOLD_MISSING');
assert(negotiation.current_external_execution_state.contact_authorized === false, 'NEGOTIATION_CONTACT_MUST_REMAIN_FALSE');

for (const requiredPath of [paths.sample, paths.negotiation, paths.strategy, paths.content, paths.contact, paths.raci]) {
  assert(sourcing.mandatory_provider_governance_bundle.includes(requiredPath), `SOURCING_BUNDLE_REF_MISSING:${requiredPath}`);
}
assert(sourcing.sample_governance.universal_fixed_120_launch_requirement === 'PROHIBITED', 'SOURCING_UNIVERSAL_120_INVALID');
assert(sourcing.sample_governance.adapter_qualification_zero_failure_target === 459, 'SOURCING_459_INVALID');
assert(sourcing.sample_governance.private_e2e_reliability_zero_failure_target === 1840, 'SOURCING_1840_INVALID');
assert(sourcing.sample_governance.beta_reliability_zero_failure_target === 4603, 'SOURCING_4603_INVALID');
assert(sourcing.current_external_communication_state.contact_authorized === false, 'SOURCING_CONTACT_MUST_REMAIN_FALSE');

assert(contact.sample_policy === paths.sample && contact.negotiation_policy === paths.negotiation, 'CONTACT_POLICY_BINDING_INVALID');
assert(contact.content_template === paths.content, 'CONTACT_TEMPLATE_BINDING_INVALID');
assert(contact.contact_authorized === false, 'CONTACT_GATE_MUST_REMAIN_FALSE');
assert(contact.program_owner_decision.current === 'HOLD_ALL_CONTACTS', 'CURRENT_CONTACT_DECISION_NOT_HOLD');
assert(contact.groups.RECONCILED_NO_DUPLICATE_OUTREACH.some(entry => entry.provider === 'PSA Premium' && entry.resend_authorized === false), 'PSA_RESEND_HOLD_MISSING');
assert(contact.groups.RECONCILED_NO_DUPLICATE_OUTREACH.some(entry => entry.provider === 'HobbyKorea' && entry.resend_authorized === false), 'HOBBYKOREA_RESEND_HOLD_MISSING');

assert(adapter.sample_policy === paths.sample && adapter.negotiation_policy === paths.negotiation, 'ADAPTER_POLICY_BINDING_INVALID');
assert(adapter.sample_and_quality_gate.zero_failure_targets.ADAPTER_QUALIFICATION === 459, 'ADAPTER_459_INVALID');
assert(adapter.sample_and_quality_gate.zero_failure_targets.PRIVATE_E2E_RELIABILITY === 1840, 'ADAPTER_1840_INVALID');
assert(adapter.sample_and_quality_gate.zero_failure_targets.BETA_RELIABILITY === 4603, 'ADAPTER_4603_INVALID');
assert(adapter.activation_boundary.sample_target_is_purchase_commitment === false, 'ADAPTER_SAMPLE_COMMITMENT_GUARD_INVALID');
assert(adapter.activation_boundary.pilot_success_is_production_authorization === false, 'PILOT_PRODUCTION_GUARD_INVALID');

assert(raci.sample_policy === paths.sample && raci.negotiation_policy === paths.negotiation, 'RACI_POLICY_BINDING_INVALID');
assert(raci.truth_language.forbidden_conflations.includes('BOUNDED_120_EQUALS_RELIABILITY'), 'RACI_120_CONFLATION_GUARD_MISSING');
assert(raci.truth_language.forbidden_conflations.includes('SAMPLE_TARGET_EQUALS_PURCHASE_COMMITMENT'), 'RACI_PURCHASE_CONFLATION_GUARD_MISSING');
assert(raci.current_external_execution_state.contact_authorized === false, 'RACI_CONTACT_MUST_REMAIN_FALSE');

for (const [text, markers, label] of [
  [content, ['five-record live canary', 'bounded private functional pilot', 'option expansion band up to approximately 459', 'DRAFT_ONLY_NO_SEND'], 'CONTENT'],
  [strategy, ['Canary 5', 'Bounded functional pilot 30–120', '459 zero-failure observations', '1,840', '4,603', 'PSA and HobbyKorea follow-up content remains draft-only'], 'STRATEGY'],
  [phase2, ['Canary 5', 'Bounded Functional Pilot 30–120', 'Provider negotiation content', 'DRAFT_ONLY_NO_SEND'], 'PHASE2'],
]) {
  for (const marker of markers) assert(text.includes(marker), `${label}_MARKER_MISSING:${marker}`);
}

process.stdout.write(`${JSON.stringify({
  receipt_id: 'KIDULTS_PROVIDER_SAMPLE_GOVERNANCE_NEGOTIATION_VALIDATION_V1',
  state: 'VERIFIED_PASS',
  sample_policy: sample.id,
  canary_n: canary.min_n,
  bounded_pilot: [pilot.min_n, pilot.max_n],
  zero_failure_targets: {
    adapter_qualification: qualification.zero_failure_n,
    private_e2e_reliability: privateReliability.zero_failure_n,
    beta_reliability: beta.zero_failure_n,
  },
  rights_census: sample.rights_and_schema_census.required_for_every_record,
  critical_defect_tolerance: sample.defect_taxonomy.CRITICAL.tolerance,
  contact_authorized: contact.contact_authorized,
  provider_messages: negotiation.current_external_execution_state.provider_messages,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
})}\n`);
