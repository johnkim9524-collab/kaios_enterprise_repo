import path from "node:path";
import process from "node:process";
import { fingerprint, readJson, unique } from "../source-intelligence/asi-discovery-common-v1.mjs";

const FORBIDDEN_REVIEWER_KEYS = new Set([
  "case_id",
  "case_class",
  "provisional_expected_relation",
  "label_status",
  "approved_label",
  "approved_by",
  "approved_at",
  "difficulty",
  "rationale",
  "objective_control_type",
  "representation_variant",
  "physical_object_candidate_id",
  "canonical_design_candidate_key",
  "transformation"
]);

function fail(errors, message) { errors.push(message); }

function findForbiddenKeys(value, currentPath = "root", results = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${currentPath}[${index}]`, results));
    return results;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_REVIEWER_KEYS.has(key)) results.push(`${currentPath}.${key}`);
      findForbiddenKeys(child, `${currentPath}.${key}`, results);
    }
  }
  return results;
}

function verifyFingerprint(value, field = "fingerprint") {
  const copy = structuredClone(value);
  const stored = copy[field];
  delete copy[field];
  return stored === fingerprint(copy);
}

export function validateGoldenDatasetBlindReview(outputDirectory) {
  const errors = [];
  const reviewerDir = path.join(outputDirectory, "reviewer");
  const lineageDir = path.join(outputDirectory, "lineage");
  const review = readJson(path.join(reviewerDir, "golden-dataset-v1-blind-review-package-v1.json"));
  const batches = readJson(path.join(reviewerDir, "golden-dataset-v1-blind-review-batches-v1.json"));
  const template = readJson(path.join(reviewerDir, "golden-dataset-v1-blind-assessment-template-v1.json"));
  const reviewerManifest = readJson(path.join(reviewerDir, "run-manifest.json"));
  const lineage = readJson(path.join(lineageDir, "golden-dataset-v1-blind-lineage-map-v1.json"));
  const lineageManifest = readJson(path.join(lineageDir, "run-manifest.json"));

  if (review.case_count !== 200 || review.records.length !== 200) fail(errors, "Reviewer package must contain exactly 200 cases.");
  if (unique(review.records.map(record => record.review_case_id)).length !== 200) fail(errors, "Reviewer case IDs must be 200 unique values.");
  if (review.records.some(record => !/^golden-dataset-blind-\d{3}$/.test(record.review_case_id))) fail(errors, "Reviewer case IDs must be opaque blind IDs.");
  if (review.expected_relation_visible_to_reviewer !== false || review.case_class_visible_to_reviewer !== false || review.candidate_identity_ids_visible_to_reviewer !== false || review.original_case_ids_visible_to_reviewer !== false) fail(errors, "Reviewer visibility flags must all be false.");
  if (review.publication_eligible !== false || review.production_eligible !== false) fail(errors, "Reviewer package must remain non-public and non-production.");

  const forbiddenPaths = findForbiddenKeys(review);
  if (forbiddenPaths.length) fail(errors, `Reviewer package leaks forbidden answer/candidate keys: ${forbiddenPaths.slice(0, 10).join(", ")}`);
  if (review.records.some(record => !record.left?.source_id || !record.right?.source_id || !record.left?.provenance_reference || !record.right?.provenance_reference || !record.left?.rights_state || !record.right?.rights_state)) fail(errors, "Every reviewer case requires left/right source identity, provenance and rights evidence.");
  if (review.records.some(record => record.provider_id_promoted_to_canonical !== false || record.auto_merge_authorized !== false || record.publication_eligible !== false || record.production_eligible !== false)) fail(errors, "Reviewer-case fail-closed boundary violated.");

  if (batches.batch_count !== 4 || batches.cases_per_batch !== 50 || batches.batches.length !== 4) fail(errors, "Blind batch package must contain four 50-case batches.");
  const batchIds = batches.batches.flatMap(batch => batch.review_case_ids);
  if (batchIds.length !== 200 || unique(batchIds).length !== 200) fail(errors, "Blind batches must cover 200 unique cases exactly once.");
  const reviewIds = new Set(review.records.map(record => record.review_case_id));
  if (batchIds.some(id => !reviewIds.has(id))) fail(errors, "Blind batch references an unknown reviewer case ID.");
  if (batches.batches.some(batch => batch.case_count !== 50 || batch.expected_relation_visible_to_reviewer !== false || batch.original_class_visible_to_reviewer !== false || batch.production !== "HOLD")) fail(errors, "Blind batch invariant violated.");

  if (template.required_records !== 200 || template.completed_records !== 0 || template.unresolved_records !== 200 || template.records.length !== 200) fail(errors, "Assessment template must start empty at 0/200 complete.");
  if (template.records.some(record => record.approved_relation !== null || record.review_action !== null || record.resolution_state !== "PENDING_TRACK_B_REVIEW")) fail(errors, "Assessment template must not contain prefilled decisions.");
  if (template.candidate_r2_authorized !== false || template.public_projection !== false || template.production_eligible !== false) fail(errors, "Assessment template fail-closed boundary violated.");

  if (lineage.mapping_count !== 200 || lineage.records.length !== 200) fail(errors, "Hidden lineage map must contain exactly 200 mappings.");
  if (unique(lineage.records.map(record => record.review_case_id)).length !== 200 || unique(lineage.records.map(record => record.original_case_id)).length !== 200) fail(errors, "Hidden lineage mappings must be one-to-one.");
  if (lineage.reviewer_input_authorized !== false || lineage.use_before_review_freeze !== false || lineage.production !== "HOLD") fail(errors, "Hidden lineage map must not be reviewer input.");
  const classCounts = Object.fromEntries([...new Set(lineage.records.map(record => record.case_class))].map(value => [value, lineage.records.filter(record => record.case_class === value).length]));
  const relationCounts = Object.fromEntries([...new Set(lineage.records.map(record => record.expected_relation))].map(value => [value, lineage.records.filter(record => record.expected_relation === value).length]));
  if (Object.values(classCounts).length !== 4 || Object.values(classCounts).some(value => value !== 50)) fail(errors, "Hidden lineage must preserve the four 50-case classes.");
  if (Object.values(relationCounts).length !== 4 || Object.values(relationCounts).some(value => value !== 50)) fail(errors, "Hidden lineage must preserve the four 50-case expected relations.");

  for (const value of [review, batches, template, lineage]) {
    if (!verifyFingerprint(value)) fail(errors, `${value.id}: fingerprint mismatch.`);
  }
  for (const manifest of [reviewerManifest, lineageManifest]) {
    if (!verifyFingerprint(manifest, "run_fingerprint")) fail(errors, `${manifest.id}: run fingerprint mismatch.`);
  }
  if (reviewerManifest.answer_metadata_exposed !== false || reviewerManifest.candidate_identity_ids_exposed !== false || reviewerManifest.candidate_r2_authorized !== false || reviewerManifest.production !== "HOLD") fail(errors, "Reviewer manifest boundary violated.");
  if (lineageManifest.reviewer_input_authorized !== false || lineageManifest.production !== "HOLD") fail(errors, "Lineage manifest boundary violated.");
  return errors;
}

const directory = path.resolve(process.argv[2] ?? "");
const errors = validateGoldenDatasetBlindReview(directory);
if (errors.length) {
  console.error(`KIDULTS Golden Dataset Blind Review v1: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log("KIDULTS Golden Dataset Blind Review v1: PASS");
console.log("Reviewer cases 200/200; batches 4x50; answer/candidate-ID leakage 0; lineage separated; Production HOLD");
