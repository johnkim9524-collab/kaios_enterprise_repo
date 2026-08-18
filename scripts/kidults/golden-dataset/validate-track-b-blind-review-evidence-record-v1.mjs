import fs from "node:fs";

const record = JSON.parse(fs.readFileSync("coordination/kidults/track-b/golden-dataset-v1-track-b-blind-review-r1.json", "utf8"));
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
assert(record.status === "COMPLETED_CALIBRATION_THRESHOLD_FAIL", "Status must preserve the failed gate.");
assert(record.review_mode === "PROCESS_INDEPENDENT_INTERNAL_BLIND_REVIEW_NOT_EXTERNAL_AUDIT", "Review boundary mismatch.");
assert(record.review_freeze.completed_records === 200 && record.review_freeze.unresolved_records === 0, "Review counts mismatch.");
assert(record.review_freeze.hidden_lineage_access_before_freeze === false, "Blind boundary mismatch.");
assert(record.outcome.correct === 168 && record.outcome.incorrect === 32 && record.outcome.accuracy === 0.84, "Outcome mismatch.");
assert(record.outcome.required_accuracy === 0.99 && record.track_b_decision.calibration_gate === "FAIL", "Threshold decision mismatch.");
assert(record.outcome.critical_false_auto_merge_count === 0, "Critical false auto-merge mismatch.");
assert(record.track_b_decision.global_entity_resolution_validated === false, "Global ER must remain blocked.");
assert(record.track_b_decision.candidate_r2_authorized === false, "Candidate R2 must remain blocked.");
assert(record.provider_contact === "HOLD" && record.production === "HOLD" && record.publication_eligible === false, "Safety boundary mismatch.");
if (errors.length) {
  console.error(`Track B blind-review evidence record: FAIL (${errors.length})`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log("Track B blind-review evidence record: PASS; calibration gate remains FAIL_CLOSED");
