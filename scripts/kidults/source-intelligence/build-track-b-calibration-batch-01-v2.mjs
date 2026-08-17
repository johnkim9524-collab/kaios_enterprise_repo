import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { fingerprint, readJson, writeJsonDirectory } from "./asi-discovery-common-v1.mjs";

const REVIEWED_AT = "2026-08-17T16:40:00+09:00";
const REVIEWER = "TRACK_B_ATLAS_MODEL_ASSISTED_EVIDENCE_ONLY_REVIEW_V2_3";
const REVIEW_METHOD = "MODEL_ASSISTED_INDEPENDENT_EVIDENCE_ONLY_SEMANTIC_REVIEW_NO_PROVISIONAL_CLASS_OR_NUMERIC_HINTS";
const INPUT_RUN_ID = 32006503565;
const INPUT_ARTIFACT_ID = 9280193252;
const INPUT_DIGEST = "sha256:7a7db57f6fc811b0cb727f3344e8361012b6b57ebc815f34b06118a13fb38999";
const BATCH_ID = "track-b-calibration-v2-batch-01";

const POSITIVE = Object.freeze({
  "track-b-calibration-v2-blind-009": {
    role: "WRONG_ROLE",
    corrected: ["INDEPENDENT_VERIFICATION", "CULTURE_ATTENTION"],
    channel: "LIMITED_CONTEXT_ONLY",
    owner: "IDENTIFIED_RESEARCH_REPOSITORY",
    value: "CONTEXTUAL",
    rationale: "The supplied research record is directly about luxury watches, horology, design, and mechanical craftsmanship. It is relevant contextual evidence for the Mechanical Watches scope, but it is scholarship rather than a catalog/reference channel."
  },
  "track-b-calibration-v2-blind-022": {
    role: "CORRECT",
    corrected: ["CATALOG_REFERENCE", "PROVENANCE_HISTORY"],
    channel: "SUITABLE_REFERENCE_SOURCE",
    owner: "IDENTIFIED_INSTITUTIONAL_RECORD",
    value: "DIRECT_REFERENCE",
    rationale: "The institutional record directly identifies Liebig trading cards and is a valid historical catalog/reference lead with provenance value for the Trading Cards scope."
  },
  "track-b-calibration-v2-blind-036": {
    role: "WRONG_ROLE",
    corrected: ["INDEPENDENT_VERIFICATION"],
    channel: "LIMITED_CONTEXT_ONLY",
    owner: "IDENTIFIED_RESEARCH_REPOSITORY",
    value: "CONTEXTUAL",
    rationale: "The research record directly concerns fine-jewelry design and manufacturability. It is relevant as independent specialist context for the Fine Jewelry scope, but it is not a catalog/reference source."
  },
  "track-b-calibration-v2-blind-037": {
    role: "CORRECT",
    corrected: ["CATALOG_REFERENCE"],
    channel: "SUITABLE_STRUCTURED_REFERENCE_SOURCE",
    owner: "IDENTIFIED_OPEN_DATA_REPOSITORY",
    value: "DIRECT_REFERENCE",
    rationale: "The repository provides a structured maker/model camera sensor-size database, directly supporting object specification and catalog/reference decisions for Cameras & Lenses."
  },
  "track-b-calibration-v2-blind-040": {
    role: "WRONG_ROLE",
    corrected: ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"],
    channel: "LIMITED_CONTEXT_ONLY",
    owner: "IDENTIFIED_RESEARCH_RECORD",
    value: "CONTEXTUAL",
    rationale: "The research record directly addresses folk art influence on contemporary artistic and design practices. It can support cultural/context interpretation for Decorative Design Objects, but it is not a catalog/reference channel."
  },
  "track-b-calibration-v2-blind-050": {
    role: "PARTIALLY_CORRECT",
    corrected: ["CATALOG_REFERENCE"],
    channel: "SUITABLE_STRUCTURED_REFERENCE_SOURCE",
    owner: "IDENTIFIED_SPECIALIST_DATA_REPOSITORY",
    value: "DIRECT_REFERENCE",
    rationale: "The endpoint provides sports-card set lists in structured JSON and is directly useful as a catalog/reference source. No sold-transaction evidence is supplied, so the SOLD_TRANSACTION role is rejected."
  }
});

