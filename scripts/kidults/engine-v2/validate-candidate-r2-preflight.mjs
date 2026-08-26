import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const output = path.resolve(process.argv[2] ?? "artifacts/agci-os/candidate-r2-preflight-r1");
const errors = [];
const MAX_AUTHORITY_AGE_DAYS = 7;
const EXPECTED_AUTHORITY_FAMILIES = ["THE_MET", "V_AND_A", "SMITHSONIAN", "ART_INSTITUTE_CHICAGO"];

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

function countBy(items, key) {
  const counts = {};
  for (const item of items ?? []) counts[item?.[key]] = (counts[item?.[key]] ?? 0) + 1;
  return counts;
}

function countType(items, type) {
  return (items ?? []).filter(item => item?.node_type === type).length;
}

function countEdge(items, type) {
  return (items ?? []).filter(item => item?.edge_type === type).length;
}

function ageDays(reference, observed) {
  return (new Date(reference).getTime() - new Date(observed).getTime()) / 86_400_000;
}

function validSha(value) {
  return /^sha256:[a-f0-9]{64}$/.test(value ?? "");
}

const run = read("run-manifest.json");
const quarantine = read("raw-quarantine-report.json");
const universe = read("universe-admission-report.json");
const entity = read("entity-resolution-report.json");
const evidenceGraph = read("evidence-graph-shadow.json");
const marketGraph = read("market-graph-shadow.json");
const cluster = read("cluster-discovery-preflight.json");
const stress = read("stress-stability-preflight.json");

const authority = universe?.authority_admission_candidates ?? [];
const marketEvents = universe?.market_event_admission_candidates ?? [];
const familyCounts = countBy(authority, "source_family");
const designCounts = countBy(authority, "canonical_design_candidate_key");
const uniqueDesignCount = Object.keys(designCounts).length;
const reviewKeys = Object.entries(designCounts).filter(([, count]) => count > 1);
const reviewRecordCount = reviewKeys.reduce((sum, [, count]) => sum + count, 0);
const uniqueObjectReferences = new Set(
  marketEvents.flatMap(event => event?.object_references ?? []).map(reference => reference?.id).filter(Boolean)
).size;
const objectReferenceEdges = marketEvents.reduce((sum, event) => sum + (event?.object_references?.length ?? 0), 0);
const monetaryAmountEdges = marketEvents.reduce((sum, event) => sum + (event?.monetary_amounts?.length ?? 0), 0);
const uniqueMonetaryAmounts = new Set(
  marketEvents.flatMap(event => event?.monetary_amounts ?? []).map((amount, index) => amount?.id ?? `${amount?.value}|${amount?.currency}|${index}`)
).size;

assert(run?.state === "CANDIDATE_R2_PREFLIGHT_PARTIAL_PASS", "Run state mismatch.");
assert(run?.run_mode === "FOUR_AUTHORITY_PLUS_RIGHTS_CLEARED_TRANSACTION_BOUNDED_LIVE", "Run mode mismatch.");
assert(run?.source_family_count === 5, "Total source family count must be five.");
assert(run?.authority_source_family_count === 4, "Authority source family count must be four.");
assert(run?.transaction_source_family_count === 1, "Transaction source family count must be one.");
assert(Number.isFinite(new Date(run?.generated_at).getTime()), "Run generated_at must be valid.");

