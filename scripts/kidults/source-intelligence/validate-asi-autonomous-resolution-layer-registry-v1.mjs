#!/usr/bin/env node
import fs from 'node:fs';

const files = {
  contract: 'coordination/kidults/source-intelligence/asi-autonomous-resolution-layer-contract-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-autonomous-resolution-layer-registry-v1.json',
  builder: 'scripts/kidults/source-intelligence/build-asi-autonomous-resolution-layer-v1.mjs',
  commonModule: 'scripts/kidults/source-intelligence/lib/asi-autonomous-resolution-common-v1.mjs',
  currentModule: 'scripts/kidults/source-intelligence/lib/asi-autonomous-resolution-current-v1.mjs',
  replacementModule: 'scripts/kidults/source-intelligence/lib/asi-autonomous-resolution-replacement-v1.mjs',
  purposeRightsGate: 'scripts/kidults/source-intelligence/lib/source-purpose-rights-gate-v1.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-autonomous-resolution-layer-v1.mjs',
  registryValidator: 'scripts/kidults/source-intelligence/validate-asi-autonomous-resolution-layer-registry-v1.mjs',
  workflow: '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml',
  documentation: 'docs/kidults/asi/asi-autonomous-resolution-layer-v1.md',
  sourceFrontier: 'coordination/kidults/source-intelligence/targeted-high-authority-source-expansion-v1.psv',
  crosswalk: 'coordination/kidults/source-intelligence/scope-registry-v1-to-v2-crosswalk-v1.json',
  adapter: 'coordination/kidults/source-intelligence/asi-p1-market-event-adapter-runtime-contract-v1.json'
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
const implementation = [builder, read(files.commonModule), read(files.currentModule), read(files.replacementModule)].join('\n');
const validator = read(files.validator);
const doc = read(files.documentation);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const engines = [
  'ACTION_DEPENDENCY_GRAPH_ENGINE',
  'RESOLUTION_SCHEDULER',
  'RIGHTS_RESOLUTION_ENGINE',
  'SEMANTIC_RESOLUTION_ENGINE',
  'FACTUAL_ORIGIN_RESOLUTION_ENGINE',
  'EVIDENCE_ADMISSION_ENGINE',
  'RESOLUTION_LEARNING_ENGINE'
];

assert(contract.id === 'kidults-asi-autonomous-resolution-layer-contract-v1', 'CONTRACT_ID');
assert(contract.version === '1.0.0', 'CONTRACT_VERSION');
assert(registry.id === 'kidults-asi-autonomous-resolution-layer-registry-v1', 'REGISTRY_ID');
assert(registry.version === '1.0.0' && registry.owner === 'KPMO' && registry.priority === 'P0', 'REGISTRY_METADATA');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLES');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(principles), 'REGISTRY_PRINCIPLES');
assert(JSON.stringify(contract.engine_order) === JSON.stringify(engines), 'CONTRACT_ENGINE_ORDER');
assert(JSON.stringify(registry.registered_engines) === JSON.stringify(engines), 'REGISTRY_ENGINE_ORDER');
assert(JSON.stringify(registry.registered_outputs) === JSON.stringify(contract.required_outputs), 'REGISTRY_OUTPUTS');

for (const [key, expected] of Object.entries({
  contract: files.contract,
  registry: files.registry,
  builder: files.builder,
  common_module: files.commonModule,
  current_resolution_module: files.currentModule,
  replacement_resolution_module: files.replacementModule,
  purpose_rights_gate: files.purposeRightsGate,
  validator: files.validator,
  registry_validator: files.registryValidator,
  workflow: files.workflow,
  documentation: files.documentation,
  source_frontier: files.sourceFrontier,
  scope_crosswalk: files.crosswalk,
  market_adapter_contract: files.adapter
})) assert(registry.registered_assets?.[key] === expected, `REGISTRY_PATH:${key}`);

assert(registry.automatic_activation?.main_push === true, 'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule === '22 * * * *', 'REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.upstream_workflow === 'KIDULTS ASI P1 Source Preflight v1', 'REGISTRY_UPSTREAM');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');
assert(registry.execution_policy?.current_p1_artifact_is_single_coherent_input === true, 'REGISTRY_COHERENT_INPUT');
assert(registry.execution_policy?.semantic_triage_precedes_expensive_preflight === true, 'REGISTRY_TRIAGE_ORDER');
assert(registry.execution_policy?.all_current_actions_must_reach_terminal_state === true, 'REGISTRY_TERMINAL_ACTIONS');
assert(registry.execution_policy?.candidate_global_retirement_from_mission_rejection_allowed === false, 'REGISTRY_GLOBAL_RETIREMENT');
assert(registry.execution_policy?.registered_replacement_profile_is_permission === false, 'REGISTRY_PROFILE_PERMISSION');

for (const marker of [
  'workflow_dispatch:',
  'schedule:',
  "cron: '22 * * * *'",
  'push:',
  'workflow_run:',
  "'KIDULTS ASI P1 Source Preflight v1'",
  'Restore latest coherent P1 artifact',
  'Build autonomous resolution layer twice',
  'Reject false resolution promotions and incomplete terminalization',
  'mutate_and_reject semantic-pass semantic-pass',
  'mutate_and_reject rights-allow rights-allow',
  'mutate_and_reject gate1-pass gate1-pass',
  'mutate_and_reject unresolved-action unresolved-action',
  'mutate_and_reject evidence-admission evidence-admission',
  'mutate_and_reject rights-hold-promotion rights-hold-promotion',
  'mutate_and_reject global-retirement global-retirement',
  'Reject manual-only activation mutation',
  'Emit KPMO autonomous-resolution receipt'
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(workflow.includes('contents: read'), 'WORKFLOW_CONTENTS_READ');
assert(!workflow.includes('contents: write'), 'WORKFLOW_CONTENTS_WRITE');
assert(workflow.includes('persist-credentials: false'), 'WORKFLOW_CREDENTIALS');
assert(!workflow.includes('git push'), 'WORKFLOW_DIRECT_PUSH');
assert(!workflow.includes('curl ') && !workflow.includes('wget '), 'WORKFLOW_UNDECLARED_NETWORK');

for (const marker of [
  'kidults-asi-action-dependency-graph-v1',
  'kidults-asi-resolution-schedule-v1',
  'kidults-asi-rights-resolution-ledger-v1',
  'kidults-asi-semantic-resolution-ledger-v1',
  'kidults-asi-factual-origin-resolution-ledger-v1',
  'kidults-asi-action-resolution-ledger-v1',
  'kidults-asi-gate1-resolution-ledger-v1',
  'kidults-asi-evidence-admission-resolution-ledger-v1',
  'kidults-asi-replacement-source-mission-queue-v1',
  'RIGHTS_CLEAR_FOR_PURPOSE',
  'RIGHTS_GATED_REPLACEMENT_QUEUE_READY',
  'kidults-asi-resolution-learning-ledger-v1',
  'TERMINAL_REJECT_FOR_CURRENT_MARKET_EVIDENCE'
]) assert(implementation.includes(marker), `IMPLEMENTATION_MARKER:${marker}`);
for (const marker of [
  'SEMANTIC_DECISIONS',
  'RIGHTS_PASS_BOUNDARY',
  'ACTION_RESOLUTION_TERMINAL_COUNT',
  'GATE1_RESOLUTION_COUNTS',
  'ADMISSION_RESOLUTION_COUNTS',
  'REPLACEMENT_PROMOTION_BOUNDARY',
  'MANIFEST_OUTPUT_DIGEST'
]) assert(validator.includes(marker), `VALIDATOR_MARKER:${marker}`);

for (const marker of [
  '# KIDULTS ASI Autonomous Resolution Layer v1',
  'Action Dependency Graph Engine',
  'Resolution Scheduler',
  'Rights Resolution Engine',
  'Semantic Resolution Engine',
  'Factual-Origin Resolution Engine',
  'Evidence Admission Engine',
  'Resolution Learning Engine',
  'Discovery metadata is not a sold transaction',
  'Mission-level rejection is not global source retirement'
]) assert(doc.includes(marker), `DOC_MARKER:${marker}`);

for (const [key, expected] of Object.entries({
  live_target_site_network_probe: false,
  rights_pass_created: false,
  evidence_admitted: false,
  market_event_created: false,
  snapshot_candidate_created: false,
  track_b_started: false,
  public_release: 'HOLD',
  production: 'HOLD'
})) assert(registry.truth_boundary?.[key] === expected, `REGISTRY_BOUNDARY:${key}`);

console.log(JSON.stringify({
  id: 'kidults-asi-autonomous-resolution-layer-registry-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  engine_count: engines.length,
  output_count: registry.registered_outputs.length,
  automatic_main_push: true,
  automatic_schedule: registry.automatic_activation.schedule,
  automatic_upstream_workflow: registry.automatic_activation.upstream_workflow,
  direct_repository_mutation: false,
  live_target_site_network_probe: false,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
