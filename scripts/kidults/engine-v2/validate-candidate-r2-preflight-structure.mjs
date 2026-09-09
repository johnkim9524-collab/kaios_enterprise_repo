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

function integer(value) {
  return Number.isInteger(value) && value >= 0;
}

function sumValues(value) {
  return Object.values(value ?? {}).reduce((sum, item) => sum + (Number.isInteger(item) ? item : 0), 0);
}

const run = read("run-manifest.json");
const quarantine = read("raw-quarantine-report.json");
const universe = read("universe-admission-report.json");
const entity = read("entity-resolution-report.json");
const evidenceGraph = read("evidence-graph-shadow.json");
const marketGraph = read("market-graph-shadow.json");
const cluster = read("cluster-discovery-preflight.json");
const stress = read("stress-stability-preflight.json");

const admittedAuthority = run?.admitted_authority_record_count;
const admittedMarket = run?.admitted_market_event_count;
const quarantined = run?.quarantined_record_count;
const admittedTotal = (integer(admittedAuthority) && integer(admittedMarket)) ? admittedAuthority + admittedMarket : NaN;
const quarantinedRecords = Array.isArray(quarantine?.quarantined_records) ? quarantine.quarantined_records : [];

assert(run?.state === "CANDIDATE_R2_PREFLIGHT_PARTIAL_PASS", "Run state mismatch.");
assert(run?.run_mode === "FOUR_AUTHORITY_PLUS_RIGHTS_CLEARED_TRANSACTION_BOUNDED_LIVE", "Run mode mismatch.");
assert(run?.source_family_count === 5, "Total source family count must be five.");
assert(run?.authority_source_family_count === 4, "Authority source family count must be four.");
assert(run?.transaction_source_family_count === 1, "Transaction source family count must be one.");
assert(run?.authority_input_record_count === 48, "Authority input count must be 48 for this bounded contract.");
assert(run?.transaction_input_event_count === 1, "Transaction input count must be one for this bounded contract.");
assert(integer(admittedAuthority) && admittedAuthority <= run?.authority_input_record_count,
  "Admitted authority count must be a bounded non-negative subset of authority inputs.");
assert(admittedMarket === 1, "The rights-cleared Market Event must pass the bounded gate.");
assert(integer(quarantined), "Quarantined record count must be a non-negative integer.");
assert(admittedAuthority + quarantined === run?.authority_input_record_count,
  "Authority admission plus fail-closed quarantine must conserve all bounded authority inputs.");
assert(run?.physical_object_candidate_count === admittedAuthority,
  "Physical Object candidates must equal the currently admitted authority population.");
assert(integer(run?.canonical_design_candidate_count) && run.canonical_design_candidate_count <= run.physical_object_candidate_count,
  "Canonical Design candidates must be a bounded subset of admitted Physical Object candidates.");
assert(integer(run?.manual_review_record_count) && run.manual_review_record_count <= run.physical_object_candidate_count,
  "Identity review count must be bounded by admitted Physical Object candidates.");
assert(run?.transaction_object_link_review_count === 1, "Transaction object-link review count mismatch.");
assert(run?.sold_transaction_count === 1, "Sold transaction count must be one.");
assert(run?.listing_count === 0, "Listing count must remain zero.");
assert(run?.historical_price_coverage === 1, "Bounded historical price coverage must be 100%.");
assert(run?.golden_dataset_status === "BUILD_REQUIRED_TRACK_B_VALIDATION_PENDING", "Golden Dataset state mismatch.");
assert(run?.candidate_r2_state === "NOT_CREATED_GOLDEN_DATASET_AND_STRESS_EXIT_PENDING", "Candidate R2 must not be created yet.");
assert(run?.vertical_intelligence_state === "NOT_COMPUTED", "Vertical Intelligence must remain uncomputed.");
assert(run?.kidult_500_state === "NOT_COMPUTED" && run?.kidult_100_state === "NOT_COMPUTED",
  "KIDULT 500 and KIDULT 100 must remain uncomputed.");
