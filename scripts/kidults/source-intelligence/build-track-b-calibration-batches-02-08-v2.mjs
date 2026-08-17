import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { fingerprint, readJson, writeJsonDirectory } from "./asi-discovery-common-v1.mjs";

const REVIEWED_AT = "2026-08-17T16:48:00+09:00";
const REVIEWER = "TRACK_B_ATLAS_MODEL_ASSISTED_EVIDENCE_ONLY_REVIEW_V2_3";
const REVIEW_METHOD = "MODEL_ASSISTED_INDEPENDENT_EVIDENCE_ONLY_SEMANTIC_REVIEW_NO_PROVISIONAL_CLASS_OR_NUMERIC_HINTS";
const INPUT_RUN_ID = 32006503565;
const INPUT_ARTIFACT_ID = 9280193252;
const INPUT_DIGEST = "sha256:7a7db57f6fc811b0cb727f3344e8361012b6b57ebc815f34b06118a13fb38999";
const BATCH01_RUN_ID = 32007023907;
const BATCH01_ARTIFACT_ID = 9280370219;
const BATCH01_ARTIFACT_DIGEST = "sha256:1a1b1cde8166f66befd1c759632667454ecec91f519d2763428d38135e7df212";

function id(number) { return `track-b-calibration-v2-blind-${String(number).padStart(3, "0")}`; }
function decision(role, corrected, category, channel = "LIMITED_CONTEXT_ONLY", value = "CONTEXTUAL") {
  return { role, corrected, category, channel, value };
}

