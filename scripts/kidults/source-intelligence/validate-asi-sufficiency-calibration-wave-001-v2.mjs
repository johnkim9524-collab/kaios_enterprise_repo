import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fingerprint, readJson, stableJson, unique } from "./asi-discovery-common-v1.mjs";
import { executeAsiSufficiencyCalibrationWave001 } from "./execute-asi-sufficiency-calibration-wave-001.mjs";
import { normalizeWaveOutputsInMemory, WAVE_OUTPUT_FILES } from "./normalize-asi-sufficiency-wave-output-v1.mjs";

const REQUIRED_FILES = Object.freeze([...WAVE_OUTPUT_FILES, "run-manifest.json"]);

function parseArgs(argv) {
  const config = { output: null, queueInput: null, batchInput: null, precisionInput: null, targetedInput: null, sufficiencyInput: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!config.output && !argument.startsWith("--")) config.output = path.resolve(argument);
    else if (argument === "--queue-input") config.queueInput = path.resolve(argv[++index]);
    else if (argument === "--batch-input") config.batchInput = path.resolve(argv[++index]);
    else if (argument === "--precision-input") config.precisionInput = path.resolve(argv[++index]);
    else if (argument === "--targeted-input") config.targetedInput = path.resolve(argv[++index]);
    else if (argument === "--sufficiency-input") config.sufficiencyInput = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  for (const [name, value] of Object.entries(config)) if (!value) throw new Error(`Missing argument: ${name}`);
  return config;
}

function fail(errors, message) { errors.push(message); }

function validateFingerprints(outputs, errors) {
  for (const name of WAVE_OUTPUT_FILES) {
    const copy = structuredClone(outputs[name]);
    const stored = copy.fingerprint;
    delete copy.fingerprint;
    if (stored !== fingerprint(copy)) fail(errors, `${name}: fingerprint mismatch.`);
  }
  const manifest = structuredClone(outputs["run-manifest.json"]);
  const stored = manifest.run_fingerprint;
  delete manifest.run_fingerprint;
  if (stored !== fingerprint(manifest)) fail(errors, "run-manifest.json: fingerprint mismatch.");
}

function validateAssessments(assessment, errors) {
  if (assessment.records.length !== 4480 || assessment.work_items_processed !== 4480) fail(errors, "Exactly 4,480 assessments are required.");
  if (unique(assessment.records.map(record => record.work_item_id)).length !== 4480) fail(errors, "Work item IDs must be unique.");
  const lanes = new Map();
  for (const record of assessment.records) {
    if (!lanes.has(record.lane_id)) lanes.set(record.lane_id, []);
    lanes.get(record.lane_id).push(record);
    if (record.qualification_state !== "NOT_QUALIFIED" || record.rights_cleared !== false || record.source_pool_promoted !== false || record.acquisition_authorized !== false || record.production !== "HOLD") {
      fail(errors, `${record.work_item_id}: fail-closed boundary violated.`);
    }
    if (!record.source_id) {
      if (record.automated_outcome !== "NO_CANDIDATE_AVAILABLE" || record.candidate_state !== "NO_CANDIDATE_AVAILABLE" || record.independent_family_key !== null) {
        fail(errors, `${record.work_item_id}: unfilled slot must be explicit.`);
      }
    } else {
      if (!record.endpoint_url || !record.owner || !record.independent_family_key) fail(errors, `${record.work_item_id}: assigned candidate lacks identity.`);
      if (!record.checks.exact_collection_scope_assignment || !record.checks.exact_source_role_assignment) fail(errors, `${record.work_item_id}: lane assignment mismatch.`);
      if (record.provisional_high_authority_candidate) {
        const allowed = ["TARGETED_HIGH_AUTHORITY", "PRECISION_V2_TRUSTED_SOURCE_REGISTRY", "PRECISION_V2_BOUNDED_ADAPTER_CONTRACT"];
        if (!allowed.includes(record.origin) || record.hard_rejection_reasons.length || !record.checks.hard_rejection_absent) {
          fail(errors, `${record.work_item_id}: rejected or disallowed candidate used as provisional positive.`);
        }
      }
    }
  }
  if (lanes.size !== 224) fail(errors, `Expected 224 lanes, found ${lanes.size}.`);
  for (const [laneId, records] of lanes) {
    if (records.length !== 20) fail(errors, `${laneId}: expected 20 records.`);
    const families = records.filter(record => record.independent_family_key).map(record => record.independent_family_key);
    const endpoints = records.filter(record => record.endpoint_url).map(record => record.endpoint_url);
    if (unique(families).length !== families.length) fail(errors, `${laneId}: duplicate family.`);
    if (unique(endpoints).length !== endpoints.length) fail(errors, `${laneId}: duplicate endpoint.`);
  }
}

