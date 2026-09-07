import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SHA40 = /^[0-9a-f]{40}$/;
export const SHA256 = /^sha256:[0-9a-f]{64}$/;
export const NONCE32 = /^[0-9a-f]{32}$/;
export const MAX_APPROVAL_LIFETIME_MS = 60 * 60 * 1000;
export const MAX_PAGES = 10;
export const APPROVAL_MARKER = 'KIDULTS_ATOMIC_TERMINAL_RECOVERY_EXACT_APPROVAL_V1';
export const APPROVAL_OPERATION = 'PUBLISH_DISTINCT_ATOMIC_TERMINAL_RECOVERY_STATUS';
export const APPROVAL_SCOPE = 'ONE_BOUNDED_ATOMIC_TERMINAL_RECOVERY_ONLY';
export const HISTORICAL_CONTEXT = 'KIDULTS Atomic Landing Terminal V2';
export const RECOVERY_CONTEXT = 'KIDULTS Atomic Landing Recovery V1';
export const POST_CONTEXT = 'KIDULTS Current-SOLD Post-Landing V1';
export const EXPECTED_BRANCH = 'main';
export const EXPECTED_EVENT = 'workflow_dispatch';

export function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  error.detail = detail;
  throw error;
}

export function assert(condition, code, detail = '') {
  if (!condition) fail(code, detail);
}

export function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

export function normalizeSha256(value) {
  const text = String(value || '').trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(text)) return `sha256:${text}`;
  return text;
}

export function exactTime(value, code) {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) fail(code);
  return parsed;
}

export function writeJsonSecure(file, value) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  fs.chmodSync(directory, 0o700);
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8', mode: 0o600, flag: 'wx',
  });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

export function readJson(file, code = 'ATOMIC_RECOVERY_JSON_INVALID') {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fail(code, file);
  }
}

export function sortedLatest(items) {
  return [...items].sort((a, b) =>
    exactTime(b?.created_at || b?.updated_at, 'ATOMIC_RECOVERY_RECORD_TIME_INVALID')
    - exactTime(a?.created_at || a?.updated_at, 'ATOMIC_RECOVERY_RECORD_TIME_INVALID')
    || Number(b?.id || 0) - Number(a?.id || 0));
}

export function statusesFor(payload, context) {
  return sortedLatest((Array.isArray(payload?.statuses) ? payload.statuses : [])
    .filter(item => item?.context === context));
}

export function latestStatus(payload, context) {
  return statusesFor(payload, context)[0] || null;
}

export function parseRecoveryApprovalBody(body) {
  const lines = String(body || '').trim().split(/\r?\n/);
  if (lines[0] !== APPROVAL_MARKER) return null;
  const expectedKeys = [
    'repository',
    'source_issue',
    'predecessor_pull_request',
    'predecessor_atomic_run',
    'predecessor_merge_sha',
    'historical_terminal_status_id',
    'exact_current_main_sha',
    'recovery_manifest_sha256',
    'operation',
    'recovery_context',
    'authorization_id',
    'nonce',
    'expires_at',
    'scope',
    'approval_rebind',
  ];
  assert(lines.length === expectedKeys.length + 1, 'ATOMIC_RECOVERY_APPROVAL_SHAPE_INVALID');
  const values = {};
  for (const [index, line] of lines.slice(1).entries()) {
    const match = /^([a-z0-9_]+)=(.+)$/.exec(line);
    assert(match && match[1] === expectedKeys[index], 'ATOMIC_RECOVERY_APPROVAL_FIELD_ORDER_INVALID');
    assert(!Object.hasOwn(values, match[1]), 'ATOMIC_RECOVERY_APPROVAL_FIELD_DUPLICATE');
    values[match[1]] = match[2];
  }
  return values;
}

