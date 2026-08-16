import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const output = path.resolve(process.argv[2] ?? "artifacts/agci-os/golden-dataset-v1-candidate");
const errors = [];

function read(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(output, name), "utf8"));
  } catch (error) {
    errors.push(`${name}: ${error.message}`);
    return null;
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const dataset = read("golden-dataset-v1-candidate.json");
const queue = read("label-review-queue.json");
const expectedClasses = {
  SAME_PHYSICAL_OBJECT_NORMALIZATION_CONTROL: 50,
  SAME_DESIGN_DIFFERENT_PHYSICAL_OBJECT_CANDIDATE: 50,
  HARD_NEGATIVE_SIMILAR_METADATA: 50,
  CLEAR_NEGATIVE_CROSS_DOMAIN: 50
};

assert(dataset?.dataset_id === "golden-dataset-v1-candidate-r1", "Dataset ID mismatch.");
assert(dataset?.status === "LABELING_QUEUE_READY_NOT_APPROVED", "Dataset status mismatch.");
assert(dataset?.case_count === 200, "Golden Dataset candidate must contain exactly 200 cases.");
for (const [key, value] of Object.entries(expectedClasses)) {
  assert(dataset?.case_class_counts?.[key] === value, `${key}: expected ${value} cases.`);
}
assert(dataset?.provisional_label_count === 200, "All 200 labels must remain provisional.");
assert(dataset?.approved_label_count === 0, "No label may be pre-approved by Track A.");
assert(dataset?.rejected_label_count === 0, "No case may be rejected before Track B review.");
assert(dataset?.unreviewed_label_count === 200, "All cases must remain unreviewed at handoff.");
assert(dataset?.provenance_coverage === 1, "Case-level provenance coverage must be 100%.");
assert(dataset?.rights_state_coverage === 1, "Case-level rights-state coverage must be 100%.");
assert(dataset?.provider_id_promoted_to_canonical_count === 0, "Provider IDs cannot become canonical IDs.");
assert(dataset?.auto_merge_authorized_count === 0, "Auto-merge authorization must remain zero.");
assert(dataset?.target_accuracy === 0.99, "Entity-resolution target accuracy must be 99%.");
assert(dataset?.measured_accuracy === null, "Accuracy cannot be measured before Track B label approval.");
assert(dataset?.measured_accuracy_status === "NOT_AVAILABLE_UNTIL_TRACK_B_LABEL_APPROVAL",
  "Measured accuracy status mismatch.");
assert(dataset?.approval_gate === "TRACK_B_INDEPENDENT_LABEL_REVIEW", "Track B approval gate mismatch.");
assert(dataset?.publication_eligible === false && dataset?.production_eligible === false,
  "Golden Dataset candidate must not be publishable or Production eligible.");
assert(/^sha256:[a-f0-9]{64}$/.test(dataset?.dataset_fingerprint ?? ""), "Dataset fingerprint is invalid.");

const caseIds = new Set();
for (const item of dataset?.cases ?? []) {
  assert(!caseIds.has(item.case_id), `Duplicate case ID: ${item.case_id}`);
  caseIds.add(item.case_id);
  assert(item.label_status === "PROVISIONAL_PENDING_TRACK_B", `${item.case_id}: label status mismatch.`);
  assert(item.approved_label === null && item.approved_by === null && item.approved_at === null,
    `${item.case_id}: approval fields must remain null.`);
  assert(item.provenance_coverage === 1, `${item.case_id}: provenance coverage mismatch.`);
  assert(item.rights_state_explicit === true, `${item.case_id}: rights state must be explicit.`);
  assert(item.provider_id_promoted_to_canonical === false, `${item.case_id}: Provider ID promotion prohibited.`);
  assert(item.auto_merge_authorized === false, `${item.case_id}: auto-merge authorization prohibited.`);
  assert(item.publication_eligible === false && item.production_eligible === false,
    `${item.case_id}: public/Production boundary violation.`);
  assert(Boolean(item.left?.source_record_id && item.right?.source_record_id), `${item.case_id}: source record references required.`);
  assert(Boolean(item.left?.provenance_reference && item.right?.provenance_reference), `${item.case_id}: provenance references required.`);
  assert(Boolean(item.left?.rights_state && item.right?.rights_state), `${item.case_id}: rights states required.`);

  if (item.case_class === "SAME_PHYSICAL_OBJECT_NORMALIZATION_CONTROL") {
    assert(item.left.source_record_id === item.right.source_record_id,
      `${item.case_id}: same-physical control must retain exact source identity.`);
    assert(item.left.physical_object_candidate_id === item.right.physical_object_candidate_id,
      `${item.case_id}: same-physical control must retain exact Physical Object candidate ID.`);
    assert(item.provisional_expected_relation === "SAME_PHYSICAL_OBJECT",
      `${item.case_id}: same-physical provisional relation mismatch.`);
    assert(item.objective_control_type === "EXACT_SOURCE_IDENTITY",
      `${item.case_id}: exact-source identity control marker required.`);
  } else if (item.case_class === "SAME_DESIGN_DIFFERENT_PHYSICAL_OBJECT_CANDIDATE") {
    assert(item.left.source_record_id !== item.right.source_record_id,
      `${item.case_id}: same-design candidate must use distinct source records.`);
    assert(item.left.physical_object_candidate_id !== item.right.physical_object_candidate_id,
      `${item.case_id}: same-design candidate must use distinct Physical Objects.`);
    assert(item.left.canonical_design_candidate_key === item.right.canonical_design_candidate_key,
      `${item.case_id}: candidate design keys must match.`);
    assert(item.provisional_expected_relation === "SAME_CANONICAL_DESIGN_DIFFERENT_PHYSICAL_OBJECT",
      `${item.case_id}: same-design provisional relation mismatch.`);
    assert(item.difficulty === "HIGH_REVIEW_REQUIRED", `${item.case_id}: same-design cases require high review.`);
  } else if (item.case_class === "HARD_NEGATIVE_SIMILAR_METADATA") {
    assert(item.left.source_record_id !== item.right.source_record_id,
      `${item.case_id}: hard negative must use distinct source records.`);
    assert(item.left.canonical_design_candidate_key !== item.right.canonical_design_candidate_key,
      `${item.case_id}: hard negative candidate design keys must differ.`);
    assert(item.provisional_expected_relation === "DIFFERENT_CANONICAL_DESIGN",
      `${item.case_id}: hard-negative relation mismatch.`);
    assert(item.difficulty === "HARD", `${item.case_id}: hard-negative difficulty mismatch.`);
  } else if (item.case_class === "CLEAR_NEGATIVE_CROSS_DOMAIN") {
    assert(item.left.core_domain_hint !== item.right.core_domain_hint,
      `${item.case_id}: clear negative must cross Core Domain hints.`);
    assert(item.provisional_expected_relation === "DIFFERENT_PHYSICAL_OBJECT_AND_DESIGN",
      `${item.case_id}: clear-negative relation mismatch.`);
    assert(item.difficulty === "LOW", `${item.case_id}: clear-negative difficulty mismatch.`);
  } else {
    assert(false, `${item.case_id}: unsupported case class ${item.case_class}.`);
  }
}
assert(caseIds.size === 200, "Unique case ID count must be 200.");

assert(queue?.queue_id === "golden-dataset-v1-label-review-queue-r1", "Review queue ID mismatch.");
assert(queue?.status === "READY_FOR_TRACK_B_REVIEW", "Review queue status mismatch.");
assert(queue?.dataset_id === dataset?.dataset_id, "Review queue dataset pointer mismatch.");
assert(queue?.dataset_fingerprint === dataset?.dataset_fingerprint, "Review queue fingerprint mismatch.");
assert(queue?.total_cases === 200, "Review queue must contain 200 cases.");
assert(queue?.required_reviewer === "Track B / Rankability and Validation Gate", "Required reviewer mismatch.");
assert(queue?.exit_criteria?.approved_or_corrected_cases === 200, "All 200 labels require review.");
assert(queue?.exit_criteria?.unresolved_cases === 0, "Review exit requires zero unresolved cases.");
assert(queue?.exit_criteria?.critical_auto_merge_errors === 0, "Critical auto-merge error target must be zero.");
assert(queue?.exit_criteria?.entity_resolution_accuracy_minimum === 0.99, "Review exit accuracy target mismatch.");
assert(queue?.exit_criteria?.deterministic_rerun === 1, "Deterministic rerun target mismatch.");
assert(queue?.candidate_r2_authorized === false, "Golden Dataset candidate cannot authorize Candidate R2.");
assert(queue?.public_projection === false && queue?.production_eligible === false,
  "Review queue public/Production boundary violation.");
assert(/^sha256:[a-f0-9]{64}$/.test(queue?.queue_fingerprint ?? ""), "Review queue fingerprint is invalid.");

if (errors.length) {
  console.error(`AGCI-OS Golden Dataset v1 Candidate: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("AGCI-OS Golden Dataset v1 Candidate: PASS");
console.log("Cases: 200 (50 / 50 / 50 / 50)");
console.log("Provenance / rights coverage: 100% / 100%");
console.log("Approved labels: 0");
console.log("Auto-merge authorized: 0");
console.log("Measured accuracy: NOT_AVAILABLE");
console.log("Track B label review: REQUIRED");
console.log("Candidate R2: NOT_AUTHORIZED");
console.log("Production: HOLD");
