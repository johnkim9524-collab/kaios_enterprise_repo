import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const defaultInput = path.join(root, "artifacts", "input", "source-precision-ranking-v2-final");
const defaultOutput = path.join(root, "artifacts", "agci-os", "track-b-source-relevance-top50-v2-pilot");
const REVIEWED_AT = "2026-08-17T11:05:00+09:00";
const REVIEWER = "TRACK_B_ATLAS_INDEPENDENT_BLIND_SEMANTIC_REVIEW_V2";
const METHOD = "BLIND_EVIDENCE_ONLY_NO_NUMERIC_RANKING_SCORE_MODEL_ASSISTED_NOT_EXTERNAL_HUMAN_GOLD";

const RELEVANT = new Set([
  1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,
  28,29,33,34,35,39,40,50
]);

const PARTIAL_ANCHOR_ROLES = Object.freeze({
  9: ["PRIMARY_AUTHORITY","AUTHENTICATION_CONDITION","INDEPENDENT_VERIFICATION"],
  11: ["PRIMARY_AUTHORITY","AUTHENTICATION_CONDITION","INDEPENDENT_VERIFICATION"],
  17: ["INDEPENDENT_VERIFICATION","SOLD_TRANSACTION","LISTING_SUPPLY"],
  20: ["CATALOG_REFERENCE","LISTING_SUPPLY","SOLD_TRANSACTION","INDEPENDENT_VERIFICATION"],
  22: ["SOLD_TRANSACTION","LISTING_SUPPLY","CULTURE_ATTENTION"],
  23: ["LISTING_SUPPLY","AUTHENTICATION_CONDITION","CATALOG_REFERENCE"],
  24: ["CATALOG_REFERENCE","LISTING_SUPPLY","INDEPENDENT_VERIFICATION"],
  25: ["PRIMARY_AUTHORITY","CATALOG_REFERENCE","PROVENANCE_HISTORY"]
});

const RESEARCH_POSITIVES = Object.freeze({
  28: { roles: ["INDEPENDENT_VERIFICATION","MACRO_CONTEXT"], code: "TRADING_CARD_MARKET_RESEARCH", rationale: "The Pokémon-card investment study directly supports market-structure context, but is not an event-level transaction or catalog feed." },
  29: { roles: ["CULTURE_ATTENTION","INDEPENDENT_VERIFICATION"], code: "TCG_COMMUNITY_RESEARCH", rationale: "Research on TCG virtual communities is relevant to culture and attention signals, not primary catalog or transaction evidence." },
  33: { roles: ["MACRO_CONTEXT","INDEPENDENT_VERIFICATION"], code: "EYEWEAR_MARKET_CONTEXT", rationale: "The eyewear market report is relevant contextual demand evidence, not object-level collectible data." },
  34: { roles: ["AUTHENTICATION_CONDITION","INDEPENDENT_VERIFICATION","PROVENANCE_HISTORY"], code: "DECORATIVE_OBJECT_AUTHENTICATION_RESEARCH", rationale: "The porcelain microscopy study directly supports authentication and chronology for a collectible decorative object." },
  35: { roles: ["AUTHENTICATION_CONDITION","SOLD_TRANSACTION","INDEPENDENT_VERIFICATION"], code: "TRADING_CARD_CONDITION_DATASET", rationale: "The eBay-listing centering dataset supports card-condition and market-observation research; listing evidence is not equivalent to a completed sale." },
  39: { roles: ["SOLD_TRANSACTION","LISTING_SUPPLY","INDEPENDENT_VERIFICATION"], code: "CLASSIC_CAR_SALES_DATASET_CANDIDATE", rationale: "The repository is explicitly a classic-car historical sales dataset and is Scope-relevant, although authority, lineage and rights remain unqualified." },
  40: { roles: ["LISTING_SUPPLY","INDEPENDENT_VERIFICATION"], code: "VEHICLE_MARKET_DERIVED_DATA_PROJECT", rationale: "The project explicitly analyzes Spanish car and motorcycle market data, making it relevant as a derived Source candidate but not authoritative or rights-cleared." },
  50: { roles: ["CATALOG_REFERENCE","AUTHENTICATION_CONDITION","INDEPENDENT_VERIFICATION"], code: "JEWELRY_HALLMARK_REFERENCE_DATA", rationale: "The structured, source-cited hallmark and gemstone reference dataset is directly relevant to fine-jewelry identity and authentication." }
});

