#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [observationPath, contractPath, adapterTestReceiptPath, outputDir] = process.argv.slice(2);
if (![observationPath, contractPath, adapterTestReceiptPath, outputDir].every(Boolean)) {
  throw new Error('STATE_DEPARTMENT_CAMERA_EVIDENCE_BUILD_ARGUMENTS_REQUIRED');
}

const readText = (file) => fs.readFile(file, 'utf8');
const readJson = async (file) => JSON.parse(await readText(file));
const stableValue = (value) => Array.isArray(value)
  ? value.map(stableValue)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
    : value;
const stableJson = (value) => `${JSON.stringify(stableValue(value), null, 2)}\n`;
const hashText = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const hashValue = (value) => hashText(JSON.stringify(stableValue(value)));
const canonicalId = (prefix, value) => `${prefix}::${hashValue(value).slice(7)}`;
const same = (left, right) => JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const [observation, contract, testReceipt] = await Promise.all([
  readJson(observationPath),
  readJson(contractPath),
  readJson(adapterTestReceiptPath),
]);
const [scopeRegistryCrosswalk, scopeRequirementMatrix] = await Promise.all([
  readJson(contract.authoritative_inputs.scope_registry_crosswalk),
  readJson(contract.authoritative_inputs.scope_requirement_matrix),
]);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const expectedOutputs = [
  'state-department-camera-evidence-ledger-v1.json',
  'state-department-camera-market-event-ledger-v1.json',
  'state-department-camera-claim-ceiling-receipt-v1.json',
  'state-department-camera-evidence-manifest-v1.json',
];
const requiredForbiddenClaims = [
  'CONFIRMED_HAMMER_PRICE', 'SETTLED_TRANSACTION', 'ALL_IN_REALIZED_PRICE', 'BUYER_PREMIUM_INCLUDED_PRICE',
  'CURRENT_PRICE', 'LIQUIDITY', 'TIME_TO_SALE', 'REPRESENTATIVE_COLLECTOR_MARKET_VALUE',
  'GLOBAL_MARKET_REPRESENTATIVENESS', 'CUSTOMER_FACING_MARKET_CLAIM',
];
const requiredAllowedClaims = [
  'THE_OFFICIAL_SOURCE_PAGE_DISPLAYED_SOLD_FOR_FOR_THE_BOUND_LOT',
  'THE_OFFICIAL_SOURCE_PAGE_DISPLAYED_A_TERMINAL_BID_AMOUNT_OF_2110_QAR',
  'THE_OFFICIAL_SOURCE_PAGE_DISPLAYED_101_BIDS',
  'THE_OFFICIAL_SOURCE_PAGE_DISPLAYED_A_2024_06_29_CLOSURE_TIMESTAMP',
  'THE_LOT_REFERENCED_NIKON_D5600_AND_NIKON_D90_CAMERAS',
];
const expectedAdapterMutationCases = [
  'projection-hash-mismatch', 'capture-agent-substituted', 'unexpected-semantic-claim-field',
  'source-host-mismatch', 'source-query-mismatch', 'official-lot-provenance-split',
  'terminal-sold-missing', 'terminal-amount-zero', 'currency-ambiguous', 'auction-close-drift',
  'terminal-amount-drift', 'currency-drift', 'bid-count-drift', 'lot-quantity-inflated',
  'owner-unverified', 'rights-allow-removed',
  'rights-evidence-ref-substituted', 'rights-review-expired', 'rights-review-far-future',
  'observation-time-future', 'observation-evidence-ref-removed',
  'verified-sold-promotion', 'public-promotion',
];
const expectedMutationFamilies = [
  'PROJECTION_HASH_MISMATCH', 'UNEXPECTED_OBSERVATION_FIELD_OR_CAPTURE_AGENT_SUBSTITUTION',
  'SOURCE_HOST_OR_PATH_MISMATCH', 'OFFICIAL_LOT_PROVENANCE_SPLIT',
  'EXACT_CLAIM_FACT_DRIFT', 'TERMINAL_SOLD_STATE_MISSING', 'TERMINAL_AMOUNT_OR_CURRENCY_INVALID',
  'LOT_GRAIN_QUANTITY_INVALID',
  'OWNER_OR_FACTUAL_ORIGIN_UNVERIFIED', 'RIGHTS_ALLOW_REMOVED',
  'RIGHTS_EVIDENCE_REF_SUBSTITUTION', 'RIGHTS_REVIEW_EXPIRY', 'RIGHTS_REVIEW_INTERVAL_EXCEEDED',
  'OBSERVATION_TIME_IN_FUTURE', 'OBSERVATION_EVIDENCE_REF_REMOVAL',
  'AUCTION_RESULT_REFERENCE_PROMOTED_TO_VERIFIED_SOLD_EVENT', 'BID_PRICE_PROMOTED_TO_HAMMER_OR_REALIZED',
  'CLAIM_ALLOWLIST_EXPANSION', 'TOP_16_EMPIRICAL_STATE_FALSE_PROMOTION',
  'REFERENCE_ONLY_EVENT_GENERIC_ROUTER_ADMISSION', 'PUBLIC_PRODUCTION_OR_G5_FALSE_PROMOTION',
];
const expectedWorkflowMutationSteps = [
  'Reject verified-sold and hammer-price promotion', 'Reject each protected output gate promotion',
  'Reject rights removal',
  'Reject contract claim-ceiling promotion', 'Reject claim allowlist expansion',
  'Reject top-16 activation inheritance', 'Reject generic admission of reference-only event',
];

