import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseJsonNoDuplicateKeys} from './parse-json-no-duplicate-keys.mjs';

const [
  planPath,
  samplingPath,
  serializedCapacityPath,
  variantCapacityPath,
  vehicleCapacityPath,
  gradedCapacityPath
] = process.argv.slice(2);

if (!planPath || !samplingPath || !serializedCapacityPath || !variantCapacityPath || !vehicleCapacityPath || !gradedCapacityPath) {
  throw new Error('usage: validate-empirical-acquisition-wave1-r1.mjs <wave1.json> <sampling.json> <serialized-capacity.json> <variant-capacity.json> <vehicle-capacity.json> <graded-capacity.json>');
}

const [plan, sampling, serializedCapacity, variantCapacity, vehicleCapacity, gradedCapacity] = await Promise.all(
  [planPath, samplingPath, serializedCapacityPath, variantCapacityPath, vehicleCapacityPath, gradedCapacityPath]
    .map(async filePath => parseJsonNoDuplicateKeys(await fs.readFile(filePath, 'utf8'), filePath))
);
const FROZEN_PLAN_CANONICAL_SHA256 = 'sha256:47bad2b1e9da81e21a0a1729a6edfce8481c1229c69cda49f8582010030fe7de';
const canonical = (value) => Array.isArray(value) ? value.map(canonical) :
  (value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value);
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;

const sameKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

function rejectUnsanctionedClaims(value, path = []) {
  if (!value || typeof value !== 'object') return;
  const forbidden = new Set([
    'expected', 'label', 'labels', 'reviewer', 'reviewers', 'model_prediction',
    'ground_truth', 'attestation', 'labels_collected', 'reviewers_assigned',
    'reviewer_a', 'reviewer_b', 'empirical_attestation_created', 'empirical_cases_created',
    'human_review_assignment_created', 'independent_reviewers_assigned',
    'independent_label_review_complete', 'blind_holdout_sealed', 'empirical_benchmark_ready',
    'track_b_started', 'release_authority', 'publication', 'production',
    'market_claims_created', 'spend_authorized', 'ground_truth_created',
    'identity_conclusion', 'identity_decision', 'physical_identity_conclusion',
    'labels_created', 'human_reviewer', 'human_reviewers', 'review_complete',
  ]);
  const sanctioned = new Set([
    'parallel_execution.labels_collected',
    'parallel_execution.reviewer_a',
    'parallel_execution.reviewer_b',
    'parallel_execution.empirical_attestation_created',
    'parallel_execution.track_b_started',
    'production',
  ]);
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    const pathText = nextPath.join('.');
    if (forbidden.has(key) && !sanctioned.has(pathText)) {
      throw new Error(`UNSANCTIONED_LABEL_REVIEW_OR_ATTESTATION_FIELD:${pathText}`);
    }
    rejectUnsanctionedClaims(child, nextPath);
  }
}

if (plan.id !== 'kidults-er-empirical-acquisition-wave1-r1') throw new Error('WAVE1_ID_INVALID');
if (digest(plan) !== FROZEN_PLAN_CANONICAL_SHA256) throw new Error('FROZEN_WAVE1_PLAN_CANONICAL_MISMATCH');
if (plan.version !== '1.7.0') throw new Error('WAVE1_VERSION_INVALID');
if (!sameKeys(plan, ['id', 'version', 'parent_issue', 'sampling_plan', 'status', 'production', 'public_release',
  'truth_boundary', 'operating_target', 'lanes', 'parallel_execution'])) throw new Error('WAVE1_TOP_LEVEL_SCHEMA_INVALID');
if (!sameKeys(plan.parallel_execution, ['start_ready_case_capacity', 'blocked_or_conditional_case_capacity',
  'review_packet_contract_merged', 'reviewer_a', 'reviewer_b', 'labels_collected', 'blind_partition_sealed',
  'empirical_attestation_created', 'track_b_started'])) throw new Error('WAVE1_PARALLEL_EXECUTION_SCHEMA_INVALID');
