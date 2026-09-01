#!/usr/bin/env node
import fs from 'node:fs';
import {
  assertNativeRequiredContexts,
  assertLandingActorAndAuthorization,
  assertStableFinalReread,
  evaluateRequiredCheckRuns,
} from './lib/governed-landing-native-gates-v1.mjs';
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
if (!token || !repository || !/^\d+$/.test(prNumber || '') || !/^[0-9a-f]{40}$/.test(expectedHeadSha || '')) {
  throw new Error('ATOMIC_LANDING_ENVIRONMENT_BINDING_INVALID');
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

const assertAtomicLandingMergeable = (pr, errorCode) => {
  const allowedStates = ['clean', 'unstable', 'has_hooks', 'blocked'];
  if (pr?.mergeable !== true || !allowedStates.includes(pr?.mergeable_state)) throw new Error(errorCode);
};

let statusTouched = false;
try {
  await publish('pending', 'Atomic landing final checks in progress');
  statusTouched = true;
  const repositoryState = await request('');
  assertLandingActorAndAuthorization(landingActor, repositoryState.owner?.login, authorizationId, prNumber, expectedHeadSha);
  const initial = await request(`/pulls/${prNumber}`);
  const initialMain = await request('/branches/main');
  const files = await pages(`/pulls/${prNumber}/files`);
  assertStableFinalReread(initial, initial, {
    repository,
    expectedHeadSha,
    noMergePolicy: policy.no_merge_policy,
  });
  if (initial.user?.login !== repositoryState.owner?.login) throw new Error('PROGRAM_OWNER_AUTHOR_REQUIRED');
  if (initial.base?.sha !== initialMain?.commit?.sha) throw new Error('ATOMIC_LANDING_BASE_NOT_CURRENT_PROTECTED_MAIN');
  const approvalGeneration = await assertChangedApprovalGenerationEquality({
    files,
    readJson: filename => readJsonAtRef(filename, expectedHeadSha),
    prBaseSha: initial.base.sha,
    liveMainSha: initialMain.commit.sha,
  });
  assertAtomicLandingMergeable(initial, 'PULL_REQUEST_NOT_SERVER_MERGEABLE');

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

  const timeline = await pages(`/issues/${prNumber}/timeline`);
  const readinessEvents = timeline.filter(value => value.event === 'ready_for_review' || value.event === 'convert_to_draft');
  const lastReadiness = readinessEvents.at(-1);
  const readinessActor = lastReadiness?.actor?.login || initial.user?.login;
  if (lastReadiness?.event === 'convert_to_draft' || readinessActor !== repositoryState.owner?.login) throw new Error('PROGRAM_OWNER_READY_STATE_REQUIRED');
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
  assertStableFinalReread(initial, immediatePreMerge, {
    repository,
    expectedHeadSha,
    noMergePolicy: policy.no_merge_policy,
  });
  if (immediatePreMerge.base?.sha !== immediateMain?.commit?.sha || immediateMain.commit.sha !== initialMain.commit.sha) {
    throw new Error('IMMEDIATE_PREMERGE_LIVE_MAIN_DRIFT');
  }
  const immediateStatuses = await request(`/commits/${expectedHeadSha}/status`);
  const immediateAggregator = (immediateStatuses.statuses || []).find(value => value.context === scopePolicy.required_status_context);
  if (immediateAggregator?.state !== 'success') throw new Error('IMMEDIATE_PREMERGE_SCOPE_STATUS_DRIFT');
  evaluateRequiredCheckRuns(await checkRuns(expectedHeadSha), scopePolicy.technical_base_contexts);
  await assertChangedApprovalGenerationEquality({
    files,
    readJson: filename => readJsonAtRef(filename, expectedHeadSha),
    prBaseSha: immediatePreMerge.base.sha,
    liveMainSha: immediateMain.commit.sha,
  });
  const merged = await request(`/pulls/${prNumber}/merge`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({sha: expectedHeadSha, merge_method: 'merge'}),
  });
  if (merged?.merged !== true || !/^[0-9a-f]{40}$/.test(merged?.sha || '')) throw new Error('SERVER_ATOMIC_MERGE_NOT_CONFIRMED');
  console.log(JSON.stringify({
    id: 'kidults-atomic-governed-landing-receipt-v1',
    version: '1.1.0',
    state: 'MERGED_VERIFIED',
    pull_request: Number(prNumber),
    exact_head_sha: expectedHeadSha,
    exact_base_sha: initial.base.sha,
    merge_commit_sha: merged.sha,
    target_branch: 'main',
    operation_authorization_id: authorizationId,
    landing_actor: landingActor,
    approval_generation_equality: approvalGeneration,
    initial_live_read: true,
    final_live_reread: true,
    immediate_post_status_premerge_reread: true,
    server_side_expected_head_compare: true,
    no_merge_label_server_transactionality_claimed: false,
    native_contexts_verified: policy.bypass_policy.required_status_contexts,
    public_release: 'HOLD', production: 'HOLD', g5: 'HOLD',
  }, null, 2));
} catch (error) {
  if (statusTouched) {
    try { await publish('failure', error?.code || error?.message || 'atomic landing failed'); } catch {}
  }
  throw error;
}