const LICENSE_OR_BUSINESS = new Set([
  "track-b-calibration-v2-blind-015",
  "track-b-calibration-v2-blind-019",
  "track-b-calibration-v2-blind-042"
]);
const ADJACENT_RESEARCH = new Set([
  "track-b-calibration-v2-blind-010",
  "track-b-calibration-v2-blind-011",
  "track-b-calibration-v2-blind-013",
  "track-b-calibration-v2-blind-016",
  "track-b-calibration-v2-blind-033",
  "track-b-calibration-v2-blind-041"
]);
const ADJACENT_OPERATIONAL = new Set([
  "track-b-calibration-v2-blind-018",
  "track-b-calibration-v2-blind-025",
  "track-b-calibration-v2-blind-032",
  "track-b-calibration-v2-blind-047",
  "track-b-calibration-v2-blind-048"
]);

function parseArgs(argv) {
  const config = { input: null, output: null, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") config.input = path.resolve(argv[++index]);
    else if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!config.input) throw new Error("--input is required");
  if (!config.output) throw new Error("--output is required");
  return config;
}

function negativeDecision(record) {
  const id = record.review_case_id;
  if (LICENSE_OR_BUSINESS.has(id)) return {
    collision: "LICENSE_OR_BUSINESS_RECORD",
    rationale: "The supplied record is a trademark/license or merchandising-rights record. It does not provide reusable collectible object, market-event, authentication, provenance, or attention data for the assigned Scope."
  };
  if (ADJACENT_RESEARCH.has(id)) return {
    collision: "ADJACENT_RESEARCH",
    rationale: "The research topic shares a broad category term with the assigned Scope but does not provide collectible-object identity, market observation, authentication, provenance, or decision evidence required for that Scope."
  };
  if (ADJACENT_OPERATIONAL.has(id)) return {
    collision: "ADJACENT_OPERATIONAL_DATA",
    rationale: "The endpoint concerns operational mobility, generic retail/sales, telemetry, or anti-counterfeit tooling rather than a defensible collectible-object or collectible-market evidence channel for the assigned Scope."
  };
  return {
    collision: "GENERIC_SOFTWARE_OR_KEYWORD_COLLISION",
    rationale: "The endpoint is a generic software, framework, demo, tooling, or keyword-collision repository and does not constitute a defensible collectible object, market, authentication, provenance, or attention data channel for the assigned Scope."
  };
}

