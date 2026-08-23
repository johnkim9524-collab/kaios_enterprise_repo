#!/usr/bin/env node
import fs from 'node:fs';

const files = {
  contract: 'coordination/kidults/source-intelligence/asi-snapshot-readiness-factory-contract-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-snapshot-readiness-factory-registry-v1.json',
  builder: 'scripts/kidults/source-intelligence/build-asi-snapshot-readiness-factory-v1.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-snapshot-readiness-factory-v1.mjs',
  workflow: '.github/workflows/kidults-asi-snapshot-readiness-factory-v1.yml',
  doc: 'docs/kidults/asi/asi-snapshot-readiness-factory-v1.md'
};
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
for (const [key, file] of Object.entries(files)) assert(fs.existsSync(file), `MISSING_${key.toUpperCase()}:${file}`);

const contract = json(files.contract);
const registry = json(files.registry);
const builder = read(files.builder);
const validator = read(files.validator);
const workflow = read(files.workflow);
const doc = read(files.doc);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

assert(contract.id === 'kidults-asi-snapshot-readiness-factory-contract-v1', 'CONTRACT_ID');
assert(registry.id === 'kidults-asi-snapshot-readiness-factory-registry-v1', 'REGISTRY_ID');
assert(registry.version === '1.0.0' && registry.owner === 'KPMO' && registry.priority === 'P3', 'REGISTRY_METADATA');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(principles), 'REGISTRY_PRINCIPLE_ORDER');
assert(JSON.stringify(registry.registered_outputs) === JSON.stringify(contract.required_outputs), 'REGISTRY_OUTPUTS');
assert(JSON.stringify(registry.forbidden_outputs) === JSON.stringify(contract.forbidden_outputs), 'REGISTRY_FORBIDDEN_OUTPUTS');
for (const [key, expected] of Object.entries({
  contract: files.contract,
  builder: files.builder,
  validator: files.validator,
  workflow: files.workflow,
  human_readme: files.doc
})) assert(registry.registered_assets?.[key] === expected, `REGISTRY_PATH:${key}`);
assert(registry.automatic_activation?.main_push === true, 'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule === '7 * * * *', 'REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.upstream_workflow === 'KIDULTS ASI Owned Source Intelligence Graph v1', 'REGISTRY_UPSTREAM');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');
for (const [key, expected] of Object.entries({
  restore_latest_main_p0_artifact: true,
  restore_latest_main_p1_artifact: true,
  restore_latest_main_p2_artifact: true,
  deterministic_two_run_replay: true,
  all_eleven_readiness_dimensions_evaluated: true,
  all_open_blockers_have_unblock_conditions: true,
  admission_demands_bound_to_candidate_or_mission_refs: true,
  snapshot_file_absence_enforced_when_gate_fails: true,
  track_b_input_pair_absence_explicit: true,
  no_direct_repository_mutation_from_workflow: true
})) assert(registry.execution_guarantees?.[key] === expected, `REGISTRY_GUARANTEE:${key}`);

for (const marker of [
  'workflow_dispatch:',
  'schedule:',
  "cron: '7 * * * *'",
  'push:',
  'workflow_run:',
  "'KIDULTS ASI Owned Source Intelligence Graph v1'",
  'Restore latest main P0, P1 and P2 artifacts',
  'Build snapshot readiness factory twice',
  'Validate P3 snapshot readiness and file absence',
  'Reject false snapshot-candidate file mutation',
  'Reject false evidence admission mutation',
  'Reject Track B assessment-start mutation',
  'Reject missing blocker mutation',
  'Emit KPMO P3 readiness receipt'
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(workflow.includes('contents: read') && !workflow.includes('contents: write'), 'WORKFLOW_CONTENT_PERMISSION');
assert(workflow.includes('persist-credentials: false') && !workflow.includes('git push'), 'WORKFLOW_REPOSITORY_MUTATION');

for (const marker of [
  'NOT_READY_NO_ADMITTED_EVIDENCE',
  'SNAPSHOT_NOT_GENERATED_FAIL_CLOSED',
  'WAITING_FOR_SNAPSHOT_CANDIDATE_AND_EVIDENCE_PACKAGE',
  'EVIDENCE_ADMISSION_ZERO',
  'CURRENT_SOLD_TRANSACTION_EVIDENCE_ZERO',
  'LIQUIDITY_EVIDENCE_ZERO',
  'MARKET_EVENT_GRAPH_ZERO',
  'snapshot_candidate_generated: false',
  'evidence_package_generated: false',
  'track_b_assessment_started: false'
]) assert(builder.includes(marker), `BUILDER_MARKER:${marker}`);
for (const marker of [
  'FORBIDDEN_OUTPUT_EXISTS',
  'LEDGER_ZERO_GATE',
  'BLOCKER_REQUIRED',
  'BLOCKER_PACKAGE_DIGEST',
  'DEMAND_PACKAGE_DIGEST',
  'NON_GENERATION_DIGEST',
  'TRACK_B_ASSESSMENT_OVERCLAIM',
  'MANIFEST_OUTPUT_DIGEST'
]) assert(validator.includes(marker), `VALIDATOR_MARKER:${marker}`);
for (const marker of [
  '# KIDULTS ASI Snapshot Readiness Factory v1',
  'P3',
  '11 readiness dimensions',
  'Immutable Blocker Package',
  'Admission Demand Package',
  'Snapshot Non-Generation Receipt',
  'Track B Handoff Readiness',
  'No Snapshot File When Gate Fails',
  'Blocker Package ≠ Evidence Package'
]) assert(doc.includes(marker), `DOC_MARKER:${marker}`);

for (const [key, expected] of Object.entries({
  readiness_ledger_is_snapshot_candidate: false,
  blocker_package_is_evidence_package: false,
  admission_demand_package_is_admission: false,
  non_generation_receipt_is_snapshot_candidate: false,
  track_b_waiting_state_is_assessment: false,
  snapshot_candidate_generated: false,
  evidence_package_generated: false,
  track_b_assessment_started: false,
  evidence_admitted: false,
  market_event_created: false,
  market_claim_created: false,
  public_release: 'HOLD',
  production: 'HOLD'
})) assert(registry.truth_boundary?.[key] === expected, `REGISTRY_TRUTH_BOUNDARY:${key}`);

console.log(JSON.stringify({
  id: 'kidults-asi-snapshot-readiness-factory-registry-validation-v1',
  state: 'VERIFIED_PASS',
  principles,
  readiness_dimensions: contract.readiness_dimensions.length,
  required_outputs: registry.registered_outputs.length,
  forbidden_outputs: registry.forbidden_outputs,
  automatic_main_push: true,
  automatic_schedule: registry.automatic_activation.schedule,
  automatic_upstream_workflow: registry.automatic_activation.upstream_workflow,
  direct_repository_mutation_from_workflow: false,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
