#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceWorkflowPath = '.github/workflows/p0-remote-postgres-persistence-pitr.yml';
const restoreWorkflowPath = '.github/workflows/p0-postgres-target-time-restore-verification.yml';
const containmentPath = 'coordination/kidults/runtime/postgres-standing-authorization-containment-v1.json';
const registryPath = 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json';
for (const path of [sourceWorkflowPath, restoreWorkflowPath, containmentPath, registryPath]) {
  assert.equal(fs.existsSync(path), true, `missing ${path}`);
}

const source = fs.readFileSync(sourceWorkflowPath, 'utf8');
const restore = fs.readFileSync(restoreWorkflowPath, 'utf8');
const containment = JSON.parse(fs.readFileSync(containmentPath, 'utf8'));
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function jobBlock(workflow, jobId) {
  const match = workflow.match(new RegExp(`^  ${escapeRegex(jobId)}:\\n([\\s\\S]*?)(?=^  [A-Za-z0-9_-]+:\\n|\\Z)`, 'm'));
  assert.ok(match, `missing job ${jobId}`);
  return `  ${jobId}:\n${match[1]}`;
}

const sourceContainmentJob = jobBlock(source, 'fail-closed-activation-containment');
const sourceCredentialedJob = jobBlock(source, 'remote-persistence-pitr-fixture');
const restoreContainmentJob = jobBlock(restore, 'fail-closed-target-time-containment');
const restoreCredentialedJob = jobBlock(restore, 'verify-target-time-restore');

assert.equal(containment.state, 'FAIL_CLOSED_CONTAINED');
assert.deepEqual(containment.issues, [1481, 1482]);
assert.equal(containment.repository, 'johnkim9524-collab/kaios_enterprise_repo');
assert.equal(containment.validated_base_main_sha, '06a0b646f3cbbadbbba204afbf7a911c8c9ebf41');
assert.equal(containment.root_cause, 'REPLAYABLE_STANDING_BOOLEAN_ACCEPTED_AS_CREDENTIAL_BEARING_REMOTE_EXECUTION_AUTHORITY');
assert.equal(containment.legacy_variable.name, 'KIDULTS_REMOTE_POSTGRES_AUTO_ACTIVATION_AUTHORIZED');
assert.equal(containment.legacy_variable.repository_code_accepts_as_executable_authority, false);
assert.equal(containment.legacy_variable.external_value_read_by_containment, false);
assert.equal(containment.legacy_variable.external_false_readback_still_required, true);
assert.equal(containment.legacy_variable.required_external_value, 'false');
assert.equal(containment.contained_workflows.length, 2);
for (const lane of containment.contained_workflows) {
  assert.equal(lane.job_condition, '${{ false }}');
  assert.equal(lane.provider_environment_entered, false);
  assert.equal(lane.provider_secrets_resolved, false);
  assert.equal(lane.ssh_executed, false);
  assert.equal(lane.database_contacted, false);
}
assert.equal(containment.containment_receipts.always_emit_non_secret, true);
assert.equal(containment.containment_receipts.if_no_files_found, 'error');
assert.equal(containment.mutation_by_containment.provider_environment_entered, false);
assert.equal(containment.mutation_by_containment.provider_secrets_read, false);
assert.equal(containment.mutation_by_containment.ssh_executed, false);
assert.equal(containment.mutation_by_containment.database_contacted, false);
assert.equal(containment.mutation_by_containment.remote_mutation_performed, false);
assert.equal(containment.mutation_by_containment.external_variable_mutated, false);
assert.equal(containment.mutation_by_containment.credential_mutated, false);
assert.equal(containment.truth_boundary.source_fixture_receipt, 'NONE');
assert.equal(containment.truth_boundary.target_time_restore_receipt, 'NONE');
assert.equal(containment.truth_boundary.pitr, 'NOT_PROVEN');
assert.equal(containment.truth_boundary.production, 'HOLD');
assert.equal(containment.truth_boundary.public, 'HOLD');
assert.equal(containment.truth_boundary.g5, 'HOLD');

