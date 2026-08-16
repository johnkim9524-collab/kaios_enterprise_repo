import { buildAuthorityShadow, loadAuthorityShadowInput } from "./run-bounded-live-shadow.mjs";

const input = loadAuthorityShadowInput();
const expected = buildAuthorityShadow(input);
const run = expected["run-manifest.json"];
const quarantine = expected["raw-quarantine-report.json"];
const universe = expected["universe-admission-report.json"];
const entity = expected["entity-resolution-report.json"];
const evidence = expected["evidence-graph-shadow.json"];
const market = expected["market-graph-shadow.json"];
const cluster = expected["cluster-discovery-preflight.json"];
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

assert(run.state === "BOUNDED_LIVE_SHADOW_PASS", "Run state mismatch.");
assert(run.run_mode === "BOUNDED_LIVE_COMMITTED_ARTIFACT_REPLAY", "Run mode mismatch.");
assert(run.input_record_count === 24 && run.admitted_record_count === 24 && run.quarantined_record_count === 0, "Admission counts mismatch.");
assert(run.source_family_count === 2, "Source-family count mismatch.");
assert(run.critical_provenance_coverage === 1 && run.rights_state_coverage === 1, "Provenance/rights coverage must be 100%.");
assert(run.duplicate_contamination === 0 && run.stale_record_admission === 0 && run.rights_missing_admission === 0, "Fail-closed admission invariant failed.");
assert(run.provider_to_portal_direct_paths === 0 && run.provider_to_index_direct_paths === 0, "Direct Provider path detected.");
assert(run.autonomous_public_vertical_promotion === 0 && run.public_index_computation === 0 && run.production_mutation === 0, "Forbidden promotion/computation/mutation detected.");
assert(quarantine.index_eligible_quarantined_records === 0, "Quarantine Index eligibility detected.");
assert(universe.global_universe_object_count_mutated === false && universe.index_eligible === false, "Shadow data must not mutate global count or enter Indexes.");
assert(entity.physical_object_candidate_count === 24 && entity.canonical_design_candidate_count === 22, "Entity candidate counts mismatch.");
assert(entity.auto_merge_count === 0 && entity.review_required_group_count === 2 && entity.review_required_record_count === 4, "Identity review invariants mismatch.");
assert(entity.golden_dataset_status === "NOT_VALIDATED", "Golden Dataset state must remain NOT_VALIDATED.");
assert(evidence.node_count === 96 && evidence.edge_count === 96, "Evidence Graph counts mismatch.");
assert(evidence.critical_provenance_coverage === 1 && evidence.rights_state_coverage === 1, "Evidence Graph coverage mismatch.");
assert(Object.values(evidence.market_metric_support).every(value => value === "NOT_VERIFIED"), "Authority data must not verify market metrics.");
assert(market.market_event_nodes === 0 && market.sold_transaction_nodes === 0 && market.listing_nodes === 0, "Authority data must not create Market Events.");
assert(market.market_metrics_verified === 0 && market.listing_is_sale === false, "Market Graph invariant failed.");
assert(cluster.candidate_count === 1 && cluster.approved_dynamic_vertical_count === 0, "Cluster preflight boundary mismatch.");
assert(cluster.candidates.every(item => item.dynamic_vertical_promotion === false && item.confidence === null), "Cluster must remain uncalibrated and unpromoted.");
assert(input.sources.every(source => source.images_ingested === 0 && source.commercial_publication_authorized_for_this_run === false), "Images/publication boundary mismatch.");

if (errors.length) {
  console.error(`AGCI-OS bounded-live authority Shadow: FAIL (${errors.length})`);
  errors.forEach(error => console.error(`ERROR: ${error}`));
  process.exit(1);
}
console.log("AGCI-OS bounded-live authority Shadow validation: PASS");
console.log("24 real authority records admitted; 0 stale/rights/provenance/duplicate admissions.");
console.log("24 physical objects; 22 design candidates; 4 records held for identity review; auto-merge 0.");
console.log("Evidence Graph 96/96; Market Events 0; Indexes NOT_COMPUTED; Production HOLD.");
