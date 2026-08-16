import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const output = path.resolve(process.argv[2] ?? "artifacts/agci-os/candidate-r2-preflight-r1");
const errors = [];

function read(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(output, name), "utf8"));
  } catch (error) {
    errors.push(`${name}: ${error.message}`);
    return null;
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

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
assert(run?.source_family_count === 5, "Total source family count must be five.");
assert(run?.authority_source_family_count === 4, "Authority source family count must be four.");
assert(run?.transaction_source_family_count === 1, "Transaction source family count must be one.");
assert(run?.authority_input_record_count === 48, "Authority input count must be 48.");
assert(run?.transaction_input_event_count === 1, "Transaction input count must be one.");
assert(run?.admitted_authority_record_count === 48, "All 48 authority records must pass the bounded gate.");
assert(run?.admitted_market_event_count === 1, "The rights-cleared Market Event must pass the bounded gate.");
assert(run?.quarantined_record_count === 0, "No valid bounded input may be silently quarantined.");
assert(run?.physical_object_candidate_count === 48, "Physical Object candidate count mismatch.");
assert(run?.canonical_design_candidate_count === 46, "Canonical Design candidate count mismatch.");
assert(run?.manual_review_record_count === 4, "Identity review record count mismatch.");
assert(run?.transaction_object_link_review_count === 1, "Transaction object-link review count mismatch.");
assert(run?.sold_transaction_count === 1, "Sold transaction count must be one.");
assert(run?.listing_count === 0, "Listing count must remain zero.");
assert(run?.historical_price_coverage === 1, "Bounded historical price coverage must be 100%.");
assert(run?.evidence_graph_node_count === 200 && run?.evidence_graph_edge_count === 197,
  "Evidence Graph count mismatch.");
assert(run?.market_graph_node_count === 97 && run?.market_graph_edge_count === 50,
  "Market Graph count mismatch.");
assert(run?.golden_dataset_status === "BUILD_REQUIRED_TRACK_B_VALIDATION_PENDING", "Golden Dataset state mismatch.");
assert(run?.candidate_r2_state === "NOT_CREATED_GOLDEN_DATASET_AND_STRESS_EXIT_PENDING", "Candidate R2 must not be created yet.");
assert(run?.vertical_intelligence_state === "NOT_COMPUTED", "Vertical Intelligence must remain uncomputed.");
assert(run?.kidult_500_state === "NOT_COMPUTED" && run?.kidult_100_state === "NOT_COMPUTED",
  "KIDULT 500 and KIDULT 100 must remain uncomputed.");
assert(run?.deterministic_rerun === "PASS" && run?.fail_closed === true, "Deterministic fail-closed state mismatch.");
assert(run?.critical_provenance_coverage === 1, "Critical provenance coverage must be 100%.");
assert(run?.rights_state_coverage === 1, "Rights-state coverage must be 100%.");
assert(run?.duplicate_contamination === 0, "Duplicate contamination must be zero.");
assert(run?.provider_to_portal_direct_paths === 0, "Provider-to-Portal direct paths must be zero.");
assert(run?.provider_to_index_direct_paths === 0, "Provider-to-Index direct paths must be zero.");
assert(run?.autonomous_public_vertical_promotion === 0, "Autonomous public Vertical promotion must be zero.");
assert(run?.public_index_computation === 0, "Public Index computation must be zero.");
assert(run?.production_mutation === 0, "Production mutation must be zero.");
assert(run?.publication_eligible === false && run?.production_eligible === false,
  "Preflight must not be publication or Production eligible.");
assert(/^sha256:[a-f0-9]{64}$/.test(run?.run_fingerprint ?? ""), "Run fingerprint is invalid.");

assert(quarantine?.status === "PASS_NO_REJECTIONS", "Raw Quarantine bounded input state mismatch.");
assert(quarantine?.input_record_count === 49, "Raw Quarantine input count must be 49.");
assert(quarantine?.authority_input_count === 48 && quarantine?.market_event_input_count === 1,
  "Raw Quarantine class counts mismatch.");
assert(quarantine?.admitted_record_count === 49 && quarantine?.quarantined_record_count === 0,
  "Raw Quarantine admitted/quarantined counts mismatch.");
assert(quarantine?.index_eligible_quarantined_records === 0, "Quarantined records cannot become Index eligible.");
assert(quarantine?.mutation_performed === false, "Raw Quarantine must not mutate Production.");

assert(universe?.source_family_count === 5, "Universe source family count mismatch.");
assert(universe?.authority_source_family_count === 4, "Universe authority family count mismatch.");
assert(universe?.transaction_source_family_count === 1, "Universe transaction family count mismatch.");
assert(universe?.authority_admission_candidate_count === 48, "Universe authority candidate count mismatch.");
assert(universe?.market_event_admission_candidate_count === 1, "Universe Market Event candidate count mismatch.");
assert(universe?.unique_source_record_count === 48 && universe?.unique_market_event_count === 1,
  "Universe uniqueness counts mismatch.");
assert(universe?.provenance_coverage === 1 && universe?.rights_state_coverage === 1,
  "Universe provenance/rights coverage must be 100%.");
assert(universe?.image_ingestion_count === 0, "Universe must not ingest images.");
assert(universe?.global_universe_object_count_mutated === false,
  "Preflight candidates must not inflate the official Global Universe count.");
assert(universe?.public_projection === false && universe?.index_eligible === false && universe?.production_eligible === false,
  "Universe preflight boundary violation.");

assert(entity?.status === "PASS_WITH_REVIEW", "Entity Resolution must surface review state.");
assert(entity?.physical_object_candidate_count === 48, "Entity physical count mismatch.");
assert(entity?.canonical_design_candidate_count === 46, "Entity design count mismatch.");
assert(entity?.transaction_linked_object_reference_count === 1, "Transaction linked-object count mismatch.");
assert(entity?.auto_merge_count === 0, "Automatic entity merge is prohibited before Golden Dataset validation.");
assert(entity?.review_required_group_count === 2 && entity?.review_required_record_count === 4,
  "Entity review group/record counts mismatch.");
assert(entity?.market_event_object_link_review_count === 1, "Market Event object link must remain review-required.");
assert(entity?.golden_dataset_target_cases === 200 && entity?.golden_dataset_validated_cases === 0,
  "Golden Dataset case state mismatch.");
assert(entity?.golden_dataset_accuracy === null, "Unvalidated Golden Dataset accuracy must remain null.");
assert(entity?.provider_id_promoted_to_canonical_id === false, "Provider IDs cannot become canonical IDs.");
for (const group of entity?.review_groups ?? []) assert(group.auto_merge === false, `${group.canonical_design_candidate_key}: auto-merge prohibited.`);

assert(evidenceGraph?.status === "INTERNAL_FOUR_AUTHORITY_PLUS_TRANSACTION_GRAPH_READY",
  "Evidence Graph status mismatch.");
assert(evidenceGraph?.source_family_count === 5 && evidenceGraph?.authority_source_family_count === 4,
  "Evidence Graph source family counts mismatch.");
assert(evidenceGraph?.transaction_source_family_count === 1, "Evidence Graph transaction family count mismatch.");
assert(evidenceGraph?.node_count === 200 && evidenceGraph?.edge_count === 197, "Evidence Graph counts mismatch.");
assert(evidenceGraph?.node_counts?.SOURCE === 5, "Evidence Graph source-node count mismatch.");
assert(evidenceGraph?.node_counts?.SOURCE_RECORD === 49, "Evidence Graph source-record node count mismatch.");
assert(evidenceGraph?.node_counts?.PHYSICAL_OBJECT_CANDIDATE === 48, "Evidence Graph Physical Object node count mismatch.");
assert(evidenceGraph?.node_counts?.CANONICAL_DESIGN_CANDIDATE === 46, "Evidence Graph Canonical Design node count mismatch.");
assert(evidenceGraph?.node_counts?.EVIDENCE_ASSERTION === 49, "Evidence Graph assertion count mismatch.");
assert(evidenceGraph?.node_counts?.MARKET_EVENT === 1, "Evidence Graph Market Event count mismatch.");
assert(evidenceGraph?.node_counts?.MARKET_OBJECT_REFERENCE === 1, "Evidence Graph market-object reference count mismatch.");
assert(evidenceGraph?.node_counts?.MONETARY_AMOUNT === 1, "Evidence Graph monetary amount count mismatch.");
assert(evidenceGraph?.critical_provenance_coverage === 1 && evidenceGraph?.rights_state_coverage === 1,
  "Evidence Graph provenance/rights coverage mismatch.");
assert(evidenceGraph?.metric_support?.historical_sale_event === "VERIFIED_INTERNAL_POC",
  "Historical sale event support mismatch.");
assert(evidenceGraph?.metric_support?.historical_sale_price === "VERIFIED_INTERNAL_POC",
  "Historical sale price support mismatch.");
for (const key of ["current_demand", "scarcity", "current_valuation", "liquidity", "index_confidence"]) {
  assert(evidenceGraph?.metric_support?.[key] === "NOT_VERIFIED", `${key} must remain NOT_VERIFIED.`);
}
assert(evidenceGraph?.public_projection === false && evidenceGraph?.index_eligible === false,
  "Evidence Graph public/Index boundary violation.");

assert(marketGraph?.status === "HISTORICAL_TRANSACTION_PATH_READY_LIMITED_COVERAGE", "Market Graph status mismatch.");
assert(marketGraph?.authority_design_candidate_nodes === 46, "Market Graph authority-design count mismatch.");
assert(marketGraph?.authority_observation_nodes === 48, "Market Graph authority-observation count mismatch.");
assert(marketGraph?.market_event_nodes === 1 && marketGraph?.sold_transaction_nodes === 1,
  "Market Graph transaction counts mismatch.");
assert(marketGraph?.listing_nodes === 0 && marketGraph?.listing_is_sale === false,
  "Market Graph listing/sale boundary mismatch.");
assert(marketGraph?.transaction_linked_object_reference_nodes === 1, "Market Graph linked object count mismatch.");
assert(marketGraph?.monetary_amount_nodes === 1, "Market Graph monetary amount count mismatch.");
assert(marketGraph?.event_to_object_edges === 1 && marketGraph?.event_to_amount_edges === 1,
  "Market Graph event edge counts mismatch.");
assert(marketGraph?.authority_context_edges === 48, "Market Graph authority context edge count mismatch.");
assert(marketGraph?.node_count === 97 && marketGraph?.edge_count === 50, "Market Graph total counts mismatch.");
assert(marketGraph?.historical_price_coverage === 1, "Historical price coverage mismatch.");
assert(marketGraph?.historical_sale_event_state === "VERIFIED_SINGLE_SOURCE_BOUNDED_POC",
  "Historical sale state mismatch.");
assert(marketGraph?.current_market_metrics_verified === 0, "Current market metrics must remain unverified.");
for (const key of ["current_demand", "scarcity", "current_valuation", "liquidity"]) {
  assert(marketGraph?.[key] === "NOT_VERIFIED", `${key} must remain NOT_VERIFIED.`);
}

assert(cluster?.status === "PREFLIGHT_DISCOVERY_ONLY_NO_DYNAMIC_VERTICAL", "Cluster preflight status mismatch.");
assert(cluster?.candidate_count === 3 && cluster?.approved_dynamic_vertical_count === 0,
  "Cluster candidate/approval counts mismatch.");
for (const candidate of cluster?.candidates ?? []) {
  assert(candidate.market_cluster_claim === false, `${candidate.cluster_id}: market cluster claim prohibited.`);
  assert(candidate.dynamic_vertical_promotion === false, `${candidate.cluster_id}: Dynamic Vertical promotion prohibited.`);
  assert(candidate.human_approval_required === true, `${candidate.cluster_id}: human approval gate required.`);
}
assert(cluster?.public_projection === false && cluster?.index_computation === false,
  "Cluster public/Index boundary violation.");

assert(stress?.status === "PARTIAL_PASS_GOLDEN_DATASET_AND_TRANSACTION_DIVERSITY_PENDING",
  "Stress preflight status mismatch.");
assert(stress?.deterministic_rerun === "PASS", "Deterministic rerun state mismatch.");
assert(stress?.stale_data_rejection === "PASS", "Stale-data rejection probe failed.");
assert(stress?.rights_missing_rejection === "PASS", "Rights-missing rejection probe failed.");
assert(stress?.duplicate_rejection === "PASS", "Duplicate rejection probe failed.");
assert(stress?.contradiction_test === "NOT_EXECUTED_GOLDEN_DATASET_REQUIRED",
  "Contradiction test must remain pending until Golden Dataset build.");
assert(stress?.source_removal_sensitivity?.authority_four_to_three_family_structural_state === "PASS_STRUCTURAL_DIVERSITY_ONLY",
  "Authority source-removal structural state mismatch.");
assert(stress?.source_removal_sensitivity?.transaction_single_source_removal_state === "FAIL_TRANSACTION_EVIDENCE_REMOVED",
  "Transaction single-source dependency must remain explicit.");
assert(stress?.golden_dataset?.target_cases === 200 && stress?.golden_dataset?.validated_cases === 0,
  "Stress Golden Dataset state mismatch.");
assert(stress?.golden_dataset?.current_accuracy === null, "Unvalidated Golden Dataset accuracy must remain null.");
assert(stress?.silent_critical_failure_count === 0, "Silent critical failure count must be zero.");
assert(stress?.public_projection === false && stress?.index_computation === false && stress?.production_eligible === false,
  "Stress preflight boundary violation.");

if (errors.length) {
  console.error(`AGCI-OS Candidate R2 Preflight: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("AGCI-OS Candidate R2 Preflight: PASS");
console.log("Source families total / authority / transaction: 5 / 4 / 1");
console.log("Authority / Market Event records: 48 / 1");
console.log("Physical / Canonical Design candidates: 48 / 46");
console.log("Evidence Graph nodes / edges: 200 / 197");
console.log("Market Graph nodes / edges: 97 / 50");
console.log("Rights-cleared sold event / listing: 1 / 0");
console.log("Golden Dataset: BUILD_REQUIRED");
console.log("Candidate R2: NOT_CREATED");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
