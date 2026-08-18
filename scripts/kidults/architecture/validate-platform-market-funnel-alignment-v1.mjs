#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "../../..");
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const readText = relative => fs.readFileSync(path.join(root, relative), "utf8");
const unique = values => new Set(values).size === values.length;
const sameSet = (left, right) => left.length === right.length && unique(left) && unique(right) && left.every(value => right.includes(value));
const clone = value => structuredClone(value);

const paths = {
  alignment: "coordination/kidults/architecture/platform-market-funnel-alignment-v1.json",
  strategy: "coordination/kidults/strategy/agci-os-total-program-strategy-reset-v2.json",
  program: "coordination/kidults/source-intelligence/autonomous-source-intelligence-program-v1.json",
  valueScope: "coordination/kidults/data-scope/value-to-data-scope-contract-v1.json",
  mesh: "coordination/kidults/source-intelligence/asi-market-funnel-engine-mesh-v1.json",
  digitalOcean: "coordination/kidults/runtime/digitalocean-irreplaceable-value-runtime-foundation-v1.json",
  dos: "coordination/kidults/dos/decision-operating-system-contract-v1.json",
  scopeCrosswalk: "coordination/kidults/source-intelligence/scope-registry-v1-to-v2-crosswalk-v1.json",
  globalSourceUniverse: "coordination/kidults/source-intelligence/asi-global-source-universe-v1.json",
  admissionPolicy: "coordination/kidults/source-intelligence/asi-purpose-specific-admission-policy-v1.json",
  queueContract: "coordination/kidults/source-intelligence/asi-queue-and-partition-contract-v1.json",
  collectionScopeRegistry: "coordination/kidults/data-scope/collection-scope-registry-v1.json",
  projection: "coordination/kidults/registry/projection/index.json",
  projectionRecord: "coordination/kidults/registry/projection/records/projection-agci-os-current-v1.json",
  portalRegistryView: "apps/kidults-enterprise-staging/public/portal/data/registry-view.json",
  controlTower: "coordination/kidults/registry/digital-twin/index.json",
  controlTowerRecord: "coordination/kidults/registry/digital-twin/records/twin-current-program-state-v1.json",
  categoryScale: "coordination/kidults/data-scope/category-adaptive-scale-floor-contract-v2.json",
  sourcePoolWorkflow: ".github/workflows/kidults-agci-os-source-pool-foundation.yml",
  wrangler: "services/kidults-autonomous-intelligence/wrangler.jsonc",
  fleetRegistry: "services/kidults-autonomous-intelligence/src/asi/registry.ts",
  eventRuntime: "services/kidults-autonomous-intelligence/src/asi/runtime.ts",
  httpSecurity: "services/kidults-autonomous-intelligence/src/http-security.ts",
  worker: "services/kidults-autonomous-intelligence/src/worker.ts",
  ingest: "services/kidults-autonomous-intelligence/src/index.ts",
  migration: "services/kidults-autonomous-intelligence/migrations/0003_asi_market_funnel_shadow.sql",
  runtimePreflight: "services/kidults-autonomous-intelligence/scripts/deploy-preflight.mjs",
  runtimePackage: "services/kidults-autonomous-intelligence/package.json",
  engineContract: "coordination/kidults/registry/engine/records/engine-agci-os-v2-contract-v1.json",
  architectureDoc: "coordination/kidults/architecture/autonomous-global-collectibles-intelligence-os-v3.1.md"
};

const alignment = read(paths.alignment);
const strategy = read(paths.strategy);
const program = read(paths.program);
const valueScope = read(paths.valueScope);
const mesh = read(paths.mesh);
const digitalOcean = read(paths.digitalOcean);
const dos = read(paths.dos);
const scopeCrosswalk = read(paths.scopeCrosswalk);
const globalSourceUniverse = read(paths.globalSourceUniverse);
const admissionPolicy = read(paths.admissionPolicy);
const queueContract = read(paths.queueContract);
const collectionScopeRegistry = read(paths.collectionScopeRegistry);
const projection = read(paths.projection);
const controlTower = read(paths.controlTower);
const projectionRecord = read(paths.projectionRecord);
const portalRegistryView = read(paths.portalRegistryView);
const controlTowerRecord = read(paths.controlTowerRecord);
const engineContract = read(paths.engineContract);
const architectureDoc = readText(paths.architectureDoc);

