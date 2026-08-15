import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const registryRoot = path.join(root, "coordination", "kidults", "registry");
const portalData = path.join(root, "apps", "kidults-enterprise-staging", "public", "portal", "data");
const projectionPath = path.join(portalData, "registry-view.json");

function read(relative) {
  return JSON.parse(fs.readFileSync(path.join(registryRoot, relative), "utf8"));
}

const catalog = read("catalog.json");
const track = read("track/index.json");
const snapshot = read("snapshot/index.json");
const assessment = read("assessment/index.json");
const release = read("release/index.json");
const provider = read("provider/index.json");
const runtime = read("runtime/index.json");
const baseline = read(`snapshot/records/${snapshot.current_baseline_snapshot_id}.json`);
const digitalOcean = read("runtime/records/runtime-digitalocean-readonly-audit-v1.json");

function trackState(letter) {
  const record = track.records.find(item => item.id.startsWith(`track-${letter.toLowerCase()}-`));
  return record?.status ?? "NOT_REGISTERED";
}

const now = new Date().toISOString();
const projection = {
  projection_id: "portal-v502-registry-view-001",
  projection_version: "1.1.0",
  generated_from: [
    "coordination/kidults/registry/catalog.json",
    "coordination/kidults/registry/track/index.json",
    "coordination/kidults/registry/snapshot/index.json",
    "coordination/kidults/registry/assessment/index.json",
    "coordination/kidults/registry/provider/index.json",
    "coordination/kidults/registry/runtime/index.json",
    "coordination/kidults/registry/release/index.json"
  ],
  generated_at: now,
  registry_system_version: catalog.registry_system_version,
  program_status: "ACTIVE",
  track_states: {
    A: trackState("A"),
    B: trackState("B"),
    C: trackState("C"),
    D: trackState("D"),
    E: trackState("E")
  },
  snapshot: {
    baseline_id: snapshot.current_baseline_snapshot_id,
    baseline_status: baseline.status,
    candidate_id: snapshot.current_candidate_snapshot_id,
    candidate_status: snapshot.current_candidate_snapshot_id ? "CURRENT" : "WAITING",
    published_id: snapshot.current_published_snapshot_id,
    published_status: snapshot.current_published_snapshot_id ? "CURRENT" : "NOT_AVAILABLE"
  },
  assessment: {
    current_id: assessment.current_assessment_id,
    status: assessment.status
  },
  provider: {
    registry_status: provider.status,
    current_record_id: provider.current_record_id,
    connection_state: provider.records[0]?.status ?? "NOT_REGISTERED",
    production_connection: "PROHIBITED"
  },
  runtime: {
    current_id: runtime.current_runtime_id,
    status: runtime.status,
    production_input_state: runtime.production_input_state,
    digitalocean_audit_id: digitalOcean.id,
    digitalocean_state: digitalOcean.status,
    production_connection: digitalOcean.production_connection_authorized
  },
  release: {
    current_id: release.current_release_id,
    status: release.status,
    production_decision: release.production_decision_state,
    rollback_target_id: release.current_rollback_target_id
  },
  versions: {
    methodology: baseline.methodology_version,
    evidence_lineage: baseline.evidence_lineage_version,
    portal_contract: "v502-rc1"
  },
  freshness: {
    status: "CURRENT",
    as_of: now
  }
};

if (process.argv.includes("--write")) {
  fs.writeFileSync(projectionPath, `${JSON.stringify(projection, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, projectionPath)}`);
  process.exit(0);
}

const current = JSON.parse(fs.readFileSync(projectionPath, "utf8"));
const comparable = value => {
  const copy = structuredClone(value);
  delete copy.generated_at;
  if (copy.freshness) delete copy.freshness.as_of;
  return copy;
};

if (JSON.stringify(comparable(current)) !== JSON.stringify(comparable(projection))) {
  console.error("V502 Registry projection is stale. Run:");
  console.error("node scripts/kidults/portal/build-v502-registry-view.mjs --write");
  process.exit(1);
}

console.log("V502 Registry projection matches canonical registries.");
