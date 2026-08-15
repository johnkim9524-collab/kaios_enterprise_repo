import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const json = relative => JSON.parse(read(relative));
const exists = relative => fs.existsSync(path.join(root, relative));

const requiredFiles = [
  "apps/kidults-enterprise-staging/public/portal/components/data-source-gateway.js",
  "apps/kidults-enterprise-staging/public/portal/data/data-source-manifest-v1.json",
  "apps/kidults-enterprise-staging/public/portal/data/content-product-contract-v1.json",
  "apps/kidults-enterprise-staging/public/portal/data/provider-gap-matrix-v1.json",
  "apps/kidults-enterprise-staging/public/portal/data/provider-shadow.json",
  "apps/kidults-enterprise-staging/public/portal/data/runtime-health-projection.json",
  "coordination/kidults/schemas/data-source-manifest.schema.json",
  "coordination/kidults/registry/provider/records/provider-requirements-v1.json",
  "coordination/kidults/registry/track/records/track-e-executive-operating-system.json",
  "coordination/kidults/registry/mission/records/mission-track-e-executive-operating-system.json",
  "coordination/kidults/registry/runtime/records/runtime-digitalocean-readonly-audit-v1.json",
  "scripts/operations/digitalocean_readonly_audit.py",
  ".github/workflows/digitalocean-readonly-audit.yml"
];

for (const relative of requiredFiles) {
  if (!exists(relative)) errors.push(`Missing Phase 2 file: ${relative}`);
}

if (!errors.length) {
  const manifest = json("apps/kidults-enterprise-staging/public/portal/data/data-source-manifest-v1.json");
  const ids = manifest.sources.map(source => source.id);
  if (new Set(ids).size !== ids.length) errors.push("Data source IDs must be unique.");
  if (manifest.production_eligible !== false) errors.push("Phase 2 source manifest must not be Production eligible.");
  if (manifest.rules?.raw_provider_data_to_portal !== "PROHIBITED") errors.push("Raw Provider data must be prohibited.");
  if (manifest.rules?.missing_to_zero !== false) errors.push("Missing-to-zero must remain prohibited.");

  for (const source of manifest.sources) {
    if (/^(?:https?:)?\/\//i.test(source.path)) errors.push(`${source.id}: direct remote source path is prohibited.`);
  }

  const shadow = manifest.sources.find(source => source.id === "provider_shadow");
  if (shadow?.access !== "INTERNAL_ONLY" || shadow?.publication_policy !== "NEVER") {
    errors.push("Provider shadow source must be INTERNAL_ONLY and NEVER publishable.");
  }

  for (const id of ["quality_feed", "monthly_intelligence"]) {
    const source = manifest.sources.find(item => item.id === id);
    if (source?.publication_policy !== "CONTRACT_GATED") errors.push(`${id} must be contract-gated.`);
    for (const field of ["snapshot_id", "methodology_version", "evidence_lineage_version"]) {
      if (!source?.required_metadata?.includes(field)) errors.push(`${id} missing required metadata: ${field}`);
    }
  }

  const gateway = read("apps/kidults-enterprise-staging/public/portal/components/data-source-gateway.js");
  for (const marker of [
    "Remote or empty source paths are prohibited",
    "Internal provider-shadow payloads",
    "publicationEligible",
    "sourceIsOverlayEligible"
  ]) if (!gateway.includes(marker)) errors.push(`Gateway marker missing: ${marker}`);

  const store = read("apps/kidults-enterprise-staging/public/portal/components/data-store.js");
  for (const marker of [
    'from "./data-source-gateway.js"',
    "loadDataConnections",
    "sourceIsOverlayEligible",
    "qualityOverlayEligible",
    "monthlyOverlayEligible"
  ]) if (!store.includes(marker)) errors.push(`Data store integration missing: ${marker}`);
  if (store.includes("const UPSTREAM")) errors.push("Legacy direct UPSTREAM loading must be removed.");

  const portal = read("apps/kidults-enterprise-staging/public/portal/portal.js");
  for (const marker of [
    "KIDULTS_DATA_CONNECTIONS",
    "dataConnectionState",
    "providerConnectionState",
    "runtimeObservationState"
  ]) if (!portal.includes(marker)) errors.push(`Portal connection projection missing: ${marker}`);

  const providerIndex = json("coordination/kidults/registry/provider/index.json");
  if (providerIndex.current_record_id !== "provider-requirements-v1" || providerIndex.record_count !== 1) {
    errors.push("Provider Registry requirement record is not active.");
  }

  const track = json("coordination/kidults/registry/track/index.json");
  if (!track.records.some(record => record.id === "track-e-executive-operating-system")) {
    errors.push("Track E is not registered.");
  }
  const mission = json("coordination/kidults/registry/mission/index.json");
  if (!mission.records.some(record => record.id === "mission-track-e-executive-operating-system")) {
    errors.push("MISSION-E-0001 is not registered.");
  }

  const twin = json("coordination/kidults/registry/digital-twin/records/twin-current-program-state-v1.json");
  if (twin.track_states?.E !== "PARTIALLY_IMPLEMENTED") errors.push("Digital Twin Track E state mismatch.");
  if (twin.production_state !== "HOLD") errors.push("Digital Twin Production state must remain HOLD.");

  const runtime = json("coordination/kidults/registry/runtime/records/runtime-digitalocean-readonly-audit-v1.json");
  if (runtime.connection_mode !== "READ_ONLY_AUDIT" || runtime.mutation_performed !== false) {
    errors.push("DigitalOcean runtime observation must remain read-only.");
  }
  if (runtime.production_connection_authorized !== false) {
    errors.push("DigitalOcean Production connection must remain unauthorized.");
  }

  const workflow = read(".github/workflows/digitalocean-readonly-audit.yml");
  for (const prohibited of [
    "contents: write",
    "doctl compute droplet-action",
    "ssh ",
    "restart",
    "curl -X POST",
    "curl -X DELETE"
  ]) {
    if (workflow.includes(prohibited)) errors.push(`DigitalOcean workflow contains prohibited mutation marker: ${prohibited}`);
  }
  if (!workflow.includes("contents: read")) errors.push("DigitalOcean workflow must use contents: read.");

  const projection = json("apps/kidults-enterprise-staging/public/portal/data/registry-view.json");
  if (!projection.track_states?.E) errors.push("Portal Registry projection does not include Track E.");
  if (projection.provider?.connection_state !== "RESEARCHING") errors.push("Provider state projection mismatch.");
  if (!["NOT_VERIFIED", "PUBLIC_ENDPOINT_OBSERVED", "READ_ONLY_CONNECTION_VERIFIED"].includes(projection.runtime?.digitalocean_state)) {
    errors.push(`Unsupported DigitalOcean observation state: ${projection.runtime?.digitalocean_state}`);
  }
  if (projection.runtime?.production_connection !== false) errors.push("DigitalOcean Production connection must remain false.");
}

if (errors.length) {
  console.error(`KIDULTS Phase 2 data connection validation: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS Phase 2 data connection validation: PASS");
console.log("PASS: content contracts, fail-closed Portal gateway, Provider requirements, Track E registration and DigitalOcean read-only audit.");
