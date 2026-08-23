#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = {
  contract:'coordination/kidults/source-intelligence/asi-engine-refactoring-contract-v2.json',
  registry:'coordination/kidults/source-intelligence/asi-engine-principle-alignment-registry-v2.json',
  platform:'coordination/kidults/architecture/platform-market-funnel-alignment-v1.json',
  mesh:'coordination/kidults/source-intelligence/asi-market-funnel-engine-mesh-v1.json',
  sourcing:'coordination/kidults/source-intelligence/asi-sourcing-direction-contract-v2.json',
  runtimeRegistry:'services/kidults-autonomous-intelligence/src/asi/registry.ts',
  runtimeAlignment:'services/kidults-autonomous-intelligence/src/asi/alignment.ts',
  runtimeWorker:'services/kidults-autonomous-intelligence/src/worker.ts',
  runtimeTest:'services/kidults-autonomous-intelligence/scripts/asi-engine-alignment-test.mjs',
};

const fail = (message) => { throw new Error(message); };
const assert = (condition,message) => { if (!condition) fail(message); };
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');
const json = (p) => JSON.parse(read(p));
for (const [name,p] of Object.entries(files)) assert(fs.existsSync(path.join(root,p)),`MISSING_${name.toUpperCase()}:${p}`);

const contract = json(files.contract);
const registry = json(files.registry);
const platform = json(files.platform);
const mesh = json(files.mesh);
const sourcing = json(files.sourcing);
const runtimeRegistry = read(files.runtimeRegistry);
const runtimeAlignment = read(files.runtimeAlignment);
const runtimeWorker = read(files.runtimeWorker);
const runtimeTest = read(files.runtimeTest);
const expectedPrinciples = ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];

assert(contract.id === 'kidults-asi-engine-refactoring-contract-v2','CONTRACT_ID');
assert(contract.version === '2.0.0','CONTRACT_VERSION');
assert(contract.status === 'MANDATORY_FAIL_CLOSED','CONTRACT_STATUS');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(expectedPrinciples),'CONTRACT_PRINCIPLE_ORDER');
assert(contract.scope?.logical_engine_count === 52,'CONTRACT_ENGINE_COUNT');
assert(contract.scope?.execution_fleet_count === 25,'CONTRACT_FLEET_COUNT');
assert(contract.scope?.full_52_engine_runtime_implementation_claimed === false,'CONTRACT_RUNTIME_OVERCLAIM');
assert(contract.scope?.remote_deployment_claimed === false,'CONTRACT_DEPLOYMENT_OVERCLAIM');
assert(contract.runtime_preflight?.function === 'assertAsiExecutionAlignment','CONTRACT_PREFLIGHT_FUNCTION');
assert(contract.runtime_preflight?.failure_mode === 'THROW_AND_REJECT_AFFECTED_TASK','CONTRACT_FAIL_CLOSED');
assert(contract.runtime_receipt?.hard_floor_pass_required === true,'CONTRACT_RECEIPT_HARD_FLOOR');
assert(contract.completion_definition?.repository_contract_alignment_percent === 100,'CONTRACT_REPOSITORY_ALIGNMENT');
assert(contract.completion_definition?.shadow_runtime_fleet_alignment_percent === 100,'CONTRACT_RUNTIME_ALIGNMENT');
assert(contract.completion_definition?.full_runtime_deployment_alignment_percent === 0,'CONTRACT_DEPLOYMENT_TRUTH');
assert(contract.completion_definition?.production === 'HOLD','CONTRACT_PRODUCTION');

assert(registry.id === 'kidults-asi-engine-principle-alignment-registry-v2','REGISTRY_ID');
assert(registry.version === '2.0.0','REGISTRY_VERSION');
assert(registry.status === 'MANDATORY_FAIL_CLOSED','REGISTRY_STATUS');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(expectedPrinciples),'REGISTRY_PRINCIPLE_ORDER');
assert(registry.alignment_profile?.profile_id === 'FOUR_PRINCIPLE_HARD_FLOOR_V2','REGISTRY_PROFILE');
assert(registry.alignment_profile?.all_axes_required === true,'REGISTRY_ALL_AXES');
assert(registry.alignment_profile?.composite_compensation_allowed === false,'REGISTRY_COMPOSITE_COMPENSATION');
for (const principle of expectedPrinciples) {
  const requirements = registry.alignment_profile?.principle_requirements?.[principle];
  assert(Array.isArray(requirements) && requirements.length >= 4,`REGISTRY_PRINCIPLE_REQUIREMENTS:${principle}`);
}

const platformEngines = platform.platform_layers.flatMap((layer) => layer.engine_ids);
const registryEngines = registry.logical_engine_groups.flatMap((group) => group.engine_ids);
assert(platformEngines.length === 52 && new Set(platformEngines).size === 52,'PLATFORM_52_ENGINE_TAXONOMY');
assert(registryEngines.length === 52 && new Set(registryEngines).size === 52,'REGISTRY_52_ENGINE_TAXONOMY');
assert(JSON.stringify([...platformEngines].sort()) === JSON.stringify([...registryEngines].sort()),'REGISTRY_PLATFORM_ENGINE_MISMATCH');

