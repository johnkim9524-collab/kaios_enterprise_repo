#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  outputDir = '/tmp/kidults-asi-intelligence-preparation-wave-v1',
  contractPath = 'coordination/kidults/source-intelligence/asi-intelligence-preparation-wave-v1.json'
] = process.argv.slice(2);

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const readText = (name) => fs.readFileSync(path.join(outputDir, name), 'utf8');
const readJson = (name) => JSON.parse(readText(name));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const unique = (values) => new Set(values).size === values.length;
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

assert(contract.id === 'kidults-asi-intelligence-preparation-wave-v1', 'CONTRACT_ID');
assert(contract.version === '1.1.0', 'CONTRACT_VERSION');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLE_ORDER');
assert(contract.modules?.length === 8, 'CONTRACT_MODULE_COUNT');
assert(unique(contract.modules.map((module) => module.module_id)), 'CONTRACT_MODULE_DUPLICATE');
assert(JSON.stringify(contract.canonical_execution_order) === JSON.stringify(contract.modules.map((module) => module.module_id)), 'CONTRACT_EXECUTION_ORDER');
assert(contract.required_outputs?.length === 9, 'CONTRACT_REQUIRED_OUTPUT_COUNT');
assert(contract.mission_policy?.expected_mission_count === 192, 'CONTRACT_MISSION_COUNT');
assert(contract.mission_policy?.operating_mode === 'MULTI_LANE_AUTONOMOUS_ACQUISITION', 'CONTRACT_OPERATING_MODE');
assert(contract.mission_policy?.runtime_priority_owner === 'ASI', 'CONTRACT_RUNTIME_PRIORITY_OWNER');
assert(contract.mission_policy?.psa_is_program_prerequisite === false, 'CONTRACT_PSA_PREREQUISITE');
assert(contract.mission_policy?.psa_role === 'PARALLEL_GRADED_SUPPLEMENT_LANE', 'CONTRACT_PSA_ROLE');
assert(contract.mission_policy?.non_psa_execution_lanes?.length === 4, 'CONTRACT_NON_PSA_LANES');
assert(JSON.stringify(contract.mission_policy?.evidence_ladder) === JSON.stringify(['REFERENCE','DISCOVERY','OBSERVATION','CANDIDATE','EVIDENCE','APPROVED_PROJECTION']), 'CONTRACT_EVIDENCE_LADDER');
assert(contract.mission_policy?.automobiles_lighthouse_target?.minimum === 25 && contract.mission_policy?.automobiles_lighthouse_target?.maximum === 50, 'CONTRACT_LIGHTHOUSE_TARGET');
assert(contract.provider_replaceability_policy?.minimum_operational_slots_per_mission === 3, 'CONTRACT_REPLACEMENT_SLOT_COUNT');
assert(contract.truth_boundary?.executes_external_collection === false, 'CONTRACT_COLLECTION_BOUNDARY');
assert(contract.truth_boundary?.creates_collection_right === false, 'CONTRACT_RIGHTS_BOUNDARY');
assert(contract.truth_boundary?.admits_evidence === false, 'CONTRACT_ADMISSION_BOUNDARY');
assert(contract.truth_boundary?.creates_customer_claim === false, 'CONTRACT_CLAIM_BOUNDARY');

for (const name of contract.required_outputs) {
  assert(fs.existsSync(path.join(outputDir, name)), `MISSING_OUTPUT:${name}`);
  JSON.parse(readText(name));
}

const unknown = readJson('unknown-registry-v1.json');
const gaps = readJson('intelligence-gap-map-v1.json');
const queue = readJson('autonomous-mission-queue-v1.json');
const replacements = readJson('provider-replaceability-plan-v1.json');
const roi = readJson('intelligence-roi-portfolio-v1.json');
const cross = readJson('cross-category-intelligence-map-v1.json');
const portfolio = readJson('portfolio-intelligence-map-v1.json');
const calibration = readJson('self-calibration-plan-v1.json');
const manifest = readJson('asi-intelligence-preparation-manifest-v1.json');

