#!/usr/bin/env node
import fs from 'node:fs';

const files = {
  contract: 'coordination/kidults/source-intelligence/asi-mission-consumption-contract-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-mission-consumption-registry-v1.json',
  preparationRegistry: 'coordination/kidults/source-intelligence/asi-intelligence-preparation-registry-v1.json',
  crosswalk: 'coordination/kidults/source-intelligence/scope-registry-v1-to-v2-crosswalk-v1.json',
  sourceFrontier: 'coordination/kidults/source-intelligence/targeted-high-authority-source-expansion-v1.psv',
  builder: 'scripts/kidults/source-intelligence/build-asi-mission-consumption-v1.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-mission-consumption-v1.mjs',
  runtimeTest: 'services/kidults-autonomous-intelligence/scripts/asi-mission-consumption-runtime-test.mjs',
  event: 'services/kidults-autonomous-intelligence/src/asi/event.ts',
  fleetRegistry: 'services/kidults-autonomous-intelligence/src/asi/registry.ts',
  processors: 'services/kidults-autonomous-intelligence/src/asi/processors.ts',
  alignment: 'services/kidults-autonomous-intelligence/src/asi/alignment.ts',
  workflow: '.github/workflows/kidults-asi-mission-consumption-v1.yml',
  doc: 'docs/kidults/asi/asi-mission-consumption-v1.md'
};
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
for (const [key, file] of Object.entries(files)) assert(fs.existsSync(file), `MISSING_${key.toUpperCase()}:${file}`);

const contract = json(files.contract);
const registry = json(files.registry);
const preparationRegistry = json(files.preparationRegistry);
const crosswalk = json(files.crosswalk);
const sourceFrontier = read(files.sourceFrontier);
const builder = read(files.builder);
const validator = read(files.validator);
const runtimeTest = read(files.runtimeTest);
const event = read(files.event);
const fleetRegistry = read(files.fleetRegistry);
const processors = read(files.processors);
const alignment = read(files.alignment);
const workflow = read(files.workflow);
const doc = read(files.doc);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

assert(contract.id === 'kidults-asi-mission-consumption-contract-v1', 'CONTRACT_ID');
assert(registry.id === 'kidults-asi-mission-consumption-registry-v1', 'REGISTRY_ID');
assert(registry.version === contract.version && registry.owner === 'KPMO' && registry.priority === 'P0', 'REGISTRY_METADATA');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(principles), 'REGISTRY_PRINCIPLE_ORDER');
assert(preparationRegistry.id === 'kidults-asi-intelligence-preparation-registry-v1', 'PREPARATION_REGISTRY_BINDING');
assert(crosswalk.id === 'scope-registry-v1-to-v2-crosswalk-v1' && crosswalk.records?.length === 32, 'CROSSWALK_BINDING');
assert(sourceFrontier.startsWith('source_id|display_name|core_domain|collection_scope_ids|source_roles|official_endpoint|'), 'SOURCE_FRONTIER_HEADER');
assert(sourceFrontier.trim().split(/\r?\n/).length >= 51, 'SOURCE_FRONTIER_MINIMUM');

for (const [key, expected] of Object.entries({
  contract: files.contract,
  preparation_registry: files.preparationRegistry,
  scope_crosswalk: files.crosswalk,
  registered_source_frontier: files.sourceFrontier,
  builder: files.builder,
  validator: files.validator,
  runtime_test: files.runtimeTest,
  runtime_event_contract: files.event,
  runtime_fleet_registry: files.fleetRegistry,
  runtime_processor: files.processors,
  runtime_alignment: files.alignment,
  workflow: files.workflow,
  human_readme: files.doc
})) assert(registry.registered_assets?.[key] === expected, `REGISTRY_PATH:${key}`);