export function buildRecoveryRunName({predecessorRunId, currentMainSha, authorizationId} = {}) {
  assert(Number.isInteger(Number(predecessorRunId)) && Number(predecessorRunId) > 0,
    'ATOMIC_RECOVERY_PREDECESSOR_RUN_INVALID');
  assert(SHA40.test(currentMainSha || ''), 'ATOMIC_RECOVERY_CURRENT_MAIN_INVALID');
  const expectedAuthorization = `RECOVER-RUN-${predecessorRunId}-${currentMainSha.slice(0, 12)}`;
  assert(authorizationId === expectedAuthorization, 'ATOMIC_RECOVERY_AUTHORIZATION_ID_INVALID');
  return `KIDULTS Atomic Terminal Recovery Run #${predecessorRunId} @ ${currentMainSha} / ${authorizationId}`;
}

export function validateManifest(manifest) {
  assert(manifest?.id === 'kidults-atomic-terminal-recovery-manifest-v2',
    'ATOMIC_RECOVERY_MANIFEST_ID_INVALID');
  assert(manifest?.version === '2.0.0'
    && manifest?.state === 'PENDING_DISTINCT_CONTEXT_RECOVERY',
  'ATOMIC_RECOVERY_MANIFEST_STATE_INVALID');
  assert(manifest?.repository === 'johnkim9524-collab/kaios_enterprise_repo',
    'ATOMIC_RECOVERY_REPOSITORY_INVALID');
  assert(Array.isArray(manifest?.source_issues)
    && manifest.source_issues.length === 2
    && manifest.source_issues[0] === 1864
    && manifest.source_issues[1] === 1868
    && manifest?.approval_issue === 1868,
  'ATOMIC_RECOVERY_SOURCE_ISSUES_INVALID');
  assert(manifest?.cause === 'BASE_WORKFLOW_CANDIDATE_TERMINAL_HANDOFF_BOOTSTRAP_MISMATCH',
    'ATOMIC_RECOVERY_CAUSE_INVALID');
  const pr = manifest.predecessor_pull_request;
  assert(pr?.number === 1865 && SHA40.test(pr?.exact_base_sha || '')
    && SHA40.test(pr?.exact_head_sha || '') && SHA40.test(pr?.merge_commit_sha || '')
    && SHA40.test(pr?.merge_tree_sha || ''), 'ATOMIC_RECOVERY_PR_BINDING_INVALID');
  const run = manifest.atomic_run;
  assert(run?.id === 33603816578 && run?.attempt === 1
    && Number.isInteger(run?.workflow_id) && run.workflow_id > 0
    && run?.expected_conclusion === 'failure'
    && SHA256.test(run?.authorization_id_sha256 || ''),
  'ATOMIC_RECOVERY_RUN_BINDING_INVALID');
  assert(typeof run?.display_title === 'string' && run.display_title.includes('LAND-PR-1865-'),
    'ATOMIC_RECOVERY_RUN_TITLE_INVALID');
  for (const [label, artifact] of [
    ['POST', manifest.postlanding_artifact],
    ['TERMINAL', manifest.failed_terminal_artifact],
  ]) {
    assert(Number.isInteger(artifact?.id) && artifact.id > 0
      && typeof artifact?.name === 'string' && artifact.name.length > 0
      && SHA256.test(artifact?.digest || ''),
    `ATOMIC_RECOVERY_${label}_ARTIFACT_INVALID`);
  }
  const historical = manifest.historical_terminal_status;
  assert(Number.isInteger(historical?.id) && historical.id > 0
    && historical?.context === HISTORICAL_CONTEXT
    && historical?.state === 'failure'
    && historical?.description === 'ATOMIC_TERMINAL_CURRENT_SOLD_OUTPUT_INVALID'
    && typeof historical?.target_url === 'string'
    && historical.target_url.endsWith(`/actions/runs/${run.id}`)
    && Number.isFinite(Date.parse(historical?.created_at || '')),
  'ATOMIC_RECOVERY_HISTORICAL_STATUS_INVALID');
  assert(manifest?.recovery_status_context === RECOVERY_CONTEXT
    && RECOVERY_CONTEXT !== HISTORICAL_CONTEXT,
  'ATOMIC_RECOVERY_CONTEXT_SUBSTITUTION');
  const policy = manifest.authorization_policy;
  assert(policy?.marker === APPROVAL_MARKER
    && policy?.operation === APPROVAL_OPERATION
    && policy?.scope === APPROVAL_SCOPE
    && policy?.max_lifetime_seconds === 3600
    && policy?.first_dispatch_only === true
    && policy?.rerun_forbidden === true
    && policy?.historical_terminal_context_immutable === true,
  'ATOMIC_RECOVERY_AUTHORIZATION_POLICY_INVALID');
  assert(manifest?.public === 'HOLD' && manifest?.production === 'HOLD' && manifest?.g5 === 'HOLD',
    'ATOMIC_RECOVERY_HOLD_INVALID');
  return manifest;
}

