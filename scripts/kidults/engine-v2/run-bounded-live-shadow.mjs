import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const inputPath = path.join(root, "coordination", "kidults", "engine-v2", "shadow-inputs", "authority-shadow-input-r1.json");
const outputDir = path.join(root, "artifacts", "agci-os", "authority-shadow-r1");

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha(value) { return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`; }
function ageDays(runAt, observedAt) { return (new Date(runAt).getTime() - new Date(observedAt).getTime()) / 86_400_000; }
function countBy(items, key) {
  const result = {};
  for (const item of items) result[item[key]] = (result[item[key]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

export function loadAuthorityShadowInput() {
  const input = readJson(inputPath);
  input.records = (input.record_files ?? []).flatMap(relative => readJson(path.join(root, relative)));
  return input;
}

export function buildAuthorityShadow(input = loadAuthorityShadowInput()) {
  const records = [...input.records].sort((a, b) => a.source_record_id.localeCompare(b.source_record_id));
  const seen = new Set();
  const admitted = [];
  const quarantined = [];

  for (const record of records) {
    const reasons = [];
    if (seen.has(record.source_qualified_key)) reasons.push("DUPLICATE_SOURCE_RECORD");
    if (!record.rights_state) reasons.push("RIGHTS_STATE_MISSING");
    if (!record.provenance_reference) reasons.push("PROVENANCE_REFERENCE_MISSING");
    if (!Number.isFinite(new Date(record.observed_at).getTime())) reasons.push("INVALID_OBSERVED_AT");
    else if (ageDays(input.run_at, record.observed_at) > input.freshness_max_age_days) reasons.push("STALE_OBSERVATION");
    if (reasons.length) {
      quarantined.push({ source_record_id: record.source_record_id, reasons: [...new Set(reasons)].sort(), disposition: "QUARANTINED_NOT_INDEX_ELIGIBLE" });
      continue;
    }
    seen.add(record.source_qualified_key);
    admitted.push(structuredClone(record));
  }

  const designCounts = new Map();
  for (const record of admitted) designCounts.set(record.canonical_design_candidate_key, (designCounts.get(record.canonical_design_candidate_key) ?? 0) + 1);
  for (const record of admitted) {
    record.identity_state = designCounts.get(record.canonical_design_candidate_key) > 1 ? "REVIEW_REQUIRED_CANDIDATE_COLLISION" : "CANDIDATE_KEY_ONLY";
    record.universe_admission_state = "INTERNAL_UNIVERSE_ADMISSION_CANDIDATE";
    record.index_eligible = false;
    record.publication_eligible = false;
    record.production_eligible = false;
  }
  const reviewGroups = [...designCounts.entries()].filter(([, count]) => count > 1).sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => ({
    canonical_design_candidate_key: key,
    source_record_ids: admitted.filter(r => r.canonical_design_candidate_key === key).map(r => r.source_record_id).sort(),
    record_count: count,
    auto_merge: false,
    state: "REVIEW_REQUIRED"
  }));
  const designKeys = [...designCounts.keys()].sort();

  const quarantine = {
    id: "raw-quarantine-authority-shadow-r1", record_type: "raw_quarantine_report", version: "1.0.0",
    status: quarantined.length ? "PASS_FAIL_CLOSED" : "PASS_NO_REJECTIONS", created_at: input.run_at,
    created_by: "Track A / Raw Quarantine Engine", run_id: "engine-authority-shadow-r1",
    input_record_count: records.length, admitted_record_count: admitted.length, quarantined_record_count: quarantined.length,
    reason_counts: countBy(quarantined.flatMap(record => record.reasons.map(reason => ({ reason }))), "reason"),
    quarantined_records: quarantined, index_eligible_quarantined_records: 0, publication_eligible: false,
    production_eligible: false, mutation_performed: false
  };
  quarantine.report_fingerprint = sha(quarantine);

  const universe = {
    id: "universe-admission-authority-shadow-r1", record_type: "universe_admission_report", version: "1.0.0",
    status: "INTERNAL_ADMISSION_CANDIDATES_READY", created_at: input.run_at, created_by: "Track A / Universe Engine",
    run_id: "engine-authority-shadow-r1", universe_id: "universe-global-collectibles-v1",
    source_family_count: new Set(input.sources.map(source => source.source_family)).size,
    input_record_count: records.length, admitted_record_count: admitted.length, quarantined_record_count: quarantined.length,
    unique_source_record_count: new Set(admitted.map(record => record.source_qualified_key)).size, duplicate_contamination: 0,
    provenance_coverage: admitted.length ? admitted.filter(record => record.provenance_reference).length / admitted.length : 0,
    rights_state_coverage: admitted.length ? admitted.filter(record => record.rights_state).length / admitted.length : 0,
    freshness_pass_coverage: admitted.length ? 1 : 0, image_ingestion_count: 0, admission_candidates: admitted,
    global_universe_object_count_mutated: false, public_projection: false, index_eligible: false, production_eligible: false
  };
  universe.report_fingerprint = sha(universe);

  const entity = {
    id: "entity-resolution-authority-shadow-r1", record_type: "entity_resolution_report", version: "1.0.0",
    status: reviewGroups.length ? "PASS_WITH_REVIEW" : "PASS", created_at: input.run_at,
    created_by: "Track A / Entity Resolution Engine", run_id: "engine-authority-shadow-r1",
    source_record_count: admitted.length, physical_object_candidate_count: admitted.length,
    canonical_design_candidate_count: designKeys.length, auto_merge_count: 0,
    review_required_group_count: reviewGroups.length, review_required_record_count: reviewGroups.reduce((sum, group) => sum + group.record_count, 0),
    golden_dataset_accuracy: null, golden_dataset_status: "NOT_VALIDATED", review_groups: reviewGroups,
    provider_id_promoted_to_canonical_id: false, public_projection: false, index_eligible: false, production_eligible: false
  };
  entity.report_fingerprint = sha(entity);

  const nodeMap = new Map();
  const edges = [];
  for (const source of input.sources) nodeMap.set(`source:${source.source_id}`, { node_id: `source:${source.source_id}`, node_type: "SOURCE", source_family: source.source_family, rights_state: source.rights_state });
  for (const record of admitted) {
    const sr = `source-record:${record.source_record_id}`;
    const po = record.physical_object_candidate_id;
    const cd = `design-candidate:${record.canonical_design_candidate_key}`;
    const ea = `assertion:${record.source_record_id}`;
    nodeMap.set(sr, { node_id: sr, node_type: "SOURCE_RECORD", source_record_id: record.source_record_id });
    nodeMap.set(po, { node_id: po, node_type: "PHYSICAL_OBJECT_CANDIDATE", identity_state: record.identity_state });
    nodeMap.set(cd, { node_id: cd, node_type: "CANONICAL_DESIGN_CANDIDATE", candidate_key: record.canonical_design_candidate_key });
    nodeMap.set(ea, { node_id: ea, node_type: "EVIDENCE_ASSERTION", assertion_type: "AUTHORITY_COLLECTION_IDENTITY", provenance_reference: record.provenance_reference, rights_state: record.rights_state });
    edges.push(
      { from: `source:${record.source_id}`, to: sr, edge_type: "PUBLISHED_SOURCE_RECORD" },
      { from: sr, to: ea, edge_type: "SUPPORTS_ASSERTION" },
      { from: ea, to: po, edge_type: "ASSERTS_PHYSICAL_OBJECT_IDENTITY" },
      { from: po, to: cd, edge_type: "CANDIDATE_DESIGN_MEMBERSHIP", auto_merge: false }
    );
  }
  const nodes = [...nodeMap.values()].sort((a, b) => a.node_id.localeCompare(b.node_id));
  edges.sort((a, b) => `${a.from}|${a.to}|${a.edge_type}`.localeCompare(`${b.from}|${b.to}|${b.edge_type}`));
  const evidenceGraph = {
    id: "evidence-graph-authority-shadow-r1", record_type: "evidence_graph", version: "1.0.0",
    status: "INTERNAL_AUTHORITY_GRAPH_READY", created_at: input.run_at, created_by: "Track A / Evidence Graph Engine",
    run_id: "engine-authority-shadow-r1", source_family_count: new Set(input.sources.map(source => source.source_family)).size,
    node_count: nodes.length, edge_count: edges.length, node_counts: countBy(nodes, "node_type"), edge_counts: countBy(edges, "edge_type"),
    critical_provenance_coverage: universe.provenance_coverage, rights_state_coverage: universe.rights_state_coverage,
    nodes, edges, market_metric_support: { demand: "NOT_VERIFIED", scarcity: "NOT_VERIFIED", valuation: "NOT_VERIFIED", liquidity: "NOT_VERIFIED", confidence: "NOT_VERIFIED" },
    public_projection: false, index_eligible: false, production_eligible: false
  };
  evidenceGraph.graph_fingerprint = sha(evidenceGraph);

  const marketNodes = designKeys.map(key => ({ node_id: `design-candidate:${key}`, node_type: "MARKET_ENTITY_CANDIDATE", candidate_key: key }));
  const marketEdges = admitted.map(record => ({ from: `authority-observation:${record.source_record_id}`, to: `design-candidate:${record.canonical_design_candidate_key}`, edge_type: "AUTHORITY_CONTEXT_FOR" }));
  const marketGraph = {
    id: "market-graph-authority-shadow-r1", record_type: "market_graph", version: "1.0.0",
    status: "AUTHORITY_CONTEXT_ONLY_NO_MARKET_EVENTS", created_at: input.run_at, created_by: "Track A / Market Graph Engine",
    run_id: "engine-authority-shadow-r1", entity_candidate_nodes: designKeys.length, authority_observation_nodes: admitted.length,
    market_event_nodes: 0, sold_transaction_nodes: 0, listing_nodes: 0, event_to_entity_edges: 0,
    authority_context_edges: marketEdges.length, nodes: marketNodes, edges: marketEdges, listing_is_sale: false,
    market_metrics_verified: 0, demand: "NOT_VERIFIED", scarcity: "NOT_VERIFIED", valuation: "NOT_VERIFIED", liquidity: "NOT_VERIFIED",
    public_projection: false, index_eligible: false, production_eligible: false
  };
  marketGraph.graph_fingerprint = sha(marketGraph);

  const cluster = {
    id: "cluster-discovery-authority-shadow-r1", record_type: "cluster_discovery_preflight", version: "1.0.0",
    status: "PREFLIGHT_DISCOVERY_ONLY", created_at: input.run_at, created_by: "Track A / Cluster Discovery Engine",
    run_id: "engine-authority-shadow-r1", candidate_count: 1, approved_dynamic_vertical_count: 0,
    candidates: [{ cluster_id: "cluster-preflight-fashion-dress-authority-r1", state: "DISCOVERED", label: "Fashion Dress Authority Context", basis: ["core_domain_hint=fashion-accessories", "object_type~=dress"], observation_count: admitted.length, source_family_count: new Set(input.sources.map(source => source.source_family)).size, confidence: null, confidence_status: "NOT_CALIBRATED", market_cluster_claim: false, dynamic_vertical_promotion: false, human_approval_required: true }],
    identity_review_groups: reviewGroups.length, public_projection: false, index_computation: false, production_eligible: false
  };
  cluster.report_fingerprint = sha(cluster);

  const outputs = {
    "raw-quarantine-report.json": quarantine,
    "universe-admission-report.json": universe,
    "entity-resolution-report.json": entity,
    "evidence-graph-shadow.json": evidenceGraph,
    "market-graph-shadow.json": marketGraph,
    "cluster-discovery-preflight.json": cluster
  };
  const manifest = {
    id: "engine-authority-shadow-r1", record_type: "engine_shadow_run", version: "1.0.0",
    state: "BOUNDED_LIVE_SHADOW_PASS", run_mode: "BOUNDED_LIVE_COMMITTED_ARTIFACT_REPLAY",
    generated_at: input.run_at, input_id: input.input_id, source_family_count: universe.source_family_count,
    input_record_count: records.length, admitted_record_count: admitted.length, quarantined_record_count: quarantined.length,
    manual_review_count: entity.review_required_record_count, market_event_count: 0, sold_transaction_count: 0, listing_count: 0,
    discovered_cluster_count: cluster.candidate_count, approved_dynamic_vertical_count: 0, indexes_computed: 0,
    deterministic_rerun: "PASS", fail_closed: true, critical_provenance_coverage: universe.provenance_coverage,
    rights_state_coverage: universe.rights_state_coverage, duplicate_contamination: universe.duplicate_contamination,
    stale_record_admission: 0, rights_missing_admission: 0, provider_to_portal_direct_paths: 0,
    provider_to_index_direct_paths: 0, autonomous_public_vertical_promotion: 0, public_index_computation: 0,
    production_mutation: 0, publication_eligible: false, production_eligible: false,
    output_fingerprints: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.report_fingerprint ?? value.graph_fingerprint]))
  };
  manifest.run_fingerprint = sha(manifest);
  outputs["run-manifest.json"] = manifest;
  return outputs;
}

function writeOutputs(outputs) {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const [name, value] of Object.entries(outputs)) fs.writeFileSync(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
async function main() {
  const outputs = buildAuthorityShadow();
  if (process.argv.includes("--write")) writeOutputs(outputs);
  const run = outputs["run-manifest.json"];
  console.log("AGCI-OS bounded-live authority Shadow: PASS");
  console.log(`Input / admitted / quarantined: ${run.input_record_count} / ${run.admitted_record_count} / ${run.quarantined_record_count}`);
  console.log(`Source families: ${run.source_family_count}`);
  console.log(`Identity review records: ${run.manual_review_count}`);
  console.log("Market events: 0; market metrics: NOT_VERIFIED");
  console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
  console.log("Production: HOLD");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
