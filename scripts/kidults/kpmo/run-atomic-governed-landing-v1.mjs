#!/usr/bin/env node
import fs from 'node:fs';
import {
  assertNativeRequiredContexts,
  assertLandingActorAndAuthorization,
  selectExactHeadProgramOwnerApproval,
  selectLatestProgramOwnerReadyEvent,
  assertStableFinalReread,
  evaluateRequiredCheckRuns,
} from './lib/governed-landing-native-gates-v1.mjs';
import {
  assertAtomicLandingConsumptionReceipt,
  buildAtomicLandingRunName,
  evaluateAtomicLandingOneUseRunSet,
} from './run-atomic-landing-one-use-preflight-v1.mjs';
import {
  assertChangedApprovalGenerationEquality,
} from './lib/approval-generation-equality-v1.mjs';

const token = process.env.GH_TOKEN;
const repository = process.env.GH_REPOSITORY;
const prNumber = process.env.PR_NUMBER;
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA;
const authorizationId = process.env.LANDING_AUTHORIZATION_ID;
const executionRef = process.env.GITHUB_REF;
const landingActor = process.env.LANDING_ACTOR || process.env.GITHUB_ACTOR;
const landingRunId = process.env.GITHUB_RUN_ID;
const landingRunAttempt = process.env.GITHUB_RUN_ATTEMPT;
const githubOutput = process.env.GITHUB_OUTPUT;
const consumptionPath = process.env.ATOMIC_LANDING_CONSUMPTION_PATH;
if (!token || !repository || !/^\d+$/.test(prNumber || '') || !/^[0-9a-f]{40}$/.test(expectedHeadSha || '')) {
  throw new Error('ATOMIC_LANDING_ENVIRONMENT_BINDING_INVALID');
}
if (!/^\d+$/.test(landingRunId || '') || !/^\d+$/.test(landingRunAttempt || '') || !githubOutput) {
  throw new Error('ATOMIC_LANDING_WORKFLOW_OUTPUT_BINDING_INVALID');
}
if (Number(landingRunAttempt) !== 1) throw new Error('ATOMIC_LANDING_RERUN_ATTEMPT_FORBIDDEN');
if (!consumptionPath) throw new Error('ATOMIC_LANDING_CONSUMPTION_PATH_REQUIRED');
if (executionRef !== 'refs/heads/main') throw new Error('ATOMIC_LANDING_MAIN_REF_REQUIRED');

