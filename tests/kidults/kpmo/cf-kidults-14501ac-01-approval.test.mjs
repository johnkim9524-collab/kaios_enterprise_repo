#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const approvalPath = 'coordination/kidults/runtime/cf-kidults-14501ac-01-approval.json';
const scriptPath = 'scripts/ops/cloudflare-pages-cf-kidults-14501ac-01.sh';
const workflowPath = '.github/workflows/kpmo-cloudflare-preview-retire-and-governed-staging-v1.yml';
const consumeWorkflowPath = '.github/workflows/kpmo-cloudflare-approval-consume-v1.yml';
const preflightPath = '.github/workflows/kpmo-cf-kidults-14501ac-01-preflight.yml';
const ledgerBindingPath = 'coordination/kidults/runtime/cf-kidults-14501ac-01-ledger-binding-v1.json';
const futureActivationPath = 'coordination/kidults/runtime/cloudflare-external-one-shot-approval-future-activation-v1.json';
const genericContractPath = 'coordination/kidults/governance/external-one-shot-approval-ledger-v1.json';
const genericClientPath = 'scripts/governance/external-one-shot-approval-ledger-v1.mjs';
const ledgerServicePath = 'services/kidults-cloudflare-approval-trust-root/src/index.mjs';
for (const path of [approvalPath, scriptPath, workflowPath, consumeWorkflowPath, preflightPath, ledgerBindingPath, futureActivationPath, genericContractPath, genericClientPath, ledgerServicePath]) {
  assert.equal(fs.existsSync(path), true, `missing ${path}`);
}

const approval = JSON.parse(fs.readFileSync(approvalPath, 'utf8'));
assert.equal(approval.state, 'PROGRAM_OWNER_EXPLICIT_ONE_SHOT_APPROVAL');
assert.equal(approval.approval_id, 'CF-KIDULTS-14501AC-01');
assert.equal(approval.source_event_id, 'CF-KIDULTS-14501AC-01');
assert.equal(approval.source_text_sha256, 'sha256:69bb0b446992e067269b36beb11f936f52e2a08d104d94d9f9940f2a6c9ad71f');
assert.equal(approval.one_time, true);
assert.equal(approval.durable_consumption.required, true);
assert.equal(approval.durable_consumption.signed_exact_binding_state_receipt, 'BLOCKED_NOT_ISSUED');
assert.equal(approval.durable_consumption.repository_boolean_is_authority, false);
assert.equal(approval.durable_consumption.rerun, 'HOLD');
assert.equal(approval.target_sha, '14501ac022bdd7c918924a207f257b047b1ba970');
assert.equal(approval.max_materialized_preview_deletions, 588);
assert.equal(approval.authorization.read_only_parity_preflight, true);
assert.equal(approval.authorization.delete_materialized_preview_only, true);
assert.equal(approval.authorization.preserve_all_production_deployments, true);
assert.equal(approval.authorization.governed_staging_deploy_once, true);
assert.equal(approval.authorization.final_read_only_verification, true);
assert.equal(approval.forbidden.enable_automatic_git_deployments, true);
assert.equal(approval.forbidden.delete_production_deployments, true);
assert.equal(approval.forbidden.delete_pages_project, true);
assert.equal(approval.truth_boundary.public_release, 'HOLD');
assert.equal(approval.truth_boundary.production, 'HOLD');
assert.equal(approval.truth_boundary.g5, 'HOLD');
assert.ok(Date.parse(approval.expires_at) > Date.parse(approval.observed_at));