for (const family of EXPECTED_AUTHORITY_FAMILIES) {
  assert((familyCounts[family] ?? 0) >= 8, `${family}: live bounded authority sample must contain at least eight admitted records.`);
}
assert(authority.length >= 32, "At least 32 live authority records are required across four source families.");
assert(marketEvents.length >= 1, "At least one rights-cleared historical Market Event is required.");
assert(run?.authority_input_record_count === authority.length, "All bounded authority inputs must be admitted; stale/static fallback is prohibited.");
assert(run?.transaction_input_event_count === marketEvents.length, "All bounded transaction inputs must be admitted.");
assert(run?.admitted_authority_record_count === authority.length, "Run admitted authority count mismatch.");
assert(run?.admitted_market_event_count === marketEvents.length, "Run admitted Market Event count mismatch.");
assert(run?.quarantined_record_count === 0, "Scheduled five-source preflight must not hide stale or invalid bounded inputs in quarantine.");
assert(run?.physical_object_candidate_count === authority.length, "Physical Object candidate count mismatch.");
assert(run?.canonical_design_candidate_count === uniqueDesignCount, "Canonical Design candidate count mismatch.");
assert(run?.manual_review_record_count === reviewRecordCount, "Identity review record count mismatch.");
assert(run?.transaction_object_link_review_count === uniqueObjectReferences, "Transaction object-link review count mismatch.");
assert(run?.sold_transaction_count === marketEvents.length, "Every admitted bounded Market Event must remain a verified sold event.");
assert(run?.listing_count === 0, "Listings must never be counted as sales.");
assert(run?.historical_price_coverage === 1, "Bounded historical price coverage must be 100%.");
assert(run?.golden_dataset_status === "BUILD_REQUIRED_TRACK_B_VALIDATION_PENDING", "Golden Dataset state mismatch.");
assert(run?.candidate_r2_state === "NOT_CREATED_GOLDEN_DATASET_AND_STRESS_EXIT_PENDING", "Candidate R2 must not be created yet.");
assert(run?.vertical_intelligence_state === "NOT_COMPUTED", "Vertical Intelligence must remain uncomputed.");
assert(run?.kidult_500_state === "NOT_COMPUTED" && run?.kidult_100_state === "NOT_COMPUTED", "KIDULT 500 and KIDULT 100 must remain uncomputed.");
assert(run?.deterministic_rerun === "PASS" && run?.fail_closed === true, "Deterministic fail-closed state mismatch.");
assert(run?.critical_provenance_coverage === 1 && run?.rights_state_coverage === 1, "Critical provenance/rights coverage must be 100%.");
assert(run?.duplicate_contamination === 0, "Duplicate contamination must be zero.");
assert(run?.provider_to_portal_direct_paths === 0 && run?.provider_to_index_direct_paths === 0, "Provider direct-path boundary violation.");
assert(run?.autonomous_public_vertical_promotion === 0 && run?.public_index_computation === 0, "Public promotion/index boundary violation.");
assert(run?.production_mutation === 0 && run?.publication_eligible === false && run?.production_eligible === false, "Production/publication boundary violation.");
assert(validSha(run?.run_fingerprint), "Run fingerprint is invalid.");

const sourceQualifiedKeys = new Set();
for (const record of authority) {
  const recordId = record?.source_record_id ?? "UNKNOWN";
  const observed = new Date(record?.observed_at).getTime();
  const age = ageDays(run?.generated_at, record?.observed_at);
  assert(Number.isFinite(observed), `${recordId}: observed_at is invalid.`);
  assert(Number.isFinite(age) && age >= 0 && age <= MAX_AUTHORITY_AGE_DAYS,
    `${recordId}: live authority observation is outside the ${MAX_AUTHORITY_AGE_DAYS}-day freshness boundary.`);
  assert(Boolean(record?.provenance_reference), `${recordId}: provenance reference missing.`);
  assert(Boolean(record?.rights_state), `${recordId}: rights state missing.`);
  assert(Boolean(record?.source_payload_sha256), `${recordId}: payload digest missing.`);
  assert(record?.provider_id_is_canonical_id !== true, `${recordId}: provider ID cannot become canonical ID.`);
  assert(record?.index_eligible === false && record?.publication_eligible === false && record?.production_eligible === false,
    `${recordId}: preflight authority record crossed an eligibility boundary.`);
  assert(!sourceQualifiedKeys.has(record?.source_qualified_key), `${recordId}: duplicate source-qualified authority key.`);
  sourceQualifiedKeys.add(record?.source_qualified_key);
}
for (const event of marketEvents) {
  const eventId = event?.market_event_id ?? "UNKNOWN";
  const age = ageDays(run?.generated_at, event?.fetched_at);
  assert(Number.isFinite(age) && age >= 0 && age <= MAX_AUTHORITY_AGE_DAYS,
    `${eventId}: Market Event observation is outside the freshness boundary.`);
  assert(event?.event_type === "HISTORICAL_SALE_ACTIVITY" && event?.sold_event === true, `${eventId}: admitted event is not verified historical sale activity.`);
  assert(event?.listing_is_sale === false, `${eventId}: listing/sale boundary violation.`);
  assert(event?.sold_price !== null && Number.isFinite(event?.sold_price), `${eventId}: sold price missing or invalid.`);
  assert(Boolean(event?.provenance_reference) && Boolean(event?.rights_state), `${eventId}: provenance/rights missing.`);
  assert(event?.provider_id_is_canonical_object_id !== true, `${eventId}: provider object ID cannot become canonical ID.`);
  assert(event?.index_eligible === false && event?.publication_eligible === false && event?.production_eligible === false,
    `${eventId}: preflight Market Event crossed an eligibility boundary.`);
}

