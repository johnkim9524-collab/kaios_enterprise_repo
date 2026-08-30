#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {
  GateFailure,
  assertNativeRequiredContexts,
  assertLandingActorAndAuthorization,
  assertStableFinalReread,
  evaluateRequiredCheckRuns,
} from './lib/governed-landing-native-gates-v1.mjs';

const token = process.env.GH_TOKEN;
const repository = process.env.GH_REPOSITORY;
let prNumber = String(process.env.PR_NUMBER || '');
let expectedHeadSha = String(process.env.EXPECTED_HEAD_SHA || '');
let authorizationId = String(process.env.LANDING_AUTHORIZATION_ID || '');
const executionRef = process.env.GITHUB_REF;
const triggerMode = process.env.LANDING_TRIGGER_MODE || 'workflow_dispatch';
const landingActor = process.env.LANDING_ACTOR || process.env.GITHUB_ACTOR;
const approvalCommentBody = process.env.APPROVAL_COMMENT_BODY || '';
const approvalCommentId = process.env.APPROVAL_COMMENT_ID || null;
const approvalIssueNumber = String(process.env.APPROVAL_ISSUE_NUMBER || '');
const approvalAssociation = process.env.APPROVAL_AUTHOR_ASSOCIATION || '';
const receiptPath = process.env.ATOMIC_LANDING_RECEIPT_PATH
  || path.join(process.env.RUNNER_TEMP || '/tmp', 'kidults-atomic-governed-landing-terminal-receipt.json');

if (!token || !repository || !/^\d+$/.test(prNumber)) {
  throw new Error('ATOMIC_LANDING_ENVIRONMENT_BINDING_INVALID');
}
if (executionRef !== 'refs/heads/main') throw new Error('ATOMIC_LANDING_MAIN_REF_REQUIRED');
if (!['workflow_dispatch', 'issue_comment'].includes(triggerMode)) throw new Error('ATOMIC_LANDING_TRIGGER_MODE_INVALID');

