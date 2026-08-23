#!/usr/bin/env node
import fs from 'node:fs';

const files = {
  contract: 'coordination/kidults/source-intelligence/asi-candidate-preflight-contract-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-candidate-preflight-registry-v1.json',
  runner: 'scripts/kidults/source-intelligence/run-asi-candidate-preflight-wave-v1.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-candidate-preflight-wave-v1.mjs',
  workflow: '.github/workflows/kidults-asi-candidate-preflight-wave-v1.yml',
  doc: 'docs/kidults/asi/asi-candidate-preflight-wave-v1.md'
};
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (p) => fs.readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));
for (const [key, value] of Object.entries(files)) assert(fs.existsSync(value), `MISSING_${key.toUpperCase()}:${value}`);

const contract = json(files.contract);
const registry = json(files.registry);
const workflow = read(files.workflow);
const runner = read(files.runner);
const validator = read(files.validator);
const doc = read(files.doc);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

assert(contract.id === 'kidults-asi-candidate-preflight-contract-v1', 'CONTRACT_ID');
assert(registry.id === 'kidults-asi-candidate-preflight-registry-v1', 'REGISTRY_ID');
assert(registry.version === '1.0.0' && registry.owner === 'KPMO' && registry.priority === 'P1', 'REGISTRY_METADATA');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(principles), 'REGISTRY_PRINCIPLE_ORDER');
assert(JSON.stringify(registry.registered_outputs) === JSON.stringify(contract.required_outputs), 'REGISTRY_OUTPUTS');
for (const [key, expected] of Object.entries({
  contract: files.contract,
  runner: files.runner,
  validator: files.validator,
  workflow: files.workflow,
  human_readme: files.doc
})) assert(registry.registered_assets?.[key] === expected, `REGISTRY_PATH:${key}`);
assert(registry.automatic_activation?.main_push === true, 'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule === '37 * * * *', 'REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.upstream_workflow === 'KIDULTS ASI Mission Consumption Wave v1', 'REGISTRY_UPSTREAM');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');
assert(registry.rolling_execution?.unit === 'UNIQUE_CANONICAL_HOST', 'REGISTRY_EXECUTION_UNIT');
assert(registry.rolling_execution?.maximum_hosts_per_cycle === 96, 'REGISTRY_HOST_LIMIT');
assert(registry.rolling_execution?.restore_previous_ledger === true, 'REGISTRY_RESTORE');
assert(registry.rolling_execution?.skip_preflighted_hosts === true, 'REGISTRY_SKIP');
assert(registry.rolling_execution?.new_candidates_enter_next_cycle === true, 'REGISTRY_NEW_CANDIDATES');
assert(registry.rolling_execution?.all_candidates_receive_completed_or_waiting_assignment === true, 'REGISTRY_ASSIGNMENT');
for (const [key, expected] of Object.entries({
  bounded_root_and_robots_only: true,
  maximum_body_bytes: 65536,
  discovered_links_followed: false,
  market_records_collected: false,
  robots_allow_is_license: false,
  automatic_rights_pass: false,
  rights_unknown_is_explicit: true,
  network_and_access_failures_are_explicit: true,
  no_direct_repository_mutation_from_workflow: true
})) assert(registry.execution_guarantees?.[key] === expected, `REGISTRY_GUARANTEE:${key}`);

for (const marker of [
  'workflow_dispatch:',
  'schedule:',
  "cron: '37 * * * *'",
  'push:',
  'workflow_run:',
  "'KIDULTS ASI Mission Consumption Wave v1'",
  'Restore latest P0 candidate artifact and previous P1 ledger',
  'Run bounded live candidate host preflight',
  'Validate P1 candidate preflight',
  'Reject robots-as-license mutation',
  'Reject automatic-admission mutation',
  'Reject body-limit mutation',
  'Emit KPMO P1 candidate preflight receipt'
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(workflow.includes('contents: read') && !workflow.includes('contents: write'), 'WORKFLOW_CONTENT_PERMISSION');
assert(workflow.includes('persist-credentials: false') && !workflow.includes('git push'), 'WORKFLOW_REPOSITORY_MUTATION');

for (const marker of [
  'UNIQUE_CANONICAL_HOST',
  "method: 'HEAD'",
  "method: 'GET'",
  "ROBOTS_TXT",
  'maximum_body_bytes_per_get',
  'PREFLIGHT_COMPLETE_RIGHTS_REVIEW_REQUIRED',
  'UNKNOWN_NO_EXPLICIT_MACHINE_RIGHTS',
  'robots_allow_is_collection_permission: false',
  'discovered_links_followed: false',
  'market_records_collected: false'
]) assert(runner.includes(marker), `RUNNER_MARKER:${marker}`);
for (const marker of [
  'LEDGER_BODY_LIMIT',
  'LEDGER_ROBOTS_LICENSE',
  'LEDGER_LINK_FOLLOW',
  'ASSIGNMENT_RIGHTS_PASS_FORBIDDEN',
  'READINESS_ADMISSION_OVERCLAIM',
  'MANIFEST_OUTPUT_DIGEST'
]) assert(validator.includes(marker), `VALIDATOR_MARKER:${marker}`);
for (const marker of [
  '# KIDULTS ASI Candidate Preflight Wave v1',
  'P1A',
  'Unique canonical host',
  'HEAD',
  'robots.txt',
  '64 KiB',
  'Preflight ≠ Admission',
  'Robots allow ≠ License',
  'Semantic signal ≠ Evidence'
]) assert(doc.includes(marker), `DOC_MARKER:${marker}`);

for (const [key, expected] of Object.entries({
  preflight_is_admission: false,
  reachable_is_lawful_to_collect: false,
  robots_allow_is_license: false,
  terms_link_is_rights_pass: false,
  semantic_signal_is_evidence: false,
  external_market_record_collection_executed: false,
  collection_right_created: false,
  evidence_admitted: false,
  market_claim_created: false,
  public_release: 'HOLD',
  production: 'HOLD'
})) assert(registry.truth_boundary?.[key] === expected, `REGISTRY_TRUTH_BOUNDARY:${key}`);

console.log(JSON.stringify({
  id: 'kidults-asi-candidate-preflight-registry-validation-v1',
  state: 'VERIFIED_PASS',
  principles,
  maximum_hosts_per_cycle: registry.rolling_execution.maximum_hosts_per_cycle,
  maximum_body_bytes: registry.execution_guarantees.maximum_body_bytes,
  automatic_main_push: true,
  automatic_schedule: registry.automatic_activation.schedule,
  automatic_upstream_workflow: registry.automatic_activation.upstream_workflow,
  direct_repository_mutation_from_workflow: false,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
