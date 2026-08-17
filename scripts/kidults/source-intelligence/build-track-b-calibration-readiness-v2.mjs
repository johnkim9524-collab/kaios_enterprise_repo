import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  fingerprint,
  hashId,
  normalizeUrl,
  readJson,
  unique,
  writeJsonDirectory
} from "./asi-discovery-common-v1.mjs";

const root = process.cwd();
const contractPath = path.join(root, "coordination", "kidults", "source-intelligence", "track-b-calibration-readiness-contract-v2.json");
const scopeRegistryPath = path.join(root, "coordination", "kidults", "data-scope", "collection-scope-registry-v1.json");
const defaultPrecisionInput = path.join(root, "artifacts", "input", "source-relevance-precision-v1");
const defaultV2Input = path.join(root, "artifacts", "input", "source-precision-ranking-v2-final");
const defaultTargetedInput = path.join(root, "artifacts", "input", "targeted-high-authority-source-expansion-v1-fixed");
const defaultOutput = path.join(root, "artifacts", "agci-os", "track-b-calibration-readiness-v2");

function parseArgs(argv) {
  const config = {
    precisionInput: defaultPrecisionInput,
    v2Input: defaultV2Input,
    targetedInput: defaultTargetedInput,
    output: defaultOutput,
    write: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--precision-input") config.precisionInput = path.resolve(argv[++index]);
    else if (argument === "--v2-input") config.v2Input = path.resolve(argv[++index]);
    else if (argument === "--targeted-input") config.targetedInput = path.resolve(argv[++index]);
    else if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return config;
}

function findFile(directory, basename) {
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(candidate);
      else if (entry.name === basename) return candidate;
    }
  }
  throw new Error(`Unable to find ${basename} under ${directory}`);
}

function addFingerprint(value) {
  value.fingerprint = fingerprint(value);
  return value;
}

