import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const registryRoot = path.join(root, "coordination", "kidults", "registry");
const outputPath = path.join(registryRoot, "projection", "records", "projection-agci-os-current-v1.json");

function read(relative) {
  return JSON.parse(fs.readFileSync(path.join(registryRoot, relative), "utf8"));
}

function record(registryKey, id = null) {
  const index = read(`${registryKey}/index.json`);
  const recordId = id ?? index.current_record_id;
  if (!recordId) return { index, value: null };
  const reference = index.records.find(item => item.id === recordId);
  if (!reference) throw new Error(`${registryKey}: record '${recordId}' does not resolve.`);
  return { index, value: read(`${registryKey}/${reference.path}`) };
}

function trackState(index, letter) {
  const item = index.records.find(entry => entry.id.startsWith(`track-${letter.toLowerCase()}-`));
  return item?.status ?? "NOT_REGISTERED";
}

function comparable(value) {
  const copy = structuredClone(value);
  delete copy.generated_at;
  return copy;
}

const writeMode = process.argv.includes("--write");
const existing = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : null;
const generatedAt = writeMode ? new Date().toISOString() : (existing?.generated_at ?? new Date().toISOString());
const createdAt = existing?.created_at ?? generatedAt;

const catalog = read("catalog.json");
const autonomous = record("autonomous");
const engineContract = record("engine", "engine-agci-os-v2-contract-v1").value;
const engineRun = record("engine", "engine-foundation-preflight-r1");
const quarantinePolicy = record("raw-quarantine", "raw-quarantine-policy-v1").value;
const quarantineReport = record("raw-quarantine", "raw-quarantine-preflight-r1");
const universe = record("universe");
const coreDomain = record("core-domain");
const dynamicVertical = record("dynamic-vertical");
const providerMapping = record("provider-mapping");
const verticalIndex = record("index", "index-vertical-intelligence-template-v1").value;
const kidult500 = record("index", "index-kidult-500-v1").value;
const kidult100 = record("index", "index-kidult-100-v2").value;
const track = read("track/index.json");
const snapshot = read("snapshot/index.json");
const baseline = read(`snapshot/records/${snapshot.current_baseline_snapshot_id}.json`);
const candidate = snapshot.current_candidate_snapshot_id
  ? read(`snapshot/records/${snapshot.current_candidate_snapshot_id}.json`)
  : null;
const evidence = read("evidence/index.json");
const assessmentIndex = read("assessment/index.json");
const assessment = assessmentIndex.current_assessment_id
  ? read(`assessment/records/${assessmentIndex.current_assessment_id}.json`)
  : null;
const provider = read("provider/index.json");
const runtime = read("runtime/index.json");
const digitalOcean = read("runtime/records/runtime-digitalocean-readonly-audit-v1.json");
const release = read("release/index.json");

