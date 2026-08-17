import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { buildTrackBCalibrationReadiness } from "./build-track-b-calibration-readiness-v2.mjs";
import { fingerprint, hashId, writeJsonDirectory } from "./asi-discovery-common-v1.mjs";

const defaultOutput = path.join(process.cwd(), "artifacts", "agci-os", "track-b-calibration-readiness-v2-blind");

function parseArgs(argv) {
  const config = { precisionInput: undefined, v2Input: undefined, targetedInput: undefined, output: defaultOutput, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--precision-input") config.precisionInput = path.resolve(argv[++index]);
    else if (argument === "--v2-input") config.v2Input = path.resolve(argv[++index]);
    else if (argument === "--targeted-input") config.targetedInput = path.resolve(argv[++index]);
    else if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return config;
}

function refingerprint(value) {
  const copy = structuredClone(value);
  delete copy.fingerprint;
  copy.fingerprint = fingerprint(copy);
  return copy;
}

function blindKey(record) {
  return hashId("blind-order", `${record.endpoint_id}|${record.source_id}|${record.endpoint_url}|track-b-calibration-v2.2`);
}

function opaqueOriginalCaseId(record) {
  return hashId("blind-src", `${record.endpoint_id}|${record.source_id}|${record.endpoint_url}|source-calibration-v1`);
}

function sanitizeEvidenceMatch(value) {
  if (!value || typeof value !== "object") return value;
  const copy = structuredClone(value);
  delete copy.score;
  if (Array.isArray(copy.token_hits)) {
    copy.token_hits = copy.token_hits.map(hit => {
      const sanitized = { ...hit };
      delete sanitized.weight;
      return sanitized;
    });
  }
  return copy;
}

function hardenReviewCases(records) {
  const sanitized = records.map(record => ({
    ...record,
    original_case_id: opaqueOriginalCaseId(record),
    best_scope_evidence: sanitizeEvidenceMatch(record.best_scope_evidence),
    best_source_role_evidence: sanitizeEvidenceMatch(record.best_source_role_evidence)
  }));
  sanitized.sort((a, b) => blindKey(a).localeCompare(blindKey(b)) || a.endpoint_id.localeCompare(b.endpoint_id));
  return sanitized.map((record, index) => ({
    ...record,
    review_case_id: `track-b-calibration-v2-blind-${String(index + 1).padStart(3, "0")}`
  }));
}

function buildBatches(records, baseBatches) {
  return baseBatches.map((batch, index) => {
    const slice = records.slice(index * 50, (index + 1) * 50);
    return {
      ...batch,
      batch_id: `track-b-calibration-v2-batch-${String(index + 1).padStart(2, "0")}`,
      case_count: slice.length,
      review_case_ids: slice.map(record => record.review_case_id),
      numeric_score_visible_to_reviewer: false,
      provisional_bucket_visible_to_reviewer: false,
      state: "READY_FOR_INDEPENDENT_REVIEW_BLINDNESS_HARDENED",
      production: "HOLD"
    };
  });
}

function buildAssessmentTemplate(records, baseTemplate) {
  return {
    ...baseTemplate,
    version: "2.2.0",
    status: "EMPTY_TEMPLATE_REVIEW_REQUIRED_EVIDENCE_ONLY_BLINDNESS_HARDENED",
    required_records: records.length,
    completed_records: 0,
    unresolved_records: records.length,
    records: records.map(record => ({
      review_case_id: record.review_case_id,
      endpoint_id: record.endpoint_id,
      scope_relevance_label: null,
      source_role_label: null,
      corrected_source_roles: [],
      channel_suitability_label: null,
      owner_and_lineage_label: null,
      generic_code_or_keyword_collision_label: null,
      decision_value_contribution_label: null,
      rationale: null,
      evidence_references: [],
      reviewer: null,
      reviewed_at: null,
      resolution_state: "PENDING_TRACK_B_REVIEW"
    })),
    final_gold_assessment: false,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

export function buildTrackBCalibrationReadinessBlind(inputs = {}) {
  const outputs = buildTrackBCalibrationReadiness(inputs);
  const reviewName = "track-b-calibration-review-package-v2.json";
  const batchesName = "track-b-calibration-batches-v2.json";
  const templateName = "track-b-label-assessment-template-v2.json";
  const manifestName = "run-manifest.json";

  const baseReview = outputs[reviewName];
  const reviewCases = hardenReviewCases(baseReview.records);
  outputs[reviewName] = refingerprint({
    ...baseReview,
    version: "2.2.0",
    status: "READY_FOR_400_CASE_INDEPENDENT_REVIEW_EVIDENCE_ONLY_BLINDNESS_HARDENED",
    records: reviewCases,
    numeric_score_visible_to_reviewer: false,
    provisional_bucket_visible_to_reviewer: false,
    blindness_hardening: {
      original_bucket_identifiers_exposed: false,
      original_case_ids_opaque: true,
      deterministic_blind_shuffle: true,
      reviewer_case_ids_regenerated_after_shuffle: true,
      automated_match_scores_exposed: false,
      token_weights_exposed: false
    }
  });

  const baseBatches = outputs[batchesName];
  outputs[batchesName] = refingerprint({
    ...baseBatches,
    version: "2.2.0",
    status: "EIGHT_DETERMINISTIC_EVIDENCE_ONLY_BLIND_REVIEW_BATCHES_READY",
    batches: buildBatches(reviewCases, baseBatches.batches)
  });

  outputs[templateName] = refingerprint(buildAssessmentTemplate(reviewCases, outputs[templateName]));

  const manifest = structuredClone(outputs[manifestName]);
  delete manifest.run_fingerprint;
  manifest.version = "2.2.0";
  manifest.status = "READINESS_FOUNDATION_PASS_EVIDENCE_ONLY_BLINDNESS_HARDENED_REVIEW_AND_SOURCE_EXPANSION_ACTIVE";
  manifest.outputs[reviewName] = outputs[reviewName].fingerprint;
  manifest.outputs[batchesName] = outputs[batchesName].fingerprint;
  manifest.outputs[templateName] = outputs[templateName].fingerprint;
  manifest.calibration_blindness_hardening = "PASS";
  manifest.original_bucket_identifiers_exposed = false;
  manifest.deterministic_blind_shuffle = true;
  manifest.automated_match_scores_exposed = false;
  manifest.token_weights_exposed = false;
  manifest.run_fingerprint = fingerprint(manifest);
  outputs[manifestName] = manifest;
  return outputs;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildTrackBCalibrationReadinessBlind({
    precisionInput: config.precisionInput,
    v2Input: config.v2Input,
    targetedInput: config.targetedInput
  });
  if (config.write) writeJsonDirectory(config.output, outputs);
  const manifest = outputs["run-manifest.json"];
  console.log("KIDULTS Track B Calibration Readiness v2.2 Evidence-Only Blindness Hardening: PASS");
  console.log(`Calibration cases / batches: ${manifest.calibration_cases_packaged} / ${manifest.calibration_batches}`);
  console.log(`Blindness hardening: ${manifest.calibration_blindness_hardening}`);
  console.log(`Direct Top-200 ready: ${manifest.direct_top200_ready}`);
  console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
