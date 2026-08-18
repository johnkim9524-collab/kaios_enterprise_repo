import fs from "node:fs";
import path from "node:path";
import process from "node:process";
const root = process.cwd();
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
const engine = read("coordination/kidults/registry/engine/index.json");
const engineRun = read("coordination/kidults/registry/engine/records/engine-authority-shadow-r1.json");
const quarantine = read("coordination/kidults/registry/raw-quarantine/index.json");
const universe = read("coordination/kidults/registry/universe/index.json");
const entity = read("coordination/kidults/registry/entity/index.json");
const evidence = read("coordination/kidults/registry/evidence/index.json");
const market = read("coordination/kidults/registry/market-graph/index.json");
const cluster = read("coordination/kidults/registry/cluster/index.json");
const projectionIndex = read("coordination/kidults/registry/projection/index.json");
const shadowProjection = read("coordination/kidults/registry/projection/records/projection-agci-os-authority-shadow-r1.json");
const portal = read("apps/kidults-enterprise-staging/public/portal/data/registry-view.json");

assert(engine.current_record_id === "engine-foundation-preflight-r1", "Foundation Engine pointer must remain stable.");
assert(engine.current_shadow_run_id === engineRun.id, "Engine Shadow pointer mismatch.");
assert(engineRun.status === "BOUNDED_LIVE_SHADOW_PASS", "Engine Shadow state mismatch.");
assert(quarantine.current_shadow_report_id === "raw-quarantine-authority-shadow-r1", "Raw Quarantine Shadow pointer mismatch.");
assert(universe.current_admission_report_id === "universe-admission-authority-shadow-r1", "Universe admission pointer mismatch.");
assert(entity.current_shadow_report_id === "entity-resolution-authority-shadow-r1", "Entity Shadow pointer mismatch.");
assert(evidence.current_shadow_graph_id === "evidence-graph-authority-shadow-r1", "Evidence Graph pointer mismatch.");

const historicalStructuralEvidence = evidence.records.find(item => item.id === "evidence-candidate-structural-20260816-r1");
assert(Boolean(historicalStructuralEvidence), "Historical structural Evidence record must remain registered.");
assert(historicalStructuralEvidence?.status === "HISTORICAL_CANDIDATE_EVIDENCE_NOT_CURRENT", "Historical structural Evidence must remain immutable history, not current authority.");
assert(evidence.current_evidence_package_id === null, "Current Evidence Package must remain empty until the bounded real PoC creates a new immutable package.");
assert(evidence.current_evidence_package_id !== evidence.current_shadow_graph_id, "Shadow Evidence must never become the current Candidate Evidence Package.");

assert(market.current_shadow_graph_id === "market-graph-authority-shadow-r1", "Market Graph pointer mismatch.");
assert(cluster.current_shadow_preflight_id === "cluster-discovery-authority-shadow-r1", "Cluster preflight pointer mismatch.");
assert(projectionIndex.current_record_id === "projection-agci-os-current-v1", "Portal current Projection must not be replaced.");
assert(projectionIndex.current_shadow_projection_id === shadowProjection.id, "Shadow Projection pointer mismatch.");
assert(shadowProjection.source_run_id === engineRun.id && shadowProjection.run_fingerprint === engineRun.run_fingerprint, "Shadow Projection alignment mismatch.");
assert(shadowProjection.market_events === 0 && shadowProjection.indexes_computed === 0 && shadowProjection.approved_dynamic_verticals === 0, "Shadow Projection must fail closed.");
assert(shadowProjection.public_projection === false && shadowProjection.production === "HOLD", "Shadow Projection boundary mismatch.");
assert(portal.source_projection_id === "projection-agci-os-current-v1", "Portal must keep the governed current Projection.");
assert(portal.freshness?.status === "CURRENT_CANONICAL_BASELINE", "Portal must consume a semantically current canonical Projection baseline.");
assert(portal.indexes.kidult_500.status === "NOT_COMPUTED" && portal.indexes.kidult_100.status === "NOT_COMPUTED", "Portal Index state changed.");
assert(portal.publication.production === "HOLD", "Portal Production must remain HOLD.");

if (errors.length) {
  console.error(`AGCI-OS bounded-live Shadow Registry: FAIL (${errors.length})`);
  errors.forEach(error => console.error(`ERROR: ${error}`));
  process.exit(1);
}
console.log("AGCI-OS bounded-live Shadow Registry: PASS");
console.log(`Shadow run: ${engineRun.id}`);
console.log(`Projection: ${shadowProjection.id}`);
console.log("Historical Candidate preserved; current Evidence Package empty; Portal semantically current; KIDULT 500/100 NOT_COMPUTED; Production HOLD.");
