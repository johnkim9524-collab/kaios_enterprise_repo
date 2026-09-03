#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  assertLandingActorAndAuthorization,
  selectExactHeadProgramOwnerApproval,
} from './lib/governed-landing-native-gates-v1.mjs';
import {
  selectLatestDirectOwnerReadyEvent,
} from './lib/direct-owner-ready-event-v1.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const AUTHORIZATION_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const MAX_WORKFLOW_RUN_PAGES = 10;
const EXPECTED_EVENT = 'workflow_dispatch';
const EXPECTED_BRANCH = 'main';

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  error.detail = detail;
  throw error;
}

function assert(condition, code, detail = '') {
  if (!condition) fail(code, detail);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function buildAtomicLandingRunName({prNumber, headSha, authorizationId} = {}) {
  assert(/^\d+$/.test(String(prNumber || '')), 'ATOMIC_ONE_USE_PR_INVALID');
  assert(SHA_PATTERN.test(headSha || ''), 'ATOMIC_ONE_USE_HEAD_INVALID');
  const expectedAuthorization = `LAND-PR-${prNumber}-${headSha.slice(0, 12)}`;
  assert(authorizationId === expectedAuthorization, 'ATOMIC_ONE_USE_AUTHORIZATION_ID_INVALID');
  return `KIDULTS Atomic Landing PR #${prNumber} @ ${headSha} / ${authorizationId}`;
}

export function assertAtomicLandingDispatchAuthority(currentRun, repositoryOwner) {
  assert(typeof repositoryOwner === 'string' && repositoryOwner.length > 0, 'ATOMIC_ONE_USE_REPOSITORY_OWNER_INVALID');
  assert(currentRun && typeof currentRun === 'object' && !Array.isArray(currentRun), 'ATOMIC_ONE_USE_CURRENT_RUN_INVALID');
  const dispatchActor = currentRun?.actor?.login;
  const triggeringActor = currentRun?.triggering_actor?.login;
  assert(dispatchActor === repositoryOwner, 'ATOMIC_ONE_USE_DISPATCH_ACTOR_NOT_OWNER');
  assert(triggeringActor === repositoryOwner, 'ATOMIC_ONE_USE_TRIGGERING_ACTOR_NOT_OWNER');
  return {
    dispatch_actor: dispatchActor,
    triggering_actor: triggeringActor,
    repository_owner: repositoryOwner,
  };
}

export function evaluateAtomicLandingOneUseRunSet(runs, {
  currentRunId,
  currentRunAttempt,
  workflowId,
  expectedRunName,
  protectedMainShaAtDispatch,
} = {}) {
  assert(Array.isArray(runs), 'ATOMIC_ONE_USE_RUN_SET_INVALID');
  assert(/^\d+$/.test(String(currentRunId || '')), 'ATOMIC_ONE_USE_CURRENT_RUN_ID_INVALID');
  assert(/^\d+$/.test(String(workflowId || '')), 'ATOMIC_ONE_USE_WORKFLOW_ID_INVALID');
  assert(Number(currentRunAttempt) === 1, 'ATOMIC_LANDING_RERUN_ATTEMPT_FORBIDDEN');
  assert(typeof expectedRunName === 'string' && expectedRunName.length > 0, 'ATOMIC_ONE_USE_RUN_NAME_INVALID');
  assert(SHA_PATTERN.test(protectedMainShaAtDispatch || ''), 'ATOMIC_ONE_USE_DISPATCH_MAIN_SHA_INVALID');

  // The authorization tuple is PR + exact candidate head + authorization ID,
  // encoded by the immutable run-name. It remains consumed even after protected
  // main advances. Filtering prior runs by run.head_sha would allow the same
  // authorization to be dispatched again on the next main generation.
  const matches = runs.filter(run =>
    Number(run?.workflow_id) === Number(workflowId)
    && run?.event === EXPECTED_EVENT
    && run?.head_branch === EXPECTED_BRANCH
    && run?.display_title === expectedRunName);

  const currentMatches = matches.filter(run => Number(run?.id) === Number(currentRunId));
  if (currentMatches.length !== 1) {
    fail('ATOMIC_LANDING_CURRENT_RUN_CARDINALITY_INVALID', String(currentMatches.length));
  }
  const current = currentMatches[0];
  assert(current?.head_sha === protectedMainShaAtDispatch, 'ATOMIC_ONE_USE_CURRENT_RUN_MAIN_SHA_MISMATCH');
  assert(Number(current?.run_attempt) === 1, 'ATOMIC_LANDING_MATCHING_RUN_ATTEMPT_INVALID');

  if (matches.length > 1) {
    fail('ATOMIC_LANDING_AUTHORIZATION_ALREADY_CONSUMED', String(matches.length));
  }

  return {
    matching_run_count: 1,
    matching_run_id: Number(current.id),
    matching_run_attempt: Number(current.run_attempt),
    matching_run_status: current.status || null,
    matching_run_conclusion: current.conclusion || null,
  };
}

export function assertAtomicLandingConsumptionReceipt(receipt, {
  repository,
  repositoryOwner,
  prNumber,
  headSha,
  baseSha,
  authorizationId,
  runId,
  runAttempt,
  expectedRunName,
} = {}) {
  assert(receipt && typeof receipt === 'object' && !Array.isArray(receipt), 'ATOMIC_CONSUMPTION_RECEIPT_INVALID');
  assert(receipt.id === 'kidults-atomic-landing-one-use-consumption-v1', 'ATOMIC_CONSUMPTION_RECEIPT_ID_INVALID');
  assert(receipt.version === '1.2.0', 'ATOMIC_CONSUMPTION_RECEIPT_VERSION_INVALID');
  assert(receipt.state === 'CONSUMED_BY_FIRST_MATCHING_DISPATCH', 'ATOMIC_CONSUMPTION_STATE_INVALID');
  assert(receipt.repository === repository, 'ATOMIC_CONSUMPTION_REPOSITORY_MISMATCH');
  assert(Number(receipt.pull_request) === Number(prNumber), 'ATOMIC_CONSUMPTION_PR_MISMATCH');
  assert(receipt.exact_head_sha === headSha, 'ATOMIC_CONSUMPTION_HEAD_MISMATCH');
  assert(receipt.exact_base_sha === baseSha, 'ATOMIC_CONSUMPTION_BASE_MISMATCH');
  assert(receipt.protected_main_sha_at_dispatch === baseSha, 'ATOMIC_CONSUMPTION_DISPATCH_MAIN_MISMATCH');
  assert(Number(receipt.landing_workflow_run_id) === Number(runId), 'ATOMIC_CONSUMPTION_RUN_ID_MISMATCH');
  assert(Number(receipt.landing_workflow_run_attempt) === Number(runAttempt), 'ATOMIC_CONSUMPTION_RUN_ATTEMPT_MISMATCH');
  assert(receipt.authorization_id_sha256 === sha256(authorizationId), 'ATOMIC_CONSUMPTION_AUTHORIZATION_DIGEST_MISMATCH');
  assert(AUTHORIZATION_DIGEST_PATTERN.test(receipt.authorization_id_sha256 || ''), 'ATOMIC_CONSUMPTION_AUTHORIZATION_DIGEST_INVALID');
  assert(receipt.run_name_sha256 === sha256(expectedRunName), 'ATOMIC_CONSUMPTION_RUN_NAME_DIGEST_MISMATCH');
  assert(typeof receipt.dispatch_actor === 'string' && receipt.dispatch_actor.length > 0, 'ATOMIC_CONSUMPTION_DISPATCH_ACTOR_INVALID');
  assert(typeof receipt.triggering_actor === 'string' && receipt.triggering_actor.length > 0, 'ATOMIC_CONSUMPTION_TRIGGERING_ACTOR_INVALID');
  assert(receipt.dispatch_actor === receipt.triggering_actor, 'ATOMIC_CONSUMPTION_ACTOR_BINDING_MISMATCH');
  if (repositoryOwner != null) {
    assert(receipt.dispatch_actor === repositoryOwner, 'ATOMIC_CONSUMPTION_DISPATCH_ACTOR_NOT_OWNER');
    assert(receipt.triggering_actor === repositoryOwner, 'ATOMIC_CONSUMPTION_TRIGGERING_ACTOR_NOT_OWNER');
  }
  const expectedTupleDigest = sha256([
    repository,
    prNumber,
    baseSha,
    headSha,
    authorizationId,
    runId,
    runAttempt,
    receipt.dispatch_actor,
    receipt.triggering_actor,
  ].join('\n'));
  assert(receipt.tuple_sha256 === expectedTupleDigest, 'ATOMIC_CONSUMPTION_TUPLE_DIGEST_MISMATCH');
  assert(receipt.raw_authorization_persisted === false, 'ATOMIC_CONSUMPTION_RAW_AUTHORIZATION_FORBIDDEN');
  assert(receipt.matching_run_count === 1, 'ATOMIC_CONSUMPTION_MATCHING_RUN_COUNT_INVALID');
  assert(receipt.pr_head_matches_input === true, 'ATOMIC_CONSUMPTION_PR_HEAD_BINDING_INVALID');
  assert(receipt.pr_base_matches_dispatch_main === true, 'ATOMIC_CONSUMPTION_PR_BASE_BINDING_INVALID');
  assert(receipt.live_main_matches_dispatch_main === true, 'ATOMIC_CONSUMPTION_LIVE_MAIN_BINDING_INVALID');
  assert(receipt.complete_owner_approval_contract_validated_before_consumption === true,
    'ATOMIC_CONSUMPTION_OWNER_APPROVAL_PREFLIGHT_MISSING');
  assert(receipt.program_owner_approval && typeof receipt.program_owner_approval === 'object',
    'ATOMIC_CONSUMPTION_OWNER_APPROVAL_RECEIPT_INVALID');
  return receipt;
}

function writeReceipt(receipt, receiptPath) {
  const directory = path.dirname(receiptPath);
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const temporaryPath = `${receiptPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  fs.renameSync(temporaryPath, receiptPath);
  fs.chmodSync(receiptPath, 0o600);
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

async function main() {
  const token = process.env.GH_TOKEN;
  const repository = process.env.GH_REPOSITORY || process.env.GITHUB_REPOSITORY;
  const prNumber = process.env.PR_NUMBER;
  const headSha = process.env.EXPECTED_HEAD_SHA;
  const authorizationId = process.env.LANDING_AUTHORIZATION_ID;
  const landingActor = process.env.LANDING_ACTOR || process.env.GITHUB_ACTOR;
  const runId = process.env.GITHUB_RUN_ID;
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
  const receiptPath = process.env.ATOMIC_LANDING_CONSUMPTION_PATH;

  assert(token, 'ATOMIC_ONE_USE_GITHUB_TOKEN_REQUIRED');
  assert(repository && /^[^/]+\/[^/]+$/.test(repository), 'ATOMIC_ONE_USE_REPOSITORY_INVALID');
  assert(/^\d+$/.test(prNumber || ''), 'ATOMIC_ONE_USE_PR_INVALID');
  assert(SHA_PATTERN.test(headSha || ''), 'ATOMIC_ONE_USE_HEAD_INVALID');
  assert(landingActor, 'ATOMIC_ONE_USE_LANDING_ACTOR_REQUIRED');
  assert(/^\d+$/.test(runId || ''), 'ATOMIC_ONE_USE_RUN_ID_INVALID');
  assert(Number(runAttempt) === 1, 'ATOMIC_LANDING_RERUN_ATTEMPT_FORBIDDEN');
  assert(receiptPath, 'ATOMIC_ONE_USE_RECEIPT_PATH_REQUIRED');

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kidults-atomic-landing-one-use-preflight-v1',
  };

  const request = async apiPath => {
    const response = await fetch(`https://api.github.com/repos/${repository}${apiPath}`, {
      headers,
      redirect: 'error',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) fail(`ATOMIC_ONE_USE_GITHUB_API_${response.status}`, apiPath);
    return payload;
  };

  const [repositoryState, currentRun] = await Promise.all([
    request(''),
    request(`/actions/runs/${runId}`),
  ]);
  const repositoryOwner = repositoryState?.owner?.login;
  assertLandingActorAndAuthorization(landingActor, repositoryOwner, authorizationId, prNumber, headSha);
  const dispatchAuthority = assertAtomicLandingDispatchAuthority(currentRun, repositoryOwner);
  const expectedRunName = buildAtomicLandingRunName({prNumber, headSha, authorizationId});
  assert(Number(currentRun?.id) === Number(runId), 'ATOMIC_ONE_USE_CURRENT_RUN_ID_MISMATCH');
  assert(Number(currentRun?.run_attempt) === 1, 'ATOMIC_LANDING_RERUN_ATTEMPT_FORBIDDEN');
  assert(currentRun?.event === EXPECTED_EVENT, 'ATOMIC_ONE_USE_CURRENT_RUN_EVENT_INVALID');
  assert(currentRun?.head_branch === EXPECTED_BRANCH, 'ATOMIC_ONE_USE_CURRENT_RUN_BRANCH_INVALID');
  assert(SHA_PATTERN.test(currentRun?.head_sha || ''), 'ATOMIC_ONE_USE_CURRENT_RUN_MAIN_SHA_INVALID');
  assert(currentRun?.display_title === expectedRunName, 'ATOMIC_ONE_USE_CURRENT_RUN_NAME_MISMATCH');
  assert(Number.isInteger(Number(currentRun?.workflow_id)) && Number(currentRun.workflow_id) > 0, 'ATOMIC_ONE_USE_WORKFLOW_ID_INVALID');

  const loadWorkflowRuns = async () => {
    for (let visibilityAttempt = 1; visibilityAttempt <= 4; visibilityAttempt += 1) {
      const runs = [];
      for (let page = 1; page <= MAX_WORKFLOW_RUN_PAGES; page += 1) {
        const payload = await request(
          `/actions/workflows/${currentRun.workflow_id}/runs?event=${EXPECTED_EVENT}&branch=${EXPECTED_BRANCH}&per_page=100&page=${page}`,
        );
        assert(Array.isArray(payload?.workflow_runs), 'ATOMIC_ONE_USE_WORKFLOW_RUNS_SHAPE_INVALID');
        runs.push(...payload.workflow_runs);
        if (payload.workflow_runs.length < 100) break;
        if (page === MAX_WORKFLOW_RUN_PAGES) fail('ATOMIC_ONE_USE_WORKFLOW_RUNS_PAGINATION_BOUND_EXCEEDED');
      }
      if (runs.some(run => Number(run?.id) === Number(runId))) return runs;
      await new Promise(resolve => setTimeout(resolve, 250 * visibilityAttempt));
    }
    fail('ATOMIC_LANDING_CURRENT_RUN_NOT_DISCOVERABLE');
  };

  const runs = await loadWorkflowRuns();
  const oneUse = evaluateAtomicLandingOneUseRunSet(runs, {
    currentRunId: runId,
    currentRunAttempt: runAttempt,
    workflowId: currentRun.workflow_id,
    expectedRunName,
    protectedMainShaAtDispatch: currentRun.head_sha,
  });

  const [pr, mainBranch, timeline, approvalComments, headCommit] = await Promise.all([
    request(`/pulls/${prNumber}`),
    request('/branches/main'),
    request(`/issues/${prNumber}/timeline?per_page=100`),
    request(`/issues/${prNumber}/comments?per_page=100`),
    request(`/commits/${headSha}`),
  ]);

  const exactBaseSha = pr?.base?.sha;
  const liveMainSha = mainBranch?.commit?.sha;
  assert(SHA_PATTERN.test(exactBaseSha || ''), 'ATOMIC_ONE_USE_PR_BASE_SHA_INVALID');
  assert(SHA_PATTERN.test(liveMainSha || ''), 'ATOMIC_ONE_USE_LIVE_MAIN_SHA_INVALID');
  assert(pr?.state === 'open' && pr?.merged !== true && pr?.draft === false, 'ATOMIC_ONE_USE_PR_NOT_READY_OPEN_UNMERGED');
  assert(pr?.head?.sha === headSha, 'ATOMIC_ONE_USE_PR_HEAD_MISMATCH');
  assert(pr?.base?.ref === EXPECTED_BRANCH, 'ATOMIC_ONE_USE_PR_BASE_REF_INVALID');
  assert(exactBaseSha === currentRun.head_sha, 'ATOMIC_ONE_USE_PR_BASE_DISPATCH_MAIN_DRIFT');
  assert(liveMainSha === currentRun.head_sha, 'ATOMIC_ONE_USE_LIVE_MAIN_DRIFT');

  const latestReady = selectLatestDirectOwnerReadyEvent({timeline, repositoryOwner});
  const programOwnerApproval = selectExactHeadProgramOwnerApproval(approvalComments, {
    repository,
    repositoryOwner,
    prNumber,
    headSha,
    baseSha: exactBaseSha,
    authorizationId,
    prCreatedAt: pr.created_at,
    headCommittedAt: headCommit?.commit?.committer?.date || headCommit?.commit?.author?.date,
    latestReadyAt: latestReady.created_at,
    evaluationTime: new Date().toISOString(),
  });

  const finalPr = await request(`/pulls/${prNumber}`);
  const finalMain = await request('/branches/main');
  assert(finalPr?.state === 'open' && finalPr?.merged !== true && finalPr?.draft === false,
    'ATOMIC_ONE_USE_PR_DRIFT_DURING_CONSUMPTION');
  assert(finalPr?.head?.sha === headSha && finalPr?.base?.sha === exactBaseSha,
    'ATOMIC_ONE_USE_PR_DRIFT_DURING_CONSUMPTION');
  assert(finalMain?.commit?.sha === liveMainSha, 'ATOMIC_ONE_USE_MAIN_DRIFT_DURING_CONSUMPTION');

  const receipt = {
    id: 'kidults-atomic-landing-one-use-consumption-v1',
    version: '1.2.0',
    state: 'CONSUMED_BY_FIRST_MATCHING_DISPATCH',
    repository,
    pull_request: Number(prNumber),
    exact_head_sha: headSha,
    exact_base_sha: exactBaseSha,
    protected_main_sha_at_dispatch: currentRun.head_sha,
    live_protected_main_sha_at_consumption: liveMainSha,
    landing_workflow_id: Number(currentRun.workflow_id),
    landing_workflow_run_id: Number(runId),
    landing_workflow_run_attempt: Number(runAttempt),
    matching_run_count: oneUse.matching_run_count,
    dispatch_actor: dispatchAuthority.dispatch_actor,
    triggering_actor: dispatchAuthority.triggering_actor,
    authorization_id_sha256: sha256(authorizationId),
    run_name_sha256: sha256(expectedRunName),
    tuple_sha256: sha256([
      repository,
      prNumber,
      exactBaseSha,
      headSha,
      authorizationId,
      runId,
      runAttempt,
      dispatchAuthority.dispatch_actor,
      dispatchAuthority.triggering_actor,
    ].join('\n')),
    raw_authorization_persisted: false,
    pr_head_matches_input: pr?.head?.sha === headSha,
    pr_base_ref_is_main: pr?.base?.ref === EXPECTED_BRANCH,
    pr_base_matches_dispatch_main: exactBaseSha === currentRun.head_sha,
    live_main_matches_dispatch_main: liveMainSha === currentRun.head_sha,
    program_owner_approval: programOwnerApproval,
    complete_owner_approval_contract_validated_before_consumption: true,
    consumed_at: new Date().toISOString(),
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };

  assert(receipt.pr_head_matches_input, 'ATOMIC_ONE_USE_PR_HEAD_MISMATCH');
  assert(receipt.pr_base_ref_is_main, 'ATOMIC_ONE_USE_PR_BASE_REF_INVALID');
  assert(receipt.pr_base_matches_dispatch_main, 'ATOMIC_ONE_USE_PR_BASE_DISPATCH_MAIN_DRIFT');
  assert(receipt.live_main_matches_dispatch_main, 'ATOMIC_ONE_USE_LIVE_MAIN_DRIFT');

  assertAtomicLandingConsumptionReceipt(receipt, {
    repository,
    repositoryOwner,
    prNumber,
    headSha,
    baseSha: exactBaseSha,
    authorizationId,
    runId,
    runAttempt,
    expectedRunName,
  });

  writeReceipt(receipt, receiptPath);
  console.log(JSON.stringify(receipt));
}

if (isDirectInvocation()) {
  main().catch(error => {
    console.error(String(error?.code || error?.message || 'ATOMIC_ONE_USE_PREFLIGHT_FAILED'));
    process.exit(1);
  });
}