const NEGATIVE = Object.freeze({
  30: ["DEMO_ECOMMERCE_APPLICATION_NOT_SOURCE", "A portfolio-style eyewear shopping application is not an independent reusable market, authority, catalog or verification Source."],
  31: ["MECHANICS_TERM_COLLISION_NOT_MECHA", "Soil mechanics and foundation engineering are unrelated to collectible model kits or mecha."],
  32: ["DIGITAL_CARD_GAME_WRONG_PHYSICAL_SCOPE", "The repository covers Pokémon TCG Pocket mobile-game data rather than the current physical trading-card Collection Scope."],
  36: ["MECHA_TOKEN_SOFTWARE_COLLISION", "A Linux Wayland toolkit using the word Mecha is unrelated to collectible model kits."],
  37: ["MECHANICS_LAB_NOT_MECHA", "A hydraulics and fluid-mechanics laboratory repository is unrelated to collectible mecha."],
  38: ["MECHANICS_LAB_NOT_MECHA", "An engineering mechanics laboratory is unrelated to collectible model kits or mecha."],
  41: ["MECHANIZE_LIBRARY_KEYWORD_COLLISION", "A Ruby web-automation library is not a collectible mecha data channel."],
  42: ["MECHA_NAME_SOFTWARE_COLLISION", "A scientific acquisition pipeline named aeon_mecha is unrelated to collectible model kits."],
  43: ["PROJECT_DATABASE_NOT_INDEPENDENT_SOURCE", "A database/BI project about an eyewear retailer is not an authoritative or independently reusable eyewear data channel."],
  44: ["ECOMMERCE_DEMO_NOT_SOURCE", "A jewelry storefront application is not an authority, catalog, market-event or verification Source."],
  45: ["AWESOME_LIST_NOT_SOURCE", "A general curated list of fintech and mechanical-engineering resources is not a collectible Source channel."],
  46: ["MECHANIZE_LIBRARY_KEYWORD_COLLISION", "A Firefox web-automation library is unrelated to collectible mecha."],
  47: ["WRONG_SCOPE_MECHANICAL_KEYBOARD_DATABASE", "A mechanical-keyboard database is not relevant to the assigned model-kits/mecha Scope."],
  48: ["AWESOME_LIST_ADJACENT_RESEARCH", "A virtual try-on bibliography is not an object, market, catalog, provenance or authority data channel for collectible garments."],
  49: ["AUTOMOTIVE_DIAGNOSTICS_NOT_COLLECTOR_SOURCE", "An OBD diagnostic application does not provide collector-vehicle identity, provenance, transaction or scarcity data."]
});

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function fingerprint(value) { return `sha256:${crypto.createHash("sha256").update(stable(value)).digest("hex")}`; }
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

function positiveLabel(source, position) {
  if (position <= 27) {
    const partialRoles = PARTIAL_ANCHOR_ROLES[position];
    return {
      role: partialRoles ? "PARTIALLY_CORRECT" : "CORRECT",
      corrected: partialRoles ?? source.assigned_source_roles,
      code: source.record_origin === "BOUNDED_ADAPTER_CONTRACT" ? "BOUNDED_STRUCTURED_AUTHORITY_CANDIDATE" : "TRUSTED_REGISTRY_SOURCE_CANDIDATE",
      rationale: `${source.owner} is directly aligned to the assigned Collection Scope and supplies an official, specialist, institutional, structured, auction, authentication, catalog or market channel. Qualification, rights and independence remain separate downstream gates.`
    };
  }
  const research = RESEARCH_POSITIVES[position];
  if (!research) throw new Error(`Missing positive review for case ${position}.`);
  return { role: "WRONG_ROLE", corrected: research.roles, code: research.code, rationale: research.rationale };
}