rejectUnsanctionedClaims(plan);
if (plan.status !== 'ACTIVE_PARTIAL_ACQUISITION') throw new Error('WAVE1_STATUS_INVALID');
if (plan.production !== 'HOLD' || plan.public_release !== 'HOLD') throw new Error('WAVE1_RELEASE_BOUNDARY_REQUIRED');
if (sampling.dataset_target?.total_cases !== 840 || sampling.dataset_target?.blind_holdout_cases !== 420) throw new Error('SAMPLING_840_420_REQUIRED');
if (plan.operating_target?.total_cases !== 840 || plan.operating_target?.blind_holdout !== 420 ||
    plan.operating_target?.per_stratum !== 120 || plan.operating_target?.per_stratum_blind !== 60) {
  throw new Error('WAVE1_TARGET_MISMATCH');
}
if (!Array.isArray(plan.lanes) || plan.lanes.length !== 7) throw new Error('SEVEN_LANES_REQUIRED');

const sampleIds = new Set((sampling.strata || []).map(item => item.stratum_id));
const requiredLaneIds = [
  'er-stratum-designer-maker-edition',
  'er-stratum-graded-population',
  'er-stratum-pressing-edition-media',
  'er-stratum-provenance-unique-object',
  'er-stratum-serialized-reference',
  'er-stratum-variant-release-heavy',
  'er-stratum-vehicle-mechanical-asset',
];
const laneIds = plan.lanes.map((lane) => lane.stratum_id);
if (new Set(laneIds).size !== requiredLaneIds.length ||
    JSON.stringify([...laneIds].sort()) !== JSON.stringify([...requiredLaneIds].sort())) {
  throw new Error('EXACT_UNIQUE_SEVEN_LANES_REQUIRED');
}
for (const lane of plan.lanes) {
  const expectedLaneKeys = ['stratum_id', 'target_cases', 'state', 'source_families', 'rule'];
  if (Object.hasOwn(lane, 'capacity_evidence')) expectedLaneKeys.push('capacity_evidence', 'observed_capacity');
  if (Object.hasOwn(lane, 'blocker')) expectedLaneKeys.push('blocker');
  if (!sameKeys(lane, expectedLaneKeys)) throw new Error(`WAVE1_LANE_SCHEMA_INVALID:${lane.stratum_id}`);
  if (!sampleIds.has(lane.stratum_id)) throw new Error(`UNKNOWN_STRATUM:${lane.stratum_id}`);
  if (lane.target_cases !== 120) throw new Error(`TARGET_120_REQUIRED:${lane.stratum_id}`);
}

const readyCapacity = plan.lanes
  .filter(lane => lane.state === 'START_READY')
  .reduce((total, lane) => total + lane.target_cases, 0);
const blockedCapacity = plan.lanes
  .filter(lane => lane.state !== 'START_READY')
  .reduce((total, lane) => total + lane.target_cases, 0);
if (readyCapacity + blockedCapacity !== 840 ||
    plan.parallel_execution?.start_ready_case_capacity !== readyCapacity ||
    plan.parallel_execution?.blocked_or_conditional_case_capacity !== blockedCapacity) {
  throw new Error('DERIVED_CAPACITY_TRUTH_MISMATCH');
}

const pressing = plan.lanes.find(lane => lane.stratum_id === 'er-stratum-pressing-edition-media');
if (!pressing || pressing.state !== 'START_READY' ||
    !pressing.source_families.includes('musicbrainz-core-database-dump-cc0') ||
    !pressing.rule.includes('exclude supplementary/derived data')) {
  throw new Error('MUSICBRAINZ_CC0_CORE_BOUNDARY_REQUIRED');
}

