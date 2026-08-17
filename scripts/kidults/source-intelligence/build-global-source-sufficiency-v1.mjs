import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  fingerprint,
  readJson,
  unique,
  writeJsonDirectory
} from "./asi-discovery-common-v1.mjs";

const root = process.cwd();
const contractPath = path.join(
  root,
  "coordination",
  "kidults",
  "source-intelligence",
  "global-high-trust-source-sufficiency-contract-v1.json"
);
const scopeRegistryPath = path.join(
  root,
  "coordination",
  "kidults",
  "data-scope",
  "collection-scope-registry-v1.json"
);
const defaultOutput = path.join(
  root,
  "artifacts",
  "agci-os",
  "global-source-sufficiency-v1"
);

function parseArgs(argv) {
  const config = { output: defaultOutput, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return config;
}

function laneId(scopeId, role) {
  return `lane:${scopeId}:${role.toLowerCase().replaceAll("_", "-")}`;
}

function workItemId(lane, ordinal) {
  return `${lane.lane_id}:candidate-${String(ordinal).padStart(3, "0")}`;
}

function buildLane(scope, role, contract) {
  return {
    lane_id: laneId(scope.scope_id, role),
    core_domain_id: scope.parent_core_domain,
    collection_scope_id: scope.scope_id,
    collection_scope_name: scope.name,
    mandatory_source_role: role,
    representative_object_planning_floor: scope.planning_object_target,
    representative_object_floor_state: "MINIMUM_NOT_CAP",
    initial_candidate_assessments: contract.autonomous_calibration_wave.initial_candidate_assessments_per_lane,
    initial_lane_maximum: contract.autonomous_calibration_wave.initial_lane_maximum,
    high_risk_or_low_yield_lane_maximum: contract.autonomous_calibration_wave.high_risk_or_low_yield_lane_maximum,
    sequential_sampling: contract.autonomous_calibration_wave.sequential_sampling,
    trust_survival_rate: null,
    rights_survival_rate: null,
    technical_survival_rate: null,
    freshness_survival_rate: null,
    continuity_survival_rate: null,
    effective_object_role_coverage_per_active_family: null,
    diversity_reserve: null,
    continuity_reserve: null,
    concentration_reserve: null,
    calculated_required_independent_families: null,
    calculated_required_source_channels: null,
    independent_family_floor: contract.minimum_outcome_gates.critical_scope_role_lane_independent_family_floor,
    status: "CALIBRATION_REQUIRED_NOT_MEASURED",
    next_gate: "EXECUTE_INITIAL_TARGETED_CANDIDATE_ASSESSMENTS",
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

function buildWorkItem(lane, ordinal, contract) {
  return {
    work_item_id: workItemId(lane, ordinal),
    wave_id: contract.autonomous_calibration_wave.wave_id,
    lane_id: lane.lane_id,
    core_domain_id: lane.core_domain_id,
    collection_scope_id: lane.collection_scope_id,
    source_role: lane.mandatory_source_role,
    candidate_ordinal: ordinal,
    discovery_mode: "TARGETED_OFFICIAL_AND_SPECIALIST",
    required_evidence: [
      "OFFICIAL_OR_INDEPENDENTLY_VERIFIABLE_ENDPOINT",
      "OWNER_AND_OPERATOR_IDENTITY",
      "UNDERLYING_DATA_LINEAGE",
      "SCOPE_RELEVANCE",
      "SOURCE_ROLE_RELEVANCE",
      "DECISION_DNA_AND_IRREPLACEABLE_VALUE_LINKAGE",
      "REGION_AND_LANGUAGE_METADATA",
      "RIGHTS_ACCESS_AND_COMMERCIAL_STATE",
      "FRESHNESS_HISTORICAL_DEPTH_AND_CONTINUITY",
      "BIAS_MANIPULATION_AND_CONCENTRATION_RISK"
    ],
    review_state: "NOT_STARTED",
    trust_state: "NOT_ASSESSED",
    rights_state: "NOT_ASSESSED",
    technical_state: "NOT_ASSESSED",
    qualification_state: "NOT_QUALIFIED",
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

function addFingerprints(outputs) {
  for (const [name, value] of Object.entries(outputs)) {
    if (name === "run-manifest.json") continue;
    value.fingerprint = fingerprint(value);
  }
}

export function buildGlobalSourceSufficiencyV1() {
  const contract = readJson(contractPath);
  const registry = readJson(scopeRegistryPath);
  const scopes = [...registry.records].sort((a, b) => a.scope_id.localeCompare(b.scope_id));
  const roles = [...contract.mandatory_source_roles].sort();
  const coreDomains = unique(scopes.map(scope => scope.parent_core_domain));
  const lanes = scopes.flatMap(scope => roles.map(role => buildLane(scope, role, contract)));
  const workItems = lanes.flatMap(lane =>
    Array.from(
      { length: contract.autonomous_calibration_wave.initial_candidate_assessments_per_lane },
      (_, index) => buildWorkItem(lane, index + 1, contract)
    )
  );

  const plan = {
    id: "adaptive-global-source-sufficiency-plan-v1",
    record_type: "adaptive_global_source_sufficiency_plan",
    version: "1.0.0",
    status: "CALIBRATION_WAVE_READY_GLOBAL_TARGET_NOT_YET_CALCULATED",
    generated_at: contract.effective_at,
    contract_id: contract.id,
    target_market: contract.target_market,
    first_value: contract.first_value,
    north_star: contract.north_star,
    fixed_high_trust_source_target: null,
    source_target_policy: contract.source_target_policy,
    core_domains: coreDomains.length,
    collection_scopes: scopes.length,
    mandatory_source_roles: roles.length,
    scope_role_lanes: lanes.length,
    representative_object_floor_total: contract.base_operating_universe.representative_object_floor_total,
    initial_candidate_assessment_total: workItems.length,
    calculation_model: contract.adaptive_calculation_model,
    admission_basis: contract.global_market_poc_admission.admission_basis,
    lanes,
    global_source_quantity_state: "NOT_CALCULATED_PENDING_EMPIRICAL_LANE_PARAMETERS",
    source_pool_promotions: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    kidult_500: "NOT_COMPUTED",
    kidult_100: "NOT_COMPUTED",
    production: "HOLD"
  };

  const queue = {
    id: "asi-sufficiency-calibration-wave-001-work-queue",
    record_type: "autonomous_source_sufficiency_calibration_queue",
    version: "1.0.0",
    status: "READY_FOR_TARGETED_EXECUTION",
    generated_at: contract.effective_at,
    wave_id: contract.autonomous_calibration_wave.wave_id,
    scope_role_lanes: lanes.length,
    initial_candidate_assessments_per_lane: contract.autonomous_calibration_wave.initial_candidate_assessments_per_lane,
    total_work_items: workItems.length,
    sequential_sampling: true,
    broad_generic_discovery_reopened: false,
    records: workItems,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const parameters = {
    id: "source-sufficiency-parameter-register-v1",
    record_type: "source_sufficiency_parameter_register",
    version: "1.0.0",
    status: "ALL_EMPIRICAL_PARAMETERS_NOT_MEASURED",
    generated_at: contract.effective_at,
    required_parameters: contract.adaptive_calculation_model.required_inputs,
    missing_parameter_policy: contract.adaptive_calculation_model.missing_parameter_policy,
    records: lanes.map(lane => ({
      lane_id: lane.lane_id,
      core_domain_id: lane.core_domain_id,
      collection_scope_id: lane.collection_scope_id,
      source_role: lane.mandatory_source_role,
      representative_objects: lane.representative_object_planning_floor,
      role_coverage_requirement: null,
      effective_object_role_coverage_per_active_family: null,
      trust_qualification_survival_rate: null,
      rights_and_access_survival_rate: null,
      technical_access_survival_rate: null,
      freshness_survival_rate: null,
      continuity_survival_rate: null,
      regional_and_language_diversity_reserve: null,
      owner_and_provider_concentration_reserve: null,
      channels_per_independent_family: null,
      parameter_state: "NOT_MEASURED",
      calculated_source_requirement: null
    })),
    fixed_target_substitution_prohibited: true,
    production: "HOLD"
  };

  const gapMatrix = {
    id: "global-source-sufficiency-gap-matrix-v1",
    record_type: "global_source_sufficiency_gap_matrix",
    version: "1.0.0",
    status: "224_LANES_REQUIRE_CALIBRATION",
    generated_at: contract.effective_at,
    total_lanes: lanes.length,
    calibrated_lanes: 0,
    uncalibrated_lanes: lanes.length,
    core_domain_summary: coreDomains.map(coreDomainId => {
      const domainLanes = lanes.filter(lane => lane.core_domain_id === coreDomainId);
      return {
        core_domain_id: coreDomainId,
        collection_scopes: unique(domainLanes.map(lane => lane.collection_scope_id)).length,
        scope_role_lanes: domainLanes.length,
        calibrated_lanes: 0,
        uncalibrated_lanes: domainLanes.length,
        calculated_required_source_quantity: null,
        status: "CALIBRATION_REQUIRED"
      };
    }),
    global_diversity_measurements: {
      macro_regions: null,
      countries_or_jurisdictions: null,
      languages: null,
      single_owner_concentration: null,
      single_provider_family_concentration: null,
      status: "NOT_MEASURED"
    },
    production: "HOLD"
  };

  const admission = {
    id: "global-market-poc-admission-gate-v2",
    record_type: "global_market_poc_admission_gate",
    version: "2.0.0",
    status: "NOT_ADMITTED_CALIBRATION_AND_SUFFICIENCY_INCOMPLETE",
    generated_at: contract.effective_at,
    fixed_source_count_required: false,
    source_quantity_state: "TO_BE_DERIVED_FROM_EMPIRICAL_PARAMETERS",
    required_outcome_gates: contract.minimum_outcome_gates,
    required_admission_conditions: contract.global_market_poc_admission.required,
    current_measurement: {
      calibrated_scope_role_lanes: 0,
      total_scope_role_lanes: lanes.length,
      calculated_required_independent_families: null,
      calculated_required_source_channels: null,
      track_b_precision_gate: "IN_PROGRESS",
      representative_acquisition_plan: "NOT_READY",
      digitalocean_dev_staging_capacity: "NOT_VERIFIED"
    },
    current_label: contract.global_market_poc_admission.label_before_gate,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    production: "HOLD"
  };

  const outputs = {
    "adaptive-global-source-sufficiency-plan-v1.json": plan,
    "asi-sufficiency-calibration-wave-001-work-queue.json": queue,
    "source-sufficiency-parameter-register-v1.json": parameters,
    "global-source-sufficiency-gap-matrix-v1.json": gapMatrix,
    "global-market-poc-admission-gate-v2.json": admission
  };
  addFingerprints(outputs);

  const manifest = {
    id: "global-source-sufficiency-v1-run-manifest",
    record_type: "global_source_sufficiency_run_manifest",
    version: "1.0.0",
    status: "FOUNDATION_PASS_CALIBRATION_EXECUTION_NEXT",
    generated_at: contract.effective_at,
    inputs: {
      contract: { id: contract.id, fingerprint: fingerprint(contract) },
      collection_scope_registry: { id: registry.id, fingerprint: fingerprint(registry) }
    },
    outputs: Object.fromEntries(
      Object.entries(outputs).map(([name, value]) => [name, value.fingerprint])
    ),
    core_domains: coreDomains.length,
    collection_scopes: scopes.length,
    mandatory_source_roles: roles.length,
    scope_role_lanes: lanes.length,
    initial_candidate_assessment_total: workItems.length,
    fixed_high_trust_source_target: null,
    global_source_quantity_calculated: false,
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
  const outputs = buildGlobalSourceSufficiencyV1();
  if (config.write) writeJsonDirectory(config.output, outputs);
  const manifest = outputs["run-manifest.json"];
  console.log("KIDULTS Global Source Sufficiency v1: FOUNDATION PASS");
  console.log(`Core Domains / Scopes / Roles / Lanes: ${manifest.core_domains} / ${manifest.collection_scopes} / ${manifest.mandatory_source_roles} / ${manifest.scope_role_lanes}`);
  console.log(`Initial targeted calibration assessments: ${manifest.initial_candidate_assessment_total}`);
  console.log("Fixed Source target: REMOVED; quantity will be derived empirically.");
  console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