const POSITIVE = Object.freeze({
  [id(77)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], "SPECIALIST_SCHOLARSHIP"),
  [id(79)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], "SPECIALIST_SCHOLARSHIP"),
  [id(86)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], "SPECIALIST_SCHOLARSHIP"),
  [id(98)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "MACRO_CONTEXT"], "MARKET_ATTENTION_RESEARCH"),
  [id(114)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], "SPECIALIST_SCHOLARSHIP"),
  [id(115)]: decision("CORRECT", ["CATALOG_REFERENCE"], "STRUCTURED_REFERENCE", "SUITABLE_STRUCTURED_REFERENCE_SOURCE", "DIRECT_REFERENCE"),
  [id(136)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], "SPECIALIST_SCHOLARSHIP"),
  [id(140)]: decision("WRONG_ROLE", ["INDEPENDENT_VERIFICATION"], "TECHNICAL_RESEARCH"),
  [id(151)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], "SPECIALIST_SCHOLARSHIP"),
  [id(154)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], "SPECIALIST_SCHOLARSHIP"),
  [id(159)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "MACRO_CONTEXT"], "MARKET_ATTENTION_RESEARCH"),
  [id(162)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], "TECHNICAL_RESEARCH"),
  [id(164)]: decision("WRONG_ROLE", ["CATALOG_REFERENCE", "AUTHENTICATION_CONDITION", "PROVENANCE_HISTORY"], "STRUCTURED_REFERENCE", "SUITABLE_STRUCTURED_REFERENCE_SOURCE", "DIRECT_REFERENCE"),
  [id(168)]: decision("WRONG_ROLE", ["INDEPENDENT_VERIFICATION", "CULTURE_ATTENTION"], "SPECIALIST_SCHOLARSHIP"),
  [id(180)]: decision("WRONG_ROLE", ["CATALOG_REFERENCE", "PROVENANCE_HISTORY"], "STRUCTURED_REFERENCE", "LIMITED_SPECIALIST_REFERENCE", "DIRECT_REFERENCE"),
  [id(181)]: decision("PARTIALLY_CORRECT", ["CATALOG_REFERENCE"], "STRUCTURED_REFERENCE", "SUITABLE_STRUCTURED_REFERENCE_SOURCE", "DIRECT_REFERENCE"),
  [id(203)]: decision("CORRECT", ["PROVENANCE_HISTORY", "CATALOG_REFERENCE"], "ARCHIVAL_PROVENANCE", "SUITABLE_SPECIALIST_ARCHIVE", "DIRECT_REFERENCE"),
  [id(207)]: decision("PARTIALLY_CORRECT", ["AUTHENTICATION_CONDITION", "PROVENANCE_HISTORY", "INDEPENDENT_VERIFICATION"], "TECHNICAL_RESEARCH", "LIMITED_SPECIALIST_REFERENCE", "DIRECT_REFERENCE"),
  [id(210)]: decision("WRONG_ROLE", ["INDEPENDENT_VERIFICATION"], "TECHNICAL_RESEARCH"),
  [id(217)]: decision("WRONG_ROLE", ["LISTING_SUPPLY", "CATALOG_REFERENCE"], "STRUCTURED_MARKET_REFERENCE", "SUITABLE_LISTING_REFERENCE", "DIRECT_REFERENCE"),
  [id(218)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], "SPECIALIST_SCHOLARSHIP"),
  [id(222)]: decision("PARTIALLY_CORRECT", ["AUTHENTICATION_CONDITION", "PROVENANCE_HISTORY", "INDEPENDENT_VERIFICATION"], "TECHNICAL_RESEARCH", "LIMITED_SPECIALIST_REFERENCE", "DIRECT_REFERENCE"),
  [id(237)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "MACRO_CONTEXT"], "MARKET_ATTENTION_RESEARCH"),
  [id(241)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], "SPECIALIST_SCHOLARSHIP"),
  [id(267)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], "SPECIALIST_SCHOLARSHIP"),
  [id(276)]: decision("WRONG_ROLE", ["INDEPENDENT_VERIFICATION"], "TECHNICAL_RESEARCH"),
  [id(279)]: decision("CORRECT", ["PROVENANCE_HISTORY"], "ARCHIVAL_PROVENANCE", "LIMITED_ARCHIVAL_SOURCE", "CONTEXTUAL"),
  [id(280)]: decision("WRONG_ROLE", ["INDEPENDENT_VERIFICATION", "MACRO_CONTEXT"], "MARKET_CONTEXT_RESEARCH"),
  [id(301)]: decision("WRONG_ROLE", ["INDEPENDENT_VERIFICATION", "MACRO_CONTEXT"], "MARKET_RESEARCH", "SUITABLE_RESEARCH_SOURCE", "DIRECT_REFERENCE"),
  [id(303)]: decision("WRONG_ROLE", ["INDEPENDENT_VERIFICATION", "MACRO_CONTEXT"], "MARKET_CONTEXT_RESEARCH"),
  [id(308)]: decision("WRONG_ROLE", ["INDEPENDENT_VERIFICATION"], "TECHNICAL_RESEARCH"),
  [id(321)]: decision("PARTIALLY_CORRECT", ["PROVENANCE_HISTORY", "CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], "ARCHIVAL_SCHOLARSHIP", "LIMITED_SPECIALIST_REFERENCE", "DIRECT_REFERENCE"),
  [id(324)]: decision("PARTIALLY_CORRECT", ["SOLD_TRANSACTION", "PROVENANCE_HISTORY"], "STRUCTURED_MARKET_REFERENCE", "SUITABLE_STRUCTURED_MARKET_SOURCE", "DIRECT_REFERENCE"),
  [id(325)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], "SPECIALIST_SCHOLARSHIP"),
  [id(327)]: decision("CORRECT", ["PRIMARY_AUTHORITY", "CATALOG_REFERENCE"], "PRIMARY_AUTHORITY", "SUITABLE_PRIMARY_AUTHORITY", "DIRECT_REFERENCE"),
  [id(331)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], "SPECIALIST_SCHOLARSHIP"),
  [id(347)]: decision("WRONG_ROLE", ["INDEPENDENT_VERIFICATION", "MACRO_CONTEXT"], "MARKET_STRUCTURE_RESEARCH"),
  [id(350)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "MACRO_CONTEXT"], "MARKET_ATTENTION_RESEARCH"),
  [id(383)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], "SPECIALIST_SCHOLARSHIP"),
  [id(391)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], "SPECIALIST_SCHOLARSHIP"),
  [id(398)]: decision("WRONG_ROLE", ["INDEPENDENT_VERIFICATION"], "TECHNICAL_RESEARCH"),
  [id(400)]: decision("WRONG_ROLE", ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION", "PROVENANCE_HISTORY"], "HISTORICAL_SCHOLARSHIP")
});

const DUPLICATE_UNDERLYING_WORK = new Set([
  id(86), id(151), id(154), id(168), id(181), id(222), id(237), id(276), id(303), id(383), id(391)
]);

