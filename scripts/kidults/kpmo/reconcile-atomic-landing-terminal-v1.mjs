#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv[2];
const repository = process.env.GH_REPOSITORY || process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN || '';
const prNumber = process.env.PR_NUMBER;
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA;
const authorizationId = process.env.LANDING_AUTHORIZATION_ID;
const landingActor = process.env.LANDING_ACTOR || process.env.GITHUB_ACTOR || null;
const landingRunId = process.env.GITHUB_RUN_ID;
const landingRunAttempt = process.env.GITHUB_RUN_ATTEMPT;
const runnerTemp = process.env.RUNNER_TEMP || '/tmp';
const receiptPath = process.env.ATOMIC_LANDING_TERMINAL_RECEIPT_PATH || path.join(runnerTemp, 'kidults-atomic-landing-terminal', 'receipt.json');
const consumptionPath = process.env.ATOMIC_LANDING_CONSUMPTION_PATH || path.join(runnerTemp, 'kidults-atomic-landing-consumption', 'receipt.json');
const postLandingReceiptPath = process.env.CURRENT_SOLD_RECEIPT_PATH || 'out/current-sold-postlanding/receipt.json';
const landingOutcome = process.env.LANDING_STEP_OUTCOME || null;
const postLandingOutcome = process.env.CURRENT_SOLD_POSTLANDING_OUTCOME || null;
const landingCurrentSoldChanged = process.env.CURRENT_SOLD_CHANGED || null;
const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^[0-9a-f]{64}$/;
const terminalStatusContext = 'KIDULTS Atomic Landing Terminal V2';
const targetUrl = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${repository || ''}/actions/runs/${landingRunId || ''}`;

function assert(condition, code) {
  if (!condition) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
}

assert(mode === '--initialize' || mode === '--finalize', 'ATOMIC_TERMINAL_MODE_INVALID');
assert(repository && /^[^/]+\/[^/]+$/.test(repository), 'ATOMIC_TERMINAL_REPOSITORY_INVALID');
assert(token, 'ATOMIC_TERMINAL_GITHUB_TOKEN_REQUIRED');
assert(/^\d+$/.test(prNumber || ''), 'ATOMIC_TERMINAL_PR_INVALID');
assert(shaPattern.test(expectedHeadSha || ''), 'ATOMIC_TERMINAL_HEAD_INVALID');
assert(/^\d+$/.test(landingRunId || ''), 'ATOMIC_TERMINAL_RUN_ID_INVALID');
assert(/^\d+$/.test(landingRunAttempt || ''), 'ATOMIC_TERMINAL_RUN_ATTEMPT_INVALID');
assert(authorizationId === `LAND-PR-${prNumber}-${expectedHeadSha.slice(0, 12)}`, 'ATOMIC_TERMINAL_AUTHORIZATION_BINDING_INVALID');

const authorizationIdSha256 = crypto.createHash('sha256').update(authorizationId).digest('hex');

function readConsumptionReceipt() {
  if (!fs.existsSync(consumptionPath)) {
    return {
      state: 'NOT_ESTABLISHED_FAIL_CLOSED',
      landing_workflow_run_id: Number(landingRunId),
      landing_workflow_run_attempt: Number(landingRunAttempt),
      authorization_id_sha256: authorizationIdSha256,
      raw_authorization_persisted: false,
    };
  }
  const text = fs.readFileSync(consumptionPath, 'utf8');
  assert(!text.includes(authorizationId), 'ATOMIC_TERMINAL_CONSUMPTION_RAW_AUTHORIZATION_LEAK');
  const receipt = JSON.parse(text);
  assert(receipt?.id === 'kidults-atomic-landing-one-use-consumption-v1', 'ATOMIC_TERMINAL_CONSUMPTION_ID_INVALID');
  assert(receipt?.state === 'CONSUMED_BY_FIRST_MATCHING_DISPATCH', 'ATOMIC_TERMINAL_CONSUMPTION_STATE_INVALID');
  assert(receipt?.repository === repository, 'ATOMIC_TERMINAL_CONSUMPTION_REPOSITORY_MISMATCH');
  assert(Number(receipt?.pull_request) === Number(prNumber), 'ATOMIC_TERMINAL_CONSUMPTION_PR_MISMATCH');
  assert(receipt?.exact_head_sha === expectedHeadSha, 'ATOMIC_TERMINAL_CONSUMPTION_HEAD_MISMATCH');
  assert(Number(receipt?.landing_workflow_run_id) === Number(landingRunId), 'ATOMIC_TERMINAL_CONSUMPTION_RUN_ID_MISMATCH');
  assert(Number(receipt?.landing_workflow_run_attempt) === Number(landingRunAttempt), 'ATOMIC_TERMINAL_CONSUMPTION_RUN_ATTEMPT_MISMATCH');
  assert(receipt?.authorization_id_sha256 === authorizationIdSha256, 'ATOMIC_TERMINAL_CONSUMPTION_AUTHORIZATION_DIGEST_MISMATCH');
  assert(digestPattern.test(receipt?.run_name_sha256 || ''), 'ATOMIC_TERMINAL_CONSUMPTION_RUN_NAME_DIGEST_INVALID');
  assert(digestPattern.test(receipt?.tuple_sha256 || ''), 'ATOMIC_TERMINAL_CONSUMPTION_TUPLE_DIGEST_INVALID');
  assert(receipt?.raw_authorization_persisted === false, 'ATOMIC_TERMINAL_CONSUMPTION_RAW_AUTHORIZATION_FORBIDDEN');
  return {
    state: receipt.state,
    exact_base_sha: receipt.exact_base_sha,
    protected_main_sha_at_dispatch: receipt.protected_main_sha_at_dispatch,
    landing_workflow_id: receipt.landing_workflow_id,
    landing_workflow_run_id: receipt.landing_workflow_run_id,
    landing_workflow_run_attempt: receipt.landing_workflow_run_attempt,
    matching_run_count: receipt.matching_run_count,
    authorization_id_sha256: receipt.authorization_id_sha256,
    run_name_sha256: receipt.run_name_sha256,
    tuple_sha256: receipt.tuple_sha256,
    consumed_at: receipt.consumed_at,
    raw_authorization_persisted: false,
  };
}

const authorizationConsumption = readConsumptionReceipt();

const baseReceipt = (state, terminalClass, extra = {}) => ({
  id: 'kidults-atomic-governed-landing-terminal-receipt-v2',
  version: '2.3.0',
  state,
  terminal_class: terminalClass,
  repository,
  pull_request: Number(prNumber),
  exact_head_sha: expectedHeadSha,
  landing_actor: landingActor,
  landing_workflow_run_id: Number(landingRunId),
  landing_workflow_run_attempt: Number(landingRunAttempt),
  authorization_id_sha256: authorizationIdSha256,
  authorization_consumption: authorizationConsumption,
  raw_authorization_persisted: false,
  merge_commit_sha: null,
  premerge_main_sha: null,
  current_sold_changed: null,
  post_landing_proof: 'NOT_ESTABLISHED',
  terminal_status_context: terminalStatusContext,
  empirical_authority_created: false,
  provider_authority_created: false,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
  ...extra,
});

function writeReceipt(receipt) {
  const directory = path.dirname(receiptPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${receiptPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'w' });
  fs.chmodSync(temporaryPath, 0o600);
  fs.renameSync(temporaryPath, receiptPath);
  fs.chmodSync(receiptPath, 0o600);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kidults-atomic-landing-terminal-reconciler-v1',
};

async function request(apiPath, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${apiPath}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
    redirect: 'error',
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`ATOMIC_TERMINAL_GITHUB_API_${response.status}`);
    error.code = `ATOMIC_TERMINAL_GITHUB_API_${response.status}`;
    throw error;
  }
  return payload;
}

async function postHeadStatus(state, description) {
  assert(['pending', 'success', 'failure'].includes(state), 'ATOMIC_TERMINAL_STATUS_STATE_INVALID');
  return request(`/statuses/${expectedHeadSha}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state,
      context: terminalStatusContext,
      description: String(description).slice(0, 140),
      target_url: targetUrl,
    }),
  });
}