assert(quarantine?.status === "PASS_NO_REJECTIONS", "Raw Quarantine must be PASS_NO_REJECTIONS for a successful live five-source preflight.");
assert(quarantine?.authority_input_count === authority.length && quarantine?.market_event_input_count === marketEvents.length,
  "Raw Quarantine class counts mismatch.");
assert(quarantine?.input_record_count === authority.length + marketEvents.length, "Raw Quarantine input count mismatch.");
assert(quarantine?.admitted_record_count === authority.length + marketEvents.length && quarantine?.quarantined_record_count === 0,
  "Raw Quarantine admitted/quarantined counts mismatch.");
assert((quarantine?.quarantined_records ?? []).length === 0, "Raw Quarantine contains hidden rejected records.");
assert(quarantine?.index_eligible_quarantined_records === 0 && quarantine?.mutation_performed === false, "Raw Quarantine eligibility/mutation boundary violation.");

assert(universe?.source_family_count === 5 && universe?.authority_source_family_count === 4 && universe?.transaction_source_family_count === 1,
  "Universe source-family counts mismatch.");
assert(universe?.authority_admission_candidate_count === authority.length && universe?.market_event_admission_candidate_count === marketEvents.length,
  "Universe candidate counts mismatch.");
assert(universe?.unique_source_record_count === authority.length && universe?.unique_market_event_count === marketEvents.length,
  "Universe uniqueness counts mismatch.");
assert(universe?.quarantined_record_count === 0 && universe?.duplicate_contamination === 0, "Universe contamination/quarantine mismatch.");
assert(universe?.provenance_coverage === 1 && universe?.rights_state_coverage === 1, "Universe provenance/rights coverage must be 100%.");
assert(universe?.image_ingestion_count === 0 && universe?.global_universe_object_count_mutated === false, "Universe image/global mutation boundary violation.");
assert(universe?.public_projection === false && universe?.index_eligible === false && universe?.production_eligible === false, "Universe preflight boundary violation.");

assert(entity?.status === (reviewKeys.length || uniqueObjectReferences ? "PASS_WITH_REVIEW" : "PASS"), "Entity Resolution review state mismatch.");
assert(entity?.source_record_count === authority.length && entity?.physical_object_candidate_count === authority.length, "Entity physical/source count mismatch.");
assert(entity?.canonical_design_candidate_count === uniqueDesignCount, "Entity design count mismatch.");
assert(entity?.transaction_linked_object_reference_count === uniqueObjectReferences, "Entity transaction linked-object count mismatch.");
assert(entity?.auto_merge_count === 0 && entity?.provider_id_promoted_to_canonical_id === false, "Entity auto-merge/provider-ID boundary violation.");
assert(entity?.review_required_group_count === reviewKeys.length && entity?.review_required_record_count === reviewRecordCount,
  "Entity review group/record counts mismatch.");
