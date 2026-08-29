#!/usr/bin/env node
import fs from 'node:fs';
import {
  assertLandingActorAndAuthorization,
  assertNativeRequiredStatusBindings,
  assertRepositoryDefaultBranch,
  assertRepositoryDefaultBranchRuleset,
  assertSoloOwnerProtectPullRequestRule,
  assertStableFinalReread,
  evaluateRequiredCheckRuns,
  resolveScopeRequirements,
} from './lib/governed-landing-native-gates-v1.mjs';

const token = process.env.GH_TOKEN;
const repository = process.env.GH_REPOSITORY;
const prNumber = process.env.PR_NUMBER;
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA;
const authorizationId = process.env.LANDING_AUTHORIZATION_ID;
const executionRef = process.env.GITHUB_REF;
const landingActor = process.env.LANDING_ACTOR || process.env.GITHUB_ACTOR;
const landingTriggeringActor = process.env.LANDING_TRIGGERING_ACTOR;
const landingRunAttempt = process.env.LANDING_RUN_ATTEMPT;
const controlSha = process.env.CONTROL_SHA;
if (!token || !repository || !/^\d+$/.test(prNumber || '') || !/^[0-9a-f]{40}$/.test(expectedHeadSha || '')) {
  throw new Error('ATOMIC_LANDING_ENVIRONMENT_BINDING_INVALID');
}
if (!/^[0-9a-f]{40}$/.test(controlSha || '')) throw new Error('ATOMIC_LANDING_CONTROL_SHA_REQUIRED');
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
    signal: options.signal || AbortSignal.timeout(30_000),
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
const publish = (state, description) => request(`/statuses/${expectedHeadSha}`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({state, context, description: String(description).slice(0, 140)}),
});
const assertLiveControlMain = async (prSnapshot) => {
  assertRepositoryDefaultBranch(await request(''));
  const branch = await request('/branches/main');
  if (branch?.commit?.sha !== controlSha) throw new Error('ATOMIC_LANDING_LIVE_MAIN_CONTROL_SHA_DRIFT');
  if (prSnapshot?.base?.sha !== controlSha) throw new Error('PULL_REQUEST_BASE_SHA_NOT_EXACT_CONTROL_MAIN');
};