export function validateWave001(config) {
  const errors = [];
  const outputs = {};
  for (const name of REQUIRED_FILES) {
    const file = path.join(config.output, name);
    if (!fs.existsSync(file)) fail(errors, `Missing output: ${name}`);
    else outputs[name] = readJson(file);
  }
  if (errors.length) return errors;

  const expected = normalizeWaveOutputsInMemory(executeAsiSufficiencyCalibrationWave001({
    queueInput: config.queueInput,
    batchInput: config.batchInput,
    precisionInput: config.precisionInput,
    targetedInput: config.targetedInput,
    sufficiencyInput: config.sufficiencyInput
  }));
  for (const name of REQUIRED_FILES) {
    if (stableJson(outputs[name]) !== stableJson(expected[name])) fail(errors, `${name}: deterministic recomputation mismatch.`);
  }

  const assessment = outputs["asi-sufficiency-calibration-wave-001-assessments.json"];
  const lane = outputs["lane-survival-and-yield-v1.json"];
  const families = outputs["source-family-resolution-v1.json"];
  const diversity = outputs["global-diversity-and-concentration-v1.json"];
  const attrition = outputs["source-attrition-taxonomy-v1.json"];
  const empirical = outputs["source-sufficiency-empirical-calibration-candidate-v1.json"];
  const nextWave = outputs["next-autonomous-source-work-wave-v1.json"];
  const manifest = outputs["run-manifest.json"];

  validateAssessments(assessment, errors);
  if (lane.records.length !== 224 || lane.lane_count !== 224 || unique(lane.records.map(record => record.lane_id)).length !== 224) fail(errors, "Lane metrics must cover 224 unique lanes.");
  for (const record of lane.records) {
    if (record.planned_candidate_assessments !== 20 || record.assigned_candidate_count + record.unfilled_slot_count !== 20) fail(errors, `${record.lane_id}: lane counts invalid.`);
    if (![20, 50, 100].includes(record.next_candidate_assessment_target)) fail(errors, `${record.lane_id}: next target invalid.`);
    if (record.source_pool_promoted !== false || record.acquisition_authorized !== false || record.production !== "HOLD") fail(errors, `${record.lane_id}: lane boundary violated.`);
  }
  if (families.independent_family_count !== families.records.length || unique(families.records.map(record => record.independent_family_key)).length !== families.records.length || families.duplicate_family_within_lane !== 0) fail(errors, "Family ledger invalid.");
  if (families.source_pool_promotions !== 0 || families.production !== "HOLD") fail(errors, "Family ledger boundary violated.");
  if (diversity.diversity_gate_pass !== false || diversity.source_pool_promotions !== 0 || diversity.production !== "HOLD") fail(errors, "Diversity Gate must remain closed.");
  if (attrition.total_work_items !== 4480 || attrition.source_pool_promotions !== 0 || attrition.production !== "HOLD") fail(errors, "Attrition output invalid.");
  if (empirical.status !== "CANDIDATE_NOT_APPLIED_TO_OFFICIAL_DRIVER_PROFILE" || empirical.acquisition_authorized !== false || empirical.production !== "HOLD") fail(errors, "Empirical candidate boundary invalid.");
  if (nextWave.records.length !== 224 || nextWave.lane_count !== 224 || unique(nextWave.records.map(record => record.lane_id)).length !== 224) fail(errors, "Next wave must cover 224 unique lanes.");
  if (nextWave.records.some(record => record.broad_generic_discovery !== "CLOSED") || nextWave.source_pool_promotions !== 0 || nextWave.acquisition_authorized !== false || nextWave.production !== "HOLD") fail(errors, "Next-wave boundary invalid.");
  if (manifest.status !== "PASS_AUTONOMOUS_PREASSESSMENT_NEXT_TARGETED_WAVE_READY" || manifest.work_items_processed !== 4480 || manifest.scope_role_lanes !== 224 || manifest.assigned_candidate_assessments + manifest.explicit_unfilled_slots !== 4480) fail(errors, "Manifest count or status invalid.");
  if (manifest.track_b_validation_complete !== false || manifest.official_empirical_profile_updated !== false || manifest.source_pool_promotions !== 0 || manifest.acquisition_authorized !== false || manifest.production !== "HOLD") fail(errors, "Manifest boundary violated.");

  validateFingerprints(outputs, errors);
  return errors;
}

const config = parseArgs(process.argv.slice(2));
const errors = validateWave001(config);
if (errors.length) {
  console.error(`KIDULTS ASI Sufficiency Calibration Wave 001 v2: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
const manifest = readJson(path.join(config.output, "run-manifest.json"));
console.log("KIDULTS ASI Sufficiency Calibration Wave 001 v2: PASS");
console.log(`Work items / lanes: ${manifest.work_items_processed} / ${manifest.scope_role_lanes}`);
console.log(`Assigned / unfilled: ${manifest.assigned_candidate_assessments} / ${manifest.explicit_unfilled_slots}`);
console.log(`Unique families / provisional high-authority families: ${manifest.unique_independent_families} / ${manifest.provisional_high_authority_families}`);
console.log(`Next wave H/M/N: ${manifest.high_priority_next_wave_lanes} / ${manifest.medium_priority_next_wave_lanes} / ${manifest.normal_priority_next_wave_lanes}`);
console.log("Track B validation: INCOMPLETE; Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
