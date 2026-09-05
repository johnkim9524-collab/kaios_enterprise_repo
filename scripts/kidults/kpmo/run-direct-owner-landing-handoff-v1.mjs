#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertPromotablePullRequest,
  evaluateRequiredCheckRuns,
} from './lib/governed-landing-native-gates-v1.mjs';
import {selectLatestDirectOwnerReadyEvent} from './lib/direct-owner-ready-event-v1.mjs';

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

if (!token || !/^[^/]+\/[^/]+$/.test(repository) || !/^\d+$/.test(prNumber)) fail('DIRECT_OWNER_HANDOFF_ENVIRONMENT_INVALID');
if (!SHA.test(expectedHeadSha) || !SHA.test(expectedBaseSha)) fail('DIRECT_OWNER_HANDOFF_SHA_INVALID');
if (authorizationId !== `DIRECT-PR-${prNumber}-${expectedHeadSha.slice(0, 12)}`) fail('DIRECT_OWNER_HANDOFF_AUTHORIZATION_ID_INVALID');
if (!PURPOSE.test(purpose)) fail('DIRECT_OWNER_HANDOFF_PURPOSE_INVALID');
if (executionRef !== 'refs/heads/main') fail('DIRECT_OWNER_HANDOFF_MAIN_REF_REQUIRED');
if (runAttempt !== 1) fail('DIRECT_OWNER_HANDOFF_RERUN_FORBIDDEN');
if (!Number.isInteger(handoffWindowSeconds) || handoffWindowSeconds < 60 || handoffWindowSeconds > 900) fail('DIRECT_OWNER_HANDOFF_WINDOW_INVALID');

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kidults-direct-owner-landing-handoff-v1',
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
const publish = (state, description) => request(`/statuses/${expectedHeadSha}`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({state, context, description: String(description).slice(0, 140)}),
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
    const match = /^([a-z_]+)=(.+)$/.exec(line);
    if (!match || !approvalKeys.includes(match[1]) || Object.hasOwn(fields, match[1])) fail('DIRECT_OWNER_HANDOFF_APPROVAL_FIELD_INVALID');
    fields[match[1]] = match[2];
  }
  if (Object.keys(fields).length !== approvalKeys.length) fail('DIRECT_OWNER_HANDOFF_APPROVAL_FIELD_SET_INVALID');
  return fields;
}