assert(unknown.id === 'kidults-asi-unknown-registry-v1', 'UNKNOWN_ID');
assert(unknown.unknown_record_count === 768 && unknown.records?.length === 768, 'UNKNOWN_COUNT');
assert(unknown.open_unknown_count === 768, 'UNKNOWN_OPEN_COUNT');
assert(unknown.missing_to_zero_count === 0, 'UNKNOWN_MISSING_TO_ZERO');
assert(unique(unknown.records.map((record) => record.unknown_id)), 'UNKNOWN_ID_DUPLICATE');
assert(unique(unknown.records.map((record) => record.market_cell_id)), 'UNKNOWN_CELL_DUPLICATE');
for (const record of unknown.records) {
  assert(record.state === 'OPEN', `UNKNOWN_STATE:${record.unknown_id}`);
  assert(record.missing_is_zero === false, `UNKNOWN_MISSING_ZERO:${record.unknown_id}`);
  assert(Array.isArray(record.unknown_types) && record.unknown_types.includes('EVIDENCE_MISSING'), `UNKNOWN_EVIDENCE_TYPE:${record.unknown_id}`);
  assert(record.direction_floor_pass === true, `UNKNOWN_DIRECTION_FLOOR:${record.unknown_id}`);
  assert(record.collection_authorized === false && record.evidence_admitted === false && record.claim_authorized === false, `UNKNOWN_PERMISSION:${record.unknown_id}`);
  assert(record.public_release === 'HOLD' && record.production === 'HOLD', `UNKNOWN_RELEASE_BOUNDARY:${record.unknown_id}`);
  assert(Number.isFinite(record.weighted_unknown_debt) && record.weighted_unknown_debt > 0, `UNKNOWN_DEBT:${record.unknown_id}`);
}

assert(gaps.id === 'kidults-asi-intelligence-gap-map-v1', 'GAP_ID');
assert(gaps.total_unknown_cells === 768, 'GAP_TOTAL_COUNT');
assert(gaps.total_weighted_unknown_debt === unknown.total_weighted_unknown_debt, 'GAP_DEBT_MISMATCH');
assert(gaps.collection_computable_cells === 0 && gaps.analytical_computable_cells === 0, 'GAP_COMPUTABLE_OVERCLAIM');
assert(gaps.active_market_claim === 'NONE', 'GAP_MARKET_CLAIM_OVERCLAIM');
for (const dimension of ['by_evidence_class', 'by_scope', 'by_region', 'by_domain', 'by_archetype']) {
  assert(Array.isArray(gaps[dimension]) && gaps[dimension].length > 0, `GAP_DIMENSION:${dimension}`);
}
assert(gaps.by_evidence_class.length === 8, 'GAP_EVIDENCE_CLASS_COUNT');
assert(gaps.by_scope.length === 32, 'GAP_SCOPE_COUNT');
assert(gaps.by_region.length === 3, 'GAP_REGION_COUNT');
assert(gaps.top_gap_cells?.length === 64, 'GAP_TOP_CELL_COUNT');
assert(gaps.public_release === 'HOLD' && gaps.production === 'HOLD', 'GAP_RELEASE_BOUNDARY');

assert(queue.id === 'kidults-asi-autonomous-mission-queue-v1', 'QUEUE_ID');
assert(queue.state === 'READY_FOR_AUTOMATIC_BOUNDED_DISCOVERY_AND_PREFLIGHT', 'QUEUE_STATE');
assert(queue.normal_manual_orchestration_required === false, 'QUEUE_MANUAL_ORCHESTRATION');
assert(queue.mission_count === 192 && queue.missions?.length === 192, 'QUEUE_MISSION_COUNT');
assert(unique(queue.missions.map((mission) => mission.mission_id)), 'QUEUE_MISSION_DUPLICATE');
assert(queue.mission_count_by_wave?.['1']?.mission_count === 96, 'QUEUE_WAVE1_COUNT');
assert(queue.mission_count_by_wave?.['2']?.mission_count === 96, 'QUEUE_WAVE2_COUNT');
const requiredEvidenceClasses = new Set(['CURRENT_SOLD_TRANSACTION', 'LIQUIDITY_TIME_TO_SALE_EXPOSURE']);
for (const mission of queue.missions) {
  assert(mission.state === 'QUEUED_READY_FOR_BOUNDED_DISCOVERY_AND_PREFLIGHT', `MISSION_STATE:${mission.mission_id}`);
  assert(mission.execution_mode === 'BOUNDED_DISCOVERY_AND_PREFLIGHT_ONLY', `MISSION_MODE:${mission.mission_id}`);
  assert(requiredEvidenceClasses.has(mission.evidence_class), `MISSION_EVIDENCE_CLASS:${mission.mission_id}`);
  assert(mission.direction_floor_pass === true, `MISSION_DIRECTION_FLOOR:${mission.mission_id}`);
  for (const key of ['autonomous', 'global', 'irreplaceable_value', 'transparent']) {
    assert(Number(mission.sourcing_direction_vector?.[key]) >= 2, `MISSION_DIRECTION:${mission.mission_id}:${key}`);
  }
  assert(Array.isArray(mission.required_actions) && mission.required_actions.length === 5, `MISSION_ACTIONS:${mission.mission_id}`);
  assert(Array.isArray(mission.required_gates) && mission.required_gates.length === 3, `MISSION_GATES:${mission.mission_id}`);
  assert(mission.collection_authorized === false && mission.evidence_admitted === false && mission.market_claim_authorized === false, `MISSION_PERMISSION:${mission.mission_id}`);
  assert(Number.isFinite(mission.intelligence_roi_score) && mission.intelligence_roi_score > 0, `MISSION_ROI:${mission.mission_id}`);
  assert(mission.public_release === 'HOLD' && mission.production === 'HOLD', `MISSION_RELEASE_BOUNDARY:${mission.mission_id}`);
}
assert(queue.external_collection_executed === false, 'QUEUE_EXTERNAL_COLLECTION');

