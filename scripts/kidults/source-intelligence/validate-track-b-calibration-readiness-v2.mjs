import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fingerprint, readJson, unique } from "./asi-discovery-common-v1.mjs";

const REQUIRED_FILES = [
  "track-b-calibration-review-package-v2.json",
  "track-b-calibration-batches-v2.json",
  "track-b-label-assessment-template-v2.json",
  "high-authority-source-depth-ledger-v2.json",
  "scope-source-expansion-work-queue-v2.json",
  "source-role-depth-gap-matrix-v2.json",
  "top200-readiness-gate-v2.json",
  "run-manifest.json"
];

function fail(errors, message) { errors.push(message); }

function validateFingerprints(outputs, errors) {
  for (const [name, value] of Object.entries(outputs)) {
    if (name === "run-manifest.json") continue;
    const copy = structuredClone(value);
    const stored = copy.fingerprint;
    delete copy.fingerprint;
    if (stored !== fingerprint(copy)) fail(errors, `${name}: fingerprint mismatch.`);
  }
}

export function validateTrackBCalibrationReadiness(directory) {
  const errors = [];
  const outputs = {};
  for (const name of REQUIRED_FILES) {
    const file = path.join(directory, name);
    if (!fs.existsSync(file)) fail(errors, `Missing output: ${name}`);
    else outputs[name] = readJson(file);
  }
  if (errors.length) return errors;

  const review = outputs["track-b-calibration-review-package-v2.json"];
  const batches = outputs["track-b-calibration-batches-v2.json"];
  const template = outputs["track-b-label-assessment-template-v2.json"];
  const ledger = outputs["high-authority-source-depth-ledger-v2.json"];
  const scopeQueue = outputs["scope-source-expansion-work-queue-v2.json"];
  const roleMatrix = outputs["source-role-depth-gap-matrix-v2.json"];
  const top200 = outputs["top200-readiness-gate-v2.json"];
  const manifest = outputs["run-manifest.json"];

  if (review.record_count !== 400 || review.records.length !== 400) fail(errors, "Review package must contain 400 cases.");
  if (unique(review.records.map(record => record.review_case_id)).length !== 400) fail(errors, "Review case IDs must be unique.");
  if (unique(review.records.map(record => record.original_case_id)).length !== 400) fail(errors, "Original calibration case IDs must be unique.");
  for (const record of review.records) {
    if (record.numeric_score_visible_to_reviewer !== false || record.provisional_bucket_visible_to_reviewer !== false) fail(errors, `${record.review_case_id}: blind review boundary violated.`);
    if ("provisional_relevance_score" in record || "provisional_bucket" in record) fail(errors, `${record.review_case_id}: hidden ranking field leaked.`);
    if (record.scope_relevance_label !== null || record.source_role_label !== null || record.resolution_state !== "PENDING_TRACK_B_REVIEW") fail(errors, `${record.review_case_id}: review package must remain unlabeled.`);
    if (record.source_pool_promoted !== false || record.acquisition_authorized !== false || record.production !== "HOLD") fail(errors, `${record.review_case_id}: fail-closed boundary violated.`);
  }

  if (batches.batch_count !== 8 || batches.batches.length !== 8 || batches.total_cases !== 400) fail(errors, "Expected eight deterministic batches and 400 total cases.");
  const batchCaseIds = batches.batches.flatMap(batch => batch.review_case_ids);
  if (batches.batches.some(batch => batch.case_count !== 50 || batch.review_case_ids.length !== 50)) fail(errors, "Each calibration batch must contain exactly 50 cases.");
  if (unique(batchCaseIds).length !== 400 || new Set(batchCaseIds).size !== review.records.length) fail(errors, "Batches must cover every case exactly once.");
  const reviewIds = new Set(review.records.map(record => record.review_case_id));
  if (batchCaseIds.some(id => !reviewIds.has(id))) fail(errors, "Batch contains an unknown review case ID.");

  if (template.required_records !== 400 || template.records.length !== 400 || template.completed_records !== 0 || template.unresolved_records !== 400 || template.final_gold_assessment !== false) fail(errors, "Assessment template state is invalid.");
  if (template.records.some(record => record.scope_relevance_label !== null || record.source_role_label !== null || record.resolution_state !== "PENDING_TRACK_B_REVIEW")) fail(errors, "Assessment template must be empty and unresolved.");

  const ledgerKeys = ledger.records.map(record => `${String(record.owner).toLowerCase()}|${record.endpoint_url}`);
  if (unique(ledgerKeys).length !== ledger.records.length) fail(errors, "Strong Source ledger contains duplicate owner-endpoint families.");
  if (ledger.unique_strong_candidate_count !== ledger.records.length) fail(errors, "Strong Source ledger count mismatch.");
  if (ledger.source_pool_promotions !== 0 || ledger.acquisition_authorized !== false || ledger.production !== "HOLD") fail(errors, "Strong Source ledger fail-closed boundary violated.");
  if (ledger.records.some(record => record.source_pool_promoted !== false || record.acquisition_authorized !== false || record.production !== "HOLD")) fail(errors, "Strong Source record boundary violated.");

  if (scopeQueue.scope_count !== 32 || scopeQueue.records.length !== 32) fail(errors, "Scope expansion queue must contain all 32 Collection Scopes.");
  if (unique(scopeQueue.records.map(record => record.scope_id)).length !== 32) fail(errors, "Scope expansion queue contains duplicate Scope IDs.");
  const calculatedAssignments = scopeQueue.records.reduce((sum, record) => sum + record.current_strong_source_count, 0);
  const calculatedGap = scopeQueue.records.reduce((sum, record) => sum + record.primary_source_gap, 0);
  if (scopeQueue.current_scope_source_assignments !== calculatedAssignments || scopeQueue.remaining_scope_source_gap !== calculatedGap) fail(errors, "Scope expansion counts do not reconcile.");
  for (const record of scopeQueue.records) {
    if (record.target_primary_sources !== 8 || record.primary_source_gap !== Math.max(0, 8 - record.current_strong_source_count)) fail(errors, `${record.scope_id}: Source-depth target or gap is invalid.`);
    if (record.acquisition_authorized !== false || record.production !== "HOLD") fail(errors, `${record.scope_id}: queue boundary violated.`);
  }

  if (roleMatrix.lane_count !== 224 || roleMatrix.records.length !== 224) fail(errors, "Source-role matrix must contain 32 × 7 = 224 lanes.");
  if (unique(roleMatrix.records.map(record => record.lane_id)).length !== 224) fail(errors, "Source-role lane IDs must be unique.");
  const calculatedCovered = roleMatrix.records.filter(record => record.gap === 0).length;
  const calculatedRoleGaps = roleMatrix.records.filter(record => record.gap > 0).length;
  if (roleMatrix.covered_lane_count !== calculatedCovered || roleMatrix.gap_lane_count !== calculatedRoleGaps) fail(errors, "Source-role matrix totals do not reconcile.");

  const expectedReady = ledger.unique_strong_candidate_count >= top200.required_unique_candidate_count && scopeQueue.records.every(record => record.primary_source_gap === 0);
  if (top200.direct_top200_ready !== expectedReady) fail(errors, "Top-200 readiness calculation is inconsistent.");
  if (top200.rejected_or_insufficient_padding_records !== 0 || top200.padding_with_rejected_or_insufficient_records !== "PROHIBITED" || top200.direct_top200_queue_created !== false) fail(errors, "Top-200 padding or queue boundary violated.");
  if (!expectedReady && top200.status !== "BLOCKED_INSUFFICIENT_HIGH_CONFIDENCE_SOURCE_DEPTH") fail(errors, "Insufficient-depth state must fail closed.");
  if (top200.source_pool_promotions !== 0 || top200.acquisition_authorized !== false || top200.candidate_r2 !== "BLOCKED" || top200.kidult_500 !== "NOT_COMPUTED" || top200.kidult_100 !== "NOT_COMPUTED" || top200.production !== "HOLD") fail(errors, "Top-200 gate boundary violated.");

  if (manifest.calibration_cases_packaged !== 400 || manifest.calibration_batches !== 8 || manifest.completed_calibration_reviews !== 0) fail(errors, "Manifest calibration state is invalid.");
  if (manifest.unique_strong_candidate_count !== ledger.unique_strong_candidate_count || manifest.collection_scopes_in_work_queue !== 32 || manifest.scope_source_assignment_gap !== scopeQueue.remaining_scope_source_gap || manifest.mandatory_role_gap_lanes !== roleMatrix.gap_lane_count || manifest.direct_top200_ready !== top200.direct_top200_ready) fail(errors, "Manifest totals do not reconcile.");
  if (manifest.direct_top200_queue_created !== false || manifest.top200_padding_records !== 0 || manifest.source_pool_promotions !== 0 || manifest.acquisition_authorized !== false || manifest.candidate_r2 !== "BLOCKED" || manifest.indexes_computed !== 0 || manifest.production !== "HOLD") fail(errors, "Manifest fail-closed boundary violated.");

  validateFingerprints(outputs, errors);
  const manifestCopy = structuredClone(manifest);
  const stored = manifestCopy.run_fingerprint;
  delete manifestCopy.run_fingerprint;
  if (stored !== fingerprint(manifestCopy)) fail(errors, "Run manifest fingerprint mismatch.");
  return errors;
}

const directory = path.resolve(process.argv[2] ?? "");
const errors = validateTrackBCalibrationReadiness(directory);
if (errors.length) {
  console.error(`KIDULTS Track B Calibration Readiness v2: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
const manifest = readJson(path.join(directory, "run-manifest.json"));
console.log("KIDULTS Track B Calibration Readiness v2: PASS");
console.log(`Calibration cases / batches: ${manifest.calibration_cases_packaged} / ${manifest.calibration_batches}`);
console.log(`Unique strong Source candidates: ${manifest.unique_strong_candidate_count}`);
console.log(`Scope assignment gap / mandatory role gap lanes: ${manifest.scope_source_assignment_gap} / ${manifest.mandatory_role_gap_lanes}`);
console.log(`Direct Top-200 ready: ${manifest.direct_top200_ready}`);
console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