function collectErrors(a = alignment, s = strategy, p = program, v = valueScope, m = mesh, d = digitalOcean, o = dos) {
  const errors = [];
  const assert = (condition, message) => { if (!condition) errors.push(message); };

  const layers = a.platform_layers ?? [];
  const layerIds = layers.map(layer => layer.layer_id);
  const engines = layers.flatMap(layer => layer.engine_ids ?? []);
  const asiLayer = layers.find(layer => layer.layer_id === "AUTONOMOUS_SOURCE_INTELLIGENCE");
  const asiEngines = asiLayer?.engine_ids ?? [];
  const stageBindings = a.funnel_stage_bindings ?? [];
  const stageEngines = stageBindings.flatMap(stage => stage.engine_ids ?? []);
  const crosswalk = a.asi_logical_to_execution_fleets ?? [];
  const crosswalkLogical = crosswalk.map(item => item.logical_engine_id);
  const crosswalkFleets = crosswalk.flatMap(item => item.execution_fleet_ids ?? []);
  const meshAsiStages = m.asi_funnel?.stages ?? [];
  const meshFleetEntries = meshAsiStages.flatMap(stage => (stage.engine_fleets ?? []).map(fleetId => ({ stageId: stage.stage_id, fleetId })));
  const meshFleets = meshFleetEntries.map(item => item.fleetId);
  const meshDownstreamStages = m.downstream_market_funnel?.stages ?? [];
  const meshDownstream = meshDownstreamStages.flatMap(stage => stage.engine_roles ?? []);
  const programEngines = (p.source_intelligence_engines ?? []).map(item => item.engine);
  const canonicalSourceRoles = a.source_role_taxonomy?.canonical_roles ?? [];
  const strategyLayers = s.platform_layers ?? [];
  const strategyEngines = strategyLayers.flatMap(layer => layer.engines ?? []);

  assert(a.id === "kidults-platform-market-funnel-alignment-v1", "ALIGNMENT_ID_MISMATCH");
  assert(a.status === "APPROVED_ACTIVE_CANONICAL_ARCHITECTURE_AND_INTEGRATION_BOUNDARIES_ALIGNED", "ALIGNMENT_STATUS_MISMATCH");
  assert(layers.length === 9 && unique(layerIds), "PLATFORM_LAYER_COUNT_OR_UNIQUENESS_MISMATCH");
  assert(layers.every((layer, index) => layer.sequence === index + 1), "PLATFORM_LAYER_SEQUENCE_MISMATCH");
  assert(engines.length === 52 && unique(engines), "PLATFORM_ENGINE_COUNT_OR_UNIQUENESS_MISMATCH");
  assert(a.truth_boundary?.logical_platform_layer_count === 9, "DECLARED_LAYER_COUNT_MISMATCH");
  assert(a.truth_boundary?.logical_platform_engine_count === 52, "DECLARED_ENGINE_COUNT_MISMATCH");
  assert(a.truth_boundary?.repository_canonical_architecture_and_integration_boundary_alignment_verified === true, "REPOSITORY_BOUNDARY_ALIGNMENT_MUST_BE_VERIFIED");
  assert(a.truth_boundary?.repository_canonical_architecture_and_integration_boundary_alignment_percent === 100, "REPOSITORY_BOUNDARY_ALIGNMENT_PERCENT_MUST_BE_100");
  assert(a.truth_boundary?.asi_shadow_runtime_foundation_code_wired === true, "ASI_SHADOW_RUNTIME_FOUNDATION_MUST_BE_CODE_WIRED");
  assert(a.truth_boundary?.full_52_engine_runtime_implementation_verified === false && a.truth_boundary?.full_52_engine_runtime_implementation_percent === null, "FULL_52_ENGINE_RUNTIME_IMPLEMENTATION_MUST_NOT_BE_CLAIMED");
  assert(a.truth_boundary?.durable_runtime_deployed === false, "DURABLE_RUNTIME_MUST_NOT_BE_CLAIMED_DEPLOYED");
  assert(a.truth_boundary?.deployed_operational_alignment_percent === 0, "DEPLOYED_OPERATIONAL_ALIGNMENT_MUST_REMAIN_ZERO");
  assert(a.truth_boundary?.deployment_verification_state === "NOT_DEPLOYED_NOT_CLAIMED", "DEPLOYMENT_TRUTH_BOUNDARY_MISMATCH");
  assert(a.truth_boundary?.production === "HOLD" && a.production === "HOLD", "ALIGNMENT_PRODUCTION_MUST_HOLD");
  assert(a.source_universe?.mode === "CONTINUOUS_OPEN_ENDED_GLOBAL_OPEN_MARKET_ENUMERATION", "SOURCE_UNIVERSE_MODE_MISMATCH");
  assert(a.source_universe?.numeric_site_completion_target === null, "SOURCE_UNIVERSE_NUMERIC_TARGET_MUST_BE_NULL");

  assert(strategyLayers.length === 9, "STRATEGY_LAYER_COUNT_MISMATCH");
  for (const layer of layers) {
    const strategyLayer = strategyLayers.find(item => item.layer === layer.layer_id);
    assert(Boolean(strategyLayer), `STRATEGY_LAYER_MISSING:${layer.layer_id}`);
    assert(sameSet(strategyLayer?.engines ?? [], layer.engine_ids), `STRATEGY_ENGINE_SET_DRIFT:${layer.layer_id}`);
  }
  assert(strategyEngines.length === 52 && unique(strategyEngines), "STRATEGY_52_ENGINE_TAXONOMY_INVALID");
  assert(s.platform_market_funnel_alignment?.contract === paths.alignment, "STRATEGY_ALIGNMENT_REFERENCE_MISSING");
  assert(s.platform_market_funnel_alignment?.runtime_alignment_state === "CANONICAL_BOUNDARIES_VERIFIED_ASI_SHADOW_FOUNDATION_CODE_WIRED_NOT_DEPLOYED", "STRATEGY_RUNTIME_ALIGNMENT_STATE_MISMATCH");
  assert(s.platform_market_funnel_alignment?.repository_canonical_architecture_and_integration_boundary_alignment_percent === 100, "STRATEGY_REPOSITORY_ALIGNMENT_PERCENT_MISMATCH");
  assert(s.platform_market_funnel_alignment?.deployment_alignment_percent === 0, "STRATEGY_DEPLOYMENT_ALIGNMENT_MUST_REMAIN_ZERO");

  assert(asiEngines.length === 11 && unique(asiEngines), "ASI_LOGICAL_ENGINE_COUNT_OR_UNIQUENESS_MISMATCH");
  assert(sameSet(programEngines, asiEngines), "ASI_PROGRAM_LOGICAL_ENGINE_SET_DRIFT");
  assert(sameSet(v.autonomous_source_intelligence_engines ?? [], asiEngines), "VALUE_SCOPE_ASI_ENGINE_SET_DRIFT");
  assert(!programEngines.includes("SOURCE_COST_AND_ROI_ENGINE"), "DEPRECATED_SOURCE_COST_AND_ROI_ALIAS_ACTIVE_IN_PROGRAM");
  assert(!strategyEngines.includes("SOURCE_COST_AND_ROI_ENGINE"), "DEPRECATED_SOURCE_COST_AND_ROI_ALIAS_ACTIVE_IN_STRATEGY");
  assert(!(v.autonomous_source_intelligence_engines ?? []).includes("SOURCE_COST_AND_ROI_ENGINE"), "DEPRECATED_SOURCE_COST_AND_ROI_ALIAS_ACTIVE_IN_VALUE_SCOPE");
  assert(p.platform_market_funnel_alignment_contract === paths.alignment, "ASI_PROGRAM_ALIGNMENT_REFERENCE_MISSING");
  assert(p.canonical_engine_taxonomy?.platform_alignment_contract === paths.alignment, "ASI_TAXONOMY_ALIGNMENT_REFERENCE_MISSING");
  assert(v.platform_market_funnel_alignment_contract === paths.alignment, "VALUE_SCOPE_ALIGNMENT_REFERENCE_MISSING");
  assert(canonicalSourceRoles.length === 10 && unique(canonicalSourceRoles), "CANONICAL_SOURCE_ROLE_TAXONOMY_INVALID");
  assert(sameSet(p.source_roles ?? [],canonicalSourceRoles), "ASI_PROGRAM_SOURCE_ROLE_TAXONOMY_DRIFT");
  assert(sameSet(v.source_role_taxonomy ?? [],canonicalSourceRoles), "VALUE_SCOPE_SOURCE_ROLE_TAXONOMY_DRIFT");

  assert(crosswalk.length === 11 && unique(crosswalkLogical), "ASI_CROSSWALK_LOGICAL_COUNT_OR_UNIQUENESS_MISMATCH");
  assert(sameSet(crosswalkLogical, asiEngines), "ASI_CROSSWALK_LOGICAL_ENGINE_SET_DRIFT");
  assert(crosswalkFleets.length === 25 && unique(crosswalkFleets), "ASI_CROSSWALK_FLEET_COUNT_OR_UNIQUENESS_MISMATCH");
  assert(meshFleets.length === 25 && unique(meshFleets), "MESH_FLEET_COUNT_OR_UNIQUENESS_MISMATCH");
  assert(sameSet(crosswalkFleets, meshFleets), "ASI_CROSSWALK_AND_MESH_FLEET_SET_DRIFT");
  for (const mapping of crosswalk) {
    for (const fleetId of mapping.execution_fleet_ids ?? []) {
      const meshEntry = meshFleetEntries.find(item => item.fleetId === fleetId);
      assert(meshEntry?.stageId === mapping.stage_id, `ASI_FLEET_STAGE_DRIFT:${fleetId}`);
    }
  }
  assert(m.platform_market_funnel_alignment_contract === paths.alignment, "MESH_ALIGNMENT_REFERENCE_MISSING");
  assert(m.platform_alignment?.canonical_layer_count === 9, "MESH_LAYER_COUNT_REFERENCE_MISMATCH");
  assert(m.platform_alignment?.canonical_logical_engine_count === 52, "MESH_ENGINE_COUNT_REFERENCE_MISMATCH");
  assert(m.platform_alignment?.canonical_asi_logical_engine_count === 11, "MESH_ASI_LOGICAL_COUNT_REFERENCE_MISMATCH");
  assert(m.platform_alignment?.asi_execution_fleet_contract_count === 25, "MESH_ASI_FLEET_COUNT_REFERENCE_MISMATCH");
  assert(m.platform_alignment?.logical_engine_and_execution_fleet_counts_are_additive === false, "MESH_LOGICAL_AND_FLEET_COUNTS_MUST_NOT_BE_ADDITIVE");

  assert(stageBindings.length === 12 && stageBindings.every((stage, index) => stage.sequence === index + 1), "FUNNEL_STAGE_BINDING_SEQUENCE_MISMATCH");
  assert(stageEngines.length === 52 && unique(stageEngines), "EVERY_PLATFORM_ENGINE_MUST_BIND_TO_EXACTLY_ONE_STAGE");
  assert(sameSet(stageEngines, engines), "FUNNEL_STAGE_ENGINE_SET_DRIFT");
  for (const stage of stageBindings) {
    const declaredForLayers = stage.layer_ids.flatMap(layerId => layers.find(layer => layer.layer_id === layerId)?.engine_ids ?? []);
    assert(stage.engine_ids.every(engineId => declaredForLayers.includes(engineId)), `FUNNEL_STAGE_LAYER_OWNERSHIP_DRIFT:${stage.stage_id}`);
  }

  const embeddedLayers = ["DATA_ACQUISITION_AND_CONTROL", "CANONICAL_TRUTH_AND_MEMORY", "EVIDENCE_AND_MARKET_GRAPH", "INTELLIGENCE_PRODUCTS_AND_INDEX"];
  const expectedEmbeddedDownstream = embeddedLayers.flatMap(layerId => layers.find(layer => layer.layer_id === layerId)?.engine_ids ?? []);
  assert(meshDownstream.length === 23 && unique(meshDownstream), "MESH_EMBEDDED_DOWNSTREAM_COUNT_OR_UNIQUENESS_MISMATCH");
  assert(sameSet(meshDownstream, expectedEmbeddedDownstream), "MESH_EMBEDDED_DOWNSTREAM_ENGINE_SET_DRIFT");
  for (const stageId of ["F4_RIGHTS_AWARE_COLLECTION_AND_CONTROL","F5A_CANONICAL_TRUTH_AND_MEMORY","F5B_EVIDENCE_AND_MARKET_GRAPH","F6_IRREPLACEABLE_MARKET_INTELLIGENCE"]) {
    const canonicalStage = stageBindings.find(stage => stage.stage_id === stageId);
    const meshStage = meshDownstreamStages.find(stage => stage.stage_id === stageId);
    assert(Boolean(meshStage), `MESH_DOWNSTREAM_STAGE_MISSING:${stageId}`);
    assert(sameSet(meshStage?.engine_roles ?? [], canonicalStage?.engine_ids ?? []), `MESH_DOWNSTREAM_STAGE_ENGINE_DRIFT:${stageId}`);
  }
  assert(meshDownstreamStages.length === 4 && unique(meshDownstreamStages.map(stage => stage.stage_id)), "MESH_DOWNSTREAM_STAGE_COUNT_OR_UNIQUENESS_MISMATCH");
  assert(sameSet(m.external_platform_handoffs?.value_and_scope_ingress?.stage_ids ?? [], ["P0_VALUE_DIRECTION","P1_SCOPE_COMPILATION"]), "MESH_INGRESS_STAGE_ID_DRIFT");
  assert(m.external_platform_handoffs?.provider_fusion?.stage_id === "F5C_PROVIDER_FUSION", "MESH_PROVIDER_STAGE_ID_DRIFT");
  assert(sameSet(m.external_platform_handoffs?.track_b_independent_validation?.input_stage_ids ?? [], ["F5B_EVIDENCE_AND_MARKET_GRAPH","F5C_PROVIDER_FUSION"]), "MESH_TRACK_B_INPUT_STAGE_DRIFT");
  assert(m.external_platform_handoffs?.track_b_independent_validation?.handoff_to === "F6_IRREPLACEABLE_MARKET_INTELLIGENCE", "MESH_TRACK_B_HANDOFF_STAGE_DRIFT");
  assert(m.external_platform_handoffs?.projection_and_control_tower?.stage_id === "F7_GOVERNED_PROJECTION_AND_EXPERIENCE", "MESH_PROJECTION_STAGE_ID_DRIFT");

  const ingressEngines = ["AUTONOMOUS_VALUE_INTELLIGENCE", "COLLECTION_SCOPE_INTELLIGENCE"].flatMap(layerId => layers.find(layer => layer.layer_id === layerId)?.engine_ids ?? []);
  const providerEngines = layers.find(layer => layer.layer_id === "PROVIDER_FUSION")?.engine_ids ?? [];
  const projectionEngines = layers.find(layer => layer.layer_id === "PROJECTION_AND_EXPERIENCE")?.engine_ids ?? [];
  assert(sameSet(m.external_platform_handoffs?.value_and_scope_ingress?.engine_ids ?? [], ingressEngines), "MESH_VALUE_SCOPE_INGRESS_SET_DRIFT");
  assert(sameSet(m.external_platform_handoffs?.provider_fusion?.engine_ids ?? [], providerEngines), "MESH_PROVIDER_FUSION_SET_DRIFT");
  assert(m.external_platform_handoffs?.provider_fusion?.provider_required === false, "PROVIDER_MUST_REMAIN_OPTIONAL");
  assert(m.external_platform_handoffs?.provider_fusion?.direct_to_index_allowed === false, "DIRECT_PROVIDER_TO_INDEX_MUST_BE_FALSE");
  assert(m.external_platform_handoffs?.provider_fusion?.direct_to_projection_allowed === false, "DIRECT_PROVIDER_TO_PROJECTION_MUST_BE_FALSE");
  assert(sameSet(m.external_platform_handoffs?.projection_and_control_tower?.engine_ids ?? [], projectionEngines), "MESH_PROJECTION_ENGINE_SET_DRIFT");
  assert(m.external_platform_handoffs?.projection_and_control_tower?.projection_only_consumption === true, "PROJECTION_ONLY_CONSUMPTION_REQUIRED");
  assert(m.external_platform_handoffs?.projection_and_control_tower?.may_create_market_truth === false, "PROJECTION_MUST_NOT_CREATE_MARKET_TRUTH");
  assert(m.external_platform_handoffs?.track_b_independent_validation?.engine_stage === false, "TRACK_B_MUST_NOT_BE_MODELED_AS_A_PLATFORM_ENGINE");
  assert(m.external_platform_handoffs?.track_b_independent_validation?.public_index_without_validation_allowed === false, "PUBLIC_INDEX_REQUIRES_TRACK_B_VALIDATION");

  const providerHandoff = a.governed_handoffs?.provider_fusion;
  const projectionHandoff = a.governed_handoffs?.projection_and_control_tower;
  assert(providerHandoff?.provider_is_required_for_platform_operation === false, "CANONICAL_PROVIDER_OPTIONALITY_MISMATCH");
  assert(providerHandoff?.direct_provider_to_index_allowed === false, "CANONICAL_DIRECT_PROVIDER_TO_INDEX_MUST_BE_FALSE");
  assert(providerHandoff?.direct_provider_to_projection_allowed === false, "CANONICAL_DIRECT_PROVIDER_TO_PROJECTION_MUST_BE_FALSE");
  assert(projectionHandoff?.projection_registry === paths.projection, "CANONICAL_PROJECTION_REGISTRY_REFERENCE_MISMATCH");
  assert(projectionHandoff?.executive_control_tower_registry === paths.controlTower, "CANONICAL_CONTROL_TOWER_REGISTRY_REFERENCE_MISMATCH");
  assert(projectionHandoff?.portal_reads_projection_only === true, "PORTAL_PROJECTION_ONLY_BOUNDARY_MISSING");
  assert(projectionHandoff?.executive_control_tower_reads_projection_only === true, "CONTROL_TOWER_PROJECTION_ONLY_BOUNDARY_MISSING");

  assert(d.platform_market_funnel_alignment?.contract === paths.alignment, "DIGITALOCEAN_ALIGNMENT_REFERENCE_MISSING");
  assert(d.platform_market_funnel_alignment?.canonical_logical_engine_count === 52, "DIGITALOCEAN_ENGINE_COUNT_REFERENCE_MISMATCH");
  assert(d.platform_market_funnel_alignment?.runtime_service_alignment_state === "CANONICAL_BOUNDARIES_VERIFIED_ASI_SHADOW_FOUNDATION_CODE_WIRED_NOT_DEPLOYED", "DIGITALOCEAN_RUNTIME_ALIGNMENT_STATE_MISMATCH");
  assert(d.platform_market_funnel_alignment?.repository_canonical_architecture_and_integration_boundary_alignment_percent === 100, "DIGITALOCEAN_REPOSITORY_ALIGNMENT_PERCENT_MISMATCH");
  assert(d.platform_market_funnel_alignment?.deployment_alignment_percent === 0, "DIGITALOCEAN_DEPLOYMENT_ALIGNMENT_MUST_REMAIN_ZERO");
  assert(d.production === "HOLD" && d.platform_market_funnel_alignment?.production === "HOLD", "DIGITALOCEAN_PRODUCTION_MUST_HOLD");
  assert(o.platform_market_funnel_alignment?.contract === paths.alignment, "DOS_ALIGNMENT_REFERENCE_MISSING");
  assert(o.platform_market_funnel_alignment?.canonical_logical_engine_count === 52, "DOS_ENGINE_COUNT_REFERENCE_MISMATCH");
  assert(o.platform_market_funnel_alignment?.runtime_alignment_state === "CANONICAL_BOUNDARIES_VERIFIED_ASI_SHADOW_FOUNDATION_CODE_WIRED_NOT_DEPLOYED", "DOS_RUNTIME_ALIGNMENT_STATE_MISMATCH");
  assert(o.platform_market_funnel_alignment?.repository_canonical_architecture_and_integration_boundary_alignment_percent === 100, "DOS_REPOSITORY_ALIGNMENT_PERCENT_MISMATCH");
  assert(o.platform_market_funnel_alignment?.deployment_alignment_percent === 0, "DOS_DEPLOYMENT_ALIGNMENT_MUST_REMAIN_ZERO");
  assert(o.boundaries?.production === "HOLD", "DOS_PRODUCTION_MUST_HOLD");

  return errors;
}