const POSITIVE_RATIONALE = Object.freeze({
  SPECIALIST_SCHOLARSHIP: "The supplied research directly studies the assigned collectible object class, design history, or cultural interpretation. It is relevant contextual evidence but is not the assigned catalog/market Source role.",
  TECHNICAL_RESEARCH: "The supplied research directly studies technical properties, design, manufacture, or verification of the assigned collectible object class. It is relevant independent evidence but not the assigned catalog/transaction role.",
  MARKET_ATTENTION_RESEARCH: "The supplied study directly measures brand, media, or audience behavior in the assigned object market. It is relevant market-attention/context evidence rather than a catalog/reference source.",
  MARKET_CONTEXT_RESEARCH: "The supplied assessment directly concerns the assigned vehicle/object category and can support market or technology context, but it is not a catalog/reference or provenance source.",
  MARKET_RESEARCH: "The supplied study directly analyzes sales characteristics in the assigned collectibles market. It is relevant decision evidence but does not provide event-level sold transactions.",
  MARKET_STRUCTURE_RESEARCH: "The supplied research directly addresses financialization or market structure of the assigned collectibles class. It is relevant macro/independent evidence rather than a catalog source.",
  STRUCTURED_REFERENCE: "The endpoint provides structured specialist object/reference data directly aligned to the assigned collectible Scope and is usable as catalog, specification, authentication, or provenance evidence according to the corrected roles.",
  STRUCTURED_MARKET_REFERENCE: "The endpoint provides structured price, listing, or historical sales information directly aligned to the assigned collectible Scope; the corrected role distinguishes listing/reference data from event-level sold transactions.",
  ARCHIVAL_PROVENANCE: "The endpoint is an archive directly concerned with objects, ownership, documentation, or historical material in the assigned collectible Scope and can support provenance/reference decisions.",
  ARCHIVAL_SCHOLARSHIP: "The supplied archival/scholarly record directly concerns historical programmes, memories, or memorabilia in the assigned Scope and can support provenance and cultural interpretation.",
  PRIMARY_AUTHORITY: "The endpoint is an official maker/company identity directly aligned with the assigned collectible object Scope and is suitable as a primary-authority/catalog lead.",
  HISTORICAL_SCHOLARSHIP: "The supplied research directly examines the historical and cultural development of the assigned collectible object class and is relevant for contextual/provenance interpretation."
});

function parseArgs(argv) {
  const config = { input: null, batch01: null, output: null, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") config.input = path.resolve(argv[++index]);
    else if (argument === "--batch01") config.batch01 = path.resolve(argv[++index]);
    else if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!config.input || !config.batch01 || !config.output) throw new Error("--input, --batch01, and --output are required");
  return config;
}

function evidenceText(record) { return JSON.stringify(record.evidence_excerpt ?? {}).toLowerCase(); }

function negativeDecision(record) {
  const text = evidenceText(record);
  const scopes = record.candidate_collection_scopes ?? [];
  if (/license|royalty|trademark|franchise|asset purchase|royalty agreement/.test(text)) return { collision: "LICENSE_OR_BUSINESS_RECORD", rationale: "The supplied record is a license, franchise, royalty, trademark, or business-transfer record and does not provide reusable collectible-object, market-event, authentication, provenance, or attention data for the assigned Scope." };
  if (scopes.includes("scope-seating") && /seating preference|child car seat|adaptive seating|cerebral palsy|ancient theatre|fountain/.test(text)) return { collision: "HUMAN_SEATING_OR_NON_COLLECTIBLE_COLLISION", rationale: "The endpoint uses seating terminology for human behavior, child safety, therapy, architecture, or a non-collectible place/object and does not provide collectible furniture evidence for the Seating Scope." };
  if (scopes.includes("scope-construction-systems") && /construction|erp|rfid|waste recycling|cost database|clinical decision|workflow engine/.test(text)) return { collision: "CONSTRUCTION_INDUSTRY_OR_SYSTEM_TERM_COLLISION", rationale: "The endpoint concerns the construction industry, software systems, costs, waste, or an unrelated systems term rather than collectible construction systems or object-market evidence." };
  if (scopes.includes("scope-trading-cards") && /steam trading|btc trading|trading-knowledge|bitcoin seller/.test(text)) return { collision: "DIGITAL_OR_TRADING_TERM_COLLISION", rationale: "The endpoint uses trading/card terminology for digital platforms, cryptocurrency, Steam automation, or generic trading rather than physical collectible trading-card evidence." };
  if (record.channel_type === "DATACITE_DATASET_OR_RESEARCH_RECORD") return { collision: "ADJACENT_OR_WRONG_SCOPE_RESEARCH", rationale: "The supplied research record is adjacent to or keyword-matched with the assigned Scope but does not provide sufficiently direct collectible-object, collectible-market, authentication, provenance, or cultural evidence for admission." };
  if (/awesome|framework|library|agent|llm|ai |database designer|demo|tool|api|sdk|prompt|model|course|coding|software|app|mcp|image generation|generator/.test(text) || record.channel_type?.includes("GITHUB")) return { collision: "GENERIC_SOFTWARE_OR_KEYWORD_COLLISION", rationale: "The endpoint is a generic software, framework, demo, tooling, AI, developer-resource, or keyword-collision repository and does not constitute a defensible collectible evidence channel for the assigned Scope." };
  return { collision: "INSUFFICIENT_COLLECTIBLE_EVIDENCE", rationale: "The supplied endpoint does not provide sufficient direct evidence that it is a defensible collectible object, market, authentication, provenance, or attention channel for the assigned Scope." };
}