export function selectRecoveryApproval(comments, {
  manifest,
  repositoryOwner,
  currentMainSha,
  currentMainCommittedAt,
  manifestDigest,
  authorizationId,
  evaluationTime,
} = {}) {
  assert(Array.isArray(comments), 'ATOMIC_RECOVERY_APPROVAL_COMMENT_SET_INVALID');
  validateManifest(manifest);
  assert(repositoryOwner && SHA40.test(currentMainSha || '') && SHA256.test(manifestDigest || ''),
    'ATOMIC_RECOVERY_APPROVAL_BINDING_INVALID');
  const marked = comments
    .map(comment => ({comment, fields: parseRecoveryApprovalBody(comment?.body)}))
    .filter(item => item.fields)
    .sort((a, b) => exactTime(b.comment?.created_at, 'ATOMIC_RECOVERY_APPROVAL_TIME_INVALID')
      - exactTime(a.comment?.created_at, 'ATOMIC_RECOVERY_APPROVAL_TIME_INVALID')
      || Number(b.comment?.id || 0) - Number(a.comment?.id || 0));
  assert(marked.length > 0, 'ATOMIC_RECOVERY_APPROVAL_MISSING');
  const {comment, fields} = marked[0];
  assert(comment?.user?.login === repositoryOwner && comment?.author_association === 'OWNER',
    'ATOMIC_RECOVERY_APPROVAL_ACTOR_INVALID');
  assert(comment?.performed_via_github_app == null, 'ATOMIC_RECOVERY_APPROVAL_APP_MEDIATED');
  assert(comment?.created_at === comment?.updated_at, 'ATOMIC_RECOVERY_APPROVAL_EDITED');
  const pr = manifest.predecessor_pull_request;
  const historical = manifest.historical_terminal_status;
  assert(fields.repository === manifest.repository, 'ATOMIC_RECOVERY_APPROVAL_REPOSITORY_MISMATCH');
  assert(fields.source_issue === String(manifest.approval_issue), 'ATOMIC_RECOVERY_APPROVAL_ISSUE_MISMATCH');
  assert(fields.predecessor_pull_request === String(pr.number), 'ATOMIC_RECOVERY_APPROVAL_PR_MISMATCH');
  assert(fields.predecessor_atomic_run === String(manifest.atomic_run.id), 'ATOMIC_RECOVERY_APPROVAL_RUN_MISMATCH');
  assert(fields.predecessor_merge_sha === pr.merge_commit_sha, 'ATOMIC_RECOVERY_APPROVAL_MERGE_MISMATCH');
  assert(fields.historical_terminal_status_id === String(historical.id),
    'ATOMIC_RECOVERY_APPROVAL_HISTORICAL_STATUS_MISMATCH');
  assert(fields.exact_current_main_sha === currentMainSha, 'ATOMIC_RECOVERY_APPROVAL_MAIN_MISMATCH');
  assert(fields.recovery_manifest_sha256 === manifestDigest, 'ATOMIC_RECOVERY_APPROVAL_MANIFEST_MISMATCH');
  assert(fields.operation === APPROVAL_OPERATION, 'ATOMIC_RECOVERY_APPROVAL_OPERATION_INVALID');
  assert(fields.recovery_context === RECOVERY_CONTEXT, 'ATOMIC_RECOVERY_APPROVAL_CONTEXT_INVALID');
  assert(fields.authorization_id === authorizationId, 'ATOMIC_RECOVERY_APPROVAL_ID_MISMATCH');
  assert(NONCE32.test(fields.nonce || ''), 'ATOMIC_RECOVERY_APPROVAL_NONCE_INVALID');
  assert(fields.scope === APPROVAL_SCOPE, 'ATOMIC_RECOVERY_APPROVAL_SCOPE_INVALID');
  assert(fields.approval_rebind === 'FORBIDDEN', 'ATOMIC_RECOVERY_APPROVAL_REBIND_INVALID');
  const approvedAt = exactTime(comment.created_at, 'ATOMIC_RECOVERY_APPROVAL_TIME_INVALID');
  const mainAt = exactTime(currentMainCommittedAt, 'ATOMIC_RECOVERY_MAIN_COMMIT_TIME_INVALID');
  const expiresAt = exactTime(fields.expires_at, 'ATOMIC_RECOVERY_APPROVAL_EXPIRY_INVALID');
  const evaluatedAt = exactTime(evaluationTime, 'ATOMIC_RECOVERY_APPROVAL_EVALUATION_TIME_INVALID');
  assert(approvedAt >= mainAt, 'ATOMIC_RECOVERY_APPROVAL_PRECEDES_CURRENT_MAIN');
  assert(expiresAt > approvedAt && expiresAt - approvedAt <= MAX_APPROVAL_LIFETIME_MS,
    'ATOMIC_RECOVERY_APPROVAL_EXPIRY_WINDOW_INVALID');
  assert(evaluatedAt >= approvedAt, 'ATOMIC_RECOVERY_APPROVAL_NOT_YET_VALID');
  assert(evaluatedAt <= expiresAt, 'ATOMIC_RECOVERY_APPROVAL_EXPIRED');
  return {
    comment_id: Number(comment.id),
    comment_created_at: comment.created_at,
    comment_body_digest: sha256(String(comment.body)),
    actor: repositoryOwner,
    expires_at: fields.expires_at,
    exact_current_main_sha: currentMainSha,
    manifest_digest: manifestDigest,
    authorization_id_sha256: sha256(authorizationId),
    nonce_sha256: sha256(fields.nonce),
    app_mediated: false,
    edited: false,
  };
}

