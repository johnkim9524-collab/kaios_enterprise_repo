import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { fingerprint, readJson, unique, writeJsonDirectory } from "./asi-discovery-common-v1.mjs";

const root = process.cwd();
const contractPath = path.join(root, "coordination", "kidults", "source-intelligence", "track-b-targeted-high-authority-source-top50-review-contract-v1.json");
const defaultInput = path.join(root, "artifacts", "agci-os", "targeted-high-authority-source-expansion-v1");
const defaultOutput = path.join(root, "artifacts", "agci-os", "track-b-targeted-high-authority-top50-pilot-v1");

const DOMAIN_TERMS = Object.freeze({
  "toys-models": ["toy", "model", "lego", "figure", "diecast", "hot wheels", "collector", "product"],
  "watches-jewelry": ["watch", "watches", "jewelry", "jewellery", "gem", "timepiece", "grading", "auction"],
  "automobiles-mobility": ["car", "cars", "vehicle", "vehicles", "motorcycle", "collector", "automobilia", "auction"],
  "fashion-accessories": ["fashion", "garment", "handbag", "sneaker", "costume", "apparel", "accessories", "museum"],
  "design-furniture": ["design", "furniture", "decorative", "museum", "collection", "bauhaus"],
  "technology-cameras": ["camera", "cameras", "computer", "computing", "technology", "mobile", "radio", "audio"],
  "gaming-music-screen": ["game", "games", "music", "film", "instrument", "disc", "imdb", "play"],
  "cards-comics-memorabilia": ["card", "cards", "comic", "comics", "baseball", "memorabilia", "grading", "collectibles"]
});

const GENERIC_PATTERNS = [
  /\b(todo|task manager|starter|boilerplate|demo app|sample app|awesome list)\b/i,
  /\b(generic software|framework repository|sdk example|coursework|homework)\b/i
];

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

function evidenceText(record) {
  return [record.display_name, record.authority_basis, record.channel_type, record.official_endpoint, record.official_documentation_url].join(" ").toLowerCase();
}

function dataChannelSuitable(record) {
  return /(api|dataset|database|catalog|collection|archive|auction|marketplace|grading|authority|museum|release|price)/i.test(record.channel_type);
}

function roleSuitable(record) {
  const roles = new Set(record.source_roles);
  const type = record.channel_type;
  if (/(auction|marketplace|market_database|market_api|marketplace_results)/i.test(type)) {
    return ["SOLD_TRANSACTION", "LISTING_SUPPLY", "AUCTION_PRIVATE_SALE", "AUTHENTICATION_CONDITION"].some(role => roles.has(role));
  }
  if (/grading/i.test(type)) return roles.has("AUTHENTICATION_CONDITION");
  return ["PRIMARY_AUTHORITY", "CATALOG_REFERENCE", "PROVENANCE_HISTORY", "INDEPENDENT_VERIFICATION", "CULTURE_ATTENTION"].some(role => roles.has(role));
}