assert(contract.id === 'kidults-asi-state-department-camera-evidence-contract-v1' && contract.version === '1.0.0', 'CONTRACT_ID_VERSION');
assert(contract.status === 'VERIFIED_PASS', 'CONTRACT_STATUS');
assert(same(contract.platform_principles, principles), 'CONTRACT_PLATFORM_PRINCIPLES');
assert(same(contract.required_outputs, expectedOutputs), 'CONTRACT_REQUIRED_OUTPUTS');
assert(contract.effects.autonomous_effect === 'POSITIVE' && contract.effects.global_effect === 'NEUTRAL_WITH_EVIDENCE' &&
  contract.effects.irreplaceable_value_effect === 'POSITIVE' && contract.effects.transparency_effect === 'POSITIVE',
  'CONTRACT_EFFECT_STATES');
assert(contract.source_profile.exact_source_url === observation.source.source_url &&
  contract.source_profile.exact_source_url === observation.source_projection.source_url &&
  contract.source_profile.exact_auction_id === observation.source_projection.auction_id &&
  contract.source_profile.exact_lot_uuid === observation.source_projection.lot_uuid,
  'CONTRACT_EXACT_OFFICIAL_LOT_BINDING');
assert(contract.source_profile.exact_source_facts.auction_close_at === observation.source_projection.auction_close_at &&
  contract.source_profile.exact_source_facts.terminal_display_amount === observation.source_projection.terminal_display_amount &&
  contract.source_profile.exact_source_facts.currency === observation.source_projection.currency &&
  contract.source_profile.exact_source_facts.bid_count === observation.source_projection.bid_count,
  'CONTRACT_EXACT_SOURCE_FACT_BINDING');
assert(contract.rights_policy.maximum_review_interval_days === 30, 'CONTRACT_RIGHTS_REVIEW_INTERVAL');
assert(contract.authoritative_inputs.observation_projection_sha256 === observation.projection_sha256, 'CONTRACT_OBSERVATION_DIGEST_BINDING');
assert(contract.source_profile.source_id === 'us-state-department-online-auction' &&
  contract.source_profile.canonical_host === 'online-auction.state.gov' &&
  contract.source_profile.source_owner_id === 'us-department-of-state' &&
  contract.source_profile.factual_origin_id === 'us-department-of-state-online-auction', 'CONTRACT_SOURCE_IDENTITY');
assert(contract.source_profile.registered_top_16_source_profile === false &&
  contract.source_profile.adapter_state === 'EXACT_PROJECTION_REFERENCE_VALIDATOR_ACTIVE' &&
  contract.source_profile.activation_scope === 'EXACT_DIGEST_BOUND_AUCTION_RESULT_REFERENCE_ONLY' &&
  contract.source_profile.live_generalized_fetch_activated === false, 'CONTRACT_ACTIVATION_SCOPE');
