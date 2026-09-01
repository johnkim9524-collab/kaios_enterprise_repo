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
const postLandingReceiptPath = process.env.CURRENT_SOLD_RECEIPT_PATH || 'out/current-sold-postlanding/receipt.json';
const landingOutcome = process.env.LANDING_STEP_OUTCOME || null;
const postLandingOutcome = process.env.CURRENT_SOLD_POSTLANDING_OUTCOME || null;
const shaPattern = /^[0-9a-f]{40}$/;

function assert(condition, code) {
  if (!condition) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
}

assert(mode === '--initialize' || mode === '--finalize', 'ATOMIC_TERMINAL_MODE_INVALID');
assert(repository && /^[^/]+\/[^/]+$/.test(repository), 'ATOMIC_TERMINAL_REPOSITORY_INVALID');
assert(/^\d+$/.test(prNumber || ''), 'ATOMIC_TERMINAL_PR_INVALID');
assert(shaPattern.test(expectedHeadSha || ''), 'ATOMIC_TERMINAL_HEAD_INVALID');
assert(/^\d+$/.test(landingRunId || ''), 'ATOMIC_TERMINAL_RUN_ID_INVALID');
assert(/^\d+$/.test(landingRunAttempt || ''), 'ATOMIC_TERMINAL_RUN_ATTEMPT_INVALID');
assert(authorizationId === `LAND-PR-${prNumber}-${expectedHeadSha.slice(0, 12)}`, 'ATOMIC_TERMINAL_AUTHORIZATION_BINDING_INVALID');

const authorizationIdSha256 = crypto.createHash('sha256').update(authorizationId).digest('hex');
const baseReceipt = (state, terminalClass, extra = {}) => ({
  id: 'kidults-atomic-governed-landing-terminal-receipt-v2',
  version: '2.0.0',
  state,
  terminal_class: terminalClass,
  repository,
  pull_request: Number(prNumber),
  exact_head_sha: expectedHeadSha,
  landing_actor: landingActor,
  landing_workflow_run_id: Number(landingRunId),
  landing_workflow_run_attempt: Number(landingRunAttempt),
  authorization_id_sha256: authorizationIdSha256,
  raw_authorization_persisted: false,
  merge_commit_sha: null,
  premerge_main_sha: null,
  current_sold_changed: null,
  post_landing_proof: 'NOT_ESTABLISHED',
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

if (mode === '--initialize') {
  const receipt = baseReceipt('NOT_ATTEMPTED', 'PREMERGE_BINDING_STAGED', {
    premerge_binding_staged_before_mutation: true,
  });
  writeReceipt(receipt);
  console.log(JSON.stringify({ state: receipt.state, terminal_class: receipt.terminal_class, receipt_path: receiptPath }));
  process.exit(0);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kidults-atomic-landing-terminal-reconciler-v1',
};

async function request(apiPath) {
  assert(token, 'ATOMIC_TERMINAL_GITHUB_TOKEN_REQUIRED');
  const response = await fetch(`https://api.github.com/repos/${repository}${apiPath}`, { headers, redirect: 'error' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`ATOMIC_TERMINAL_GITHUB_API_${response.status}`);
    error.code = `ATOMIC_TERMINAL_GITHUB_API_${response.status}`;
    throw error;
  }
  return payload;
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

const currentSoldPathMatchers = [
  /^coordination\/kidults\/market\/current-sold-[^/]+\.json$/,
  /^scripts\/kidults\/market\/current-sold-[^/]+\.mjs$/,
  /^tests\/kidults\/market\/current-sold-[^/]+\.mjs$/,
  /^infrastructure\/postgres\/current-sold\//,
  /^docs\/kidults\/market\/current-sold-engine-v1\.md$/,
  /^\.github\/workflows\/kidults-current-sold-engine-v1\.yml$/,
  /^\.github\/workflows\/kidults-atomic-governed-landing-v1\.yml$/,
  /^scripts\/kidults\/kpmo\/run-atomic-governed-landing-v1\.mjs$/,
  /^scripts\/kidults\/kpmo\/reconcile-atomic-landing-terminal-v1\.mjs$/,
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
    });
    writeReceipt(receipt);
    console.log(JSON.stringify(receipt));
    process.exit(0);
  }

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
    state = 'VERIFIED_PASS';
    terminalClass = 'MERGE_COMMITTED_VERIFIED';
    proof = 'NOT_REQUIRED_NON_CURRENT_SOLD';
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
    current_sold_changed_file_count: currentSoldChangedFiles.length,
    landing_step_outcome: landingOutcome,
    current_sold_postlanding_outcome: postLandingOutcome,
    post_landing_proof: proof,
    merge_committed: true,
  });
  writeReceipt(receipt);
  console.log(JSON.stringify(receipt));
} catch (error) {
  const errorCode = String(error?.code || error?.message || 'ATOMIC_TERMINAL_RECONCILE_FAILED').split(':')[0].slice(0, 120);
  const receipt = baseReceipt('VERIFIED_FAIL', errorCode, {
    merge_commit_state: 'UNKNOWN_FAIL_CLOSED',
    landing_step_outcome: landingOutcome,
    current_sold_postlanding_outcome: postLandingOutcome,
  });
  try { writeReceipt(receipt); } catch {}
  console.error(errorCode);
  process.exit(1);
}
