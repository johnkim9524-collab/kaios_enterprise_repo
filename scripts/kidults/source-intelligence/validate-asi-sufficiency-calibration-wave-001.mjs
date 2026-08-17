import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  fingerprint,
  readJson,
  stableJson,
  unique
} from "./asi-discovery-common-v1.mjs";
import { executeAsiSufficiencyCalibrationWave001 } from "./execute-asi-sufficiency-calibration-wave-001.mjs";

const REQUIRED_FILES = [
  "asi-sufficiency-calibration-wave-001-assessments.json",
  "lane-survival-and-yield-v1.json",
  "source-family-resolution-v1.json",
  "global-diversity-and-concentration-v1.json",
  "source-attrition-taxonomy-v1.json",
  "source-sufficiency-empirical-calibration-candidate-v1.json",
  "next-autonomous-source-work-wave-v1.json",
  "run-manifest.json"
];

function parseArgs(argv) {
  const config = {
    output: null,
    queueInput: null,
    batchInput: null,
    precisionInput: null,
    targetedInput: null,
    sufficiencyInput: null
  };
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
  for (const [name, value] of Object.entries(config)) {
    if (!value) throw new Error(`Missing validation argument: ${name}`);
  }
  return config;
}

function fail(errors, message) {
  errors.push(message);
}

function validateFingerprints(outputs, errors) {
  for (const [name, value] of Object.entries(outputs)) {
    if (name === "run-manifest.json") continue;
    const copy = structuredClone(value);
    const stored = copy.fingerprint;
    delete copy.fingerprint;
    if (stored !== fingerprint(copy)) fail(errors, `${name}: fingerprint mismatch.`);
  }
  const manifest = outputs["run-manifest.json"];
  const copy = structuredClone(manifest);
  const stored = copy.run_fingerprint;
  delete copy.run_fingerprint;
  if (stored !== fingerprint(copy)) fail(errors, "run-manifest.json: run fingerprint mismatch.");
}

function validateLaneUniqueness(assessments, errors) {
  const byLane = new Map();
  for (const record of assessments.records) {
    if (!byLane.has(record.lane_id)) byLane.set(record.lane_id, []);
    byLane.get(record.lane_id).push(record);
  }
  for (const [laneId, records] of byLane) {
    if (records.length !== 20) fail(errors, `${laneId}: expected 20 work items, received ${records.length}.`);
    const assignedFamilies = records
      .filter(record => record.independent_family_key)
      .map(record => record.independent_family_key);
    if (unique(assignedFamilies).length !== assignedFamilies.length) {
      fail(errors, `${laneId}: duplicate independent family within one lane.`);
    }
    const assignedEndpoints = records
      .filter(record => record.endpoint_url)
      .map(record => record.endpoint_url);
    if (unique(assignedEndpoints).length !== assignedEndpoints.length) {
      fail(errors, `${laneId}: duplicate endpoint within one lane.`);
    }
  }
}

function validateAssessmentRecords(assessments, errors) {
  for (const record of assessments.records) {
    if (record.source_id === null) {
      if (record.automated_outcome !== "NO_CANDIDATE_AVAILABLE"
        || record.candidate_state !== "NO_CANDIDATE_AVAILABLE"
        || record.independent_family_key !== null) {
        fail(errors, `${record.work_item_id}: unfilled slot is not explicit and fail-closed.`);
      }
    } else {
      if (!record.endpoint_url || !record.owner || !record.independent_family_key) {
        fail(errors, `${record.work_item_id}: assigned record lacks endpoint, owner or family key.`);
      }
      if (!record.checks.exact_collection_scope_assignment || !record.checks.exact_source_role_assignment) {
        fail(errors, `${record.work_item_id}: candidate is not exactly assigned to the lane Scope and Role.`);
      }
      if (record.provisional_high_authority_candidate) {
        const allowedOrigins = [
          "TARGETED_HIGH_AUTHORITY",
          "PRECISION_V2_TRUSTED_SOURCE_REGISTRY",
          "PRECISION_V2_BOUNDED_ADAPTER_CONTRACT"
        ];
        if (!allowedOrigins.includes(record.origin)) {
          fail(errors, `${record.work_item_id}: provisional positive uses disallowed origin ${record.origin}.`);
        }
        if (record.hard_rejection_reasons.length || !record.checks.hard_rejection_absent) {
          fail(errors, `${record.work_item_id}: hard-rejected candidate was used as provisional positive padding.`);
        }
        if (record.automated_outcome !== "PROVISIONAL_HIGH_AUTHORITY_CANDIDATE_NOT_QUALIFIED") {
          fail(errors, `${record.work_item_id}: provisional positive outcome mismatch.`);
        }
      }
    }
    if (record.qualification_state !== "NOT_QUALIFIED"
      || record.rights_cleared !== false
      || record.source_pool_promoted !== false
      || record.acquisition_authorized !== false
      || record.production !== "HOLD") {
      fail(errors, `${record.work_item_id}: fail-closed boundary violated.`);
    }
  }
}