assert(contract.rights_policy.decision === 'POLICY_AND_EVIDENCE_PREFLIGHT_PASS_ALLOW_FACTUAL_FIELDS_ONLY' &&
  contract.rights_policy.legal_conclusion_asserted === false &&
  contract.rights_policy.independent_legal_review_complete === false &&
  contract.rights_policy.raw_html_storage_or_publication_allowed === false &&
  contract.rights_policy.image_or_graphic_storage_or_publication_allowed === false &&
  contract.rights_policy.normalized_factual_field_collect_store_internal_derive === 'ALLOW' &&
  contract.rights_policy.public_display_redistribution_or_sale === 'HOLD', 'CONTRACT_RIGHTS_BOUNDARY');
assert(contract.admission_target.evidence_class === 'AUCTION_RESULT_REFERENCE' &&
  contract.admission_target.event_state === 'SOLD' && contract.admission_target.price_type === 'BID' &&
  contract.admission_target.scope_id === 'cameras_lenses' &&
  contract.admission_target.maximum_admitted_evidence_records === 1 &&
  contract.admission_target.maximum_market_event_references === 1 &&
  contract.admission_target.verified_sold_event_allowed === false &&
  contract.admission_target.current_price_allowed === false &&
  contract.admission_target.liquidity_or_time_to_sale_allowed === false, 'CONTRACT_ADMISSION_CEILING');
assert(same(contract.claim_ceiling.allowed, requiredAllowedClaims), 'CONTRACT_ALLOWED_CLAIMS');
assert(same(contract.claim_ceiling.forbidden, requiredForbiddenClaims), 'CONTRACT_FORBIDDEN_CLAIMS');
assert(same(contract.required_adapter_mutation_cases, expectedAdapterMutationCases), 'CONTRACT_ADAPTER_MUTATION_CASES');
assert(same(contract.required_mutation_families, expectedMutationFamilies), 'CONTRACT_MUTATION_FAMILIES');
assert(same(contract.required_workflow_mutation_steps, expectedWorkflowMutationSteps), 'CONTRACT_WORKFLOW_MUTATION_STEPS');
assert(contract.canonical_coverage_crosswalk.current_scope_id === 'cameras_lenses' &&
  contract.canonical_coverage_crosswalk.legacy_scope_id === 'scope-cameras-lenses' &&
  contract.canonical_coverage_crosswalk.domain_id === 'technology_cameras' &&
  contract.canonical_coverage_crosswalk.source_region === 'QA' &&
  contract.canonical_coverage_crosswalk.current_192_mission_id === null &&
  contract.canonical_coverage_crosswalk.join_state === 'OUTSIDE_CURRENT_192_REGION_AND_EVIDENCE_CLASS_GRAIN_FALLBACK_REFERENCE_ONLY',
  'CONTRACT_CANONICAL_COVERAGE_CROSSWALK');
const authoritativeScopeCrosswalk = scopeRegistryCrosswalk.records?.find((record) =>
  record.legacy_scope_id === contract.canonical_coverage_crosswalk.legacy_scope_id);
const authoritativeScope = scopeRequirementMatrix.scopes?.find((scope) =>
  scope.scope_id === contract.canonical_coverage_crosswalk.current_scope_id);
assert(scopeRegistryCrosswalk.status === 'ACTIVE_CANONICAL_MIGRATION_GATE' &&
  authoritativeScopeCrosswalk?.migration_type === 'ONE_TO_ONE' &&
  same(authoritativeScopeCrosswalk.target_scope_ids, [contract.canonical_coverage_crosswalk.current_scope_id]),
  'AUTHORITATIVE_SCOPE_CROSSWALK');
assert(scopeRequirementMatrix.status === 'CANDIDATE_FOR_CANONICAL' &&
  authoritativeScope?.domain === contract.canonical_coverage_crosswalk.domain_id &&
  same(authoritativeScope?.regions, contract.canonical_coverage_crosswalk.current_192_mission_regions) &&
  !authoritativeScope.regions.includes(contract.canonical_coverage_crosswalk.source_region),
  'AUTHORITATIVE_SCOPE_REQUIREMENT_MATRIX');