const script = fs.readFileSync(scriptPath, 'utf8');
assert.match(script, /MAX_PREVIEW_DELETIONS=.*588/);
assert.match(script, /select\(\.environment == "preview" and \.materialized == true\)/);
assert.match(script, /--url-query "force=true"/);
assert.match(script, /PRODUCTION_HISTORY_CHANGED_DURING_PREVIEW_CLEANUP/);
assert.match(script, /FINAL_PRODUCTION_HISTORY_MISSING_IDS/);
assert.match(script, /production_deployments_enabled == false/);
assert.match(script, /preview_deployment_setting == "none"/);
assert.match(script, /ONE_TIME_APPROVAL_REPLAY_REFUSED/);
assert.match(script, /SIGNED_EXACT_APPROVAL_RECEIPT_MISSING_NO_RERUN/);
assert.match(script, /external-one-shot-approval-ledger-v1\.mjs verify/);
assert.match(script, /RESPONSE_PUBLIC_KEY_PIN_UNPROVISIONED_NO_RERUN/);
assert.ok(script.indexOf('VALIDATE_EXTERNAL_DURABLE_CONSUMPTION') < script.indexOf('current_stage="TOKEN_VERIFY"'));
assert.match(script, /PROVIDER_HTTP_401/);
assert.match(script, /PROVIDER_HTTP_403/);
assert.match(script, /PROVIDER_HTTP_404/);
assert.match(script, /PROVIDER_HTTP_5XX/);
assert.match(script, /PROVIDER_TRANSPORT_OR_TIMEOUT/);
assert.equal(script.includes('--request PATCH'), false);
assert.equal(script.includes('cf_request DELETE "$API_ROOT"'), false);

const workflow = fs.readFileSync(workflowPath, 'utf8');
assert.match(workflow, /workflows: \["KPMO Cloudflare External One-Shot Approval Consume v1"\]/);
assert.match(workflow, /contains\(github\.event\.workflow_run\.head_commit\.message, 'CF-KIDULTS-14501AC-01'\)/);
assert.match(workflow, /environment: kidults-cloudflare-staging-deploy/);
assert.match(workflow, /Verify live main before provider credential resolution/);
assert.match(workflow, /Execute one-shot Preview retirement and governed STAGING/);
assert.match(workflow, /test "\$GITHUB_RUN_ATTEMPT" = "1"/);
assert.match(workflow, /ref: 14501ac022bdd7c918924a207f257b047b1ba970/);
assert.match(workflow, /approval_id=CF-KIDULTS-14501AC-01/);
assert.equal(workflow.includes('workflow_dispatch:'), false);
assert.match(workflow, /&&\s*false/);
assert.match(workflow, /Block current lane until signed exact-binding receipt delivery exists/);
assert.match(workflow, /Materialize exact triggering signed receipt artifact/);
assert.match(workflow, /Verify downloaded exact signed consume receipt before provider credentials/);
assert.ok(workflow.indexOf('Verify downloaded exact signed consume receipt before provider credentials') < workflow.indexOf('CLOUDFLARE_API_TOKEN'));

const consumeWorkflow = fs.readFileSync(consumeWorkflowPath, 'utf8');
assert.match(consumeWorkflow, /environment: kidults-approval-ledger-consume/);
assert.match(consumeWorkflow, /Validate historical approval is not reusable/);
assert.match(consumeWorkflow, /Generate exact consume request from externally issued activation binding/);
assert.match(consumeWorkflow, /kidults-external-one-shot-approval-activation-binding-v1/);
assert.match(consumeWorkflow, /exit 78/);
assert.match(consumeWorkflow, /Consume external durable approval atomically/);
assert.match(consumeWorkflow, /if: \$\{\{ false \}\}/);
assert.match(consumeWorkflow, /KIDULTS_APPROVAL_LEDGER_REQUEST_HMAC_KEY_B64/);
assert.match(consumeWorkflow, /KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PUBLIC_KEY_B64/);
assert.match(consumeWorkflow, /KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PUBLIC_KEY_SHA256/);
assert.equal(consumeWorkflow.includes('KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PRIVATE_KEY_B64'), false);
assert.match(consumeWorkflow, /node scripts\/governance\/external-one-shot-approval-ledger-v1\.mjs consume/);
assert.match(consumeWorkflow, /Upload exact signed consume receipt for downstream verification/);
assert.ok(consumeWorkflow.indexOf('Validate historical approval is not reusable') < consumeWorkflow.indexOf('KIDULTS_APPROVAL_LEDGER_REQUEST_HMAC_KEY_B64'));

