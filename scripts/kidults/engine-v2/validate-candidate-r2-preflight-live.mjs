import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const output = path.resolve(process.argv[2] ?? "artifacts/agci-os/candidate-r2-preflight-r1");
const errors = [];
const expectedAuthorityFamilies = new Set(["THE_MET", "V_AND_A", "SMITHSONIAN", "ART_INSTITUTE_CHICAGO"]);

function read(name) {
  try { return JSON.parse(fs.readFileSync(path.join(output, name), "utf8")); }
  catch (error) { errors.push(`${name}: ${error.message}`); return null; }
}
function assert(condition, message) { if (!condition) errors.push(message); }
function sumObjectValues(value) { return Object.values(value ?? {}).reduce((sum, item) => sum + Number(item ?? 0), 0); }

const run = read("run-manifest.json");
const quarantine = read("raw-quarantine-report.json");
const universe = read("universe-admission-report.json");
const entity = read("entity-resolution-report.json");
const evidenceGraph = read("evidence-graph-shadow.json");
const marketGraph = read("market-graph-shadow.json");
const cluster = read("cluster-discovery-preflight.json");
const stress = read("stress-stability-preflight.json");

assert(run?.state === "CANDIDATE_R2_PREFLIGHT_PARTIAL_PASS", "Run state mismatch.");
assert(run?.run_mode === "FOUR_AUTHORITY_PLUS_RIGHTS_CLEARED_TRANSACTION_BOUNDED_LIVE", "Run mode mismatch.");
assert(run?.source_family_count === 5 && run?.authority_source_family_count === 4 && run?.transaction_source_family_count === 1,
  "Source-family cardinality mismatch.");
assert(Number(run?.authority_input_record_count) >= 32, "Four authority families must each meet the bounded minimum.");
assert(run?.transaction_input_event_count === 1 && run?.admitted_market_event_count === 1, "Transaction input/admission mismatch.");
assert(run?.admitted_authority_record_count === run?.authority_input_record_count,
  "Nominal five-source live preflight must not silently lose authority inputs.");
assert(run?.quarantined_record_count === 0, "Nominal live preflight must have zero quarantined records.");
assert(run?.physical_object_candidate_count === run?.admitted_authority_record_count, "Physical Object count must follow admitted authority count.");
assert(run?.canonical_design_candidate_count > 0 && run?.canonical_design_candidate_count <= run?.admitted_authority_record_count,
  "Canonical Design count must be derived from admitted authorities.");
assert(run?.manual_review_record_count === entity?.review_required_record_count, "Manual-review count mismatch.");
assert(run?.sold_transaction_count === 1 && run?.listing_count === 0 && run?.historical_price_coverage === 1,
  "Historical-sale/listing boundary mismatch.");
assert(run?.deterministic_rerun === "PASS" && run?.fail_closed === true, "Deterministic fail-closed state mismatch.");
assert(run?.critical_provenance_coverage === 1 && run?.rights_state_coverage === 1 && run?.duplicate_contamination === 0,
  "Provenance/rights/duplicate boundary mismatch.");
assert(run?.stale_record_admission === 0 && run?.rights_missing_admission === 0, "Invalid records were admitted.");
assert(run?.provider_to_portal_direct_paths === 0 && run?.provider_to_index_direct_paths === 0,
  "Provider direct-path boundary violation.");
assert(run?.autonomous_public_vertical_promotion === 0 && run?.public_index_computation === 0 && run?.production_mutation === 0,
  "Promotion/Index/Production mutation boundary violation.");
assert(run?.publication_eligible === false && run?.production_eligible === false, "Preflight must remain non-promotable.");
assert(/^sha256:[a-f0-9]{64}$/.test(run?.run_fingerprint ?? ""), "Run fingerprint invalid.");

const generatedAtMs = new Date(run?.generated_at ?? "").getTime();
const wallAgeMs = Date.now() - generatedAtMs;
assert(Number.isFinite(generatedAtMs), "Run generated_at is invalid.");
assert(wallAgeMs >= -120_000 && wallAgeMs <= 20 * 60_000,
  "Run freshness is not bound to the current execution window.");