assert(contract.truth_boundary.bounded_primary_source_fact_projections_validated === 1 &&
  contract.truth_boundary.auction_result_reference_evidence_admitted === 1 &&
  contract.truth_boundary.market_event_references_created === 1 &&
  contract.truth_boundary.exact_projection_reference_validators_active === 1 &&
  contract.truth_boundary.source_specific_fallback_live_adapters_activated === 0 &&
  contract.truth_boundary.generic_market_events_admitted === 0 &&
  contract.truth_boundary.generic_market_router_rejection_verified === true &&
  contract.truth_boundary.generic_admitted_wrapper_bypass_rejection_verified === true &&
  contract.truth_boundary.reference_signal_eligible === false && contract.truth_boundary.reference_index_eligible === false &&
  contract.truth_boundary.raw_live_source_snapshot_verified === false &&
  contract.truth_boundary.source_updated_at_verified === false &&
  contract.truth_boundary.historical_event_freshness_state === 'NOT_VERIFIED' &&
  contract.truth_boundary.verified_sold_events_created === 0 &&
  contract.truth_boundary.top_16_source_adapters_activated === 0 &&
  contract.truth_boundary.top_16_evidence_admitted === 0 &&
  contract.truth_boundary.current_192_missions_closed === 0 &&
  contract.truth_boundary.current_prices_created === 0 && contract.truth_boundary.liquidity_measures_created === 0 &&
  contract.truth_boundary.snapshot_candidates_created === 0 && contract.truth_boundary.track_b_input_pairs_created === 0 &&
  contract.truth_boundary.public_release === 'HOLD' && contract.truth_boundary.production === 'HOLD' &&
  contract.truth_boundary.g5 === 'HOLD', 'CONTRACT_TRUTH_BOUNDARY');

assert(observation.id === 'kidults-state-department-camera-auction-observation-v1' && observation.state === 'VERIFIED_PASS', 'OBSERVATION_ID_STATE');
assert(hashValue(observation.source_projection) === observation.projection_sha256, 'OBSERVATION_PROJECTION_DIGEST');
assert(observation.source.source_id === contract.source_profile.source_id &&
  observation.source.canonical_host === contract.source_profile.canonical_host &&
  observation.source.source_owner_id === contract.source_profile.source_owner_id &&
  observation.source.factual_origin_id === contract.source_profile.factual_origin_id &&
  observation.source.source_url === observation.source_projection.source_url, 'OBSERVATION_SOURCE_BINDING');
assert(observation.rights.decision === contract.rights_policy.decision &&
  observation.rights.legal_conclusion_asserted === contract.rights_policy.legal_conclusion_asserted &&
  observation.rights.independent_legal_review_complete === contract.rights_policy.independent_legal_review_complete &&
  observation.rights.collect === 'ALLOW' && observation.rights.store === 'ALLOW' && observation.rights.transform === 'ALLOW' &&
  observation.rights.display === 'UNKNOWN' && observation.rights.redistribute === 'UNKNOWN' && observation.rights.sell === 'UNKNOWN' &&
  same(observation.rights.evidence_refs, contract.rights_policy.evidence_refs), 'OBSERVATION_RIGHTS_BINDING');
assert(Number.isFinite(Date.parse(observation.rights.review_due_at)) && Date.parse(observation.rights.review_due_at) > Date.now(),
  'OBSERVATION_RIGHTS_REVIEW_EXPIRED');
assert(observation.source_projection.scope_id === contract.canonical_coverage_crosswalk.current_scope_id &&
  observation.source_projection.legacy_scope_id === contract.canonical_coverage_crosswalk.legacy_scope_id &&
  observation.source_projection.domain_id === contract.canonical_coverage_crosswalk.domain_id, 'OBSERVATION_SCOPE_CROSSWALK');
