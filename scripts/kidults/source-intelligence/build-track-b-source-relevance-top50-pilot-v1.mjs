import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const defaultInput = path.join(root, "artifacts", "input", "source-relevance-precision-v1");
const defaultOutput = path.join(root, "artifacts", "agci-os", "track-b-source-relevance-top50-pilot-v1");
const REVIEWED_AT = "2026-08-17T10:45:00+09:00";
const REVIEWER = "TRACK_B_ATLAS_INDEPENDENT_SEMANTIC_REVIEW_V1";
const REVIEW_METHOD = "BLIND_EVIDENCE_ONLY_PILOT_NO_PROVISIONAL_SCORE_USED";

const RELEVANT = new Set([2, 10, 12, 25, 26, 27, 36, 39, 42, 49]);
const LICENSE_FALSE_POSITIVE = new Set([1, 5, 6, 7, 9, 19, 23, 30, 40, 41, 45, 46, 47]);
const KEYWORD_OR_SOFTWARE_FALSE_POSITIVE = new Set([3, 13, 14, 15, 16, 35]);
const ADJACENT_RESEARCH_FALSE_POSITIVE = new Set([4, 8, 11, 17, 18, 20, 21, 22, 24, 28, 29, 31, 33, 34, 37, 38, 43, 44, 48, 50]);
const WRONG_SCOPE = new Set([32]);

