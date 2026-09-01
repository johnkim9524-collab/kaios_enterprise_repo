import {createHash} from 'node:crypto';

const SHA_PATTERN = /^[0-9a-f]{40}$/;

export class GateFailure extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'GateFailure';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, detail = '') => { throw new GateFailure(code, detail); };
const normalized = value => String(value ?? '').trim().toLowerCase();

const EXACT_HEAD_APPROVAL_MARKER = 'KIDULTS_ATOMIC_LANDING_EXACT_HEAD_APPROVAL_V1';
const EXACT_HEAD_APPROVAL_SCOPE = 'ONE_ATOMIC_GOVERNED_LANDING_ONLY';
const exactTime = (value, code) => {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) fail(code);
  return parsed;
};

function parseExactHeadApprovalBody(body) {
  const lines = String(body || '').trim().split(/\r?\n/);
  if (lines[0] !== EXACT_HEAD_APPROVAL_MARKER) return null;
  const expectedKeys = [
    'pull_request',
    'exact_base_sha',
    'exact_head_sha',
    'authorization_id',
    'scope',
    'approval_rebind',
  ];
  if (lines.length !== expectedKeys.length + 1) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_SHAPE_INVALID');
  const values = {};
  for (const line of lines.slice(1)) {
    const match = /^([a-z_]+)=(.+)$/.exec(line);
    if (!match || !expectedKeys.includes(match[1]) || Object.hasOwn(values, match[1])) {
      fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_FIELD_INVALID');
    }
    values[match[1]] = match[2];
  }
  if (Object.keys(values).length !== expectedKeys.length) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_FIELD_SET_INVALID');
  return values;
}

export function selectExactHeadProgramOwnerApproval(comments, {
  repositoryOwner,
  prNumber,
  headSha,
  baseSha,
  authorizationId,
  prCreatedAt,
  headCommittedAt,
  latestReadyAt,
} = {}) {
  if (!Array.isArray(comments)) fail('PROGRAM_OWNER_APPROVAL_COMMENT_SET_INVALID');
  if (!repositoryOwner || !/^\d+$/.test(String(prNumber || ''))
    || !SHA_PATTERN.test(headSha || '') || !SHA_PATTERN.test(baseSha || '')) {
    fail('PROGRAM_OWNER_APPROVAL_BINDING_INVALID');
  }
  const marked = comments
    .map(comment => ({comment, fields: parseExactHeadApprovalBody(comment?.body)}))
    .filter(item => item.fields)
    .sort((a, b) => exactTime(b.comment.created_at, 'PROGRAM_OWNER_APPROVAL_TIME_INVALID')
      - exactTime(a.comment.created_at, 'PROGRAM_OWNER_APPROVAL_TIME_INVALID')
      || Number(b.comment.id || 0) - Number(a.comment.id || 0));
  if (!marked.length) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_MISSING');

  // The newest structured approval is authoritative. An older exact approval may
  // never mask a later stale-head, edited, or self-rebinding approval comment.
  const {comment, fields} = marked[0];
  if (comment?.user?.login !== repositoryOwner || comment?.author_association !== 'OWNER') {
    fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_ACTOR_INVALID');
  }
  if (comment.updated_at !== comment.created_at) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_EDITED');
  if (fields.pull_request !== String(prNumber)) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_PR_MISMATCH');
  if (fields.exact_head_sha !== headSha) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_HEAD_MISMATCH');
  if (fields.exact_base_sha !== baseSha) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_BASE_MISMATCH');
  if (fields.authorization_id !== authorizationId) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_ID_MISMATCH');
  if (fields.scope !== EXACT_HEAD_APPROVAL_SCOPE) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_SCOPE_INVALID');
  if (fields.approval_rebind !== 'FORBIDDEN') fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_REBIND_INVALID');

  const approvedAt = exactTime(comment.created_at, 'PROGRAM_OWNER_APPROVAL_TIME_INVALID');
  if (approvedAt < exactTime(prCreatedAt, 'PROGRAM_OWNER_APPROVAL_PR_TIME_INVALID')) {
    fail('PROGRAM_OWNER_APPROVAL_PRECEDES_PR');
  }
  if (approvedAt < exactTime(headCommittedAt, 'PROGRAM_OWNER_APPROVAL_HEAD_TIME_INVALID')) {
    fail('PROGRAM_OWNER_APPROVAL_PRECEDES_EXACT_HEAD');
  }
  if (approvedAt > exactTime(latestReadyAt, 'PROGRAM_OWNER_APPROVAL_READY_TIME_INVALID')) {
    fail('PROGRAM_OWNER_APPROVAL_MUST_PRECEDE_READY_EVENT');
  }

  return {
    comment_id: Number(comment.id),
    comment_created_at: comment.created_at,
    comment_body_digest: `sha256:${createHash('sha256').update(String(comment.body)).digest('hex')}`,
    actor: comment.user.login,
    pull_request: Number(prNumber),
    exact_base_sha: baseSha,
    exact_head_sha: headSha,
    authorization_id: authorizationId,
    scope: fields.scope,
    approval_rebind: fields.approval_rebind,
  };
}

