#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const INCIDENT_RUN_ID = 35564707631;
export const APPROVAL_MARKER = 'KIDULTS_ATOMIC_LANDING_TERMINAL_RECOVERY_EXACT_APPROVAL_V1';
export const APPROVAL_OPERATION = 'PUBLISH_DISTINCT_ATOMIC_LANDING_RECOVERY_STATUS';
export const APPROVAL_SCOPE = 'ONE_BOUND_TERMINAL_RECOVERY_ONLY';
export const RECOVERY_CONTEXT = 'KIDULTS Atomic Landing Recovery V2';
export const TERMINAL_CONTEXT = 'KIDULTS Atomic Landing Terminal V2';
export const AUTHORIZATION_CONTEXT = 'KIDULTS Governed Landing Authorization V1';
const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const NONCE32 = /^[0-9a-f]{32}$/;
const MAX_APPROVAL_LIFETIME_MS = 60 * 60 * 1000;

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

const exactTime = (value, code) => {
  const parsed = Date.parse(String(value || ''));
  assert(Number.isFinite(parsed), code);
  return parsed;
};

const normalizeDigest = value => {
  const text = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(text) ? `sha256:${text}` : text;
};

const sortedLatest = values => [...values].sort((a, b) =>
  exactTime(b.created_at || b.updated_at, 'RECOVERY_RECORD_TIME_INVALID')
  - exactTime(a.created_at || a.updated_at, 'RECOVERY_RECORD_TIME_INVALID')
  || Number(b.id || 0) - Number(a.id || 0));

const statusesFor = (payload, context) => sortedLatest(
  (Array.isArray(payload?.statuses) ? payload.statuses : []).filter(value => value?.context === context),
);

export function validateManifest(manifest) {
  assert(manifest?.id === 'kidults-atomic-landing-terminal-recovery-manifest-v1'
    && manifest?.version === '1.0.0'
    && manifest?.state === 'PENDING_DISTINCT_CONTEXT_RECOVERY',
  'RECOVERY_MANIFEST_IDENTITY_INVALID');
  assert(manifest?.repository === 'johnkim9524-collab/kaios_enterprise_repo'
    && manifest?.source_issue === 2277
    && manifest?.cause === 'EVENT_TRANSPORT_MAIN_MOVED_BEFORE_BOUND_MERGE_VISIBILITY',
  'RECOVERY_MANIFEST_INCIDENT_INVALID');
  const pr = manifest.predecessor_pull_request;
  assert(pr?.number === 2277 && SHA40.test(pr?.exact_base_sha || '')
    && SHA40.test(pr?.exact_head_sha || '') && SHA40.test(pr?.exact_head_tree_sha || '')
    && SHA40.test(pr?.merge_commit_sha || '') && pr?.merged_by === 'johnkim9524-collab'
    && pr?.changed_files === 5 && pr?.current_sold_changed === false
    && Number.isFinite(Date.parse(pr?.merged_at || '')),
  'RECOVERY_MANIFEST_PR_INVALID');
  const run = manifest.atomic_run;
  assert(run?.id === INCIDENT_RUN_ID && run?.attempt === 1 && run?.workflow_id === 345463226
    && run?.event === 'workflow_dispatch' && run?.actor === 'johnkim9524-collab'
    && run?.expected_conclusion === 'failure' && SHA256.test(run?.authorization_id_sha256 || ''),
  'RECOVERY_MANIFEST_RUN_INVALID');
  for (const [label, artifact] of [['INTENT', manifest.intent_artifact], ['TERMINAL', manifest.terminal_artifact]]) {
    assert(Number.isInteger(artifact?.id) && artifact.id > 0 && artifact?.name
      && SHA256.test(artifact?.digest || '') && artifact?.receipt_state && artifact?.terminal_class,
    `RECOVERY_MANIFEST_${label}_ARTIFACT_INVALID`);
  }
  const terminal = manifest.historical_terminal_status;
  const authorization = manifest.historical_authorization_status;
  assert(terminal?.id === 54557905793 && terminal?.context === TERMINAL_CONTEXT
    && terminal?.state === 'failure' && terminal?.description === manifest.terminal_artifact.terminal_class,
  'RECOVERY_MANIFEST_TERMINAL_STATUS_INVALID');
  assert(authorization?.id === 54557909931 && authorization?.context === AUTHORIZATION_CONTEXT
    && authorization?.state === 'failure' && authorization?.description === 'PULL_REQUEST_NO_MERGE_BLOCKED'
    && authorization?.preceding_success_status_id === 54557625905,
  'RECOVERY_MANIFEST_AUTHORIZATION_STATUS_INVALID');
  assert(Array.isArray(manifest.required_postmerge_runs) && manifest.required_postmerge_runs.length === 2,
    'RECOVERY_MANIFEST_POSTMERGE_RUNS_INVALID');
  for (const runProof of manifest.required_postmerge_runs) {
    assert(Number.isInteger(runProof?.id) && runProof.id > 0 && runProof?.name
      && runProof?.head_sha === pr.merge_commit_sha && runProof?.conclusion === 'success',
    'RECOVERY_MANIFEST_POSTMERGE_RUN_INVALID');
  }
  assert(manifest.recovery_status_context === RECOVERY_CONTEXT
    && RECOVERY_CONTEXT !== TERMINAL_CONTEXT && RECOVERY_CONTEXT !== AUTHORIZATION_CONTEXT,
  'RECOVERY_CONTEXT_SUBSTITUTION_INVALID');
  const policy = manifest.authorization_policy;
  assert(policy?.marker === APPROVAL_MARKER && policy?.operation === APPROVAL_OPERATION
    && policy?.scope === APPROVAL_SCOPE && policy?.max_lifetime_seconds === 3600
    && policy?.first_dispatch_only === true && policy?.rerun_forbidden === true
    && policy?.prior_landing_authorization_reuse_forbidden === true
    && policy?.historical_status_contexts_immutable === true,
  'RECOVERY_MANIFEST_POLICY_INVALID');
  const boundary = manifest.authority_boundaries;
  assert(boundary?.merge_reexecution === false && boundary?.provider_calls === 0
    && boundary?.postgres_rows_written === 0 && boundary?.credentials_issued === false
    && boundary?.contract_authority === false && boundary?.payment_authority === false
    && boundary?.public === 'HOLD' && boundary?.production === 'HOLD' && boundary?.g5 === 'HOLD',
  'RECOVERY_MANIFEST_BOUNDARY_INVALID');
  const effects = manifest.platform_effects;
  assert(typeof effects?.autonomous_effect === 'string' && effects.autonomous_effect.length > 20
    && typeof effects?.global_effect === 'string' && effects.global_effect.length > 20
    && typeof effects?.irreplaceable_value_effect === 'string' && effects.irreplaceable_value_effect.length > 20
    && typeof effects?.transparency_effect === 'string' && effects.transparency_effect.length > 20,
  'RECOVERY_MANIFEST_PLATFORM_EFFECTS_INVALID');
  return manifest;
}