let statusTouched = false;
try {
  await publish('pending', 'Atomic landing final checks in progress');
  statusTouched = true;
  const repositoryState = await request('');
  assertRepositoryDefaultBranch(repositoryState);
  assertLandingActorAndAuthorization(landingActor, landingTriggeringActor, repositoryState.owner?.login, authorizationId, prNumber, expectedHeadSha, landingRunAttempt);
  const initial = await request(`/pulls/${prNumber}`);
  assertStableFinalReread(initial, initial, {
    repository,
    expectedHeadSha,
    noMergePolicy: policy.no_merge_policy,
  });
  await assertLiveControlMain(initial);
  if (initial.user?.login !== repositoryState.owner?.login) throw new Error('PROGRAM_OWNER_AUTHOR_REQUIRED');
  if (initial.mergeable !== true || !['clean', 'unstable', 'has_hooks'].includes(initial.mergeable_state)) throw new Error('PULL_REQUEST_NOT_SERVER_MERGEABLE');

  const rulesets = await request('/rulesets');
  const solo = rulesets.find(value => value.name === 'KAIOS Solo Owner Preflight' && value.enforcement === 'active');
  const protect = rulesets.find(value => value.name === 'Protect main' && value.enforcement === 'active');
  if (!solo || !protect) throw new Error('ACTIVE_PROTECTION_RULESETS_REQUIRED');
  const [soloDetail, protectDetail] = await Promise.all([
    request(`/rulesets/${solo.id}`), request(`/rulesets/${protect.id}`),
  ]);
  assertRepositoryDefaultBranchRuleset(protectDetail, repository);
  assertSoloOwnerProtectPullRequestRule(protectDetail);
  assertNativeRequiredStatusBindings(soloDetail, [
    ...scopePolicy.technical_base_contexts,
    ...policy.bypass_policy.required_status_contexts,
  ], {repository, integrationId: scopePolicy.native_status_binding.integration_id});

  const statuses = await request(`/commits/${expectedHeadSha}/status`);
  const aggregator = (statuses.statuses || []).find(value => value.context === scopePolicy.required_status_context);
  if (aggregator?.state !== 'success') throw new Error('SCOPE_AWARE_AUTHORITATIVE_STATUS_NOT_SUCCESS');
  const files = await pages(`/pulls/${prNumber}/files`);
  const scopedRequirements = resolveScopeRequirements(files, initial, scopePolicy);
  evaluateRequiredCheckRuns(await checkRuns(expectedHeadSha), scopedRequirements.required_contexts, {
    expectedIntegrationId: scopePolicy.native_status_binding.integration_id,
  });

  const timeline = await pages(`/issues/${prNumber}/timeline`);
  const readinessEvents = timeline.filter(value => value.event === 'ready_for_review' || value.event === 'convert_to_draft');
  const lastReadiness = readinessEvents.at(-1);
  const readinessActor = lastReadiness?.actor?.login || initial.user?.login;
  if (lastReadiness?.event === 'convert_to_draft' || readinessActor !== repositoryState.owner?.login) throw new Error('PROGRAM_OWNER_READY_STATE_REQUIRED');
  const reviews = await pages(`/pulls/${prNumber}/reviews`);
  const exactHeadBlockers = reviews.filter(review => review.commit_id === expectedHeadSha && review.state === 'CHANGES_REQUESTED');
  if (exactHeadBlockers.length) throw new Error('EXACT_HEAD_CHANGES_REQUESTED');

  const final = await request(`/pulls/${prNumber}`);
  assertStableFinalReread(initial, final, {
    repository,
    expectedHeadSha,
    noMergePolicy: policy.no_merge_policy,
  });
  await assertLiveControlMain(final);
  if (final.mergeable !== true || !['clean', 'unstable', 'has_hooks'].includes(final.mergeable_state)) throw new Error('FINAL_PULL_REQUEST_NOT_SERVER_MERGEABLE');
  const finalStatuses = await request(`/commits/${expectedHeadSha}/status`);
  const finalAggregator = (finalStatuses.statuses || []).find(value => value.context === scopePolicy.required_status_context);
  if (finalAggregator?.state !== 'success') throw new Error('IMMEDIATE_PREMERGE_SCOPE_STATUS_DRIFT');
  const finalFiles = await pages(`/pulls/${prNumber}/files`);
  const finalScopedRequirements = resolveScopeRequirements(finalFiles, final, scopePolicy);
  if (JSON.stringify(finalScopedRequirements) !== JSON.stringify(scopedRequirements)) throw new Error('IMMEDIATE_PREMERGE_SCOPE_REQUIREMENTS_DRIFT');
  evaluateRequiredCheckRuns(await checkRuns(expectedHeadSha), finalScopedRequirements.required_contexts, {
    expectedIntegrationId: scopePolicy.native_status_binding.integration_id,
  });

  // Native merge protection needs this context to become successful. Keep the
  // post-success window to one PR read, one live-main read and the SHA-bound
  // merge request; all paginated/status/check work is completed above.
  await publish('success', 'Exact-head atomic landing authorized');
  const immediatePreMerge = await request(`/pulls/${prNumber}`);
  assertStableFinalReread(initial, immediatePreMerge, {
    repository,
    expectedHeadSha,
    noMergePolicy: policy.no_merge_policy,
  });
  await assertLiveControlMain(immediatePreMerge);
  const merged = await request(`/pulls/${prNumber}/merge`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({sha: expectedHeadSha, merge_method: 'merge'}),
  });
  if (merged?.merged !== true || !/^[0-9a-f]{40}$/.test(merged?.sha || '')) throw new Error('SERVER_ATOMIC_MERGE_NOT_CONFIRMED');
  console.log(JSON.stringify({
    id: 'kidults-atomic-governed-landing-receipt-v1',
    version: '1.0.0',
    state: 'MERGED_VERIFIED',
    pull_request: Number(prNumber),
    exact_head_sha: expectedHeadSha,
    merge_commit_sha: merged.sha,
    target_branch: 'main',
    control_main_sha: controlSha,
    operation_authorization_id: authorizationId,
    landing_actor: landingActor,
    landing_triggering_actor: landingTriggeringActor,
    landing_run_attempt: Number(landingRunAttempt),
    initial_live_read: true,
    final_live_reread: true,
    immediate_post_status_premerge_reread: true,
    server_side_expected_head_compare: true,
    no_merge_label_server_transactionality_claimed: false,
    native_contexts_verified: [
      ...scopePolicy.technical_base_contexts,
      ...policy.bypass_policy.required_status_contexts,
    ],
    scope_contexts_verified: finalScopedRequirements.required_contexts,
    public_release: 'HOLD', production: 'HOLD', g5: 'HOLD',
  }, null, 2));
} catch (error) {
  if (statusTouched) {
    try { await publish('failure', error?.code || error?.message || 'atomic landing failed'); } catch {}
  }
  throw error;
}