export function noMergeBlockers(pr, policy) {
  const blockers = [];
  if (policy?.closed_pull_request_blocks === true && pr?.state !== 'open') blockers.push('PULL_REQUEST_NOT_OPEN');
  if (policy?.merged_pull_request_blocks === true && pr?.merged === true) blockers.push('PULL_REQUEST_ALREADY_MERGED');
  const labels = new Set((pr?.labels || []).map(label => normalized(label?.name ?? label)));
  for (const label of policy?.exact_labels || []) {
    if (labels.has(normalized(label))) blockers.push(`NO_MERGE_LABEL:${normalized(label)}`);
  }
  const title = String(pr?.title ?? '').toUpperCase();
  for (const marker of policy?.title_markers || []) {
    if (title.includes(String(marker).toUpperCase())) blockers.push(`NO_MERGE_TITLE_MARKER:${marker}`);
  }
  return [...new Set(blockers)].sort();
}

export function assertPromotablePullRequest(pr, {
  repository,
  expectedHeadSha,
  expectedBase = 'main',
  noMergePolicy,
} = {}) {
  if (!pr || typeof pr !== 'object') fail('PULL_REQUEST_SNAPSHOT_REQUIRED');
  if (!SHA_PATTERN.test(expectedHeadSha || '')) fail('EXPECTED_HEAD_SHA_REQUIRED');
  if (pr.base?.ref !== expectedBase) fail('PULL_REQUEST_BASE_MISMATCH', String(pr.base?.ref ?? 'missing'));
  if (pr.head?.sha !== expectedHeadSha) fail('PULL_REQUEST_HEAD_CHANGED', String(pr.head?.sha ?? 'missing'));
  if (repository && pr.head?.repo?.full_name !== repository) fail('PULL_REQUEST_HEAD_REPOSITORY_MISMATCH');
  if (pr.draft === true) fail('PULL_REQUEST_DRAFT');
  const blockers = noMergeBlockers(pr, noMergePolicy);
  if (blockers.length) fail('PULL_REQUEST_NO_MERGE_BLOCKED', blockers.join(','));
  return {
    number: Number(pr.number),
    head_sha: pr.head.sha,
    base_ref: pr.base.ref,
    state: pr.state,
    merged: pr.merged === true,
    draft: pr.draft === true,
    updated_at: pr.updated_at ?? null,
    blocker_count: 0,
  };
}

export function assertStableFinalReread(initial, final, options) {
  const before = assertPromotablePullRequest(initial, options);
  const after = assertPromotablePullRequest(final, options);
  if (before.number !== after.number) fail('PULL_REQUEST_NUMBER_CHANGED');
  if (before.head_sha !== after.head_sha) fail('PULL_REQUEST_HEAD_CHANGED_DURING_AUTHORIZATION');
  if (before.base_ref !== after.base_ref) fail('PULL_REQUEST_BASE_CHANGED_DURING_AUTHORIZATION');
  return {initial: before, final: after, stable_exact_head: true};
}

function scopeMatches(filename, rule) {
  return (rule.exact_paths || []).includes(filename)
    || (rule.prefixes || []).some(prefix => filename.startsWith(prefix));
}

export function resolveScopeRequirements(files, metadata, policy) {
  if (!Array.isArray(files)) fail('PULL_REQUEST_FILES_REQUIRED');
  if (!policy || policy.id !== 'kidults-scope-aware-required-status-policy-v1') fail('SCOPE_POLICY_INVALID');
  const commitCount = Number(metadata?.commits ?? 0);
  const changedFileCount = Number(metadata?.changed_files ?? files.length);
  if (files.length === 0) {
    if (commitCount !== 0 || changedFileCount !== 0) fail('ZERO_DIFF_METADATA_CONTRADICTION');
    return {files: [], scopes: [], required_contexts: [...policy.technical_base_contexts].sort(), zero_diff: true};
  }
  if (changedFileCount !== files.length) fail('CHANGED_FILE_PAGINATION_INCOMPLETE', `${files.length}/${changedFileCount}`);
  const unmatched = [];
  const matchedScopes = new Set();
  const contexts = new Set(policy.technical_base_contexts || []);
  for (const entry of files) {
    const filename = typeof entry === 'string' ? entry : entry?.filename;
    if (!filename) fail('PULL_REQUEST_FILENAME_INVALID');
    const matches = (policy.scope_rules || []).filter(rule => scopeMatches(filename, rule));
    if (!matches.length) {
      unmatched.push(filename);
      continue;
    }
    for (const match of matches) {
      matchedScopes.add(match.id);
      for (const context of match.required_contexts || []) contexts.add(context);
    }
  }
  if (unmatched.length) fail('ZERO_COVERAGE_SCOPE', unmatched.sort().join(','));
  if (!contexts.size) fail('ZERO_REQUIRED_STATUS_CONTEXTS');
  if (contexts.has(policy.required_status_context)) fail('AGGREGATOR_SELF_DEPENDENCY');
  return {
    files: files.map(entry => typeof entry === 'string' ? entry : entry.filename).sort(),
    scopes: [...matchedScopes].sort(),
    required_contexts: [...contexts].sort(),
    zero_diff: false,
  };
}