const RELEVANT_LABELS = Object.freeze({
  2: { role: "WRONG_ROLE", corrected: ["INDEPENDENT_VERIFICATION"], code: "DIRECT_COLLECTIBLES_MARKET_RESEARCH", rationale: "A prospective study of Pokémon trading-card sales directly supports market-behavior evidence, but it is research evidence rather than a catalog or event-level sold-transaction feed." },
  10: { role: "PARTIALLY_CORRECT", corrected: ["AUTHENTICATION_CONDITION", "INDEPENDENT_VERIFICATION", "PROVENANCE_HISTORY"], code: "DIRECT_OBJECT_TRUST_RESEARCH", rationale: "Research on natural and cultured pearls in antique jewelry directly supports authentication and provenance decisions; PROVENANCE_HISTORY is valid, while CATALOG_REFERENCE alone is insufficient." },
  12: { role: "PARTIALLY_CORRECT", corrected: ["AUTHENTICATION_CONDITION", "INDEPENDENT_VERIFICATION", "PROVENANCE_HISTORY"], code: "DIRECT_OBJECT_TRUST_RESEARCH", rationale: "Research on natural and cultured pearls in antique jewelry directly supports authentication and provenance decisions; PROVENANCE_HISTORY is valid, while CATALOG_REFERENCE alone is insufficient." },
  25: { role: "WRONG_ROLE", corrected: ["INDEPENDENT_VERIFICATION", "MACRO_CONTEXT"], code: "DIRECT_MARKET_STRUCTURE_RESEARCH", rationale: "Research on tokenized sports and trading-card collectibles directly informs financialization and market-structure risk, but it is not a catalog source." },
  26: { role: "CORRECT", corrected: ["CATALOG_REFERENCE", "PROVENANCE_HISTORY"], code: "DIRECT_COLLECTOR_CAR_ARCHIVE", rationale: "The Porsche-focused archive explicitly covers ownership paperwork, provenance, buying, selling, and auction preparation, making the provenance role valid." },
  27: { role: "CORRECT", corrected: ["CATALOG_REFERENCE", "PROVENANCE_HISTORY"], code: "DIRECT_HISTORICAL_CARD_REFERENCE", rationale: "The institutional record directly identifies a historical trading-card series and is a valid catalog/reference and provenance lead." },
  36: { role: "PARTIALLY_CORRECT", corrected: ["CATALOG_REFERENCE"], code: "DIRECT_SPORTS_CARD_CATALOG_DATA", rationale: "JSON sports-card set lists are a valid catalog/reference source; no sold-transaction evidence is supplied, so that role is rejected." },
  39: { role: "WRONG_ROLE", corrected: ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], code: "DIRECT_ARCHIVAL_FASHION_RESEARCH", rationale: "University research on deconstructivist designer fashion directly supports cultural and historical interpretation of archival garments, but it is not a product catalog." },
  42: { role: "WRONG_ROLE", corrected: ["CULTURE_ATTENTION", "INDEPENDENT_VERIFICATION"], code: "DIRECT_ARCHIVAL_FASHION_RESEARCH", rationale: "Duplicate file endpoint for university research on deconstructivist designer fashion supports cultural and historical interpretation, not catalog data." },
  49: { role: "CORRECT", corrected: ["CATALOG_REFERENCE", "PRIMARY_AUTHORITY"], code: "OFFICIAL_CATEGORY_AUTHORITY", rationale: "The official website of a lighting manufacturer is directly relevant as a primary authority and potential catalog reference for identifiable design objects." }
});

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function fingerprint(value) { return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`; }
function parseArgs(argv) {
  const config = { input: defaultInput, output: defaultOutput, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") config.input = path.resolve(argv[++index]);
    else if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return config;
}
function writeOutputs(directory, outputs) {
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, value] of Object.entries(outputs)) fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function negativeLabel(rank) {
  if (LICENSE_FALSE_POSITIVE.has(rank)) return {
    code: "LICENSE_FRANCHISE_OR_BUSINESS_RECORD_NOT_DATA_CHANNEL",
    rationale: "The supplied record is a license, franchise, venue, business-transfer, or merchandising document rather than a reusable collectible object, market, authentication, provenance, or attention data channel."
  };
  if (KEYWORD_OR_SOFTWARE_FALSE_POSITIVE.has(rank)) return {
    code: "GENERIC_SOFTWARE_OR_KEYWORD_COLLISION",
    rationale: "The endpoint matched a broad keyword but concerns general software, database terminology, digital automation, religious audio, or an adjacent non-collectible use case."
  };
  if (WRONG_SCOPE.has(rank)) return {
    code: "WRONG_COLLECTION_SCOPE",
    rationale: "The endpoint may describe memorabilia in another context, but it is not relevant to the assigned Collection Scope and cannot be promoted without explicit remapping."
  };
  if (ADJACENT_RESEARCH_FALSE_POSITIVE.has(rank)) return {
    code: "ADJACENT_RESEARCH_NOT_DECISION_SOURCE",
    rationale: "The research topic is adjacent to a category term but does not provide the object identity, market observation, authentication, provenance, or decision evidence required by the assigned Scope."
  };
  throw new Error(`No independent pilot label configured for rank ${rank}.`);
}

function reviewRecord(source) {
  const rank = source.provisional_rank;
  const positive = RELEVANT_LABELS[rank];
  const label = positive ?? negativeLabel(rank);
  return {
    endpoint_id: source.endpoint_id,
    source_id: source.source_id,
    provisional_rank: rank,
    endpoint_url: source.endpoint_url,
    owner: source.owner,
    channel_type: source.channel_type,
    candidate_collection_scopes: source.candidate_collection_scopes,
    candidate_source_roles: source.candidate_source_roles,
    evidence_excerpt: source.evidence_excerpt,
    scope_relevance_label: RELEVANT.has(rank) ? "RELEVANT" : "NOT_RELEVANT",
    source_role_label: positive?.role ?? "NOT_APPLICABLE",
    corrected_source_roles: positive?.corrected ?? [],
    false_positive_or_value_code: label.code,
    rationale: label.rationale,
    evidence_references: ["endpoint_url", "owner", "channel_type", "evidence_excerpt.source_names", "evidence_excerpt.descriptions", "evidence_excerpt.topics", "candidate_collection_scopes", "candidate_source_roles"],
    reviewer: REVIEWER,
    review_method: REVIEW_METHOD,
    reviewed_at: REVIEWED_AT,
    resolution_state: "RESOLVED",
    qualified_source: false,
    source_pool_promotion_authorized: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

export function buildTrackBTop50Pilot({ inputDirectory = defaultInput } = {}) {
  const queue = readJson(path.join(inputDirectory, "provisional-top-200-review-queue-v1.json"));
  const precisionReport = readJson(path.join(inputDirectory, "source-relevance-precision-report-v1.json"));
  const top50 = queue.records.filter(record => record.provisional_rank <= 50).sort((a, b) => a.provisional_rank - b.provisional_rank);
  if (top50.length !== 50) throw new Error(`Expected 50 Top records, received ${top50.length}.`);
  const records = top50.map(reviewRecord);
  const relevant = records.filter(record => record.scope_relevance_label === "RELEVANT");
  const notRelevant = records.filter(record => record.scope_relevance_label === "NOT_RELEVANT");
  const acceptableRoles = relevant.filter(record => ["CORRECT", "PARTIALLY_CORRECT"].includes(record.source_role_label));
  const codeCounts = Object.fromEntries([...new Set(records.map(record => record.false_positive_or_value_code))].sort().map(code => [code, records.filter(record => record.false_positive_or_value_code === code).length]));
  const precision = relevant.length / records.length;

  const assessment = {
    id: "track-b-source-relevance-top50-pilot-assessment-v1",
    record_type: "track_b_source_relevance_pilot_assessment",
    version: "1.0.0",
    status: precision >= 0.95 ? "TOP_50_PILOT_PRECISION_PASS_FINAL_REVIEW_REQUIRED" : "TOP_50_PILOT_PRECISION_FAIL_RECALIBRATION_REQUIRED",
    generated_at: REVIEWED_AT,
    review_scope: "PROVISIONAL_TOP_50_ONLY",
    input_artifact_id: 9273114506,
    source_precision_report_id: precisionReport.id,
    reviewed_records: records.length,
    relevant_records: relevant.length,
    not_relevant_records: notRelevant.length,
    top_50_precision: precision,
    top_50_precision_required: 0.95,
    top_50_precision_pass: precision >= 0.95,
    relevant_candidate_role_acceptable_count: acceptableRoles.length,
    relevant_candidate_role_acceptable_rate: relevant.length ? acceptableRoles.length / relevant.length : null,
    records,
    empirical_scope: "MODEL_ASSISTED_INDEPENDENT_EVIDENCE_REVIEW_PILOT_NOT_EXTERNAL_HUMAN_GOLD_SET",
    external_human_review: false,
    legal_opinion: false,
    final_400_case_assessment_completed: false,
    final_top_200_assessment_completed: false,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    kidult_500: "NOT_COMPUTED",
    kidult_100: "NOT_COMPUTED",
    production: "HOLD"
  };

  const taxonomy = {
    id: "track-b-top50-false-positive-taxonomy-v1",
    record_type: "source_relevance_false_positive_taxonomy",
    version: "1.0.0",
    status: "PILOT_EVIDENCE_AVAILABLE_FULL_400_CASE_TAXONOMY_PENDING",
    generated_at: REVIEWED_AT,
    reviewed_records: records.length,
    false_positive_records: notRelevant.length,
    code_counts: codeCounts,
    production: "HOLD"
  };

  const directives = {
    id: "track-b-top50-ranking-recalibration-directives-v1",
    record_type: "source_relevance_recalibration_directives",
    version: "1.0.0",
    status: "RECALIBRATION_REQUIRED_BEFORE_QUALIFICATION",
    generated_at: REVIEWED_AT,
    trigger: { top_50_precision: precision, required_minimum: 0.95, gap: 0.95 - precision },
    directives: [
      "REJECT_LICENSE_FRANCHISE_AND_BUSINESS_RECORDS_WITHOUT_OBJECT_OR_MARKET_DATA",
      "SEPARATE_COLLECTIBLE_CONSTRUCTION_SYSTEMS_FROM_GENERAL_CONSTRUCTION_SOFTWARE",
      "SEPARATE_COLLECTIBLE_SEATING_OBJECTS_FROM_HUMAN_SEATING_RESEARCH",
      "REQUIRE_EXPLICIT_PHYSICAL_COLLECTIBLE_OR_APPROVED_MARKET_EVIDENCE",
      "REQUIRE_CHANNEL_SUITABILITY_BEYOND_CATEGORY_KEYWORD_MATCH",
      "MAP_DIRECT_SCHOLARLY_EVIDENCE_TO_INDEPENDENT_VERIFICATION_OR_CULTURE_CONTEXT",
      "COLLAPSE_DUPLICATE_DOI_FILE_AND_VERSION_ENDPOINTS_BY_UNDERLYING_WORK_LINEAGE",
      "PRESERVE_OFFICIAL_AUTHORITY_AND_STRUCTURED_REFERENCE_DATA_CANDIDATES"
    ],
    next_gate: "COMPLETE_400_CASE_AND_DIRECT_TOP_200_TRACK_B_REVIEW_THEN_RECALIBRATE_RANKING",
    acquisition_authorized: false,
    production: "HOLD"
  };

  const outputs = {
    "source-relevance-top50-pilot-assessment-v1.json": assessment,
    "top50-false-positive-taxonomy-v1.json": taxonomy,
    "top50-ranking-recalibration-directives-v1.json": directives
  };
  for (const value of Object.values(outputs)) value.fingerprint = fingerprint(value);
  const manifest = {
    id: "track-b-source-relevance-top50-pilot-run-v1",
    record_type: "track_b_source_relevance_pilot_run",
    version: "1.0.0",
    status: "PILOT_COMPLETE_PRECISION_FAIL_FULL_REVIEW_ACTIVE",
    generated_at: REVIEWED_AT,
    inputs: { queue: { id: queue.id, fingerprint: queue.fingerprint }, precision_report: { id: precisionReport.id, fingerprint: precisionReport.fingerprint } },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.fingerprint])),
    reviewed_records: records.length,
    relevant_records: relevant.length,
    top_50_precision: precision,
    top_50_precision_required: 0.95,
    top_50_precision_pass: precision >= 0.95,
    final_assessment_completed: false,
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
  const outputs = buildTrackBTop50Pilot({ inputDirectory: config.input });
  if (config.write) writeOutputs(config.output, outputs);
  const run = outputs["run-manifest.json"];
  console.log("KIDULTS Track B Source Relevance Top-50 Pilot: COMPLETE");
  console.log(`Reviewed: ${run.reviewed_records} / 50`);
  console.log(`Relevant: ${run.relevant_records}`);
  console.log(`Measured Top-50 precision: ${run.top_50_precision.toFixed(3)} / required ${run.top_50_precision_required.toFixed(2)}`);
  console.log("Ranking gate: FAIL — recalibration required");
  console.log("Full 400-case + direct Top-200 review: ACTIVE");
  console.log("Acquisition: BLOCKED");
  console.log("Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
