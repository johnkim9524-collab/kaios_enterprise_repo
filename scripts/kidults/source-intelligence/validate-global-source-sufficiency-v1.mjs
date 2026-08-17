import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fingerprint, readJson, unique } from "./asi-discovery-common-v1.mjs";

const REQUIRED_FILES = [
  "adaptive-global-source-sufficiency-plan-v1.json",
  "asi-sufficiency-calibration-wave-001-work-queue.json",
  "source-sufficiency-parameter-register-v1.json",
  "global-source-sufficiency-gap-matrix-v1.json",
  "global-market-poc-admission-gate-v2.json",
  "run-manifest.json"
];

function fail(errors, message) {
  errors.push(message);
}

function validateFingerprint(name, value, errors) {
  const copy = structuredClone(value);
  const stored = copy.fingerprint;
  delete copy.fingerprint;
  if (stored !== fingerprint(copy)) fail(errors, `${name}: fingerprint mismatch.`);
}

export function validateGlobalSourceSufficiencyV1(directory) {
  const errors = [];
  const outputs = {};
  for (const name of REQUIRED_FILES) {
    const file = path.join(directory, name);
    if (!fs.existsSync(file)) fail(errors, `Missing output: ${name}`);
    else outputs[name] = readJson(file);
  }
  if (errors.length) return errors;

  const plan = outputs["adaptive-global-source-sufficiency-plan-v1.json"];
  const queue = outputs["asi-sufficiency-calibration-wave-001-work-queue.json"];
  const parameters = outputs["source-sufficiency-parameter-register-v1.json"];
  const gaps = outputs["global-source-sufficiency-gap-matrix-v1.json"];
  const admission = outputs["global-market-poc-admission-gate-v2.json"];
  const manifest = outputs["run-manifest.json"];

  if (plan.fixed_high_trust_source_target !== null) fail(errors, "Fixed High-Trust Source target must be null.");
  if (plan.source_target_policy !== "ADAPTIVE_OUTCOME_DERIVED_NO_FIXED_CAP") fail(errors, "Adaptive Source target policy is missing.");
  if (plan.core_domains !== 8) fail(errors, `Expected 8 Core Domains, received ${plan.core_domains}.`);
  if (plan.collection_scopes !== 32) fail(errors, `Expected 32 Collection Scopes, received ${plan.collection_scopes}.`);
  if (plan.mandatory_source_roles !== 7) fail(errors, `Expected 7 mandatory Source Roles, received ${plan.mandatory_source_roles}.`);
  if (plan.scope_role_lanes !== 224 || plan.lanes.length !== 224) fail(errors, "Plan must contain 224 Scope-role lanes.");
  if (unique(plan.lanes.map(lane => lane.lane_id)).length !== 224) fail(errors, "Plan lane IDs must be unique.");
  if (plan.initial_candidate_assessment_total !== 4480) fail(errors, "Initial candidate assessment total must be 4,480.");
  if (plan.global_source_quantity_state !== "NOT_CALCULATED_PENDING_EMPIRICAL_LANE_PARAMETERS") fail(errors, "Global Source quantity must remain uncalculated until empirical parameters exist.");

  for (const lane of plan.lanes) {
    if (lane.initial_candidate_assessments !== 20) fail(errors, `${lane.lane_id}: initial assessment count must be 20.`);
    if (lane.status !== "CALIBRATION_REQUIRED_NOT_MEASURED") fail(errors, `${lane.lane_id}: unexpected lane status.`);
    for (const field of [
      "trust_survival_rate",
      "rights_survival_rate",
      "technical_survival_rate",
      "freshness_survival_rate",
      "continuity_survival_rate",
      "effective_object_role_coverage_per_active_family",
      "calculated_required_independent_families",
      "calculated_required_source_channels"
    ]) {
      if (lane[field] !== null) fail(errors, `${lane.lane_id}: ${field} must be null before calibration.`);
    }
    if (lane.source_pool_promoted !== false || lane.acquisition_authorized !== false || lane.production !== "HOLD") {
      fail(errors, `${lane.lane_id}: fail-closed boundary violated.`);
    }
  }

  if (queue.scope_role_lanes !== 224 || queue.total_work_items !== 4480 || queue.records.length !== 4480) {
    fail(errors, "Calibration queue must contain 4,480 records across 224 lanes.");
  }
  if (unique(queue.records.map(record => record.work_item_id)).length !== 4480) fail(errors, "Calibration work item IDs must be unique.");
  if (queue.broad_generic_discovery_reopened !== false) fail(errors, "Broad generic discovery must remain closed.");
  const queueCounts = new Map();
  for (const record of queue.records) {
    queueCounts.set(record.lane_id, (queueCounts.get(record.lane_id) ?? 0) + 1);
    if (record.review_state !== "NOT_STARTED" || record.qualification_state !== "NOT_QUALIFIED") fail(errors, `${record.work_item_id}: invalid initial state.`);
    if (record.source_pool_promoted !== false || record.acquisition_authorized !== false || record.production !== "HOLD") {
      fail(errors, `${record.work_item_id}: fail-closed boundary violated.`);
    }
  }
  if (queueCounts.size !== 224 || [...queueCounts.values()].some(count => count !== 20)) fail(errors, "Every Scope-role lane must receive exactly 20 initial work items.");

  if (parameters.records.length !== 224) fail(errors, "Parameter register must contain 224 lane records.");
  for (const record of parameters.records) {
    if (record.parameter_state !== "NOT_MEASURED" || record.calculated_source_requirement !== null) fail(errors, `${record.lane_id}: parameter state must remain NOT_MEASURED.`);
  }
  if (parameters.fixed_target_substitution_prohibited !== true) fail(errors, "Fixed target substitution must be prohibited.");

  if (gaps.total_lanes !== 224 || gaps.calibrated_lanes !== 0 || gaps.uncalibrated_lanes !== 224) fail(errors, "Gap matrix must disclose 224 uncalibrated lanes.");
  if (gaps.core_domain_summary.length !== 8) fail(errors, "Gap matrix must contain eight Core Domain summaries.");
  if (gaps.global_diversity_measurements.status !== "NOT_MEASURED") fail(errors, "Global diversity must remain NOT_MEASURED before execution.");

  if (admission.fixed_source_count_required !== false) fail(errors, "Admission gate must not require a fixed Source count.");
  if (admission.status !== "NOT_ADMITTED_CALIBRATION_AND_SUFFICIENCY_INCOMPLETE") fail(errors, "Global Market PoC must remain not admitted.");
  if (admission.current_measurement.calculated_required_independent_families !== null || admission.current_measurement.calculated_required_source_channels !== null) {
    fail(errors, "Admission gate must not invent a Source requirement before calibration.");
  }
  if (admission.source_pool_promotions !== 0 || admission.acquisition_authorized !== false || admission.production !== "HOLD") fail(errors, "Admission fail-closed boundary violated.");

  for (const [name, value] of Object.entries(outputs)) {
    if (name !== "run-manifest.json") validateFingerprint(name, value, errors);
  }
  const manifestCopy = structuredClone(manifest);
  const storedRunFingerprint = manifestCopy.run_fingerprint;
  delete manifestCopy.run_fingerprint;
  if (storedRunFingerprint !== fingerprint(manifestCopy)) fail(errors, "Run manifest fingerprint mismatch.");
  if (manifest.scope_role_lanes !== 224 || manifest.initial_candidate_assessment_total !== 4480) fail(errors, "Run manifest counts are invalid.");
  if (manifest.fixed_high_trust_source_target !== null || manifest.global_source_quantity_calculated !== false) fail(errors, "Run manifest must preserve adaptive target boundary.");
  if (manifest.source_pool_promotions !== 0 || manifest.acquisition_authorized !== false || manifest.production !== "HOLD") fail(errors, "Run manifest fail-closed boundary violated.");

  return errors;
}

const directory = path.resolve(process.argv[2] ?? "");
const errors = validateGlobalSourceSufficiencyV1(directory);
if (errors.length) {
  console.error(`KIDULTS Global Source Sufficiency v1: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

const manifest = readJson(path.join(directory, "run-manifest.json"));
console.log("KIDULTS Global Source Sufficiency v1: PASS");
console.log(`Core Domains / Scopes / Roles / Lanes: ${manifest.core_domains} / ${manifest.collection_scopes} / ${manifest.mandatory_source_roles} / ${manifest.scope_role_lanes}`);
console.log(`Initial targeted calibration assessments: ${manifest.initial_candidate_assessment_total}`);
console.log("Fixed Source target: REMOVED; empirical adaptive calculation required.");
console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
