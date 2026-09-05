#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertPromotablePullRequest,
  evaluateRequiredCheckRuns,
} from './lib/governed-landing-native-gates-v1.mjs';
import {selectLatestDirectOwnerReadyEvent} from './lib/direct-owner-ready-event-v1.mjs';
import {
  assertDirectOwnerGenerationUnused,
  collectDirectOwnerReadyStateMutations,
  directOwnerConsumptionContext,
  parseDirectOwnerAuthorizationId,
  selectDirectOwnerUiAttestation,
} from './lib/direct-owner-versioned-authorization-v2.mjs';

const MARKER = 'KIDULTS_DIRECT_OWNER_EVENT_EMITTING_MERGE_APPROVAL_V2';
const OPERATION = 'MERGE_PROTECTED_MAIN';
const TRANSPORT = 'DIRECT_OWNER_GITHUB_UI';
const SCOPE = 'ONE_DIRECT_OWNER_MERGE_ONLY';
const MAX_APPROVAL_LIFETIME_MS = 60 * 60 * 1000;
const SHA = /^[0-9a-f]{40}$/;
const NONCE = /^[0-9a-f]{32}$/;
const PURPOSE = /^[A-Z0-9][A-Z0-9_.:-]{0,95}$/;

const token = process.env.GH_TOKEN || '';
const repository = process.env.GH_REPOSITORY || process.env.GITHUB_REPOSITORY || '';
const prNumber = process.env.PR_NUMBER || '';
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA || '';
const expectedBaseSha = process.env.EXPECTED_BASE_SHA || '';
const authorizationId = process.env.HANDOFF_AUTHORIZATION_ID || '';
const purpose = process.env.HANDOFF_PURPOSE || '';
const actor = process.env.LANDING_ACTOR || process.env.GITHUB_ACTOR || '';
const executionRef = process.env.GITHUB_REF || '';
const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT || '0');
const runId = process.env.GITHUB_RUN_ID || '';
const ownerUiEvidenceCommentId = process.env.OWNER_UI_EVIDENCE_COMMENT_ID || '';
const receiptPath = process.env.HANDOFF_RECEIPT_PATH || 'out/direct-owner-landing-handoff-v1/receipt.json';
const handoffWindowSeconds = Number(process.env.HANDOFF_WINDOW_SECONDS || '600');
const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json', 'utf8'));
const scopePolicy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
const context = policy.required_status_context;