function reviewCase(source, position) {
  if (source.numeric_ranking_score_visible_to_reviewer !== false) throw new Error(`Case ${position} exposes a numeric score.`);
  const positive = RELEVANT.has(position) ? positiveLabel(source, position) : null;
  const negative = NEGATIVE[position];
  if (!positive && !negative) throw new Error(`No review configured for case ${position}.`);
  return {
    blind_case_id: source.blind_case_id,
    endpoint_id: source.endpoint_id,
    source_id: source.source_id,
    endpoint_url: source.endpoint_url,
    owner: source.owner,
    channel_type: source.channel_type,
    record_origin: source.record_origin,
    candidate_collection_scopes: source.candidate_collection_scopes,
    supplied_source_roles: source.assigned_source_roles,
    evidence_excerpt: source.evidence_excerpt,
    explicit_scope_evidence: source.explicit_scope_evidence,
    channel_suitability_evidence: source.channel_suitability_evidence,
    blind_queue_fill_state: source.blind_queue_fill_state,
    scope_relevance_label: positive ? "RELEVANT" : "NOT_RELEVANT",
    source_role_label: positive?.role ?? "NOT_APPLICABLE",
    corrected_source_roles: positive?.corrected ?? [],
    value_or_false_positive_code: positive?.code ?? negative[0],
    rationale: positive?.rationale ?? negative[1],
    evidence_references: ["endpoint_url","owner","channel_type","record_origin","candidate_collection_scopes","evidence_excerpt","explicit_scope_evidence","channel_suitability_evidence"],
    reviewer: REVIEWER,
    review_method: METHOD,
    reviewed_at: REVIEWED_AT,
    resolution_state: "RESOLVED",
    qualified_source: false,
    source_pool_promotion_authorized: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

export function buildTrackBTop50V2Pilot({ inputDirectory = defaultInput } = {}) {
  const blind = readJson(path.join(inputDirectory, "blind-top50-input-v2.json"));
  const gaps = readJson(path.join(inputDirectory, "precision-v2-gap-report.json"));
  if (blind.records.length !== 50) throw new Error(`Expected 50 blind records, received ${blind.records.length}.`);
  const records = blind.records.map((record, index) => reviewCase(record, index + 1));
  const relevant = records.filter(record => record.scope_relevance_label === "RELEVANT");
  const notRelevant = records.filter(record => record.scope_relevance_label === "NOT_RELEVANT");
  const acceptableRoles = relevant.filter(record => ["CORRECT","PARTIALLY_CORRECT"].includes(record.source_role_label));
  const precision = relevant.length / records.length;
  const codeCounts = Object.fromEntries([...new Set(records.map(record => record.value_or_false_positive_code))].sort()
    .map(code => [code, records.filter(record => record.value_or_false_positive_code === code).length]));

  const assessment = {
    id: "track-b-source-relevance-top50-v2-pilot-assessment",
    record_type: "track_b_source_relevance_blind_pilot_assessment",
    version: "2.0.0",
    status: precision >= 0.8 ? "V2_INTERIM_PRECISION_PASS_FINAL_TRACK_B_REVIEW_REQUIRED" : "V2_INTERIM_PRECISION_FAIL_TARGETED_SOURCE_EXPANSION_REQUIRED",
    generated_at: REVIEWED_AT,
    input_artifact_id: 9273918009,
    blind_input_id: blind.id,
    review_scope: "NEW_HOLDOUT_BLIND_TOP_50",
    prior_pilot_endpoint_overlap: blind.pilot_training_endpoint_overlap,
    reviewed_records: records.length,
    relevant_records: relevant.length,
    not_relevant_records: notRelevant.length,
    measured_top_50_precision: precision,
    interim_precision_required: 0.8,
    final_precision_required: 0.95,
    interim_precision_pass: precision >= 0.8,
    final_precision_pass: precision >= 0.95,
    relevant_role_acceptable_count: acceptableRoles.length,
    relevant_role_acceptable_rate: relevant.length ? acceptableRoles.length / relevant.length : null,
    records,
    empirical_scope: "MODEL_ASSISTED_INDEPENDENT_BLIND_EVIDENCE_REVIEW_NOT_EXTERNAL_HUMAN_GOLD_OR_LEGAL_OPINION",
    final_400_case_review_completed: false,
    final_top_200_review_completed: false,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    kidult_500: "NOT_COMPUTED",
    kidult_100: "NOT_COMPUTED",
    production: "HOLD"
  };

  const taxonomy = {
    id: "track-b-source-relevance-top50-v2-error-taxonomy",
    record_type: "source_relevance_error_taxonomy",
    version: "2.0.0",
    status: "BLIND_PILOT_COMPLETE_FULL_GOLD_REVIEW_PENDING",
    generated_at: REVIEWED_AT,
    reviewed_records: records.length,
    false_positive_records: notRelevant.length,
    code_counts: codeCounts,
    false_positive_records_detail: notRelevant.map(record => ({ endpoint_id: record.endpoint_id, code: record.value_or_false_positive_code, rationale: record.rationale })),
    production: "HOLD"
  };

  const directives = {
    id: "track-b-source-relevance-v3-directives",
    record_type: "source_relevance_recalibration_directives",
    version: "3.0.0",
    status: precision >= 0.8 ? "INTERIM_GATE_PASS_CONTINUE_FINAL_REVIEW" : "TARGETED_HIGH_AUTHORITY_SOURCE_EXPANSION_REQUIRED",
    generated_at: REVIEWED_AT,
    trigger: { measured_precision: precision, interim_required: 0.8, final_required: 0.95 },
    directives: [
      "RETAIN_VERIFIED_REGISTRY_AND_BOUNDED_ADAPTER_ANCHORS",
      "REJECT_ECOMMERCE_DEMO_AND_PORTFOLIO_PROJECTS",
      "REJECT_MECHANICS_MECHANIZE_AND_MECHA_NAME_COLLISIONS",
      "REJECT_DIGITAL_CARD_DATABASES_FROM_PHYSICAL_TRADING_CARD_SCOPE",
      "REMAP_VALID_SCHOLARSHIP_TO_INDEPENDENT_VERIFICATION_CULTURE_OR_MACRO_CONTEXT",
      "ADD_TARGETED_OFFICIAL_API_CATALOG_ARCHIVE_AND_MARKET_CHANNELS_PER_CORE_DOMAIN",
      "REQUIRE_AT_LEAST_50_UNIQUE_HIGH_CONFIDENCE_CHANNEL_CANDIDATES_BEFORE_NEXT_BLIND_TOP_50",
      "KEEP_ALL_CANDIDATES_UNQUALIFIED_UNTIL_TRACK_B_AND_PREFLIGHT_GATES"
    ],
    next_gate: precision >= 0.8 ? "COMPLETE_400_CASE_AND_DIRECT_TOP_200_REVIEW" : "BUILD_TARGETED_SOURCE_ANCHOR_EXPANSION_V3_THEN_NEW_BLIND_TOP_50",
    acquisition_authorized: false,
    production: "HOLD"
  };

  const outputs = {
    "source-relevance-top50-v2-pilot-assessment.json": assessment,
    "top50-v2-error-taxonomy.json": taxonomy,
    "source-relevance-v3-directives.json": directives
  };
  for (const value of Object.values(outputs)) value.fingerprint = fingerprint(value);
  const manifest = {
    id: "track-b-source-relevance-top50-v2-pilot-run",
    record_type: "track_b_source_relevance_blind_pilot_run",
    version: "2.0.0",
    status: assessment.status,
    generated_at: REVIEWED_AT,
    inputs: { blind_input: { id: blind.id, fingerprint: blind.fingerprint }, gap_report: { id: gaps.id, fingerprint: gaps.fingerprint } },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.fingerprint])),
    reviewed_records: records.length,
    relevant_records: relevant.length,
    not_relevant_records: notRelevant.length,
    measured_top_50_precision: precision,
    interim_precision_required: 0.8,
    final_precision_required: 0.95,
    interim_precision_pass: precision >= 0.8,
    final_precision_pass: precision >= 0.95,
    prior_pilot_overlap: blind.pilot_training_endpoint_overlap,
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
  const outputs = buildTrackBTop50V2Pilot({ inputDirectory: config.input });
  if (config.write) writeOutputs(config.output, outputs);
  const run = outputs["run-manifest.json"];
  console.log("KIDULTS Track B Source Relevance Top-50 v2 Pilot: COMPLETE");
  console.log(`Reviewed / relevant / not relevant: ${run.reviewed_records} / ${run.relevant_records} / ${run.not_relevant_records}`);
  console.log(`Measured precision: ${run.measured_top_50_precision.toFixed(3)} / interim ${run.interim_precision_required.toFixed(2)} / final ${run.final_precision_required.toFixed(2)}`);
  console.log(`Interim / final gate: ${run.interim_precision_pass ? "PASS" : "FAIL"} / ${run.final_precision_pass ? "PASS" : "FAIL"}`);
  console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
