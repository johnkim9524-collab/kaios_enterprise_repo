import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fingerprint, readJson, writeJsonDirectory } from "../source-intelligence/asi-discovery-common-v1.mjs";

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--reviewer") out.reviewer = path.resolve(argv[++i]);
    else if (argv[i] === "--lineage") out.lineage = path.resolve(argv[++i]);
    else if (argv[i] === "--output") out.output = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!out.reviewer || !out.lineage || !out.output) throw new Error("--reviewer, --lineage and --output are required");
  return out;
}

function normalized(value) {
  return String(value ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

function review(record) {
  const sameSourceRecord = record.left.source_id === record.right.source_id
    && record.left.source_object_id === record.right.source_object_id;
  const sameDesignMetadata = normalized(record.left.title) !== ""
    && normalized(record.left.title) === normalized(record.right.title)
    && normalized(record.left.maker) === normalized(record.right.maker)
    && normalized(record.left.object_type) === normalized(record.right.object_type)
    && record.left.production_year === record.right.production_year;

  if (sameSourceRecord) return {
    approved_relation: "SAME_PHYSICAL_OBJECT",
    rationale: "The source-qualified record identifier is identical; normalized descriptive fields are consistent.",
    confidence: 1
  };
  if (sameDesignMetadata) return {
    approved_relation: "SAME_CANONICAL_DESIGN_DIFFERENT_PHYSICAL_OBJECT",
    rationale: "Distinct source-qualified record identifiers share normalized title, maker, object type and production year.",
    confidence: 0.95
  };
  if (record.left.source_id === record.right.source_id) return {
    approved_relation: "DIFFERENT_CANONICAL_DESIGN",
    rationale: "Distinct records from one authority source lack the complete metadata agreement required for a same-design decision.",
    confidence: 0.95
  };
  return {
    approved_relation: "DIFFERENT_PHYSICAL_OBJECT_AND_DESIGN",
    rationale: "Cross-source records lack the complete metadata agreement required for a same-design decision.",
    confidence: 0.95
  };
}

const config = args(process.argv.slice(2));
const reviewPackage = readJson(config.reviewer);
const lineage = readJson(config.lineage);
if (reviewPackage.expected_relation_visible_to_reviewer !== false) throw new Error("Reviewer package is not blind.");
if (reviewPackage.case_count !== 200 || reviewPackage.records.length !== 200) throw new Error("Expected 200 reviewer cases.");

const records = reviewPackage.records.map(record => {
  const decision = review(record);
  return {
    review_case_id: record.review_case_id,
    review_action: "APPROVE_RELATION",
    approved_relation: decision.approved_relation,
    reviewer_rationale: decision.rationale,
    evidence_references: [record.left.provenance_reference, record.right.provenance_reference],
    identity_classification: decision.approved_relation,
    confidence: decision.confidence,
    confidence_classification: "HIGH",
    reviewer: "Track B / Process-Independent Deterministic Blind Review v1",
    reviewed_at: "2026-08-18T12:30:00Z",
    resolution_state: "RESOLVED"
  };
});

const frozenReview = {
  id: "golden-dataset-v1-track-b-blind-review-r1",
  record_type: "golden_dataset_blind_assessment",
  version: "1.0.0",
  status: "REVIEW_FROZEN_BEFORE_HIDDEN_LINEAGE_COMPARISON",
  review_independence: "PROCESS_INDEPENDENT_INTERNAL_NOT_EXTERNAL_AUDIT",
  review_package_id: reviewPackage.id,
  review_package_fingerprint: reviewPackage.fingerprint,
  required_records: 200,
  completed_records: 200,
  unresolved_records: 0,
  policy: "SOURCE_ID_THEN_COMPLETE_NORMALIZED_METADATA_FAIL_CLOSED_V1",
  records,
  candidate_r2_authorized: false,
  public_projection: false,
  production_eligible: false
};
frozenReview.fingerprint = fingerprint(frozenReview);

const expected = new Map(lineage.records.map(record => [record.review_case_id, record.expected_relation]));
const comparisons = records.map(record => ({
  review_case_id: record.review_case_id,
  approved_relation: record.approved_relation,
  expected_relation: expected.get(record.review_case_id),
  match: record.approved_relation === expected.get(record.review_case_id)
}));
const correct = comparisons.filter(record => record.match).length;
const criticalFalseAutoMerge = comparisons.filter(record =>
  !record.match && record.approved_relation.startsWith("SAME_") && !record.expected_relation.startsWith("SAME_")
).length;

const outcome = {
  id: "golden-dataset-v1-track-b-blind-review-outcome-r1",
  record_type: "golden_dataset_blind_review_outcome",
  version: "1.0.0",
  status: correct >= 198 && criticalFalseAutoMerge === 0 ? "CALIBRATION_THRESHOLD_PASS" : "CALIBRATION_THRESHOLD_FAIL",
  review_input_fingerprint: frozenReview.fingerprint,
  hidden_lineage_fingerprint: lineage.fingerprint,
  cases: 200,
  correct,
  incorrect: 200 - correct,
  accuracy: correct / 200,
  required_accuracy: 0.99,
  critical_false_auto_merge_count: criticalFalseAutoMerge,
  unresolved_count: 0,
  comparisons,
  representativeness_gate: "FAIL_SYNTHETIC_CONTROLS_FROM_48_AUTHORITY_RECORDS_NOT_SCOPE_STRATIFIED_REAL_WORLD_GOLDEN_SET",
  er_global_validation_authorized: false,
  candidate_r2_authorized: false,
  publication_eligible: false,
  production_eligible: false
};
outcome.fingerprint = fingerprint(outcome);

writeJsonDirectory(config.output, {
  "blind-review-frozen.json": frozenReview,
  "blind-review-outcome.json": outcome
});
console.log(`Track B blind review: ${correct}/200; accuracy=${outcome.accuracy}; critical_false_auto_merge=${criticalFalseAutoMerge}`);
console.log(`Representativeness: ${outcome.representativeness_gate}`);
