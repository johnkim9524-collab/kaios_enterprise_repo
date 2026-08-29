import fs from 'node:fs';
import {
  GEMRATE_PREFLIGHT_PATH,
  validateGemrateBoundedPilot
} from '../provider/validate-gemrate-bounded-pilot-preflight-v1.mjs';
import {
  CGC_CCG_INTAKE_PATH,
  validateCgcCcgResponseIntake
} from '../provider/validate-cgc-ccg-provider-response-intake-v1.mjs';

const l = JSON.parse(fs.readFileSync('coordination/kidults/internalization/provider-commercial-rights-ledger-v1.json','utf8'));
const gemratePreflight = JSON.parse(fs.readFileSync(GEMRATE_PREFLIGHT_PATH, 'utf8'));
const cgcCcgIntake = JSON.parse(fs.readFileSync(CGC_CCG_INTAKE_PATH, 'utf8'));
const errs = [];
const sameMembers = (actual = [], expected = []) => actual.length === expected.length &&
  [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
if (l.ledger_id !== 'KIDULTS_PROVIDER_COMMERCIAL_RIGHTS_LEDGER_V1') errs.push('invalid ledger id');
if (l.evidence_policy !== 'WRITTEN_OR_OFFICIAL_ONLY_UNKNOWN_NOT_ZERO') errs.push('evidence policy drift');
if (!Array.isArray(l.providers) || l.providers.length < 7) errs.push('expected at least 7 providers');
for (const p of l.providers || []) {
  if (!p.provider_id) errs.push('provider_id required');
  if (!p.evidence_state) errs.push(`${p.provider_id}: evidence_state required`);
  if (!p.commercial) errs.push(`${p.provider_id}: commercial state required`);
  if (!Array.isArray(p.rights_pending)) errs.push(`${p.provider_id}: rights_pending array required`);
  if (!p.activation_state) errs.push(`${p.provider_id}: activation_state required`);
  if (p.provider_id === 'GEMRATE') {
    if (p.evidence_state !== 'WRITTEN_PROVIDER_BOUNDED_PILOT_RIGHTS') errs.push('GEMRATE: written bounded-pilot evidence state drift');
    if (p.commercial?.developer_monthly_usd !== 200 || p.commercial?.daily_request_limit !== 5000 || p.commercial?.trial_days !== 7) errs.push('GEMRATE: written commercial terms drift');
    if (p.commercial?.trial_requires_credit_card !== true || p.commercial?.trial_auto_converts_to_monthly_usd !== 200 || p.commercial?.auto_conversion_day !== 7) errs.push('GEMRATE: auto-converting trial terms missing');
    for (const field of [
      'private_cache_store_while_trial_or_subscription_active', 'private_normalization', 'entity_resolution',
      'model_calibration', 'human_review', 'internal_analytics',
      'cert_population_grader_grade_and_universal_ids_for_matching_and_derived_analytics',
      'retain_independently_created_canonical_ids', 'retain_independently_created_entity_match_decisions',
      'retain_independently_created_quality_assessments'
    ]) if (p.rights_confirmed?.[field] !== true) errs.push(`GEMRATE: confirmed right drift ${field}`);
    if (p.rights_confirmed?.raw_retention_days_after_termination_max !== 30 || p.rights_confirmed?.normalized_provider_record_retention_days_after_termination_max !== 30) errs.push('GEMRATE: termination deletion deadline drift');
    if (p.rights_confirmed?.public_raw_display !== false || p.rights_confirmed?.raw_redistribution !== false) errs.push('GEMRATE: raw publication boundary drift');
    const expectedPending = [
      'post_termination_derived_feature_retention', 'post_termination_model_calibration_artifact_retention',
      'non_reconstructive_definition', 'universal_id_portability_after_termination',
      'historical_data_and_cert_image_add_on_pricing', 'custom_mapping_and_bulk_delivery_terms',
      'sla_support_and_minimum_commitment'
    ];
    if (!sameMembers(p.rights_pending, expectedPending)) errs.push('GEMRATE: unresolved-rights universe drift');
    if (p.bounded_pilot_rights_state !== 'PASS_WITH_POST_TERMINATION_DERIVED_HOLD') errs.push('GEMRATE: bounded pilot rights state drift');
    if (p.activation_state !== 'HOLD_PENDING_FOUNDER_TRIAL_SPEND_APPROVAL_EXACT_FIELD_MAP_PRIVATE_STORE_DELETION_AND_CANCELLATION_CONTROLS') errs.push('GEMRATE: activation HOLD drift');
    if (p.acquisition_progress !== '0_OF_120') errs.push('GEMRATE: acquisition must remain 0 of 120');
    for (const ref of ['gmail:message:1a03ecb47ea56741', 'gmail:message:1a0439617a831715', GEMRATE_PREFLIGHT_PATH]) {
      if (!p.evidence_refs?.includes(ref)) errs.push(`GEMRATE: evidence binding missing ${ref}`);
    }
  } else if (p.provider_id === 'CGC_CCG') {
    if (p.evidence_state !== 'WRITTEN_PROVIDER_PARTIAL_RESPONSE') errs.push('CGC_CCG: partial response evidence state drift');
    if (p.commercial?.membership_fee_amount !== 'UNKNOWN' || p.commercial?.numeric_rate_limits !== 'UNKNOWN') errs.push('CGC_CCG: unknown economics/rate limits must remain explicit');
    if (p.commercial?.api_included_with_authorized_dealer_membership_and_agreement !== true) errs.push('CGC_CCG: included API path drift');
    if (p.rights_confirmed?.internal_data_validation_and_intelligence_use_can_qualify !== true || p.rights_confirmed?.two_industry_references_mandatory !== true || p.rights_confirmed?.provider_will_contact_submitted_references !== true) errs.push('CGC_CCG: confirmed eligibility/reference process facts drift');
    if (p.rights_confirmed?.references_submitted !== false || p.rights_confirmed?.reference_contact_observed !== false) errs.push('CGC_CCG: unobserved reference execution must remain false');
    if (p.response_state !== 'PARTIAL_RESPONSE_RECEIVED_NEEDS_CLARIFICATION') errs.push('CGC_CCG: response state drift');
    if (p.activation_state !== 'HOLD_DEALER_APPLICATION_REFERENCES_AGREEMENT_SPEND_CREDENTIAL_AND_DATA') errs.push('CGC_CCG: activation HOLD drift');
    for (const ref of ['gmail:message:1a0348bf65698c4f', 'gmail:message:1a0436674fda570e', CGC_CCG_INTAKE_PATH]) {
      if (!p.evidence_refs?.includes(ref)) errs.push(`CGC_CCG: evidence binding missing ${ref}`);
    }
  } else if (p.provider_id === 'ALT_FNDATA') {
    if (p.evidence_state !== 'WRITTEN_PROVIDER_DECLINED_COMPETITOR_CONFLICT') errs.push('ALT_FNDATA: rejection evidence state drift');
    if (p.activation_state !== 'NO_GO_PROVIDER_DECLINED_COMPETITOR_CONFLICT') errs.push('ALT_FNDATA: activation must remain terminal NO_GO');
    if (p.rights_pending.length !== 0) errs.push('ALT_FNDATA: rights must not remain pending after terminal rejection');
    if (p.permitted_residual_role !== 'PUBLIC_COMPETITOR_BENCHMARK_ONLY') errs.push('ALT_FNDATA: residual role drift');
  } else if (String(p.activation_state).startsWith('HOLD') === false) {
    errs.push(`${p.provider_id}: activation must remain HOLD on current evidence`);
  }
}
for (const finding of validateGemrateBoundedPilot(gemratePreflight)) errs.push(`GEMRATE_PREFLIGHT: ${finding}`);
for (const finding of validateCgcCcgResponseIntake(cgcCcgIntake)) errs.push(`CGC_CCG_INTAKE: ${finding}`);
const g = l.global_non_bypass || {};
if (g.unknown_rights_may_activate !== false) errs.push('unknown rights activation must be false');
if (g.unknown_price_may_be_zero !== false) errs.push('unknown price cannot be zero');
if (g.email_may_authorize_spend !== false) errs.push('email cannot authorize spend');
if (g.contract_acceptance !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('contract boundary drift');
if (g.credential_activation !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('credential boundary drift');
if (g.production !== 'HOLD') errs.push('production boundary drift');
if (g.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('g5 boundary drift');
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log(JSON.stringify({
  suite:'KIDULTS_PROVIDER_COMMERCIAL_RIGHTS_LEDGER_V1',
  result:'PASS',
  providers:l.providers.length,
  written_provider_records:l.providers.filter(p=>String(p.evidence_state).startsWith('WRITTEN_PROVIDER')).length,
  gemrate_bounded_pilot_rights:'PASS_WITH_POST_TERMINATION_DERIVED_HOLD',
  gemrate_activation:'HOLD',
  gemrate_acquisition:'0_OF_120',
  cgc_ccg_response:'PARTIAL_RESPONSE_RECEIVED_NEEDS_CLARIFICATION',
  cgc_ccg_activation:'HOLD',
  activation:'SIX_HOLD_ONE_TERMINAL_NO_GO',
  production:g.production,
  g5:g.g5
},null,2));