function reviewRecord(record) {
  const positive = POSITIVE[record.review_case_id];
  if (positive) return {
    review_case_id: record.review_case_id,
    endpoint_id: record.endpoint_id,
    review_set_membership: "CALIBRATION_BATCH_01_OF_08",
    scope_relevance_label: "RELEVANT",
    scope_relevance_rationale: positive.rationale,
    source_role_label: positive.role,
    corrected_source_roles: positive.corrected,
    channel_suitability_label: positive.channel,
    owner_and_lineage_label: positive.owner,
    generic_code_or_keyword_collision_label: "NO_COLLISION",
    decision_value_contribution_label: positive.value,
    evidence_references: [record.endpoint_url, "owner", "channel_type", "candidate_collection_scopes", "candidate_source_roles", "evidence_excerpt"],
    reviewer: REVIEWER,
    reviewed_at: REVIEWED_AT,
    resolution_state: "RESOLVED",
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
  const negative = negativeDecision(record);
  return {
    review_case_id: record.review_case_id,
    endpoint_id: record.endpoint_id,
    review_set_membership: "CALIBRATION_BATCH_01_OF_08",
    scope_relevance_label: "NOT_RELEVANT",
    scope_relevance_rationale: negative.rationale,
    source_role_label: "NOT_APPLICABLE",
    corrected_source_roles: [],
    channel_suitability_label: "NOT_SUITABLE",
    owner_and_lineage_label: record.owner ? "IDENTIFIED_NOT_SUFFICIENT_FOR_ADMISSION" : "INSUFFICIENT_LINEAGE",
    generic_code_or_keyword_collision_label: negative.collision,
    decision_value_contribution_label: "NONE",
    evidence_references: [record.endpoint_url, "owner", "channel_type", "candidate_collection_scopes", "candidate_source_roles", "evidence_excerpt"],
    reviewer: REVIEWER,
    reviewed_at: REVIEWED_AT,
    resolution_state: "RESOLVED",
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

export function buildBatch01(inputDirectory) {
  const review = readJson(path.join(inputDirectory, "track-b-calibration-review-package-v2.json"));
  const batches = readJson(path.join(inputDirectory, "track-b-calibration-batches-v2.json"));
  if (review.version !== "2.3.0") throw new Error(`Expected v2.3.0 reviewer input, received ${review.version}`);
  const batch = batches.batches.find(value => value.batch_id === BATCH_ID);
  if (!batch || batch.case_count !== 50 || batch.review_case_ids.length !== 50) throw new Error("Batch 01 must contain exactly 50 cases.");
  const ids = new Set(batch.review_case_ids);
  const sourceRecords = review.records.filter(record => ids.has(record.review_case_id)).sort((a, b) => a.review_case_id.localeCompare(b.review_case_id));
  if (sourceRecords.length !== 50) throw new Error(`Expected 50 reviewer records, received ${sourceRecords.length}.`);
  const records = sourceRecords.map(reviewRecord);
  const relevant = records.filter(record => record.scope_relevance_label === "RELEVANT").length;
  const assessment = {
    id: "track-b-calibration-assessment-batch-01-v2",
    record_type: "track_b_source_relevance_calibration_batch_assessment",
    version: "2.3.0",
    status: "BATCH_COMPLETE_RESOLVED_MODEL_ASSISTED_NOT_EXTERNAL_HUMAN_GOLD",
    generated_at: REVIEWED_AT,
    input_run_id: INPUT_RUN_ID,
    input_artifact_id: INPUT_ARTIFACT_ID,
    input_artifact_digest: INPUT_DIGEST,
    batch_id: BATCH_ID,
    reviewed_records: records.length,
    relevant_records: relevant,
    not_relevant_records: records.length - relevant,
    unresolved_records: 0,
    rationale_coverage: 1,
    evidence_reference_coverage: 1,
    review_method: REVIEW_METHOD,
    external_human_review: false,
    legal_opinion: false,
    records,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    production: "HOLD"
  };
  assessment.fingerprint = fingerprint(assessment);
  const outputs = { "track-b-calibration-assessment-batch-01-v2.json": assessment };
  const manifest = {
    id: "track-b-calibration-assessment-batch-01-v2-run",
    record_type: "track_b_source_relevance_calibration_batch_run",
    version: "2.3.0",
    status: "BATCH_01_COMPLETE_RESOLVED",
    generated_at: REVIEWED_AT,
    input_run_id: INPUT_RUN_ID,
    input_artifact_id: INPUT_ARTIFACT_ID,
    assessment_fingerprint: assessment.fingerprint,
    reviewed_records: 50,
    relevant_records: relevant,
    unresolved_records: 0,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };
  manifest.run_fingerprint = fingerprint(manifest);
  outputs["run-manifest.json"] = manifest;
  return outputs;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildBatch01(config.input);
  if (config.write) writeJsonDirectory(config.output, outputs);
  const run = outputs["run-manifest.json"];
  console.log("KIDULTS Track B Calibration Batch 01: COMPLETE");
  console.log(`Reviewed: ${run.reviewed_records} / 50`);
  console.log(`Relevant: ${run.relevant_records}; unresolved: ${run.unresolved_records}`);
  console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