assert(run?.deterministic_rerun === "PASS" && run?.fail_closed === true, "Deterministic fail-closed state mismatch.");
assert(run?.critical_provenance_coverage === 1, "Critical provenance coverage must be 100%.");
assert(run?.rights_state_coverage === 1, "Rights-state coverage must be 100%.");
assert(run?.duplicate_contamination === 0, "Duplicate contamination must be zero.");
assert(run?.stale_record_admission === 0, "Stale authority records must never be admitted.");
assert(run?.provider_to_portal_direct_paths === 0, "Provider-to-Portal direct paths must be zero.");
assert(run?.provider_to_index_direct_paths === 0, "Provider-to-Index direct paths must be zero.");
assert(run?.autonomous_public_vertical_promotion === 0, "Autonomous public Vertical promotion must be zero.");
assert(run?.public_index_computation === 0, "Public Index computation must be zero.");
assert(run?.production_mutation === 0, "Production mutation must be zero.");
assert(run?.publication_eligible === false && run?.production_eligible === false,
  "Preflight must not be publication or Production eligible.");
assert(/^sha256:[a-f0-9]{64}$/.test(run?.run_fingerprint ?? ""), "Run fingerprint is invalid.");

assert(quarantine?.input_record_count === run?.authority_input_record_count + run?.transaction_input_event_count,
  "Raw Quarantine total input count must reconcile to bounded run inputs.");
assert(quarantine?.authority_input_count === run?.authority_input_record_count &&
  quarantine?.market_event_input_count === run?.transaction_input_event_count,
  "Raw Quarantine class counts must reconcile to run inputs.");
assert(quarantine?.admitted_record_count === admittedTotal && quarantine?.quarantined_record_count === quarantined,
  "Raw Quarantine admitted/quarantined counts must reconcile to run manifest.");
assert(quarantine?.admitted_record_count + quarantine?.quarantined_record_count === quarantine?.input_record_count,
  "Raw Quarantine must conserve every bounded input exactly once.");
assert(quarantine?.status === (quarantined === 0 ? "PASS_NO_REJECTIONS" : "PASS_FAIL_CLOSED"),
  "Raw Quarantine status must reflect the actual quarantine population.");
assert(quarantinedRecords.length === quarantined, "Raw Quarantine record list/count mismatch.");
assert(sumValues(quarantine?.reason_counts) === quarantined, "Raw Quarantine reason counts must account for every quarantined record.");
for (const record of quarantinedRecords) {
  assert(record?.record_class === "AUTHORITY_RECORD", `${record?.record_id ?? "unknown"}: only authority records may be quarantined in this bounded contract.`);
  assert(Array.isArray(record?.reasons) && record.reasons.length > 0,
    `${record?.record_id ?? "unknown"}: quarantine reasons must be explicit.`);
  assert(record?.disposition === "QUARANTINED_NOT_INDEX_ELIGIBLE",
    `${record?.record_id ?? "unknown"}: quarantined record must remain non-index-eligible.`);
}
assert(quarantine?.index_eligible_quarantined_records === 0, "Quarantined records cannot become Index eligible.");
assert(quarantine?.mutation_performed === false, "Raw Quarantine must not mutate Production.");

assert(universe?.source_family_count === run?.source_family_count, "Universe source family count mismatch.");
assert(universe?.authority_source_family_count === run?.authority_source_family_count, "Universe authority family count mismatch.");
assert(universe?.transaction_source_family_count === run?.transaction_source_family_count, "Universe transaction family count mismatch.");
assert(universe?.authority_admission_candidate_count === admittedAuthority, "Universe authority candidate count mismatch.");
assert(universe?.market_event_admission_candidate_count === admittedMarket, "Universe Market Event candidate count mismatch.");
assert(universe?.quarantined_record_count === quarantined, "Universe quarantine count mismatch.");
assert(universe?.unique_source_record_count === admittedAuthority && universe?.unique_market_event_count === admittedMarket,
  "Universe uniqueness counts must bind to the admitted population.");
assert(universe?.provenance_coverage === 1 && universe?.rights_state_coverage === 1,
  "Universe provenance/rights coverage must be 100%.");
assert(universe?.image_ingestion_count === 0, "Universe must not ingest images.");
assert(universe?.global_universe_object_count_mutated === false,
  "Preflight candidates must not inflate the official Global Universe count.");
