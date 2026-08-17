import path from "node:path";
import process from "node:process";
import { fingerprint, readJson, unique } from "./asi-discovery-common-v1.mjs";
import { validateBatchAssessment } from "./validate-track-b-calibration-batch-assessment-v2.mjs";

function fail(errors, message) { errors.push(message); }

export function validateCalibration400(directory) {
  const errors = [];
  const batchRecords = [];
  const batchFingerprints = {};
  for (let batch = 2; batch <= 8; batch += 1) {
    const name = `track-b-calibration-assessment-batch-${String(batch).padStart(2, "0")}-v2.json`;
    errors.push(...validateBatchAssessment(directory, name).map(error => `batch-${String(batch).padStart(2, "0")}: ${error}`));
    const assessment = readJson(path.join(directory, name));
    batchRecords.push(...assessment.records);
    batchFingerprints[assessment.batch_id] = assessment.fingerprint;
  }
  const aggregate = readJson(path.join(directory, "track-b-calibration-assessment-400-v2.json"));
  const manifest = readJson(path.join(directory, "run-manifest.json"));
  if (aggregate.version !== "2.3.0") fail(errors, "Aggregate must use reviewer input v2.3.0.");
  if (aggregate.batches_completed !== 8 || aggregate.reviewed_records !== 400 || aggregate.records.length !== 400) fail(errors, "Aggregate must cover 8 batches and 400 cases.");
  if (aggregate.unresolved_records !== 0 || aggregate.records.some(record => record.resolution_state !== "RESOLVED")) fail(errors, "Aggregate must have zero unresolved cases.");
  if (unique(aggregate.records.map(record => record.review_case_id)).length !== 400) fail(errors, "Aggregate review_case_id coverage must be 400 unique.");
  if (unique(aggregate.records.map(record => record.endpoint_id)).length !== 400) fail(errors, "Aggregate endpoint_id coverage must be 400 unique.");
  const relevant = aggregate.records.filter(record => record.scope_relevance_label === "RELEVANT").length;
  const notRelevant = aggregate.records.filter(record => record.scope_relevance_label === "NOT_RELEVANT").length;
  if (aggregate.relevant_records !== relevant || aggregate.not_relevant_records !== notRelevant || relevant + notRelevant !== 400) fail(errors, "Aggregate relevance counts do not reconcile.");
  if (aggregate.observed_relevance_rate !== relevant / 400) fail(errors, "Aggregate relevance rate mismatch.");
  if (aggregate.direct_top200_review_complete !== false || aggregate.final_gold_assessment !== false) fail(errors, "400-case calibration must not claim final Top-200 or final Gold completion.");
  if (aggregate.source_pool_promotions !== 0 || aggregate.acquisition_authorized !== false || aggregate.candidate_r2 !== "BLOCKED" || aggregate.production !== "HOLD") fail(errors, "Aggregate fail-closed boundary violated.");
  if (aggregate.external_human_review !== false || aggregate.legal_opinion !== false) fail(errors, "Aggregate must disclose model-assisted scope accurately.");
  const copy = structuredClone(aggregate);
  const stored = copy.fingerprint;
  delete copy.fingerprint;
  if (stored !== fingerprint(copy)) fail(errors, "Aggregate fingerprint mismatch.");
  const manifestCopy = structuredClone(manifest);
  const storedRun = manifestCopy.run_fingerprint;
  delete manifestCopy.run_fingerprint;
  if (storedRun !== fingerprint(manifestCopy)) fail(errors, "Aggregate run-manifest fingerprint mismatch.");
  if (manifest.aggregate_assessment_fingerprint !== aggregate.fingerprint || manifest.reviewed_records !== 400 || manifest.unresolved_records !== 0 || manifest.batches_completed !== 8) fail(errors, "Run manifest does not reconcile with aggregate assessment.");
  if (manifest.direct_top200_review_complete !== false || manifest.source_pool_promotions !== 0 || manifest.acquisition_authorized !== false || manifest.candidate_r2 !== "BLOCKED" || manifest.production !== "HOLD") fail(errors, "Run manifest fail-closed boundary violated.");
  for (const [batchId, value] of Object.entries(batchFingerprints)) {
    if (aggregate.batch_assessment_fingerprints[batchId] !== value) fail(errors, `${batchId}: aggregate fingerprint pointer mismatch.`);
  }
  return errors;
}

const directory = path.resolve(process.argv[2] ?? "");
const errors = validateCalibration400(directory);
if (errors.length) {
  console.error(`KIDULTS Track B Calibration 400: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
const aggregate = readJson(path.join(directory, "track-b-calibration-assessment-400-v2.json"));
console.log("KIDULTS Track B Calibration 400: PASS");
console.log(`Reviewed 400/400; relevant ${aggregate.relevant_records}; unresolved 0; direct Top-200 BLOCKED; Production HOLD`);
