import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { fingerprint, hashId, readJson, writeJsonDirectory } from "../source-intelligence/asi-discovery-common-v1.mjs";

const GENERATED_AT = "2026-08-17T16:55:00+09:00";
const INPUT_RUN_ID = 31939060074;
const INPUT_ARTIFACT_ID = 9261498529;
const INPUT_ARTIFACT_DIGEST = "sha256:edb80e7abbe78cedbced90f7a9773caff9ea29f3e7b3cf09372ae8b89dcf3792";

function parseArgs(argv) {
  const config = { input: null, output: null, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") config.input = path.resolve(argv[++index]);
    else if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!config.input || !config.output) throw new Error("--input and --output are required");
  return config;
}

function sanitizeSide(side) {
  return {
    source_record_id: side.source_record_id,
    source_id: side.source_id,
    source_family: side.source_family,
    source_object_id: side.source_object_id,
    title: side.title,
    maker: side.maker,
    object_type: side.object_type,
    production_year: side.production_year,
    core_domain_hint: side.core_domain_hint,
    provenance_reference: side.provenance_reference,
    rights_state: side.rights_state
  };
}

function blindSortKey(caseRecord) {
  const left = caseRecord.left;
  const right = caseRecord.right;
  return hashId(
    "golden-blind-order",
    `${left.source_id}|${left.source_object_id}|${right.source_id}|${right.source_object_id}|${caseRecord.case_id}|v1`
  );
}