assert(universe?.public_projection === false && universe?.index_eligible === false && universe?.production_eligible === false,
  "Universe preflight boundary violation.");

assert(entity?.status === "PASS_WITH_REVIEW", "Entity Resolution must surface review state.");
assert(entity?.physical_object_candidate_count === run?.physical_object_candidate_count, "Entity physical count mismatch.");
assert(entity?.canonical_design_candidate_count === run?.canonical_design_candidate_count, "Entity design count mismatch.");
assert(entity?.transaction_linked_object_reference_count === 1, "Transaction linked-object count mismatch.");
assert(entity?.auto_merge_count === 0, "Automatic entity merge is prohibited before Golden Dataset validation.");
assert(entity?.review_required_record_count === run?.manual_review_record_count,
  "Entity review record count must reconcile to run manifest.");
assert(integer(entity?.review_required_group_count) && entity.review_required_group_count <= entity.review_required_record_count,
  "Entity review group count must be bounded by review records.");
assert(entity?.market_event_object_link_review_count === run?.transaction_object_link_review_count,
  "Market Event object-link review must reconcile to run manifest.");
assert(entity?.golden_dataset_target_cases === 200 && entity?.golden_dataset_validated_cases === 0,
  "Golden Dataset case state mismatch.");
assert(entity?.golden_dataset_accuracy === null, "Unvalidated Golden Dataset accuracy must remain null.");
assert(entity?.provider_id_promoted_to_canonical_id === false, "Provider IDs cannot become canonical IDs.");
for (const group of entity?.review_groups ?? []) assert(group.auto_merge === false, `${group.canonical_design_candidate_key}: auto-merge prohibited.`);

assert(evidenceGraph?.status === "INTERNAL_FOUR_AUTHORITY_PLUS_TRANSACTION_GRAPH_READY",
  "Evidence Graph status mismatch.");
assert(evidenceGraph?.source_family_count === run?.source_family_count && evidenceGraph?.authority_source_family_count === run?.authority_source_family_count,
  "Evidence Graph source family counts mismatch.");
assert(evidenceGraph?.transaction_source_family_count === run?.transaction_source_family_count,
  "Evidence Graph transaction family count mismatch.");
assert(evidenceGraph?.node_count === run?.evidence_graph_node_count && evidenceGraph?.edge_count === run?.evidence_graph_edge_count,
  "Evidence Graph totals must reconcile to run manifest.");
assert(evidenceGraph?.node_counts?.SOURCE === run?.source_family_count, "Evidence Graph source-node count mismatch.");
assert(evidenceGraph?.node_counts?.SOURCE_RECORD === admittedTotal, "Evidence Graph source-record node count mismatch.");
assert(evidenceGraph?.node_counts?.PHYSICAL_OBJECT_CANDIDATE === run?.physical_object_candidate_count,
  "Evidence Graph Physical Object node count mismatch.");
assert(evidenceGraph?.node_counts?.CANONICAL_DESIGN_CANDIDATE === run?.canonical_design_candidate_count,
  "Evidence Graph Canonical Design node count mismatch.");
assert(evidenceGraph?.node_counts?.EVIDENCE_ASSERTION === admittedTotal, "Evidence Graph assertion count mismatch.");
assert(evidenceGraph?.node_counts?.MARKET_EVENT === admittedMarket, "Evidence Graph Market Event count mismatch.");
assert(evidenceGraph?.node_counts?.MARKET_OBJECT_REFERENCE === 1, "Evidence Graph market-object reference count mismatch.");
assert(evidenceGraph?.node_counts?.MONETARY_AMOUNT === 1, "Evidence Graph monetary amount count mismatch.");
assert(evidenceGraph?.edge_counts?.PUBLISHED_SOURCE_RECORD === admittedTotal,
  "Evidence Graph published-source edge count mismatch.");
assert(evidenceGraph?.edge_counts?.SUPPORTS_ASSERTION === admittedTotal,
  "Evidence Graph supports-assertion edge count mismatch.");
