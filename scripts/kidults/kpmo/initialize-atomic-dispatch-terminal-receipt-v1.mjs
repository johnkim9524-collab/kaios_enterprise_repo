#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const shaPattern = /^[0-9a-f]{40}$/;
const repoPattern = /^[^/]+\/[^/]+$/;
const positiveIdentity = value => (typeof value === 'string' || typeof value === 'number')
  && /^[1-9][0-9]*$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0;

const digest = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');

export function buildAtomicDispatchTerminalReceipt({
  repository,
  prNumber,
  expectedHeadSha,
  authorizationId,
  landingActor,
  landingRunId,
  landingRunAttempt,
  executionSourceSha,
  checkoutSha,
  now = new Date().toISOString(),
}) {
  const prText = String(prNumber ?? '');
  const runIdText = String(landingRunId ?? '');
  const runAttemptText = String(landingRunAttempt ?? '');
  const headText = String(expectedHeadSha ?? '');
  const authorizationText = String(authorizationId ?? '');

  const repositoryValid = repoPattern.test(String(repository ?? ''));
  const prValid = positiveIdentity(prNumber);
  const headValid = shaPattern.test(headText);
  const runIdValid = positiveIdentity(landingRunId);
  const runAttemptValid = positiveIdentity(landingRunAttempt);
  const executionBound = shaPattern.test(executionSourceSha || '')
    && checkoutSha === executionSourceSha;
  const expectedAuthorization = prValid && headValid
    ? `LAND-PR-${prText}-${headText.slice(0, 12)}`
    : null;
  const authorizationBindingValid = expectedAuthorization !== null && authorizationText === expectedAuthorization;

  let failureCode = null;
  if (!repositoryValid) failureCode = 'ATOMIC_DISPATCH_RECEIPT_REPOSITORY_INVALID';
  else if (!prValid) failureCode = 'ATOMIC_DISPATCH_RECEIPT_PR_INVALID';
  else if (!headValid) failureCode = 'ATOMIC_DISPATCH_RECEIPT_HEAD_INVALID';
  else if (!runIdValid) failureCode = 'ATOMIC_DISPATCH_RECEIPT_RUN_ID_INVALID';
  else if (!runAttemptValid) failureCode = 'ATOMIC_DISPATCH_RECEIPT_RUN_ATTEMPT_INVALID';
  else if (!executionBound) failureCode = 'ATOMIC_DISPATCH_EXECUTION_SOURCE_MISMATCH';
  else if (!authorizationBindingValid) failureCode = 'ATOMIC_TERMINAL_AUTHORIZATION_BINDING_INVALID';

  const structurallyValid = failureCode === null;
  return {
    id: 'kidults-atomic-governed-landing-terminal-receipt-v2',
    version: '2.5.0',
    state: structurallyValid ? 'DISPATCH_RECEIVED_FAIL_CLOSED' : 'VERIFIED_FAIL',
    terminal_class: structurallyValid
      ? 'PREMUTATION_DISPATCH_RECEIPT_INITIALIZED'
      : 'PREMUTATION_DISPATCH_REJECTED',
    failure_code: failureCode,
    repository: repositoryValid ? String(repository) : null,
    pull_request: prValid ? Number(prText) : null,
    exact_head_sha: headValid ? headText : null,
    execution_source_sha: shaPattern.test(executionSourceSha || '') ? executionSourceSha : null,
    checked_out_sha: shaPattern.test(checkoutSha || '') ? checkoutSha : null,
    execution_source_bound: executionBound,
    landing_actor: landingActor || null,
    landing_workflow_run_id: runIdValid ? Number(runIdText) : null,
    landing_workflow_run_attempt: runAttemptValid ? Number(runAttemptText) : null,
    authorization_id_sha256: `sha256:${digest(authorizationText)}`,
    authorization_binding_valid: authorizationBindingValid,
    raw_authorization_persisted: false,
    merge_commit_sha: null,
    premerge_main_sha: null,
    current_sold_changed: null,
    post_landing_proof: 'NOT_ESTABLISHED',
    merge_committed: false,
    empirical_authority_created: false,
    provider_authority_created: false,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
    created_at: now,
  };
}

export function writeAtomicDispatchTerminalReceipt(receipt, receiptPath) {
  const directory = path.dirname(receiptPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${receiptPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'w' });
  fs.chmodSync(temporaryPath, 0o600);
  fs.renameSync(temporaryPath, receiptPath);
  fs.chmodSync(receiptPath, 0o600);
}

async function main() {
  const receiptPath = process.env.ATOMIC_LANDING_TERMINAL_RECEIPT_PATH
    || path.join(process.env.RUNNER_TEMP || '/tmp', 'kidults-atomic-landing-terminal', 'receipt.json');
  let checkoutSha = null;
  try {
    checkoutSha = execFileSync('git', ['--no-replace-objects', '-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD'], {
      encoding:'utf8', timeout:5000, stdio:['ignore','pipe','ignore'],
      env:{PATH:'/usr/bin:/bin', GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:'/dev/null', GIT_TERMINAL_PROMPT:'0'},
    }).trim();
  } catch {} // Still retain a nonauthorizing failure receipt when checkout cannot be bound.
  const receipt = buildAtomicDispatchTerminalReceipt({
    executionSourceSha: process.env.GITHUB_SHA,
    checkoutSha,
    repository: process.env.GH_REPOSITORY || process.env.GITHUB_REPOSITORY,
    prNumber: process.env.PR_NUMBER,
    expectedHeadSha: process.env.EXPECTED_HEAD_SHA,
    authorizationId: process.env.LANDING_AUTHORIZATION_ID,
    landingActor: process.env.LANDING_ACTOR || process.env.GITHUB_ACTOR,
    landingRunId: process.env.GITHUB_RUN_ID,
    landingRunAttempt: process.env.GITHUB_RUN_ATTEMPT,
  });
  writeAtomicDispatchTerminalReceipt(receipt, receiptPath);
  console.log(JSON.stringify(receipt));
  if (receipt.state === 'VERIFIED_FAIL') process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