const serialized = plan.lanes.find(lane => lane.stratum_id === 'er-stratum-serialized-reference');
if (serializedCapacity.id !== 'kidults-er-serialized-reference-live-capacity-r1' ||
    serializedCapacity.stratum_id !== serialized?.stratum_id) {
  throw new Error('SERIALIZED_CAPACITY_ARTIFACT_BINDING_REQUIRED');
}
if (serialized.capacity_evidence !== 'coordination/kidults/entity-resolution/serialized-reference-capacity-probe-r1.json') {
  throw new Error('SERIALIZED_CAPACITY_EVIDENCE_PATH_REQUIRED');
}
const serializedReady = serializedCapacity.readiness_gate?.source_capacity_ready_for_120_cases === true;
if (serialized.state !== (serializedReady ? 'START_READY' : 'SOURCE_FIT_REVALIDATION_REQUIRED')) {
  throw new Error('SERIALIZED_LANE_STATE_MUST_FOLLOW_CAPACITY_EVIDENCE');
}
if (!serialized.source_families.includes('wikidata-cc0-p2598-p217-strict-capacity-probe')) {
  throw new Error('SERIALIZED_STRICT_SOURCE_FAMILY_REQUIRED');
}
if (!serialized.rule.includes('P2598') || !serialized.rule.includes('P217') || !serialized.rule.includes('P195') ||
    !serialized.rule.includes('Met accessionNumber alone contributes zero capacity')) {
  throw new Error('SERIALIZED_STRICT_GRAMMAR_AND_MET_EXCLUSION_REQUIRED');
}
const serializedMetrics = serializedCapacity.metrics;
if (serialized.observed_capacity?.grammar_complete_real_records !== serializedMetrics?.grammar_complete_real_record_count ||
    serialized.observed_capacity?.cross_authority_alias_pairs !== serializedMetrics?.cross_authority_alias_pair_count ||
    serialized.observed_capacity?.same_model_distinct_serial_hard_negative_pairs !== serializedMetrics?.same_model_distinct_serial_hard_negative_pair_count ||
    serialized.observed_capacity?.conservative_case_capacity !== serializedMetrics?.conservative_case_capacity ||
    serialized.observed_capacity?.source_capacity_ready_for_120_cases !== serializedReady) {
  throw new Error('SERIALIZED_OBSERVED_CAPACITY_SYNC_REQUIRED');
}
if (!serializedReady &&
    (!serialized.blocker?.includes('STRICT_GRAMMAR_COMPLETE_REAL_RECORDS_7_OF_120') ||
     !serialized.blocker.includes('Met accessionNumber alone is not a manufacturer serial or product reference'))) {
  throw new Error('SERIALIZED_INSUFFICIENT_CAPACITY_MUST_FAIL_CLOSED');
}