assert(evidenceGraph?.edge_counts?.ASSERTS_PHYSICAL_OBJECT_IDENTITY === run?.physical_object_candidate_count,
  "Evidence Graph identity assertion edge count mismatch.");
assert(evidenceGraph?.edge_counts?.CANDIDATE_DESIGN_MEMBERSHIP === run?.physical_object_candidate_count,
  "Evidence Graph design membership edge count mismatch.");
assert(evidenceGraph?.edge_counts?.ASSERTS_MARKET_EVENT === admittedMarket &&
  evidenceGraph?.edge_counts?.HAS_RECORDED_AMOUNT === admittedMarket &&
  evidenceGraph?.edge_counts?.TRANSFERS_OR_REFERENCES_OBJECT === admittedMarket,
  "Evidence Graph transaction edge counts mismatch.");
assert(sumValues(evidenceGraph?.node_counts) === evidenceGraph?.node_count, "Evidence Graph node classes must sum to total.");
assert(sumValues(evidenceGraph?.edge_counts) === evidenceGraph?.edge_count, "Evidence Graph edge classes must sum to total.");
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
assert(marketGraph?.authority_design_candidate_nodes === run?.canonical_design_candidate_count,
  "Market Graph authority-design count mismatch.");
assert(marketGraph?.authority_observation_nodes === admittedAuthority,
  "Market Graph authority-observation count mismatch.");
assert(marketGraph?.market_event_nodes === admittedMarket && marketGraph?.sold_transaction_nodes === run?.sold_transaction_count,
  "Market Graph transaction counts mismatch.");
assert(marketGraph?.listing_nodes === run?.listing_count && marketGraph?.listing_is_sale === false,
  "Market Graph listing/sale boundary mismatch.");
assert(marketGraph?.transaction_linked_object_reference_nodes === 1, "Market Graph linked object count mismatch.");
assert(marketGraph?.monetary_amount_nodes === 1, "Market Graph monetary amount count mismatch.");
assert(marketGraph?.event_to_object_edges === admittedMarket && marketGraph?.event_to_amount_edges === admittedMarket,
  "Market Graph event edge counts mismatch.");
assert(marketGraph?.authority_context_edges === admittedAuthority, "Market Graph authority context edge count mismatch.");
assert(marketGraph?.node_count === run?.market_graph_node_count && marketGraph?.edge_count === run?.market_graph_edge_count,
  "Market Graph totals must reconcile to run manifest.");
assert(sumValues(marketGraph?.node_counts) === marketGraph?.node_count, "Market Graph node classes must sum to total.");
assert(sumValues(marketGraph?.edge_counts) === marketGraph?.edge_count, "Market Graph edge classes must sum to total.");
assert(marketGraph?.historical_price_coverage === 1, "Historical price coverage mismatch.");
assert(marketGraph?.historical_sale_event_state === "VERIFIED_SINGLE_SOURCE_BOUNDED_POC",
  "Historical sale state mismatch.");
assert(marketGraph?.current_market_metrics_verified === 0, "Current market metrics must remain unverified.");
for (const key of ["current_demand", "scarcity", "current_valuation", "liquidity"]) {
  assert(marketGraph?.[key] === "NOT_VERIFIED", `${key} must remain NOT_VERIFIED.`);
}
assert(marketGraph?.public_projection === false && marketGraph?.index_eligible === false && marketGraph?.production_eligible === false,
  "Market Graph public/Index/Production boundary violation.");

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
console.log(`Source families total / authority / transaction: ${run.source_family_count} / ${run.authority_source_family_count} / ${run.transaction_source_family_count}`);
console.log(`Authority admitted / quarantined / Market Event admitted: ${admittedAuthority} / ${quarantined} / ${admittedMarket}`);
console.log(`Physical / Canonical Design candidates: ${run.physical_object_candidate_count} / ${run.canonical_design_candidate_count}`);
console.log(`Evidence Graph nodes / edges: ${evidenceGraph.node_count} / ${evidenceGraph.edge_count}`);
console.log(`Market Graph nodes / edges: ${marketGraph.node_count} / ${marketGraph.edge_count}`);
console.log("Golden Dataset: BUILD_REQUIRED");
console.log("Candidate R2: NOT_CREATED");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
