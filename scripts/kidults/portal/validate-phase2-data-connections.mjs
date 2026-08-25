import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const json = relative => JSON.parse(read(relative));
const exists = relative => fs.existsSync(path.join(root, relative));
const publicDataRoot = "apps/kidults-enterprise-staging/public/portal/data";
const publicProviderShadow = `${publicDataRoot}/provider-shadow.json`;
const publicProviderGapMatrix = `${publicDataRoot}/provider-gap-matrix-v1.json`;
const publicProviderGapStatus = `${publicDataRoot}/provider-gap-status-v1.json`;
const internalProviderShadow = "coordination/kidults/registry/provider/records/provider-shadow-v1.json";
const internalProviderGapMatrix = "coordination/kidults/registry/provider/records/provider-gap-matrix-v1.json";

function filesUnder(relative) {
  const absolute = path.join(root, relative);
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

const requiredFiles = [
  "apps/kidults-enterprise-staging/public/portal/components/data-source-gateway.js",
  "apps/kidults-enterprise-staging/public/portal/data/data-source-manifest-v1.json",
  "apps/kidults-enterprise-staging/public/portal/data/content-product-contract-v1.json",
  publicProviderGapStatus,
  internalProviderGapMatrix,
  internalProviderShadow,
  "apps/kidults-enterprise-staging/public/portal/data/runtime-health-projection.json",
  "coordination/kidults/schemas/data-source-manifest.schema.json",
  "coordination/kidults/registry/provider/records/provider-requirements-v1.json",
  "coordination/kidults/registry/track/records/track-e-executive-operating-system.json",
  "coordination/kidults/registry/mission/records/mission-track-e-executive-operating-system.json",
  "coordination/kidults/registry/runtime/records/runtime-digitalocean-readonly-audit-v1.json",
  "scripts/operations/digitalocean_readonly_audit.py",
  ".github/workflows/digitalocean-readonly-audit.yml"
];
for (const relative of requiredFiles) if (!exists(relative)) errors.push(`Missing Phase 2 file: ${relative}`);
for (const relative of [publicProviderShadow, publicProviderGapMatrix]) {
  if (exists(relative)) errors.push(`Internal Provider record must not exist in the public publish root: ${relative}`);
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
    if (!["PUBLIC_PAYLOAD", "PUBLIC_STATUS_ONLY"].includes(source.access)) errors.push(`${source.id}: public manifest contains a non-public access class.`);
    if (!["CONTRACT_GATED", "STATUS_ONLY"].includes(source.publication_policy)) errors.push(`${source.id}: public manifest contains a non-public publication policy.`);
    if (/provider[-_]shadow|provider-gap-matrix/i.test(`${source.id} ${source.role} ${source.path}`)) {
      errors.push(`${source.id}: public manifest references an internal Provider record.`);
    }
  }
  if (manifest.sources.some(source => source.id === "provider_shadow" || source.access === "INTERNAL_ONLY" || source.publication_policy === "NEVER")) {
    errors.push("Public source manifest must contain no Provider shadow or INTERNAL_ONLY/NEVER source.");
  }

  const providerStatusSource = manifest.sources.find(source => source.id === "provider_gap_status");
  if (providerStatusSource?.path !== "data/provider-gap-status-v1.json?v=phase2-2") errors.push("Provider public status source path mismatch.");
  if (providerStatusSource?.access !== "PUBLIC_STATUS_ONLY" || providerStatusSource?.publication_policy !== "STATUS_ONLY") {
    errors.push("Provider public projection must be PUBLIC_STATUS_ONLY / STATUS_ONLY.");
  }
  for (const field of ["version", "status", "provider_registry_state", "production_connection", "dimension_count"]) {
    if (!providerStatusSource?.required_metadata?.includes(field)) errors.push(`provider_gap_status missing required metadata: ${field}`);
  }
  for (const id of ["quality_feed", "monthly_intelligence"]) {
    const source = manifest.sources.find(item => item.id === id);
    if (source?.publication_policy !== "CONTRACT_GATED") errors.push(`${id} must be contract-gated.`);
    for (const field of ["snapshot_id", "methodology_version", "evidence_lineage_version"]) if (!source?.required_metadata?.includes(field)) errors.push(`${id} missing required metadata: ${field}`);
  }

  const gateway = read("apps/kidults-enterprise-staging/public/portal/components/data-source-gateway.js");
  for (const marker of [
    "Remote or empty source paths are prohibited",
    'const ALLOWED_ACCESS = new Set(["PUBLIC_PAYLOAD", "PUBLIC_STATUS_ONLY"])',
    'const ALLOWED_POLICIES = new Set(["CONTRACT_GATED", "STATUS_ONLY"])',
    "validation.publicationEligible",
    "STATUS_CONNECTED",
    "PUBLIC_STATUS_CONNECTED",
    "sourceIsOverlayEligible"
  ]) if (!gateway.includes(marker)) errors.push(`Gateway marker missing: ${marker}`);
  for (const prohibited of ["INTERNAL_ONLY", "SHADOW_CONNECTED", 'source.access === "PUBLIC_PAYLOAD") payloads']) {
    if (gateway.includes(prohibited)) errors.push(`Gateway must reject public-runtime internal access semantics: ${prohibited}`);
  }
  const manifestSchema = read("coordination/kidults/schemas/data-source-manifest.schema.json");
  for (const prohibited of ['"INTERNAL_ONLY"', '"NEVER"']) {
    if (manifestSchema.includes(prohibited)) errors.push(`Public manifest schema must reject internal policy token: ${prohibited}`);
  }
  const store = read("apps/kidults-enterprise-staging/public/portal/components/data-store.js");
  for (const marker of ['from "./data-source-gateway.js"',"loadDataConnections","sourceIsOverlayEligible","qualityOverlayEligible","monthlyOverlayEligible"]) if (!store.includes(marker)) errors.push(`Data store integration missing: ${marker}`);
  if (store.includes("const UPSTREAM")) errors.push("Legacy direct UPSTREAM loading must be removed.");
  const portal = read("apps/kidults-enterprise-staging/public/portal/portal.js");
  for (const marker of ["KIDULTS_DATA_CONNECTIONS","dataConnectionState","providerConnectionState","runtimeObservationState"]) if (!portal.includes(marker)) errors.push(`Portal connection projection missing: ${marker}`);

  const providerIndex = json("coordination/kidults/registry/provider/index.json");
  if (providerIndex.current_record_id !== "provider-requirements-v1" || providerIndex.record_count !== 3) errors.push("Provider Registry requirement pointer or governed record count mismatch.");
  for (const id of ["provider-requirements-v1", "kidults-provider-gap-matrix-v1", "kidults-provider-shadow-v1"]) {
    if (!providerIndex.records.some(record => record.id === id)) errors.push(`Provider Registry missing governed record: ${id}`);
  }
  const providerRequirements = json("coordination/kidults/registry/provider/records/provider-requirements-v1.json");
  if (providerRequirements.source_of_truth !== internalProviderGapMatrix) errors.push("Provider requirements must use the internal gap matrix as source of truth.");
  if (providerRequirements.public_status_projection !== publicProviderGapStatus) errors.push("Provider requirements public status projection pointer mismatch.");

  const shadow = json(internalProviderShadow);
  if (shadow.id !== "kidults-provider-shadow-v1" || shadow.access !== "INTERNAL_ONLY" || shadow.publication_eligible !== false || shadow.public_projection !== false) {
    errors.push("Internal Provider shadow boundary mismatch.");
  }
  const gapMatrix = json(internalProviderGapMatrix);
  if (gapMatrix.id !== "kidults-provider-gap-matrix-v1" || gapMatrix.access !== "INTERNAL_ONLY" || gapMatrix.publication_eligible !== false || gapMatrix.public_projection !== false) {
    errors.push("Internal Provider gap matrix boundary mismatch.");
  }
  if (!Array.isArray(gapMatrix.dimensions) || gapMatrix.dimensions.length === 0) errors.push("Internal Provider gap matrix must retain governed dimensions.");

  const gapStatus = json(publicProviderGapStatus);
  const statusKeys = Object.keys(gapStatus).sort();
  const allowedStatusKeys = [
    "details",
    "dimension_count",
    "production_connection",
    "projection_id",
    "provider_registry_state",
    "publication_policy",
    "status",
    "version"
  ].sort();
  if (JSON.stringify(statusKeys) !== JSON.stringify(allowedStatusKeys)) errors.push("Provider public status projection contains fields outside the status-only allowlist.");
  if (gapStatus.publication_policy !== "STATUS_ONLY" || gapStatus.production_connection !== false) errors.push("Provider public status projection boundary mismatch.");
  if (gapStatus.dimension_count !== gapMatrix.dimensions.length) errors.push("Provider public dimension count does not match the internal governed matrix.");
  const publicGapText = read(publicProviderGapStatus);
  for (const prohibited of ["strategy", "required_fields", "freshness", "rights", "portal_use", "outreach_rule", "credentials_present"]) {
    if (publicGapText.includes(`\"${prohibited}\"`)) errors.push(`Provider public status projection leaks internal field: ${prohibited}`);
  }
  for (const relative of filesUnder(publicDataRoot).filter(file => file.endsWith(".json"))) {
    if (read(relative).includes('"access": "INTERNAL_ONLY"')) errors.push(`Public JSON contains INTERNAL_ONLY record: ${relative}`);
  }
  const track = json("coordination/kidults/registry/track/index.json");
  if (!track.records.some(record => record.id === "track-e-executive-operating-system")) errors.push("Track E is not registered.");
  const mission = json("coordination/kidults/registry/mission/index.json");
  if (!mission.records.some(record => record.id === "mission-track-e-executive-operating-system")) errors.push("MISSION-E-0001 is not registered.");

  const twin = json("coordination/kidults/registry/digital-twin/records/twin-current-program-state-v1.json");
  if (twin.track_states?.E !== "FOUNDATION_COMPLETE_INTEGRATION_ACTIVE") errors.push("Digital Twin Track E must reflect approved Foundation Complete / Integration Active state.");
  if (twin.source_freshness_status !== "CURRENT_CANONICAL_BASELINE") errors.push("Digital Twin must consume semantically current Projection truth.");
  if (twin.production_state !== "HOLD") errors.push("Digital Twin Production state must remain HOLD.");

  const runtime = json("coordination/kidults/registry/runtime/records/runtime-digitalocean-readonly-audit-v1.json");
  if (runtime.connection_mode !== "READ_ONLY_AUDIT" || runtime.mutation_performed !== false) errors.push("DigitalOcean runtime observation must remain read-only.");
  if (runtime.production_connection_authorized !== false) errors.push("DigitalOcean Production connection must remain unauthorized.");
  const workflow = read(".github/workflows/digitalocean-readonly-audit.yml");
  for (const prohibited of ["contents: write","doctl compute droplet-action","ssh ","restart","curl -X POST","curl -X DELETE"]) if (workflow.includes(prohibited)) errors.push(`DigitalOcean workflow contains prohibited mutation marker: ${prohibited}`);
  if (!workflow.includes("contents: read")) errors.push("DigitalOcean workflow must use contents: read.");

  const projection = json("apps/kidults-enterprise-staging/public/portal/data/registry-view.json");
  if (!projection.track_states?.E) errors.push("Portal Registry projection does not include Track E.");
  if (projection.freshness?.status !== "CURRENT_CANONICAL_BASELINE") errors.push("Portal Registry projection must be semantically current.");
  if (projection.provider?.connection_state !== "RESEARCHING") errors.push("Provider state projection mismatch.");
  if (!["NOT_VERIFIED", "PUBLIC_ENDPOINT_OBSERVED", "READ_ONLY_CONNECTION_VERIFIED"].includes(projection.runtime?.digitalocean_state)) errors.push(`Unsupported DigitalOcean observation state: ${projection.runtime?.digitalocean_state}`);
  if (projection.runtime?.production_connection !== false) errors.push("DigitalOcean Production connection must remain false.");
}

if (errors.length) {
  console.error(`KIDULTS Phase 2 data connection validation: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log("KIDULTS Phase 2 data connection validation: PASS");
console.log("PASS: public manifest/gateway allow only public sources, Provider shadow and full gap matrix stay outside the publish root, the Provider status projection is allowlisted, and Production remains HOLD.");
