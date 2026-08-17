import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fingerprint } from "./asi-discovery-common-v1.mjs";

const requiredFiles = [
  "scope-and-role-lexicon-v1.json",
  "source-relevance-calibration-candidates-v1.json",
  "provisional-precision-ranked-universe-v1.json",
  "provisional-top-200-review-queue-v1.json",
  "rejected-and-held-candidate-register-v1.json",
  "source-relevance-precision-report-v1.json",
  "run-manifest.json"
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function without(object, key) {
  const clone = structuredClone(object);
  delete clone[key];
  return clone;
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function duplicateCount(values) {
  return values.length - new Set(values).size;
}

function validate(directory) {
  const errors = [];
  for (const file of requiredFiles) {
    assert(fs.existsSync(path.join(directory, file)), `Missing output: ${file}`, errors);
  }
  if (errors.length) return errors;

  const outputs = Object.fromEntries(requiredFiles.map(file => [file, readJson(path.join(directory, file))]));
  const lexicon = outputs["scope-and-role-lexicon-v1.json"];
  const calibration = outputs["source-relevance-calibration-candidates-v1.json"];
  const ranked = outputs["provisional-precision-ranked-universe-v1.json"];
  const top200 = outputs["provisional-top-200-review-queue-v1.json"];
  const held = outputs["rejected-and-held-candidate-register-v1.json"];
  const report = outputs["source-relevance-precision-report-v1.json"];
  const manifest = outputs["run-manifest.json"];

  for (const file of requiredFiles.filter(file => file !== "run-manifest.json")) {
    const value = outputs[file];
    assert(value.fingerprint === fingerprint(without(value, "fingerprint")), `${file}: fingerprint mismatch.`, errors);
  }
  assert(manifest.run_fingerprint === fingerprint(without(manifest, "run_fingerprint")), "run-manifest.json: run fingerprint mismatch.", errors);

  assert(manifest.status === "PRECISION_FOUNDATION_PASS_TRACK_B_LABELS_PENDING", "Manifest status mismatch.", errors);
  assert(report.status === "PRECISION_FOUNDATION_PASS_TRACK_B_LABELS_PENDING", "Precision report status mismatch.", errors);
  assert(lexicon.scope_count === 32, `Expected 32 Scope lexicons; found ${lexicon.scope_count}.`, errors);
  assert(lexicon.source_role_count >= 10, "Expected at least ten Source-role lexicons.", errors);
  assert(lexicon.query_text_counts_as_relevance_evidence === false, "Discovery query text must not count as relevance evidence.", errors);

  assert(ranked.record_count === manifest.input_endpoint_count, "Ranked-universe count mismatch.", errors);
  assert(ranked.record_count >= 2000, "Precision input must preserve at least the Batch 001 minimum endpoint universe.", errors);
  assert(ranked.empirical_precision_measured === false, "Automated ranking must not claim empirical precision.", errors);
  assert(duplicateCount(ranked.records.map(record => record.endpoint_id)) === 0, "Ranked universe has duplicate endpoint IDs.", errors);
  assert(duplicateCount(ranked.records.map(record => record.endpoint_url)) === 0, "Ranked universe has duplicate endpoint URLs.", errors);
  assert(ranked.records.every((record, index) => record.provisional_rank === index + 1), "Provisional ranks are not contiguous and deterministic.", errors);
  assert(ranked.records.every(record => record.scope_relevance_validated === false), "Automated ranking cannot mark Scope relevance validated.", errors);
  assert(ranked.records.every(record => record.source_role_relevance_validated === false), "Automated ranking cannot mark Source-role relevance validated.", errors);
  assert(ranked.records.every(record => record.acquisition_authorized === false), "Ranked universe authorized acquisition.", errors);

  assert(calibration.total_cases === 400, `Expected 400 calibration candidates; found ${calibration.total_cases}.`, errors);
  const expectedBuckets = {
    CLEAR_RELEVANT_CANDIDATE: 100,
    RELEVANT_WRONG_ROLE_CANDIDATE: 100,
    HARD_NEGATIVE_CANDIDATE: 100,
    CLEAR_GENERIC_OR_UNRELATED_NEGATIVE_CANDIDATE: 100
  };
  for (const [bucket, count] of Object.entries(expectedBuckets)) {
    assert(calibration.bucket_counts[bucket] === count, `${bucket}: expected ${count}; found ${calibration.bucket_counts[bucket]}.`, errors);
  }
  assert(duplicateCount(calibration.records.map(record => record.endpoint_id)) === 0, "Calibration set contains duplicate endpoints.", errors);
  assert(calibration.approved_gold_labels === 0, "No Gold labels may be auto-approved.", errors);
  assert(calibration.unresolved_cases === 400, "All calibration cases must remain unresolved before Track B.", errors);
  assert(calibration.records.every(record => record.label_state === "PROVISIONAL_PENDING_TRACK_B"), "Calibration label state mismatch.", errors);
  assert(calibration.records.every(record => record.track_b_relevance_label === null && record.track_b_source_role_label === null), "Automated process populated Track B labels.", errors);
  assert(calibration.records.every(record => record.best_scope_evidence && record.best_source_role_evidence), "Calibration case missing evidence objects.", errors);
  assert(calibration.records.every(record => record.acquisition_authorized === false), "Calibration case authorized acquisition.", errors);

  assert(top200.record_count === 200, `Expected provisional Top 200; found ${top200.record_count}.`, errors);
  assert(top200.measured_precision === null, "Top-200 precision must remain null before Track B labels.", errors);
  assert(top200.measured_precision_status === "NOT_AVAILABLE_BEFORE_TRACK_B_400_CASE_REVIEW", "Top-200 precision status mismatch.", errors);
  assert(duplicateCount(top200.records.map(record => record.endpoint_id)) === 0, "Top-200 queue contains duplicate endpoints.", errors);
  assert(top200.records.every(record => record.qualified_source === false), "Provisional Top-200 contains qualified Source claims.", errors);
  assert(top200.records.every(record => record.review_state === "PROVISIONAL_PENDING_TRACK_B_PRECISION_CALIBRATION"), "Top-200 review state mismatch.", errors);
  assert(top200.records.every(record => record.acquisition_authorized === false), "Top-200 queue authorized acquisition.", errors);

  assert(report.approved_gold_labels === 0, "Precision report auto-approved Gold labels.", errors);
  assert(report.track_b_reviewed_cases === 0, "Precision report fabricated Track B review count.", errors);
  assert(report.top_200_precision === null && report.top_50_precision === null, "Precision metrics must remain null before independent labels.", errors);
  assert(report.provisional_generic_rate_is_empirical_contamination === false, "Heuristic generic-pattern rate was misrepresented as empirical contamination.", errors);
  assert(report.acquisition_authorized === false, "Precision report authorized acquisition.", errors);
  assert(report.candidate_r2 === "BLOCKED", "Candidate R2 boundary mismatch.", errors);
  assert(report.kidult_500 === "NOT_COMPUTED" && report.kidult_100 === "NOT_COMPUTED", "Index boundary mismatch.", errors);
  assert(report.production === "HOLD", "Production boundary mismatch.", errors);

  assert(held.status === "AUTOMATED_PRELIMINARY_HOLD_REJECT_NOT_FINAL", "Held-register status mismatch.", errors);
  assert(held.records.every(record => record.final_rejection_authorized === false), "Automated process made final rejection decisions.", errors);

  assert(manifest.calibration_case_count === 400, "Manifest calibration count mismatch.", errors);
  assert(manifest.provisional_top_200_count === 200, "Manifest Top-200 count mismatch.", errors);
  assert(manifest.approved_gold_labels === 0, "Manifest Gold-label count mismatch.", errors);
  assert(manifest.track_b_review_complete === false, "Manifest fabricated Track B completion.", errors);
  assert(manifest.empirical_precision_measured === false, "Manifest fabricated empirical precision.", errors);
  assert(manifest.source_pool_promotions === 0, "Precision foundation promoted Source Pools.", errors);
  assert(manifest.acquisition_authorized === false, "Manifest authorized acquisition.", errors);
  assert(manifest.market_claims_created === 0, "Manifest created market claims.", errors);
  assert(manifest.candidate_r2_created === false, "Manifest created Candidate R2.", errors);
  assert(manifest.indexes_computed === 0, "Manifest computed Indexes.", errors);
  assert(manifest.production === "HOLD", "Manifest Production boundary mismatch.", errors);

  for (const [name, expected] of Object.entries(manifest.outputs)) {
    assert(outputs[name]?.fingerprint === expected, `Manifest output fingerprint mismatch: ${name}`, errors);
  }

  return errors;
}

const directory = path.resolve(process.argv[2] ?? path.join(process.cwd(), "artifacts", "agci-os", "source-relevance-precision-v1"));
const errors = validate(directory);
if (errors.length) {
  console.error(`KIDULTS Source Relevance Precision Recovery v1: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

const report = readJson(path.join(directory, "source-relevance-precision-report-v1.json"));
const calibration = readJson(path.join(directory, "source-relevance-calibration-candidates-v1.json"));
console.log("KIDULTS Source Relevance Precision Recovery v1: PASS");
console.log(`Input endpoints: ${report.input_endpoint_count}`);
console.log(`Calibration candidates: ${calibration.total_cases}`);
console.log("Approved Gold labels: 0 / 400 — Track B review required");
console.log("Top-200 / Top-50 empirical precision: NOT_MEASURED");
console.log("Source Pool promotion: 0");
console.log("Acquisition: BLOCKED");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
