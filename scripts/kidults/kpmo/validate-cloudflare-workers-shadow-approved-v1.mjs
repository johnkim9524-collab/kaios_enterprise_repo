#!/usr/bin/env node
import fs from 'node:fs';

const AUTH_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-one-shot-authorization-20260831-v1.json';
const WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v1.yml';
const APPROVAL_ID = 'CF-WORKERS-SHADOW-20260831-01';
const CONSUMED_RUN_ID = 33410598558;
const CONSUMED_SHA = 'e5efb9435e4a8847927791ae4fc9b580b75506c1';
const RECEIPT_PATH = '${{ runner.temp }}/kidults-cloudflare-workers-shadow-spent-authorization-receipt.json';

const fail = (message) => { throw new Error(`CLOUDFLARE_WORKERS_SHADOW_TOMBSTONE_FAIL:${message}`); };
const ok = (condition, message) => { if (!condition) fail(message); };

for (const file of [AUTH_PATH, WORKFLOW_PATH]) ok(fs.existsSync(file), `MISSING_FILE:${file}`);
const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');

function validateAuthorization(value) {
  ok(value.id === APPROVAL_ID, 'APPROVAL_ID');
  ok(value.version === '1.1.0', 'APPROVAL_VERSION');
  ok(value.status === 'CONSUMED_FAILED_BEFORE_PROVIDER_ATTEMPT', 'APPROVAL_MUST_BE_CONSUMED');
  ok(value.authorization_receipt?.issue_number === 1702, 'APPROVAL_RECEIPT_ISSUE');
  ok(value.authorization_receipt?.comment_id === 5480203136, 'APPROVAL_RECEIPT_COMMENT');
  ok(value.authorized_scope?.dispatch_count_max === 1, 'HISTORICAL_DISPATCH_BOUND');
  ok(value.authorized_scope?.provider_deployment_attempt_count_max === 1, 'HISTORICAL_PROVIDER_ATTEMPT_BOUND');
  ok(value.authorized_scope?.authorization_consumed_on === 'FIRST_WORKFLOW_DISPATCH_PASS_OR_FAIL', 'CONSUMPTION_SEMANTICS');
  ok(value.replay === 'FORBIDDEN_AFTER_FIRST_WORKFLOW_DISPATCH_REGARDLESS_OF_TERMINAL_STATE', 'REPLAY_RULE');

  const consumption = value.consumption || {};
  ok(consumption.state === 'CONSUMED_FAILED_BEFORE_PROVIDER_ATTEMPT', 'CONSUMPTION_STATE');
  ok(consumption.run_id === CONSUMED_RUN_ID, 'CONSUMED_RUN_ID');
  ok(consumption.run_attempt === 1, 'CONSUMED_RUN_ATTEMPT');
  ok(consumption.source_sha === CONSUMED_SHA, 'CONSUMED_SOURCE_SHA');
  ok(consumption.event === 'workflow_dispatch', 'CONSUMED_EVENT');
  ok(consumption.head_branch === 'main', 'CONSUMED_BRANCH');
  ok(consumption.authorization_consumed === true, 'AUTHORIZATION_NOT_CONSUMED');
  ok(consumption.provider_mutation_attempted === false, 'PROVIDER_MUTATION_MUST_BE_FALSE');
  ok(consumption.provider_deployment_attempt_count === 0, 'PROVIDER_ATTEMPT_COUNT_MUST_BE_ZERO');
  ok(consumption.workers_dev_readback_attempted === false, 'READBACK_ATTEMPT_MUST_BE_FALSE');
  ok(consumption.terminal_artifact_retained === false, 'HISTORICAL_ARTIFACT_MUST_REMAIN_FALSE');
  ok(consumption.failure_class === 'WORKSPACE_CHECKOUT_CLEAN_DELETED_RECEIPT', 'FAILURE_CLASS');
  ok(consumption.replay_authorized === false, 'REPLAY_AUTHORIZED');

  const retirement = value.retirement || {};
  ok(retirement.provider_execution_authorized === false, 'PROVIDER_EXECUTION_REAUTHORIZED');
  ok(retirement.credential_resolution_authorized === false, 'CREDENTIAL_RESOLUTION_REAUTHORIZED');
  ok(retirement.workflow_mode === 'NO_SECRET_TOMBSTONE_ONLY', 'WORKFLOW_MODE');
  ok(retirement.future_provider_attempt_requires_new_explicit_approval_id === true, 'NEW_APPROVAL_REQUIRED');
  ok(retirement.public === 'HOLD' && retirement.production === 'HOLD' && retirement.g5 === 'HOLD', 'RELEASE_HOLD');
}