const errors = collectErrors();
const assert = (condition, message) => { if (!condition) errors.push(message); };

assert(scopeCrosswalk.coverage_expectations?.legacy_scope_count === 32, "SCOPE_CROSSWALK_LEGACY_COUNT_MISMATCH");
assert(scopeCrosswalk.coverage_expectations?.current_scope_count === 32, "SCOPE_CROSSWALK_CURRENT_COUNT_MISMATCH");
assert(scopeCrosswalk.coverage_expectations?.unmapped_legacy_records === 0, "SCOPE_CROSSWALK_HAS_UNMAPPED_LEGACY_RECORDS");
assert(scopeCrosswalk.coverage_expectations?.unmapped_current_targets === 0, "SCOPE_CROSSWALK_HAS_UNMAPPED_CURRENT_TARGETS");
const canonicalSourceRoles = alignment.source_role_taxonomy?.canonical_roles ?? [];
const coreSourceRoles = alignment.source_role_taxonomy?.core_required_roles ?? [];
const optionalSourceRoles = alignment.source_role_taxonomy?.optional_roles ?? [];
const globalSourceRoles = (globalSourceUniverse.required_source_roles ?? []).map(item => item.role);
assert(coreSourceRoles.length === 7 && unique(coreSourceRoles), "CORE_REQUIRED_SOURCE_ROLE_TAXONOMY_INVALID");
assert(optionalSourceRoles.length === 3 && unique(optionalSourceRoles), "OPTIONAL_SOURCE_ROLE_TAXONOMY_INVALID");
assert(sameSet([...coreSourceRoles,...optionalSourceRoles],canonicalSourceRoles), "CORE_OPTIONAL_SOURCE_ROLE_PARTITION_DRIFT");
assert(sameSet(globalSourceRoles,coreSourceRoles), "GLOBAL_SOURCE_UNIVERSE_REQUIRED_ROLE_DRIFT");
assert(sameSet(collectionScopeRegistry.common_contract?.required_source_roles ?? [],coreSourceRoles), "COLLECTION_SCOPE_REQUIRED_ROLE_DRIFT");
assert(sameSet(collectionScopeRegistry.common_contract?.preferred_source_roles ?? [],optionalSourceRoles), "COLLECTION_SCOPE_OPTIONAL_ROLE_DRIFT");
const legacyRoleCrosswalk = alignment.source_role_taxonomy?.legacy_alias_crosswalk ?? [];
assert(legacyRoleCrosswalk.length === 11 && unique(legacyRoleCrosswalk.map(item => item.legacy_role)), "LEGACY_SOURCE_ROLE_CROSSWALK_INVALID");
assert(legacyRoleCrosswalk.every(item => canonicalSourceRoles.includes(item.canonical_role)), "LEGACY_SOURCE_ROLE_CROSSWALK_TARGET_INVALID");
assert(projection.status?.startsWith("ACTIVE"), "PROJECTION_REGISTRY_NOT_ACTIVE");
assert(controlTower.status === "ACTIVE", "CONTROL_TOWER_REGISTRY_NOT_ACTIVE");
assert(projection.records?.find(item => item.id === projection.current_record_id)?.version === projectionRecord.version, "PROJECTION_CURRENT_RECORD_VERSION_DRIFT");
assert(projectionRecord.market_funnel_alignment?.contract === paths.alignment, "PROJECTION_ALIGNMENT_REFERENCE_MISSING");
assert(projectionRecord.market_funnel_alignment?.repository_canonical_architecture_and_integration_boundary_alignment_percent === 100, "PROJECTION_REPOSITORY_ALIGNMENT_PERCENT_MISMATCH");
assert(projectionRecord.market_funnel_alignment?.full_52_engine_runtime_implementation_verified === false, "PROJECTION_FULL_RUNTIME_IMPLEMENTATION_OVERCLAIM");
assert(projectionRecord.market_funnel_alignment?.deployed_operational_alignment_percent === 0, "PROJECTION_DEPLOYMENT_ALIGNMENT_MUST_REMAIN_ZERO");
assert(projectionRecord.market_funnel_alignment?.publication_eligible === false && projectionRecord.market_funnel_alignment?.production === "HOLD", "PROJECTION_PUBLICATION_BOUNDARY_MISMATCH");
assert(portalRegistryView.source_projection_id === projectionRecord.id, "PORTAL_PROJECTION_SOURCE_DRIFT");
assert(portalRegistryView.market_funnel_alignment?.contract === paths.alignment, "PORTAL_ALIGNMENT_REFERENCE_MISSING");
assert(portalRegistryView.market_funnel_alignment?.repository_canonical_architecture_and_integration_boundary_alignment_percent === 100, "PORTAL_REPOSITORY_ALIGNMENT_PERCENT_MISMATCH");
assert(portalRegistryView.market_funnel_alignment?.full_52_engine_runtime_implementation_verified === false, "PORTAL_FULL_RUNTIME_IMPLEMENTATION_OVERCLAIM");
assert(portalRegistryView.market_funnel_alignment?.deployed_operational_alignment_percent === 0, "PORTAL_DEPLOYMENT_ALIGNMENT_MUST_REMAIN_ZERO");
assert(controlTower.records?.find(item => item.id === controlTower.current_record_id)?.version === controlTowerRecord.version, "CONTROL_TOWER_CURRENT_RECORD_VERSION_DRIFT");
assert(controlTowerRecord.source_projection_id === projectionRecord.id && controlTowerRecord.source_projection_version === projectionRecord.version, "CONTROL_TOWER_PROJECTION_SOURCE_DRIFT");
assert(
  controlTowerRecord.generated_from?.length === 2 &&
  controlTowerRecord.generated_from.every(item => item.startsWith("coordination/kidults/registry/projection/")),
  "CONTROL_TOWER_MUST_CONSUME_PROJECTION_REGISTRY_ONLY"
);
assert(JSON.stringify(controlTowerRecord.track_states) === JSON.stringify(projectionRecord.track_states), "CONTROL_TOWER_TRACK_PROJECTION_DRIFT");
assert(JSON.stringify(controlTowerRecord.platform_market_funnel_alignment) === JSON.stringify(projectionRecord.market_funnel_alignment), "CONTROL_TOWER_ALIGNMENT_PROJECTION_DRIFT");
assert(controlTowerRecord.platform_market_funnel_alignment?.contract === paths.alignment, "CONTROL_TOWER_ALIGNMENT_REFERENCE_MISSING");
assert(controlTowerRecord.platform_market_funnel_alignment?.repository_canonical_architecture_and_integration_boundary_alignment_percent === 100, "CONTROL_TOWER_REPOSITORY_ALIGNMENT_PERCENT_MISMATCH");
assert(controlTowerRecord.platform_market_funnel_alignment?.full_52_engine_runtime_implementation_verified === false, "CONTROL_TOWER_FULL_RUNTIME_IMPLEMENTATION_OVERCLAIM");
assert(controlTowerRecord.platform_market_funnel_alignment?.deployed_operational_alignment_percent === 0, "CONTROL_TOWER_DEPLOYMENT_ALIGNMENT_MUST_REMAIN_ZERO");
assert(controlTowerRecord.platform_market_funnel_alignment?.production === "HOLD", "CONTROL_TOWER_PRODUCTION_MUST_HOLD");
assert(engineContract.market_funnel_alignment?.contract === paths.alignment, "ENGINE_CONTRACT_ALIGNMENT_REFERENCE_MISSING");
assert(engineContract.market_funnel_alignment?.repository_canonical_architecture_and_integration_boundary_alignment_percent === 100, "ENGINE_CONTRACT_REPOSITORY_ALIGNMENT_PERCENT_MISMATCH");
assert(engineContract.market_funnel_alignment?.full_52_engine_runtime_implementation_verified === false, "ENGINE_CONTRACT_FULL_RUNTIME_IMPLEMENTATION_OVERCLAIM");
assert(engineContract.market_funnel_alignment?.deployed_operational_alignment_percent === 0, "ENGINE_CONTRACT_DEPLOYMENT_ALIGNMENT_MUST_REMAIN_ZERO");
assert(engineContract.ordering_semantics?.required_stage_order_scope === "PER_EVENT_CAUSAL_CHAIN_ONLY", "ENGINE_CAUSAL_ORDER_SCOPE_MISMATCH");
assert(engineContract.ordering_semantics?.global_stage_barrier_allowed === false && engineContract.ordering_semantics?.synchronous_engine_to_engine_chain_allowed === false, "ENGINE_ANTI_BOTTLENECK_ORDERING_MISSING");
assert(architectureDoc.includes(paths.alignment) && architectureDoc.includes("Repository canonical-architecture and integration-boundary alignment is 100%"), "ARCHITECTURE_DOCUMENT_ALIGNMENT_MISSING");