const variant = plan.lanes.find(lane => lane.stratum_id === 'er-stratum-variant-release-heavy');
if (variantCapacity.id !== 'kidults-er-variant-release-heavy-live-capacity-r1' ||
    variantCapacity.stratum_id !== variant?.stratum_id) {
  throw new Error('VARIANT_CAPACITY_ARTIFACT_BINDING_REQUIRED');
}
if (variant.capacity_evidence !== 'coordination/kidults/entity-resolution/variant-release-heavy-capacity-probe-r1.json') {
  throw new Error('VARIANT_CAPACITY_EVIDENCE_PATH_REQUIRED');
}
if (!variant.source_families.includes('wikidata-cc0-fashion-product-model-strict-capacity-probe')) {
  throw new Error('VARIANT_STRICT_SOURCE_FAMILY_REQUIRED');
}
const variantReady = variantCapacity.readiness_gate?.source_capacity_ready_for_120_cases === true;
if (variant.state !== (variantReady ? 'START_READY' : 'SOURCE_FIT_REVALIDATION_REQUIRED')) {
  throw new Error('VARIANT_LANE_STATE_MUST_FOLLOW_CAPACITY_EVIDENCE');
}
if (!variant.rule.includes('P176') || !variant.rule.includes('P1716') || !variant.rule.includes('P13351') ||
    !variant.rule.includes('P462') || !variant.rule.includes('P186') || !variant.rule.includes('P3962') ||
    !variant.rule.includes('do not infer variant identity') || !variant.rule.includes('marketplace')) {
  throw new Error('VARIANT_STRICT_GRAMMAR_AND_EXCLUSIONS_REQUIRED');
}
const variantMetrics = variantCapacity.metrics;
if (variant.observed_capacity?.broad_model_code_candidates !== variantMetrics?.broad_model_code_candidate_count ||
    variant.observed_capacity?.scope_leakage_rejected_items !== variantMetrics?.scope_leakage_rejected_item_count ||
    variant.observed_capacity?.grammar_complete_collectibles_records !== variantMetrics?.grammar_complete_collectibles_record_count ||
    variant.observed_capacity?.same_object_normalization_candidates !== variantMetrics?.same_object_normalization_candidate_count ||
    variant.observed_capacity?.explicit_variant_hard_negative_candidates !== variantMetrics?.explicit_variant_hard_negative_candidate_count ||
    variant.observed_capacity?.cross_authority_alias_candidates !== variantMetrics?.cross_authority_alias_candidate_count ||
    variant.observed_capacity?.conservative_case_capacity !== variantMetrics?.conservative_case_capacity ||
    variant.observed_capacity?.source_capacity_ready_for_120_cases !== variantReady) {
  throw new Error('VARIANT_OBSERVED_CAPACITY_SYNC_REQUIRED');
}
if (!variantReady &&
    (!variant.blocker?.includes('STRICT_COLLECTIBLES_VARIANT_RECORDS_0_OF_120') ||
     !variant.blocker.includes('SAME_OBJECT_NORMALIZATION_CANDIDATES_0_OF_40') ||
     !variant.blocker.includes('EXPLICIT_VARIANT_HARD_NEGATIVE_CANDIDATES_0_OF_40') ||
     !variant.blocker.includes('CROSS_AUTHORITY_ALIAS_CANDIDATES_0_OF_40') ||
     !variant.blocker.includes('all 3 broad clothing model-code candidates are explicit watch/smartwatch cross-stratum leakage'))) {
  throw new Error('VARIANT_INSUFFICIENT_CAPACITY_MUST_FAIL_CLOSED');
}

const graded = plan.lanes.find(lane => lane.stratum_id === 'er-stratum-graded-population');
if (gradedCapacity.id !== 'kidults-er-graded-population-live-capacity-r1' ||
    gradedCapacity.version !== '1.2.0' || gradedCapacity.stratum_id !== graded?.stratum_id) {
  throw new Error('GRADED_CAPACITY_ARTIFACT_BINDING_REQUIRED');
}
if (graded.capacity_evidence !== 'coordination/kidults/entity-resolution/graded-population-capacity-probe-r1.json') {
  throw new Error('GRADED_CAPACITY_EVIDENCE_PATH_REQUIRED');
}
const gradedReady = gradedCapacity.readiness_gate?.source_capacity_ready_for_120_cases === true;
if (graded.state !== (gradedReady ? 'START_READY' : 'BLOCKED_RIGHTS_AND_SOURCE_FIT')) {
  throw new Error('GRADED_LANE_STATE_MUST_FOLLOW_CAPACITY_EVIDENCE');
}
if (graded.source_families?.length !== 4 ||
    !graded.source_families.includes('pcgs-public-api-bounded-evaluation-zero-capacity') ||
    !graded.source_families.includes('psa-account-eula-bulk-gated-zero-capacity') ||
    !graded.source_families.includes('cgc-manual-terms-review-not-cleared-zero-capacity') ||
    !graded.source_families.includes('wikidata-cc0-graded-collectible-schema-fit-zero-capacity')) {
  throw new Error('GRADED_BOUNDED_SOURCE_AUDIT_FAMILIES_REQUIRED');
}
if (!graded.rule?.includes('P5021 assessment') || !graded.rule.includes('P1082 demographic population') ||
    !graded.rule.includes('blocked providers contribute zero') ||
    !graded.rule.includes('four-property audit is not an exhaustive catalog claim') ||
    !graded.rule.includes('no credentials, scraping, inferred grade/population')) {
  throw new Error('GRADED_STRICT_GRAMMAR_AND_RIGHTS_RULE_REQUIRED');
}
const gradedMetrics = gradedCapacity.metrics;
if (graded.observed_capacity?.candidate_source_families_assessed !== gradedMetrics?.candidate_source_families_assessed ||
    graded.observed_capacity?.rights_compatible_source_families !== gradedMetrics?.rights_compatible_source_family_count ||
    graded.observed_capacity?.rights_and_grammar_fit_source_families !== gradedMetrics?.rights_and_grammar_fit_source_family_count ||
    graded.observed_capacity?.rights_admitted_grammar_complete_real_records !== gradedMetrics?.rights_admitted_grammar_complete_real_record_count ||
    graded.observed_capacity?.same_object_normalization_candidates !== gradedMetrics?.normalization_candidate_capacity ||
    graded.observed_capacity?.hard_negative_pairs !== gradedMetrics?.hard_negative_pair_capacity ||
    graded.observed_capacity?.cross_market_alias_pairs !== gradedMetrics?.cross_registry_alias_pair_capacity ||
    graded.observed_capacity?.source_record_boundary_capacity !== gradedMetrics?.source_record_boundary_capacity ||
    graded.observed_capacity?.physical_object_boundary_capacity !== gradedMetrics?.physical_object_boundary_capacity ||
    graded.observed_capacity?.conservative_case_capacity !== gradedMetrics?.conservative_case_capacity ||
    graded.observed_capacity?.source_capacity_ready_for_120_cases !== gradedReady) {
  throw new Error('GRADED_OBSERVED_CAPACITY_SYNC_REQUIRED');
}
if (!gradedReady &&
    (!graded.blocker?.includes('RIGHTS_ADMITTED_GRADED_POPULATION_RECORDS_0_OF_120') ||
     !graded.blocker.includes('PCGS raw bulk collection is BLOCK') ||
     !graded.blocker.includes('2026-08-19 manual conservative terms review') ||
     !graded.blocker.includes('this probe does not fetch CGC') ||
     !graded.blocker.includes('no exact graded-population mapping was identified in the bounded four-property Wikidata CC0 audit'))) {
  throw new Error('GRADED_ZERO_CAPACITY_MUST_FAIL_CLOSED');
}

