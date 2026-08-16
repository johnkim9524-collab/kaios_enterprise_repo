import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const directory = path.resolve(process.argv[2] ?? "artifacts/autonomous-source-samples/fashion-authority-cross-source-r1");
const file = path.join(directory, "cross-source-report.json");
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

let report = null;
try {
  report = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  errors.push(`cross-source-report.json: ${error.message}`);
}

assert(report?.status === "COMPLETED_NOT_CANDIDATE", "Cross-source status mismatch.");
assert(report?.vertical_id === "fashion-accessories", "Vertical mismatch.");
assert(report?.combined_metrics?.source_family_count === 2, "Exactly two authority source families are required in R1.");
assert(report?.combined_metrics?.record_count === 24, "Combined bounded sample must contain 24 records.");
assert(report?.combined_metrics?.unique_source_record_count === 24, "Source-qualified record IDs must be unique.");
assert(report?.combined_metrics?.provenance_reference_coverage === 1, "Provenance coverage must be 100%.");
assert(report?.combined_metrics?.average_critical_field_completeness >= 0.85,
  "Combined critical-field completeness must be at least 85%.");
assert(report?.combined_metrics?.image_ingestion_count === 0, "Image ingestion must remain zero.");
assert(report?.combined_metrics?.credential_use_count === 0, "Credentials must not be used.");
assert(report?.combined_metrics?.paid_access_count === 0, "Paid access must not be used.");
assert(report?.combined_metrics?.mutation_count === 0, "Mutation must remain zero.");
assert(report?.candidate_eligible === false, "Two-source R1 must not be Candidate eligible.");
assert(report?.production_eligible === false, "Cross-source R1 must not be Production eligible.");
assert(report?.source_removal_sensitivity?.remove_met?.evidence_density_gate === "FAIL_SOURCE_DIVERSITY",
  "Met removal must fail source diversity.");
assert(report?.source_removal_sensitivity?.remove_vam?.evidence_density_gate === "FAIL_SOURCE_DIVERSITY",
  "V&A removal must fail source diversity.");

for (const candidate of [
  ...(report?.entity_resolution?.strong_match_candidates ?? []),
  ...(report?.entity_resolution?.manual_review_candidates ?? [])
]) {
  assert(candidate.score >= 0 && candidate.score <= 1, "Entity-match score must be 0–1.");
  assert(Array.isArray(candidate.reasons) && candidate.reasons.length > 0, "Entity-match reasons are required.");
}

if (errors.length) {
  console.error(`KIDULTS Fashion Authority Cross-Source: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS Fashion Authority Cross-Source: PASS");
console.log(`Source families: ${report.combined_metrics.source_family_count}`);
console.log(`Records: ${report.combined_metrics.record_count}`);
console.log(`Average completeness: ${report.combined_metrics.average_critical_field_completeness}`);
console.log(`Strong entity matches: ${report.entity_resolution.strong_match_candidates.length}`);
console.log("Source-removal sensitivity: FAIL-CLOSED PASS");
console.log("Candidate eligible: NO");
