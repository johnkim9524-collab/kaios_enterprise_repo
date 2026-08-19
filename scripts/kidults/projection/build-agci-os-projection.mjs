import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const registryRoot = path.join(root, "coordination", "kidults", "registry");
const outputPath = path.join(registryRoot, "projection", "records", "projection-agci-os-current-v1.json");

function read(relative) {
  return JSON.parse(fs.readFileSync(path.join(registryRoot, relative), "utf8"));
}

function readRoot(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
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
const memoryPolicy = record("memory", "memory-policy-v1").value;
const memoryRun = record("memory", "memory-foundation-run-r1");
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
const milestone = read("milestone/index.json");
const mission = read("mission/index.json");
const blocker = read("blocker/index.json");
const decision = read("decision/index.json");
const marketFunnelAlignment = readRoot("coordination/kidults/architecture/platform-market-funnel-alignment-v1.json");

const criticalBlockers = blocker.records
  .filter(item => item.status === "OPEN" && item.severity === "CRITICAL")
  .map(item => item.id);
const highBlockers = blocker.records
  .filter(item => item.status === "OPEN" && item.severity === "HIGH")
  .map(item => item.id);

const projection = {
  id: "projection-agci-os-current-v1",
  record_type: "agci_os_projection",
  version: "1.4.0",
  status: "INTERNAL_CURRENT",
  created_at: createdAt,
  created_by: "Track C / Projection Engine",
  approved_by: null,
  projection_id: "AGCI-OS-PROJECTION-001",
  projection_contract_version: "agci-os-projection-v1.4",
  source_registry_system_version: catalog.registry_system_version,
  source_catalog_revision: catalog.catalog_revision ?? catalog.registry_system_version,
  program_status: "ACTIVE",
  semantic_freshness: {
    status: "CURRENT_CANONICAL_BASELINE",
    policy_baseline: "coordination/kidults/kpmo/policy-platform-alignment-baseline-v1.md",
    track_registry_version: track.registry_version,
    blocker_registry_version: blocker.registry_version,
    snapshot_registry_version: snapshot.registry_version,
    evidence_registry_version: evidence.registry_version,
    assessment_registry_version: assessmentIndex.registry_version,
    generated_from_current_registry_pointers: true,
    stale_structural_candidate_is_current: false
  },
  market_funnel_alignment: {
    contract: "coordination/kidults/architecture/platform-market-funnel-alignment-v1.json",
    platform_layers: marketFunnelAlignment.truth_boundary.logical_platform_layer_count,
    logical_engines: marketFunnelAlignment.truth_boundary.logical_platform_engine_count,
    asi_logical_engines: marketFunnelAlignment.truth_boundary.asi_logical_engine_count,
    asi_execution_fleets: marketFunnelAlignment.truth_boundary.asi_execution_fleet_contract_count,
    repository_canonical_architecture_and_integration_boundary_alignment_percent: marketFunnelAlignment.truth_boundary.repository_canonical_architecture_and_integration_boundary_alignment_percent,
    asi_shadow_runtime_foundation_code_wired: marketFunnelAlignment.truth_boundary.asi_shadow_runtime_foundation_code_wired,
    full_52_engine_runtime_implementation_verified: marketFunnelAlignment.truth_boundary.full_52_engine_runtime_implementation_verified,
    deployed_operational_alignment_percent: marketFunnelAlignment.truth_boundary.deployed_operational_alignment_percent,
    runtime_state: "TWENTY_FIVE_DETERMINISTIC_SHADOW_PROCESSORS_AND_QUEUE_TRANSPORT_CODE_WIRED_NOT_DEPLOYED",
    global_pool_r1_frontier_contract: marketFunnelAlignment.source_universe.global_pool_r1_frontier_contract,
    derived_global_frontier_work_cells: marketFunnelAlignment.source_universe.derived_scope_role_region_language_work_cell_count,
    registered_endpoint_bootstrap_records: marketFunnelAlignment.source_universe.registered_endpoint_bootstrap_records,
    registered_endpoint_bootstrap_canonical_hosts: marketFunnelAlignment.source_universe.registered_endpoint_bootstrap_canonical_hosts,
    bootstrap_source_discovery_requested_events: marketFunnelAlignment.source_universe.bootstrap_source_discovery_requested_events,
    source_pool_eligible_count: marketFunnelAlignment.source_universe.source_pool_eligible_count,
    source_pools_ready: marketFunnelAlignment.truth_boundary.source_pools_ready,
    market_indexes_computed: marketFunnelAlignment.truth_boundary.market_indexes_computed,
    publication_eligible: false,
    production: marketFunnelAlignment.production
  },
  autonomous: {
    first_value: autonomous.value.first_value,
    operating_contract_id: autonomous.value.id,
    engine_contract_id: engineContract.id,
    routine_loop_state: "MEMORY_FOUNDATION_PASS_NOT_LIVE",
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
  memory: {
    registry_status: memoryRun.index.status,
    policy_id: memoryPolicy.id,
    current_run_id: memoryRun.value.id,
    status: memoryRun.value.status,
    run_mode: memoryRun.value.run_mode,
    storage_model: memoryRun.value.storage_model,
    deterministic_replay: memoryRun.value.deterministic_replay,
    input_entry_count: memoryRun.value.input_entry_count,
    admitted_entry_count: memoryRun.value.admitted_entry_count,
    quarantined_entry_count: memoryRun.value.quarantined_entry_count,
    review_required_count: memoryRun.value.review_required_count,
    supersession_chain_count: memoryRun.value.supersession_chain_count,
    replay_snapshot_count: memoryRun.value.replay_snapshot_count,
    memory_type_count: memoryRun.value.memory_type_count,
    provenance_coverage: memoryRun.value.provenance_coverage,
    rights_coverage: memoryRun.value.rights_coverage,
    bitemporal_coverage: memoryRun.value.bitemporal_coverage,
    latest_replay_id: memoryRun.value.latest_replay_id,
    latest_replay_fingerprint: memoryRun.value.latest_replay_fingerprint,
    append_only: memoryPolicy.correction_model.in_place_overwrite === false,
    in_place_correction: memoryPolicy.correction_model.in_place_overwrite,
    direct_memory_to_portal: memoryPolicy.direct_memory_to_portal,
    direct_memory_to_index: memoryPolicy.direct_memory_to_index,
    fixture_entries_in_global_universe: memoryRun.value.fixture_entries_in_global_universe,
    public_projection: memoryRun.value.public_projection,
    indexes_computed: memoryRun.value.indexes_computed,
    production_eligible: memoryRun.value.production_eligible,
    run_fingerprint: memoryRun.value.run_fingerprint
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
  control_tower_state: {
    program_phase: "PHASE_3_FAST_IMPROVEMENT_BEFORE_REAL_POC",
    current_milestone_id: milestone.current_record_id,
    mission_states: Object.fromEntries(mission.records.map(item => [item.id,item.status])),
    critical_blocker_ids: criticalBlockers,
    high_blocker_ids: highBlockers,
    open_decision_count: decision.records.filter(item => ["OPEN","PENDING","PROPOSED"].includes(item.status)).length
  },
  snapshot: {
    baseline_id: snapshot.current_baseline_snapshot_id,
    baseline_status: baseline.status,
    candidate_id: snapshot.current_candidate_snapshot_id,
    candidate_status: candidate?.status ?? "WAITING_FOR_NEW_BOUNDED_POC_CANDIDATE",
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
    gate_state: assessment?.gate_state ?? "WAITING_FOR_EXACT_IMMUTABLE_PACKAGE",
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
    methodology: candidate?.methodology_version ?? "NOT_REGISTERED_FOR_CURRENT_CANDIDATE",
    evidence_lineage: candidate?.evidence_lineage_version ?? "NOT_REGISTERED_FOR_CURRENT_CANDIDATE",
    portal_contract: candidate?.portal_contract_version ?? "v502-rc1",
    registry_system: catalog.registry_system_version,
    catalog_revision: catalog.catalog_revision ?? catalog.registry_system_version,
    engine_registry: engineRun.index.registry_version,
    memory_registry: memoryRun.index.registry_version,
    raw_quarantine_registry: quarantineReport.index.registry_version,
    market_funnel_alignment: marketFunnelAlignment.version
  },
  publication: {
    public_index_projection: "NOT_AVAILABLE",
    candidate_publication: "PROHIBITED",
    provider_publication: "PROHIBITED",
    fixture_publication: "PROHIBITED",
    memory_fixture_publication: "PROHIBITED",
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
console.log(`Semantic freshness: ${projection.semantic_freshness.status}`);
console.log(`Track Registry: ${projection.semantic_freshness.track_registry_version}`);
console.log(`Blocker Registry: ${projection.semantic_freshness.blocker_registry_version}`);
console.log(`Critical blockers: ${projection.control_tower_state.critical_blocker_ids.length}`);
console.log(`High blockers: ${projection.control_tower_state.high_blocker_ids.length}`);
console.log(`Candidate: ${projection.snapshot.candidate_id ?? "NONE"}`);
console.log(`Assessment: ${projection.assessment.current_id ?? "NONE"}`);
console.log(`KIDULT 500: ${projection.indexes.kidult_500.status}`);
console.log(`KIDULT 100: ${projection.indexes.kidult_100.status}`);
console.log(`Production: ${projection.publication.production}`);