export function evaluateRecoveryRunSet(runs, {
  currentRunId,
  currentRunAttempt,
  workflowId,
  predecessorRunId,
  expectedRunName,
  currentMainSha,
  repositoryOwner,
  approval,
} = {}) {
  assert(Array.isArray(runs), 'ATOMIC_RECOVERY_RUN_SET_INVALID');
  assert(Number(currentRunAttempt) === 1, 'ATOMIC_RECOVERY_RERUN_FORBIDDEN');
  const currentMatches = runs.filter(run => Number(run?.id) === Number(currentRunId));
  assert(currentMatches.length === 1, 'ATOMIC_RECOVERY_CURRENT_RUN_CARDINALITY_INVALID');
  const current = currentMatches[0];
  assert(Number(current?.workflow_id) === Number(workflowId), 'ATOMIC_RECOVERY_WORKFLOW_ID_MISMATCH');
  assert(current?.event === EXPECTED_EVENT && current?.head_branch === EXPECTED_BRANCH,
    'ATOMIC_RECOVERY_CURRENT_RUN_TRIGGER_INVALID');
  assert(current?.head_sha === currentMainSha && current?.display_title === expectedRunName,
    'ATOMIC_RECOVERY_CURRENT_RUN_TUPLE_MISMATCH');
  assert(Number(current?.run_attempt) === 1, 'ATOMIC_RECOVERY_RERUN_FORBIDDEN');
  assert(current?.actor?.login === repositoryOwner, 'ATOMIC_RECOVERY_DISPATCH_ACTOR_NOT_OWNER');
  assert(current?.triggering_actor?.login === repositoryOwner, 'ATOMIC_RECOVERY_TRIGGERING_ACTOR_NOT_OWNER');
  const createdAt = exactTime(current?.created_at, 'ATOMIC_RECOVERY_DISPATCH_TIME_INVALID');
  assert(createdAt >= exactTime(approval?.comment_created_at, 'ATOMIC_RECOVERY_APPROVAL_TIME_INVALID'),
    'ATOMIC_RECOVERY_DISPATCH_PRECEDES_APPROVAL');
  assert(createdAt <= exactTime(approval?.expires_at, 'ATOMIC_RECOVERY_APPROVAL_EXPIRY_INVALID'),
    'ATOMIC_RECOVERY_DISPATCH_AFTER_APPROVAL_EXPIRY');
  const exactMatches = runs.filter(run => Number(run?.workflow_id) === Number(workflowId)
    && run?.event === EXPECTED_EVENT && run?.head_branch === EXPECTED_BRANCH
    && run?.display_title === expectedRunName);
  assert(exactMatches.length === 1 && Number(exactMatches[0]?.id) === Number(currentRunId),
    'ATOMIC_RECOVERY_DUPLICATE_DISPATCH');
  const incidentPrefix = `KIDULTS Atomic Terminal Recovery Run #${predecessorRunId} @ `;
  const incidentRuns = runs.filter(run => Number(run?.workflow_id) === Number(workflowId)
    && run?.event === EXPECTED_EVENT && run?.head_branch === EXPECTED_BRANCH
    && String(run?.display_title || '').startsWith(incidentPrefix));
  assert(incidentRuns.length === 1 && Number(incidentRuns[0]?.id) === Number(currentRunId),
    'ATOMIC_RECOVERY_PRIOR_INCIDENT_ATTEMPT_EXISTS');
  return {
    run_id: Number(currentRunId),
    run_attempt: 1,
    workflow_id: Number(workflowId),
    dispatch_actor: repositoryOwner,
    triggering_actor: repositoryOwner,
    run_name_sha256: sha256(expectedRunName),
    matching_run_count: 1,
    incident_run_count: 1,
  };
}