function validateWorkflow(value) {
  ok(/^on:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n/m.test(value), 'MANUAL_TRIGGER_AND_PERMISSION_CONTRACT');
  for (const forbiddenTrigger of ['\n  push:', '\n  pull_request:', '\n  pull_request_target:', '\n  schedule:', '\n  workflow_run:', '\n  repository_dispatch:']) {
    ok(!value.includes(forbiddenTrigger), `FORBIDDEN_TRIGGER:${forbiddenTrigger.trim()}`);
  }
  ok(value.includes('spent-authorization-tombstone:'), 'TOMBSTONE_JOB_MISSING');
  ok(!value.includes('\n    environment:'), 'ENVIRONMENT_AUTHORITY_MUST_BE_REMOVED');
  ok(!value.includes('${{ secrets.'), 'SECRET_REFERENCE_MUST_BE_ZERO');
  ok(!/\bwrangler\s+deploy\b/.test(value), 'PROVIDER_DEPLOY_COMMAND_MUST_BE_REMOVED');
  ok(!value.includes('CLOUDFLARE_API_TOKEN'), 'CLOUDFLARE_TOKEN_NAME_MUST_BE_REMOVED');
  ok(!value.includes('CLOUDFLARE_ACCOUNT_ID'), 'CLOUDFLARE_ACCOUNT_NAME_MUST_BE_REMOVED');
  ok(!value.includes('workers.dev shadow read-back'), 'PROVIDER_READBACK_MUST_BE_REMOVED');
  ok(!value.includes('actions/checkout@'), 'CHECKOUT_AFTER_RECEIPT_SURFACE_MUST_BE_REMOVED');
  ok(value.includes('Emit spent one-shot fail-closed receipt'), 'FAIL_CLOSED_RECEIPT_STEP');
  ok(value.includes('authorization_consumed_by_run_id:33410598558'), 'CONSUMED_RUN_RECEIPT_BINDING');
  ok(value.includes('provider_mutation_attempted:false'), 'NO_PROVIDER_MUTATION_RECEIPT');
  ok(value.includes('provider_execution_authorized:false'), 'NO_PROVIDER_AUTHORITY_RECEIPT');
  ok(value.includes('credential_resolution_authorized:false'), 'NO_CREDENTIAL_AUTHORITY_RECEIPT');
  ok(value.includes('replay_authorized:false'), 'NO_REPLAY_RECEIPT');
  ok(value.includes('public:"HOLD"') && value.includes('production:"HOLD"') && value.includes('g5:"HOLD"'), 'RELEASE_HOLD_RECEIPT');
  ok(value.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'), 'UPLOAD_ACTION_PIN');
  ok(value.includes(`path: ${RECEIPT_PATH}`), 'RUNNER_TEMP_RECEIPT_UPLOAD');
  ok(value.includes('if-no-files-found: error'), 'MISSING_RECEIPT_MUST_FAIL');
  const upload = value.indexOf('Upload sanitized spent-authorization receipt');
  const terminalRed = value.indexOf('Preserve fail-closed no-replay verdict');
  ok(upload >= 0 && terminalRed > upload, 'UPLOAD_MUST_PRECEDE_TERMINAL_RED');
  ok(value.slice(value.indexOf('Upload sanitized spent-authorization receipt'), terminalRed).includes('if: ${{ always() }}'), 'UPLOAD_MUST_BE_ALWAYS');
  ok(value.slice(terminalRed).includes('exit 78'), 'TERMINAL_RED_REQUIRED');
}

validateAuthorization(auth);
validateWorkflow(workflow);

const authMutations = [
  (value) => { value.status = 'AUTHORIZED_ONE_SHOT_NON_PRODUCTION_WORKERS_DEV_ONLY'; },
  (value) => { value.consumption.run_id = 1; },
  (value) => { value.consumption.provider_mutation_attempted = true; },
  (value) => { value.consumption.provider_deployment_attempt_count = 1; },
  (value) => { value.consumption.replay_authorized = true; },
  (value) => { value.retirement.provider_execution_authorized = true; },
  (value) => { value.retirement.credential_resolution_authorized = true; }
];
for (const mutate of authMutations) {
  const candidate = structuredClone(auth);
  mutate(candidate);
  let rejected = false;
  try { validateAuthorization(candidate); } catch { rejected = true; }
  ok(rejected, 'NEGATIVE_AUTHORIZATION_MUTATION_ACCEPTED');
}

const workflowMutations = [
  (value) => `${value}\n# ${{ secrets.CLOUDFLARE_API_TOKEN }}\n`,
  (value) => `${value}\n# wrangler deploy\n`,
  (value) => value.replace('spent-authorization-tombstone:\n', 'spent-authorization-tombstone:\n    environment: kidults-cloudflare-staging-deploy\n'),
  (value) => value.replace('if-no-files-found: error', 'if-no-files-found: ignore'),
  (value) => value.replace('path: ${{ runner.temp }}/kidults-cloudflare-workers-shadow-spent-authorization-receipt.json', 'path: artifacts/cloudflare-workers-shadow/receipt.json'),
  (value) => value.replace('exit 78', 'exit 0')
];
for (const mutate of workflowMutations) {
  const candidate = mutate(workflow);
  let rejected = false;
  try { validateWorkflow(candidate); } catch { rejected = true; }
  ok(rejected, 'NEGATIVE_WORKFLOW_MUTATION_ACCEPTED');
}

console.log(JSON.stringify({
  id: 'kidults-cloudflare-workers-shadow-spent-authorization-validation-v1',
  state: 'VERIFIED_PASS',
  approval_id: APPROVAL_ID,
  authorization_state: auth.status,
  consumed_run_id: CONSUMED_RUN_ID,
  consumed_source_sha: CONSUMED_SHA,
  provider_mutation_attempted: false,
  provider_deployment_attempt_count: 0,
  provider_execution_authorized: false,
  credential_resolution_authorized: false,
  workflow_mode: 'NO_SECRET_TOMBSTONE_ONLY',
  future_provider_attempt_requires_new_explicit_approval_id: true,
  negative_authorization_mutations_rejected: authMutations.length,
  negative_workflow_mutations_rejected: workflowMutations.length,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