assert(observation.semantic_boundary.admissible_evidence_class === 'AUCTION_RESULT_REFERENCE' &&
  observation.semantic_boundary.verified_sold_event === false && observation.semantic_boundary.hammer_price_confirmed === false &&
  observation.semantic_boundary.settlement_confirmed === false && observation.semantic_boundary.current_price === false &&
  observation.semantic_boundary.liquidity_or_time_to_sale === false, 'OBSERVATION_SEMANTIC_BOUNDARY');
assert(testReceipt.id === 'kidults-state-department-online-auction-adapter-test-receipt-v1' &&
  testReceipt.state === 'VERIFIED_PASS' && testReceipt.source_projection_sha256 === observation.projection_sha256 &&
  testReceipt.deterministic_replays_verified === 1 && testReceipt.positive_primary_source_fact_projections_parsed === 1 &&
  testReceipt.negative_mutations_rejected === expectedAdapterMutationCases.length &&
  same(testReceipt.mutation_results.map((result) => result.name), expectedAdapterMutationCases) &&
  testReceipt.network_requests_executed_by_test === 0 &&
  testReceipt.evidence_admitted_by_parser === 0 && testReceipt.market_events_created_by_parser === 0 &&
  testReceipt.verified_sold_events_created === 0, 'ADAPTER_TEST_RECEIPT');

const adapter = testReceipt.adapter_result;
assert(adapter?.decision_state === 'NORMALIZED_REFERENCE_READY_FOR_ADMISSION_GATE' &&
  adapter?.adapter_state === 'EXACT_PROJECTION_REFERENCE_VALIDATOR_ACTIVE' && adapter?.field_purpose_rights_preflight_pass === true &&
  adapter?.source_owner_verified === true && adapter?.factual_origin_verified === true &&
  adapter?.bounded_primary_source_fact_projection_validated === true && adapter?.raw_live_source_snapshot_verified === false &&
  adapter?.evidence_admitted === false && adapter?.market_event_created === false, 'ADAPTER_GATE_INPUT');
const reference = adapter.normalized_reference;
assert(reference?.evidence_class === 'AUCTION_RESULT_REFERENCE' && reference?.event_state === 'SOLD' &&
  reference?.price_type === 'BID' && reference?.terminal_display_amount === 2110 && reference?.currency === 'QAR' &&
  reference?.scope_id === 'cameras_lenses' && reference?.legacy_scope_id === 'scope-cameras-lenses' &&
  reference?.domain_id === 'technology_cameras' && reference?.input_projection_ref === observation.projection_sha256 &&
  reference?.source_projection_hash === observation.projection_sha256 &&
  reference?.verified_sold_event === false && reference?.current_price_eligible === false &&
  reference?.liquidity_eligible === false && reference?.customer_claim_authorized === false, 'REFERENCE_CLAIM_CEILING');

const evidenceId = canonicalId('evidence', {
  source_id: reference.source_id,
  source_record_id: reference.source_record_id,
  projection_sha256: reference.input_projection_ref,
  evidence_class: reference.evidence_class,
});
const marketEventId = canonicalId('market-event', {
  evidence_id: evidenceId,
  source_event_id: reference.source_event_id,
  source_lot_id: reference.source_lot_id,
  event_at: reference.event_at,
  price_type: reference.price_type,
  amount: reference.terminal_display_amount,
  currency: reference.currency,
});
const admissionReceiptId = canonicalId('evidence-admission-receipt', {
  evidence_id: evidenceId,
  contract_id: contract.id,
  contract_digest: hashValue(contract),
  rights_policy: contract.rights_policy,
  claim_ceiling: contract.claim_ceiling,
});
const rightsReceiptId = canonicalId('rights-preflight-receipt', {
  source_id: reference.source_id,
  projection_sha256: reference.input_projection_ref,
  rights_policy: contract.rights_policy,
  observation_rights: observation.rights,
});