const projection = {
  id: "projection-agci-os-current-v1",
  record_type: "agci_os_projection",
  version: "1.1.0",
  status: "INTERNAL_CURRENT",
  created_at: createdAt,
  created_by: "Track C / Projection Engine",
  approved_by: null,
  projection_id: "AGCI-OS-PROJECTION-001",
  projection_contract_version: "agci-os-projection-v1.1",
  source_registry_system_version: catalog.registry_system_version,
  source_catalog_revision: catalog.catalog_revision ?? catalog.registry_system_version,
  program_status: "ACTIVE",
  autonomous: {
    first_value: autonomous.value.first_value,
    operating_contract_id: autonomous.value.id,
    engine_contract_id: engineContract.id,
    routine_loop_state: "FOUNDATION_PREFLIGHT_PASS_NOT_LIVE",
    human_intervention_target: autonomous.value.routine_human_intervention_target
  },
  engine_v2: {
    registry_status: engineRun.index.status,
    contract_id: engineContract.id,
    current_run_id: engineRun.value.id,
    status: engineRun.value.state,
    run_mode: engineRun.value.run_mode,
    deterministic_rerun: engineRun.value.deterministic_rerun,
    fail_closed: engineRun.value.fail_closed,
    input_record_count: engineRun.value.input_record_count,
    admitted_record_count: engineRun.value.admitted_record_count,
    quarantined_record_count: engineRun.value.quarantined_record_count,
    manual_review_count: engineRun.value.manual_review_count,
    market_event_count: engineRun.value.market_event_count,
    sold_transaction_count: engineRun.value.sold_transaction_count,
    listing_count: engineRun.value.listing_count,
    discovered_cluster_count: engineRun.value.discovered_cluster_count,
    approved_dynamic_vertical_count: engineRun.value.approved_dynamic_vertical_count,
    indexes_computed: 0,
    run_fingerprint: engineRun.value.run_fingerprint,
    publication_eligible: engineRun.value.publication_eligible,
    production_eligible: engineRun.value.production_eligible,
    mutation_performed: engineRun.value.mutation_performed
  },
  raw_quarantine: {
    registry_status: quarantineReport.index.status,
    policy_id: quarantinePolicy.id,
    current_report_id: quarantineReport.value.id,
    input_record_count: quarantineReport.value.input_record_count,
    quarantined_record_count: quarantineReport.value.quarantined_record_count,
    admitted_record_count: quarantineReport.value.admitted_record_count,
    reason_counts: quarantineReport.value.reason_counts,
    index_eligible_quarantined_records: quarantineReport.value.index_eligible_quarantined_records,
    direct_portal_projection: quarantinePolicy.direct_portal_projection,
    production_eligible: quarantineReport.value.production_eligible
  },
  universe: {
    universe_id: universe.value.id,
    status: universe.value.status,
    object_count: universe.value.object_count,
    object_count_status: universe.value.object_count_status,
    contract_fixture_records_included: false
  },
  core_domains: {
    set_id: coreDomain.value.id,
    count: coreDomain.value.domain_count,
    role: "PROVIDER_FACING_INTERFACE_NOT_PERMANENT_MARKET_VERTICALS"
  },
  dynamic_verticals: {
    registry_status: dynamicVertical.index.status,
    approved_count: dynamicVertical.index.approved_vertical_count,
    emerging_count: dynamicVertical.index.emerging_vertical_count,
    fixture_discovered_count: engineRun.value.discovered_cluster_count,
    fixture_discoveries_public: false
  },
  indexes: {
    vertical_intelligence: {
      definition_id: verticalIndex.id,
      status: "NOT_COMPUTED",
      target_constituents_minimum: verticalIndex.minimum_publishable_constituents
    },
    kidult_500: {
      definition_id: kidult500.id,
      status: "NOT_COMPUTED",
      target_constituents: kidult500.target_constituents,
      fixed_core_domain_quota: kidult500.fixed_core_domain_quota
    },
    kidult_100: {
      definition_id: kidult100.id,
      status: "NOT_COMPUTED",
      target_constituents: kidult100.target_constituents,
      fixed_core_domain_quota: kidult100.fixed_core_domain_quota
    }
  },
  track_states: {
    A: trackState(track, "A"),
    B: trackState(track, "B"),
    C: trackState(track, "C"),
    D: trackState(track, "D"),
    E: trackState(track, "E")
  },
  snapshot: {
    baseline_id: snapshot.current_baseline_snapshot_id,
    baseline_status: baseline.status,
    candidate_id: snapshot.current_candidate_snapshot_id,
    candidate_status: candidate?.status ?? "WAITING",
    candidate_class: candidate?.governance_classification ?? "NOT_AVAILABLE",
    candidate_publication_eligible: candidate?.publication_eligible ?? false,
    published_id: snapshot.current_published_snapshot_id,
    published_status: snapshot.current_published_snapshot_id ? "CURRENT" : "NOT_AVAILABLE"
  },
  evidence: {
    current_package_id: evidence.current_evidence_package_id,
    status: evidence.status
  },
  assessment: {
    current_id: assessmentIndex.current_assessment_id,
    current_snapshot_id: assessmentIndex.current_snapshot_id,
    status: assessmentIndex.status,
    gate_state: assessment?.gate_state ?? "WAITING",
    recommendation: assessment?.recommendation ?? "WAITING",
    overall_rankability: assessment?.overall_rankability ?? false,
    publication_eligible: assessment?.publication_eligible ?? false
  },
  provider: {
    registry_status: provider.status,
    current_record_id: provider.current_record_id,
    connection_state: provider.records[0]?.status ?? "NOT_REGISTERED",
    mapping_contract_id: providerMapping.value.id,
    role: providerMapping.value.provider_role,
    production_connection: "PROHIBITED",
    direct_portal_path: providerMapping.value.direct_provider_to_portal
  },
  runtime: {
    current_id: runtime.current_runtime_id,
    status: runtime.status,
    production_input_state: runtime.production_input_state,
    digitalocean_audit_id: digitalOcean.id,
    digitalocean_state: digitalOcean.status,
    public_health_state: digitalOcean.health_state,
    last_observed_at: digitalOcean.last_observed_at,
    evidence_artifact_id: digitalOcean.evidence_artifact_id ?? null,
    production_connection: digitalOcean.production_connection_authorized
  },
  release: {
    current_id: release.current_release_id,
    status: release.status,
    production_decision: release.production_decision_state,
    rollback_target_id: release.current_rollback_target_id
  },
  versions: {
    methodology: candidate?.methodology_version ?? "NOT_REGISTERED",
    evidence_lineage: candidate?.evidence_lineage_version ?? "NOT_REGISTERED",
    portal_contract: candidate?.portal_contract_version ?? "v502-rc1",
    registry_system: catalog.registry_system_version,
    catalog_revision: catalog.catalog_revision ?? catalog.registry_system_version,
    engine_registry: engineRun.index.registry_version,
    raw_quarantine_registry: quarantineReport.index.registry_version
  },
  publication: {
    public_index_projection: "NOT_AVAILABLE",
    candidate_publication: "PROHIBITED",
    provider_publication: "PROHIBITED",
    fixture_publication: "PROHIBITED",
    production: release.status
  },
  generated_at: generatedAt
};

if (writeMode) {
  fs.writeFileSync(outputPath, `${JSON.stringify(projection, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, outputPath)}`);
  process.exit(0);
}

if (!existing || JSON.stringify(comparable(existing)) !== JSON.stringify(comparable(projection))) {
  console.error("AGCI-OS Projection is stale. Run:");
  console.error("node scripts/kidults/projection/build-agci-os-projection.mjs --write");
  process.exit(1);
}

console.log("AGCI-OS Projection Engine: PASS");
console.log(`Projection: ${projection.id}`);
console.log(`Registry system: ${projection.source_registry_system_version}`);
console.log(`Catalog revision: ${projection.source_catalog_revision}`);
console.log(`Autonomous first: ${projection.autonomous.first_value}`);
console.log(`Engine v2: ${projection.engine_v2.status}`);
console.log(`Quarantined: ${projection.raw_quarantine.quarantined_record_count}`);
console.log(`Candidate: ${projection.snapshot.candidate_id ?? "NONE"}`);
console.log(`Assessment: ${projection.assessment.current_id ?? "NONE"}`);
console.log(`KIDULT 500: ${projection.indexes.kidult_500.status}`);
console.log(`KIDULT 100: ${projection.indexes.kidult_100.status}`);
console.log(`Production: ${projection.publication.production}`);