function reviewRecord(record, batchNumber) {
  const positive = POSITIVE[record.review_case_id];
  if (positive) {
    const duplicate = DUPLICATE_UNDERLYING_WORK.has(record.review_case_id);
    return {
      review_case_id: record.review_case_id, endpoint_id: record.endpoint_id,
      review_set_membership: `CALIBRATION_BATCH_${String(batchNumber).padStart(2, "0")}_OF_08`,
      scope_relevance_label: "RELEVANT", scope_relevance_rationale: POSITIVE_RATIONALE[positive.category],
      source_role_label: positive.role, corrected_source_roles: positive.corrected,
      channel_suitability_label: positive.channel,
      owner_and_lineage_label: duplicate ? "IDENTIFIED_DUPLICATE_UNDERLYING_WORK" : "IDENTIFIED_REVIEWED_SOURCE",
      generic_code_or_keyword_collision_label: duplicate ? "DUPLICATE_UNDERLYING_WORK" : "NO_COLLISION",
      decision_value_contribution_label: positive.value,
      evidence_references: [record.endpoint_url, "owner", "channel_type", "candidate_collection_scopes", "candidate_source_roles", "evidence_excerpt"],
      reviewer: REVIEWER, reviewed_at: REVIEWED_AT, resolution_state: "RESOLVED",
      source_pool_promoted: false, acquisition_authorized: false, production: "HOLD"
    };
  }
  const negative = negativeDecision(record);
  return {
    review_case_id: record.review_case_id, endpoint_id: record.endpoint_id,
    review_set_membership: `CALIBRATION_BATCH_${String(batchNumber).padStart(2, "0")}_OF_08`,
    scope_relevance_label: "NOT_RELEVANT", scope_relevance_rationale: negative.rationale,
    source_role_label: "NOT_APPLICABLE", corrected_source_roles: [], channel_suitability_label: "NOT_SUITABLE",
    owner_and_lineage_label: record.owner ? "IDENTIFIED_NOT_SUFFICIENT_FOR_ADMISSION" : "INSUFFICIENT_LINEAGE",
    generic_code_or_keyword_collision_label: negative.collision, decision_value_contribution_label: "NONE",
    evidence_references: [record.endpoint_url, "owner", "channel_type", "candidate_collection_scopes", "candidate_source_roles", "evidence_excerpt"],
    reviewer: REVIEWER, reviewed_at: REVIEWED_AT, resolution_state: "RESOLVED",
    source_pool_promoted: false, acquisition_authorized: false, production: "HOLD"
  };
}

function buildBatch(review, batch) {
  const batchNumber = Number(batch.batch_id.slice(-2));
  const ids = new Set(batch.review_case_ids);
  const sourceRecords = review.records.filter(record => ids.has(record.review_case_id)).sort((a, b) => a.review_case_id.localeCompare(b.review_case_id));
  if (sourceRecords.length !== 50) throw new Error(`${batch.batch_id}: expected 50 records, received ${sourceRecords.length}`);
  const records = sourceRecords.map(record => reviewRecord(record, batchNumber));
  const relevant = records.filter(record => record.scope_relevance_label === "RELEVANT").length;
  const assessment = {
    id: `track-b-calibration-assessment-batch-${String(batchNumber).padStart(2, "0")}-v2`, record_type: "track_b_source_relevance_calibration_batch_assessment", version: "2.3.0",
    status: "BATCH_COMPLETE_RESOLVED_MODEL_ASSISTED_NOT_EXTERNAL_HUMAN_GOLD", generated_at: REVIEWED_AT,
    input_run_id: INPUT_RUN_ID, input_artifact_id: INPUT_ARTIFACT_ID, input_artifact_digest: INPUT_DIGEST,
    batch_id: batch.batch_id, reviewed_records: 50, relevant_records: relevant, not_relevant_records: 50 - relevant, unresolved_records: 0,
    rationale_coverage: 1, evidence_reference_coverage: 1, review_method: REVIEW_METHOD, external_human_review: false, legal_opinion: false,
    records, source_pool_promotions: 0, acquisition_authorized: false, candidate_r2: "BLOCKED", production: "HOLD"
  };
  assessment.fingerprint = fingerprint(assessment);
  return assessment;
}

