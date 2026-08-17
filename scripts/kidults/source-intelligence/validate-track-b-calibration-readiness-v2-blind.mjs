import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fingerprint, readJson, unique } from "./asi-discovery-common-v1.mjs";
import { validateTrackBCalibrationReadiness } from "./validate-track-b-calibration-readiness-v2.mjs";

const FORBIDDEN_BUCKET_TOKENS = [
  "clear-relevant",
  "relevant-wrong-role",
  "hard-negative",
  "clear-generic-or-unrelated-negative"
];

function fail(errors, message) { errors.push(message); }

export function validateTrackBCalibrationReadinessBlind(directory) {
  const errors = validateTrackBCalibrationReadiness(directory);
  const review = readJson(path.join(directory, "track-b-calibration-review-package-v2.json"));
  const batches = readJson(path.join(directory, "track-b-calibration-batches-v2.json"));
  const template = readJson(path.join(directory, "track-b-label-assessment-template-v2.json"));
  const manifest = readJson(path.join(directory, "run-manifest.json"));

  if (review.version !== "2.1.0") fail(errors, "Blind review package must be version 2.1.0.");
  if (review.blindness_hardening?.original_bucket_identifiers_exposed !== false) fail(errors, "Bucket identifiers must not be exposed.");
  if (review.blindness_hardening?.original_case_ids_opaque !== true) fail(errors, "Original case IDs must be opaque.");
  if (review.blindness_hardening?.deterministic_blind_shuffle !== true) fail(errors, "Deterministic blind shuffle must be enabled.");

  const serialized = JSON.stringify(review).toLowerCase();
  for (const token of FORBIDDEN_BUCKET_TOKENS) {
    if (serialized.includes(token)) fail(errors, `Reviewer-visible payload leaks forbidden bucket token: ${token}`);
  }

  for (const record of review.records) {
    if (!String(record.original_case_id).startsWith("blind-src-")) fail(errors, `${record.review_case_id}: original_case_id is not opaque.`);
    if (!/^track-b-calibration-v2-blind-\d{3}$/.test(record.review_case_id)) fail(errors, `${record.review_case_id}: reviewer case ID is not blindness-hardened.`);
    if (Object.prototype.hasOwnProperty.call(record, "provisional_bucket")) fail(errors, `${record.review_case_id}: provisional bucket key leaked.`);
    if (Object.prototype.hasOwnProperty.call(record, "provisional_relevance_score")) fail(errors, `${record.review_case_id}: provisional score key leaked.`);
  }

  const expectedIds = review.records.map(record => record.review_case_id);
  const batchIds = batches.batches.flatMap(batch => batch.review_case_ids);
  if (unique(batchIds).length !== 400 || batchIds.length !== 400) fail(errors, "Blind batches must cover 400 unique cases exactly once.");
  if (batchIds.some(id => !expectedIds.includes(id))) fail(errors, "Blind batch references unknown reviewer case ID.");
  if (template.records.some(record => !expectedIds.includes(record.review_case_id))) fail(errors, "Assessment template references unknown reviewer case ID.");

  if (manifest.calibration_blindness_hardening !== "PASS") fail(errors, "Run manifest must record blindness hardening PASS.");
  if (manifest.original_bucket_identifiers_exposed !== false || manifest.deterministic_blind_shuffle !== true) fail(errors, "Run manifest blindness flags are invalid.");

  const manifestCopy = structuredClone(manifest);
  const storedManifestFingerprint = manifestCopy.run_fingerprint;
  delete manifestCopy.run_fingerprint;
  if (storedManifestFingerprint !== fingerprint(manifestCopy)) fail(errors, "Run manifest fingerprint mismatch after blindness hardening.");
  return errors;
}

const directory = path.resolve(process.argv[2] ?? "");
const errors = validateTrackBCalibrationReadinessBlind(directory);
if (errors.length) {
  console.error(`KIDULTS Track B Calibration Readiness v2.1 Blindness: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log("KIDULTS Track B Calibration Readiness v2.1 Blindness: PASS");
console.log("Original bucket leakage: 0; deterministic blind shuffle: PASS; Production: HOLD");