async function pages(apiPath) {
  const output = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = apiPath.includes('?') ? '&' : '?';
    const values = await request(`${apiPath}${separator}per_page=100&page=${page}`);
    assert(Array.isArray(values), 'ATOMIC_TERMINAL_PAGINATION_SHAPE_INVALID');
    output.push(...values);
    if (values.length < 100) return output;
  }
  throw Object.assign(new Error('ATOMIC_TERMINAL_PAGINATION_BOUND_EXCEEDED'), { code: 'ATOMIC_TERMINAL_PAGINATION_BOUND_EXCEEDED' });
}

if (mode === '--initialize') {
  try {
    const [pr, mainBranch] = await Promise.all([
      request(`/pulls/${prNumber}`),
      request('/branches/main'),
    ]);
    assert(pr?.head?.sha === expectedHeadSha, 'ATOMIC_TERMINAL_PREMERGE_HEAD_DRIFT');
    assert(pr?.base?.ref === 'main' && shaPattern.test(pr?.base?.sha || ''), 'ATOMIC_TERMINAL_PREMERGE_BASE_INVALID');
    assert(shaPattern.test(mainBranch?.commit?.sha || ''), 'ATOMIC_TERMINAL_PREMERGE_MAIN_INVALID');
    assert(pr.base.sha === mainBranch.commit.sha, 'ATOMIC_TERMINAL_PREMERGE_MAIN_BASE_DRIFT');
    if (authorizationConsumption.state === 'CONSUMED_BY_FIRST_MATCHING_DISPATCH') {
      assert(authorizationConsumption.exact_base_sha === mainBranch.commit.sha, 'ATOMIC_TERMINAL_CONSUMPTION_BASE_DRIFT');
    }
    const receipt = baseReceipt('NOT_ATTEMPTED', 'PREMERGE_BINDING_STAGED', {
      premerge_main_sha: mainBranch.commit.sha,
      premerge_binding_staged_before_mutation: true,
      remote_intent_status: 'PENDING',
    });
    writeReceipt(receipt);
    await postHeadStatus('pending', 'Pre-merge intent staged; terminal landing proof pending');
    console.log(JSON.stringify({ state: receipt.state, terminal_class: receipt.terminal_class, receipt_path: receiptPath }));
  } catch (error) {
    const errorCode = String(error?.code || error?.message || 'ATOMIC_TERMINAL_INITIALIZE_FAILED').split(':')[0].slice(0, 120);
    try { await postHeadStatus('failure', errorCode); } catch {}
    console.error(errorCode);
    process.exit(1);
  }
  process.exit(0);
}