assert(registry.automatic_activation?.main_push === true, 'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule === '17 * * * *', 'REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');
for (const upstream of ['KIDULTS ASI Intelligence Preparation Wave v1', 'KIDULTS ASI Global Any-Site Hourly Pooling v2']) {
  assert(registry.automatic_activation?.upstream_workflows?.includes(upstream), `REGISTRY_UPSTREAM:${upstream}`);
}
assert(registry.execution_truth?.generated_missions_expected === 192, 'REGISTRY_MISSIONS');
assert(registry.execution_truth?.product_work_items_expected === 960, 'REGISTRY_PRODUCT_WORK');
assert(registry.execution_truth?.source_lane_slots_expected === 576, 'REGISTRY_LANES');
assert(registry.execution_truth?.runtime_processor_mode === 'LOCAL_SHADOW_PURE_TRANSFORM', 'REGISTRY_RUNTIME_MODE');
assert(registry.execution_truth?.runtime_processor_network_requests === 0 && registry.execution_truth?.runtime_processor_external_writes === 0, 'REGISTRY_SIDE_EFFECTS');
for (const handoff of ['P1', 'P2', 'P3']) assert(typeof registry.next_value_chain_handoffs?.[handoff] === 'string', `REGISTRY_HANDOFF:${handoff}`);

for (const marker of [
  'workflow_dispatch:',
  'schedule:',
  "cron: '17 * * * *'",
  'push:',
  'workflow_run:',
  "'KIDULTS ASI Intelligence Preparation Wave v1'",
  "'KIDULTS ASI Global Any-Site Hourly Pooling v2'",
  'Build mission consumption twice and prove deterministic replay',
  'Exercise every mission-bound event through aligned SHADOW runtime',
  'Reject missing mission consumption mutation',
  'Reject mission-created rights mutation',
  'Reject provider bypass mutation',
  'Reject independence overclaim mutation',
  'Reject missing discovery intent mutation',
  'Emit KPMO mission consumption receipt'
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(workflow.includes('contents: read'), 'WORKFLOW_CONTENTS_READ');
assert(!workflow.includes('contents: write'), 'WORKFLOW_CONTENTS_WRITE_FORBIDDEN');
assert(workflow.includes('persist-credentials: false'), 'WORKFLOW_CREDENTIALS');
assert(!workflow.includes('git push'), 'WORKFLOW_DIRECT_PUSH_FORBIDDEN');

for (const marker of [
  'mission-consumption-state-v1.json',
  'mission-product-work-items-v1.json',
  'mission-source-lane-assignments-v1.json',
  'mission-discovery-intent-v1.json',
  'mission-runtime-discovery-events-v1.json',
  'RUNTIME_DISCOVERY_EVENT_EMITTED',
  'MISSION_BOUND_REGISTERED_SOURCE_PREFLIGHT_ONLY',
  'REGISTERED_SOURCE_IS_NOT_RIGHTS_ADMITTED'
]) assert(builder.includes(marker), `BUILDER_MARKER:${marker}`);
for (const marker of [
  'STATE_MISSION_COUNT',
  'PRODUCT_COUNT',
  'LANE_SLOT_COUNT',
  'INTENT_UNFILLED_MISMATCH',
  'EVENT_PAYLOAD_DIGEST',
  'EVENT_PROVIDER_BYPASS',
  'MANIFEST_OUTPUT_DIGEST'
]) assert(validator.includes(marker), `VALIDATOR_MARKER:${marker}`);
for (const marker of [
  'validateAsiEvent',
  'assertAsiEventPayloadHash',
  'targetFleetsFor',
  'assertAsiExecutionAlignment',
  'processAsiFleet',
  'finalizeAsiEngineAlignment',
  'DISCOVERY_APPROVED_DIRECTORY_OUTBOUND_FRONTIER',
  "external_network_requests: 0",
  "deterministic_replay: 'PASS'"
]) assert(runtimeTest.includes(marker), `RUNTIME_TEST_MARKER:${marker}`);

assert(event.includes("| 'SOURCE_DISCOVERY_REQUESTED'"), 'EVENT_TYPE_REGISTERED');
assert(fleetRegistry.includes("APPROVED_DIRECTORY_ASSOCIATION_AND_OUTBOUND_LINK_FRONTIER:'DISCOVERY_APPROVED_DIRECTORY_OUTBOUND_FRONTIER'"), 'RUNTIME_CHANNEL_ROUTE');
assert(processors.includes("inputType: 'SOURCE_DISCOVERY_REQUESTED', outputType: 'SOURCE_DISCOVERED'"), 'DISCOVERY_PROCESSOR_CONTRACT');
assert(processors.includes('network_requests: 0') && processors.includes('external_writes: 0'), 'DISCOVERY_PROCESSOR_SIDE_EFFECTS');
assert(alignment.includes('IRREPLACEABLE_PROVIDER_DIRECT_PATH_FORBIDDEN'), 'ALIGNMENT_PROVIDER_BYPASS');
assert(alignment.includes('AUTONOMOUS_EXPLICIT_TARGET_ROUTING_ABSENT'), 'ALIGNMENT_ROUTING');

for (const marker of [
  '# KIDULTS ASI Mission Consumption Runtime v1',
  '192 Generated Missions',
  '960 Product Work Obligations',
  '576 Source Lane Slots',
  'Registered Source ≠ Rights-Admitted Source',
  'P1 — Claim-specific source admission',
  'P2 — Owned graph runtime',
  'P3 — Immutable intelligence pair'
]) assert(doc.includes(marker), `DOC_MARKER:${marker}`);

for (const [key, expected] of Object.entries({
  mission_generated_is_consumed: false,
  registered_source_is_rights_admitted: false,
  runtime_discovery_event_is_external_collection: false,
  runtime_processor_output_is_market_evidence: false,
  metadata_admission_is_market_event_admission: false,
  current_sold_event_is_current_price: false,
  sold_count_is_liquidity: false,
  provider_count_is_factual_origin_independence: false,
  public_release: 'HOLD',
  production: 'HOLD'
})) assert(registry.truth_boundary?.[key] === expected, `REGISTRY_TRUTH_BOUNDARY:${key}`);

console.log(JSON.stringify({
  id: 'kidults-asi-mission-consumption-registry-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  platform_principles: principles,
  automatic_main_push: true,
  automatic_schedule: registry.automatic_activation.schedule,
  automatic_upstream_workflows: registry.automatic_activation.upstream_workflows.length,
  expected_missions: registry.execution_truth.generated_missions_expected,
  expected_product_work_items: registry.execution_truth.product_work_items_expected,
  expected_source_lane_slots: registry.execution_truth.source_lane_slots_expected,
  local_shadow_runtime_processor: true,
  direct_repository_mutation_from_workflow: false,
  external_collection_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