assert(replacements.id === 'kidults-asi-provider-replaceability-plan-v1', 'REPLACEMENT_ID');
assert(replacements.mission_count === 192 && replacements.plans?.length === 192, 'REPLACEMENT_PLAN_COUNT');
assert(replacements.required_slots_per_mission === 3, 'REPLACEMENT_SLOT_REQUIREMENT');
assert(replacements.total_required_operational_slots === 576, 'REPLACEMENT_TOTAL_SLOTS');
assert(replacements.named_provider_selected_count === 0, 'REPLACEMENT_NAMED_PROVIDER');
assert(replacements.provider_lock_in_authorized === false, 'REPLACEMENT_LOCKIN');
for (const plan of replacements.plans) {
  assert(plan.required_operational_slots?.length === 3, `REPLACEMENT_SLOTS:${plan.replacement_plan_id}`);
  assert(unique(plan.required_operational_slots.map((slot) => slot.slot)), `REPLACEMENT_SLOT_DUPLICATE:${plan.replacement_plan_id}`);
  assert(plan.required_operational_slots.every((slot) => slot.named_provider === null), `REPLACEMENT_PROVIDER_PRESELECTED:${plan.replacement_plan_id}`);
  assert(plan.minimum_independent_factual_origins >= 2, `REPLACEMENT_FACTUAL_ORIGINS:${plan.replacement_plan_id}`);
  assert(plan.single_provider_mandatory_bottleneck_allowed === false, `REPLACEMENT_BOTTLENECK:${plan.replacement_plan_id}`);
  assert(plan.provider_direct_to_truth_index_or_projection_allowed === false, `REPLACEMENT_DIRECT_PATH:${plan.replacement_plan_id}`);
  assert(plan.collection_authorized === false, `REPLACEMENT_COLLECTION_PERMISSION:${plan.replacement_plan_id}`);
}

assert(roi.id === 'kidults-asi-intelligence-roi-portfolio-v1', 'ROI_ID');
assert(roi.mission_count === 192 && roi.ranked_missions?.length === 192, 'ROI_COUNT');
assert(roi.top_32?.length === 32, 'ROI_TOP_COUNT');
assert(roi.hard_floor_applied_before_ranking === true, 'ROI_HARD_FLOOR');
assert(roi.score_can_create_rights_admission_or_claim === false, 'ROI_PERMISSION_BOUNDARY');
for (let index = 0; index < roi.ranked_missions.length; index += 1) {
  const item = roi.ranked_missions[index];
  assert(item.rank === index + 1, `ROI_RANK:${item.mission_id}`);
  assert(item.score_role === 'ADVISORY_AFTER_HARD_FLOORS_ONLY', `ROI_ROLE:${item.mission_id}`);
  assert(item.rights_or_admission_created === false, `ROI_PERMISSION:${item.mission_id}`);
  if (index > 0) assert(roi.ranked_missions[index - 1].intelligence_roi_score >= item.intelligence_roi_score, `ROI_SORT:${item.mission_id}`);
}

assert(cross.id === 'kidults-asi-cross-category-intelligence-map-v1', 'CROSS_ID');
assert(cross.state === 'HYPOTHESIS_AND_EVIDENCE_DEMAND_ONLY', 'CROSS_STATE');
assert(cross.hypothesis_count === 24 && cross.hypotheses?.length === 24, 'CROSS_HYPOTHESIS_COUNT');
assert(cross.verified_cross_category_market_claims === 0, 'CROSS_CLAIM_COUNT');
for (const hypothesis of cross.hypotheses) {
  assert(hypothesis.state === 'UNVERIFIED_EVIDENCE_DEMAND', `CROSS_HYPOTHESIS_STATE:${hypothesis.hypothesis_id}`);
  assert(hypothesis.distinct_domain_count >= 2, `CROSS_DOMAIN_COUNT:${hypothesis.hypothesis_id}`);
  assert(hypothesis.correlation_is_causation === false, `CROSS_CAUSATION:${hypothesis.hypothesis_id}`);
  assert(hypothesis.hypothesis_is_fact === false && hypothesis.market_claim_authorized === false, `CROSS_FACT_OR_CLAIM:${hypothesis.hypothesis_id}`);
}