assert(quarantine?.status === "PASS_NO_REJECTIONS", "Raw Quarantine must report no nominal live rejections.");
assert(quarantine?.input_record_count === run?.authority_input_record_count + run?.transaction_input_event_count,
  "Raw Quarantine input count mismatch.");
assert(quarantine?.admitted_record_count === quarantine?.input_record_count && quarantine?.quarantined_record_count === 0,
  "Raw Quarantine admission mismatch.");
assert(quarantine?.index_eligible_quarantined_records === 0 && quarantine?.mutation_performed === false,
  "Raw Quarantine boundary violation.");

const authorityCandidates = universe?.authority_admission_candidates ?? [];
const familyCounts = new Map();
for (const record of authorityCandidates) familyCounts.set(record.source_family, (familyCounts.get(record.source_family) ?? 0) + 1);
assert(new Set(familyCounts.keys()).size === expectedAuthorityFamilies.size
  && [...expectedAuthorityFamilies].every(family => (familyCounts.get(family) ?? 0) >= 8),
  "All four live authority families must be represented with at least eight admitted records each.");
assert(universe?.authority_admission_candidate_count === run?.admitted_authority_record_count,
  "Universe authority count mismatch.");
assert(universe?.market_event_admission_candidate_count === run?.admitted_market_event_count,
  "Universe transaction count mismatch.");
assert(universe?.unique_source_record_count === run?.admitted_authority_record_count && universe?.duplicate_contamination === 0,
  "Universe uniqueness mismatch.");
assert(universe?.provenance_coverage === 1 && universe?.rights_state_coverage === 1,
  "Universe provenance/rights coverage mismatch.");
assert(universe?.global_universe_object_count_mutated === false
  && universe?.public_projection === false && universe?.index_eligible === false && universe?.production_eligible === false,
  "Universe promotion boundary violation.");

assert(entity?.source_record_count === run?.admitted_authority_record_count, "Entity source count mismatch.");
assert(entity?.physical_object_candidate_count === run?.physical_object_candidate_count, "Entity physical count mismatch.");
assert(entity?.canonical_design_candidate_count === run?.canonical_design_candidate_count, "Entity design count mismatch.");
assert(entity?.auto_merge_count === 0 && entity?.provider_id_promoted_to_canonical_id === false, "Entity auto-promotion is prohibited.");
const reviewGroups = entity?.review_groups ?? [];
assert(entity?.review_required_group_count === reviewGroups.length, "Entity review-group count mismatch.");
assert(entity?.review_required_record_count === reviewGroups.reduce((sum, group) => sum + Number(group.record_count ?? 0), 0),
  "Entity review-record count mismatch.");
assert(reviewGroups.every(group => group.auto_merge === false), "Review groups must not auto-merge.");
assert(entity?.golden_dataset_target_cases === 200 && entity?.golden_dataset_validated_cases === 0
  && entity?.golden_dataset_accuracy === null, "Golden Dataset must remain unvalidated.");
assert(entity?.public_projection === false && entity?.index_eligible === false && entity?.production_eligible === false,
  "Entity promotion boundary violation.");

assert(evidenceGraph?.source_family_count === 5 && evidenceGraph?.authority_source_family_count === 4
  && evidenceGraph?.transaction_source_family_count === 1, "Evidence Graph source-family mismatch.");
assert(evidenceGraph?.node_count === (evidenceGraph?.nodes ?? []).length
  && evidenceGraph?.edge_count === (evidenceGraph?.edges ?? []).length, "Evidence Graph serialized count mismatch.");
assert(sumObjectValues(evidenceGraph?.node_counts) === evidenceGraph?.node_count, "Evidence Graph node-count decomposition mismatch.");
assert(evidenceGraph?.node_counts?.SOURCE === 5, "Evidence Graph source nodes must remain five.");
assert(evidenceGraph?.node_counts?.PHYSICAL_OBJECT_CANDIDATE === run?.physical_object_candidate_count,
  "Evidence Graph physical-object count mismatch.");
assert(evidenceGraph?.node_counts?.CANONICAL_DESIGN_CANDIDATE === run?.canonical_design_candidate_count,
  "Evidence Graph design count mismatch.");