const evidenceRecord = {
  evidence_id: evidenceId,
  evidence_admission_receipt_id: admissionReceiptId,
  admission_state: 'ADMITTED_REFERENCE_ONLY_UNVERIFIED_RAW_SOURCE_SNAPSHOT',
  evidence_class: 'OBSERVED_PRIMARY_SOURCE_AUCTION_RESULT_REFERENCE',
  source_id: reference.source_id,
  source_record_id: reference.source_record_id,
  source_url: observation.source.source_url,
  source_owner_id: reference.source_owner_id,
  source_owner_verified: true,
  factual_origin_id: reference.factual_origin_id,
  factual_origin_verified: true,
  scope_id: reference.scope_id,
  legacy_scope_id: reference.legacy_scope_id,
  domain_id: reference.domain_id,
  title: reference.title,
  object_identifiers: reference.object_identifiers,
  camera_quantity: reference.camera_quantity,
  lot_quantity: reference.lot_quantity,
  condition: reference.condition,
  event_state: reference.event_state,
  event_at: reference.event_at,
  observed_at: reference.observed_at,
  price_observation: {
    price_type: reference.price_type,
    amount: reference.terminal_display_amount,
    currency: reference.currency,
    bid_count: reference.bid_count,
    price_role: reference.price_role,
  },
  rights: {
    state: 'POLICY_AND_EVIDENCE_PREFLIGHT_PASS',
    collect: 'ALLOW',
    store: 'ALLOW',
    transform: 'ALLOW',
    display: 'UNKNOWN',
    redistribute: 'UNKNOWN',
    sell: 'UNKNOWN',
    rights_receipt_id: rightsReceiptId,
    review_due_at: observation.rights.review_due_at,
    legal_conclusion_asserted: false,
    independent_legal_review_complete: false,
    evidence_refs: reference.field_purpose_rights_refs,
  },
  provenance: {
    projection_sha256: reference.input_projection_ref,
    raw_live_source_snapshot_verified: false,
    lineage_digest_role: 'NORMALIZED_SOURCE_PROJECTION_DIGEST_NOT_RAW_SOURCE_PAYLOAD',
    source_schema_version: reference.source_schema_version,
    source_event_id: reference.source_event_id,
    source_lot_id: reference.source_lot_id,
    lot_number: reference.lot_number,
    provenance_refs: reference.provenance_refs,
  },
  claim_ceiling: contract.claim_ceiling,
  verified_sold_event: false,
  hammer_price_confirmed: false,
  settlement_confirmed: false,
  current_price_eligible: false,
  liquidity_eligible: false,
  collector_market_representativeness_verified: false,
  customer_claim_authorized: false,
  reference_only: true,
  signal_eligible: false,
  index_eligible: false,
  current_192_mission_id: null,
  current_192_join_state: contract.canonical_coverage_crosswalk.join_state,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};