assert(portfolio.id === 'kidults-asi-portfolio-intelligence-map-v1', 'PORTFOLIO_ID');
assert(portfolio.state === 'PORTFOLIO_PREPARATION_NOT_INDEX', 'PORTFOLIO_STATE');
assert(portfolio.scope_count === 32 && portfolio.unknown_cells === 768 && portfolio.queued_critical_missions === 192, 'PORTFOLIO_COUNTS');
assert(portfolio.domain_count === portfolio.domains?.length && portfolio.domain_count >= 2, 'PORTFOLIO_DOMAIN_COUNT');
assert(portfolio.kidult_500_computed === false && portfolio.kidult_100_computed === false, 'PORTFOLIO_INDEX_OVERCLAIM');
for (const domain of portfolio.domains) {
  assert(domain.readiness_state === 'NOT_COMPUTABLE_EVIDENCE_GAPS_OPEN', `PORTFOLIO_READINESS:${domain.domain}`);
  assert(domain.portfolio_index_authorized === false, `PORTFOLIO_PERMISSION:${domain.domain}`);
}

assert(calibration.id === 'kidults-asi-self-calibration-plan-v1', 'CALIBRATION_ID');
assert(calibration.obligation_count === 192 && calibration.obligations?.length === 192, 'CALIBRATION_COUNT');
assert(calibration.realized_results_without_evidence === 0, 'CALIBRATION_UNEVIDENCED_RESULT');
for (const obligation of calibration.obligations) {
  assert(obligation.realized?.state === 'WAITING_FOR_EVIDENCE', `CALIBRATION_REALIZED_STATE:${obligation.calibration_id}`);
  assert(Array.isArray(obligation.realized.evidence_refs) && obligation.realized.evidence_refs.length === 0, `CALIBRATION_EVIDENCE:${obligation.calibration_id}`);
  assert(obligation.silent_prediction_rewrite_allowed === false, `CALIBRATION_REWRITE:${obligation.calibration_id}`);
  assert(obligation.market_claim_authorized === false, `CALIBRATION_CLAIM:${obligation.calibration_id}`);
}

assert(manifest.id === 'kidults-asi-intelligence-preparation-manifest-v1', 'MANIFEST_ID');
assert(JSON.stringify(manifest.platform_principles) === JSON.stringify(principles), 'MANIFEST_PRINCIPLE_ORDER');
assert(JSON.stringify(manifest.canonical_execution_order) === JSON.stringify(contract.canonical_execution_order), 'MANIFEST_EXECUTION_ORDER');
assert(manifest.results?.unknown_records === 768, 'MANIFEST_UNKNOWN_COUNT');
assert(manifest.results?.autonomous_missions === 192, 'MANIFEST_MISSION_COUNT');
assert(manifest.results?.mission_wave_1_current_sold === 96, 'MANIFEST_WAVE1_COUNT');
assert(manifest.results?.mission_wave_2_liquidity === 96, 'MANIFEST_WAVE2_COUNT');
assert(manifest.results?.provider_replacement_plans === 192, 'MANIFEST_REPLACEMENT_COUNT');
assert(manifest.results?.provider_replacement_slots === 576, 'MANIFEST_REPLACEMENT_SLOT_COUNT');
assert(manifest.results?.cross_category_hypotheses === 24, 'MANIFEST_CROSS_COUNT');
assert(manifest.results?.calibration_obligations === 192, 'MANIFEST_CALIBRATION_COUNT');
assert(manifest.results?.external_collection_executed === false, 'MANIFEST_EXTERNAL_COLLECTION');
assert(manifest.results?.evidence_admitted === 0 && manifest.results?.market_claims_created === 0, 'MANIFEST_PROMOTION_OVERCLAIM');
assert(manifest.output_files?.length === 8, 'MANIFEST_DIGEST_FILE_COUNT');
for (const output of manifest.output_files) {
  const content = readText(output.name);
  assert(output.sha256 === sha256(content), `MANIFEST_OUTPUT_DIGEST:${output.name}`);
  assert(output.bytes === Buffer.byteLength(content), `MANIFEST_OUTPUT_BYTES:${output.name}`);
}
assert(manifest.public_release === 'HOLD' && manifest.production === 'HOLD', 'MANIFEST_RELEASE_BOUNDARY');

const report = {
  id: 'kidults-asi-intelligence-preparation-wave-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  modules_validated: 8,
  unknown_records: 768,
  autonomous_missions: 192,
  current_sold_missions: 96,
  liquidity_missions: 96,
  provider_replacement_slots: 576,
  cross_category_hypotheses: 24,
  portfolio_domains: portfolio.domain_count,
  calibration_obligations: 192,
  external_collection_executed: false,
  evidence_admitted: 0,
  market_claims_created: 0,
  public_release: 'HOLD',
  production: 'HOLD'
};
console.log(JSON.stringify(report, null, 2));