export function parseApprovalBody(body) {
  const lines = String(body || '').trim().split(/\r?\n/);
  if (lines[0] !== APPROVAL_MARKER) return null;
  const keys = [
    'repository', 'source_issue', 'predecessor_pull_request', 'predecessor_atomic_run',
    'predecessor_merge_sha', 'historical_terminal_status_id', 'historical_authorization_status_id',
    'exact_current_main_sha', 'recovery_manifest_sha256', 'operation', 'recovery_context',
    'authorization_id', 'nonce', 'expires_at', 'scope', 'approval_rebind',
  ];
  assert(lines.length === keys.length + 1, 'RECOVERY_APPROVAL_SHAPE_INVALID');
  const fields = {};
  lines.slice(1).forEach((line, index) => {
    const match = /^([a-z0-9_]+)=(.+)$/.exec(line);
    assert(match && match[1] === keys[index] && !Object.hasOwn(fields, match[1]),
      'RECOVERY_APPROVAL_FIELD_INVALID');
    fields[match[1]] = match[2];
  });
  return fields;
}

export function selectApproval(comments, {
  manifest, repositoryOwner, currentMainSha, currentMainCommittedAt,
  manifestDigest, authorizationId, evaluationTime,
} = {}) {
  validateManifest(manifest);
  assert(Array.isArray(comments) && repositoryOwner && SHA40.test(currentMainSha || '')
    && SHA256.test(manifestDigest || ''), 'RECOVERY_APPROVAL_BINDING_INVALID');
  const marked = comments.map(comment => ({comment, fields: parseApprovalBody(comment?.body)}))
    .filter(value => value.fields)
    .sort((a, b) => exactTime(b.comment.created_at, 'RECOVERY_APPROVAL_TIME_INVALID')
      - exactTime(a.comment.created_at, 'RECOVERY_APPROVAL_TIME_INVALID')
      || Number(b.comment.id || 0) - Number(a.comment.id || 0));
  assert(marked.length > 0, 'RECOVERY_APPROVAL_MISSING');
  const {comment, fields} = marked[0];
  assert(comment?.user?.login === repositoryOwner && comment?.author_association === 'OWNER',
    'RECOVERY_APPROVAL_ACTOR_INVALID');
  assert(comment?.performed_via_github_app == null, 'RECOVERY_APPROVAL_APP_MEDIATED');
  assert(comment?.created_at === comment?.updated_at, 'RECOVERY_APPROVAL_EDITED');
  const pr = manifest.predecessor_pull_request;
  assert(fields.repository === manifest.repository, 'RECOVERY_APPROVAL_REPOSITORY_MISMATCH');
  assert(fields.source_issue === String(manifest.source_issue), 'RECOVERY_APPROVAL_ISSUE_MISMATCH');
  assert(fields.predecessor_pull_request === String(pr.number), 'RECOVERY_APPROVAL_PR_MISMATCH');
  assert(fields.predecessor_atomic_run === String(manifest.atomic_run.id), 'RECOVERY_APPROVAL_RUN_MISMATCH');
  assert(fields.predecessor_merge_sha === pr.merge_commit_sha, 'RECOVERY_APPROVAL_MERGE_MISMATCH');
  assert(fields.historical_terminal_status_id === String(manifest.historical_terminal_status.id),
    'RECOVERY_APPROVAL_TERMINAL_STATUS_MISMATCH');
  assert(fields.historical_authorization_status_id === String(manifest.historical_authorization_status.id),
    'RECOVERY_APPROVAL_AUTHORIZATION_STATUS_MISMATCH');
  assert(fields.exact_current_main_sha === currentMainSha, 'RECOVERY_APPROVAL_MAIN_MISMATCH');
  assert(fields.recovery_manifest_sha256 === manifestDigest, 'RECOVERY_APPROVAL_MANIFEST_MISMATCH');
  assert(fields.operation === APPROVAL_OPERATION && fields.recovery_context === RECOVERY_CONTEXT,
    'RECOVERY_APPROVAL_OPERATION_INVALID');
  assert(fields.authorization_id === authorizationId, 'RECOVERY_APPROVAL_ID_MISMATCH');
  assert(NONCE32.test(fields.nonce || ''), 'RECOVERY_APPROVAL_NONCE_INVALID');
  assert(fields.scope === APPROVAL_SCOPE && fields.approval_rebind === 'FORBIDDEN',
    'RECOVERY_APPROVAL_SCOPE_INVALID');
  const approvedAt = exactTime(comment.created_at, 'RECOVERY_APPROVAL_TIME_INVALID');
  const mainAt = exactTime(currentMainCommittedAt, 'RECOVERY_MAIN_TIME_INVALID');
  const expiresAt = exactTime(fields.expires_at, 'RECOVERY_APPROVAL_EXPIRY_INVALID');
  const evaluatedAt = exactTime(evaluationTime, 'RECOVERY_APPROVAL_EVALUATION_TIME_INVALID');
  assert(approvedAt >= mainAt, 'RECOVERY_APPROVAL_PRECEDES_CURRENT_MAIN');
  assert(expiresAt > approvedAt && expiresAt - approvedAt <= MAX_APPROVAL_LIFETIME_MS,
    'RECOVERY_APPROVAL_EXPIRY_WINDOW_INVALID');
  assert(evaluatedAt >= approvedAt && evaluatedAt <= expiresAt, 'RECOVERY_APPROVAL_EXPIRED');
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

export function buildRunName(currentMainSha, authorizationId) {
  assert(SHA40.test(currentMainSha || ''), 'RECOVERY_CURRENT_MAIN_INVALID');
  assert(authorizationId === `RECOVER-RUN-${INCIDENT_RUN_ID}-${currentMainSha.slice(0, 12)}`,
    'RECOVERY_AUTHORIZATION_ID_INVALID');
  return `KIDULTS Atomic Landing Recovery Run #${INCIDENT_RUN_ID} @ ${currentMainSha} / ${authorizationId}`;
}

export function evaluateRunSet(runs, {
  currentRunId, currentRunAttempt, currentWorkflowId, currentMainSha,
  repositoryOwner, approval, expectedRunName,
} = {}) {
  assert(Array.isArray(runs) && Number(currentRunAttempt) === 1, 'RECOVERY_RERUN_FORBIDDEN');
  const current = runs.filter(run => Number(run?.id) === Number(currentRunId));
  assert(current.length === 1, 'RECOVERY_CURRENT_RUN_CARDINALITY_INVALID');
  const run = current[0];
  assert(Number(run.workflow_id) === Number(currentWorkflowId) && run.event === 'workflow_dispatch'
    && run.head_branch === 'main' && run.head_sha === currentMainSha
    && run.display_title === expectedRunName && Number(run.run_attempt) === 1,
  'RECOVERY_CURRENT_RUN_TUPLE_INVALID');
  assert(run.actor?.login === repositoryOwner && run.triggering_actor?.login === repositoryOwner,
    'RECOVERY_DISPATCH_ACTOR_INVALID');
  const dispatchedAt = exactTime(run.created_at, 'RECOVERY_DISPATCH_TIME_INVALID');
  assert(dispatchedAt >= exactTime(approval.comment_created_at, 'RECOVERY_APPROVAL_TIME_INVALID')
    && dispatchedAt <= exactTime(approval.expires_at, 'RECOVERY_APPROVAL_EXPIRY_INVALID'),
  'RECOVERY_DISPATCH_OUTSIDE_APPROVAL_WINDOW');
  const prefix = `KIDULTS Atomic Landing Recovery Run #${INCIDENT_RUN_ID} @ `;
  const incident = runs.filter(value => Number(value?.workflow_id) === Number(currentWorkflowId)
    && value?.event === 'workflow_dispatch' && value?.head_branch === 'main'
    && String(value?.display_title || '').startsWith(prefix));
  assert(incident.length === 1 && Number(incident[0].id) === Number(currentRunId),
    'RECOVERY_PRIOR_INCIDENT_ATTEMPT_EXISTS');
  return {run_id: Number(currentRunId), run_attempt: 1, workflow_id: Number(currentWorkflowId),
    dispatch_actor: repositoryOwner, triggering_actor: repositoryOwner, incident_run_count: 1};
}

export function assertHistoricalStatuses(statusPayload, manifest) {
  const check = (expected, context, code) => {
    const entries = statusesFor(statusPayload, context);
    const exact = entries.find(value => Number(value.id) === Number(expected.id));
    assert(exact && exact.state === expected.state && exact.description === expected.description
      && exact.target_url === expected.target_url && exact.created_at === expected.created_at,
    `${code}_DRIFT`);
    assert(Number(entries[0]?.id) === Number(expected.id), `${code}_OVERWRITTEN`);
    return {id: expected.id, context, state: expected.state, immutable: true};
  };
  return {
    terminal: check(manifest.historical_terminal_status, TERMINAL_CONTEXT, 'RECOVERY_TERMINAL_STATUS'),
    authorization: check(manifest.historical_authorization_status, AUTHORIZATION_CONTEXT,
      'RECOVERY_AUTHORIZATION_STATUS'),
  };
}

export function assertRecoveryAbsent(statusPayload) {
  assert(statusesFor(statusPayload, RECOVERY_CONTEXT).length === 0, 'RECOVERY_STATUS_ALREADY_EXISTS');
}

function writeJsonSecure(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600, flag: 'wx'});
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