assert(evidenceGraph?.critical_provenance_coverage === 1 && evidenceGraph?.rights_state_coverage === 1,
  "Evidence Graph provenance/rights coverage mismatch.");
for (const key of ["current_demand", "scarcity", "current_valuation", "liquidity", "index_confidence"]) {
  assert(evidenceGraph?.metric_support?.[key] === "NOT_VERIFIED", `${key} must remain NOT_VERIFIED.`);
}
assert(evidenceGraph?.public_projection === false && evidenceGraph?.index_eligible === false && evidenceGraph?.production_eligible === false,
  "Evidence Graph promotion boundary violation.");

assert(marketGraph?.node_count === (marketGraph?.nodes ?? []).length
  && marketGraph?.edge_count === (marketGraph?.edges ?? []).length, "Market Graph serialized count mismatch.");
assert(sumObjectValues(marketGraph?.node_counts) === marketGraph?.node_count, "Market Graph node-count decomposition mismatch.");
assert(marketGraph?.authority_design_candidate_nodes === run?.canonical_design_candidate_count
  && marketGraph?.authority_observation_nodes === run?.admitted_authority_record_count,
  "Market Graph authority counts mismatch.");
assert(marketGraph?.market_event_nodes === 1 && marketGraph?.sold_transaction_nodes === 1 && marketGraph?.listing_nodes === 0,
  "Market Graph transaction/listing counts mismatch.");
assert(marketGraph?.authority_context_edges === run?.admitted_authority_record_count,
  "Market Graph authority-context edge count mismatch.");
assert(marketGraph?.listing_is_sale === false && marketGraph?.historical_price_coverage === 1
  && marketGraph?.current_market_metrics_verified === 0, "Market Graph metric boundary mismatch.");
for (const key of ["current_demand", "scarcity", "current_valuation", "liquidity"]) {
  assert(marketGraph?.[key] === "NOT_VERIFIED", `${key} must remain NOT_VERIFIED.`);
}
assert(marketGraph?.public_projection === false && marketGraph?.index_eligible === false && marketGraph?.production_eligible === false,
  "Market Graph promotion boundary violation.");

assert(cluster?.status === "PREFLIGHT_DISCOVERY_ONLY_NO_DYNAMIC_VERTICAL" && cluster?.approved_dynamic_vertical_count === 0,
  "Cluster promotion boundary mismatch.");
assert((cluster?.candidates ?? []).every(candidate =>
  candidate.market_cluster_claim === false && candidate.dynamic_vertical_promotion === false && candidate.human_approval_required === true),
  "Cluster candidates must remain human-gated/non-promotable.");
assert(cluster?.public_projection === false && cluster?.index_computation === false && cluster?.production_eligible === false,
  "Cluster public/Index/Production boundary violation.");

assert(stress?.deterministic_rerun === "PASS" && stress?.stale_data_rejection === "PASS"
  && stress?.rights_missing_rejection === "PASS" && stress?.duplicate_rejection === "PASS",
  "Stress rejection/determinism probe failed.");
assert(stress?.source_removal_sensitivity?.transaction_single_source_removal_state === "FAIL_TRANSACTION_EVIDENCE_REMOVED",
  "Single transaction-source dependency must remain explicit.");
assert(stress?.golden_dataset?.validated_cases === 0 && stress?.golden_dataset?.current_accuracy === null,
  "Stress Golden Dataset state must remain unvalidated.");
assert(stress?.silent_critical_failure_count === 0, "Silent critical failure count must be zero.");
assert(stress?.public_projection === false && stress?.index_computation === false && stress?.production_eligible === false,
  "Stress promotion boundary violation.");

if (errors.length) {
  console.error(`AGCI-OS Candidate R2 Live Preflight: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log("AGCI-OS Candidate R2 Live Preflight: PASS");
console.log(`Authority records admitted: ${run.admitted_authority_record_count}`);
console.log(`Canonical Design candidates: ${run.canonical_design_candidate_count}`);
console.log("Four live authority families: PASS");
console.log("Candidate R2: NOT_CREATED");
console.log("Production/Public/G5: HOLD");