const runtimeRefs = alignment.repository_runtime_binding ?? {};
assert(queueContract.status === "QUEUE_TRANSPORT_SCAFFOLD_CODE_WIRED_CONTROLS_AND_ENGINE_PROCESSORS_PENDING_NOT_DEPLOYED", "QUEUE_CONTRACT_RUNTIME_STATUS_MISMATCH");
assert(queueContract.runtime_implementation_state?.fleet_queue_transport_bindings_code_wired === 25, "QUEUE_CONTRACT_TRANSPORT_BINDING_COUNT_MISMATCH");
assert(queueContract.runtime_implementation_state?.engine_processors_implemented === 0, "QUEUE_CONTRACT_ENGINE_PROCESSOR_COUNT_MUST_REMAIN_ZERO");
assert(queueContract.runtime_implementation_state?.required_queue_controls_complete === false && queueContract.runtime_implementation_state?.deployed === false, "QUEUE_CONTRACT_MUST_NOT_CLAIM_COMPLETE_OR_DEPLOYED");
for (const [field, relative] of Object.entries({
  worker_entrypoint:paths.worker,
  http_security_helper:paths.httpSecurity,
  fleet_registry:paths.fleetRegistry,
  event_runtime:paths.eventRuntime,
  queue_configuration:paths.wrangler,
  durable_state_migration:paths.migration,
  runtime_preflight:paths.runtimePreflight,
})) {
  assert(runtimeRefs[field] === relative, `RUNTIME_BINDING_REFERENCE_MISMATCH:${field}`);
  assert(fs.existsSync(path.join(root,relative)), `RUNTIME_BINDING_FILE_MISSING:${relative}`);
}
assert(runtimeRefs.runtime_mode === "SHADOW", "RUNTIME_MODE_MUST_BE_SHADOW");
assert(runtimeRefs.generated_binding_types_output === "services/kidults-autonomous-intelligence/src/worker-configuration.d.ts", "GENERATED_BINDING_TYPES_OUTPUT_MISMATCH");
assert(runtimeRefs.generated_binding_types_command === "npm run types:generate" && runtimeRefs.generated_binding_types_committed === false, "GENERATED_BINDING_TYPES_MUST_BE_REPRODUCED_IN_CI_NOT_COMMITTED");
assert(runtimeRefs.fleet_queue_binding_count === 25, "RUNTIME_FLEET_QUEUE_BINDING_COUNT_MISMATCH");
assert(runtimeRefs.queue_transport_scaffold_code_wired === true, "RUNTIME_QUEUE_TRANSPORT_SCAFFOLD_MUST_BE_CODE_WIRED");
assert(runtimeRefs.engine_processor_implementation_count === 0, "RUNTIME_ENGINE_PROCESSOR_COUNT_MUST_REMAIN_ZERO_UNTIL_IMPLEMENTED");
assert(runtimeRefs.publication_enabled === false, "RUNTIME_PUBLICATION_MUST_BE_DISABLED");
assert(runtimeRefs.legacy_synchronous_collection_path_enabled === false, "LEGACY_SYNCHRONOUS_PATH_MUST_BE_DISABLED");
assert(runtimeRefs.deployment_performed === false, "DEPLOYMENT_MUST_NOT_BE_OVERCLAIMED");
assert(alignment.production_scale_target?.state === "DECLARED_NOT_IMPLEMENTED_NOT_DEPLOYED", "PRODUCTION_SCALE_TARGET_STATE_MISMATCH");
assert(alignment.production_scale_target?.single_worker_for_all_fleets_allowed_in_production === false, "PRODUCTION_SINGLE_WORKER_BOTTLENECK_MUST_BE_FORBIDDEN");
assert(alignment.production_scale_target?.single_d1_write_database_for_all_global_fleets_allowed_in_production === false, "PRODUCTION_SINGLE_D1_BOTTLENECK_MUST_BE_FORBIDDEN");