const ledgerBinding = JSON.parse(fs.readFileSync(ledgerBindingPath, 'utf8'));
assert.equal(ledgerBinding.state, 'HISTORICAL_CONSUMED_BACKFILL_REQUIRED');
assert.equal(ledgerBinding.external_ledger_contract, 'coordination/kidults/governance/external-one-shot-approval-ledger-v1.json');
assert.equal(ledgerBinding.target.target_digest, 'sha256:373a95517f07ad5db7a78085737f00ff2077ce9bda4ad729feca70ee2dc775d3');
assert.equal(ledgerBinding.backfill_policy.required_external_state, 'CONSUMED');
assert.equal(ledgerBinding.backfill_policy.active_or_reissued_state_forbidden, true);
assert.equal(ledgerBinding.backfill_policy.repository_boolean_is_authority, false);
assert.equal(ledgerBinding.backfill_policy.signed_exact_binding_state_receipt.state, 'BLOCKED_NOT_ISSUED');
assert.equal(ledgerBinding.response_verification.algorithm, 'Ed25519');
assert.equal(ledgerBinding.response_verification.public_key_spki_sha256, 'UNPROVISIONED');
assert.equal(ledgerBinding.response_verification.github_private_signing_key_forbidden, true);
assert.match(ledgerBinding.historical_consumption.approval_expires_at, /Z$/);
assert.match(ledgerBinding.historical_consumption.consumed_at, /Z$/);
assert.equal(Object.hasOwn(ledgerBinding.historical_consumption, 'github_run_id'), true);
assert.equal(Object.hasOwn(ledgerBinding.historical_consumption, 'github_run_attempt'), true);
assert.equal(Object.hasOwn(ledgerBinding.historical_consumption, 'workflow_run_id'), false);
assert.equal(Object.hasOwn(ledgerBinding.historical_consumption, 'workflow_run_attempt'), false);
assert.equal(ledgerBinding.runtime_state, 'BLOCKED_EXTERNAL_LEDGER_NOT_DEPLOYED_BACKFILLED_KEY_PINNED_OR_SIGNED_READBACK_VERIFIED');
assert.equal(ledgerBinding.cloudflare_mutation_rerun, 'HOLD');

const futureActivation = JSON.parse(fs.readFileSync(futureActivationPath, 'utf8'));
assert.match(futureActivation.state, /^BLOCKED_/);
assert.equal(futureActivation.version, '1.2.0');
assert.equal(futureActivation.global_no_rerun.state, 'HOLD');
assert.equal(futureActivation.global_no_rerun.scope, 'ALL_REPOSITORY_CLOUDFLARE_MUTATION_ENTRYPOINTS');
assert.equal(futureActivation.global_no_rerun.provider_calls_authorized, false);
assert.equal(futureActivation.mutation_lanes.length, 3);
assert.equal(futureActivation.mutation_lanes.every(lane => lane.hard_disabled === true), true);
assert.deepEqual(futureActivation.future_required_chain.map(item => item.step), [
  'GENERATE_EXACT_CONSUME_REQUEST',
  'ATOMIC_EXTERNAL_CONSUME',
  'UPLOAD_SIGNED_RECEIPT_ARTIFACT',
  'DOWNLOAD_EXACT_TRIGGERING_RECEIPT',
  'VERIFY_RECEIPT_BEFORE_PROVIDER_CREDENTIALS'
]);
assert.equal(futureActivation.authority_rules.repository_boolean_is_authority, false);
assert.equal(futureActivation.historical_readback_requirement.signed_409_is_exact_record_proof, false);
assert.equal(futureActivation.unsafe_endpoints.issue, false);
assert.equal(futureActivation.unsafe_endpoints.reset, false);
assert.equal(futureActivation.unsafe_endpoints.delete, false);

const allGithubWorkflows = fs.readdirSync('.github/workflows')
  .filter(name => /\.ya?ml$/.test(name))
  .map(name => fs.readFileSync(path.join('.github/workflows', name), 'utf8'))
  .join('\n');