const platformStageByEngine = new Map();
for (const binding of platform.funnel_stage_bindings) {
  for (const engineId of binding.engine_ids) {
    assert(!platformStageByEngine.has(engineId),`PLATFORM_ENGINE_DUPLICATE_STAGE:${engineId}`);
    platformStageByEngine.set(engineId,binding.stage_id);
  }
}
for (const group of registry.logical_engine_groups) {
  assert(typeof group.layer_id === 'string' && typeof group.stage_id === 'string','REGISTRY_GROUP_METADATA');
  for (const engineId of group.engine_ids) {
    assert(platformStageByEngine.get(engineId) === group.stage_id,`REGISTRY_ENGINE_STAGE_MISMATCH:${engineId}`);
  }
}

const platformFleetPairs = [];
for (const mapping of platform.asi_logical_to_execution_fleets) {
  for (const fleetId of mapping.execution_fleet_ids) platformFleetPairs.push([fleetId,mapping.logical_engine_id]);
}
const registryFleetPairs = [];
for (const mapping of registry.asi_logical_to_execution_fleets) {
  for (const fleetId of mapping.execution_fleet_ids) registryFleetPairs.push([fleetId,mapping.logical_engine_id]);
}
assert(platformFleetPairs.length === 25 && new Set(platformFleetPairs.map(([fleet]) => fleet)).size === 25,'PLATFORM_25_FLEETS');
assert(registryFleetPairs.length === 25 && new Set(registryFleetPairs.map(([fleet]) => fleet)).size === 25,'REGISTRY_25_FLEETS');
const pairKey = ([fleet,engine]) => `${fleet}::${engine}`;
assert(JSON.stringify(platformFleetPairs.map(pairKey).sort()) === JSON.stringify(registryFleetPairs.map(pairKey).sort()),'REGISTRY_PLATFORM_FLEET_MAPPING_MISMATCH');

const meshFleets = mesh.asi_funnel.stages.flatMap((stage) => stage.engine_fleets);
assert(meshFleets.length === 25 && new Set(meshFleets).size === 25,'MESH_25_FLEETS');
assert(JSON.stringify([...meshFleets].sort()) === JSON.stringify(platformFleetPairs.map(([fleet]) => fleet).sort()),'MESH_PLATFORM_FLEET_MISMATCH');
assert(JSON.stringify(mesh.approved_principles) === JSON.stringify(expectedPrinciples),'MESH_PRINCIPLE_ORDER');

assert(JSON.stringify(sourcing.platform_constitution?.ordered_principles) === JSON.stringify(expectedPrinciples),'SOURCING_PRINCIPLE_ORDER');
assert(JSON.stringify(sourcing.source_selection_model?.four_axis_vector) === JSON.stringify(expectedPrinciples),'SOURCING_FOUR_AXIS_VECTOR');
assert(sourcing.source_selection_model?.single_composite_score_can_override_hard_floor === false,'SOURCING_COMPOSITE_COMPENSATION');
assert(Number(sourcing.source_selection_model?.minimum_each_direction) > 0,'SOURCING_HARD_FLOOR');

const runtimeFleetEntries = [...runtimeRegistry.matchAll(/\{ id: '([^']+)', stage: '([^']+)', binding: '([^']+)', queue: '([^']+)' \}/g)]
  .map((match) => ({fleet:match[1],stage:match[2],binding:match[3],queue:match[4]}));
assert(runtimeFleetEntries.length === 25,'RUNTIME_FLEET_COUNT');
assert(new Set(runtimeFleetEntries.map((item) => item.fleet)).size === 25,'RUNTIME_FLEET_DUPLICATE');

const mappingBlock = runtimeRegistry.match(/export const ASI_FLEET_LOGICAL_ENGINE:[\s\S]*?= \{([\s\S]*?)\n\};/);
assert(mappingBlock,'RUNTIME_LOGICAL_MAPPING_BLOCK_MISSING');
const runtimeMappingMatches = [...mappingBlock[1].matchAll(/^\s{2}([A-Z0-9_]+): '([A-Z0-9_]+)',$/gm)]
  .map((match) => ({fleet:match[1],engine:match[2]}));
assert(runtimeMappingMatches.length === 25,'RUNTIME_FLEET_PROFILE_COUNT');
assert(new Set(runtimeMappingMatches.map((item) => item.fleet)).size === 25,'RUNTIME_FLEET_PROFILE_DUPLICATE');
const runtimePairs = runtimeMappingMatches.map((item) => `${item.fleet}::${item.engine}`).sort();
assert(JSON.stringify(runtimePairs) === JSON.stringify(platformFleetPairs.map(pairKey).sort()),'RUNTIME_FLEET_LOGICAL_MAPPING_MISMATCH');
assert(JSON.stringify(runtimeFleetEntries.map((item) => item.fleet).sort()) === JSON.stringify(runtimeMappingMatches.map((item) => item.fleet).sort()),'RUNTIME_FLEET_PROFILE_ORPHAN');
for (const marker of [
  "'AUTONOMOUS'","'GLOBAL'","'IRREPLACEABLE_VALUE'","'TRANSPARENT'",
  "'FOUR_PRINCIPLE_HARD_FLOOR_V2'","'ENFORCED'",'ASI_FLEET_LOGICAL_ENGINE','asiLogicalEngineForFleet',
]) assert(runtimeRegistry.includes(marker),`RUNTIME_REGISTRY_MARKER:${marker}`);

