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
const runHistoryPath = 'scripts/kidults/source-intelligence/resolve-asi-orchestration-run-history-v1.mjs';
assert(fs.existsSync(runHistoryPath), `MISSING_RUN_HISTORY:${runHistoryPath}`);

const contract = json(files.contract);
const registry = json(files.registry);
const workflow = read(files.workflow);
const runHistory = read(runHistoryPath);
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
assert(registry.version === '1.2.0' && registry.owner === 'KPMO' && registry.priority === 'P0', 'REGISTRY_METADATA');
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
assert(registry.automatic_activation?.manual_dispatch_role === 'SELF_HEALING_RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');
assert(registry.automatic_activation?.manual_recovery_reuses_active_exact_main_p1_before_dispatch === true, 'REGISTRY_MANUAL_RECOVERY_REUSE');
assert(registry.automatic_activation?.manual_recovery_dispatches_exact_main_p1_when_absent === true, 'REGISTRY_MANUAL_RECOVERY_DISPATCH');
assert(registry.automatic_activation?.manual_and_scheduled_recovery_artifact_role === 'RECOVERY_NON_CONSUMABLE', 'REGISTRY_RECOVERY_ARTIFACT_ROLE');
assert(registry.automatic_activation?.manual_and_scheduled_recovery_canonical_publication === false, 'REGISTRY_RECOVERY_CANONICAL_PUBLICATION');
assert(registry.automatic_activation?.manual_and_scheduled_recovery_downstream_consumable === false, 'REGISTRY_RECOVERY_CONSUMPTION');
assert(registry.automatic_activation?.canonical_publication_event === 'P1_WORKFLOW_RUN_COMPLETED_SUCCESS', 'REGISTRY_CANONICAL_EVENT');
assert(registry.automatic_activation?.canonical_generation_leader === 'EXACT_P1_WORKFLOW_RUN_ID' && registry.automatic_activation?.canonical_producer_cardinality === 1, 'REGISTRY_CANONICAL_LEADER');
assert(registry.execution_policy?.current_p1_artifact_is_single_coherent_input === true, 'REGISTRY_COHERENT_INPUT');
assert(registry.execution_policy?.shared_exact_generation_concurrency === true, 'REGISTRY_SHARED_GENERATION_CONCURRENCY');
assert(registry.execution_policy?.recovery_defers_to_workflow_run_leader === true, 'REGISTRY_RECOVERY_DEFERRAL');
assert(registry.execution_policy?.prior_successful_authoritative_generation_blocks_republication === true, 'REGISTRY_DUPLICATE_PRODUCER_BLOCK');
assert(registry.execution_policy?.downstream_duplicate_authoritative_producer_rejected === true, 'REGISTRY_DOWNSTREAM_DUPLICATE_REJECTION');
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
  'Restore exact producer-bound P1 artifact',
  'kidults-asi-p1-source-preflight-v1.yml/runs',
  'p1-upstream-artifact-binding-v1.json',
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
  'Emit KPMO autonomous-resolution receipt',
  'request-p1-recovery:',
  "artifact_role:'RECOVERY_NON_CONSUMABLE'",
  'downstream_consumable:false',
  'canonical_artifact_published:false',
  "if: github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success'",
  'Claim single authoritative producer for exact P1 generation',
  'for ARL_HISTORY_PAGE in $(seq 1 20); do',
  '--mode arl-generation-pages',
  'validate-safe-zip-archive-v1.py',
  '--expected-digest "$P1_DIGEST"',
  '--required-basename p1-preflight-action-queue-v1.json',
  "artifact_role:'AUTHORITATIVE_CONSUMABLE'",
  'authoritative_producer:true',
  'downstream_consumable:true'
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(runHistory.includes('ARL_AUTHORITATIVE_PRODUCER_DUPLICATE') && runHistory.includes('pagination_reconciled_complete: true'), 'RUN_HISTORY_DUPLICATE_AND_COMPLETENESS_GUARD');
assert(workflow.indexOf('--expected-digest "$P1_DIGEST"') < workflow.indexOf('unzip -q -o /tmp/p1.zip'), 'WORKFLOW_P1_SAFE_ZIP_PRE_EXTRACTION');
assert(workflow.includes('contents: read'), 'WORKFLOW_CONTENTS_READ');
assert(!workflow.includes('contents: write'), 'WORKFLOW_CONTENTS_WRITE');
assert(workflow.includes('actions: write'), 'WORKFLOW_ACTIONS_WRITE_FOR_BOUNDED_P1_RECOVERY');
assert(workflow.includes('persist-credentials: false'), 'WORKFLOW_CREDENTIALS');
assert(workflow.includes('fetch-depth: 0'), 'WORKFLOW_FULL_HISTORY_REQUIRED');
assert(workflow.includes('/kidults-asi-p1-source-preflight-v1.yml/dispatches'), 'WORKFLOW_P1_RECOVERY_DISPATCH_MISSING');
assert(workflow.includes('for ARTIFACT_ATTEMPT in {1..12}; do') && workflow.includes('EXACT_MAIN_P1_ARTIFACT_NOT_AVAILABLE'), 'WORKFLOW_P1_ARTIFACT_READBACK_BOUND_MISSING');
assert(workflow.includes('ACTIVE_P1_RUN_ID') && workflow.includes('RECOVERY_DISPATCHED=true'), 'WORKFLOW_P1_RECOVERY_REUSE_BEFORE_DISPATCH_MISSING');
assert(workflow.includes("group: kidults-asi-autonomous-resolution-layer-v1-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.sha }}"), 'WORKFLOW_SHARED_GENERATION_CONCURRENCY');
assert(workflow.includes('cancel-in-progress: false'), 'WORKFLOW_GENERATION_LEADER_SERIALIZATION');
assert(workflow.includes('test "$P1_SOURCE_SHA" = "$TARGET_SHA"'), 'WORKFLOW_EXACT_GENERATION_BINDING');
assert(workflow.includes('exact_generation_bound:true'), 'WORKFLOW_EXACT_GENERATION_RECEIPT');
assert(!workflow.includes('/actions/artifacts?per_page=100'), 'WORKFLOW_REPOSITORY_WIDE_ARTIFACT_SCAN_FORBIDDEN');
assert(!workflow.includes('--paginate'), 'WORKFLOW_UNBOUNDED_PAGINATION_FORBIDDEN');
assert(!workflow.includes('while true'), 'WORKFLOW_UNBOUNDED_GH_API_RETRY_FORBIDDEN');
assert(!workflow.includes('sleep 15'), 'WORKFLOW_API_RETRY_SLEEP_FORBIDDEN');
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
  'REPLACEMENT_IMPLEMENTATION_AND_PROMOTION_BOUNDARY',
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
  version: registry.version,
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