const currentSoldPathMatchers = [
  /^coordination\/kidults\/market\/current-sold-[^/]+\.json$/,
  /^scripts\/kidults\/market\/current-sold-[^/]+\.mjs$/,
  /^tests\/kidults\/market\/current-sold-[^/]+\.mjs$/,
  /^infrastructure\/postgres\/current-sold\//,
  /^docs\/kidults\/market\/current-sold-engine-v1\.md$/,
  /^\.github\/workflows\/kidults-current-sold-engine-v1\.yml$/,
  /^\.github\/workflows\/kidults-atomic-governed-landing-v1\.yml$/,
  /^scripts\/kidults\/kpmo\/run-atomic-governed-landing-v1\.mjs$/,
  /^scripts\/kidults\/kpmo\/run-atomic-landing-one-use-preflight-v1\.mjs$/,
  /^scripts\/kidults\/kpmo\/reconcile-atomic-landing-terminal-v1\.mjs$/,
  /^scripts\/kidults\/kpmo\/validate-workflow-repository-mutation-boundary-v1\.mjs$/,
];

try {
  const [pr, mainBranch, fileRecords] = await Promise.all([
    request(`/pulls/${prNumber}`),
    request('/branches/main'),
    pages(`/pulls/${prNumber}/files`),
  ]);
  assert(pr?.head?.sha === expectedHeadSha, 'ATOMIC_TERMINAL_PR_HEAD_DRIFT');
  assert(pr?.base?.ref === 'main' && shaPattern.test(pr?.base?.sha || ''), 'ATOMIC_TERMINAL_PR_BASE_INVALID');
  assert(fileRecords.every(record => typeof record?.filename === 'string'), 'ATOMIC_TERMINAL_FILE_SHAPE_INVALID');
  const changedFiles = fileRecords.map(record => record.filename);
  const currentSoldChangedFiles = changedFiles.filter(file => currentSoldPathMatchers.some(pattern => pattern.test(file)));
  const currentSoldChanged = currentSoldChangedFiles.length > 0;

  if (pr?.merged !== true) {
    const receipt = baseReceipt('MERGE_REJECTED', 'MERGE_NOT_COMMITTED', {
      premerge_main_sha: pr.base.sha,
      current_sold_changed: currentSoldChanged,
      current_sold_changed_file_count: currentSoldChangedFiles.length,
      landing_step_outcome: landingOutcome,
      remote_intent_status: 'FAILURE',
    });
    writeReceipt(receipt);
    await postHeadStatus('failure', 'Merge rejected or not committed; no landing authority');
    console.log(JSON.stringify(receipt));
    process.exit(0);
  }

  assert(landingCurrentSoldChanged === 'true' || landingCurrentSoldChanged === 'false', 'ATOMIC_TERMINAL_CURRENT_SOLD_OUTPUT_INVALID');
  assert(currentSoldChanged === (landingCurrentSoldChanged === 'true'), 'ATOMIC_TERMINAL_CURRENT_SOLD_CLASSIFICATION_DRIFT');

  const mergeSha = pr?.merge_commit_sha;
  assert(shaPattern.test(mergeSha || ''), 'ATOMIC_TERMINAL_MERGE_SHA_INVALID');
  const exactMainMatchesMerge = mainBranch?.commit?.sha === mergeSha;
  let postLandingReceipt = null;
  if (currentSoldChanged && fs.existsSync(postLandingReceiptPath)) {
    postLandingReceipt = JSON.parse(fs.readFileSync(postLandingReceiptPath, 'utf8'));
    assert(postLandingReceipt?.exact_merge_sha === mergeSha, 'ATOMIC_TERMINAL_POSTLANDING_MERGE_SHA_MISMATCH');
    assert(postLandingReceipt?.merged_pr_head_sha === expectedHeadSha, 'ATOMIC_TERMINAL_POSTLANDING_HEAD_MISMATCH');
    assert(Number(postLandingReceipt?.pull_request) === Number(prNumber), 'ATOMIC_TERMINAL_POSTLANDING_PR_MISMATCH');
  }

  let state = 'MERGE_COMMITTED_PROOF_PENDING';
  let terminalClass = exactMainMatchesMerge ? 'POSTLANDING_PROOF_PENDING' : 'POSTMERGE_MAIN_READBACK_MISMATCH';
  let proof = 'PENDING';
  if (!currentSoldChanged && landingOutcome === 'success' && exactMainMatchesMerge) {
    state = 'MERGE_COMMITTED_PROOF_PENDING';
    terminalClass = 'MERGE_COMMITTED_POSTLANDING_PROOF_PENDING';
    proof = 'EXACT_MERGE_SHA_PUSH_SUITE_REQUIRED';
  } else if (currentSoldChanged && postLandingReceipt?.state === 'VERIFIED_PASS' && postLandingOutcome === 'success' && exactMainMatchesMerge) {
    state = 'VERIFIED_PASS';
    terminalClass = 'MERGE_COMMITTED_POSTLANDING_VERIFIED';
    proof = 'VERIFIED_PASS';
  } else if (currentSoldChanged && (postLandingReceipt?.state === 'VERIFIED_FAIL' || postLandingOutcome === 'failure')) {
    state = 'VERIFIED_FAIL';
    terminalClass = 'MERGE_COMMITTED_POSTLANDING_FAILED';
    proof = 'VERIFIED_FAIL';
  }

  const receipt = baseReceipt(state, terminalClass, {
    merge_commit_sha: mergeSha,
    premerge_main_sha: pr.base.sha,
    current_protected_main_sha_at_finalize: mainBranch?.commit?.sha || null,
    current_sold_changed: currentSoldChanged,
    landing_current_sold_changed: landingCurrentSoldChanged === 'true',
    current_sold_classifier_consistent: true,
    current_sold_changed_file_count: currentSoldChangedFiles.length,
    landing_step_outcome: landingOutcome,
    current_sold_postlanding_outcome: postLandingOutcome,
    post_landing_proof: proof,
    merge_committed: true,
    remote_intent_status: state === 'VERIFIED_PASS' ? 'SUCCESS' : state === 'VERIFIED_FAIL' ? 'FAILURE' : 'PENDING',
  });
  writeReceipt(receipt);
  if (state === 'VERIFIED_PASS') {
    await postHeadStatus('success', 'Atomic landing terminal proof verified');
  } else if (state === 'VERIFIED_FAIL') {
    await postHeadStatus('failure', terminalClass);
  } else {
    await postHeadStatus('pending', terminalClass);
  }
  console.log(JSON.stringify(receipt));
} catch (error) {
  const errorCode = String(error?.code || error?.message || 'ATOMIC_TERMINAL_RECONCILE_FAILED').split(':')[0].slice(0, 120);
  const receipt = baseReceipt('VERIFIED_FAIL', errorCode, {
    merge_commit_state: 'UNKNOWN_FAIL_CLOSED',
    landing_step_outcome: landingOutcome,
    current_sold_postlanding_outcome: postLandingOutcome,
    remote_intent_status: 'FAILURE',
  });
  try { writeReceipt(receipt); } catch {}
  try { await postHeadStatus('failure', errorCode); } catch {}
  console.error(errorCode);
  process.exit(1);
}
