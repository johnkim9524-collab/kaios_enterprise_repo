#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  assertNativeRequiredContexts,
  assertLandingActorAndAuthorization,
  selectExactHeadProgramOwnerApproval,
  assertStableFinalReread,
  evaluateRequiredCheckRuns,
} from './lib/governed-landing-native-gates-v1.mjs';
import {
  selectLatestDirectOwnerReadyEvent,
} from './lib/direct-owner-ready-event-v1.mjs';
import {
  assertAtomicLandingStagedLifecycleAuthority,
} from './lib/atomic-landing-staged-lifecycle-authority-v1.mjs';
import {
  assertAtomicLandingConsumptionReceipt,
  buildAtomicLandingRunName,
  evaluateAtomicLandingOneUseRunSet,
} from './run-atomic-landing-one-use-preflight-v1.mjs';
import {
  assertChangedApprovalGenerationEquality,
} from './lib/approval-generation-equality-v1.mjs';
import {
  requireEnabledRepositoryMergeCommit,
} from './run-atomic-event-emitting-transport-preflight-v1.mjs';

const token = process.env.GH_TOKEN;
const repository = process.env.GH_REPOSITORY;
const prNumber = process.env.PR_NUMBER;
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA;
const expectedBaseSha = process.env.EXPECTED_BASE_SHA;
const expectedHeadTreeSha = process.env.EXPECTED_HEAD_TREE_SHA;
const authorizationId = process.env.LANDING_AUTHORIZATION_ID;
const executionRef = process.env.GITHUB_REF;
const landingActor = process.env.LANDING_ACTOR || process.env.GITHUB_ACTOR;
const landingRunId = process.env.GITHUB_RUN_ID;
const landingRunAttempt = process.env.GITHUB_RUN_ATTEMPT;
const githubOutput = process.env.GITHUB_OUTPUT;
const consumptionPath = process.env.ATOMIC_LANDING_CONSUMPTION_PATH;
const lifecycleAuthorityPath = process.env.LIFECYCLE_AUTHORITY_PATH;
const runnerTemp = process.env.RUNNER_TEMP;
const transportReceiptPath = process.env.ATOMIC_EVENT_TRANSPORT_RECEIPT_PATH;
const transportWaitSeconds = Number(process.env.ATOMIC_EVENT_TRANSPORT_WAIT_SECONDS || '600');
if (!token || !repository || !/^\d+$/.test(prNumber || '') || !/^[0-9a-f]{40}$/.test(expectedHeadSha || '')) {
  throw new Error('ATOMIC_LANDING_ENVIRONMENT_BINDING_INVALID');
}
if (!/^[0-9a-f]{40}$/.test(expectedBaseSha || '') || !/^[0-9a-f]{40}$/.test(expectedHeadTreeSha || '')) {
  throw new Error('ATOMIC_LANDING_EXACT_IDENTITY_BINDING_INVALID');
}
if (!/^\d+$/.test(landingRunId || '') || !/^\d+$/.test(landingRunAttempt || '') || !githubOutput) {
  throw new Error('ATOMIC_LANDING_WORKFLOW_OUTPUT_BINDING_INVALID');
}
if (Number(landingRunAttempt) !== 1) throw new Error('ATOMIC_LANDING_RERUN_ATTEMPT_FORBIDDEN');
if (!consumptionPath) throw new Error('ATOMIC_LANDING_CONSUMPTION_PATH_REQUIRED');
if (!lifecycleAuthorityPath || !runnerTemp) throw new Error('ATOMIC_LIFECYCLE_AUTHORITY_PATH_REQUIRED');
if (!transportReceiptPath || !Number.isInteger(transportWaitSeconds)
  || transportWaitSeconds < 60 || transportWaitSeconds > 900) {
  throw new Error('ATOMIC_EVENT_TRANSPORT_BINDING_INVALID');
}
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
const request = async (pathValue, options = {}) => {
  const response = await fetch(`https://api.github.com/repos/${repository}${pathValue}`, {
    ...options,
    headers: {...headers, ...(options.headers || {})},
    redirect: 'error',
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`GITHUB_API_${response.status}:${pathValue}:${payload?.message || 'request_failed'}`);
  return payload;
};
const pages = async pathValue => {
  const output = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = pathValue.includes('?') ? '&' : '?';
    const values = await request(`${pathValue}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(values)) throw new Error(`PAGINATION_SHAPE_INVALID:${pathValue}`);
    output.push(...values);
    if (values.length < 100) return output;
  }
  throw new Error(`PAGINATION_BOUND_EXCEEDED:${pathValue}`);
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
  /^scripts\/kidults\/kpmo\/run-atomic-event-emitting-transport-preflight-v1\.mjs$/,
  /^scripts\/kidults\/kpmo\/consume-atomic-postmerge-push-suite-v1\.mjs$/,
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

const readTransportReceipt = repositoryOwner => {
  if (!fs.existsSync(transportReceiptPath)) throw new Error('ATOMIC_EVENT_TRANSPORT_RECEIPT_MISSING');
  const receipt = JSON.parse(fs.readFileSync(transportReceiptPath, 'utf8'));
  if (receipt?.id !== 'kidults-atomic-event-emitting-transport-availability-v1'
    || receipt?.version !== '1.1.0'
    || receipt?.state !== 'AVAILABLE_POSTMERGE_EVENT_PROOF_REQUIRED') {
    throw new Error('ATOMIC_EVENT_TRANSPORT_RECEIPT_INVALID');
  }
  if (receipt.repository !== repository || Number(receipt.pull_request) !== Number(prNumber)
    || receipt.exact_base_sha !== expectedBaseSha || receipt.exact_head_sha !== expectedHeadSha
    || receipt.exact_head_tree_sha !== expectedHeadTreeSha) {
    throw new Error('ATOMIC_EVENT_TRANSPORT_RECEIPT_IDENTITY_MISMATCH');
  }
  if (receipt.repository_owner !== repositoryOwner || receipt.dispatch_actor !== repositoryOwner
    || receipt.transport !== 'DIRECT_OWNER_GITHUB_UI') {
    throw new Error('ATOMIC_EVENT_TRANSPORT_RECEIPT_ACTOR_MISMATCH');
  }
  if (receipt.merge_performed_by_workflow !== false
    || receipt.transport_available !== true
    || receipt.authorization_consumed !== false
    || receipt.repository_github_token_merge_forbidden !== true
    || receipt.event_emitting_push_required !== true
    || receipt.new_secret_required !== false
    || receipt.permission_expansion_required !== false) {
    throw new Error('ATOMIC_EVENT_TRANSPORT_RECEIPT_BOUNDARY_INVALID');
  }
  const observation = receipt.repository_merge_commit_observation;
  if (observation?.api_surface !== 'GET /repos/{owner}/{repo}'
    || observation?.http_status !== 200
    || observation?.response_ok !== true
    || observation?.response_json_parsed !== true
    || observation?.field_name !== 'allow_merge_commit'
    || observation?.field_present !== true
    || observation?.value_type !== 'boolean'
    || observation?.boolean_value !== true
    || observation?.provenance !== 'GITHUB_ACTIONS_WORKFLOW_TOKEN_REPOSITORY_METADATA'
    || observation?.raw_response_persisted !== false
    || observation?.classification !== 'ENABLED'
    || observation?.failure_code !== null) {
    throw new Error('ATOMIC_EVENT_TRANSPORT_RECEIPT_OBSERVATION_INVALID');
  }
  if (receipt.owner_view_comparison?.state !== 'NOT_AVAILABLE_NO_OWNER_CREDENTIAL_USED'
    || receipt.owner_view_comparison?.mismatch !== null) {
    throw new Error('ATOMIC_EVENT_TRANSPORT_RECEIPT_OWNER_VIEW_INVALID');
  }
  requireEnabledRepositoryMergeCommit(observation, receipt.owner_view_comparison);
  if (!Number.isFinite(Date.parse(receipt.expires_at)) || Date.now() >= Date.parse(receipt.expires_at)) {
    throw new Error('ATOMIC_EVENT_TRANSPORT_RECEIPT_EXPIRED');
  }
  return receipt;
};

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const readStagedLifecycleAuthorityReceipt = () => {
  const trustedRoot = fs.realpathSync(runnerTemp);
  const candidatePath = path.resolve(lifecycleAuthorityPath);
  const candidateParent = fs.realpathSync(path.dirname(candidatePath));
  if (candidateParent !== trustedRoot && !candidateParent.startsWith(`${trustedRoot}${path.sep}`)) {
    throw new Error('ATOMIC_LIFECYCLE_AUTHORITY_PATH_OUTSIDE_RUNNER_TEMP');
  }
  if (!Number.isInteger(fs.constants.O_NOFOLLOW)) {
    throw new Error('ATOMIC_LIFECYCLE_AUTHORITY_NOFOLLOW_UNAVAILABLE');
  }

  let descriptor;
  try {
    descriptor = fs.openSync(candidatePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  } catch {
    throw new Error('ATOMIC_LIFECYCLE_AUTHORITY_OPEN_FAILED');
  }

  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile()) throw new Error('ATOMIC_LIFECYCLE_AUTHORITY_NOT_REGULAR_FILE');
    if (before.nlink !== 1) throw new Error('ATOMIC_LIFECYCLE_AUTHORITY_LINK_COUNT_INVALID');
    if (before.size <= 0 || before.size > 1024 * 1024) {
      throw new Error('ATOMIC_LIFECYCLE_AUTHORITY_SIZE_INVALID');
    }
    if ((before.mode & 0o777) !== 0o600) {
      throw new Error('ATOMIC_LIFECYCLE_AUTHORITY_MODE_INVALID');
    }
    if (typeof process.getuid === 'function' && before.uid !== process.getuid()) {
      throw new Error('ATOMIC_LIFECYCLE_AUTHORITY_OWNER_INVALID');
    }

    const raw = fs.readFileSync(descriptor, 'utf8');
    const after = fs.fstatSync(descriptor);
    if (before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || Buffer.byteLength(raw) !== before.size) {
      throw new Error('ATOMIC_LIFECYCLE_AUTHORITY_FILE_DRIFT');
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('ATOMIC_LIFECYCLE_AUTHORITY_JSON_INVALID');
    }
  } finally {
    fs.closeSync(descriptor);
  }
};

const assertLifecycleAuthorityAgainstReady = (readyEvent, baseSha) =>
  assertAtomicLandingStagedLifecycleAuthority(readStagedLifecycleAuthorityReceipt(), {
    repository,
    prNumber,
    headSha: expectedHeadSha,
    baseSha,
    readyEvent,
  });

const sameReadyEvent = (left, right) =>
  left?.id === right?.id
  && left?.created_at === right?.created_at
  && left?.actor === right?.actor
  && left?.direct_repository_owner === true
  && right?.direct_repository_owner === true
  && left?.performed_via_github_app === null
  && right?.performed_via_github_app === null;

const sameLifecycleAuthority = (left, right) =>
  left?.state === right?.state
  && left?.repository === right?.repository
  && left?.pull_request === right?.pull_request
  && left?.exact_head_sha === right?.exact_head_sha
  && left?.exact_base_sha === right?.exact_base_sha
  && left?.lifecycle_run_id === right?.lifecycle_run_id
  && left?.lifecycle_run_attempt === right?.lifecycle_run_attempt
  && left?.lifecycle_evaluated_at === right?.lifecycle_evaluated_at
  && left?.lifecycle_artifact_id === right?.lifecycle_artifact_id
  && left?.lifecycle_artifact_digest === right?.lifecycle_artifact_digest
  && left?.latest_ready_event_id === right?.latest_ready_event_id
  && left?.latest_ready_event_at === right?.latest_ready_event_at
  && left?.latest_ready_event_actor === right?.latest_ready_event_actor;

const sameApproval = (left, right) =>
  left?.comment_id === right?.comment_id
  && left?.comment_body_digest === right?.comment_body_digest
  && left?.approval_nonce_sha256 === right?.approval_nonce_sha256
  && left?.authorization_id_sha256 === right?.authorization_id_sha256
  && left?.expires_at === right?.expires_at;

const assertLiveOneUseConsumption = async (baseSha, repositoryOwner) => {
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
    repositoryOwner,
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
  const repositoryOwner = repositoryState.owner?.login;
  assertLandingActorAndAuthorization(landingActor, repositoryOwner, authorizationId, prNumber, expectedHeadSha);
  const eventEmittingTransport = readTransportReceipt(repositoryOwner);
  const initial = await request(`/pulls/${prNumber}`);
  const initialMain = await request('/branches/main');
  const changedFileRecords = await pages(`/pulls/${prNumber}/files`);
  assertStableFinalReread(initial, initial, {
    repository,
    expectedHeadSha,
    noMergePolicy: policy.no_merge_policy,
  });
  if (initial.user?.login !== repositoryOwner) throw new Error('PROGRAM_OWNER_AUTHOR_REQUIRED');
  if (initial.base?.sha !== expectedBaseSha) throw new Error('ATOMIC_LANDING_EXPECTED_BASE_MISMATCH');
  if (initial.base?.sha !== initialMain?.commit?.sha) throw new Error('ATOMIC_LANDING_BASE_NOT_CURRENT_PROTECTED_MAIN');

  const authorizationConsumption = await assertLiveOneUseConsumption(initial.base.sha, repositoryOwner);

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
  if (headCommit?.commit?.tree?.sha !== expectedHeadTreeSha) {
    throw new Error('ATOMIC_LANDING_EXPECTED_HEAD_TREE_MISMATCH');
  }
  const latestReady = selectLatestDirectOwnerReadyEvent({timeline, repositoryOwner});
  const lifecycleAuthority = assertLifecycleAuthorityAgainstReady(latestReady, initial.base.sha);
  const programOwnerApproval = selectExactHeadProgramOwnerApproval(approvalComments, {
    repository,
    repositoryOwner,
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

  const immediateReady = selectLatestDirectOwnerReadyEvent({
    timeline: immediateTimeline,
    repositoryOwner,
  });
  const immediateLifecycleAuthority = assertLifecycleAuthorityAgainstReady(
    immediateReady,
    immediatePreMerge.base.sha,
  );
  const immediateProgramOwnerApproval = selectExactHeadProgramOwnerApproval(immediateApprovalComments, {
    repository,
    repositoryOwner,
    prNumber,
    headSha: expectedHeadSha,
    baseSha: immediatePreMerge.base.sha,
    authorizationId,
    prCreatedAt: immediatePreMerge.created_at,
    headCommittedAt: headCommit?.commit?.committer?.date || headCommit?.commit?.author?.date,
    latestReadyAt: immediateReady.created_at,
    evaluationTime: new Date().toISOString(),
  });
  if (!sameApproval(immediateProgramOwnerApproval, programOwnerApproval)) {
    throw new Error('IMMEDIATE_PREMERGE_PROGRAM_OWNER_APPROVAL_DRIFT');
  }
  if (!sameReadyEvent(immediateReady, latestReady)) {
    throw new Error('IMMEDIATE_PREMERGE_READY_EVENT_DRIFT');
  }
  if (!sameLifecycleAuthority(immediateLifecycleAuthority, lifecycleAuthority)) {
    throw new Error('IMMEDIATE_PREMERGE_LIFECYCLE_AUTHORITY_DRIFT');
  }

  await assertLiveOneUseConsumption(immediatePreMerge.base.sha, repositoryOwner);

  const [finalPreMerge, finalPreMergeMain, finalPreMergeTimeline, finalPreMergeApprovalComments] = await Promise.all([
    request(`/pulls/${prNumber}`),
    request('/branches/main'),
    pages(`/issues/${prNumber}/timeline`),
    pages(`/issues/${prNumber}/comments`),
  ]);
  assertStableFinalReread(initial, finalPreMerge, {
    repository,
    expectedHeadSha,
    noMergePolicy: policy.no_merge_policy,
  });
  if (finalPreMerge.base?.sha !== finalPreMergeMain?.commit?.sha
    || finalPreMergeMain.commit.sha !== initialMain.commit.sha) {
    throw new Error('FINAL_PREMERGE_LIVE_MAIN_DRIFT');
  }
  assertAtomicLandingMergeable(finalPreMerge, 'FINAL_PREMERGE_PULL_REQUEST_NOT_SERVER_MERGEABLE');

  const finalPreMergeReady = selectLatestDirectOwnerReadyEvent({
    timeline: finalPreMergeTimeline,
    repositoryOwner,
  });
  const finalPreMergeLifecycleAuthority = assertLifecycleAuthorityAgainstReady(
    finalPreMergeReady,
    finalPreMerge.base.sha,
  );
  const finalPreMergeProgramOwnerApproval = selectExactHeadProgramOwnerApproval(finalPreMergeApprovalComments, {
    repository,
    repositoryOwner,
    prNumber,
    headSha: expectedHeadSha,
    baseSha: finalPreMerge.base.sha,
    authorizationId,
    prCreatedAt: finalPreMerge.created_at,
    headCommittedAt: headCommit?.commit?.committer?.date || headCommit?.commit?.author?.date,
    latestReadyAt: finalPreMergeReady.created_at,
    evaluationTime: new Date().toISOString(),
  });
  if (!sameApproval(finalPreMergeProgramOwnerApproval, immediateProgramOwnerApproval)) {
    throw new Error('FINAL_PREMERGE_PROGRAM_OWNER_APPROVAL_DRIFT');
  }
  if (!sameReadyEvent(finalPreMergeReady, immediateReady)) {
    throw new Error('FINAL_PREMERGE_READY_EVENT_DRIFT');
  }
  if (!sameLifecycleAuthority(finalPreMergeLifecycleAuthority, immediateLifecycleAuthority)) {
    throw new Error('FINAL_PREMERGE_LIFECYCLE_AUTHORITY_DRIFT');
  }

  const transportWindowOpenedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  await publish('success', `Direct Owner event-emitting merge window open for ${transportWaitSeconds}s`);
  const transportDeadline = Date.now() + transportWaitSeconds * 1000;
  let mergedPr = null;
  let postMergeMain = null;
  while (Date.now() <= transportDeadline) {
    [mergedPr, postMergeMain] = await Promise.all([
      request(`/pulls/${prNumber}`),
      request('/branches/main'),
    ]);
    if (mergedPr?.merged === true) break;
    if (mergedPr?.state !== 'open' || mergedPr?.draft === true
      || mergedPr?.head?.sha !== expectedHeadSha || mergedPr?.base?.sha !== expectedBaseSha) {
      throw new Error('ATOMIC_EVENT_TRANSPORT_PR_DRIFT_DURING_WINDOW');
    }
    if (postMergeMain?.commit?.sha !== expectedBaseSha) {
      throw new Error('ATOMIC_EVENT_TRANSPORT_MAIN_MOVED_WITHOUT_BOUND_MERGE');
    }
    await sleep(5000);
  }
  if (mergedPr?.merged !== true) throw new Error('ATOMIC_EVENT_TRANSPORT_TIMEOUT_UNCONSUMED');
  postMergeMain = await request('/branches/main');
  if (mergedPr?.head?.sha !== expectedHeadSha || mergedPr?.base?.sha !== expectedBaseSha) {
    throw new Error('ATOMIC_EVENT_TRANSPORT_MERGED_IDENTITY_MISMATCH');
  }
  if (mergedPr?.merged_by?.login !== repositoryOwner) throw new Error('ATOMIC_EVENT_TRANSPORT_MERGED_BY_NON_OWNER');
  const mergedAt = Date.parse(mergedPr?.merged_at || '');
  if (!Number.isFinite(mergedAt) || mergedAt < transportWindowOpenedAt.getTime()
    || mergedAt > transportDeadline) {
    throw new Error('ATOMIC_EVENT_TRANSPORT_MERGED_OUTSIDE_WINDOW');
  }
  const mergeSha = mergedPr?.merge_commit_sha;
  if (!/^[0-9a-f]{40}$/.test(mergeSha || '')) throw new Error('ATOMIC_EVENT_TRANSPORT_MERGE_SHA_INVALID');
  if (postMergeMain?.commit?.sha !== mergeSha) throw new Error('POST_MERGE_MAIN_SHA_MISMATCH');
  const mergeCommit = await request(`/git/commits/${mergeSha}`);
  if (mergeCommit?.tree?.sha !== expectedHeadTreeSha) throw new Error('POST_MERGE_TREE_SHA_MISMATCH');
  if (!Array.isArray(mergeCommit?.parents) || mergeCommit.parents.length !== 2
    || mergeCommit.parents[0]?.sha !== expectedBaseSha
    || mergeCommit.parents[1]?.sha !== expectedHeadSha) {
    throw new Error('POST_MERGE_PARENT_BINDING_MISMATCH');
  }

  const merged = {sha: mergeSha};

  const currentSoldChanged = currentSoldChangedFiles.length > 0;
  fs.appendFileSync(githubOutput, [
    `merge_commit_sha=${merged.sha}`,
    `merged_at=${mergedPr.merged_at}`,
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
    version: '1.5.0',
    state: 'MERGE_COMMITTED_POSTMERGE_SUITE_REQUIRED',
    pull_request: Number(prNumber),
    exact_head_sha: expectedHeadSha,
    exact_base_sha: initial.base.sha,
    premerge_main_sha: initial.base.sha,
    merge_commit_sha: merged.sha,
    target_branch: 'main',
    operation_authorization_id: authorizationId,
    program_owner_exact_head_approval: programOwnerApproval,
    staged_lifecycle_authority: lifecycleAuthority,
    authorization_consumption: authorizationConsumption.receipt,
    landing_actor: landingActor,
    landing_workflow_run_id: landingRunId,
    landing_workflow_run_attempt: landingRunAttempt,
    approval_generation_equality: approvalGeneration,
    initial_live_read: true,
    final_live_reread: true,
    immediate_post_status_premerge_reread: true,
    immediate_program_owner_approval_reread: true,
    immediate_lifecycle_authority_reread: true,
    immediate_one_use_consumption_reread: true,
    final_premerge_program_owner_approval_reread: true,
    final_premerge_lifecycle_authority_reread: true,
    direct_owner_ready_event_bound: true,
    post_merge_main_reread: true,
    event_emitting_transport: eventEmittingTransport.transport,
    merge_performed_by_workflow: false,
    repository_github_token_merge_forbidden: true,
    exact_head_tree_sha: expectedHeadTreeSha,
    exact_merge_tree_verified: true,
    exact_merge_parents_verified: true,
    merged_by_direct_owner: true,
    no_merge_label_server_transactionality_claimed: false,
    native_contexts_verified: policy.bypass_policy.required_status_contexts,
    current_sold_changed_file_count: currentSoldChangedFiles.length,
    post_landing_validation: currentSoldChanged ? 'REQUIRED_SAME_TRUSTED_JOB' : 'NOT_APPLICABLE',
    exact_merge_sha_push_suite: 'REQUIRED_BEFORE_TERMINAL_PASS',
    public_release: 'HOLD', production: 'HOLD', g5: 'HOLD',
  }, null, 2));
} catch (error) {
  if (statusTouched) {
    try { await publish('failure', error?.code || error?.message || 'atomic landing failed'); } catch {}
  }
  throw error;
}