for (const [name, workflow, containmentJob, credentialedJob] of [
  ['source', source, sourceContainmentJob, sourceCredentialedJob],
  ['restore', restore, restoreContainmentJob, restoreCredentialedJob]
]) {
  assert.match(credentialedJob, /if: \$\{\{ false \}\}/, `${name} credentialed job must be unreachable`);
  assert.match(credentialedJob, /environment: kidults-do-staging-ssh/);
  assert.match(credentialedJob, /Verify explicit STAGING activation authorization before secret resolution/);
  assert.match(credentialedJob, /ACTIVATION_AUTHORIZED: \$\{\{ vars\.KIDULTS_REMOTE_POSTGRES_AUTO_ACTIVATION_AUTHORIZED \}\}/);
  assert.match(credentialedJob, /test "\$ACTIVATION_AUTHORIZED" = "true"/);
  assert.match(credentialedJob, /Verify live main before provider credential resolution/);
  assert.match(credentialedJob, /test "\$LIVE_MAIN_SHA" = "\$GITHUB_SHA"/);
  assert.equal(containmentJob.includes('environment: kidults-do-staging-ssh'), false, `${name} executable containment job entered provider Environment`);
  assert.equal(containmentJob.includes('secrets.'), false, `${name} executable containment job references provider secrets`);
  assert.equal(containmentJob.includes('KIDULTS_REMOTE_POSTGRES_AUTO_ACTIVATION_AUTHORIZED'), false, `${name} executable containment job consults standing boolean`);
  assert.match(containmentJob, /if: always\(\)/);
  assert.match(containmentJob, /provider_secrets_resolved[^\n]*False/);
  assert.match(containmentJob, /database_contacted[^\n]*False/);
  assert.match(containmentJob, /pitr_proven[^\n]*False/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.equal(workflow.includes('needs.activation-readiness-receipt.outputs.authorized'), false);
}

assert.match(sourceCredentialedJob, /Materialize dedicated STAGING key/);
assert.match(sourceCredentialedJob, /SSH_PRIVATE_KEY_B64: \$\{\{ secrets\.KIDULTS_STAGING_SSH_PRIVATE_KEY_B64 \}\}/);
assert.match(sourceCredentialedJob, /Execute source PostgreSQL fixture through pinned SSH tunnel/);
assert.match(sourceCredentialedJob, /POSTGRES_DSN: \$\{\{ secrets\.KIDULTS_STAGING_POSTGRES_DSN \}\}/);
assert.equal((source.match(/if: \$\{\{ false \}\}/g) || []).length, 1);
assert.match(source, /BLOCKED_ONE_SHOT_AUTHORIZATION_REQUIRED/);
assert.match(source, /standing_boolean_consulted_by_executable_job[^\n]*False/);
assert.match(source, /source_fixture_receipt[^\n]*None/);

assert.match(restoreCredentialedJob, /Materialize dedicated STAGING key/);
assert.match(restoreCredentialedJob, /SSH_PRIVATE_KEY_B64: \$\{\{ secrets\.KIDULTS_STAGING_SSH_PRIVATE_KEY_B64 \}\}/);
assert.match(restoreCredentialedJob, /Execute target-time restore verification through pinned SSH tunnel/);
assert.match(restoreCredentialedJob, /PITR_RESTORE_DSN: \$\{\{ secrets\.KIDULTS_STAGING_POSTGRES_PITR_RESTORE_DSN \}\}/);
assert.equal((restore.match(/if: \$\{\{ false \}\}/g) || []).length, 1);
assert.match(restore, /request_metadata_is_authorization[^\n]*False/);
assert.match(restore, /request_metadata_is_restore_proof[^\n]*False/);
assert.match(restore, /target_time_restore_verified[^\n]*False/);
assert.match(restore, /target_time_restore_receipt[^\n]*None/);

const prohibitedExecutableTokens = [
  'scripts/staging/run-postgres-verifier-through-ssh-tunnel.sh',
  'scripts/staging/verify-remote-postgres-persistence-pitr.sh',
  'ssh-keyscan',
  'SSH=(',
  'scp ',
  ' psql ',
  'pg_isready',
  'KAIOS_POSTGRES_DSN',
  '.db.ondigitalocean.com',
  'source-artifact.zip',
  '/actions/artifacts/',
  'TARGET_TIME_RESTORE_VERIFIED'
];
for (const token of prohibitedExecutableTokens) {
  assert.equal(source.includes(token), false, `source workflow contains remote execution token: ${token}`);
  assert.equal(restore.includes(token), false, `restore workflow contains remote execution token: ${token}`);
}

const sourceRegistry = registry.required_environment_bindings.find((entry) => entry.workflow === sourceWorkflowPath);
assert.ok(sourceRegistry, 'source workflow registry binding missing');
assert.equal(sourceRegistry.job, 'remote-persistence-pitr-fixture');
assert.equal(sourceRegistry.environment, 'kidults-do-staging-ssh');
assert.deepEqual(sourceRegistry.required_secret_step_names, [
  'Materialize dedicated STAGING key',
  'Execute source PostgreSQL fixture through pinned SSH tunnel'
]);
assert.deepEqual(sourceRegistry.allowed_trigger_classes, ['push', 'workflow_dispatch']);
assert.equal(sourceRegistry.required_activation_guard, 'KIDULTS_REMOTE_POSTGRES_AUTO_ACTIVATION_AUTHORIZED');

const restoreRegistry = registry.required_environment_bindings.find((entry) => entry.workflow === restoreWorkflowPath);
assert.ok(restoreRegistry, 'restore workflow registry binding missing');
assert.equal(restoreRegistry.job, 'verify-target-time-restore');
assert.equal(restoreRegistry.environment, 'kidults-do-staging-ssh');
assert.deepEqual(restoreRegistry.required_secret_step_names, [
  'Materialize dedicated STAGING key',
  'Execute target-time restore verification through pinned SSH tunnel'
]);
assert.deepEqual(restoreRegistry.allowed_trigger_classes, ['workflow_dispatch']);
assert.equal(restoreRegistry.required_activation_guard, 'KIDULTS_REMOTE_POSTGRES_AUTO_ACTIVATION_AUTHORIZED');

console.log(JSON.stringify({
  suite: 'P0_POSTGRES_STANDING_AUTH_REPLAY_CONTAINMENT_V1',
  result: 'PASS',
  issues: [1481, 1482],
  standing_boolean_executable_authority: false,
  source_credentialed_job_reachable: false,
  restore_credentialed_job_reachable: false,
  provider_environment_entered: false,
  provider_secrets_resolved: false,
  ssh_executed: false,
  database_contacted: false,
  remote_mutation_performed: false,
  source_fixture_receipt: 'NONE',
  target_time_restore_receipt: 'NONE',
  pitr: 'NOT_PROVEN',
  external_variable_false_readback_required: true,
  fresh_independent_one_shot_authorization_required: true,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}, null, 2));