export function assertHistoricalRedImmutable(statusPayload, manifest) {
  validateManifest(manifest);
  const expected = manifest.historical_terminal_status;
  const entries = statusesFor(statusPayload, HISTORICAL_CONTEXT);
  assert(entries.length > 0, 'ATOMIC_RECOVERY_HISTORICAL_STATUS_MISSING');
  const exact = entries.find(item => Number(item?.id) === expected.id);
  assert(exact && exact.state === expected.state && exact.description === expected.description
    && exact.target_url === expected.target_url && exact.created_at === expected.created_at,
  'ATOMIC_RECOVERY_HISTORICAL_STATUS_DRIFT');
  assert(Number(entries[0]?.id) === expected.id,
    'ATOMIC_RECOVERY_HISTORICAL_CONTEXT_OVERWRITTEN');
  return {
    id: expected.id,
    context: HISTORICAL_CONTEXT,
    state: 'failure',
    immutable: true,
  };
}

export function assertRecoveryContextAbsent(statusPayload) {
  const entries = statusesFor(statusPayload, RECOVERY_CONTEXT);
  assert(entries.length === 0, 'ATOMIC_RECOVERY_PRIOR_STATUS_EXISTS', String(entries.length));
  return {context: RECOVERY_CONTEXT, prior_status_count: 0};
}

export function assertRecoverySuccessReadback(statusPayload, publishedId, runId) {
  const entries = statusesFor(statusPayload, RECOVERY_CONTEXT);
  assert(entries.length === 1, 'ATOMIC_RECOVERY_STATUS_CARDINALITY_INVALID', String(entries.length));
  const status = entries[0];
  assert(Number(status?.id) === Number(publishedId) && status?.state === 'success',
    'ATOMIC_RECOVERY_STATUS_READBACK_INVALID');
  assert(status?.description === 'Recovered evidence verified; original terminal RED preserved',
    'ATOMIC_RECOVERY_STATUS_DESCRIPTION_INVALID');
  assert(String(status?.target_url || '').endsWith(`/actions/runs/${runId}`),
    'ATOMIC_RECOVERY_STATUS_TARGET_INVALID');
  return status;
}
