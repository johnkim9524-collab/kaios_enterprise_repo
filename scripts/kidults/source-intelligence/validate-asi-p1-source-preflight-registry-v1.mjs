#!/usr/bin/env node
import fs from 'node:fs';

const files = {
  contract: 'coordination/kidults/source-intelligence/asi-p1-source-classification-admission-preflight-contract-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-p1-source-preflight-registry-v1.json',
  p0bContract: 'coordination/kidults/source-intelligence/asi-p0b-bounded-discovery-candidate-contract-v1.json',
  p0bRegistry: 'coordination/kidults/source-intelligence/asi-p0b-bounded-discovery-candidate-registry-v1.json',
  builder: 'scripts/kidults/source-intelligence/build-asi-p1-source-preflight-v1.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-p1-source-preflight-v1.mjs',
  runtimeTest: 'services/kidults-autonomous-intelligence/scripts/asi-p1-source-preflight-runtime-test.mjs',
  workflow: '.github/workflows/kidults-asi-p1-source-preflight-v1.yml',
  doc: 'docs/kidults/asi/asi-p1-source-preflight-v1.md'
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

assert(contract.id === 'kidults-asi-p1-source-classification-admission-preflight-contract-v1', 'CONTRACT_ID');
assert(registry.id === 'kidults-asi-p1-source-preflight-registry-v1', 'REGISTRY_ID');
assert(registry.version === '1.0.0' && registry.owner === 'KPMO' && registry.priority === 'P1', 'REGISTRY_METADATA');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLE_ORDER');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(principles), 'REGISTRY_PRINCIPLE_ORDER');
for (const [key, expected] of Object.entries({
  contract: files.contract,
  p0b_contract: files.p0bContract,
  p0b_registry: files.p0bRegistry,
  builder: files.builder,
  validator: files.validator,
  runtime_test: files.runtimeTest,
  workflow: files.workflow,
  human_readme: files.doc
})) assert(registry.registered_assets?.[key] === expected, `REGISTRY_PATH:${key}`);
assert(registry.registered_outputs?.length === 8, 'REGISTRY_OUTPUT_COUNT');
assert(registry.execution_chain?.length === 9, 'REGISTRY_EXECUTION_CHAIN');
assert(registry.automatic_activation?.main_push === true, 'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule === '52 * * * *', 'REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.upstream_workflow === 'KIDULTS ASI P0B Bounded Discovery Candidates v1', 'REGISTRY_UPSTREAM');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');
assert(registry.next_stage?.id === 'P1B_BOUNDED_SOURCE_SAFETY_PREFLIGHT_EXECUTION', 'REGISTRY_NEXT_STAGE');
assert(registry.next_stage?.required_actions?.length === 7, 'REGISTRY_NEXT_ACTIONS');

for (const marker of [
  'workflow_dispatch:', 'schedule:', "cron: '52 * * * *'", 'push:', 'workflow_run:',
  "'KIDULTS ASI P0B Bounded Discovery Candidates v1'", 'Rebuild current P0B source candidates',
  'Build P1 classification qualification and Gate 1 outputs',
  'Run all P1 tasks through actual ASI runtime alignment preflight',
  'Reject owner-hint-to-owner-fact mutation', 'Reject rights-unknown-to-allow mutation',
  'Reject region-hint-to-coverage mutation', 'Reject Gate 1 HOLD-to-PASS mutation',
  'Reject admission-candidate-to-admitted-evidence mutation', 'Emit KPMO P1 source-preflight receipt'
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(workflow.includes('contents: read') && !workflow.includes('contents: write'), 'WORKFLOW_CONTENTS_BOUNDARY');
assert(workflow.includes('persist-credentials: false') && !workflow.includes('git push'), 'WORKFLOW_MUTATION_BOUNDARY');

for (const marker of [
  'P1_CANDIDATE_REGISTRY_INVALID', 'P1_BINDING_LEDGER_INVALID', 'SOURCE_SITE_IDENTITY_OWNER_LINEAGE',
  'SOURCE_RIGHTS_COMPLIANCE_ANALYSIS', 'CANONICALIZED_ENDPOINT_OBSERVED',
  'UNKNOWN_REQUIRES_AUTHORITATIVE_CLASSIFICATION', 'ALL_CURRENT_GRAINS_HOLD_PENDING_PREFLIGHT',
  'NOT_READY_GATE1_HOLD', 'QUEUED_NOT_EXECUTED'
]) assert(builder.includes(marker), `BUILDER_MARKER:${marker}`);
for (const marker of [
  'CLASSIFICATION_CRITICAL_PASS_OVERCLAIM', 'QUALIFICATION_CRITICAL_PASS_OVERCLAIM',
  'EVENT_PAYLOAD_HASH', 'GATE1_COUNTS', 'ADMISSION_READY_OR_ADMITTED_OVERCLAIM',
  'ACTION_QUEUE_EXECUTION_OVERCLAIM', 'MANIFEST_OUTPUT_DIGEST'
]) assert(validator.includes(marker), `VALIDATOR_MARKER:${marker}`);
for (const marker of [
  'assertAsiExecutionAlignment', 'assertAsiEventPayloadHash',
  'SOURCE_CLASSIFICATION_ENGINE', 'SOURCE_RIGHTS_COMPLIANCE_ANALYSIS',
  'NOT_EXECUTED_PRELIMINARY_PREFLIGHT_ONLY'
]) assert(runtimeTest.includes(marker), `RUNTIME_TEST_MARKER:${marker}`);
for (const marker of [
  '# KIDULTS ASI P1 Source Classification and Admission Preflight v1',
  '4 Classification Tasks per Grain', '7 Qualification Tasks per Grain',
  'Gate 1 HOLD ≠ PASS or REJECT', 'Evidence Admission Candidate ≠ Admitted Evidence'
]) assert(doc.includes(marker), `DOC_MARKER:${marker}`);

for (const [key, expected] of Object.entries({
  preliminary_classification_is_authoritative_owner_or_origin_fact: false,
  runtime_preflight_is_target_site_probe: false,
  gate1_hold_is_gate1_pass: false,
  evidence_admission_candidate_is_admitted_evidence: false,
  rights_unknown_is_allow: false,
  metadata_hint_is_market_semantic_pass: false,
  public_release: 'HOLD',
  production: 'HOLD'
})) assert(registry.truth_boundary?.[key] === expected, `REGISTRY_TRUTH_BOUNDARY:${key}`);

console.log(JSON.stringify({
  id: 'kidults-asi-p1-source-preflight-registry-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  classification_fleets: contract.classification_fleets.length,
  qualification_fleets: contract.qualification_fleets.length,
  preflight_action_types: contract.preflight_actions.length,
  automatic_main_push: true,
  automatic_schedule: registry.automatic_activation.schedule,
  automatic_upstream_workflow: registry.automatic_activation.upstream_workflow,
  next_stage: registry.next_stage.id,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