assert.equal(allGithubWorkflows.includes('KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PRIVATE_KEY_B64'), false);
assert.equal(fs.readFileSync(genericClientPath, 'utf8').includes('KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PRIVATE_KEY_B64'), false);
assert.match(fs.readFileSync(ledgerServicePath, 'utf8'), /KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PRIVATE_KEY_B64/);

const harnessRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-durable-approval-'));
try {
  const bin = path.join(harnessRoot, 'bin');
  const source = path.join(harnessRoot, 'source');
  const providerMarker = path.join(harnessRoot, 'provider-called');
  fs.mkdirSync(bin);
  fs.mkdirSync(source);
  const fakeCurl = path.join(bin, 'curl');
  fs.writeFileSync(fakeCurl, `#!/usr/bin/env bash\nprintf called > ${JSON.stringify(providerMarker)}\nexit 99\n`, { mode: 0o700 });

  const futureApprovalPath = path.join(harnessRoot, 'future-approval.json');
  const futureApproval = structuredClone(approval);
  futureApproval.expires_at = new Date(Date.now() + 60_000).toISOString();
  fs.writeFileSync(futureApprovalPath, `${JSON.stringify(futureApproval)}\n`);

  const runBlockedCase = ({ approvalReceiptPath, runAttempt, id }) => {
    fs.rmSync(providerMarker, { force: true });
    const result = spawnSync('bash', [scriptPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        APPROVAL_RECEIPT_PATH: approvalReceiptPath,
        APPROVAL_LEDGER_BINDING_PATH: ledgerBindingPath,
        SOURCE_DIR: source,
        RECEIPT_ROOT: path.join(harnessRoot, `receipt-${id}`),
        CLOUDFLARE_API_TOKEN: 'fixture-token-never-used',
        CLOUDFLARE_ACCOUNT_ID: '235eaa51d04e7f4436a9faa507a04f9d',
        EXPECTED_CLOUDFLARE_ACCOUNT_ID: '235eaa51d04e7f4436a9faa507a04f9d',
        GITHUB_RUN_ATTEMPT: String(runAttempt),
        GITHUB_SHA: 'a'.repeat(40)
      }
    });
    assert.notEqual(result.status, 0, `${id} must fail closed`);
    assert.equal(fs.existsSync(providerMarker), false, `${id} must make zero Cloudflare calls`);
  };

  runBlockedCase({ approvalReceiptPath: approvalPath, runAttempt: 1, id: 'expired' });
  runBlockedCase({ approvalReceiptPath: futureApprovalPath, runAttempt: 2, id: 'replay' });
  runBlockedCase({ approvalReceiptPath: futureApprovalPath, runAttempt: 1, id: 'external-not-verified' });
} finally {
  fs.rmSync(harnessRoot, { recursive: true, force: true });
}

const preflight = fs.readFileSync(preflightPath, 'utf8');
assert.match(preflight, /pull_request:/);
assert.match(preflight, /push:/);
assert.match(preflight, /node tests\/kidults\/kpmo\/cf-kidults-14501ac-01-approval\.test\.mjs/);
assert.match(preflight, /bash -n scripts\/ops\/cloudflare-pages-cf-kidults-14501ac-01\.sh/);

console.log(JSON.stringify({
  suite: 'CF_KIDULTS_14501AC_01_APPROVAL_AND_EXECUTION_BOUNDARY',
  result: 'PASS',
  explicit_operation_specific_approval: true,
  exact_target_sha: true,
  max_materialized_preview_deletions: 588,
  production_history_preservation: true,
  fail_closed_provider_classes: ['401','403','404','5xx','timeout'],
  one_time_replay_guard: true,
  external_atomic_ledger_reference_implemented: true,
  trust_root_complete: false,
  historical_signed_readback: 'BLOCKED_NOT_ISSUED',
  historical_consumed_backfill_required: true,
  rejected_provider_call_count: 0,
  cloudflare_rerun: 'HOLD',
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