const fail = code => { const error = new Error(code); error.code = code; throw error; };
const parseTime = (value, code) => {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) fail(code);
  return parsed;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kidults-direct-owner-handoff-v1',
};
const request = async (apiPath, options = {}) => {
  const response = await fetch(`https://api.github.com/repos/${repository}${apiPath}`, {
    ...options,
    headers: {...headers, ...(options.headers || {})},
    redirect: 'error',
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) fail(`DIRECT_OWNER_HANDOFF_GITHUB_API_${response.status}`);
  return payload;
};
const pages = async apiPath => {
  const output = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = apiPath.includes('?') ? '&' : '?';
    const values = await request(`${apiPath}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(values)) fail('DIRECT_OWNER_HANDOFF_PAGINATION_SHAPE_INVALID');
    output.push(...values);
    if (values.length < 100) return output;
  }
  fail('DIRECT_OWNER_HANDOFF_PAGINATION_BOUND_EXCEEDED');
};
const checkRuns = async sha => {
  const output = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await request(`/commits/${sha}/check-runs?per_page=100&page=${page}`);
    if (!Array.isArray(payload?.check_runs)) fail('DIRECT_OWNER_HANDOFF_CHECK_RUNS_SHAPE_INVALID');
    output.push(...payload.check_runs);
    if (payload.check_runs.length < 100) return output;
  }
  fail('DIRECT_OWNER_HANDOFF_CHECK_RUNS_PAGINATION_BOUND_EXCEEDED');
};
const statusHistory = async sha => pages(`/commits/${sha}/statuses`);
const handoffWorkflowRuns = async () => {
  const output = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await request(`/actions/workflows/kidults-direct-owner-landing-handoff-v1.yml/runs?event=workflow_dispatch&per_page=100&page=${page}`);
    if (!Array.isArray(payload?.workflow_runs)) fail('DIRECT_OWNER_HANDOFF_WORKFLOW_RUNS_SHAPE_INVALID');
    output.push(...payload.workflow_runs);
    if (payload.workflow_runs.length < 100) return output;
  }
  fail('DIRECT_OWNER_HANDOFF_WORKFLOW_RUNS_PAGINATION_BOUND_EXCEEDED');
};
const publish = (state, description) => request(`/statuses/${expectedHeadSha}`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({state, context, description: String(description).slice(0, 140)}),
});
const publishConsumption = (consumptionContext, generationKey) => request(`/statuses/${expectedHeadSha}`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    state: 'pending',
    context: consumptionContext,
    description: `One-shot ${generationKey} consumed by handoff run ${runId}`,
  }),
});

const approvalKeys = [
  'repository', 'pull_request', 'exact_base_sha', 'exact_head_sha', 'operation', 'transport',
  'authorization_id', 'nonce', 'expires_at', 'purpose', 'scope', 'approval_rebind',
  'production', 'public', 'g5',
];
function parseApproval(body) {
  const lines = String(body || '').trim().split(/\r?\n/);
  if (lines[0] !== MARKER) return null;
  if (lines.length !== approvalKeys.length + 1) fail('DIRECT_OWNER_HANDOFF_APPROVAL_SHAPE_INVALID');
  const fields = {};
  for (const line of lines.slice(1)) {
    const match = /^([a-z0-9_]+)=(.+)$/.exec(line);
    if (!match || !approvalKeys.includes(match[1]) || Object.hasOwn(fields, match[1])) fail('DIRECT_OWNER_HANDOFF_APPROVAL_FIELD_INVALID');
    fields[match[1]] = match[2];
  }
  if (Object.keys(fields).length !== approvalKeys.length) fail('DIRECT_OWNER_HANDOFF_APPROVAL_FIELD_SET_INVALID');
  return fields;
}

function assertApprovalAfterFinalInvalidation(approvedAt, readyEvent) {
  const invalidation = readyEvent?.latest_invalidating_event;
  if (invalidation == null) return;
  if (!['convert_to_draft', 'closed', 'reopened'].includes(invalidation.event)
      || !Number.isSafeInteger(Number(invalidation.id)) || Number(invalidation.id) <= 0) {
    fail('DIRECT_OWNER_HANDOFF_FINAL_INVALIDATION_EVENT_INVALID');
  }
  const invalidatedAt = parseTime(
    invalidation.created_at,
    'DIRECT_OWNER_HANDOFF_FINAL_INVALIDATION_TIME_INVALID',
  );
  if (approvedAt <= invalidatedAt) {
    fail('DIRECT_OWNER_HANDOFF_APPROVAL_NOT_AFTER_FINAL_INVALIDATION');
  }
}

function selectApproval(comments, repositoryOwner, pr, headCommit, readyEvent, {phase = 'pre_window'} = {}) {
  if (!['pre_window', 'post_window'].includes(phase)) fail('DIRECT_OWNER_HANDOFF_APPROVAL_PHASE_INVALID');
  const marked = comments
    .filter(comment => String(comment?.body || '').trim().split(/\r?\n/)[0] === MARKER)
    .sort((a, b) => parseTime(b.created_at, 'DIRECT_OWNER_HANDOFF_APPROVAL_TIME_INVALID')
      - parseTime(a.created_at, 'DIRECT_OWNER_HANDOFF_APPROVAL_TIME_INVALID')
      || Number(b.id || 0) - Number(a.id || 0));
  if (!marked.length) fail('DIRECT_OWNER_HANDOFF_APPROVAL_MISSING');
  const comment = marked[0];
  const fields = parseApproval(comment?.body);
  if (!fields) fail('DIRECT_OWNER_HANDOFF_APPROVAL_MISSING');
  if (comment?.user?.login !== repositoryOwner || comment?.author_association !== 'OWNER') fail('DIRECT_OWNER_HANDOFF_APPROVAL_ACTOR_INVALID');
  if (comment?.user?.type !== 'User' || comment?.performed_via_github_app != null) fail('DIRECT_OWNER_HANDOFF_APPROVAL_APP_MEDIATED');
  if (comment.updated_at !== comment.created_at) fail('DIRECT_OWNER_HANDOFF_APPROVAL_EDITED');
  if (fields.repository !== repository || fields.pull_request !== prNumber) fail('DIRECT_OWNER_HANDOFF_APPROVAL_REPOSITORY_PR_MISMATCH');
  if (fields.exact_base_sha !== expectedBaseSha || fields.exact_head_sha !== expectedHeadSha) fail('DIRECT_OWNER_HANDOFF_APPROVAL_SHA_MISMATCH');
  if (fields.operation !== OPERATION || fields.transport !== TRANSPORT) fail('DIRECT_OWNER_HANDOFF_APPROVAL_OPERATION_TRANSPORT_INVALID');
  if (fields.authorization_id !== authorizationId || fields.purpose !== purpose) fail('DIRECT_OWNER_HANDOFF_APPROVAL_BINDING_INVALID');
  if (!NONCE.test(fields.nonce || '')) fail('DIRECT_OWNER_HANDOFF_APPROVAL_NONCE_INVALID');
  if (fields.scope !== SCOPE || fields.approval_rebind !== 'FORBIDDEN') fail('DIRECT_OWNER_HANDOFF_APPROVAL_SCOPE_INVALID');
  if (fields.production !== 'HOLD' || fields.public !== 'HOLD' || fields.g5 !== 'HOLD') fail('DIRECT_OWNER_HANDOFF_APPROVAL_PROMOTION_BOUNDARY_INVALID');

  const approvedAt = parseTime(comment.created_at, 'DIRECT_OWNER_HANDOFF_APPROVAL_TIME_INVALID');
  const expiresAt = parseTime(fields.expires_at, 'DIRECT_OWNER_HANDOFF_APPROVAL_EXPIRY_INVALID');
  const now = Date.now();
  const headCommittedAt = parseTime(headCommit?.commit?.committer?.date || headCommit?.commit?.author?.date, 'DIRECT_OWNER_HANDOFF_HEAD_TIME_INVALID');
  if (approvedAt < parseTime(pr.created_at, 'DIRECT_OWNER_HANDOFF_PR_TIME_INVALID') || approvedAt < headCommittedAt) fail('DIRECT_OWNER_HANDOFF_APPROVAL_PRECEDES_EXACT_HEAD');
  assertApprovalAfterFinalInvalidation(approvedAt, readyEvent);
  if (approvedAt > parseTime(readyEvent.created_at, 'DIRECT_OWNER_HANDOFF_READY_TIME_INVALID')) fail('DIRECT_OWNER_HANDOFF_APPROVAL_MUST_PRECEDE_READY');
  if (expiresAt <= approvedAt || expiresAt - approvedAt > MAX_APPROVAL_LIFETIME_MS) fail('DIRECT_OWNER_HANDOFF_APPROVAL_EXPIRY_WINDOW_INVALID');
  if (now < approvedAt) fail('DIRECT_OWNER_HANDOFF_APPROVAL_NOT_YET_VALID');
  if (phase === 'pre_window' && now > expiresAt) fail('DIRECT_OWNER_HANDOFF_APPROVAL_EXPIRED');
  if (phase === 'pre_window' && expiresAt - now < handoffWindowSeconds * 1000) fail('DIRECT_OWNER_HANDOFF_APPROVAL_EXPIRES_BEFORE_WINDOW');

  return {
    comment_id: Number(comment.id),
    comment_created_at: comment.created_at,
    comment_body_sha256: `sha256:${crypto.createHash('sha256').update(String(comment.body)).digest('hex')}`,
    authorization_id_sha256: `sha256:${crypto.createHash('sha256').update(authorizationId).digest('hex')}`,
    nonce_sha256: `sha256:${crypto.createHash('sha256').update(fields.nonce).digest('hex')}`,
    expires_at: fields.expires_at,
    actor: comment.user.login,
  };
}

function writeReceipt(receipt) {
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true, mode: 0o700});
  const temp = `${receiptPath}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(receipt, null, 2)}\n`, {encoding: 'utf8', mode: 0o600});
  fs.renameSync(temp, receiptPath);
  fs.chmodSync(receiptPath, 0o600);
}

let statusTouched = false;
let authorizationGeneration = null;
let authorizationClaim = null;
let receipt = {
  id: 'kidults-direct-owner-landing-handoff-receipt-v1',
  version: '1.0.0',
  state: 'VALIDATION_PENDING',
  repository: /^[^/]+\/[^/]+$/.test(repository) ? repository : null,
  pull_request: /^\d+$/.test(prNumber) ? Number(prNumber) : null,
  exact_base_sha: SHA.test(expectedBaseSha) ? expectedBaseSha : null,
  exact_head_sha: SHA.test(expectedHeadSha) ? expectedHeadSha : null,
  transport: TRANSPORT,
  purpose: PURPOSE.test(purpose) ? purpose : null,
  merge_performed_by_workflow: false,
  event_emitting_merge_required: true,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD',
};
try {
  writeReceipt(receipt);
  if (!token || !/^[^/]+\/[^/]+$/.test(repository) || !/^\d+$/.test(prNumber)) fail('DIRECT_OWNER_HANDOFF_ENVIRONMENT_INVALID');
  if (!SHA.test(expectedHeadSha) || !SHA.test(expectedBaseSha)) fail('DIRECT_OWNER_HANDOFF_SHA_INVALID');
  authorizationGeneration = parseDirectOwnerAuthorizationId({authorizationId, prNumber, headSha: expectedHeadSha});
  if (!PURPOSE.test(purpose)) fail('DIRECT_OWNER_HANDOFF_PURPOSE_INVALID');
  if (executionRef !== 'refs/heads/main') fail('DIRECT_OWNER_HANDOFF_MAIN_REF_REQUIRED');
  if (runAttempt !== 1) fail('DIRECT_OWNER_HANDOFF_RERUN_FORBIDDEN');
  if (!/^\d+$/.test(runId) || !Number.isSafeInteger(Number(runId)) || Number(runId) <= 0) {
    fail('DIRECT_OWNER_HANDOFF_RUN_ID_INVALID');
  }
  if (!/^\d+$/.test(ownerUiEvidenceCommentId)
      || !Number.isSafeInteger(Number(ownerUiEvidenceCommentId)) || Number(ownerUiEvidenceCommentId) <= 0) {
    fail('DIRECT_OWNER_UI_ATTESTATION_COMMENT_ID_INVALID');
  }
  if (!Number.isInteger(handoffWindowSeconds) || handoffWindowSeconds < 60 || handoffWindowSeconds > 900) fail('DIRECT_OWNER_HANDOFF_WINDOW_INVALID');

  const repositoryMetadata = await request('');
  const owner = repositoryMetadata?.owner?.login;
  if (!owner || actor !== owner) fail('DIRECT_OWNER_HANDOFF_DISPATCH_ACTOR_NOT_OWNER');

  await publish('pending', 'Direct Owner exact-head handoff validation in progress');
  statusTouched = true;

  const [pr, main, files, timeline, comments, headCommit, statuses, runs, rulesets, priorStatuses, priorWorkflowRuns] = await Promise.all([
    request(`/pulls/${prNumber}`),
    request('/branches/main'),
    pages(`/pulls/${prNumber}/files`),
    pages(`/issues/${prNumber}/timeline`),
    pages(`/issues/${prNumber}/comments`),
    request(`/commits/${expectedHeadSha}`),
    request(`/commits/${expectedHeadSha}/status`),
    checkRuns(expectedHeadSha),
    request('/rulesets'),
    statusHistory(expectedHeadSha),
    handoffWorkflowRuns(),
  ]);
  const consumptionContext = directOwnerConsumptionContext({
    prNumber,
    headSha: expectedHeadSha,
    generationKey: authorizationGeneration.generation_key,
  });
  assertDirectOwnerGenerationUnused({
    authorizationId,
    consumptionContext,
    statuses: priorStatuses,
    workflowRuns: priorWorkflowRuns,
    currentRunId: runId,
  });
  const consumptionStatus = await publishConsumption(consumptionContext, authorizationGeneration.generation_key);
  const consumptionStatusId = Number(consumptionStatus?.id);
  if (!Number.isSafeInteger(consumptionStatusId) || consumptionStatusId <= 0
      || !consumptionStatus?.created_at || Number.isNaN(Date.parse(consumptionStatus.created_at))) {
    fail('DIRECT_OWNER_HANDOFF_CONSUMPTION_STATUS_RECEIPT_INVALID');
  }
  const authorizationGenerationReceipt = {
    scheme: authorizationGeneration.scheme,
    generation: authorizationGeneration.generation,
    generation_key: authorizationGeneration.generation_key,
  };
  authorizationClaim = {
    state: 'CONSUMED_ON_FIRST_WORKFLOW_ATTEMPT',
    scheme: authorizationGeneration.scheme,
    generation: authorizationGeneration.generation,
    generation_key: authorizationGeneration.generation_key,
    authorization_id_sha256: `sha256:${crypto.createHash('sha256').update(authorizationId).digest('hex')}`,
    run_id: Number(runId),
    run_attempt: runAttempt,
    status_id: consumptionStatusId,
    status_context: consumptionContext,
    consumed_at: consumptionStatus.created_at,
    replay_allowed: false,
  };
  receipt = {...receipt, authorization_generation: authorizationGenerationReceipt, one_shot_consumption: authorizationClaim};
  writeReceipt(receipt);

  assertPromotablePullRequest(pr, {repository, expectedHeadSha, expectedBase: 'main', noMergePolicy: policy.no_merge_policy});
  if (pr.user?.login !== owner || pr.head?.repo?.full_name !== repository) fail('DIRECT_OWNER_HANDOFF_PR_OWNER_BINDING_INVALID');
  if (pr.base?.sha !== expectedBaseSha || main?.commit?.sha !== expectedBaseSha) fail('DIRECT_OWNER_HANDOFF_BASE_NOT_CURRENT_MAIN');
  if (pr.mergeable !== true || !['clean', 'unstable', 'blocked', 'has_hooks'].includes(pr.mergeable_state)) fail('DIRECT_OWNER_HANDOFF_PR_NOT_SERVER_MERGEABLE');
  if (!Array.isArray(files) || files.length !== Number(pr.changed_files || 0)) fail('DIRECT_OWNER_HANDOFF_CHANGED_FILE_PAGINATION_INVALID');

  const readyEvent = selectLatestDirectOwnerReadyEvent({timeline, repositoryOwner: owner});
  const approval = selectApproval(comments, owner, pr, headCommit, readyEvent);
  const ownerUiEvidence = selectDirectOwnerUiAttestation(comments, {
    evidenceCommentId: Number(ownerUiEvidenceCommentId),
    repository,
    repositoryOwner: owner,
    prNumber,
    headSha: expectedHeadSha,
    authorizationId,
    readyEvent,
    evaluationTime: new Date().toISOString(),
    handoffWindowSeconds,
  });

  const solo = rulesets.find(value => value.name === 'KAIOS Solo Owner Preflight' && value.enforcement === 'active');
  const protect = rulesets.find(value => value.name === 'Protect main' && value.enforcement === 'active');
  if (!solo || !protect) fail('DIRECT_OWNER_HANDOFF_REQUIRED_RULESETS_MISSING');
  const [soloDetail, protectDetail] = await Promise.all([request(`/rulesets/${solo.id}`), request(`/rulesets/${protect.id}`)]);
  if ((soloDetail.bypass_actors || []).length !== 0 || (protectDetail.bypass_actors || []).length !== 0) fail('DIRECT_OWNER_HANDOFF_RULESET_BYPASS_FORBIDDEN');
  const statusRule = (soloDetail.rules || []).find(value => value.type === 'required_status_checks');
  if (!statusRule?.parameters?.strict_required_status_checks_policy) fail('DIRECT_OWNER_HANDOFF_STRICT_STATUS_POLICY_REQUIRED');
  const required = new Set((statusRule.parameters.required_status_checks || []).map(value => value.context));
  for (const contextName of scopePolicy.technical_base_contexts || []) if (!required.has(contextName)) fail('DIRECT_OWNER_HANDOFF_NATIVE_TECHNICAL_CONTEXT_MISSING');
  const protectPr = (protectDetail.rules || []).find(value => value.type === 'pull_request');
  if ((protectPr?.parameters?.required_approving_review_count || 0) !== 0
      || !protectPr?.parameters?.dismiss_stale_reviews_on_push
      || protectPr?.parameters?.require_last_push_approval
      || !protectPr?.parameters?.required_review_thread_resolution
      || !protectPr?.parameters?.require_extra_approval_for_unattributed_changes) {
    fail('DIRECT_OWNER_HANDOFF_PROTECT_MAIN_POLICY_DRIFT');
  }

  const aggregate = (statuses?.statuses || []).find(value => value.context === scopePolicy.required_status_context);
  if (aggregate?.state !== 'success') fail('DIRECT_OWNER_HANDOFF_SCOPE_STATUS_NOT_SUCCESS');
  evaluateRequiredCheckRuns(runs, scopePolicy.technical_base_contexts);

  const [finalPr, finalMain, finalTimeline, finalComments] = await Promise.all([
    request(`/pulls/${prNumber}`), request('/branches/main'), pages(`/issues/${prNumber}/timeline`), pages(`/issues/${prNumber}/comments`),
  ]);
  assertPromotablePullRequest(finalPr, {repository, expectedHeadSha, expectedBase: 'main', noMergePolicy: policy.no_merge_policy});
  if (finalPr.base?.sha !== expectedBaseSha || finalMain?.commit?.sha !== expectedBaseSha) fail('DIRECT_OWNER_HANDOFF_FINAL_BASE_DRIFT');
  const finalReady = selectLatestDirectOwnerReadyEvent({timeline: finalTimeline, repositoryOwner: owner});
  if (finalReady.id !== readyEvent.id || finalReady.created_at !== readyEvent.created_at) fail('DIRECT_OWNER_HANDOFF_READY_EVENT_DRIFT');
  const finalApproval = selectApproval(finalComments, owner, finalPr, headCommit, finalReady);
  if (finalApproval.comment_id !== approval.comment_id || finalApproval.comment_body_sha256 !== approval.comment_body_sha256) fail('DIRECT_OWNER_HANDOFF_APPROVAL_DRIFT');
  const finalOwnerUiEvidence = selectDirectOwnerUiAttestation(finalComments, {
    evidenceCommentId: Number(ownerUiEvidenceCommentId), repository, repositoryOwner: owner,
    prNumber, headSha: expectedHeadSha, authorizationId, readyEvent: finalReady,
    evaluationTime: new Date().toISOString(), handoffWindowSeconds,
  });
  if (finalOwnerUiEvidence.comment_id !== ownerUiEvidence.comment_id
      || finalOwnerUiEvidence.comment_body_sha256 !== ownerUiEvidence.comment_body_sha256) {
    fail('DIRECT_OWNER_UI_ATTESTATION_DRIFT');
  }

  await publish('success', `Direct Owner UI merge authorized for ${handoffWindowSeconds}s`);
  const openedAt = new Date().toISOString();
  receipt = {
    id: 'kidults-direct-owner-landing-handoff-receipt-v1',
    version: '1.0.0',
    state: 'AUTHORIZED_HANDOFF_WINDOW_OPEN',
    repository,
    pull_request: Number(prNumber),
    exact_base_sha: expectedBaseSha,
    exact_head_sha: expectedHeadSha,
    direct_owner: owner,
    transport: TRANSPORT,
    purpose,
    authorization_generation: authorizationGenerationReceipt,
    one_shot_consumption: authorizationClaim,
    authorization_id_sha256: approval.authorization_id_sha256,
    approval_comment_id: approval.comment_id,
    approval_comment_body_sha256: approval.comment_body_sha256,
    approval_nonce_sha256: approval.nonce_sha256,
    approval_expires_at: approval.expires_at,
    latest_ready_event_id: readyEvent.id,
    latest_ready_event_at: readyEvent.created_at,
    owner_ui_attestation: ownerUiEvidence,
    window_ready_state_mutations: [],
    handoff_window_seconds: handoffWindowSeconds,
    handoff_opened_at: openedAt,
    merge_performed_by_workflow: false,
    event_emitting_merge_required: true,
    production: 'HOLD', public: 'HOLD', g5: 'HOLD',
  };
  writeReceipt(receipt);

  await sleep(handoffWindowSeconds * 1000);
  const [after, afterMain, afterTimeline, afterComments] = await Promise.all([
    request(`/pulls/${prNumber}`),
    request('/branches/main'),
    pages(`/issues/${prNumber}/timeline`),
    pages(`/issues/${prNumber}/comments`),
  ]);
  const windowReadyStateMutations = collectDirectOwnerReadyStateMutations(afterTimeline, readyEvent);
  receipt = {...receipt, window_ready_state_mutations: windowReadyStateMutations};
  writeReceipt(receipt);
  if (windowReadyStateMutations.length > 0) fail('DIRECT_OWNER_HANDOFF_READY_STATE_MUTATED_DURING_WINDOW');
  const afterReady = selectLatestDirectOwnerReadyEvent({timeline: afterTimeline, repositoryOwner: owner});
  if (afterReady.id !== readyEvent.id || afterReady.created_at !== readyEvent.created_at) fail('DIRECT_OWNER_HANDOFF_READY_EVENT_DRIFT_AFTER_WINDOW');
  const afterApproval = selectApproval(afterComments, owner, after, headCommit, afterReady, {phase: 'post_window'});
  if (afterApproval.comment_id !== approval.comment_id || afterApproval.comment_body_sha256 !== approval.comment_body_sha256) fail('DIRECT_OWNER_HANDOFF_APPROVAL_DRIFT_AFTER_WINDOW');
  const afterOwnerUiEvidence = selectDirectOwnerUiAttestation(afterComments, {
    evidenceCommentId: Number(ownerUiEvidenceCommentId), repository, repositoryOwner: owner,
    prNumber, headSha: expectedHeadSha, authorizationId, readyEvent: afterReady,
    evaluationTime: new Date().toISOString(), handoffWindowSeconds: 1, phase: 'post_window',
  });
  if (afterOwnerUiEvidence.comment_id !== ownerUiEvidence.comment_id
      || afterOwnerUiEvidence.comment_body_sha256 !== ownerUiEvidence.comment_body_sha256) {
    fail('DIRECT_OWNER_UI_ATTESTATION_DRIFT_AFTER_WINDOW');
  }

  if (after?.merged === true) {
    if (after?.head?.sha !== expectedHeadSha) fail('DIRECT_OWNER_HANDOFF_MERGED_HEAD_DRIFT');
    if (after?.merged_by?.login !== owner) fail('DIRECT_OWNER_HANDOFF_MERGED_BY_NON_OWNER');
    if (!SHA.test(after?.merge_commit_sha || '')) fail('DIRECT_OWNER_HANDOFF_MERGE_SHA_INVALID');
    const mergedAt = parseTime(after?.merged_at, 'DIRECT_OWNER_HANDOFF_MERGED_AT_INVALID');
    const openedAtMs = parseTime(openedAt, 'DIRECT_OWNER_HANDOFF_OPENED_AT_INVALID');
    const closesAtMs = openedAtMs + handoffWindowSeconds * 1000;
    const approvalExpiresAtMs = parseTime(approval.expires_at, 'DIRECT_OWNER_HANDOFF_APPROVAL_EXPIRY_INVALID');
    if (mergedAt < openedAtMs) fail('DIRECT_OWNER_HANDOFF_MERGE_BEFORE_WINDOW_OPEN');
    if (mergedAt > closesAtMs) fail('DIRECT_OWNER_HANDOFF_MERGE_AFTER_WINDOW');
    if (mergedAt > approvalExpiresAtMs) fail('DIRECT_OWNER_HANDOFF_MERGE_AFTER_APPROVAL_EXPIRY');
    if (afterMain?.commit?.sha !== after.merge_commit_sha) fail('DIRECT_OWNER_HANDOFF_MERGE_NOT_CURRENT_MAIN');
    receipt = {
      ...receipt,
      state: 'CONSUMED_BY_DIRECT_OWNER_MERGE',
      merge_commit_sha: after.merge_commit_sha,
      merged_by: after.merged_by.login,
      merged_at: after.merged_at || null,
      handoff_closed_at: new Date().toISOString(),
    };
    writeReceipt(receipt);
    console.log(JSON.stringify(receipt, null, 2));
    process.exit(0);
  }

  if (afterMain?.commit?.sha !== expectedBaseSha) fail('DIRECT_OWNER_HANDOFF_MAIN_MOVED_WITHOUT_BOUND_MERGE');
  if (after?.head?.sha !== expectedHeadSha || after?.state !== 'open') fail('DIRECT_OWNER_HANDOFF_PR_DRIFT_DURING_WINDOW');
  await publish('pending', 'Direct Owner handoff expired unconsumed; fresh authorization required');
  receipt = {
    ...receipt,
    state: 'EXPIRED_UNCONSUMED',
    handoff_closed_at: new Date().toISOString(),
  };
  writeReceipt(receipt);
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  const failureCode = String(error?.code || error?.message || 'DIRECT_OWNER_HANDOFF_FAILED').slice(0, 140);
  if (statusTouched) {
    try { await publish('failure', failureCode); } catch {}
  }
  try {
    writeReceipt({...receipt, state: 'VERIFIED_FAIL', failure_code: failureCode, handoff_closed_at: new Date().toISOString()});
  } catch {}
  throw error;
}