const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json', 'utf8'));
const scopePolicy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
const context = policy.required_status_context;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kidults-atomic-governed-landing-v1',
};
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const sha256 = value => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const request = async (apiPath, options = {}) => {
  const response = await fetch(`https://api.github.com/repos/${repository}${apiPath}`, {
    ...options,
    headers: {...headers, ...(options.headers || {})},
    redirect: 'error',
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`GITHUB_API_${response.status}:${apiPath}:${payload?.message || 'request_failed'}`);
  return payload;
};
const pages = async apiPath => {
  const output = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = apiPath.includes('?') ? '&' : '?';
    const values = await request(`${apiPath}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(values)) throw new Error(`PAGINATION_SHAPE_INVALID:${apiPath}`);
    output.push(...values);
    if (values.length < 100) return output;
  }
  throw new Error(`PAGINATION_BOUND_EXCEEDED:${apiPath}`);
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
const postComment = async body => {
  if (triggerMode !== 'issue_comment') return;
  try {
    await request(`/issues/${prNumber}/comments`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({body}),
    });
  } catch (error) {
    console.error(`WARN atomic landing receipt comment failed: ${error?.message || error}`);
  }
};

const receipt = {
  id: 'kidults-atomic-governed-landing-receipt-v1',
  version: '1.1.0',
  state: 'PREFLIGHT_STARTED',
  repository,
  pull_request: Number(prNumber),
  trigger_mode: triggerMode,
  workflow_run_id: process.env.GITHUB_RUN_ID || null,
  workflow_run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT || 0) || null,
  approval_comment_id: approvalCommentId ? Number(approvalCommentId) : null,
  approval_comment_digest: approvalCommentBody ? sha256(approvalCommentBody) : null,
  landing_actor: landingActor || null,
  approved_initial_head_sha: null,
  exact_head_sha: null,
  candidate_manifest_digest: null,
  preflight_sync_count: 0,
  preflight_aligned_main_sha: null,
  merge_commit_sha: null,
  failure_code: null,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};
const writeReceipt = () => {
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {mode: 0o600});
};
writeReceipt();

const assertAtomicLandingMergeable = (pr, errorCode) => {
  // The operation-specific authorization context is required natively and is pending
  // while this job runs, so GitHub reports "blocked" until this job publishes success.
  // All independent checks are re-read below and the server-side merge remains final enforcement.
  const allowedStates = ['clean', 'unstable', 'has_hooks', 'blocked'];
  if (pr?.mergeable !== true || !allowedStates.includes(pr?.mergeable_state)) throw new Error(errorCode);
};

const candidateManifest = async pr => {
  const files = await pages(`/pulls/${prNumber}/files`);
  const declared = Number(pr?.changed_files || 0);
  if (declared <= 0 || files.length !== declared) {
    throw new Error(`PREFLIGHT_CHANGED_FILE_CARDINALITY_INVALID:${files.length}/${declared}`);
  }
  if (files.length > 100) throw new Error('PREFLIGHT_CHANGED_FILE_LIMIT_EXCEEDED');
  const entries = files.map(file => ({
    filename: file.filename,
    previous_filename: file.previous_filename || null,
    status: file.status,
    blob_sha: file.sha || null,
    additions: Number(file.additions || 0),
    deletions: Number(file.deletions || 0),
    changes: Number(file.changes || 0),
  })).sort((a, b) => a.filename.localeCompare(b.filename));
  return {entries, digest: sha256(stable(entries))};
};

const waitForChangedHead = async priorHead => {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    await sleep(3000);
    const pr = await request(`/pulls/${prNumber}`);
    if (/^[0-9a-f]{40}$/.test(pr?.head?.sha || '') && pr.head.sha !== priorHead) return pr;
  }
  throw new Error('PREFLIGHT_UPDATE_BRANCH_HEAD_TIMEOUT');
};

const waitForServerMergeable = async headSha => {
  const mergeableStates = new Set(['blocked', 'clean', 'has_hooks', 'unstable']);
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const pr = await request(`/pulls/${prNumber}`);
    if (pr?.head?.sha !== headSha) throw new Error('PREFLIGHT_HEAD_CHANGED_DURING_MERGEABILITY_WAIT');
    if (pr.mergeable === true && mergeableStates.has(pr.mergeable_state)) return pr;
    if (pr.mergeable === false || pr.mergeable_state === 'dirty') throw new Error('PREFLIGHT_SERVER_NOT_MERGEABLE');
    await sleep(2000);
  }
  throw new Error('PREFLIGHT_SERVER_MERGEABILITY_TIMEOUT');
};

const waitForTechnicalGreen = async headSha => {
  let lastPending = 'INITIAL';
  for (let attempt = 1; attempt <= 180; attempt += 1) {
    const statuses = await request(`/commits/${headSha}/status`);
    const aggregator = (statuses.statuses || []).find(value => value.context === scopePolicy.required_status_context);
    if (aggregator?.state === 'failure' || aggregator?.state === 'error') {
      throw new Error(`PREFLIGHT_SCOPE_STATUS_TERMINAL:${aggregator.state}`);
    }
    let technicalReady = false;
    try {
      evaluateRequiredCheckRuns(await checkRuns(headSha), scopePolicy.technical_base_contexts);
      technicalReady = true;
    } catch (error) {
      if (error instanceof GateFailure && ['REQUIRED_CONTEXT_MISSING', 'REQUIRED_CONTEXT_NOT_TERMINAL'].includes(error.code)) {
        lastPending = error.message;
      } else {
        throw error;
      }
    }
    if (aggregator?.state === 'success' && technicalReady) return;
    if (aggregator?.state !== 'success') lastPending = `SCOPE_STATUS:${aggregator?.state || 'MISSING'}`;
    await sleep(5000);
  }
  throw new Error(`PREFLIGHT_TECHNICAL_GREEN_TIMEOUT:${lastPending}`);
};

const resolveCommentApproval = () => {
  if (!/^\d+$/.test(String(approvalCommentId || ''))) throw new Error('PREFLIGHT_APPROVAL_COMMENT_ID_REQUIRED');
  if (approvalAssociation !== 'OWNER') throw new Error('PREFLIGHT_APPROVAL_AUTHOR_ASSOCIATION_REQUIRED');
  const match = approvalCommentBody.trim().match(/^\/kpmo-land\s+pr=(\d+)\s+head=([0-9a-f]{40})$/i);
  if (!match) throw new Error('PREFLIGHT_APPROVAL_COMMAND_INVALID');
  if (match[1] !== prNumber || approvalIssueNumber !== prNumber) throw new Error('PREFLIGHT_APPROVAL_PR_NUMBER_MISMATCH');
  return {approvedHeadSha: match[2].toLowerCase()};
};

const runCommentPreflight = async repositoryState => {
  const {approvedHeadSha} = resolveCommentApproval();
  if (landingActor !== repositoryState.owner?.login) throw new Error('PROGRAM_OWNER_LANDING_ACTOR_REQUIRED');
  const approvedPr = await request(`/pulls/${prNumber}`);
  assertStableFinalReread(approvedPr, approvedPr, {
    repository,
    expectedHeadSha: approvedHeadSha,
    noMergePolicy: policy.no_merge_policy,
  });
  if (approvedPr.user?.login !== repositoryState.owner?.login) throw new Error('PROGRAM_OWNER_AUTHOR_REQUIRED');
  const approvedManifest = await candidateManifest(approvedPr);
  receipt.approved_initial_head_sha = approvedHeadSha;
  receipt.candidate_manifest_digest = approvedManifest.digest;
  writeReceipt();

  let currentHeadSha = approvedHeadSha;
  const maxSyncCycles = Number(policy.atomic_landing_policy?.preflight_max_main_sync_cycles || 3);
  for (let cycle = 0; cycle <= maxSyncCycles; cycle += 1) {
    const liveMain = await request('/commits/main');
    const liveMainSha = liveMain?.sha;
    if (!/^[0-9a-f]{40}$/.test(liveMainSha || '')) throw new Error('PREFLIGHT_LIVE_MAIN_SHA_INVALID');
    const currentPr = await request(`/pulls/${prNumber}`);
    assertStableFinalReread(currentPr, currentPr, {
      repository,
      expectedHeadSha: currentHeadSha,
      noMergePolicy: policy.no_merge_policy,
    });
    const currentManifest = await candidateManifest(currentPr);
    if (currentManifest.digest !== approvedManifest.digest) throw new Error('PREFLIGHT_CANDIDATE_DELTA_DIGEST_DRIFT');

    const comparison = await request(`/compare/${liveMainSha}...${currentHeadSha}`);
    const behindBy = Number(comparison?.behind_by || 0);
    if (behindBy > 0) {
      if (cycle >= maxSyncCycles) throw new Error('PREFLIGHT_MAIN_DRIFT_RETRY_EXHAUSTED');
      await request(`/pulls/${prNumber}/update-branch`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({expected_head_sha: currentHeadSha}),
      });
      const updatedPr = await waitForChangedHead(currentHeadSha);
      currentHeadSha = updatedPr.head.sha;
      const updatedManifest = await candidateManifest(updatedPr);
      if (updatedManifest.digest !== approvedManifest.digest) throw new Error('PREFLIGHT_SYNC_CHANGED_CANDIDATE_DELTA');
      receipt.preflight_sync_count += 1;
      receipt.exact_head_sha = currentHeadSha;
      receipt.state = 'PREFLIGHT_SYNCED_WAITING_CHECKS';
      writeReceipt();
      continue;
    }

    await waitForTechnicalGreen(currentHeadSha);
    const [mainAfterChecks, prAfterChecks] = await Promise.all([
      request('/commits/main'),
      request(`/pulls/${prNumber}`),
    ]);
    assertStableFinalReread(currentPr, prAfterChecks, {
      repository,
      expectedHeadSha: currentHeadSha,
      noMergePolicy: policy.no_merge_policy,
    });
    const finalManifest = await candidateManifest(prAfterChecks);
    if (finalManifest.digest !== approvedManifest.digest) throw new Error('PREFLIGHT_POSTCHECK_CANDIDATE_DELTA_DRIFT');
    if (mainAfterChecks?.sha !== liveMainSha) {
      if (cycle >= maxSyncCycles) throw new Error('PREFLIGHT_MAIN_DRIFT_RETRY_EXHAUSTED');
      continue;
    }
    const finalComparison = await request(`/compare/${liveMainSha}...${currentHeadSha}`);
    if (Number(finalComparison?.behind_by || 0) > 0) {
      if (cycle >= maxSyncCycles) throw new Error('PREFLIGHT_MAIN_DRIFT_RETRY_EXHAUSTED');
      continue;
    }
    await waitForServerMergeable(currentHeadSha);
    receipt.preflight_aligned_main_sha = liveMainSha;
    receipt.exact_head_sha = currentHeadSha;
    receipt.state = 'PREFLIGHT_VERIFIED_PASS';
    writeReceipt();
    return currentHeadSha;
  }
  throw new Error('PREFLIGHT_UNREACHABLE_STATE');
};

let statusTouched = false;
try {
  const repositoryState = await request('');
  if (triggerMode === 'issue_comment') {
    expectedHeadSha = await runCommentPreflight(repositoryState);
    authorizationId = `LAND-PR-${prNumber}-${expectedHeadSha.slice(0, 12)}`;
  } else {
    if (!/^[0-9a-f]{40}$/.test(expectedHeadSha) || authorizationId !== `LAND-PR-${prNumber}-${expectedHeadSha.slice(0, 12)}`) {
      throw new Error('ATOMIC_LANDING_ENVIRONMENT_BINDING_INVALID');
    }
    receipt.approved_initial_head_sha = expectedHeadSha;
    receipt.exact_head_sha = expectedHeadSha;
    receipt.state = 'MANUAL_EXACT_HEAD_PREFLIGHT';
    writeReceipt();
  }

  await publish('pending', 'Atomic landing final checks in progress');
  statusTouched = true;
  assertLandingActorAndAuthorization(landingActor, repositoryState.owner?.login, authorizationId, prNumber, expectedHeadSha);
  const initial = await request(`/pulls/${prNumber}`);
  assertStableFinalReread(initial, initial, {
    repository,
    expectedHeadSha,
    noMergePolicy: policy.no_merge_policy,
  });
  if (initial.user?.login !== repositoryState.owner?.login) throw new Error('PROGRAM_OWNER_AUTHOR_REQUIRED');
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
  assertStableFinalReread(initial, final, {
    repository,
    expectedHeadSha,
    noMergePolicy: policy.no_merge_policy,
  });
  assertAtomicLandingMergeable(final, 'FINAL_PULL_REQUEST_NOT_SERVER_MERGEABLE');

  await publish('success', 'Exact-head atomic landing authorized');
  const immediatePreMerge = await request(`/pulls/${prNumber}`);
  assertStableFinalReread(initial, immediatePreMerge, {
    repository,
    expectedHeadSha,
    noMergePolicy: policy.no_merge_policy,
  });
  const immediateStatuses = await request(`/commits/${expectedHeadSha}/status`);
  const immediateAggregator = (immediateStatuses.statuses || []).find(value => value.context === scopePolicy.required_status_context);
  if (immediateAggregator?.state !== 'success') throw new Error('IMMEDIATE_PREMERGE_SCOPE_STATUS_DRIFT');
  evaluateRequiredCheckRuns(await checkRuns(expectedHeadSha), scopePolicy.technical_base_contexts);
  const merged = await request(`/pulls/${prNumber}/merge`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({sha: expectedHeadSha, merge_method: 'merge'}),
  });
  if (merged?.merged !== true || !/^[0-9a-f]{40}$/.test(merged?.sha || '')) throw new Error('SERVER_ATOMIC_MERGE_NOT_CONFIRMED');

  receipt.state = 'MERGED_VERIFIED';
  receipt.exact_head_sha = expectedHeadSha;
  receipt.merge_commit_sha = merged.sha;
  receipt.operation_authorization_id = authorizationId;
  receipt.initial_live_read = true;
  receipt.final_live_reread = true;
  receipt.immediate_post_status_premerge_reread = true;
  receipt.server_side_expected_head_compare = true;
  receipt.no_merge_label_server_transactionality_claimed = false;
  receipt.native_contexts_verified = policy.bypass_policy.required_status_contexts;
  writeReceipt();
  console.log(JSON.stringify(receipt, null, 2));
  await postComment([
    '## KPMO Atomic Landing Receipt',
    '',
    `- State: **MERGED_VERIFIED**`,
    `- PR: \`#${prNumber}\``,
    `- Exact head: \`${expectedHeadSha}\``,
    `- Merge commit: \`${merged.sha}\``,
    `- Preflight base-sync count: \`${receipt.preflight_sync_count}\``,
    `- Candidate delta digest: \`${receipt.candidate_manifest_digest || 'MANUAL_EXACT_HEAD'}\``,
    '- Public / Production / G5: **HOLD / HOLD / HOLD**',
  ].join('\n'));
} catch (error) {
  const failureCode = String(error?.code || error?.message || 'ATOMIC_LANDING_FAILED').slice(0, 300);
  receipt.state = 'VERIFIED_FAIL';
  receipt.failure_code = failureCode;
  receipt.exact_head_sha = /^[0-9a-f]{40}$/.test(expectedHeadSha || '') ? expectedHeadSha : receipt.exact_head_sha;
  writeReceipt();
  if (statusTouched) {
    try { await publish('failure', failureCode); } catch {}
  }
  await postComment([
    '## KPMO Atomic Landing Preflight',
    '',
    `- State: **VERIFIED_FAIL**`,
    `- PR: \`#${prNumber}\``,
    `- Failure: \`${failureCode.replace(/`/g, '')}\``,
    '- No merge or production/public promotion occurred.',
  ].join('\n'));
  throw error;
}