assert(entity?.market_event_object_link_review_count === uniqueObjectReferences, "Market Event object links must remain review-required.");
assert(entity?.golden_dataset_target_cases === 200 && entity?.golden_dataset_validated_cases === 0 && entity?.golden_dataset_accuracy === null,
  "Golden Dataset pre-validation state mismatch.");
for (const group of entity?.review_groups ?? []) {
  assert(group?.auto_merge === false && group?.state === "REVIEW_REQUIRED", `${group?.canonical_design_candidate_key}: review group cannot auto-merge.`);
}

assert(evidenceGraph?.status === "INTERNAL_FOUR_AUTHORITY_PLUS_TRANSACTION_GRAPH_READY", "Evidence Graph status mismatch.");
assert(evidenceGraph?.source_family_count === 5 && evidenceGraph?.authority_source_family_count === 4 && evidenceGraph?.transaction_source_family_count === 1,
  "Evidence Graph source-family counts mismatch.");
assert(evidenceGraph?.node_count === (evidenceGraph?.nodes ?? []).length && evidenceGraph?.edge_count === (evidenceGraph?.edges ?? []).length,
  "Evidence Graph declared counts do not match materialized graph arrays.");
assert(countType(evidenceGraph?.nodes, "SOURCE") === 5, "Evidence Graph source-node count mismatch.");
assert(countType(evidenceGraph?.nodes, "SOURCE_RECORD") === authority.length + marketEvents.length, "Evidence Graph source-record count mismatch.");
assert(countType(evidenceGraph?.nodes, "PHYSICAL_OBJECT_CANDIDATE") === authority.length, "Evidence Graph Physical Object count mismatch.");
assert(countType(evidenceGraph?.nodes, "CANONICAL_DESIGN_CANDIDATE") === uniqueDesignCount, "Evidence Graph Canonical Design count mismatch.");
assert(countType(evidenceGraph?.nodes, "EVIDENCE_ASSERTION") === authority.length + marketEvents.length, "Evidence Graph assertion count mismatch.");
assert(countType(evidenceGraph?.nodes, "MARKET_EVENT") === marketEvents.length, "Evidence Graph Market Event count mismatch.");
assert(countType(evidenceGraph?.nodes, "MARKET_OBJECT_REFERENCE") === uniqueObjectReferences, "Evidence Graph market-object-reference count mismatch.");
assert(countType(evidenceGraph?.nodes, "MONETARY_AMOUNT") === uniqueMonetaryAmounts, "Evidence Graph monetary-amount count mismatch.");
assert(countEdge(evidenceGraph?.edges, "PUBLISHED_SOURCE_RECORD") === authority.length + marketEvents.length, "Evidence Graph published-record edge mismatch.");
assert(countEdge(evidenceGraph?.edges, "SUPPORTS_ASSERTION") === authority.length + marketEvents.length, "Evidence Graph assertion-support edge mismatch.");
assert(countEdge(evidenceGraph?.edges, "ASSERTS_PHYSICAL_OBJECT_IDENTITY") === authority.length, "Evidence Graph physical assertion edge mismatch.");
assert(countEdge(evidenceGraph?.edges, "CANDIDATE_DESIGN_MEMBERSHIP") === authority.length, "Evidence Graph design membership edge mismatch.");
assert(countEdge(evidenceGraph?.edges, "ASSERTS_MARKET_EVENT") === marketEvents.length, "Evidence Graph Market Event assertion edge mismatch.");
assert(countEdge(evidenceGraph?.edges, "TRANSFERS_OR_REFERENCES_OBJECT") === objectReferenceEdges, "Evidence Graph object-reference edge mismatch.");
assert(countEdge(evidenceGraph?.edges, "HAS_RECORDED_AMOUNT") === monetaryAmountEdges, "Evidence Graph amount edge mismatch.");
assert(evidenceGraph?.critical_provenance_coverage === 1 && evidenceGraph?.rights_state_coverage === 1, "Evidence Graph provenance/rights coverage mismatch.");
assert(evidenceGraph?.metric_support?.authority_identity === "VERIFIED_INTERNAL_POC", "Authority identity support mismatch.");
assert(evidenceGraph?.metric_support?.historical_sale_event === "VERIFIED_INTERNAL_POC" && evidenceGraph?.metric_support?.historical_sale_price === "VERIFIED_INTERNAL_POC",
  "Historical sale support mismatch.");
