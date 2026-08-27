import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const GEMRATE_PREFLIGHT_PATH = 'coordination/kidults/provider/gemrate-bounded-pilot-preflight-v1.json';

const EXPECTED_EXCLUSIONS = ['CERT_IMAGES', 'CHANGE_FEED', 'HISTORICAL_DATA'];
const EXPECTED_UNKNOWNS = [
  'CUSTOM_MAPPING_AND_BULK_DELIVERY_TERMS',
  'HISTORICAL_DATA_AND_CERT_IMAGE_ADD_ON_PRICING',
  'NON_RECONSTRUCTIVE_DEFINITION',
  'POST_TERMINATION_DERIVED_FEATURE_RETENTION',
  'POST_TERMINATION_MODEL_CALIBRATION_ARTIFACT_RETENTION',
  'SLA_SUPPORT_AND_MINIMUM_COMMITMENT',
  'UNIVERSAL_ID_PORTABILITY_AFTER_TERMINATION'
];

const clone = value => JSON.parse(JSON.stringify(value));
const sameMembers = (actual = [], expected = []) =>
  actual.length === expected.length &&
  [...actual].sort().every((value, index) => value === [...expected].sort()[index]);

export function validateGemrateBoundedPilot(x) {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };

  require(x.id === 'kidults-gemrate-bounded-pilot-preflight-v1', 'invalid preflight id');
  require(x.version === '1.0.0', 'version drift');
  require(x.provider_id === 'GEMRATE' && x.product_id === 'GEMRATE_DEVELOPER_TIER', 'provider/product binding drift');
  require(x.governing_issue === 1151, 'governing issue drift');
  require(x.state === 'WRITTEN_BOUNDED_PILOT_RIGHTS_CONFIRMED_ACTIVATION_HOLD', 'state drift');
  require(x.rights_decision === 'PASS_WITH_POST_TERMINATION_DERIVED_HOLD', 'rights decision drift');
  require(x.activation_decision === 'HOLD', 'activation must remain HOLD');

  const outbound = x.source_evidence?.latest_outbound ?? {};
  const response = x.source_evidence?.provider_response ?? {};
  require(outbound.evidence_ref === 'gmail:message:1a03ecb47ea56741', 'latest outbound evidence drift');
  require(outbound.rfc_message_id === '<CAPAjgK6a53u-i0Wabi0RnxUweJ0w-n2zt2hFFzVt9jP3aL8OWg@mail.gmail.com>', 'latest outbound RFC drift');
  require(outbound.sent_at === '2026-08-26T15:58:24Z', 'latest outbound timestamp drift');
  require(response.evidence_ref === 'gmail:message:1a0439617a831715', 'provider response evidence required');
  require(response.rfc_message_id === '<mtblvykv.b88db842-7160-4b8d-bd83-ca25f404f56c@we.are.superhuman.com>', 'provider response RFC drift');
  require(response.received_at === '2026-08-27T14:18:21Z', 'provider response timestamp drift');
  require(response.sender_role === 'GEMRATE_FOUNDER', 'provider-origin sender binding required');
  require(Date.parse(response.received_at) > Date.parse(outbound.sent_at), 'provider response must post-date outbound request');

  const commercial = x.commercial ?? {};
  require(commercial.developer_monthly_usd === 200, 'monthly price drift');
  require(commercial.daily_request_limit === 5000, 'daily quota drift');
  require(commercial.trial_days === 7, 'trial duration drift');
  require(commercial.trial_requires_credit_card === true, 'credit-card condition missing');
  require(commercial.trial_auto_converts_to_monthly_usd === 200 && commercial.auto_conversion_day === 7, 'auto-conversion terms drift');
  require(sameMembers(commercial.excluded_endpoints, EXPECTED_EXCLUSIONS), 'Developer endpoint exclusions drift');
  require(commercial.change_feed_commercial_start_monthly_usd === 1000, 'change-feed commercial floor drift');
  require(commercial.change_feed_daily_request_limit === 100000, 'change-feed quota drift');
  require(commercial.minimum_commitment === 'UNKNOWN', 'unknown minimum commitment must remain explicit');

  const scope = x.bounded_pilot_scope ?? {};
  require(scope.target_known_cert_cases === 120 && scope.known_cert_numbers_only === true, 'bounded 120-known-cert scope required');
  require(scope.private_internal_evaluation_only === true && scope.trial_scope_confirmed_by_provider === true, 'written private pilot scope required');
  for (const field of ['public_display', 'raw_redistribution', 'scraping', 'bulk_enumeration', 'current_sold_transaction_feed', 'authoritative_grader_truth']) {
    require(scope[field] === false, `${field} must remain false`);
  }

  const rights = x.rights_confirmed ?? {};
  for (const field of [
    'private_cache_and_storage_while_trial_or_subscription_active', 'private_normalization', 'entity_resolution',
    'model_calibration', 'human_qa', 'internal_analytics', 'cert_numbers_for_matching_and_derived_analytics',
    'population_records_for_matching_and_derived_analytics', 'grader_names_and_grades_for_matching_and_derived_analytics',
    'universal_identifiers_for_matching_and_derived_analytics', 'customer_facing_derived_metrics_require_gemrate_link'
  ]) require(rights[field] === true, `confirmed right drift: ${field}`);
  require(rights.internal_attribution_required === false, 'internal attribution drift');
  require(rights.raw_records_may_be_redistributed === false, 'raw redistribution must remain blocked');

  const post = x.post_termination_policy ?? {};
  require(post.raw_provider_data_delete_within_days === 30, 'raw deletion deadline must be 30 days or less');
  require(post.normalized_provider_records_delete_within_days === 30, 'normalized-provider-record deletion deadline must be 30 days or less');
  for (const field of ['independently_created_canonical_ids', 'independently_created_entity_match_decisions', 'independently_created_quality_assessments']) {
    require(post[field] === 'RETAIN_CONFIRMED', `independent artifact retention drift: ${field}`);
  }
  require(post.provider_universal_id_portability === 'HOLD_NOT_EXPRESSLY_CONFIRMED', 'universal-ID portability must remain HOLD');
  require(post.derived_features === 'DELETE_OR_HOLD_PENDING_COMMERCIAL_AGREEMENT', 'derived-feature post-exit hold missing');
  require(post.model_calibration_artifacts === 'DELETE_OR_HOLD_PENDING_COMMERCIAL_AGREEMENT', 'model-calibration post-exit hold missing');
  require(post.non_reconstructive_definition === 'UNKNOWN_REQUIRES_COMMERCIAL_AGREEMENT', 'non-reconstructive definition must remain unknown');

  const prerequisites = x.activation_prerequisites ?? {};
  for (const field of ['founder_trial_and_credit_card_approval', 'founder_auto_converting_spend_approval', 'terms_acceptance_approval']) {
    require(prerequisites[field] === 'REQUIRED', `explicit approval missing: ${field}`);
  }
  for (const field of ['exact_field_map', 'lawful_120_known_cert_manifest', 'encrypted_private_store', 'termination_deletion_scheduler_and_receipt', 'trial_cancel_or_provider_extension_receipt_before_day_7', 'credential_secret_binding']) {
    require(prerequisites[field] === 'PENDING', `activation prerequisite must remain pending: ${field}`);
  }
  require(prerequisites.adapter === 'NOT_IMPLEMENTED', 'adapter must remain unimplemented');

  const receipt = x.secretless_execution_receipt ?? {};
  for (const field of ['account_created', 'terms_accepted', 'credit_card_entered', 'credential_created_or_observed']) {
    require(receipt[field] === false, `secretless preflight cannot perform ${field}`);
  }
  require(receipt.provider_network_calls === 0, 'secretless preflight cannot call provider');
  require(receipt.external_spend_usd === 0, 'secretless preflight cannot spend');
  require(receipt.cases_acquired === 0 && receipt.target_cases === 120, 'acquisition must remain 0 of 120');

  const boundary = x.non_bypass ?? {};
  require(boundary.trial_activation === 'HOLD_EXPLICIT_FOUNDER_APPROVAL_REQUIRED', 'trial activation boundary drift');
  require(boundary.contract === 'HOLD_EXPLICIT_APPROVAL_REQUIRED', 'contract boundary drift');
  require(boundary.spend === 'HOLD_EXPLICIT_FOUNDER_APPROVAL_REQUIRED', 'spend boundary drift');
  require(boundary.credential === 'HOLD_EXPLICIT_APPROVAL_REQUIRED', 'credential boundary drift');
  for (const field of ['data_acquisition', 'adapter_admission', 'public', 'production']) require(boundary[field] === 'HOLD', `${field} boundary drift`);
  require(boundary.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5 boundary drift');
  require(sameMembers(x.remaining_unknowns, EXPECTED_UNKNOWNS), 'remaining unknowns drift');
  require(typeof x.truth_boundary === 'string' && x.truth_boundary.includes('does not authorize account creation'), 'truth boundary missing activation denial');

  return errors;
}

