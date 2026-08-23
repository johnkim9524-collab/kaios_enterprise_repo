#!/usr/bin/env node
import fs from 'node:fs';

const files = {
  contract: 'coordination/kidults/source-intelligence/asi-p0-mission-consumption-contract-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-p0-mission-consumption-registry-v1.json',
  builder: 'scripts/kidults/source-intelligence/build-asi-p0-mission-consumption-v1.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-p0-mission-consumption-v1.mjs',
  runtimeTest: 'services/kidults-autonomous-intelligence/scripts/asi-p0-mission-consumption-runtime-test.mjs',
  workflow: '.github/workflows/kidults-asi-p0-mission-consumption-v1.yml',
  doc: 'docs/kidults/asi/asi-p0-mission-consumption-v1.md'
};
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (p) => fs.readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));
for (const [key, value] of Object.entries(files)) assert(fs.existsSync(value), `MISSING_${key.toUpperCase()}:${value}`);

const contract = json(files.contract);
const registry = json(files.registry);
const builder = read(files.builder);
const validator = read(files.validator);
const runtimeTest = read(files.runtimeTest);
const workflow = read(files.workflow);
const doc = read(files.doc);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

assert(contract.id === 'kidults-asi-p0-mission-consumption-contract-v1', 'CONTRACT_ID');
assert(registry.id === 'kidults-asi-p0-mission-consumption-registry-v1', 'REGISTRY_ID');
assert(registry.version === '1.0.0' && registry.owner === 'KPMO' && registry.priority === 'P0', 'REGISTRY_METADATA');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLE_ORDER');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(principles), 'REGISTRY_PRINCIPLE_ORDER');
assert(contract.consumption_model?.model === 'ONE_MISSION_TO_THREE_INDEPENDENT_DISCOVERY_LANE_TASKS', 'CONTRACT_CONSUMPTION_MODEL');
assert(contract.consumption_model?.missions_consumed_required === 192, 'CONTRACT_MISSION_TARGET');
assert(contract.consumption_model?.lane_tasks_required === 576, 'CONTRACT_TASK_TARGET');
assert(contract.consumption_model?.lane_slots?.length === 3, 'CONTRACT_LANE_SLOT_COUNT');
for (const [key, expected] of Object.entries({
  contract: files.contract,
  builder: files.builder,
  validator: files.validator,
  runtime_test: files.runtimeTest,
  workflow: files.workflow,
  human_readme: files.doc
})) assert(registry.registered_assets?.[key] === expected, `REGISTRY_PATH:${key}`);
assert(registry.registered_outputs?.length === 5, 'REGISTRY_OUTPUT_COUNT');
assert(registry.execution_truth?.missions_available === 192, 'REGISTRY_MISSION_AVAILABLE');
assert(registry.execution_truth?.missions_consumed_target === 192, 'REGISTRY_MISSION_TARGET');
assert(registry.execution_truth?.lane_tasks_target === 576, 'REGISTRY_TASK_TARGET');
assert(registry.execution_truth?.runtime_registered_discovery_fleets_target === 11, 'REGISTRY_FLEET_TARGET');
assert(registry.execution_truth?.optional_licensed_fleet_assigned_target === 0, 'REGISTRY_LICENSED_TARGET');
assert(registry.execution_truth?.source_candidate_target_in_this_stage === 0, 'REGISTRY_CANDIDATE_BOUNDARY');
assert(registry.execution_truth?.next_stage === 'P0B_BOUNDED_DISCOVERY_EXECUTION_AND_SOURCE_CANDIDATE_INCREMENT', 'REGISTRY_NEXT_STAGE');
assert(registry.automatic_activation?.main_push === true, 'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule === '17 * * * *', 'REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.upstream_workflow === 'KIDULTS ASI Intelligence Preparation Wave v1', 'REGISTRY_UPSTREAM');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');

for (const marker of [
  'workflow_dispatch:',
  'schedule:',
  "cron: '17 * * * *'",
  'push:',
  'workflow_run:',
  "'KIDULTS ASI Intelligence Preparation Wave v1'",
  'Build current Intelligence Preparation Wave',
  'Consume all missions into discovery tasks',
  'Run all discovery tasks through ASI runtime alignment preflight',
  'Reject mission-not-consumed mutation',
  'Reject optional licensed-fleet assignment mutation',
  'Reject payload routing bypass mutation',
  'Reject source-candidate overclaim mutation',
  'Emit KPMO P0 mission-consumption receipt'
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(workflow.includes('contents: read'), 'WORKFLOW_CONTENTS_READ');
assert(!workflow.includes('contents: write'), 'WORKFLOW_CONTENTS_WRITE_FORBIDDEN');
assert(workflow.includes('persist-credentials: false'), 'WORKFLOW_CREDENTIALS');
assert(!workflow.includes('git push'), 'WORKFLOW_DIRECT_PUSH_FORBIDDEN');

for (const marker of [
  'SOURCE_DISCOVERY_REQUESTED',
  'READY_FOR_SHADOW_QUEUE_RUNTIME_PREFLIGHT',
  'CONSUMED_TO_THREE_DISCOVERY_LANE_TASKS',
  'DISCOVERY_OPTIONAL_LICENSED_GAP_FILL',
  'source_candidates_created: 0'
]) assert(builder.includes(marker), `BUILDER_MARKER:${marker}`);
for (const marker of [
  'LEDGER_MISSION_COUNT',
  'QUEUE_TASK_COUNT',
  'EVENT_PAYLOAD_HASH',
  'TASK_LICENSED_FLEET_ASSIGNED',
  'ROUTING_FLEET_COUNTS',
  'MANIFEST_EXTERNAL_EXECUTION_OVERCLAIM'
]) assert(validator.includes(marker), `VALIDATOR_MARKER:${marker}`);
for (const marker of [
  'assertAsiExecutionAlignment',
  'assertAsiEventPayloadHash',
  'discovery_tasks_runtime_preflighted: 576',
  'processor_execution_state: \'NOT_EXECUTED_DISCOVERY_TASK_PREFLIGHT_ONLY\''
]) assert(runtimeTest.includes(marker), `RUNTIME_TEST_MARKER:${marker}`);
for (const marker of [
  '# KIDULTS ASI P0 Mission Consumption v1',
  '192 Autonomous Missions',
  '576 SOURCE_DISCOVERY_REQUESTED events',
  'PRIMARY_CANDIDATE_LANE',
  'INDEPENDENT_FALLBACK_LANE',
  'FACTUAL_ORIGIN_REPLACEMENT_LANE',
  'Mission Consumed ≠ Source Discovered'
]) assert(doc.includes(marker), `DOC_MARKER:${marker}`);

for (const [key, expected] of Object.entries({
  mission_consumption_is_source_discovery_result: false,
  runtime_preflight_is_processor_execution: false,
  runtime_preflight_is_external_network_execution: false,
  discovery_task_is_source_candidate: false,
  source_candidate_is_evidence: false,
  host_is_factual_origin_without_proof: false,
  public_release: 'HOLD',
  production: 'HOLD'
})) assert(registry.truth_boundary?.[key] === expected, `REGISTRY_TRUTH_BOUNDARY:${key}`);

console.log(JSON.stringify({
  id: 'kidults-asi-p0-mission-consumption-registry-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  missions_target: 192,
  discovery_tasks_target: 576,
  discovery_fleets_target: 11,
  automatic_main_push: true,
  automatic_schedule: registry.automatic_activation.schedule,
  automatic_upstream_workflow: registry.automatic_activation.upstream_workflow,
  direct_repository_mutation_from_workflow: false,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