function selectApproval(comments, repositoryOwner, pr, headCommit, readyEvent) {
  const marked = comments
    .map(comment => ({comment, fields: parseApproval(comment?.body)}))
    .filter(value => value.fields)
    .sort((a, b) => parseTime(b.comment.created_at, 'DIRECT_OWNER_HANDOFF_APPROVAL_TIME_INVALID')
      - parseTime(a.comment.created_at, 'DIRECT_OWNER_HANDOFF_APPROVAL_TIME_INVALID')
      || Number(b.comment.id || 0) - Number(a.comment.id || 0));
  if (!marked.length) fail('DIRECT_OWNER_HANDOFF_APPROVAL_MISSING');
  const {comment, fields} = marked[0];
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
  if (approvedAt > parseTime(readyEvent.created_at, 'DIRECT_OWNER_HANDOFF_READY_TIME_INVALID')) fail('DIRECT_OWNER_HANDOFF_APPROVAL_MUST_PRECEDE_READY');
  if (expiresAt <= approvedAt || expiresAt - approvedAt > MAX_APPROVAL_LIFETIME_MS) fail('DIRECT_OWNER_HANDOFF_APPROVAL_EXPIRY_WINDOW_INVALID');
  if (now < approvedAt || now > expiresAt) fail('DIRECT_OWNER_HANDOFF_APPROVAL_EXPIRED');
  if (expiresAt - now < handoffWindowSeconds * 1000) fail('DIRECT_OWNER_HANDOFF_APPROVAL_EXPIRES_BEFORE_WINDOW');

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
let receipt = null;
try {
  await publish('pending', 'Direct Owner exact-head handoff validation in progress');
  statusTouched = true;

  const [repo, pr, main, files, timeline, comments, headCommit, statuses, runs, rulesets] = await Promise.all([
    request(''),
    request(`/pulls/${prNumber}`),
    request('/branches/main'),
    pages(`/pulls/${prNumber}/files`),
    pages(`/issues/${prNumber}/timeline`),
    pages(`/issues/${prNumber}/comments`),
    request(`/commits/${expectedHeadSha}`),
    request(`/commits/${expectedHeadSha}/status`),
    checkRuns(expectedHeadSha),
    request('/rulesets'),
  ]);
  const owner = repo?.owner?.login;
  if (!owner || actor !== owner) fail('DIRECT_OWNER_HANDOFF_DISPATCH_ACTOR_NOT_OWNER');
  assertPromotablePullRequest(pr, {repository, expectedHeadSha, expectedBase: 'main', noMergePolicy: policy.no_merge_policy});
  if (pr.user?.login !== owner || pr.head?.repo?.full_name !== repository) fail('DIRECT_OWNER_HANDOFF_PR_OWNER_BINDING_INVALID');
  if (pr.base?.sha !== expectedBaseSha || main?.commit?.sha !== expectedBaseSha) fail('DIRECT_OWNER_HANDOFF_BASE_NOT_CURRENT_MAIN');
  if (pr.mergeable !== true || !['clean', 'unstable', 'blocked', 'has_hooks'].includes(pr.mergeable_state)) fail('DIRECT_OWNER_HANDOFF_PR_NOT_SERVER_MERGEABLE');
  if (!Array.isArray(files) || files.length !== Number(pr.changed_files || 0)) fail('DIRECT_OWNER_HANDOFF_CHANGED_FILE_PAGINATION_INVALID');

  const readyEvent = selectLatestDirectOwnerReadyEvent({timeline, repositoryOwner: owner});
  const approval = selectApproval(comments, owner, pr, headCommit, readyEvent);

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
    authorization_id_sha256: approval.authorization_id_sha256,
    approval_comment_id: approval.comment_id,
    approval_comment_body_sha256: approval.comment_body_sha256,
    approval_nonce_sha256: approval.nonce_sha256,
    approval_expires_at: approval.expires_at,
    latest_ready_event_id: readyEvent.id,
    latest_ready_event_at: readyEvent.created_at,
    handoff_window_seconds: handoffWindowSeconds,
    handoff_opened_at: openedAt,
    merge_performed_by_workflow: false,
    event_emitting_merge_required: true,
    production: 'HOLD', public: 'HOLD', g5: 'HOLD',
  };
  writeReceipt(receipt);

  await sleep(handoffWindowSeconds * 1000);
  const after = await request(`/pulls/${prNumber}`);
  if (after?.merged === true) {
    if (after?.merged_by?.login !== owner) fail('DIRECT_OWNER_HANDOFF_MERGED_BY_NON_OWNER');
    if (!SHA.test(after?.merge_commit_sha || '')) fail('DIRECT_OWNER_HANDOFF_MERGE_SHA_INVALID');
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

  const currentMain = await request('/branches/main');
  if (currentMain?.commit?.sha !== expectedBaseSha) fail('DIRECT_OWNER_HANDOFF_MAIN_MOVED_WITHOUT_BOUND_MERGE');
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
  if (statusTouched) {
    try { await publish('failure', String(error?.code || error?.message || 'direct owner handoff failed').slice(0, 140)); } catch {}
  }
  if (receipt) {
    try {
      writeReceipt({...receipt, state: 'VERIFIED_FAIL', failure_code: String(error?.code || error?.message || 'DIRECT_OWNER_HANDOFF_FAILED').slice(0, 140), handoff_closed_at: new Date().toISOString()});
    } catch {}
  }
  throw error;
}