const wrangler = read(paths.wrangler);
const fleetRegistryText = readText(paths.fleetRegistry);
const eventRuntimeText = readText(paths.eventRuntime);
const httpSecurityText = readText(paths.httpSecurity);
const workerText = readText(paths.worker);
const ingestText = readText(paths.ingest);
const migrationText = readText(paths.migration);
const runtimePackage = read(paths.runtimePackage);
const registeredFleets = [...fleetRegistryText.matchAll(/\{ id: '([^']+)', stage: '[^']+', binding: '([^']+)', queue: '([^']+)' \}/g)]
  .map(match => ({id:match[1],binding:match[2],queue:match[3]}));
const runtimeProducers = (wrangler.queues?.producers ?? []).filter(item => item.binding !== "ASI_DEAD_LETTER_QUEUE");
const allRuntimeConsumers = wrangler.queues?.consumers ?? [];
const runtimeConsumers = allRuntimeConsumers.filter(item => item.queue !== "kidults-asi-shadow-dead-letter");
const dlqConsumers = allRuntimeConsumers.filter(item => item.queue === "kidults-asi-shadow-dead-letter");
assert(registeredFleets.length === 25 && unique(registeredFleets.map(item => item.id)), "RUNTIME_REGISTRY_25_UNIQUE_FLEETS_REQUIRED");
assert(sameSet(registeredFleets.map(item => item.id), alignment.asi_logical_to_execution_fleets.flatMap(item => item.execution_fleet_ids)), "RUNTIME_REGISTRY_FLEET_SET_DRIFT");
assert(runtimeProducers.length === 25 && unique(runtimeProducers.map(item => item.binding)) && unique(runtimeProducers.map(item => item.queue)), "WRANGLER_25_UNIQUE_FLEET_PRODUCERS_REQUIRED");
assert(runtimeConsumers.length === 25 && unique(runtimeConsumers.map(item => item.queue)), "WRANGLER_25_UNIQUE_FLEET_CONSUMERS_REQUIRED");
assert(dlqConsumers.length === 1 && dlqConsumers[0].max_retries === 3 && !Object.hasOwn(dlqConsumers[0],"dead_letter_queue"), "WRANGLER_SHARED_DLQ_CONSUMER_REQUIRED");
assert(sameSet(runtimeProducers.map(item => item.queue),runtimeConsumers.map(item => item.queue)), "WRANGLER_PRODUCER_CONSUMER_SET_DRIFT");
assert(runtimeConsumers.every(item => item.max_retries === 3 && item.dead_letter_queue === "kidults-asi-shadow-dead-letter"), "WRANGLER_BOUNDED_RETRY_DLQ_REQUIRED");
assert(runtimeConsumers.every(item => !Object.hasOwn(item,"max_concurrency")), "WRANGLER_FIXED_CONCURRENCY_FORBIDDEN");
assert((wrangler.queues?.producers ?? []).every(item => item.queue.length <= 63) && allRuntimeConsumers.every(item => item.queue.length <= 63 && (item.dead_letter_queue?.length ?? 0) <= 63), "WRANGLER_QUEUE_NAME_LENGTH_EXCEEDED");
assert(runtimePackage.scripts?.["types:generate"] === "wrangler types src/worker-configuration.d.ts", "GENERATED_QUEUE_BINDING_TYPES_COMMAND_DRIFT");
assert(wrangler.vars?.ASI_MESH_MODE === "SHADOW" && wrangler.vars?.ASI_PUBLICATION_ENABLED === "false", "WRANGLER_FAIL_CLOSED_SHADOW_STATE_REQUIRED");
assert(wrangler.vars?.SOURCE_ADAPTERS_JSON === "[]", "WRANGLER_LEGACY_ADAPTER_CHAIN_MUST_BE_DISABLED");
assert(
  eventRuntimeText.includes("await env.DB.batch(statements)") &&
  eventRuntimeText.includes("relayPendingOutbox") &&
  eventRuntimeText.includes("Promise.all(batch.messages.map") &&
  eventRuntimeText.includes("ASI_QUEUE_TASK_MAX_BYTES = 120 * 1024") &&
  eventRuntimeText.includes("ASI_QUEUE_TASK_OUTBOX_PROVENANCE_MISMATCH") &&
  eventRuntimeText.includes("WHERE EXISTS (\n        SELECT 1 FROM asi_event_log WHERE event_id=?") &&
  eventRuntimeText.includes("engine_processor_implementation_count:0"),
  "ATOMIC_OUTBOX_RELAY_AND_TRANSPORT_CONSUMER_SCAFFOLD_REQUIRED"
);
assert(workerText.includes("legacy_serial_path_disabled") && workerText.includes("async queue(batch:"), "WORKER_MUST_DISABLE_SERIAL_PATH_AND_EXPORT_QUEUE_HANDLER");
assert(workerText.includes("PURPOSE_SPECIFIC_PUBLICATION_ADMISSION_NOT_GRANTED"), "WORKER_PUBLICATION_HOLD_BOUNDARY_MISSING");
assert(workerText.includes("asi_transport_unavailable") && workerText.includes("clientError ? 400 : 503"), "TRANSIENT_ENQUEUE_FAILURES_MUST_RETURN_RETRYABLE_STATUS");
assert(ingestText.includes("FROM asi_purpose_admissions") && ingestText.includes("purpose_admission_required"), "INGEST_PURPOSE_ADMISSION_GATE_MISSING");
assert(
  ingestText.includes("bearerAuthorized(request,env.INGEST_TOKEN)") &&
  workerText.includes("bearerAuthorized(request,env.INGEST_TOKEN)") &&
  workerText.includes("parseBoundedJson(request)") &&
  httpSecurityText.includes("if (!token) return false;") &&
  httpSecurityText.includes("timingSafeEqual") &&
  httpSecurityText.includes("maxBytes = 98_304") &&
  httpSecurityText.includes("REQUEST_BODY_TOO_LARGE"),
  "INTERNAL_ENDPOINT_AUTH_AND_BOUNDED_JSON_MUST_FAIL_CLOSED"
);
assert(ingestText.includes("COUNT(DISTINCT ea.assertion_type)=9") && ingestText.includes("a.required_assertion_count=9 AND a.satisfied_assertion_count=9"), "INGEST_NINE_ASSERTION_REVALIDATION_MISSING");
assert(ingestText.includes("a.superseded_at IS NULL") && ingestText.includes("a.revoked_at IS NULL") && ingestText.includes("a.review_due_at>?"), "INGEST_CURRENT_ADMISSION_GATE_MISSING");
assert(ingestText.includes("admissionInputSnapshotRef") && ingestText.includes("admission.admission_id"), "INGEST_ADMISSION_LINEAGE_BINDING_MISSING");
assert(ingestText.includes("legacy_monolithic_publication_path_disabled") && !ingestText.includes("return json(await publish(env,'manual'))"), "LEGACY_MONOLITHIC_PUBLICATION_PATH_MUST_BE_DISABLED");
const boundedAssertions = admissionPolicy.purposes?.find(item => item.purpose === "BOUNDED_SHADOW_ACQUISITION")?.required_assertions ?? [];
assert(sameSet(boundedAssertions,["COLLECT","STORE","TRANSFORM","RETENTION","RATE_LIMIT","ROBOTS","SCHEMA","PROVENANCE","FRESHNESS"]), "BOUNDED_SHADOW_ADMISSION_ASSERTION_POLICY_DRIFT");
for (const table of ["asi_event_log","asi_outbox","asi_engine_assertions","asi_purpose_admissions","asi_admission_assertions","asi_queue_watermarks","asi_dead_letters","asi_processed_messages","asi_engine_health","asi_task_leases","asi_replay_requests","asi_circuit_breakers","asi_fleet_budgets"]) {
  assert(migrationText.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `RUNTIME_DURABLE_TABLE_MISSING:${table}`);
}
assert(migrationText.includes("[\"STAGING_NONCOMMERCIAL_FIXTURE_ONLY\"]',9,9") && migrationText.includes("kidults-asi-purpose-specific-admission-policy-v1@1.0.0"), "FIXTURE_ADMISSION_MUST_BIND_ALL_NINE_ASSERTIONS");
assert(migrationText.includes("ADD COLUMN admission_id TEXT REFERENCES asi_purpose_admissions(admission_id)"), "EVIDENCE_ADMISSION_FOREIGN_KEY_MISSING");