const vehicle = plan.lanes.find(lane => lane.stratum_id === 'er-stratum-vehicle-mechanical-asset');
if (vehicleCapacity.id !== 'kidults-er-vehicle-mechanical-asset-live-capacity-r1' ||
    vehicleCapacity.version !== '1.1.0' || vehicleCapacity.stratum_id !== vehicle?.stratum_id) {
  throw new Error('VEHICLE_CAPACITY_ARTIFACT_BINDING_REQUIRED');
}
if (vehicle.capacity_evidence !== 'coordination/kidults/entity-resolution/vehicle-mechanical-asset-capacity-probe-r1.json') {
  throw new Error('VEHICLE_CAPACITY_EVIDENCE_PATH_REQUIRED');
}
const vehicleReady = vehicleCapacity.readiness_gate?.source_capacity_ready_for_120_cases === true;
if (vehicle.state !== (vehicleReady ? 'START_READY' : 'SOURCE_FIT_REVALIDATION_REQUIRED')) {
  throw new Error('VEHICLE_LANE_STATE_MUST_FOLLOW_CAPACITY_EVIDENCE');
}
if (JSON.stringify(vehicle.source_families) !== JSON.stringify(['fr-ministry-culture-pop-palissy-mh-open-data'])) {
  throw new Error('VEHICLE_OFFICIAL_SOURCE_FAMILY_REQUIRED');
}
const vehicleMetrics = vehicleCapacity.metrics;
const expectedVehicleObserved = {
  live_search_total_hit_count: vehicleMetrics?.live_search_total_hit_count,
  live_search_returned_hit_count: vehicleMetrics?.live_search_returned_hit_count,
  strict_grammar_complete_real_record_count: vehicleMetrics?.strict_grammar_complete_real_record_count,
  same_object_normalization_candidate_count: vehicleMetrics?.same_object_normalization_candidate_count,
  hard_negative_candidate_pair_count: vehicleMetrics?.hard_negative_candidate_pair_count,
  same_design_different_object_candidate_pair_count: vehicleMetrics?.same_design_different_object_candidate_pair_count,
  selected_unlabeled_case_candidate_count: vehicleMetrics?.selected_unlabeled_case_candidate_count,
  selected_source_record_count: vehicleMetrics?.selected_source_record_count,
  selected_source_record_reuse_count: vehicleMetrics?.selected_source_record_reuse_count,
  source_record_boundary_candidate_count: vehicleMetrics?.source_record_boundary_candidate_count,
  physical_object_boundary_candidate_count: vehicleMetrics?.physical_object_boundary_candidate_count,
  canonical_design_boundary_candidate_count: vehicleMetrics?.canonical_design_boundary_candidate_count,
  blind_partition_source_record_disjointness_guaranteed: vehicleMetrics?.blind_partition_source_record_disjointness_guaranteed,
  conservative_case_capacity: vehicleMetrics?.conservative_case_capacity,
  nhtsa_vpic_case_capacity: vehicleMetrics?.nhtsa_vpic_case_capacity,
  source_capacity_ready_for_120_cases: vehicleReady
};
if (JSON.stringify(vehicle.observed_capacity) !== JSON.stringify(expectedVehicleObserved)) {
  throw new Error('VEHICLE_OBSERVED_CAPACITY_SYNC_REQUIRED');
}
if (!vehicleReady || vehicleMetrics?.nhtsa_vpic_case_capacity !== 0 ||
    vehicleMetrics?.selected_source_record_count !== 200 ||
    vehicleMetrics?.selected_source_record_reuse_count !== 0 ||
    vehicleMetrics?.source_record_boundary_candidate_count !== 35 ||
    vehicleMetrics?.physical_object_boundary_candidate_count !== 35 ||
    vehicleMetrics?.canonical_design_boundary_candidate_count !== 50 ||
    vehicleMetrics?.blind_partition_source_record_disjointness_guaranteed !== true ||
    vehicleCapacity.source_admission?.nhtsa_vpic_used !== false ||
    vehicleCapacity.source_admission?.nhtsa_vpic_contribution_to_capacity !== 0 ||
    !vehicle.rule.includes('unlabeled and review-required') ||
    !vehicle.rule.includes('200 distinct source records, zero reuse') ||
    !vehicle.rule.includes('SOURCE_RECORD 35 / PHYSICAL_OBJECT 35 / CANONICAL_DESIGN 50') ||
    !vehicle.rule.includes('60-case blind split is source-record disjoint') ||
    !vehicle.rule.includes('exclude images and NHTSA vPIC') ||
    !vehicle.rule.includes('do not infer physical identity') ||
    Object.hasOwn(vehicle, 'blocker')) {
  throw new Error('VEHICLE_READY_UNLABELED_NHTSA_ZERO_BOUNDARY_REQUIRED');
}

if (readyCapacity !== 480 || blockedCapacity !== 360) throw new Error('CURRENT_WAVE1_480_READY_360_BLOCKED_REQUIRED');
if (plan.parallel_execution?.reviewer_a !== 'NOT_ASSIGNED' ||
    plan.parallel_execution?.reviewer_b !== 'NOT_ASSIGNED') {
  throw new Error('REVIEWER_IDENTITY_MUST_NOT_BE_FABRICATED');
}
if (plan.parallel_execution?.labels_collected !== 0 ||
    plan.parallel_execution?.blind_partition_sealed !== false ||
    plan.parallel_execution?.empirical_attestation_created !== false ||
    plan.parallel_execution?.track_b_started !== false) {
  throw new Error('DOWNSTREAM_MUST_REMAIN_BLOCKED');
}

console.log(
  `PASS: Wave 1 has ${readyCapacity} start-ready case targets and fails closed on ${blockedCapacity}; ` +
  'SERIALIZED_REFERENCE, VARIANT_RELEASE_HEAVY, VEHICLE_MECHANICAL_ASSET and GRADED_POPULATION follow exact live capacity evidence.'
);