function reviewCase(record, contract) {
  const text = evidenceText(record);
  const domainHits = (DOMAIN_TERMS[record.core_domain] ?? []).filter(term => text.includes(term));
  const genericHits = GENERIC_PATTERNS.filter(pattern => pattern.test(text)).map(pattern => String(pattern));
  const checks = {
    official_or_specialist_endpoint_explicit: /^https?:\/\//.test(record.official_endpoint),
    official_documentation_or_primary_evidence_explicit: /^https?:\/\//.test(record.official_documentation_url) && Array.isArray(record.evidence_references) && record.evidence_references.length >= 1,
    collection_scope_relevance_explicit: Array.isArray(record.collection_scope_ids) && record.collection_scope_ids.length > 0 && domainHits.length > 0,
    source_role_relevance_explicit: Array.isArray(record.source_roles) && record.source_roles.length > 0 && roleSuitable(record),
    data_channel_suitability_explicit: dataChannelSuitable(record),
    owner_or_institution_identity_explicit: typeof record.display_name === "string" && record.display_name.length >= 6 && typeof record.authority_basis === "string" && record.authority_basis.length >= 40,
    decision_and_irreplaceable_value_linkage_explicit: Array.isArray(record.customer_decision_archetypes) && record.customer_decision_archetypes.length > 0 && Array.isArray(record.irreplaceable_value_scope_ids) && record.irreplaceable_value_scope_ids.length > 0,
    generic_software_or_tangential_research_collision_absent: genericHits.length === 0,
    rights_and_commercial_state_not_inferred: Boolean(record.rights_state) && Boolean(record.commercial_use_state) && !/^(ALLOWED|CLEARED|APPROVED)/.test(record.rights_state) && !/^(ALLOWED|CLEARED|APPROVED)/.test(record.commercial_use_state)
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  const relevant = failed.length === 0;
  return {
    review_case_id: record.review_case_id,
    blind_position: record.blind_position,
    source_id: record.source_id,
    display_name: record.display_name,
    core_domain: record.core_domain,
    collection_scope_ids: record.collection_scope_ids,
    source_roles: record.source_roles,
    scope_relevance_label: relevant ? "RELEVANT" : "NOT_RELEVANT",
    source_role_label: checks.source_role_relevance_explicit ? "CORRECT" : "WRONG_ROLE",
    channel_suitability_label: checks.data_channel_suitability_explicit ? "SUITABLE_DATA_CHANNEL" : "NOT_A_USABLE_DATA_CHANNEL",
    generic_code_or_keyword_collision_label: checks.generic_software_or_tangential_research_collision_absent ? "NO_COLLISION_DETECTED" : "COLLISION_DETECTED",
    decision_value_contribution_label: checks.decision_and_irreplaceable_value_linkage_explicit ? "EXPLICITLY_LINKED" : "NOT_EXPLICITLY_LINKED",
    evidence_checks: checks,
    domain_evidence_terms: domainHits,
    failed_checks: failed,
    rationale: relevant
      ? "The record names a domain-relevant official or specialist data channel, includes explicit Scope and Source-role linkage, provides primary endpoint evidence, and preserves unknown rights as a downstream preflight gate."
      : `Rejected from the targeted qualification pool because the following evidence checks failed: ${failed.join(", ")}.`,
    evidence_references: record.evidence_references,
    reviewer: "Track B / Evidence-only model-assisted direct review",
    reviewed_at: contract.effective_at,
    resolution_state: "RESOLVED",
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

export function buildTrackBTargetedTop50Pilot({ inputDirectory = defaultInput } = {}) {
  const contract = readJson(contractPath);
  const blind = readJson(path.join(inputDirectory, "targeted-high-authority-blind-top50-input-v1.json"));
  const records = blind.records.map(record => reviewCase(record, contract));
  const relevant = records.filter(record => record.scope_relevance_label === "RELEVANT").length;
  const notRelevant = records.length - relevant;
  const unresolved = records.filter(record => record.resolution_state !== "RESOLVED").length;
  const genericContamination = records.filter(record => record.generic_code_or_keyword_collision_label === "COLLISION_DETECTED").length / records.length;
  const scopeEvidenceCoverage = records.filter(record => record.evidence_checks.collection_scope_relevance_explicit).length / records.length;
  const roleEvidenceCoverage = records.filter(record => record.evidence_checks.source_role_relevance_explicit).length / records.length;
  const precision = relevant / records.length;
  const gatePass = records.length === contract.acceptance.reviewed && unresolved === contract.acceptance.unresolved && precision >= contract.acceptance.top50_precision_minimum && genericContamination <= contract.acceptance.generic_code_contamination_maximum && scopeEvidenceCoverage === contract.acceptance.scope_evidence_coverage && roleEvidenceCoverage === contract.acceptance.source_role_evidence_coverage && unique(records.map(record => record.core_domain)).length === contract.acceptance.core_domains_represented;

  const assessment = {
    id: "targeted-high-authority-top50-assessment-v1",
    record_type: "track_b_source_relevance_assessment",
    version: "1.0.0",
    status: gatePass ? "INTERIM_TOP50_PRECISION_GATE_PASS_FINAL_400_AND_TOP200_REMAIN_ACTIVE" : "INTERIM_TOP50_PRECISION_GATE_FAIL_RECALIBRATION_REQUIRED",
    generated_at: contract.effective_at,
    review_contract_id: contract.id,
    input_id: blind.id,
    review_mode: contract.review_mode,
    reviewed: records.length,
    relevant,
    not_relevant: notRelevant,
    unresolved,
    top50_precision: precision,
    required_top50_precision: contract.acceptance.top50_precision_minimum,
    generic_code_contamination: genericContamination,
    scope_evidence_coverage: scopeEvidenceCoverage,
    source_role_evidence_coverage: roleEvidenceCoverage,
    core_domains_represented: unique(records.map(record => record.core_domain)),
    ranking_gate: gatePass ? "PASS" : "FAIL",
    records,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    legal_opinion: false,
    final_400_case_calibration_complete: false,
    final_top200_review_complete: false,
    candidate_r2: "BLOCKED",
    kidult_500: "NOT_COMPUTED",
    kidult_100: "NOT_COMPUTED",
    production: "HOLD"
  };

  const taxonomy = {
    id: "targeted-high-authority-top50-false-positive-taxonomy-v1",
    record_type: "source_relevance_false_positive_taxonomy",
    version: "1.0.0",
    status: notRelevant === 0 ? "NO_FALSE_POSITIVES_IN_INTERIM_TOP50" : "FALSE_POSITIVES_PRESENT",
    generated_at: contract.effective_at,
    false_positive_count: notRelevant,
    records: records.filter(record => record.scope_relevance_label !== "RELEVANT").map(record => ({ source_id: record.source_id, failed_checks: record.failed_checks, rationale: record.rationale })),
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const nextGate = {
    id: "targeted-high-authority-source-next-gate-v1",
    record_type: "source_precision_next_gate",
    version: "1.0.0",
    status: gatePass ? "INTERIM_GATE_PASS_FINAL_VALIDATION_REQUIRED" : "HOLD_RECALIBRATION_REQUIRED",
    generated_at: contract.effective_at,
    interim_top50_gate_pass: gatePass,
    required_next_actions: gatePass
      ? ["COMPLETE_TRACK_B_400_CASE_CALIBRATION", "COMPLETE_DIRECT_TOP200_ADJUDICATION", "MEASURE_FINAL_TOP50_AND_TOP200_PRECISION", "BEGIN_OFFICIAL_RIGHTS_ACCESS_COST_PREFLIGHT_ONLY_AFTER_FINAL_GATE"]
      : ["RECALIBRATE_TARGETED_CANDIDATE_REGISTRY", "RUN_NEW_BLIND_TOP50_REVIEW"],
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const outputs = {
    "targeted-high-authority-top50-assessment-v1.json": assessment,
    "targeted-high-authority-top50-false-positive-taxonomy-v1.json": taxonomy,
    "targeted-high-authority-source-next-gate-v1.json": nextGate
  };
  for (const value of Object.values(outputs)) value.fingerprint = fingerprint(value);
  const manifest = {
    id: "track-b-targeted-high-authority-top50-pilot-v1-run-manifest",
    record_type: "track_b_source_relevance_pilot_run",
    version: "1.0.0",
    status: gatePass ? "TRACK_B_TARGETED_TOP50_INTERIM_GATE_PASS" : "TRACK_B_TARGETED_TOP50_GATE_FAIL",
    generated_at: contract.effective_at,
    inputs: {
      review_contract: { id: contract.id, fingerprint: fingerprint(contract) },
      blind_input: { id: blind.id, fingerprint: blind.fingerprint }
    },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.fingerprint])),
    reviewed: records.length,
    relevant,
    not_relevant: notRelevant,
    top50_precision: precision,
    required_top50_precision: contract.acceptance.top50_precision_minimum,
    ranking_gate: assessment.ranking_gate,
    final_400_case_calibration_complete: false,
    final_top200_review_complete: false,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    indexes_computed: 0,
    production: "HOLD"
  };
  manifest.run_fingerprint = fingerprint(manifest);
  outputs["run-manifest.json"] = manifest;
  return outputs;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildTrackBTargetedTop50Pilot({ inputDirectory: config.input });
  if (config.write) writeJsonDirectory(config.output, outputs);
  const run = outputs["run-manifest.json"];
  console.log("KIDULTS Track B Targeted High-Authority Top-50 Pilot: COMPLETE");
  console.log(`Reviewed / Relevant / Not relevant: ${run.reviewed} / ${run.relevant} / ${run.not_relevant}`);
  console.log(`Measured Top-50 precision: ${run.top50_precision.toFixed(3)} / required ${run.required_top50_precision.toFixed(3)}`);
  console.log(`Ranking gate: ${run.ranking_gate}`);
  console.log("Final 400-case + direct Top-200 review: INCOMPLETE");
  console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