const prohibitedSourceUniverseTargetPatterns = [
  ["AUTONOMOUS", "SOURCE", "INTELLIGENCE", "10K"].join("_"),
  ["CAPACITY", "FOR", "10K", "SOURCES"].join("_"),
  `"${["source", "universe", "10k"].join("_")}"`,
  `"${["asi", "10k"].join("_")}"`,
  ["10K", "discovery", "plans"].join(" ")
];
const sourceUniverseTargetFiles = [paths.strategy, paths.program, paths.valueScope, paths.mesh, paths.digitalOcean, paths.dos, paths.categoryScale, paths.sourcePoolWorkflow];
for (const relative of sourceUniverseTargetFiles) {
  const text = readText(relative);
  for (const pattern of prohibitedSourceUniverseTargetPatterns) {
    assert(!text.includes(pattern), `STALE_SOURCE_UNIVERSE_NUMERIC_TARGET:${relative}:${pattern}`);
  }
}

const mutationCases = [
  ["drop-layer", (a, s, p, v, m, d, o) => { a.platform_layers.pop(); }],
  ["duplicate-engine", (a, s, p, v, m, d, o) => { a.platform_layers[0].engine_ids[0] = a.platform_layers[1].engine_ids[0]; }],
  ["drop-stage-binding", (a, s, p, v, m, d, o) => { a.funnel_stage_bindings[0].engine_ids.pop(); }],
  ["drop-asi-fleet", (a, s, p, v, m, d, o) => { a.asi_logical_to_execution_fleets[0].execution_fleet_ids.pop(); }],
  ["restore-deprecated-cost-alias", (a, s, p, v, m, d, o) => { p.source_intelligence_engines[8].engine = "SOURCE_COST_AND_ROI_ENGINE"; }],
  ["provider-required", (a, s, p, v, m, d, o) => { m.external_platform_handoffs.provider_fusion.provider_required = true; }],
  ["provider-direct-index", (a, s, p, v, m, d, o) => { m.external_platform_handoffs.provider_fusion.direct_to_index_allowed = true; }],
  ["projection-creates-truth", (a, s, p, v, m, d, o) => { m.external_platform_handoffs.projection_and_control_tower.may_create_market_truth = true; }],
  ["deployment-overclaim", (a, s, p, v, m, d, o) => { a.truth_boundary.durable_runtime_deployed = true; }],
  ["numeric-source-target", (a, s, p, v, m, d, o) => { a.source_universe.numeric_site_completion_target = 10000; }],
  ["source-role-drift", (a, s, p, v, m, d, o) => { p.source_roles.pop(); }],
  ["mesh-stage-id-drift", (a, s, p, v, m, d, o) => { m.downstream_market_funnel.stages[1].stage_id = "F5_CANONICAL_TRUTH_EVIDENCE_AND_MARKET_GRAPH"; }]
];