const stamp = item => Date.parse(item?.completed_at || item?.updated_at || item?.started_at || item?.created_at || 0);

export function evaluateRequiredCheckRuns(checkRuns, requiredContexts) {
  if (!Array.isArray(checkRuns)) fail('CHECK_RUNS_REQUIRED');
  const expected = [...new Set(requiredContexts || [])].sort();
  if (!expected.length) fail('ZERO_REQUIRED_STATUS_CONTEXTS');
  const results = [];
  for (const context of expected) {
    const candidates = checkRuns.filter(run => run?.name === context).sort((a, b) => stamp(b) - stamp(a));
    if (!candidates.length) fail('REQUIRED_CONTEXT_MISSING', context);
    if (candidates.length > 1 && stamp(candidates[0]) === stamp(candidates[1])) fail('REQUIRED_CONTEXT_LATEST_AMBIGUOUS', context);
    const latest = candidates[0];
    if (latest.status !== 'completed') fail('REQUIRED_CONTEXT_NOT_TERMINAL', context);
    if (latest.conclusion !== 'success') fail('REQUIRED_CONTEXT_NOT_SUCCESS', `${context}:${latest.conclusion ?? 'null'}`);
    results.push({context, check_run_id: latest.id, status: latest.status, conclusion: latest.conclusion});
  }
  return results;
}

export function assertNativeRequiredContexts(rulesetContexts, expectedContexts) {
  const actual = new Set(rulesetContexts || []);
  const missing = (expectedContexts || []).filter(context => !actual.has(context));
  if (missing.length) fail('NATIVE_REQUIRED_STATUS_CONTEXT_MISSING', missing.sort().join(','));
  return [...expectedContexts].sort();
}

export function assertLandingActorAndAuthorization(actor, repositoryOwner, authorizationId, prNumber, expectedHeadSha) {
  if (!actor || actor !== repositoryOwner) fail('PROGRAM_OWNER_LANDING_ACTOR_REQUIRED');
  if (!/^\d+$/.test(String(prNumber)) || !SHA_PATTERN.test(expectedHeadSha || '')) fail('LANDING_OPERATION_BINDING_INVALID');
  const expected = `LAND-PR-${prNumber}-${expectedHeadSha.slice(0, 12)}`;
  if (authorizationId !== expected) fail('ATOMIC_LANDING_OPERATION_AUTHORIZATION_MISMATCH');
  return {actor, authorization_id: authorizationId, expected_head_sha: expectedHeadSha};
}

export function authoritativeGenerationKey(receipt) {
  const sourceSha = receipt?.source_sha;
  const runId = Number(receipt?.p1_workflow_run_id);
  const artifactId = Number(receipt?.p1_artifact_id);
  const digest = receipt?.p1_artifact_digest;
  if (!SHA_PATTERN.test(sourceSha || '') || !Number.isInteger(runId) || runId <= 0
    || !Number.isInteger(artifactId) || artifactId <= 0 || typeof digest !== 'string' || !digest.length) {
    fail('ARL_GENERATION_BINDING_INVALID');
  }
  return `${sourceSha}:${runId}:${artifactId}:${digest}`;
}

export function assertSingleAuthoritativeProducer(receipts, generationKey) {
  const leaders = (receipts || []).filter(receipt =>
    receipt?.artifact_role === 'AUTHORITATIVE_CONSUMABLE'
    && receipt?.authoritative_producer === true
    && receipt?.exact_triggering_run_bound === true
    && authoritativeGenerationKey(receipt) === generationKey);
  if (leaders.length !== 1) fail('ARL_AUTHORITATIVE_PRODUCER_CARDINALITY', String(leaders.length));
  return leaders[0];
}
