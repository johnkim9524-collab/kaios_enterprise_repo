#!/usr/bin/env node
import fs from 'node:fs';

const files = {
  contract: 'coordination/kidults/source-intelligence/asi-autonomous-resolution-contract-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-autonomous-resolution-registry-v1.json',
  builder: 'scripts/kidults/source-intelligence/build-asi-autonomous-resolution-layer-v1.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-autonomous-resolution-layer-v1.mjs',
  registryValidator: 'scripts/kidults/source-intelligence/validate-asi-autonomous-resolution-registry-v1.mjs',
  workflow: '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml',
  doc: 'docs/kidults/asi/asi-autonomous-resolution-layer-v1.md'
};
const fail = (m) => { throw new Error(m); };
const assert = (c,m) => { if (!c) fail(m); };
const text = (p) => fs.readFileSync(p,'utf8');
const json = (p) => JSON.parse(text(p));
for (const [name,p] of Object.entries(files)) assert(fs.existsSync(p),`MISSING_${name.toUpperCase()}:${p}`);

const contract = json(files.contract);
const registry = json(files.registry);
const workflow = text(files.workflow);
const builder = text(files.builder);
const validator = text(files.validator);
const doc = text(files.doc);
const principles = ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
const engines = [
  'RIGHTS_RESOLUTION_ENGINE',
  'SEMANTIC_RESOLUTION_ENGINE',
  'FACTUAL_ORIGIN_RESOLUTION_ENGINE',
  'EVIDENCE_ADMISSION_ENGINE',
  'ACTION_DEPENDENCY_GRAPH_ENGINE',
  'RESOLUTION_SCHEDULER',
  'RESOLUTION_LEARNING_ENGINE'
];

assert(contract.id === 'kidults-asi-autonomous-resolution-contract-v1' && contract.version === '1.0.0', 'CONTRACT_ID_VERSION');
assert(registry.id === 'kidults-asi-autonomous-resolution-registry-v1' && registry.version === '1.0.0', 'REGISTRY_ID_VERSION');
assert(registry.owner === 'KPMO' && registry.priority === 'P0', 'REGISTRY_AUTHORITY');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(principles), 'REGISTRY_PRINCIPLES');
assert(JSON.stringify(registry.registered_engines) === JSON.stringify(engines), 'REGISTRY_ENGINES');
assert(JSON.stringify(contract.engines.map((engine) => engine.engine_id)) === JSON.stringify(engines), 'CONTRACT_ENGINE_ORDER');
assert(registry.input_artifacts?.length === 3, 'REGISTRY_INPUT_ARTIFACT_COUNT');
assert(registry.output_artifact === 'kidults-asi-autonomous-resolution-layer-v1', 'REGISTRY_OUTPUT_ARTIFACT');

for (const [name, expected] of Object.entries({
  contract: files.contract,
  registry: files.registry,
  builder: files.builder,
  validator: files.validator,
  registry_validator: files.registryValidator,
  workflow: files.workflow,
  human_policy: files.doc
})) assert(registry.registered_assets?.[name] === expected, `REGISTRY_PATH:${name}`);

assert(registry.automatic_activation?.main_push === true, 'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule === '22 * * * *', 'REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');
assert(JSON.stringify(registry.automatic_activation?.upstream_workflows) === JSON.stringify(['KIDULTS ASI P1 Source Preflight v1','KIDULTS ASI Owned Source Intelligence Graph v2']), 'REGISTRY_UPSTREAM');
assert(registry.continuation?.next_workflow === 'KIDULTS ASI Snapshot Readiness Factory v2', 'REGISTRY_NEXT_WORKFLOW');
assert(registry.continuation?.automatic_continuation_required === true, 'REGISTRY_CONTINUATION_REQUIRED');

for (const marker of [
  'workflow_dispatch:',
  'schedule:',
  "cron: '22 * * * *'",
  'push:',
  'workflow_run:',
  "'KIDULTS ASI P1 Source Preflight v1'",
  "'KIDULTS ASI Owned Source Intelligence Graph v2'",
  'Build autonomous resolution twice',
  'Reject metadata-created rights PASS mutation',
  'Reject discovery-metadata-as-market-evidence mutation',
  'Reject host-as-factual-origin-independence mutation',
  'Reject false Gate 1 PASS mutation',
  'Reject false evidence admission mutation',
  'Reject target-host-egress mutation',
  'Reject manual-only activation mutation',
  'Emit KPMO autonomous-resolution receipt'
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(workflow.includes('contents: read'), 'WORKFLOW_READ_ONLY');
assert(!workflow.includes('contents: write'), 'WORKFLOW_WRITE_FORBIDDEN');
assert(workflow.includes('persist-credentials: false'), 'WORKFLOW_CREDENTIALS');
assert(!workflow.includes('git push'), 'WORKFLOW_DIRECT_PUSH_FORBIDDEN');

for (const marker of [
  'kidults-asi-action-dependency-graph-v1',
  'kidults-asi-rights-resolution-ledger-v1',
  'kidults-asi-semantic-resolution-ledger-v1',
  'kidults-asi-factual-origin-resolution-ledger-v1',
  'kidults-asi-resolution-schedule-v1',
  'kidults-asi-resolution-learning-ledger-v1',
  'kidults-asi-gate1-resolution-ledger-v1',
  'kidults-asi-evidence-admission-resolution-ledger-v1'
]) assert(builder.includes(marker), `BUILDER_MARKER:${marker}`);
for (const marker of ['GATE1_FALSE_PASS','ADMISSION_FALSE_ELIGIBILITY_OR_ADMISSION','DEPENDENCY_ORPHAN_EDGE','MANIFEST_OUTPUT_DIGEST']) assert(validator.includes(marker), `VALIDATOR_MARKER:${marker}`);
for (const marker of [
  '# KIDULTS ASI Autonomous Resolution Layer v1',
  'Rights Resolution Engine',
  'Semantic Resolution Engine',
  'Factual-Origin Resolution Engine',
  'Evidence Admission Engine',
  'Action Dependency Graph',
  'Resolution Scheduler',
  'Resolution Learning',
  'Action disposition ≠ Evidence satisfaction'
]) assert(doc.includes(marker), `DOC_MARKER:${marker}`);

for (const [key, expected] of Object.entries({
  action_consumption_is_target_preflight_execution: false,
  action_disposition_is_evidence_satisfaction: false,
  semantic_negative_is_market_evidence: false,
  distinct_host_is_factual_origin_independence: false,
  gate1_pass_created: false,
  evidence_admitted: false,
  market_event_created: false,
  snapshot_candidate_created: false,
  target_host_egress_executed: false,
  public_release: 'HOLD',
  production: 'HOLD'
})) assert(registry.truth_boundary?.[key] === expected, `REGISTRY_TRUTH_BOUNDARY:${key}`);

console.log(JSON.stringify({
  id: 'kidults-asi-autonomous-resolution-registry-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  engines_registered: engines.length,
  input_artifacts: registry.input_artifacts.length,
  automatic_main_push: true,
  automatic_schedule: registry.automatic_activation.schedule,
  automatic_upstream_workflows: registry.automatic_activation.upstream_workflows.length,
  automatic_continuation_required: true,
  direct_repository_mutation: false,
  target_host_egress_executed: false,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