for (const [name, mutate] of mutationCases) {
  const values = [alignment, strategy, program, valueScope, mesh, digitalOcean, dos].map(clone);
  mutate(...values);
  assert(collectErrors(...values).length > 0, `NEGATIVE_CONTROL_DID_NOT_FAIL:${name}`);
}

if (errors.length) {
  console.error(`KIDULTS Platform Market Funnel Alignment: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("KIDULTS Platform Market Funnel Alignment: CANONICAL ARCHITECTURE + INTEGRATION BOUNDARIES 100% ALIGNED");
console.log("Canonical platform layers / logical engines: 9 / 52");
console.log("Canonical ASI logical engines / execution fleets: 11 / 25");
console.log("Embedded downstream / ingress / provider / projection engines: 23 / 8 / 6 / 4");
console.log(`Negative controls: ${mutationCases.length}/${mutationCases.length} PASS`);
console.log("Source Universe: CONTINUOUS OPEN-ENDED / NO NUMERIC SITE COMPLETION TARGET");
console.log("Provider: OPTIONAL / NO DIRECT INDEX OR PROJECTION PATH");
console.log("Source roles: 10 canonical / 7 core required / 3 optional / legacy aliases crosswalked");
console.log("Projection and Control Tower: GOVERNED PROJECTION CONSUMERS ONLY");
console.log("Runtime: 25 queue-transport scaffolds code-wired / engine processors 0 / operational recovery not verified / publication fail-closed");
console.log("Repository canonical architecture and integration-boundary alignment: 100%");
console.log("Full 52-engine runtime implementation: NOT VERIFIED / NOT CLAIMED");
console.log("Deployed operational alignment: 0% / NOT DEPLOYED / NOT CLAIMED");
console.log("Production: HOLD");