const event = {
  schema_version: 'market-event-v1',
  market_event_id: marketEventId,
  evidence_class: 'AUCTION_RESULT_REFERENCE',
  event_state: 'SOLD',
  source_event_id: reference.source_event_id,
  source_listing_id: null,
  source_lot_id: reference.source_lot_id,
  market_cell_id: 'cameras_lenses::QA::AUCTION_RESULT_REFERENCE',
  market_cell_dimensions: {
    canonical_product_or_edition: 'Nikon D5600 and Nikon D90 mixed camera lot',
    variant: 'one lot containing two camera bodies',
    condition_or_grade: 'Usable (source asserted)',
    region: 'QA',
    channel: 'US_STATE_DEPARTMENT_ONLINE_AUCTION',
    sale_mechanism: 'AUCTION',
    currency_basis: 'QAR',
    observation_window: {
      window_start: reference.event_at,
      window_end: reference.event_at,
      timezone: 'UTC',
    },
  },
  canonical_entity_id: reference.canonical_entity_id,
  physical_object_id: reference.physical_object_id,
  lot_id: reference.lot_number,
  relist_parent_event_id: null,
  cross_list_group_id: null,
  linked_sale_event_id: null,
  duration_seconds: null,
  listing_start: null,
  region: reference.region,
  venue_id: reference.venue_id,
  sale_mechanism: 'AUCTION',
  first_seen_at: null,
  listed_at: null,
  event_at: reference.event_at,
  terminal_at: reference.event_at,
  observed_at: reference.observed_at,
  collected_at: reference.observed_at,
  source_updated_at: null,
  quantity: reference.lot_quantity,
  condition_grade: {
    condition_state: reference.condition,
    grade: null,
    grader: 'U.S. Department of State source assertion',
    authenticity_state: 'UNKNOWN',
    provenance_ref: observation.source.source_url,
  },
  price: {
    price_type: 'BID',
    amount: reference.terminal_display_amount,
    currency: reference.currency,
    buyer_premium_included: null,
    tax_included: null,
    shipping_included: null,
    fx_source: null,
    fx_date: null,
    accepted_offer_disclosure: 'NOT_APPLICABLE',
  },
  rights: {
    collect: 'ALLOW',
    store: 'ALLOW',
    transform: 'ALLOW',
    display: 'UNKNOWN',
    redistribute: 'UNKNOWN',
    sell: 'UNKNOWN',
    terms_url: 'https://www.state.gov/copyright-information',
    terms_version: 'observed-2026-08-24',
    review_due_at: observation.rights.review_due_at,
    field_bindings: [
      '/canonical_entity_id', '/condition_grade/condition_state', '/event_at', '/event_state', '/price/amount',
      '/price/currency', '/quantity', '/source_lot_id',
    ].map((field_path) => ({ field_path, output_class: 'INTERNAL_ANALYSIS', admission_state: 'ALLOW' })),
  },
  freshness: {
    state: 'NOT_VERIFIED',
    ttl_seconds: null,
    window_start: null,
    window_end: null,
    watermark_at: null,
    next_due_at: null,
    stale_reason: 'HISTORICAL_EVENT_OBSERVED_LATER_WITHOUT_VERIFIED_SOURCE_UPDATE_TIMESTAMP_OR_IMMUTABLE_RAW_CAPTURE',
  },
  lineage: {
    evidence_id: evidenceId,
    source_family_id: 'us-department-of-state-online-auction',
    raw_digest: reference.source_projection_hash,
    normalized_digest: null,
    parser_version: 'state-department-online-auction-fact-projection-v1',
    transform_version: 'kidults-state-department-camera-evidence-v1',
  },
  missingness: {
    reason: 'NOT_COLLECTED_BY_DESIGN',
    coverage_numerator: 12,
    coverage_denominator: 18,
    imputation_policy: 'NONE',
    field_states: [
      '/condition_grade/grade', '/condition_grade/authenticity_state', '/price/buyer_premium_included',
      '/price/tax_included', '/price/shipping_included', '/settlement_confirmation',
    ].map((field_path) => ({ field_path, reason: 'NOT_COLLECTED_BY_DESIGN' })),
  },
};
event.lineage.normalized_digest = hashValue({ ...event, lineage: { ...event.lineage, normalized_digest: null } });

const evidenceLedger = {
  id: 'kidults-state-department-camera-evidence-ledger-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  as_of: observation.as_of,
  platform_principles: principles,
  source_id: reference.source_id,
  source_owner_id: reference.source_owner_id,
  factual_origin_id: reference.factual_origin_id,
  admitted_evidence_count: 1,
  auction_result_reference_count: 1,
  verified_sold_event_count: 0,
  records: [evidenceRecord],
  top_16_evidence_admitted: 0,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};
const marketEventLedger = {
  id: 'kidults-state-department-camera-market-event-ledger-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  as_of: observation.as_of,
  admitted_market_event_references: 1,
  generic_market_events_admitted: 0,
  verified_sold_events: 0,
  current_price_events: 0,
  liquidity_events: 0,
  reference_only: true,
  signal_eligible: false,
  index_eligible: false,
  raw_live_source_snapshot_verified: false,
  lineage_raw_digest_role: 'NORMALIZED_SOURCE_PROJECTION_DIGEST_NOT_RAW_SOURCE_PAYLOAD',
  reference_events: [event],
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};
const claimCeilingReceipt = {
  id: 'kidults-state-department-camera-claim-ceiling-receipt-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  as_of: observation.as_of,
  evidence_id: evidenceId,
  market_event_id: marketEventId,
  admission_receipt_id: admissionReceiptId,
  rights_receipt_id: rightsReceiptId,
  evidence_class: 'AUCTION_RESULT_REFERENCE',
  price_type: 'BID',
  allowed_claims: contract.claim_ceiling.allowed,
  forbidden_claims: contract.claim_ceiling.forbidden,
  verified_sold_event: false,
  hammer_price_confirmed: false,
  settlement_confirmed: false,
  current_price_eligible: false,
  liquidity_eligible: false,
  collector_market_representativeness_verified: false,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};

