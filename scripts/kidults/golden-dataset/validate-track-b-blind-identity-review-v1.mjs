import path from "node:path";
import process from "node:process";
import { readJson } from "../source-intelligence/asi-discovery-common-v1.mjs";

const directory = path.resolve(process.argv[2] ?? "");
const review = readJson(path.join(directory, "blind-review-frozen.json"));
const outcome = readJson(path.join(directory, "blind-review-outcome.json"));
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

assert(review.status === "REVIEW_FROZEN_BEFORE_HIDDEN_LINEAGE_COMPARISON", "Review freeze state mismatch.");
assert(review.review_independence === "PROCESS_INDEPENDENT_INTERNAL_NOT_EXTERNAL_AUDIT", "Independence boundary mismatch.");
assert(review.completed_records === 200 && review.unresolved_records === 0 && review.records.length === 200, "Review completion mismatch.");
assert(outcome.cases === 200 && outcome.correct + outcome.incorrect === 200, "Outcome case counts mismatch.");
assert(outcome.status === "CALIBRATION_THRESHOLD_FAIL", "Observed calibration failure must remain explicit.");
assert(outcome.correct === 168 && outcome.incorrect === 32 && outcome.accuracy === 0.84, "Observed blind-review result mismatch.");
assert(outcome.critical_false_auto_merge_count === 0, "Critical false auto-merge detected.");
assert(outcome.representativeness_gate.startsWith("FAIL_"), "Synthetic benchmark must not clear representativeness.");
assert(outcome.er_global_validation_authorized === false, "Global ER validation must remain blocked.");
assert(outcome.candidate_r2_authorized === false && outcome.production_eligible === false, "Candidate/Production must remain blocked.");

if (errors.length) {
  console.error(`Track B blind identity review: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Track B blind identity review record: PASS (${outcome.correct}/200, gate ${outcome.status})`);
console.log(`Representativeness gate: ${outcome.representativeness_gate}`);