function githubClient(repository, token) {
  const headers = {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'kidults-atomic-landing-recovery-v1'};
  const api = async (route, options = {}) => {
    const response = await fetch(`https://api.github.com/repos/${repository}${route}`, {
      ...options, headers: {...headers, ...(options.headers || {})}, redirect: 'error',
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    assert(response.ok, `RECOVERY_GITHUB_API_${response.status}`, route);
    return payload;
  };
  const pages = async route => {
    const output = [];
    for (let page = 1; page <= 10; page += 1) {
      const separator = route.includes('?') ? '&' : '?';
      const values = await api(`${route}${separator}per_page=100&page=${page}`);
      assert(Array.isArray(values), 'RECOVERY_PAGINATION_INVALID', route);
      output.push(...values);
      if (values.length < 100) return output;
    }
    fail('RECOVERY_PAGINATION_LIMIT', route);
  };
  const workflowRuns = async workflowId => {
    const output = [];
    for (let page = 1; page <= 10; page += 1) {
      const payload = await api(`/actions/workflows/${workflowId}/runs?event=workflow_dispatch&branch=main&per_page=100&page=${page}`);
      assert(Array.isArray(payload?.workflow_runs), 'RECOVERY_RUNS_PAGINATION_INVALID');
      output.push(...payload.workflow_runs);
      if (payload.workflow_runs.length < 100) return output;
    }
    fail('RECOVERY_RUNS_PAGINATION_LIMIT');
  };
  return {api, pages, workflowRuns};
}

async function downloadReceipt(repository, token, expected) {
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/artifacts/${expected.id}/zip`, {
    headers: {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'}, redirect: 'follow',
  });
  assert(response.ok, `RECOVERY_ARTIFACT_DOWNLOAD_${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(sha256(bytes) === expected.digest, 'RECOVERY_ARTIFACT_ARCHIVE_DIGEST_MISMATCH');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-atomic-recovery-'));
  try {
    const zip = path.join(directory, 'artifact.zip');
    fs.writeFileSync(zip, bytes, {mode: 0o600, flag: 'wx'});
    const names = spawnSync('unzip', ['-Z1', zip], {encoding: 'utf8'});
    assert(names.status === 0, 'RECOVERY_ARTIFACT_LIST_INVALID');
    const receiptName = names.stdout.split(/\r?\n/).find(name => /receipt\.json$/.test(name));
    assert(receiptName, 'RECOVERY_ARTIFACT_RECEIPT_MISSING');
    const extracted = spawnSync('unzip', ['-p', zip, receiptName], {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
    assert(extracted.status === 0, 'RECOVERY_ARTIFACT_EXTRACTION_INVALID');
    try { return JSON.parse(extracted.stdout); } catch { fail('RECOVERY_ARTIFACT_RECEIPT_JSON_INVALID'); }
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

async function establishAuthority(manifestFile) {
  const token = process.env.GH_TOKEN;
  const repository = process.env.GH_REPOSITORY;
  const currentMainSha = process.env.EXPECTED_CURRENT_MAIN_SHA;
  const authorizationId = process.env.RECOVERY_AUTHORIZATION_ID;
  const runId = process.env.GITHUB_RUN_ID;
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
  assert(token && repository && SHA40.test(currentMainSha || '') && authorizationId
    && /^\d+$/.test(runId || '') && runAttempt === '1', 'RECOVERY_ENVIRONMENT_INVALID');
  const manifestBytes = fs.readFileSync(manifestFile);
  const manifest = validateManifest(JSON.parse(manifestBytes.toString('utf8')));
  assert(repository === manifest.repository, 'RECOVERY_REPOSITORY_MISMATCH');
  const client = githubClient(repository, token);
  const [repo, main, comments, currentRun] = await Promise.all([
    client.api(''), client.api('/branches/main'), client.pages(`/issues/${manifest.source_issue}/comments`),
    client.api(`/actions/runs/${runId}`),
  ]);
  assert(main?.commit?.sha === currentMainSha, 'RECOVERY_CURRENT_MAIN_DRIFT');
  const mainCommit = await client.api(`/commits/${currentMainSha}`);
  const owner = repo?.owner?.login;
  const manifestDigest = sha256(manifestBytes);
  const approval = selectApproval(comments, {manifest, repositoryOwner: owner, currentMainSha,
    currentMainCommittedAt: mainCommit?.commit?.committer?.date || mainCommit?.commit?.author?.date,
    manifestDigest, authorizationId, evaluationTime: new Date().toISOString()});
  const expectedRunName = buildRunName(currentMainSha, authorizationId);
  const oneUse = evaluateRunSet(await client.workflowRuns(currentRun.workflow_id), {
    currentRunId: runId, currentRunAttempt: runAttempt, currentWorkflowId: currentRun.workflow_id,
    currentMainSha, repositoryOwner: owner, approval, expectedRunName,
  });
  return {token, repository, currentMainSha, authorizationId, runId: Number(runId),
    manifest, manifestDigest, client, owner, approval, oneUse, currentRun};
}

function baseReceipt(authority, id, state) {
  const manifest = authority.manifest;
  return {id, version: '1.0.0', state, repository: manifest.repository,
    source_issue: manifest.source_issue, predecessor_pull_request: manifest.predecessor_pull_request.number,
    predecessor_atomic_run: manifest.atomic_run.id,
    predecessor_merge_sha: manifest.predecessor_pull_request.merge_commit_sha,
    exact_current_main_sha: authority.currentMainSha, recovery_manifest_sha256: authority.manifestDigest,
    recovery_workflow_run_id: authority.runId, recovery_workflow_run_attempt: 1,
    authorization_id_sha256: sha256(authority.authorizationId), historical_status_contexts_mutated: false,
    merge_reexecuted: false, landing_authorization_reused: false, provider_calls: 0,
    postgres_rows_written: 0, credentials_issued: false, contract_authority: false,
    payment_authority: false, public: 'HOLD', production: 'HOLD', g5: 'HOLD'};
}

async function reconcile(manifestFile, outputPath) {
  const authority = await establishAuthority(manifestFile);
  const {manifest, client, repository, token} = authority;
  const prExpected = manifest.predecessor_pull_request;
  const [pr, merge, originalRun, artifactPayload, headStatus, files, ...postRuns] = await Promise.all([
    client.api(`/pulls/${prExpected.number}`), client.api(`/git/commits/${prExpected.merge_commit_sha}`),
    client.api(`/actions/runs/${manifest.atomic_run.id}`),
    client.api(`/actions/runs/${manifest.atomic_run.id}/artifacts?per_page=100`),
    client.api(`/commits/${prExpected.exact_head_sha}/status`), client.pages(`/pulls/${prExpected.number}/files`),
    ...manifest.required_postmerge_runs.map(value => client.api(`/actions/runs/${value.id}`)),
  ]);
  assert(pr?.state === 'closed' && pr?.merged === true && pr?.merged_by?.login === prExpected.merged_by
    && pr?.head?.sha === prExpected.exact_head_sha && pr?.base?.sha === prExpected.exact_base_sha
    && pr?.merge_commit_sha === prExpected.merge_commit_sha && pr?.merged_at === prExpected.merged_at,
  'RECOVERY_PREDECESSOR_PR_DRIFT');
  assert(merge?.sha === prExpected.merge_commit_sha && merge?.tree?.sha === prExpected.exact_head_tree_sha
    && Array.isArray(merge?.parents) && merge.parents.length === 2
    && merge.parents[0]?.sha === prExpected.exact_base_sha && merge.parents[1]?.sha === prExpected.exact_head_sha,
  'RECOVERY_MERGE_BINDING_INVALID');
  assert(originalRun?.id === manifest.atomic_run.id && originalRun?.run_attempt === 1
    && originalRun?.workflow_id === manifest.atomic_run.workflow_id && originalRun?.event === 'workflow_dispatch'
    && originalRun?.head_sha === prExpected.exact_base_sha && originalRun?.conclusion === 'failure'
    && originalRun?.actor?.login === manifest.atomic_run.actor
    && originalRun?.triggering_actor?.login === manifest.atomic_run.actor,
  'RECOVERY_PREDECESSOR_RUN_DRIFT');
  assert(files.length === prExpected.changed_files
    && !files.some(value => /(^|\/)current-sold(?:\/|-)/i.test(value?.filename || '')),
  'RECOVERY_CHANGED_FILE_CLASSIFICATION_INVALID');
  postRuns.forEach((run, index) => {
    const expected = manifest.required_postmerge_runs[index];
    assert(run?.id === expected.id && run?.name === expected.name && run?.head_sha === expected.head_sha
      && run?.conclusion === expected.conclusion, 'RECOVERY_POSTMERGE_RUN_INVALID', expected.name);
  });
  const artifact = label => {
    const expected = manifest[label];
    const found = (artifactPayload?.artifacts || []).filter(value => value.id === expected.id);
    assert(found.length === 1 && found[0].name === expected.name
      && normalizeDigest(found[0].digest) === expected.digest && found[0].expired === false,
    `RECOVERY_${label.toUpperCase()}_BINDING_INVALID`);
    return found[0];
  };
  const intentArtifact = artifact('intent_artifact');
  const terminalArtifact = artifact('terminal_artifact');
  const [intentReceipt, terminalReceipt] = await Promise.all([
    downloadReceipt(repository, token, manifest.intent_artifact),
    downloadReceipt(repository, token, manifest.terminal_artifact),
  ]);
  assert(intentReceipt?.state === manifest.intent_artifact.receipt_state
    && intentReceipt?.terminal_class === manifest.intent_artifact.terminal_class
    && Number(intentReceipt?.landing_workflow_run_id) === INCIDENT_RUN_ID,
  'RECOVERY_INTENT_RECEIPT_INVALID');
  assert(terminalReceipt?.state === manifest.terminal_artifact.receipt_state
    && terminalReceipt?.terminal_class === manifest.terminal_artifact.terminal_class
    && Number(terminalReceipt?.landing_workflow_run_id) === INCIDENT_RUN_ID,
  'RECOVERY_TERMINAL_RECEIPT_INVALID');
  const historical = assertHistoricalStatuses(headStatus, manifest);
  assertRecoveryAbsent(headStatus);
  const receipt = {...baseReceipt(authority, 'kidults-atomic-landing-terminal-recovery-evidence-v1', 'VERIFIED_PASS'),
    completed_at: new Date().toISOString(), workflow_id: Number(authority.currentRun.workflow_id),
    approval: authority.approval, one_use_dispatch: authority.oneUse, historical_statuses: historical,
    recovery_status_before: {context: RECOVERY_CONTEXT, prior_status_count: 0},
    exact_merge: {sha: prExpected.merge_commit_sha, tree_sha: prExpected.exact_head_tree_sha,
      parents: [prExpected.exact_base_sha, prExpected.exact_head_sha], merged_by: prExpected.merged_by},
    changed_file_classification: {count: files.length, current_sold_changed: false},
    postmerge_runs: postRuns.map((run, index) => ({id: run.id,
      name: manifest.required_postmerge_runs[index].name, head_sha: run.head_sha, conclusion: run.conclusion})),
    incident_artifacts: {intent: {id: intentArtifact.id, digest: manifest.intent_artifact.digest,
      receipt_sha256: sha256(JSON.stringify(intentReceipt))}, terminal: {id: terminalArtifact.id,
      digest: manifest.terminal_artifact.digest, receipt_sha256: sha256(JSON.stringify(terminalReceipt))}},
    status_write_authority: false, status_write_performed: false};
  writeJsonSecure(outputPath, receipt);
  console.log(JSON.stringify(receipt));
}

export function assertEvidenceReceipt(receipt, authority, {artifactId, artifactName, artifactDigest, receiptDigest}) {
  assert(receipt?.id === 'kidults-atomic-landing-terminal-recovery-evidence-v1'
    && receipt?.version === '1.0.0' && receipt?.state === 'VERIFIED_PASS',
  'RECOVERY_EVIDENCE_STATE_INVALID');
  assert(receipt?.repository === authority.manifest.repository
    && receipt?.exact_current_main_sha === authority.currentMainSha
    && receipt?.recovery_manifest_sha256 === authority.manifestDigest
    && receipt?.recovery_workflow_run_id === authority.runId
    && receipt?.authorization_id_sha256 === sha256(authority.authorizationId),
  'RECOVERY_EVIDENCE_GENERATION_INVALID');
  assert(receipt?.approval?.comment_id === authority.approval.comment_id
    && receipt?.approval?.comment_body_digest === authority.approval.comment_body_digest
    && receipt?.one_use_dispatch?.incident_run_count === 1,
  'RECOVERY_EVIDENCE_AUTHORITY_INVALID');
  assert(receipt?.historical_statuses?.terminal?.id === authority.manifest.historical_terminal_status.id
    && receipt?.historical_statuses?.authorization?.id === authority.manifest.historical_authorization_status.id
    && receipt?.recovery_status_before?.prior_status_count === 0,
  'RECOVERY_EVIDENCE_STATUS_BOUNDARY_INVALID');
  assert(receipt?.exact_merge?.sha === authority.manifest.predecessor_pull_request.merge_commit_sha
    && receipt?.changed_file_classification?.count === 12
    && receipt?.changed_file_classification?.current_sold_changed === false
    && receipt?.postmerge_runs?.length === 2,
  'RECOVERY_EVIDENCE_PROOF_INVALID');
  assert(receipt?.status_write_authority === false && receipt?.status_write_performed === false
    && receipt?.historical_status_contexts_mutated === false && receipt?.merge_reexecuted === false
    && receipt?.landing_authorization_reused === false && receipt?.provider_calls === 0,
  'RECOVERY_EVIDENCE_BOUNDARY_INVALID');
  assert(Number.isInteger(Number(artifactId)) && artifactId > 0
    && artifactName === `kidults-atomic-landing-recovery-evidence-v1-${authority.runId}-1`
    && SHA256.test(normalizeDigest(artifactDigest)) && SHA256.test(normalizeDigest(receiptDigest)),
  'RECOVERY_EVIDENCE_ARTIFACT_INVALID');
  return receipt;
}

async function publish(manifestFile, evidenceFile, outputPath) {
  let authority = await establishAuthority(manifestFile);
  const evidenceBytes = fs.readFileSync(evidenceFile);
  const artifactId = Number(process.env.EVIDENCE_ARTIFACT_ID || 0);
  const artifactName = process.env.EVIDENCE_ARTIFACT_NAME || '';
  const artifactDigest = process.env.EVIDENCE_ARTIFACT_DIGEST || '';
  const receiptDigest = process.env.EVIDENCE_RECEIPT_SHA256 || '';
  assert(sha256(evidenceBytes) === normalizeDigest(receiptDigest), 'RECOVERY_EVIDENCE_BYTES_MISMATCH');
  const evidence = JSON.parse(evidenceBytes.toString('utf8'));
  assertEvidenceReceipt(evidence, authority, {artifactId, artifactName, artifactDigest,
    receiptDigest: normalizeDigest(receiptDigest)});
  const remoteArtifact = await authority.client.api(`/actions/artifacts/${artifactId}`);
  assert(remoteArtifact?.id === artifactId && remoteArtifact?.name === artifactName
    && normalizeDigest(remoteArtifact?.digest) === normalizeDigest(artifactDigest)
    && remoteArtifact?.expired === false && remoteArtifact?.workflow_run?.id === authority.runId
    && remoteArtifact?.workflow_run?.head_sha === authority.currentMainSha,
  'RECOVERY_EVIDENCE_REMOTE_ARTIFACT_INVALID');
  const initialStatus = await authority.client.api(`/commits/${authority.manifest.predecessor_pull_request.exact_head_sha}/status`);
  assertHistoricalStatuses(initialStatus, authority.manifest);
  assertRecoveryAbsent(initialStatus);
  const finalAuthority = await establishAuthority(manifestFile);
  assert(finalAuthority.currentMainSha === authority.currentMainSha
    && finalAuthority.manifestDigest === authority.manifestDigest
    && finalAuthority.approval.comment_id === authority.approval.comment_id
    && finalAuthority.approval.comment_body_digest === authority.approval.comment_body_digest,
  'RECOVERY_AUTHORITY_DRIFT_BEFORE_WRITE');
  authority = finalAuthority;
  const finalPreStatus = await authority.client.api(`/commits/${authority.manifest.predecessor_pull_request.exact_head_sha}/status`);
  const historicalBefore = assertHistoricalStatuses(finalPreStatus, authority.manifest);
  assertRecoveryAbsent(finalPreStatus);
  const targetUrl = `https://github.com/${authority.repository}/actions/runs/${authority.runId}`;
  const published = await authority.client.api(`/statuses/${authority.manifest.predecessor_pull_request.exact_head_sha}`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({state: 'success',
      context: RECOVERY_CONTEXT, description: 'Exact merge evidence recovered; historical RED preserved',
      target_url: targetUrl}),
  });
  const [readback, mainAfter] = await Promise.all([
    authority.client.api(`/commits/${authority.manifest.predecessor_pull_request.exact_head_sha}/status`),
    authority.client.api('/branches/main'),
  ]);
  const historicalAfter = assertHistoricalStatuses(readback, authority.manifest);
  const recovery = statusesFor(readback, RECOVERY_CONTEXT);
  assert(recovery.length === 1 && recovery[0].id === published.id && recovery[0].state === 'success'
    && recovery[0].description === 'Exact merge evidence recovered; historical RED preserved'
    && recovery[0].target_url === targetUrl, 'RECOVERY_STATUS_READBACK_INVALID');
  assert(mainAfter?.commit?.sha === authority.currentMainSha, 'RECOVERY_MAIN_DRIFT_AFTER_WRITE');
  const receipt = {...baseReceipt(authority, 'kidults-atomic-landing-terminal-recovery-publication-v1', 'VERIFIED_PASS'),
    completed_at: new Date().toISOString(), approval: authority.approval, one_use_dispatch: authority.oneUse,
    sealed_evidence: {artifact_id: artifactId, artifact_name: artifactName,
      artifact_digest: normalizeDigest(artifactDigest), receipt_sha256: normalizeDigest(receiptDigest)},
    historical_statuses_before: historicalBefore, historical_statuses_after: historicalAfter,
    recovery_status: {id: published.id, context: RECOVERY_CONTEXT, state: 'success', target_url: targetUrl},
    status_write_authority: true, status_write_performed: true,
    remote_mutation_scope: 'ONE_DISTINCT_RECOVERY_STATUS_ONLY'};
  writeJsonSecure(outputPath, receipt);
  console.log(JSON.stringify(receipt));
}

async function main() {
  const [mode, manifestFile, evidenceFile] = process.argv.slice(2);
  const outputPath = process.env.ATOMIC_LANDING_RECOVERY_RECEIPT_PATH
    || (mode === '--publish' ? 'out/atomic-landing-recovery/publication-receipt.json'
      : 'out/atomic-landing-recovery/evidence-receipt.json');
  try {
    if (mode === '--reconcile' && manifestFile) await reconcile(manifestFile, outputPath);
    else if (mode === '--publish' && manifestFile && evidenceFile) await publish(manifestFile, evidenceFile, outputPath);
    else fail('RECOVERY_ARGUMENTS_INVALID');
  } catch (error) {
    const code = String(error?.code || error?.message || 'RECOVERY_FAILED').split(':')[0].slice(0, 120);
    try { writeJsonSecure(outputPath, {id: 'kidults-atomic-landing-terminal-recovery-failure-v1',
      version: '1.0.0', state: 'VERIFIED_FAIL', failure_code: code, failed_at: new Date().toISOString(),
      historical_status_contexts_mutated: false, status_write_performed: false,
      merge_reexecuted: false, provider_calls: 0, public: 'HOLD', production: 'HOLD', g5: 'HOLD'}); } catch {}
    console.error(code);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