for (const key of ["current_demand", "scarcity", "current_valuation", "liquidity", "index_confidence"]) {
  assert(evidenceGraph?.metric_support?.[key] === "NOT_VERIFIED", `${key} must remain NOT_VERIFIED.`);
}
assert(evidenceGraph?.public_projection === false && evidenceGraph?.index_eligible === false && evidenceGraph?.production_eligible === false,
  "Evidence Graph public/Index/Production boundary violation.");
assert(validSha(evidenceGraph?.graph_fingerprint), "Evidence Graph fingerprint is invalid.");

assert(marketGraph?.status === "HISTORICAL_TRANSACTION_PATH_READY_LIMITED_COVERAGE", "Market Graph status mismatch.");
assert(marketGraph?.authority_design_candidate_nodes === uniqueDesignCount && marketGraph?.authority_observation_nodes === authority.length,
  "Market Graph authority counts mismatch.");
assert(marketGraph?.market_event_nodes === marketEvents.length && marketGraph?.sold_transaction_nodes === marketEvents.length,
  "Market Graph transaction counts mismatch.");
assert(marketGraph?.listing_nodes === 0 && marketGraph?.listing_is_sale === false, "Market Graph listing/sale boundary mismatch.");
assert(marketGraph?.transaction_linked_object_reference_nodes === uniqueObjectReferences, "Market Graph linked-object count mismatch.");
assert(marketGraph?.event_to_object_edges === objectReferenceEdges && marketGraph?.event_to_amount_edges === monetaryAmountEdges,
  "Market Graph event-edge counts mismatch.");
assert(marketGraph?.authority_context_edges === authority.length, "Market Graph authority-context edge count mismatch.");
assert(marketGraph?.node_count === (marketGraph?.nodes ?? []).length && marketGraph?.edge_count === (marketGraph?.edges ?? []).length,
  "Market Graph declared counts do not match materialized graph arrays.");
assert(countType(marketGraph?.nodes, "MARKET_ENTITY_CANDIDATE") === uniqueDesignCount, "Market Graph design-node count mismatch.");
assert(countType(marketGraph?.nodes, "AUTHORITY_OBSERVATION") === authority.length, "Market Graph authority-observation node count mismatch.");
assert(countType(marketGraph?.nodes, "SOLD_TRANSACTION_EVENT") === marketEvents.length, "Market Graph sold-event node count mismatch.");
assert(countEdge(marketGraph?.edges, "AUTHORITY_CONTEXT_FOR") === authority.length, "Market Graph authority-context edge materialization mismatch.");
assert(countEdge(marketGraph?.edges, "SALE_EVENT_REFERENCES_OBJECT") === objectReferenceEdges, "Market Graph object-reference edge materialization mismatch.");
assert(countEdge(marketGraph?.edges, "SALE_EVENT_HAS_AMOUNT") === monetaryAmountEdges, "Market Graph amount edge materialization mismatch.");
assert(marketGraph?.historical_price_coverage === 1 && marketGraph?.historical_sale_event_state === "VERIFIED_SINGLE_SOURCE_BOUNDED_POC",
  "Historical sale/price state mismatch.");
assert(marketGraph?.current_market_metrics_verified === 0, "Current market metrics must remain unverified.");
for (const key of ["current_demand", "scarcity", "current_valuation", "liquidity"]) {
  assert(marketGraph?.[key] === "NOT_VERIFIED", `${key} must remain NOT_VERIFIED.`);
}
assert(marketGraph?.public_projection === false && marketGraph?.index_eligible === false && marketGraph?.production_eligible === false,
  "Market Graph public/Index/Production boundary violation.");