function reviewerCase(record, index) {
  return {
    review_case_id: `track-b-calibration-v2-${String(index + 1).padStart(3, "0")}`,
    original_case_id: record.case_id,
    endpoint_id: record.endpoint_id,
    source_id: record.source_id,
    endpoint_url: record.endpoint_url,
    owner: record.owner,
    channel_type: record.channel_type,
    discovery_providers: record.discovery_providers,
    candidate_collection_scopes: record.candidate_collection_scopes,
    candidate_source_roles: record.candidate_source_roles,
    best_scope_evidence: record.best_scope_evidence,
    best_source_role_evidence: record.best_source_role_evidence,
    data_channel_evidence: record.data_channel_evidence,
    authority_evidence: record.authority_evidence,
    generic_or_unrelated_evidence: record.generic_or_unrelated_evidence,
    evidence_excerpt: record.evidence_excerpt,
    decision_scope_ids_sample: record.decision_scope_ids_sample,
    value_scope_ids: record.value_scope_ids,
    intelligence_product_ids: record.intelligence_product_ids,
    numeric_score_visible_to_reviewer: false,
    provisional_bucket_visible_to_reviewer: false,
    scope_relevance_label: null,
    source_role_label: null,
    corrected_source_roles: [],
    channel_suitability_label: null,
    owner_and_lineage_label: null,
    generic_code_or_keyword_collision_label: null,
    decision_value_contribution_label: null,
    rationale: null,
    evidence_references: [],
    reviewer: null,
    reviewed_at: null,
    resolution_state: "PENDING_TRACK_B_REVIEW",
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

function interleaveCalibration(records, contract) {
  const requiredBuckets = Object.keys(contract.workstreams.track_b_calibration_400.required_buckets);
  const groups = new Map(requiredBuckets.map(bucket => [bucket, records
    .filter(record => record.provisional_bucket === bucket)
    .sort((a, b) => a.case_id.localeCompare(b.case_id))]));
  for (const [bucket, required] of Object.entries(contract.workstreams.track_b_calibration_400.required_buckets)) {
    const actual = groups.get(bucket)?.length ?? 0;
    if (actual !== required) throw new Error(`${bucket}: expected ${required}, received ${actual}`);
  }
  const ordered = [];
  for (let index = 0; index < 100; index += 1) {
    for (const bucket of requiredBuckets) ordered.push(groups.get(bucket)[index]);
  }
  return ordered.map(reviewerCase);
}

function buildCalibrationBatches(reviewCases, contract) {
  const batchCount = contract.workstreams.track_b_calibration_400.batch_count;
  const casesPerBatch = contract.workstreams.track_b_calibration_400.cases_per_batch;
  const batches = [];
  for (let index = 0; index < batchCount; index += 1) {
    const records = reviewCases.slice(index * casesPerBatch, (index + 1) * casesPerBatch);
    batches.push({
      batch_id: `track-b-calibration-v2-batch-${String(index + 1).padStart(2, "0")}`,
      batch_position: index + 1,
      case_count: records.length,
      review_case_ids: records.map(record => record.review_case_id),
      numeric_score_visible_to_reviewer: false,
      provisional_bucket_visible_to_reviewer: false,
      state: "READY_FOR_INDEPENDENT_REVIEW",
      production: "HOLD"
    });
  }
  return batches;
}

function canonicalStrongV2(record) {
  const endpoint = normalizeUrl(record.endpoint_url) ?? record.endpoint_url;
  return {
    source_id: record.source_id,
    endpoint_id: record.endpoint_id ?? hashId("ep", endpoint),
    endpoint_url: endpoint,
    owner: record.owner,
    source_name: record.evidence_excerpt?.source_names?.[0] ?? record.owner,
    record_origin: record.record_origin,
    collection_scope_ids: unique(record.candidate_collection_scopes ?? []),
    source_roles: unique(record.corrected_source_roles?.length ? record.corrected_source_roles : record.candidate_source_roles ?? []),
    channel_type: record.channel_type,
    verification_state: record.verification_state ?? "UNKNOWN",
    rights_state: record.rights_state ?? "UNKNOWN",
    commercial_use_state: record.commercial_use_state ?? "UNKNOWN",
    explicit_scope_evidence: record.explicit_scope_evidence ?? [],
    explicit_channel_suitability: record.explicit_channel_suitability === true,
    evidence_references: [endpoint],
    ranking_state: record.ranking_state,
    qualification_state: "NOT_QUALIFIED",
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

function canonicalTargeted(record) {
  const endpoint = normalizeUrl(record.official_endpoint) ?? record.official_endpoint;
  return {
    source_id: record.source_id,
    endpoint_id: hashId("ep", endpoint),
    endpoint_url: endpoint,
    owner: record.display_name,
    source_name: record.display_name,
    record_origin: "TARGETED_HIGH_AUTHORITY_SOURCE_EXPANSION",
    collection_scope_ids: unique(record.collection_scope_ids ?? []),
    source_roles: unique(record.source_roles ?? []),
    channel_type: record.channel_type,
    verification_state: record.verification_state ?? "UNKNOWN",
    rights_state: record.rights_state ?? "UNKNOWN",
    commercial_use_state: record.commercial_use_state ?? "UNKNOWN",
    explicit_scope_evidence: unique(record.collection_scope_ids ?? []),
    explicit_channel_suitability: true,
    evidence_references: unique(record.evidence_references ?? [endpoint]),
    ranking_state: "TARGETED_HIGH_AUTHORITY_INTERIM_TOP50_PASS_NOT_QUALIFIED",
    qualification_state: "NOT_QUALIFIED",
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

function sourceKey(record) {
  return `${String(record.owner ?? "").toLowerCase()}|${normalizeUrl(record.endpoint_url) ?? record.endpoint_url}`;
}

function buildStrongDepthLedger(targetedRecords, v2Records) {
  const acceptedV2States = new Set([
    "ANCHOR_CANDIDATE_NOT_TRACK_B_VALIDATED",
    "BOUNDED_ADAPTER_ANCHOR_NOT_SOURCE_POOL_PROMOTION",
    "HOLD_V2_MORE_EVIDENCE_REQUIRED"
  ]);
  const combined = [
    ...targetedRecords.map(canonicalTargeted),
    ...v2Records
      .filter(record => acceptedV2States.has(record.ranking_state))
      .filter(record => !(record.hard_rejection_reasons ?? []).length)
      .filter(record => record.explicit_channel_suitability === true)
      .map(canonicalStrongV2)
  ].sort((a, b) => a.record_origin.localeCompare(b.record_origin) || a.source_id.localeCompare(b.source_id));

  const map = new Map();
  for (const record of combined) {
    const key = sourceKey(record);
    const existing = map.get(key);
    if (!existing) map.set(key, record);
    else {
      existing.collection_scope_ids = unique([...existing.collection_scope_ids, ...record.collection_scope_ids]);
      existing.source_roles = unique([...existing.source_roles, ...record.source_roles]);
      existing.evidence_references = unique([...existing.evidence_references, ...record.evidence_references]);
    }
  }
  return [...map.values()].sort((a, b) => a.source_id.localeCompare(b.source_id));
}

function buildScopeWorkQueue(scopeRegistry, strongRecords, contract) {
  const target = contract.workstreams.high_authority_source_depth.primary_source_floor_per_scope;
  const requiredRoles = contract.workstreams.high_authority_source_depth.required_source_roles;
  return scopeRegistry.records
    .slice()
    .sort((a, b) => a.scope_id.localeCompare(b.scope_id))
    .map(scope => {
      const current = strongRecords.filter(record => record.collection_scope_ids.includes(scope.scope_id));
      const roleCoverage = Object.fromEntries(requiredRoles.map(role => [role,
        current.filter(record => record.source_roles.includes(role)).map(record => record.source_id).sort()]));
      const missingRoles = requiredRoles.filter(role => roleCoverage[role].length === 0);
      return {
        work_item_id: `source-depth-${scope.scope_id}`,
        scope_id: scope.scope_id,
        scope_name: scope.name,
        core_domain: scope.parent_core_domain,
        definition: scope.definition,
        target_primary_sources: target,
        current_strong_source_count: current.length,
        primary_source_gap: Math.max(0, target - current.length),
        current_source_ids: current.map(record => record.source_id).sort(),
        required_source_roles: requiredRoles,
        source_role_coverage: roleCoverage,
        missing_required_source_roles: missingRoles,
        discovery_priority: current.length === 0 ? "P0_EMPTY_SCOPE" : missingRoles.length ? "P0_ROLE_GAP" : current.length < target ? "P1_DEPTH_GAP" : "DEPTH_FLOOR_MET",
        discovery_instruction: `Find primary, specialist and independent channels that directly support ${scope.name}; reject single-keyword matches, generic software and rights-unknown-as-allowed shortcuts.`,
        next_gate: "INDEPENDENT_RELEVANCE_REVIEW_THEN_OFFICIAL_RIGHTS_ACCESS_COST_PREFLIGHT",
        source_pool_promoted: false,
        acquisition_authorized: false,
        production: "HOLD"
      };
    });
}

function buildRoleGapMatrix(scopeRegistry, strongRecords, contract) {
  const requiredRoles = contract.workstreams.high_authority_source_depth.required_source_roles;
  const records = [];
  for (const scope of scopeRegistry.records.slice().sort((a, b) => a.scope_id.localeCompare(b.scope_id))) {
    for (const role of requiredRoles) {
      const sourceIds = strongRecords
        .filter(record => record.collection_scope_ids.includes(scope.scope_id) && record.source_roles.includes(role))
        .map(record => record.source_id)
        .sort();
      records.push({
        lane_id: `${scope.scope_id}::${role}`,
        scope_id: scope.scope_id,
        core_domain: scope.parent_core_domain,
        source_role: role,
        current_source_count: sourceIds.length,
        current_source_ids: sourceIds,
        minimum_required: 1,
        gap: sourceIds.length ? 0 : 1,
        state: sourceIds.length ? "CANDIDATE_COVERAGE_PRESENT_NOT_QUALIFIED" : "SOURCE_ROLE_GAP",
        production: "HOLD"
      });
    }
  }
  return records;
}

export function buildTrackBCalibrationReadiness({ precisionInput, v2Input, targetedInput } = {}) {
  const contract = readJson(contractPath);
  const scopeRegistry = readJson(scopeRegistryPath);
  const calibration = readJson(findFile(precisionInput ?? defaultPrecisionInput, "source-relevance-calibration-candidates-v1.json"));
  const v2Universe = readJson(findFile(v2Input ?? defaultV2Input, "precision-ranked-universe-v2.json"));
  const targetedRegistry = readJson(findFile(targetedInput ?? defaultTargetedInput, "targeted-high-authority-source-candidate-registry-v1.json"));
  const targetedAssessment = readJson(findFile(targetedInput ?? defaultTargetedInput, "targeted-high-authority-top50-assessment-v1.json"));

  const reviewCases = interleaveCalibration(calibration.records, contract);
  const batches = buildCalibrationBatches(reviewCases, contract);
  const strongRecords = buildStrongDepthLedger(targetedRegistry.records, v2Universe.records);
  const scopeQueueRecords = buildScopeWorkQueue(scopeRegistry, strongRecords, contract);
  const roleGapRecords = buildRoleGapMatrix(scopeRegistry, strongRecords, contract);
  const uniqueCandidateCount = strongRecords.length;
  const minimumUnique = contract.workstreams.high_authority_source_depth.minimum_unique_underlying_source_families_before_top200;
  const top200Ready = uniqueCandidateCount >= minimumUnique && scopeQueueRecords.every(record => record.primary_source_gap === 0);

  const reviewPackage = addFingerprint({
    id: "track-b-calibration-review-package-v2",
    record_type: "track_b_source_relevance_review_package",
    version: "2.0.0",
    status: "READY_FOR_400_CASE_INDEPENDENT_REVIEW",
    generated_at: contract.effective_at,
    contract_id: contract.id,
    record_count: reviewCases.length,
    numeric_score_visible_to_reviewer: false,
    provisional_bucket_visible_to_reviewer: false,
    records: reviewCases,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  });

  const batchOutput = addFingerprint({
    id: "track-b-calibration-batches-v2",
    record_type: "track_b_review_batch_plan",
    version: "2.0.0",
    status: "EIGHT_DETERMINISTIC_REVIEW_BATCHES_READY",
    generated_at: contract.effective_at,
    batch_count: batches.length,
    cases_per_batch: contract.workstreams.track_b_calibration_400.cases_per_batch,
    total_cases: reviewCases.length,
    batches,
    production: "HOLD"
  });

  const assessmentTemplate = addFingerprint({
    id: "track-b-label-assessment-template-v2",
    record_type: "track_b_source_relevance_label_assessment_template",
    version: "2.0.0",
    status: "EMPTY_TEMPLATE_REVIEW_REQUIRED",
    generated_at: contract.effective_at,
    required_records: reviewCases.length,
    completed_records: 0,
    unresolved_records: reviewCases.length,
    records: reviewCases.map(record => ({
      review_case_id: record.review_case_id,
      endpoint_id: record.endpoint_id,
      scope_relevance_label: null,
      source_role_label: null,
      corrected_source_roles: [],
      channel_suitability_label: null,
      owner_and_lineage_label: null,
      generic_code_or_keyword_collision_label: null,
      decision_value_contribution_label: null,
      rationale: null,
      evidence_references: [],
      reviewer: null,
      reviewed_at: null,
      resolution_state: "PENDING_TRACK_B_REVIEW"
    })),
    final_gold_assessment: false,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  });

  const ledger = addFingerprint({
    id: "high-authority-source-depth-ledger-v2",
    record_type: "high_authority_source_depth_ledger",
    version: "2.0.0",
    status: top200Ready ? "TOP200_DEPTH_FLOOR_MET_REVIEW_STILL_REQUIRED" : "SOURCE_DEPTH_EXPANSION_REQUIRED",
    generated_at: contract.effective_at,
    targeted_interim_top50_precision: targetedAssessment.top50_precision,
    targeted_source_candidates: targetedRegistry.record_count,
    unique_strong_candidate_count: uniqueCandidateCount,
    minimum_unique_candidates_before_top200: minimumUnique,
    collection_scopes_represented: unique(strongRecords.flatMap(record => record.collection_scope_ids)).length,
    records: strongRecords,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  });

  const scopeQueue = addFingerprint({
    id: "scope-source-expansion-work-queue-v2",
    record_type: "scope_source_expansion_work_queue",
    version: "2.0.0",
    status: scopeQueueRecords.every(record => record.primary_source_gap === 0) ? "DEPTH_FLOOR_STRUCTURALLY_MET_NOT_QUALIFIED" : "ACTIVE_SOURCE_DEPTH_EXPANSION",
    generated_at: contract.effective_at,
    scope_count: scopeQueueRecords.length,
    target_scope_source_assignments: contract.workstreams.high_authority_source_depth.target_primary_scope_source_assignments,
    current_scope_source_assignments: scopeQueueRecords.reduce((sum, record) => sum + record.current_strong_source_count, 0),
    remaining_scope_source_gap: scopeQueueRecords.reduce((sum, record) => sum + record.primary_source_gap, 0),
    records: scopeQueueRecords,
    acquisition_authorized: false,
    production: "HOLD"
  });

  const roleMatrix = addFingerprint({
    id: "source-role-depth-gap-matrix-v2",
    record_type: "scope_source_role_depth_gap_matrix",
    version: "2.0.0",
    status: roleGapRecords.every(record => record.gap === 0) ? "MANDATORY_ROLE_CANDIDATE_COVERAGE_PRESENT_NOT_QUALIFIED" : "MANDATORY_ROLE_GAPS_ACTIVE",
    generated_at: contract.effective_at,
    lane_count: roleGapRecords.length,
    covered_lane_count: roleGapRecords.filter(record => record.gap === 0).length,
    gap_lane_count: roleGapRecords.filter(record => record.gap > 0).length,
    records: roleGapRecords,
    acquisition_authorized: false,
    production: "HOLD"
  });

  const top200Gate = addFingerprint({
    id: "top200-readiness-gate-v2",
    record_type: "source_precision_top200_readiness_gate",
    version: "2.0.0",
    status: top200Ready ? "READY_TO_GENERATE_DIRECT_TOP200_REVIEW_INPUT_NOT_QUALIFIED" : "BLOCKED_INSUFFICIENT_HIGH_CONFIDENCE_SOURCE_DEPTH",
    generated_at: contract.effective_at,
    current_unique_strong_candidate_count: uniqueCandidateCount,
    required_unique_candidate_count: contract.workstreams.direct_top200_readiness.minimum_unique_candidate_records,
    minimum_relevant_records_for_final_acceptance: contract.workstreams.direct_top200_readiness.minimum_relevant_records_for_acceptance,
    collection_scope_depth_floor_met: scopeQueueRecords.every(record => record.primary_source_gap === 0),
    direct_top200_ready: top200Ready,
    rejected_or_insufficient_padding_records: 0,
    padding_with_rejected_or_insufficient_records: "PROHIBITED",
    direct_top200_queue_created: false,
    next_actions: top200Ready
      ? ["GENERATE_IMMUTABLE_DIRECT_TOP200_REVIEW_INPUT", "COMPLETE_TRACK_B_DIRECT_ADJUDICATION"]
      : ["COMPLETE_400_CASE_CALIBRATION_IN_PARALLEL", "EXECUTE_SCOPE_SOURCE_EXPANSION_WORK_QUEUE", "RECHECK_TOP200_DEPTH_WITHOUT_PADDING"],
    source_pool_promotions: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    kidult_500: "NOT_COMPUTED",
    kidult_100: "NOT_COMPUTED",
    production: "HOLD"
  });

  const outputs = {
    "track-b-calibration-review-package-v2.json": reviewPackage,
    "track-b-calibration-batches-v2.json": batchOutput,
    "track-b-label-assessment-template-v2.json": assessmentTemplate,
    "high-authority-source-depth-ledger-v2.json": ledger,
    "scope-source-expansion-work-queue-v2.json": scopeQueue,
    "source-role-depth-gap-matrix-v2.json": roleMatrix,
    "top200-readiness-gate-v2.json": top200Gate
  };

  const manifest = {
    id: "track-b-calibration-readiness-v2-run-manifest",
    record_type: "track_b_source_calibration_readiness_run",
    version: "2.0.0",
    status: "READINESS_FOUNDATION_PASS_REVIEW_AND_SOURCE_EXPANSION_ACTIVE",
    generated_at: contract.effective_at,
    inputs: {
      contract: { id: contract.id, fingerprint: fingerprint(contract) },
      calibration: { id: calibration.id, fingerprint: calibration.fingerprint },
      v2_universe: { id: v2Universe.id, fingerprint: v2Universe.fingerprint },
      targeted_registry: { id: targetedRegistry.id, fingerprint: targetedRegistry.fingerprint },
      scope_registry: { id: scopeRegistry.id, fingerprint: fingerprint(scopeRegistry) }
    },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.fingerprint])),
    calibration_cases_packaged: reviewCases.length,
    calibration_batches: batches.length,
    completed_calibration_reviews: 0,
    unique_strong_candidate_count: uniqueCandidateCount,
    collection_scopes_in_work_queue: scopeQueueRecords.length,
    scope_source_assignment_gap: scopeQueue.remaining_scope_source_gap,
    mandatory_role_gap_lanes: roleMatrix.gap_lane_count,
    direct_top200_ready: top200Ready,
    direct_top200_queue_created: false,
    top200_padding_records: 0,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    indexes_computed: 0,
    production: "HOLD"
  };
  manifest.run_fingerprint = fingerprint(manifest);
  outputs["run-manifest.json"] = manifest;
  return outputs;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildTrackBCalibrationReadiness({
    precisionInput: config.precisionInput,
    v2Input: config.v2Input,
    targetedInput: config.targetedInput
  });
  if (config.write) writeJsonDirectory(config.output, outputs);
  const run = outputs["run-manifest.json"];
  console.log("KIDULTS Track B Calibration Readiness v2: PASS");
  console.log(`Calibration cases / batches: ${run.calibration_cases_packaged} / ${run.calibration_batches}`);
  console.log(`Unique strong Source candidates: ${run.unique_strong_candidate_count}`);
  console.log(`Scope assignment gap / mandatory role gap lanes: ${run.scope_source_assignment_gap} / ${run.mandatory_role_gap_lanes}`);
  console.log(`Direct Top-200 ready: ${run.direct_top200_ready}`);
  console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