const mutationTests = [
  ['reject_missing_provider_evidence', x => { x.source_evidence.provider_response.evidence_ref = null; }],
  ['reject_raw_retention_over_30_days', x => { x.post_termination_policy.raw_provider_data_delete_within_days = 31; }],
  ['reject_normalized_retention_over_30_days', x => { x.post_termination_policy.normalized_provider_records_delete_within_days = 31; }],
  ['reject_derived_feature_retention_claim', x => { x.post_termination_policy.derived_features = 'RETAIN'; }],
  ['reject_model_artifact_retention_claim', x => { x.post_termination_policy.model_calibration_artifacts = 'RETAIN'; }],
  ['reject_trial_activation', x => { x.non_bypass.trial_activation = 'ALLOW'; }],
  ['reject_credit_card_entry', x => { x.secretless_execution_receipt.credit_card_entered = true; }],
  ['reject_provider_network_call', x => { x.secretless_execution_receipt.provider_network_calls = 1; }],
  ['reject_auto_conversion_without_control', x => { x.activation_prerequisites.trial_cancel_or_provider_extension_receipt_before_day_7 = 'NOT_REQUIRED'; }],
  ['reject_public_display', x => { x.bounded_pilot_scope.public_display = true; }],
  ['reject_raw_redistribution', x => { x.rights_confirmed.raw_records_may_be_redistributed = true; }],
  ['reject_enumeration', x => { x.bounded_pilot_scope.bulk_enumeration = true; }],
  ['reject_unbounded_case_count', x => { x.bounded_pilot_scope.target_known_cert_cases = 121; }],
  ['reject_production_promotion', x => { x.non_bypass.production = 'ALLOW'; }],
  ['reject_g5_promotion', x => { x.non_bypass.g5 = 'APPROVED'; }]
];

function run(pathname = GEMRATE_PREFLIGHT_PATH) {
  const artifact = JSON.parse(fs.readFileSync(pathname, 'utf8'));
  const errors = validateGemrateBoundedPilot(artifact);
  for (const [name, mutate] of mutationTests) {
    const mutated = clone(artifact);
    mutate(mutated);
    if (validateGemrateBoundedPilot(mutated).length === 0) errors.push(`mutation escaped: ${name}`);
  }
  if (errors.length) {
    console.error(JSON.stringify({ suite: 'KIDULTS_GEMRATE_BOUNDED_PILOT_PREFLIGHT_V1', result: 'FAIL', errors }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    suite: 'KIDULTS_GEMRATE_BOUNDED_PILOT_PREFLIGHT_V1', result: 'PASS',
    rights_decision: artifact.rights_decision, activation: artifact.activation_decision,
    cases_acquired: artifact.secretless_execution_receipt.cases_acquired,
    target_cases: artifact.secretless_execution_receipt.target_cases,
    mutation_tests: mutationTests.length, provider_calls: 0, spend_usd: 0,
    production: artifact.non_bypass.production, public: artifact.non_bypass.public, g5: artifact.non_bypass.g5
  }, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) run(process.argv[2]);