export function buildCalibration400(inputDirectory, batch01Directory) {
  const review = readJson(path.join(inputDirectory, "track-b-calibration-review-package-v2.json"));
  const batches = readJson(path.join(inputDirectory, "track-b-calibration-batches-v2.json"));
  const batch01 = readJson(path.join(batch01Directory, "track-b-calibration-assessment-batch-01-v2.json"));
  if (review.version !== "2.3.0") throw new Error(`Expected v2.3.0 reviewer input, received ${review.version}`);
  if (batch01.reviewed_records !== 50 || batch01.unresolved_records !== 0) throw new Error("Batch 01 immutable input is not complete.");
  const outputs = {}; const assessments = [batch01];
  for (const batch of batches.batches.filter(value => value.batch_id !== "track-b-calibration-v2-batch-01")) {
    const assessment = buildBatch(review, batch); assessments.push(assessment);
    const batchNumber = Number(batch.batch_id.slice(-2));
    outputs[`track-b-calibration-assessment-batch-${String(batchNumber).padStart(2, "0")}-v2.json`] = assessment;
  }
  assessments.sort((a, b) => a.batch_id.localeCompare(b.batch_id));
  const records = assessments.flatMap(value => value.records);
  const relevant = records.filter(record => record.scope_relevance_label === "RELEVANT").length;
  const aggregate = {
    id: "track-b-calibration-assessment-400-v2", record_type: "track_b_source_relevance_calibration_400_case_assessment", version: "2.3.0",
    status: "CALIBRATION_400_COMPLETE_MODEL_ASSISTED_EXTERNAL_HUMAN_RATIFICATION_NOT_PRESENT", generated_at: REVIEWED_AT,
    reviewer_input_run_id: INPUT_RUN_ID, reviewer_input_artifact_id: INPUT_ARTIFACT_ID, reviewer_input_artifact_digest: INPUT_DIGEST,
    batch01_run_id: BATCH01_RUN_ID, batch01_artifact_id: BATCH01_ARTIFACT_ID, batch01_artifact_digest: BATCH01_ARTIFACT_DIGEST,
    batches_completed: assessments.length, reviewed_records: records.length, relevant_records: relevant, not_relevant_records: records.length - relevant,
    unresolved_records: 0, observed_relevance_rate: relevant / records.length,
    duplicate_underlying_work_flags: records.filter(record => record.generic_code_or_keyword_collision_label === "DUPLICATE_UNDERLYING_WORK").length,
    review_method: REVIEW_METHOD, external_human_review: false, legal_opinion: false,
    batch_assessment_fingerprints: Object.fromEntries(assessments.map(value => [value.batch_id, value.fingerprint])), records,
    direct_top200_review_complete: false, final_gold_assessment: false, source_pool_promotions: 0, acquisition_authorized: false,
    candidate_r2: "BLOCKED", production: "HOLD"
  };
  aggregate.fingerprint = fingerprint(aggregate); outputs["track-b-calibration-assessment-400-v2.json"] = aggregate;
  const manifest = {
    id: "track-b-calibration-assessment-400-v2-run", record_type: "track_b_source_relevance_calibration_400_case_run", version: "2.3.0",
    status: "CALIBRATION_400_COMPLETE_DIRECT_TOP200_STILL_BLOCKED", generated_at: REVIEWED_AT,
    reviewer_input_run_id: INPUT_RUN_ID, reviewer_input_artifact_id: INPUT_ARTIFACT_ID, batch01_run_id: BATCH01_RUN_ID,
    batches_completed: 8, reviewed_records: 400, relevant_records: relevant, unresolved_records: 0,
    aggregate_assessment_fingerprint: aggregate.fingerprint, direct_top200_review_complete: false,
    source_pool_promotions: 0, acquisition_authorized: false, candidate_r2: "BLOCKED", production: "HOLD"
  };
  manifest.run_fingerprint = fingerprint(manifest); outputs["run-manifest.json"] = manifest;
  return outputs;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildCalibration400(config.input, config.batch01);
  if (config.write) writeJsonDirectory(config.output, outputs);
  const run = outputs["run-manifest.json"];
  console.log("KIDULTS Track B Calibration 400-Case Assessment: COMPLETE");
  console.log(`Reviewed: ${run.reviewed_records} / 400`);
  console.log(`Relevant: ${run.relevant_records}; unresolved: ${run.unresolved_records}`);
  console.log("Direct Top-200: BLOCKED; Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
