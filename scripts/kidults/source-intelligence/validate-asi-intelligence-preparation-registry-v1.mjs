#!/usr/bin/env node
import fs from 'node:fs';

const files = {
  contract: 'coordination/kidults/source-intelligence/asi-intelligence-preparation-wave-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-intelligence-preparation-registry-v1.json',
  builder: 'scripts/kidults/source-intelligence/build-asi-intelligence-preparation-wave-v1.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-intelligence-preparation-wave-v1.mjs',
  workflow: '.github/workflows/kidults-asi-intelligence-preparation-wave-v1.yml',
  doc: 'docs/kidults/asi/asi-intelligence-preparation-wave-v1.md'
};
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (p) => fs.readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));
for (const [key, value] of Object.entries(files)) assert(fs.existsSync(value), `MISSING_${key.toUpperCase()}:${value}`);

const contract = json(files.contract);
const registry = json(files.registry);
const workflow = read(files.workflow);
const builder = read(files.builder);
const validator = read(files.validator);
const doc = read(files.doc);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const modules = [
  'UNKNOWN_REGISTRY',
  'INTELLIGENCE_GAP_ENGINE',
  'AUTONOMOUS_MISSION_GENERATOR',
  'PROVIDER_REPLACEABILITY',
  'INTELLIGENCE_ROI',
  'CROSS_CATEGORY_INTELLIGENCE',
  'PORTFOLIO_INTELLIGENCE',
  'SELF_CALIBRATION'
];

assert(contract.id === 'kidults-asi-intelligence-preparation-wave-v1', 'CONTRACT_ID');
assert(registry.id === 'kidults-asi-intelligence-preparation-registry-v1', 'REGISTRY_ID');
assert(registry.version === '1.1.0' && registry.owner === 'KPMO' && registry.priority === 'P0', 'REGISTRY_METADATA');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(principles), 'REGISTRY_PRINCIPLE_ORDER');
assert(JSON.stringify(registry.registered_modules) === JSON.stringify(modules), 'REGISTRY_MODULE_ORDER');
assert(JSON.stringify(contract.canonical_execution_order) === JSON.stringify(modules), 'CONTRACT_MODULE_ORDER');
assert(JSON.stringify(registry.registered_outputs) === JSON.stringify(contract.required_outputs), 'REGISTRY_OUTPUTS');

for (const [key, expected] of Object.entries({
  contract: files.contract,
  builder: files.builder,
  validator: files.validator,
  workflow: files.workflow,
  human_readme: files.doc
})) assert(registry.registered_assets?.[key] === expected, `REGISTRY_PATH:${key}`);

assert(registry.automatic_activation?.main_push === true, 'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule === '47 */3 * * *', 'REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');
assert(registry.automatic_activation?.upstream_workflows?.length === 3, 'REGISTRY_UPSTREAM_COUNT');
for (const upstream of ['KIDULTS Global Source Mesh v1', 'KIDULTS ASI Source Fabric Scale PI1', 'KIDULTS ASI Multi-Lane Autonomous Acquisition Mission v1']) {
  assert(registry.automatic_activation.upstream_workflows.includes(upstream), `REGISTRY_UPSTREAM:${upstream}`);
}

for (const marker of [
  'workflow_dispatch:',
  'schedule:',
  "cron: '47 */3 * * *'",
  'push:',
  'workflow_run:',
  "'KIDULTS Global Source Mesh v1'",
  "'KIDULTS ASI Source Fabric Scale PI1'",
  'Build preparation wave twice and prove deterministic replay',
  'Reject missing-is-zero mutation',
  'Reject mission permission mutation',
  'Reject provider direct-path mutation',
  'Reject cross-category hypothesis promotion mutation',
  'Reject evidence-less calibration result mutation',
  'Emit KPMO execution receipt'
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(workflow.includes('contents: read'), 'WORKFLOW_CONTENTS_READ');
assert(!workflow.includes('contents: write'), 'WORKFLOW_CONTENTS_WRITE_FORBIDDEN');
assert(workflow.includes('persist-credentials: false'), 'WORKFLOW_CREDENTIALS');
assert(!workflow.includes('git push'), 'WORKFLOW_DIRECT_PUSH_FORBIDDEN');

for (const marker of [
  'kidults-asi-unknown-registry-v1',
  'kidults-asi-intelligence-gap-map-v1',
  'kidults-asi-autonomous-mission-queue-v1',
  'kidults-asi-provider-replaceability-plan-v1',
  'kidults-asi-intelligence-roi-portfolio-v1',
  'kidults-asi-cross-category-intelligence-map-v1',
  'kidults-asi-portfolio-intelligence-map-v1',
  'kidults-asi-self-calibration-plan-v1',
  'expected_mission_count'
]) assert(builder.includes(marker), `BUILDER_MARKER:${marker}`);
for (const marker of [
  'UNKNOWN_MISSING_ZERO',
  'QUEUE_MISSION_COUNT',
  'REPLACEMENT_TOTAL_SLOTS',
  'CROSS_HYPOTHESIS_COUNT',
  'CALIBRATION_UNEVIDENCED_RESULT',
  'MANIFEST_OUTPUT_DIGEST'
]) assert(validator.includes(marker), `VALIDATOR_MARKER:${marker}`);

for (const marker of [
  '# KIDULTS ASI Intelligence Preparation Wave v1',
  'Unknown Registry',
  'Intelligence Gap Engine',
  'Autonomous Mission Generator',
  'Provider Replaceability',
  'Intelligence ROI',
  'Cross-Category Intelligence',
  'Portfolio Intelligence',
  'Self Calibration',
  '768 unknown records',
  '192 missions',
  '576 explicit replaceability slots'
]) assert(doc.includes(marker), `DOC_MARKER:${marker}`);

for (const [key, expected] of Object.entries({
  preparation_outputs_are_empirical_market_evidence: false,
  mission_queue_executes_external_collection: false,
  provider_replacement_plan_selects_named_provider: false,
  cross_category_hypotheses_are_market_claims: false,
  portfolio_map_is_an_index: false,
  calibration_predictions_are_realized_results: false,
  public_release: 'HOLD',
  production: 'HOLD'
})) assert(registry.truth_boundary?.[key] === expected, `REGISTRY_TRUTH_BOUNDARY:${key}`);

console.log(JSON.stringify({
  id: 'kidults-asi-intelligence-preparation-registry-validation-v1',
  state: 'VERIFIED_PASS',
  principles,
  modules: modules.length,
  outputs: registry.registered_outputs.length,
  automatic_main_push: true,
  automatic_schedule: registry.automatic_activation.schedule,
  automatic_upstream_workflows: registry.automatic_activation.upstream_workflows.length,
  direct_repository_mutation_from_workflow: false,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