export function validateAsiSufficiencyCalibrationWave001(config) {
  const errors = [];
  const outputs = {};
  for (const name of REQUIRED_FILES) {
    const file = path.join(config.output, name);
    if (!fs.existsSync(file)) fail(errors, `Missing output: ${name}`);
    else outputs[name] = readJson(file);
  }
  if (errors.length) return errors;

  const expected = executeAsiSufficiencyCalibrationWave001({
    queueInput: config.queueInput,
    batchInput: config.batchInput,
    precisionInput: config.precisionInput,
    targetedInput: config.targetedInput,
    sufficiencyInput: config.sufficiencyInput
  });
  for (const name of REQUIRED_FILES) {
    if (stableJson(outputs[name]) !== stableJson(expected[name])) {
      fail(errors, `${name}: output differs from deterministic recomputation.`);
    }
  }

  const assessments = outputs["asi-sufficiency-calibration-wave-001-assessments.json"];
  const lane = outputs["lane-survival-and-yield-v1.json"];
  const families = outputs["source-family-resolution-v1.json"];
  const diversity = outputs["global-diversity-and-concentration-v1.json"];
  const attrition = outputs["source-attrition-taxonomy-v1.json"];
  const empirical = outputs["source-sufficiency-empirical-calibration-candidate-v1.json"];
  const nextWave = outputs["next-autonomous-source-work-wave-v1.json"];
  const manifest = outputs["run-manifest.json"];

  if (assessments.work_items_processed !== 4480 || assessments.records.length !== 4480) {
    fail(errors, "Exactly 4,480 work items must be processed.");
  }
  if (unique(assessments.records.map(record => record.work_item_id)).length !== 4480) {
    fail(errors, "Work item IDs must be unique.");
  }
  if (unique(assessments.records.map(record => record.lane_id)).length !== 224) {
    fail(errors, "Exactly 224 Scope-role lanes must be represented.");
  }
  validateLaneUniqueness(assessments, errors);
  validateAssessmentRecords(assessments, errors);

  if (lane.lane_count !== 224 || lane.records.length !== 224) {
    fail(errors, "Lane survival output must contain 224 records.");
  }
  if (unique(lane.records.map(record => record.lane_id)).length !== 224) {
    fail(errors, "Lane metric IDs must be unique.");
  }
  for (const record of lane.records) {
    if (record.planned_candidate_assessments !== 20) fail(errors, `${record.lane_id}: planned sample must be 20.`);
    if (record.assigned_candidate_count + record.unfilled_slot_count !== 20) fail(errors, `${record.lane_id}: assigned plus unfilled must equal 20.`);
    if (!record.next_wave_priority || ![20, 50, 100].includes(record.next_candidate_assessment_target)) {
      fail(errors, `${record.lane_id}: next-wave priority or target is invalid.`);
    }
    if (record.source_pool_promoted !== false || record.acquisition_authorized !== false || record.production !== "HOLD") {
      fail(errors, `${record.lane_id}: lane boundary violated.`);
    }
  }

  if (families.independent_family_count !== families.records.length) {
    fail(errors, "Family count does not match family records.");
  }
  if (unique(families.records.map(record => record.independent_family_key)).length !== families.records.length) {
    fail(errors, "Family keys must be globally unique.");
  }
  if (families.duplicate_family_within_lane !== 0 || families.source_pool_promotions !== 0 || families.production !== "HOLD") {
    fail(errors, "Family-resolution boundary is invalid.");
  }

  if (diversity.diversity_gate_pass !== false || diversity.source_pool_promotions !== 0 || diversity.production !== "HOLD") {
    fail(errors, "Diversity Gate must remain fail-closed.");
  }
  if (attrition.total_work_items !== 4480 || attrition.source_pool_promotions !== 0 || attrition.production !== "HOLD") {
    fail(errors, "Attrition output is invalid or promotes Sources.");
  }
  if (empirical.status !== "CANDIDATE_NOT_APPLIED_TO_OFFICIAL_DRIVER_PROFILE"
    || empirical.official_profile_update !== "BLOCKED_PENDING_TRACK_B_STRATIFIED_SAMPLE_AND_RIGHTS_TECHNICAL_PREFLIGHT"
    || empirical.source_pool_promotions !== 0
    || empirical.acquisition_authorized !== false
    || empirical.production !== "HOLD") {
    fail(errors, "Empirical calibration candidate must not update the official profile or authorize use.");
  }

  if (nextWave.lane_count !== 224 || nextWave.records.length !== 224) {
    fail(errors, "Next autonomous work wave must cover all 224 lanes.");
  }
  if (unique(nextWave.records.map(record => record.lane_id)).length !== 224) {
    fail(errors, "Next-wave lanes must be unique.");
  }
  if (nextWave.records.some(record => record.broad_generic_discovery !== "CLOSED")) {
    fail(errors, "Broad generic discovery must remain closed.");
  }
  if (nextWave.source_pool_promotions !== 0 || nextWave.acquisition_authorized !== false || nextWave.production !== "HOLD") {
    fail(errors, "Next-wave boundary violated.");
  }

  if (manifest.status !== "PASS_AUTONOMOUS_PREASSESSMENT_NEXT_TARGETED_WAVE_READY"
    || manifest.work_items_processed !== 4480
    || manifest.scope_role_lanes !== 224
    || manifest.track_b_validation_complete !== false
    || manifest.official_empirical_profile_updated !== false
    || manifest.source_pool_promotions !== 0
    || manifest.acquisition_authorized !== false
    || manifest.production !== "HOLD") {
    fail(errors, "Run manifest status or boundary is invalid.");
  }
  if (manifest.assigned_candidate_assessments + manifest.explicit_unfilled_slots !== 4480) {
    fail(errors, "Manifest assigned plus unfilled count must equal 4,480.");
  }

  validateFingerprints(outputs, errors);
  return errors;
}

const config = parseArgs(process.argv.slice(2));
const errors = validateAsiSufficiencyCalibrationWave001(config);
if (errors.length) {
  console.error(`KIDULTS ASI Sufficiency Calibration Wave 001: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
const manifest = readJson(path.join(config.output, "run-manifest.json"));
console.log("KIDULTS ASI Sufficiency Calibration Wave 001: PASS");
console.log(`Work items / lanes: ${manifest.work_items_processed} / ${manifest.scope_role_lanes}`);
console.log(`Assigned / unfilled: ${manifest.assigned_candidate_assessments} / ${manifest.explicit_unfilled_slots}`);
console.log(`Unique families / provisional high-authority families: ${manifest.unique_independent_families} / ${manifest.provisional_high_authority_families}`);
console.log(`Next wave H/M/N: ${manifest.high_priority_next_wave_lanes} / ${manifest.medium_priority_next_wave_lanes} / ${manifest.normal_priority_next_wave_lanes}`);
console.log("Track B validation: INCOMPLETE; Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