function buildReviewCases(cases) {
  const ordered = cases
    .map(caseRecord => ({ caseRecord, sortKey: blindSortKey(caseRecord) }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.caseRecord.case_id.localeCompare(b.caseRecord.case_id));

  return ordered.map(({ caseRecord }, index) => ({
    review_case_id: `golden-dataset-blind-${String(index + 1).padStart(3, "0")}`,
    left: sanitizeSide(caseRecord.left),
    right: sanitizeSide(caseRecord.right),
    provenance_coverage: caseRecord.provenance_coverage,
    rights_state_explicit: caseRecord.rights_state_explicit,
    provider_id_promoted_to_canonical: false,
    auto_merge_authorized: false,
    reviewer_instruction: "Determine the identity relation using only the supplied source-qualified evidence. Do not infer equality from title similarity alone.",
    publication_eligible: false,
    production_eligible: false
  }));
}

function buildLineageMap(cases, reviewCases) {
  const byEvidenceKey = new Map();
  for (const caseRecord of cases) {
    const key = `${caseRecord.left.source_id}|${caseRecord.left.source_object_id}|${caseRecord.right.source_id}|${caseRecord.right.source_object_id}|${caseRecord.left.title}|${caseRecord.right.title}`;
    const values = byEvidenceKey.get(key) ?? [];
    values.push(caseRecord);
    byEvidenceKey.set(key, values);
  }
  const used = new Set();
  return reviewCases.map(reviewCase => {
    const key = `${reviewCase.left.source_id}|${reviewCase.left.source_object_id}|${reviewCase.right.source_id}|${reviewCase.right.source_object_id}|${reviewCase.left.title}|${reviewCase.right.title}`;
    const candidates = byEvidenceKey.get(key) ?? [];
    const original = candidates.find(value => !used.has(value.case_id));
    if (!original) throw new Error(`Unable to resolve hidden lineage for ${reviewCase.review_case_id}`);
    used.add(original.case_id);
    return {
      review_case_id: reviewCase.review_case_id,
      original_case_id: original.case_id,
      case_class: original.case_class,
      expected_relation: original.provisional_expected_relation
    };
  });
}

function buildBatches(reviewCases) {
  const batches = [];
  for (let index = 0; index < 4; index += 1) {
    const records = reviewCases.slice(index * 50, (index + 1) * 50);
    batches.push({
      batch_id: `golden-dataset-blind-batch-${String(index + 1).padStart(2, "0")}`,
      case_count: records.length,
      review_case_ids: records.map(record => record.review_case_id),
      state: "READY_FOR_INDEPENDENT_IDENTITY_REVIEW",
      expected_relation_visible_to_reviewer: false,
      original_class_visible_to_reviewer: false,
      production: "HOLD"
    });
  }
  return batches;
}

export function buildGoldenDatasetBlindReview(inputDirectory) {
  const dataset = readJson(path.join(inputDirectory, "golden-dataset-v1-candidate.json"));
  const queue = readJson(path.join(inputDirectory, "label-review-queue.json"));
  if (dataset.case_count !== 200 || dataset.cases.length !== 200) throw new Error("Golden Dataset candidate must contain exactly 200 cases.");
  if (dataset.approved_label_count !== 0 || dataset.unreviewed_label_count !== 200) throw new Error("Golden Dataset candidate must remain unreviewed before blind packaging.");

  const reviewCases = buildReviewCases(dataset.cases);
  const lineage = buildLineageMap(dataset.cases, reviewCases);
  const batches = buildBatches(reviewCases);

  const reviewPackage = {
    id: "golden-dataset-v1-blind-review-package-v1",
    record_type: "golden_dataset_blind_reviewer_input",
    version: "1.0.0",
    status: "READY_FOR_200_CASE_INDEPENDENT_IDENTITY_REVIEW",
    generated_at: GENERATED_AT,
    input_run_id: INPUT_RUN_ID,
    input_artifact_id: INPUT_ARTIFACT_ID,
    input_artifact_digest: INPUT_ARTIFACT_DIGEST,
    source_dataset_id: dataset.dataset_id,
    source_dataset_fingerprint: dataset.dataset_fingerprint,
    case_count: 200,
    expected_relation_visible_to_reviewer: false,
    case_class_visible_to_reviewer: false,
    candidate_identity_ids_visible_to_reviewer: false,
    original_case_ids_visible_to_reviewer: false,
    records: reviewCases,
    publication_eligible: false,
    production_eligible: false
  };
  reviewPackage.fingerprint = fingerprint(reviewPackage);

  const batchPackage = {
    id: "golden-dataset-v1-blind-review-batches-v1",
    record_type: "golden_dataset_blind_review_batches",
    version: "1.0.0",
    status: "FOUR_MIXED_BLIND_BATCHES_READY",
    generated_at: GENERATED_AT,
    review_package_id: reviewPackage.id,
    review_package_fingerprint: reviewPackage.fingerprint,
    batch_count: 4,
    cases_per_batch: 50,
    batches,
    production: "HOLD"
  };
  batchPackage.fingerprint = fingerprint(batchPackage);

  const assessmentTemplate = {
    id: "golden-dataset-v1-blind-assessment-template-v1",
    record_type: "golden_dataset_blind_assessment_template",
    version: "1.0.0",
    status: "EMPTY_TEMPLATE_REVIEW_REQUIRED",
    generated_at: GENERATED_AT,
    review_package_id: reviewPackage.id,
    required_records: 200,
    completed_records: 0,
    unresolved_records: 200,
    records: reviewCases.map(record => ({
      review_case_id: record.review_case_id,
      review_action: null,
      approved_relation: null,
      reviewer_rationale: null,
      evidence_references: [],
      identity_classification: null,
      confidence: null,
      confidence_classification: null,
      reviewer: null,
      reviewed_at: null,
      resolution_state: "PENDING_TRACK_B_REVIEW"
    })),
    candidate_r2_authorized: false,
    public_projection: false,
    production_eligible: false
  };
  assessmentTemplate.fingerprint = fingerprint(assessmentTemplate);

  const reviewerManifest = {
    id: "golden-dataset-v1-blind-review-run-v1",
    record_type: "golden_dataset_blind_review_run",
    version: "1.0.0",
    status: "BLIND_REVIEW_PACKAGE_READY",
    generated_at: GENERATED_AT,
    source_dataset_id: dataset.dataset_id,
    source_dataset_fingerprint: dataset.dataset_fingerprint,
    source_queue_id: queue.queue_id,
    source_queue_fingerprint: queue.queue_fingerprint,
    input_run_id: INPUT_RUN_ID,
    input_artifact_id: INPUT_ARTIFACT_ID,
    review_package_fingerprint: reviewPackage.fingerprint,
    batch_package_fingerprint: batchPackage.fingerprint,
    assessment_template_fingerprint: assessmentTemplate.fingerprint,
    reviewer_cases: 200,
    reviewer_batches: 4,
    answer_metadata_exposed: false,
    candidate_identity_ids_exposed: false,
    candidate_r2_authorized: false,
    production: "HOLD"
  };
  reviewerManifest.run_fingerprint = fingerprint(reviewerManifest);

  const lineageMap = {
    id: "golden-dataset-v1-blind-lineage-map-v1",
    record_type: "golden_dataset_blind_lineage_map",
    version: "1.0.0",
    status: "AGGREGATION_ONLY_NOT_REVIEWER_INPUT",
    generated_at: GENERATED_AT,
    source_dataset_id: dataset.dataset_id,
    source_dataset_fingerprint: dataset.dataset_fingerprint,
    mapping_count: lineage.length,
    records: lineage,
    reviewer_input_authorized: false,
    use_before_review_freeze: false,
    production: "HOLD"
  };
  lineageMap.fingerprint = fingerprint(lineageMap);

  const lineageManifest = {
    id: "golden-dataset-v1-blind-lineage-run-v1",
    record_type: "golden_dataset_blind_lineage_run",
    version: "1.0.0",
    status: "AGGREGATION_ONLY",
    generated_at: GENERATED_AT,
    lineage_map_fingerprint: lineageMap.fingerprint,
    mapping_count: 200,
    reviewer_input_authorized: false,
    production: "HOLD"
  };
  lineageManifest.run_fingerprint = fingerprint(lineageManifest);

  return {
    reviewer: {
      "golden-dataset-v1-blind-review-package-v1.json": reviewPackage,
      "golden-dataset-v1-blind-review-batches-v1.json": batchPackage,
      "golden-dataset-v1-blind-assessment-template-v1.json": assessmentTemplate,
      "run-manifest.json": reviewerManifest
    },
    lineage: {
      "golden-dataset-v1-blind-lineage-map-v1.json": lineageMap,
      "run-manifest.json": lineageManifest
    }
  };
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildGoldenDatasetBlindReview(config.input);
  if (config.write) {
    writeJsonDirectory(path.join(config.output, "reviewer"), outputs.reviewer);
    writeJsonDirectory(path.join(config.output, "lineage"), outputs.lineage);
  }
  console.log("KIDULTS Golden Dataset Blind Review Package v1: READY");
  console.log("Reviewer cases 200/200; batches 4x50; answer metadata exposed 0; candidate identity IDs exposed 0; Production HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
