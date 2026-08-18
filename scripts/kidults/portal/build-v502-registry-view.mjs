import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const registryRoot = path.join(root, "coordination", "kidults", "registry");
const portalData = path.join(root, "apps", "kidults-enterprise-staging", "public", "portal", "data");
const outputPath = path.join(portalData, "registry-view.json");

function read(relative) {
  return JSON.parse(fs.readFileSync(path.join(registryRoot, relative), "utf8"));
}

const projectionIndex = read("projection/index.json");
const projectionRef = projectionIndex.records.find(item => item.id === projectionIndex.current_record_id);
if (!projectionRef) throw new Error("Projection Registry current pointer does not resolve.");
const source = read(`projection/${projectionRef.path}`);
const sourceFreshness = source.semantic_freshness?.status ?? "NOT_VERIFIED";
const allowedFreshness = new Set(["CURRENT_CANONICAL_BASELINE", "CURRENT_APPROVED_PROJECTION"]);
if (!allowedFreshness.has(sourceFreshness)) {
  throw new Error(`PORTAL_SOURCE_PROJECTION_NOT_CURRENT:${sourceFreshness}`);
}

const writeMode = process.argv.includes("--write");
const existing = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : null;
const now = writeMode ? new Date().toISOString() : (existing?.generated_at ?? new Date().toISOString());

const projection = {
  projection_id: "portal-v502-registry-view-001",
  projection_version: "2.3.0",
  source_projection_id: source.id,
  source_projection_contract_version: source.projection_contract_version,
  generated_from: [
    "coordination/kidults/registry/projection/index.json",
    `coordination/kidults/registry/projection/${projectionRef.path}`
  ],
  generated_at: now,
  registry_system_version: source.source_registry_system_version,
  catalog_revision: source.source_catalog_revision,
  program_status: source.program_status,
  architecture: {
    product: "Autonomous Global Collectibles Intelligence Operating System",
    short_name: "AGCI-OS",
    boundary: "PROJECTION_CONSUMER_ONLY"
  },
  market_funnel_alignment: source.market_funnel_alignment,
  autonomous: source.autonomous,
  engine_v2: source.engine_v2,
  memory: source.memory,
  raw_quarantine: source.raw_quarantine,
  universe: source.universe,
  core_domains: source.core_domains,
  dynamic_verticals: source.dynamic_verticals,
  indexes: source.indexes,
  track_states: source.track_states,
  control_tower_state: source.control_tower_state,
  snapshot: source.snapshot,
  evidence: source.evidence,
  assessment: source.assessment,
  provider: source.provider,
  runtime: source.runtime,
  release: source.release,
  publication: source.publication,
  versions: source.versions,
  freshness: {
    status: sourceFreshness,
    source_projection_generated_at: source.generated_at,
    source_track_registry_version: source.semantic_freshness.track_registry_version,
    source_blocker_registry_version: source.semantic_freshness.blocker_registry_version,
    policy_baseline: source.semantic_freshness.policy_baseline,
    as_of: now
  }
};

if (writeMode) {
  fs.writeFileSync(outputPath, `${JSON.stringify(projection, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, outputPath)}`);
  process.exit(0);
}

const current = JSON.parse(fs.readFileSync(outputPath, "utf8"));
const comparable = value => {
  const copy = structuredClone(value);
  delete copy.generated_at;
  if (copy.freshness) delete copy.freshness.as_of;
  return copy;
};

if (JSON.stringify(comparable(current)) !== JSON.stringify(comparable(projection))) {
  console.error("Portal Registry Projection is stale. Run:");
  console.error("node scripts/kidults/portal/build-v502-registry-view.mjs --write");
  process.exit(1);
}

console.log("Portal consumes a semantically current canonical AGCI-OS Projection Registry: PASS");
console.log(`Freshness: ${projection.freshness.status}`);
console.log(`Critical blockers: ${projection.control_tower_state.critical_blocker_ids.length}`);
console.log(`High blockers: ${projection.control_tower_state.high_blocker_ids.length}`);
console.log(`KIDULT 500: ${projection.indexes.kidult_500.status}`);
console.log(`KIDULT 100: ${projection.indexes.kidult_100.status}`);