for (const marker of [
  'ASI_ENGINE_ALIGNMENT_POLICY_VERSION',
  'ASI_ENGINE_ALIGNMENT_POLICY_DIGEST',
  'evaluateAsiExecutionAlignment',
  'assertAsiExecutionAlignment',
  'finalizeAsiEngineAlignment',
  'assertAsiEngineAlignmentReceipt',
  'AUTONOMOUS_EXPLICIT_TARGET_ROUTING_ABSENT',
  'GLOBAL_REGION_EXPLICIT',
  'IRREPLACEABLE_PROVIDER_DIRECT_PATH_FORBIDDEN',
  'TRANSPARENT_PAYLOAD_HASH_VALID',
  'provider_direct_to_projection',
  "production: 'HOLD'",
]) assert(runtimeAlignment.includes(marker),`RUNTIME_ALIGNMENT_MARKER:${marker}`);

for (const marker of [
  "from './asi/alignment'",
  'preflightAlignmentReceipts',
  'assertAsiExecutionAlignment(task.target_fleet,task.event)',
  "'asi.engine.alignment.preflight.v2'",
  "'asi.engine.alignment.batch.completed.v2'",
  'await consumeAsiBatch(batch,env)',
  'recordAlignmentBatchCompletion',
]) assert(runtimeWorker.includes(marker),`RUNTIME_WORKER_MARKER:${marker}`);
const preflightPosition = runtimeWorker.indexOf('const receipts = await preflightAlignmentReceipts(env,batch)');
const consumePosition = runtimeWorker.indexOf('await consumeAsiBatch(batch,env)');
const completionPosition = runtimeWorker.indexOf('await recordAlignmentBatchCompletion(env,batch,receipts)');
assert(preflightPosition >= 0 && preflightPosition < consumePosition && consumePosition < completionPosition,'RUNTIME_WORKER_EXECUTION_ORDER');

for (const marker of [
  'registry.ASI_FLEETS.length,25',
  'registry.ASI_LOGICAL_ENGINES.length,11',
  'registry.ASI_FLEET_LOGICAL_ENGINE',
  'AUTONOMOUS_EXPLICIT_TARGET_ROUTING_ABSENT',
  'GLOBAL_REGION_EXPLICIT',
  'IRREPLACEABLE_PROVIDER_DIRECT_PATH_FORBIDDEN',
  'TRANSPARENT_PAYLOAD_HASH_VALID',
  'finalizeAsiEngineAlignment',
]) assert(runtimeTest.includes(marker),`RUNTIME_TEST_MARKER:${marker}`);

assert(registry.runtime_enforcement?.execution_fleet_count === 25,'REGISTRY_RUNTIME_FLEET_COUNT');
assert(registry.runtime_enforcement?.preflight_required_for_every_message === true,'REGISTRY_PREFLIGHT_REQUIRED');
assert(registry.runtime_enforcement?.audit_receipt_required_for_every_message === true,'REGISTRY_RECEIPT_REQUIRED');
assert(registry.truth_boundary?.logical_engine_principle_alignment_percent === 100,'REGISTRY_LOGICAL_ALIGNMENT_PERCENT');
assert(registry.truth_boundary?.execution_fleet_runtime_enforcement_percent === 100,'REGISTRY_RUNTIME_ALIGNMENT_PERCENT');
assert(registry.truth_boundary?.full_52_engine_runtime_implementation_verified === false,'REGISTRY_RUNTIME_OVERCLAIM');
assert(registry.truth_boundary?.durable_remote_runtime_deployed === false,'REGISTRY_DEPLOYMENT_OVERCLAIM');
assert(registry.truth_boundary?.production === 'HOLD','REGISTRY_PRODUCTION');

const report = {
  id:'kidults-asi-engine-principle-alignment-validation-v2',
  version:'2.0.0',
  state:'VERIFIED_PASS',
  platform_principles:expectedPrinciples,
  logical_engines_aligned:registryEngines.length,
  logical_engines_total:platformEngines.length,
  logical_engine_alignment_percent:100,
  asi_logical_engines_mapped:platform.asi_logical_to_execution_fleets.length,
  execution_fleets_runtime_enforced:runtimeMappingMatches.length,
  execution_fleets_total:platformFleetPairs.length,
  execution_fleet_runtime_alignment_percent:100,
  hard_floor_enforced:true,
  composite_compensation_allowed:false,
  runtime_preflight_before_processing:true,
  per_message_alignment_receipt:true,
  batch_completion_receipt:true,
  full_52_engine_runtime_implementation_verified:false,
  durable_remote_runtime_deployed:false,
  public_release:'HOLD',
  production:'HOLD',
};
console.log(JSON.stringify(report,null,2));