await fs.mkdir(outputDir, { recursive: true });
const writeOutput = async (name, value) => {
  const content = stableJson(value);
  await fs.writeFile(path.join(outputDir, name), content);
  return { name, sha256: hashText(content), bytes: Buffer.byteLength(content) };
};
const outputs = [];
outputs.push(await writeOutput(expectedOutputs[0], evidenceLedger));
outputs.push(await writeOutput(expectedOutputs[1], marketEventLedger));
outputs.push(await writeOutput(expectedOutputs[2], claimCeilingReceipt));
const outputManifest = {
  id: 'kidults-state-department-camera-evidence-manifest-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  as_of: observation.as_of,
  platform_principles: principles,
  source_binding: {
    source_id: reference.source_id,
    source_url: observation.source.source_url,
    source_owner_id: reference.source_owner_id,
    factual_origin_id: reference.factual_origin_id,
    source_projection_sha256: reference.input_projection_ref,
    source_schema_version: reference.source_schema_version,
  },
  results: {
    bounded_primary_source_fact_projections_validated: 1,
    exact_projection_reference_validators_active: 1,
    fallback_live_adapters_activated: 0,
    field_purpose_rights_preflight_pass_sources: 1,
    auction_result_reference_evidence_admitted: 1,
    market_event_references_created: 1,
    generic_market_events_admitted: 0,
    generic_market_router_rejection_verified: true,
    generic_admitted_wrapper_bypass_rejection_verified: true,
    reference_signal_eligible: false,
    reference_index_eligible: false,
    raw_live_source_snapshot_verified: false,
    source_updated_at_verified: false,
    historical_event_freshness_state: 'NOT_VERIFIED',
    verified_sold_events_created: 0,
    top_16_source_adapters_activated: 0,
    top_16_evidence_admitted: 0,
    current_192_missions_closed: 0,
    confirmed_hammer_prices_created: 0,
    current_prices_created: 0,
    liquidity_measures_created: 0,
    snapshot_candidates_created: 0,
    track_b_input_pairs_created: 0,
  },
  output_files: outputs,
  autonomous_effect: 'POSITIVE',
  global_effect: 'NEUTRAL_WITH_EVIDENCE',
  irreplaceable_value_effect: 'POSITIVE',
  transparency_effect: 'POSITIVE',
  principle_effect_evidence: {
    autonomous: 'Exact-projection validation, scheduled expiry enforcement and deterministic rebuild execute automatically.',
    global: 'One Qatar government-surplus reference is recorded but remains outside the current 192-region/evidence-class grain and is not global market evidence.',
    irreplaceable_value: 'KIDULTS owns the rights, scope crosswalk, provenance role, reference routing and claim-ceiling controls.',
    transparent: 'Reference, generic event, verified-sold, freshness, raw-capture, signal and index states are reported separately.',
  },
  next_action: 'Acquire explicit hammer or all-in realized semantics from a rights-cleared collector-market source or activate one of the current top 16 sources.',
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};
outputs.push(await writeOutput(expectedOutputs[3], outputManifest));

console.log(JSON.stringify({
  id: 'kidults-state-department-camera-evidence-build-receipt-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  source_id: reference.source_id,
  source_projection_sha256: reference.input_projection_ref,
  evidence_id: evidenceId,
  market_event_id: marketEventId,
  auction_result_reference_evidence_admitted: 1,
  market_event_references_created: 1,
  generic_market_events_admitted: 0,
  verified_sold_events_created: 0,
  top_16_evidence_admitted: 0,
  current_192_missions_closed: 0,
  current_prices_created: 0,
  liquidity_measures_created: 0,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