assert(validSha(marketGraph?.graph_fingerprint), "Market Graph fingerprint is invalid.");

assert(cluster?.status === "PREFLIGHT_DISCOVERY_ONLY_NO_DYNAMIC_VERTICAL", "Cluster preflight status mismatch.");
assert(cluster?.candidate_count === 3 && cluster?.approved_dynamic_vertical_count === 0, "Cluster candidate/approval counts mismatch.");
for (const candidate of cluster?.candidates ?? []) {
  assert(candidate?.market_cluster_claim === false, `${candidate?.cluster_id}: market cluster claim prohibited.`);
  assert(candidate?.dynamic_vertical_promotion === false, `${candidate?.cluster_id}: Dynamic Vertical promotion prohibited.`);
  assert(candidate?.human_approval_required === true, `${candidate?.cluster_id}: human approval gate required.`);
}
assert(cluster?.public_projection === false && cluster?.index_computation === false && cluster?.production_eligible === false,
  "Cluster public/Index/Production boundary violation.");

assert(stress?.status === "PARTIAL_PASS_GOLDEN_DATASET_AND_TRANSACTION_DIVERSITY_PENDING", "Stress preflight status mismatch.");
assert(stress?.deterministic_rerun === "PASS", "Deterministic rerun state mismatch.");
assert(stress?.stale_data_rejection === "PASS", "Stale-data rejection probe failed.");
assert(stress?.rights_missing_rejection === "PASS", "Rights-missing rejection probe failed.");
assert(stress?.duplicate_rejection === "PASS", "Duplicate rejection probe failed.");
assert(stress?.contradiction_test === "NOT_EXECUTED_GOLDEN_DATASET_REQUIRED", "Contradiction test must remain pending until Golden Dataset build.");
assert(stress?.source_removal_sensitivity?.authority_four_to_three_family_structural_state === "PASS_STRUCTURAL_DIVERSITY_ONLY",
  "Authority source-removal structural state mismatch.");
assert(stress?.source_removal_sensitivity?.transaction_single_source_removal_state === "FAIL_TRANSACTION_EVIDENCE_REMOVED",
  "Transaction single-source dependency must remain explicit.");
assert(stress?.golden_dataset?.target_cases === 200 && stress?.golden_dataset?.validated_cases === 0 && stress?.golden_dataset?.current_accuracy === null,
  "Stress Golden Dataset state mismatch.");
assert(stress?.silent_critical_failure_count === 0, "Silent critical failure count must be zero.");
assert(stress?.public_projection === false && stress?.index_computation === false && stress?.production_eligible === false,
  "Stress preflight boundary violation.");

assert(run?.evidence_graph_node_count === evidenceGraph?.node_count && run?.evidence_graph_edge_count === evidenceGraph?.edge_count,
  "Run/Evidence Graph count binding mismatch.");
assert(run?.market_graph_node_count === marketGraph?.node_count && run?.market_graph_edge_count === marketGraph?.edge_count,
  "Run/Market Graph count binding mismatch.");

if (errors.length) {
  console.error(`AGCI-OS Candidate R2 Preflight: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("AGCI-OS Candidate R2 Preflight: PASS");
console.log(`Source families total / authority / transaction: ${run.source_family_count} / ${run.authority_source_family_count} / ${run.transaction_source_family_count}`);
console.log(`Authority / Market Event records: ${authority.length} / ${marketEvents.length}`);
console.log(`Physical / Canonical Design candidates: ${authority.length} / ${uniqueDesignCount}`);
console.log(`Evidence Graph nodes / edges: ${evidenceGraph.node_count} / ${evidenceGraph.edge_count}`);
console.log(`Market Graph nodes / edges: ${marketGraph.node_count} / ${marketGraph.edge_count}`);
console.log(`Rights-cleared sold events / listings: ${marketEvents.length} / 0`);
console.log("Golden Dataset: BUILD_REQUIRED");
console.log("Candidate R2: NOT_CREATED");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