const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json', 'utf8'));
const scopePolicy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
const context = policy.required_status_context;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kidults-atomic-governed-landing-v1',
};
const request = async (path, options = {}) => {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...options,
    headers: {...headers, ...(options.headers || {})},
    redirect: 'error',
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`GITHUB_API_${response.status}:${path}:${payload?.message || 'request_failed'}`);
  return payload;
};
const pages = async path => {
  const output = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const values = await request(`${path}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(values)) throw new Error(`PAGINATION_SHAPE_INVALID:${path}`);
    output.push(...values);
    if (values.length < 100) return output;
  }
  throw new Error(`PAGINATION_BOUND_EXCEEDED:${path}`);
};
const workflowRuns = async workflowId => {
  const output = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await request(
      `/actions/workflows/${workflowId}/runs?event=workflow_dispatch&branch=main&per_page=100&page=${page}`,
    );
    if (!Array.isArray(payload?.workflow_runs)) throw new Error('ATOMIC_ONE_USE_WORKFLOW_RUNS_SHAPE_INVALID');
    output.push(...payload.workflow_runs);
    if (payload.workflow_runs.length < 100) return output;
  }
  throw new Error('ATOMIC_ONE_USE_WORKFLOW_RUNS_PAGINATION_BOUND_EXCEEDED');
};
const checkRuns = async sha => {
  const output = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await request(`/commits/${sha}/check-runs?per_page=100&page=${page}`);
    if (!Array.isArray(payload?.check_runs)) throw new Error('CHECK_RUNS_SHAPE_INVALID');
    output.push(...payload.check_runs);
    if (payload.check_runs.length < 100) return output;
  }
  throw new Error('CHECK_RUNS_PAGINATION_BOUND_EXCEEDED');
};
const encodePath = filename => filename.split('/').map(part => encodeURIComponent(part)).join('/');
const readJsonAtRef = async (filename, ref) => {
  const payload = await request(`/contents/${encodePath(filename)}?ref=${ref}`);
  if (payload?.type !== 'file' || payload?.encoding !== 'base64' || typeof payload?.content !== 'string') {
    throw new Error(`APPROVAL_GENERATION_CONTENT_SHAPE_INVALID:${filename}`);
  }
  return JSON.parse(Buffer.from(payload.content.replace(/\s/g, ''), 'base64').toString('utf8'));
};
const publish = (state, description) => request(`/statuses/${expectedHeadSha}`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({state, context, description: String(description).slice(0, 140)}),
});

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
const isCurrentSoldPath = value => currentSoldPathMatchers.some(pattern => pattern.test(value));

const assertAtomicLandingMergeable = (pr, errorCode) => {
  const allowedStates = ['clean', 'unstable', 'has_hooks', 'blocked'];
  if (pr?.mergeable !== true || !allowedStates.includes(pr?.mergeable_state)) throw new Error(errorCode);
};

const expectedRunName = buildAtomicLandingRunName({
  prNumber,
  headSha: expectedHeadSha,
  authorizationId,
});

const readConsumptionReceipt = () => {
  if (!fs.existsSync(consumptionPath)) throw new Error('ATOMIC_LANDING_CONSUMPTION_RECEIPT_MISSING');
  return JSON.parse(fs.readFileSync(consumptionPath, 'utf8'));
};

const assertLiveOneUseConsumption = async baseSha => {
  const currentRun = await request(`/actions/runs/${landingRunId}`);
  if (currentRun?.display_title !== expectedRunName) throw new Error('ATOMIC_ONE_USE_CURRENT_RUN_NAME_MISMATCH');
  if (currentRun?.head_sha !== baseSha) throw new Error('ATOMIC_ONE_USE_CURRENT_RUN_BASE_MISMATCH');
  const oneUse = evaluateAtomicLandingOneUseRunSet(await workflowRuns(currentRun.workflow_id), {
    currentRunId: landingRunId,
    currentRunAttempt: landingRunAttempt,
    workflowId: currentRun.workflow_id,
    expectedRunName,
    protectedMainShaAtDispatch: baseSha,
  });
  const receipt = assertAtomicLandingConsumptionReceipt(readConsumptionReceipt(), {
    repository,
    prNumber,
    headSha: expectedHeadSha,
    baseSha,
    authorizationId,
    runId: landingRunId,
    runAttempt: landingRunAttempt,
    expectedRunName,
  });
  return {oneUse, receipt};
};

let statusTouched = false;
try {
  await publish('pending', 'Atomic landing final checks in progress');
  statusTouched = true;
  const repositoryState = await request('');
  assertLandingActorAndAuthorization(landingActor, repositoryState.owner?.login, authorizationId, prNumber, expectedHeadSha);
  const initial = await request(`/pulls/${prNumber}`);
  const initialMain = await request('/branches/main');
  const changedFileRecords = await pages(`/pulls/${prNumber}/files`);
  assertStableFinalReread(initial, initial, {
    repository,
    expectedHeadSha,
    noMergePolicy: policy.no_merge_policy,
  });
  if (initial.user?.login !== repositoryState.owner?.login) throw new Error('PROGRAM_OWNER_AUTHOR_REQUIRED');
  if (initial.base?.sha !== initialMain?.commit?.sha) throw new Error('ATOMIC_LANDING_BASE_NOT_CURRENT_PROTECTED_MAIN');

  const authorizationConsumption = await assertLiveOneUseConsumption(initial.base.sha);

  const approvalGeneration = await assertChangedApprovalGenerationEquality({
    files: changedFileRecords,
    readJson: filename => readJsonAtRef(filename, expectedHeadSha),
    prBaseSha: initial.base.sha,
    liveMainSha: initialMain.commit.sha,
  });
  assertAtomicLandingMergeable(initial, 'PULL_REQUEST_NOT_SERVER_MERGEABLE');

  const changedFilenames = changedFileRecords.map(value => value?.filename).filter(value => typeof value === 'string');
  if (changedFilenames.length !== changedFileRecords.length) throw new Error('PULL_REQUEST_CHANGED_FILE_SHAPE_INVALID');
  const currentSoldChangedFiles = changedFilenames.filter(isCurrentSoldPath);

  const rulesets = await request('/rulesets');
  const solo = rulesets.find(value => value.name === 'KAIOS Solo Owner Preflight' && value.enforcement === 'active');
  const protect = rulesets.find(value => value.name === 'Protect main' && value.enforcement === 'active');
  if (!solo || !protect) throw new Error('ACTIVE_PROTECTION_RULESETS_REQUIRED');
  const [soloDetail, protectDetail] = await Promise.all([
    request(`/rulesets/${solo.id}`), request(`/rulesets/${protect.id}`),
  ]);
  if ((soloDetail.bypass_actors || []).length || (protectDetail.bypass_actors || []).length) throw new Error('RULESET_BYPASS_ACTOR_FORBIDDEN');
  const statusRule = (soloDetail.rules || []).find(rule => rule.type === 'required_status_checks');
  if (!statusRule?.parameters?.strict_required_status_checks_policy) throw new Error('STRICT_REQUIRED_STATUS_POLICY_REQUIRED');
  const nativeContexts = (statusRule.parameters.required_status_checks || []).map(value => value.context);
  assertNativeRequiredContexts(nativeContexts, policy.bypass_policy.required_status_contexts);

  const statuses = await request(`/commits/${expectedHeadSha}/status`);
  const aggregator = (statuses.statuses || []).find(value => value.context === scopePolicy.required_status_context);
  if (aggregator?.state !== 'success') throw new Error('SCOPE_AWARE_AUTHORITATIVE_STATUS_NOT_SUCCESS');
  evaluateRequiredCheckRuns(await checkRuns(expectedHeadSha), scopePolicy.technical_base_contexts);

  const [timeline, approvalComments, headCommit] = await Promise.all([
    pages(`/issues/${prNumber}/timeline`),
    pages(`/issues/${prNumber}/comments`),
    request(`/commits/${expectedHeadSha}`),
  ]);
  const latestReady = selectLatestProgramOwnerReadyEvent(timeline, repositoryState.owner?.login);
  const programOwnerApproval = selectExactHeadProgramOwnerApproval(approvalComments, {
    repository,
    repositoryOwner: repositoryState.owner?.login,
    prNumber,
    headSha: expectedHeadSha,
    baseSha: initial.base.sha,
    authorizationId,
    prCreatedAt: initial.created_at,
    headCommittedAt: headCommit?.commit?.committer?.date || headCommit?.commit?.author?.date,
    latestReadyAt: latestReady.created_at,
    evaluationTime: new Date().toISOString(),
  });
  const reviews = await pages(`/pulls/${prNumber}/reviews`);
  const exactHeadBlockers = reviews.filter(review => review.commit_id === expectedHeadSha && review.state === 'CHANGES_REQUESTED');
  if (exactHeadBlockers.length) throw new Error('EXACT_HEAD_CHANGES_REQUESTED');

  const final = await request(`/pulls/${prNumber}`);
  const finalMain = await request('/branches/main');
  assertStableFinalReread(initial, final, {
    repository,
    expectedHeadSha,
    noMergePolicy: policy.no_merge_policy,
  });
  if (final.base?.sha !== finalMain?.commit?.sha || finalMain.commit.sha !== initialMain.commit.sha) {
    throw new Error('ATOMIC_LANDING_LIVE_MAIN_DRIFT');
  }
  assertAtomicLandingMergeable(final, 'FINAL_PULL_REQUEST_NOT_SERVER_MERGEABLE');

  await publish('success', 'Exact-head atomic landing authorized');
  const immediatePreMerge = await request(`/pulls/${prNumber}`);
  const immediateMain = await request('/branches/main');
  const immediateStatuses = await request(`/commits/${expectedHeadSha}/status`);
  const immediateTimeline = await pages(`/issues/${prNumber}/timeline`);
  const immediateApprovalComments = await pages(`/issues/${prNumber}/comments`);
  assertStableFinalReread(initial, immediatePreMerge, {
    repository,
    expectedHeadSha,
    noMergePolicy: policy.no_merge_policy,
  });
  if (immediatePreMerge.base?.sha !== immediateMain?.commit?.sha || immediateMain.commit.sha !== initialMain.commit.sha) {
    throw new Error('IMMEDIATE_PREMERGE_LIVE_MAIN_DRIFT');
  }
  const immediateAggregator = (immediateStatuses.statuses || []).find(value => value.context === scopePolicy.required_status_context);
  if (immediateAggregator?.state !== 'success') throw new Error('IMMEDIATE_PREMERGE_SCOPE_STATUS_DRIFT');
  evaluateRequiredCheckRuns(await checkRuns(expectedHeadSha), scopePolicy.technical_base_contexts);
  await assertChangedApprovalGenerationEquality({
    files: changedFileRecords,
    readJson: filename => readJsonAtRef(filename, expectedHeadSha),
    prBaseSha: immediatePreMerge.base.sha,
    liveMainSha: immediateMain.commit.sha,
  });

  const immediateReady = selectLatestProgramOwnerReadyEvent(immediateTimeline, repositoryState.owner?.login);
  const immediateProgramOwnerApproval = selectExactHeadProgramOwnerApproval(immediateApprovalComments, {
    repository,
    repositoryOwner: repositoryState.owner?.login,
    prNumber,
    headSha: expectedHeadSha,
    baseSha: immediatePreMerge.base.sha,
    authorizationId,
    prCreatedAt: immediatePreMerge.created_at,
    headCommittedAt: headCommit?.commit?.committer?.date || headCommit?.commit?.author?.date,
    latestReadyAt: immediateReady.created_at,
    evaluationTime: new Date().toISOString(),
  });
  if (immediateProgramOwnerApproval.comment_id !== programOwnerApproval.comment_id
    || immediateProgramOwnerApproval.comment_body_digest !== programOwnerApproval.comment_body_digest
    || immediateProgramOwnerApproval.approval_nonce_sha256 !== programOwnerApproval.approval_nonce_sha256
    || immediateReady.created_at !== latestReady.created_at) {
    throw new Error('IMMEDIATE_PREMERGE_PROGRAM_OWNER_APPROVAL_DRIFT');
  }

  await assertLiveOneUseConsumption(immediatePreMerge.base.sha);

  const merged = await request(`/pulls/${prNumber}/merge`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({sha: expectedHeadSha, merge_method: 'merge'}),
  });
  if (merged?.merged !== true || !/^[0-9a-f]{40}$/.test(merged?.sha || '')) throw new Error('SERVER_ATOMIC_MERGE_NOT_CONFIRMED');

  const postMergeMain = await request('/branches/main');
  if (postMergeMain?.commit?.sha !== merged.sha) throw new Error('POST_MERGE_MAIN_SHA_MISMATCH');

  const currentSoldChanged = currentSoldChangedFiles.length > 0;
  fs.appendFileSync(githubOutput, [
    `merge_commit_sha=${merged.sha}`,
    `premerge_main_sha=${initial.base.sha}`,
    `merged_pr_head_sha=${expectedHeadSha}`,
    `pull_request_number=${prNumber}`,
    `landing_authorization_id=${authorizationId}`,
    `landing_run_id=${landingRunId}`,
    `landing_run_attempt=${landingRunAttempt}`,
    `current_sold_changed=${currentSoldChanged}`,
    `current_sold_changed_file_count=${currentSoldChangedFiles.length}`,
    '',
  ].join('\n'));

  console.log(JSON.stringify({
    id: 'kidults-atomic-governed-landing-receipt-v1',
    version: '1.3.0',
    state: currentSoldChanged ? 'MERGED_VERIFIED_POSTLANDING_REQUIRED' : 'MERGED_VERIFIED',
    pull_request: Number(prNumber),
    exact_head_sha: expectedHeadSha,
    exact_base_sha: initial.base.sha,
    premerge_main_sha: initial.base.sha,
    merge_commit_sha: merged.sha,
    target_branch: 'main',
    operation_authorization_id: authorizationId,
    program_owner_exact_head_approval: programOwnerApproval,
    authorization_consumption: authorizationConsumption.receipt,
    landing_actor: landingActor,
    landing_workflow_run_id: landingRunId,
    landing_workflow_run_attempt: landingRunAttempt,
    approval_generation_equality: approvalGeneration,
    initial_live_read: true,
    final_live_reread: true,
    immediate_post_status_premerge_reread: true,
    immediate_program_owner_approval_reread: true,
    immediate_one_use_consumption_reread: true,
    post_merge_main_reread: true,
    server_side_expected_head_compare: true,
    no_merge_label_server_transactionality_claimed: false,
    native_contexts_verified: policy.bypass_policy.required_status_contexts,
    current_sold_changed_file_count: currentSoldChangedFiles.length,
    post_landing_validation: currentSoldChanged ? 'REQUIRED_SAME_TRUSTED_JOB' : 'NOT_REQUIRED',
    public_release: 'HOLD', production: 'HOLD', g5: 'HOLD',
  }, null, 2));
} catch (error) {
  if (statusTouched) {
    try { await publish('failure', error?.code || error?.message || 'atomic landing failed'); } catch {}
  }
  throw error;
}
