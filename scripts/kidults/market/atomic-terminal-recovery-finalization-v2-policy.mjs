import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SHA40 = /^[0-9a-f]{40}$/;
export const SHA256 = /^sha256:[0-9a-f]{64}$/;
export const NONCE32 = /^[0-9a-f]{32}$/;
export const MAX_APPROVAL_LIFETIME_MS = 60 * 60 * 1000;
export const MAX_PAGES = 10;
export const APPROVAL_MARKER =
  'KIDULTS_ATOMIC_TERMINAL_RECOVERY_FINALIZATION_EXACT_APPROVAL_V2';
export const APPROVAL_OPERATION =
  'PUBLISH_DISTINCT_ATOMIC_TERMINAL_RECOVERY_SUCCESS_V2';
export const APPROVAL_SCOPE = 'ONE_BOUNDED_FINALIZATION_V2_ONLY';
export const AUTHORIZATION_PREFIX = 'FINALIZE-RUN-33603816578-';
export const HISTORICAL_CONTEXT = 'KIDULTS Atomic Landing Terminal V2';
export const RECOVERY_CONTEXT = 'KIDULTS Atomic Landing Recovery V1';
export const EXPECTED_BRANCH = 'main';
export const EXPECTED_EVENT = 'workflow_dispatch';
export const EXPECTED_MANIFEST_ID =
  'kidults-atomic-terminal-recovery-finalization-manifest-v2';
export const EXPECTED_WORKFLOW_PATH =
  '.github/workflows/kidults-current-sold-atomic-terminal-recovery-finalization-v2.yml';
export const EVIDENCE_ARTIFACT_PREFIX =
  'kidults-atomic-terminal-recovery-finalization-evidence-v2';
export const PUBLICATION_ARTIFACT_PREFIX =
  'kidults-atomic-terminal-recovery-finalization-publication-v2';

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

export function readJson(file, code = 'ATOMIC_FINALIZATION_V2_JSON_INVALID') {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fail(code, file);
  }
}

export function sortedLatest(items) {
  return [...items].sort((a, b) =>
    exactTime(b?.created_at || b?.updated_at,
      'ATOMIC_FINALIZATION_V2_RECORD_TIME_INVALID')
    - exactTime(a?.created_at || a?.updated_at,
      'ATOMIC_FINALIZATION_V2_RECORD_TIME_INVALID')
    || Number(b?.id || 0) - Number(a?.id || 0));
}

export function statusesFor(payload, context) {
  return sortedLatest((Array.isArray(payload?.statuses) ? payload.statuses : [])
    .filter(item => item?.context === context));
}

export function latestStatus(payload, context) {
  return statusesFor(payload, context)[0] || null;
}

function exactObject(value, code) {
  assert(value != null && typeof value === 'object' && !Array.isArray(value), code);
  return value;
}

function exactArtifactShape(artifact, expected, code) {
  exactObject(artifact, `${code}_SHAPE_INVALID`);
  assert(Number(artifact.id) === Number(expected.id)
    && artifact.name === expected.name
    && normalizeSha256(artifact.digest) === normalizeSha256(expected.digest),
  `${code}_BINDING_INVALID`);
  return artifact;
}

export function validateManifest(manifest) {
  assert(manifest?.id === EXPECTED_MANIFEST_ID
    && manifest?.version === '2.0.0'
    && manifest?.state === 'PENDING_APPEND_ONLY_RECOVERY_SUCCESS',
  'ATOMIC_FINALIZATION_V2_MANIFEST_IDENTITY_INVALID');
  assert(manifest?.repository === 'johnkim9524-collab/kaios_enterprise_repo',
    'ATOMIC_FINALIZATION_V2_REPOSITORY_INVALID');
  assert(JSON.stringify(manifest?.source_issues)
    === JSON.stringify([1864, 1868, 1882, 1897, 1905])
    && manifest?.approval_issue === 1868
    && manifest?.correction_issue === 1905,
  'ATOMIC_FINALIZATION_V2_SOURCE_ISSUES_INVALID');
  assert(manifest?.cause ===
    'FINALIZATION_WORKFLOW_RUN_NAME_AUTHORITY_TUPLE_MISMATCH',
  'ATOMIC_FINALIZATION_V2_CAUSE_INVALID');

  const pr = exactObject(manifest?.predecessor_pull_request,
    'ATOMIC_FINALIZATION_V2_PREDECESSOR_PR_MISSING');
  assert(pr.number === 1865
    && pr.exact_base_sha === '212cd64e581b202c38a2e32534737c4a1af2299c'
    && pr.exact_head_sha === 'cda8375478fbce301ad538e90354fb4288ac7d14'
    && pr.merge_commit_sha === 'b09e0e8d679fa0e41bf64c3f674f8c806af2b1f6'
    && pr.merge_tree_sha === '1143b71fb4e834b0c1c992df7b9b3555b9d72c62'
    && [pr.exact_base_sha, pr.exact_head_sha, pr.merge_commit_sha,
      pr.merge_tree_sha].every(value => SHA40.test(value)),
  'ATOMIC_FINALIZATION_V2_PREDECESSOR_PR_INVALID');

  const atomic = exactObject(manifest?.predecessor_atomic_run,
    'ATOMIC_FINALIZATION_V2_PREDECESSOR_RUN_MISSING');
  assert(atomic.id === 33603816578
    && atomic.attempt === 1
    && atomic.workflow_id === 345463226
    && atomic.display_title ===
      'KIDULTS Atomic Landing PR #1865 @ cda8375478fbce301ad538e90354fb4288ac7d14 / LAND-PR-1865-cda8375478fb'
    && atomic.expected_conclusion === 'failure'
    && atomic.authorization_id_sha256 ===
      'sha256:8c206e16bdf34c67ba57127b55e1a5513b44a7b32f7ff17d0a3f92d96057b5f2',
  'ATOMIC_FINALIZATION_V2_PREDECESSOR_RUN_INVALID');

  const historical = exactObject(manifest?.historical_terminal_status,
    'ATOMIC_FINALIZATION_V2_HISTORICAL_STATUS_MISSING');
  assert(historical.id === 53361838386
    && historical.context === HISTORICAL_CONTEXT
    && historical.state === 'failure'
    && historical.description === 'ATOMIC_TERMINAL_CURRENT_SOLD_OUTPUT_INVALID'
    && historical.target_url ===
      'https://github.com/johnkim9524-collab/kaios_enterprise_repo/actions/runs/33603816578'
    && historical.created_at === '2026-09-02T07:29:57Z',
  'ATOMIC_FINALIZATION_V2_HISTORICAL_STATUS_INVALID');

  const priorStatus = exactObject(manifest?.prior_recovery_failure_status,
    'ATOMIC_FINALIZATION_V2_PRIOR_RECOVERY_STATUS_MISSING');
  assert(priorStatus.id === 53372834946
    && priorStatus.context === RECOVERY_CONTEXT
    && priorStatus.state === 'failure'
    && priorStatus.description ===
      'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_PREDECESSOR_MISMATCH'
    && priorStatus.target_url ===
      'https://github.com/johnkim9524-collab/kaios_enterprise_repo/actions/runs/33621062695'
    && priorStatus.created_at === '2026-09-02T10:45:29Z',
  'ATOMIC_FINALIZATION_V2_PRIOR_RECOVERY_STATUS_INVALID');

  const remediation = exactObject(manifest?.prior_failed_remediation,
    'ATOMIC_FINALIZATION_V2_REMEDIATION_MISSING');
  assert(remediation.run_id === 33621062695
    && remediation.run_attempt === 1
    && remediation.workflow_id === 348289049
    && remediation.workflow_path ===
      '.github/workflows/kidults-current-sold-atomic-terminal-recovery-remediation-v1.yml'
    && remediation.head_sha === '23c98e1b04f4105cd3f3f0be5fc42c2e6302deef'
    && remediation.display_title ===
      'KIDULTS Atomic Terminal Recovery Run #33603816578 @ 23c98e1b04f4105cd3f3f0be5fc42c2e6302deef / RECOVER-RUN-33603816578-23c98e1b04f4'
    && remediation.conclusion === 'failure'
    && remediation.authorization_id === 'RECOVER-RUN-33603816578-23c98e1b04f4'
    && remediation.authorization_id_sha256 ===
      'sha256:eca7cfe33084fd2a655ba8ccefe439c43369a7e3c840da85afbb3ae3d2629e68'
    && remediation.approval_comment_id === 5508325466
    && remediation.approval_comment_body_digest ===
      'sha256:6b4f402784b627302c13a5a678aa9d95d39b64cca02e75ba748218872a4c19f9',
  'ATOMIC_FINALIZATION_V2_REMEDIATION_INVALID');
  exactArtifactShape(remediation.evidence_artifact, {
    id: 9842911193,
    name: 'kidults-atomic-terminal-recovery-remediation-evidence-v1-33621062695-1',
    digest: 'sha256:bc7e1648fcaa07f9307899345fbfe86ab11904d811e1a65e00787d1f86dfd732',
  }, 'ATOMIC_FINALIZATION_V2_REMEDIATION_EVIDENCE_ARTIFACT');
  assert(remediation.evidence_artifact.entry === 'evidence-receipt.json'
    && remediation.evidence_artifact.receipt_sha256 ===
      'sha256:4c4c5a658fc50186e222a8692e47b25832702426e6b0bf13680b31922deb77e5',
  'ATOMIC_FINALIZATION_V2_REMEDIATION_EVIDENCE_ENTRY_INVALID');
  exactArtifactShape(remediation.publication_artifact, {
    id: 9842919682,
    name: 'kidults-atomic-terminal-recovery-remediation-publication-v1-33621062695-1',
    digest: 'sha256:c5451c4390cdb4c45198b137dbae83a3be1fe8466e30fd7153613baf2820fcc1',
  }, 'ATOMIC_FINALIZATION_V2_REMEDIATION_PUBLICATION_ARTIFACT');
  assert(remediation.publication_artifact.entry === 'publication-receipt.json'
    && remediation.publication_artifact.receipt_sha256 ===
      'sha256:5821656c57ddb6d84daacf45da6d9c1018f3a21dc78278a17c06d185b2cdb08e',
  'ATOMIC_FINALIZATION_V2_REMEDIATION_PUBLICATION_ENTRY_INVALID');

  const finalization = exactObject(manifest?.prior_failed_finalization,
    'ATOMIC_FINALIZATION_V2_PRIOR_FINALIZATION_MISSING');
  assert(finalization.run_id === 33652944964
    && finalization.run_attempt === 1
    && finalization.workflow_id === 348374437
    && finalization.workflow_path ===
      '.github/workflows/kidults-current-sold-atomic-terminal-recovery-finalization-v1.yml'
    && finalization.head_sha === 'e8e957f97cc46f711e90040ad68827362d880990'
    && finalization.display_title ===
      'KIDULTS Atomic Terminal Recovery Finalization Run #33603816578 @ e8e957f97cc46f711e90040ad68827362d880990 / RECOVER-RUN-33603816578-e8e957f97cc4'
    && finalization.created_at === '2026-09-02T16:07:28Z'
    && finalization.conclusion === 'failure'
    && finalization.failure_code === 'ATOMIC_RECOVERY_CURRENT_RUN_TUPLE_MISMATCH'
    && finalization.authorization_id ===
      'RECOVER-RUN-33603816578-e8e957f97cc4'
    && finalization.authorization_id_sha256 ===
      'sha256:4801d715b7fca83282cc4194206f75226cc6ca4b792a3257edecd3b6f373c19c',
  'ATOMIC_FINALIZATION_V2_PRIOR_FINALIZATION_INVALID');
  exactArtifactShape(finalization.evidence_artifact, {
    id: 9855507420,
    name: 'kidults-atomic-terminal-recovery-finalization-evidence-v1-33652944964-1',
    digest: 'sha256:e95548653694daba789569a42766dc2403cba72a9bffdf4526240a85df6db0f2',
  }, 'ATOMIC_FINALIZATION_V2_PRIOR_FINALIZATION_ARTIFACT');
  assert(finalization.evidence_artifact.preflight_entry === 'preflight-receipt.json'
    && finalization.evidence_artifact.preflight_receipt_sha256 ===
      'sha256:1f6df8776b8cc0c3c2ccd18dfb62799231fb14e65071c8ce344dccc361f1ff31'
    && finalization.evidence_artifact.terminal_entry === 'terminal-receipt.json'
    && finalization.evidence_artifact.terminal_receipt_sha256 ===
      'sha256:c6aa33189ce198da4d9816963edfcab03aac05f46f2ccab1132dc36b7bf4b65b',
  'ATOMIC_FINALIZATION_V2_PRIOR_FINALIZATION_ENTRY_INVALID');

  assert(manifest?.recovery_context === RECOVERY_CONTEXT
    && manifest?.authorized_workflow_path === EXPECTED_WORKFLOW_PATH
    && manifest?.evidence_artifact_name_prefix === EVIDENCE_ARTIFACT_PREFIX
    && manifest?.publication_artifact_name_prefix === PUBLICATION_ARTIFACT_PREFIX,
  'ATOMIC_FINALIZATION_V2_EXECUTION_IDENTITY_INVALID');

  const approval = exactObject(manifest?.approval_policy,
    'ATOMIC_FINALIZATION_V2_APPROVAL_POLICY_MISSING');
  assert(approval.marker === APPROVAL_MARKER
    && approval.operation === APPROVAL_OPERATION
    && approval.scope === APPROVAL_SCOPE
    && approval.authorization_prefix === AUTHORIZATION_PREFIX
    && approval.max_lifetime_seconds === 3600
    && approval.first_dispatch_only === true
    && approval.rerun_forbidden === true
    && approval.prior_generation_replay_forbidden === true
    && approval.approval_rebind_forbidden === true
    && approval.historical_terminal_context_immutable === true
    && approval.prior_recovery_failure_status_immutable === true,
  'ATOMIC_FINALIZATION_V2_APPROVAL_POLICY_INVALID');

  const invariants = exactObject(manifest?.invariants,
    'ATOMIC_FINALIZATION_V2_INVARIANTS_MISSING');
  assert(invariants.prior_remediation_run_rerun_forbidden === true
    && invariants.prior_finalization_run_rerun_forbidden === true
    && invariants.historical_terminal_status_write_forbidden === true
    && invariants.prior_recovery_failure_status_write_forbidden === true
    && invariants.merge_reexecution_forbidden === true
    && invariants.provider_calls === 0
    && invariants.postgres_rows_written === 0
    && invariants.deployment === false
    && invariants.empirical_authority_created === false,
  'ATOMIC_FINALIZATION_V2_INVARIANTS_INVALID');
  assert(manifest?.public === 'HOLD'
    && manifest?.production === 'HOLD'
    && manifest?.g5 === 'HOLD',
  'ATOMIC_FINALIZATION_V2_HOLD_INVALID');
  return manifest;
}

export function buildFinalizationRunName({predecessorRunId, currentMainSha,
  authorizationId} = {}) {
  assert(Number(predecessorRunId) === 33603816578,
    'ATOMIC_FINALIZATION_V2_PREDECESSOR_RUN_ID_INVALID');
  assert(SHA40.test(currentMainSha || ''),
    'ATOMIC_FINALIZATION_V2_CURRENT_MAIN_INVALID');
  const expectedAuthorization = `${AUTHORIZATION_PREFIX}${currentMainSha.slice(0, 12)}`;
  assert(authorizationId === expectedAuthorization,
    'ATOMIC_FINALIZATION_V2_AUTHORIZATION_ID_INVALID');
  return `KIDULTS Atomic Terminal Recovery Finalization V2 Run #${predecessorRunId} @ ${currentMainSha} / ${authorizationId}`;
}

export function expectedEvidenceArtifactName(runId, runAttempt = 1) {
  assert(Number.isInteger(Number(runId)) && Number(runId) > 0
    && Number(runAttempt) === 1,
  'ATOMIC_FINALIZATION_V2_ARTIFACT_RUN_ID_INVALID');
  return `${EVIDENCE_ARTIFACT_PREFIX}-${Number(runId)}-1`;
}

export function expectedPublicationArtifactName(runId, runAttempt = 1) {
  assert(Number.isInteger(Number(runId)) && Number(runId) > 0
    && Number(runAttempt) === 1,
  'ATOMIC_FINALIZATION_V2_ARTIFACT_RUN_ID_INVALID');
  return `${PUBLICATION_ARTIFACT_PREFIX}-${Number(runId)}-1`;
}

export function parseApprovalBody(body) {
  const lines = String(body || '').trim().split(/\r?\n/);
  if (lines[0] !== APPROVAL_MARKER) return null;
  const expectedKeys = [
    'repository',
    'source_issue',
    'correction_issue',
    'predecessor_pull_request',
    'predecessor_atomic_run',
    'prior_recovery_failure_status_id',
    'prior_failed_finalization_run',
    'exact_current_main_sha',
    'finalization_manifest_sha256',
    'operation',
    'finalization_context',
    'authorization_id',
    'nonce',
    'expires_at',
    'scope',
    'approval_rebind',
  ];
  assert(lines.length === expectedKeys.length + 1,
    'ATOMIC_FINALIZATION_V2_APPROVAL_SHAPE_INVALID');
  const values = {};
  for (const [index, line] of lines.slice(1).entries()) {
    const match = /^([a-z0-9_]+)=(.+)$/.exec(line);
    assert(match && match[1] === expectedKeys[index],
      'ATOMIC_FINALIZATION_V2_APPROVAL_FIELD_ORDER_INVALID');
    assert(!Object.hasOwn(values, match[1]),
      'ATOMIC_FINALIZATION_V2_APPROVAL_FIELD_DUPLICATE');
    values[match[1]] = match[2];
  }
  return values;
}

export function selectApproval(comments, {manifest, repositoryOwner,
  currentMainSha, currentMainCommittedAt, manifestDigest, authorizationId,
  evaluationTime} = {}) {
  assert(Array.isArray(comments),
    'ATOMIC_FINALIZATION_V2_APPROVAL_COMMENT_SET_INVALID');
  validateManifest(manifest);
  assert(repositoryOwner && SHA40.test(currentMainSha || '')
    && SHA256.test(manifestDigest || ''),
  'ATOMIC_FINALIZATION_V2_APPROVAL_BINDING_INVALID');
  const marked = comments
    .map(comment => ({comment, fields: parseApprovalBody(comment?.body)}))
    .filter(item => item.fields)
    .sort((a, b) => exactTime(b.comment?.created_at,
      'ATOMIC_FINALIZATION_V2_APPROVAL_TIME_INVALID')
      - exactTime(a.comment?.created_at,
        'ATOMIC_FINALIZATION_V2_APPROVAL_TIME_INVALID')
      || Number(b.comment?.id || 0) - Number(a.comment?.id || 0));
  assert(marked.length > 0, 'ATOMIC_FINALIZATION_V2_APPROVAL_MISSING');
  const {comment, fields} = marked[0];
  assert(comment?.user?.login === repositoryOwner
    && comment?.author_association === 'OWNER',
  'ATOMIC_FINALIZATION_V2_APPROVAL_ACTOR_INVALID');
  assert(comment?.performed_via_github_app == null,
    'ATOMIC_FINALIZATION_V2_APPROVAL_APP_MEDIATED');
  assert(comment?.created_at === comment?.updated_at,
    'ATOMIC_FINALIZATION_V2_APPROVAL_EDITED');
  assert(fields.repository === manifest.repository,
    'ATOMIC_FINALIZATION_V2_APPROVAL_REPOSITORY_MISMATCH');
  assert(fields.source_issue === String(manifest.approval_issue)
    && fields.correction_issue === String(manifest.correction_issue),
  'ATOMIC_FINALIZATION_V2_APPROVAL_ISSUE_MISMATCH');
  assert(fields.predecessor_pull_request ===
    String(manifest.predecessor_pull_request.number)
    && fields.predecessor_atomic_run ===
      String(manifest.predecessor_atomic_run.id),
  'ATOMIC_FINALIZATION_V2_APPROVAL_PREDECESSOR_MISMATCH');
  assert(fields.prior_recovery_failure_status_id ===
    String(manifest.prior_recovery_failure_status.id)
    && fields.prior_failed_finalization_run ===
      String(manifest.prior_failed_finalization.run_id),
  'ATOMIC_FINALIZATION_V2_APPROVAL_LINEAGE_MISMATCH');
  assert(fields.exact_current_main_sha === currentMainSha,
    'ATOMIC_FINALIZATION_V2_APPROVAL_MAIN_MISMATCH');
  assert(fields.finalization_manifest_sha256 === manifestDigest,
    'ATOMIC_FINALIZATION_V2_APPROVAL_MANIFEST_MISMATCH');
  assert(fields.operation === APPROVAL_OPERATION
    && fields.finalization_context === RECOVERY_CONTEXT
    && fields.authorization_id === authorizationId
    && fields.scope === APPROVAL_SCOPE
    && fields.approval_rebind === 'FORBIDDEN',
  'ATOMIC_FINALIZATION_V2_APPROVAL_OPERATION_INVALID');
  assert(NONCE32.test(fields.nonce || ''),
    'ATOMIC_FINALIZATION_V2_APPROVAL_NONCE_INVALID');
  const approvedAt = exactTime(comment.created_at,
    'ATOMIC_FINALIZATION_V2_APPROVAL_TIME_INVALID');
  const mainAt = exactTime(currentMainCommittedAt,
    'ATOMIC_FINALIZATION_V2_MAIN_COMMIT_TIME_INVALID');
  const expiresAt = exactTime(fields.expires_at,
    'ATOMIC_FINALIZATION_V2_APPROVAL_EXPIRY_INVALID');
  const evaluatedAt = exactTime(evaluationTime,
    'ATOMIC_FINALIZATION_V2_APPROVAL_EVALUATION_TIME_INVALID');
  assert(approvedAt >= mainAt,
    'ATOMIC_FINALIZATION_V2_APPROVAL_PRECEDES_CURRENT_MAIN');
  assert(expiresAt > approvedAt
    && expiresAt - approvedAt <= MAX_APPROVAL_LIFETIME_MS,
  'ATOMIC_FINALIZATION_V2_APPROVAL_EXPIRY_WINDOW_INVALID');
  assert(evaluatedAt >= approvedAt && evaluatedAt <= expiresAt,
    'ATOMIC_FINALIZATION_V2_APPROVAL_NOT_CURRENT');
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

export function evaluateRunSet(runs, {currentRunId, currentRunAttempt,
  workflowId, workflowPath, predecessorRunId, expectedRunName,
  currentMainSha, repositoryOwner, approval} = {}) {
  assert(Array.isArray(runs), 'ATOMIC_FINALIZATION_V2_RUN_SET_INVALID');
  assert(Number(currentRunAttempt) === 1,
    'ATOMIC_FINALIZATION_V2_RERUN_FORBIDDEN');
  const currentMatches = runs.filter(run => Number(run?.id) === Number(currentRunId));
  assert(currentMatches.length === 1,
    'ATOMIC_FINALIZATION_V2_CURRENT_RUN_CARDINALITY_INVALID');
  const current = currentMatches[0];
  assert(Number(current?.workflow_id) === Number(workflowId)
    && current?.path === workflowPath,
  'ATOMIC_FINALIZATION_V2_WORKFLOW_IDENTITY_MISMATCH');
  assert(current?.event === EXPECTED_EVENT
    && current?.head_branch === EXPECTED_BRANCH
    && current?.head_sha === currentMainSha
    && current?.display_title === expectedRunName
    && Number(current?.run_attempt) === 1,
  'ATOMIC_FINALIZATION_V2_CURRENT_RUN_TUPLE_MISMATCH');
  assert(current?.actor?.login === repositoryOwner
    && current?.triggering_actor?.login === repositoryOwner,
  'ATOMIC_FINALIZATION_V2_DISPATCH_ACTOR_NOT_OWNER');
  const createdAt = exactTime(current?.created_at,
    'ATOMIC_FINALIZATION_V2_DISPATCH_TIME_INVALID');
  assert(createdAt >= exactTime(approval?.comment_created_at,
    'ATOMIC_FINALIZATION_V2_APPROVAL_TIME_INVALID')
    && createdAt <= exactTime(approval?.expires_at,
      'ATOMIC_FINALIZATION_V2_APPROVAL_EXPIRY_INVALID'),
  'ATOMIC_FINALIZATION_V2_DISPATCH_OUTSIDE_APPROVAL_WINDOW');
  const exactMatches = runs.filter(run =>
    Number(run?.workflow_id) === Number(workflowId)
    && run?.event === EXPECTED_EVENT
    && run?.head_branch === EXPECTED_BRANCH
    && run?.display_title === expectedRunName);
  assert(exactMatches.length === 1
    && Number(exactMatches[0]?.id) === Number(currentRunId),
  'ATOMIC_FINALIZATION_V2_DUPLICATE_DISPATCH');
  const incidentPrefix =
    `KIDULTS Atomic Terminal Recovery Finalization V2 Run #${predecessorRunId} @ `;
  const incidentRuns = runs.filter(run =>
    Number(run?.workflow_id) === Number(workflowId)
    && run?.event === EXPECTED_EVENT
    && run?.head_branch === EXPECTED_BRANCH
    && String(run?.display_title || '').startsWith(incidentPrefix));
  assert(incidentRuns.length === 1
    && Number(incidentRuns[0]?.id) === Number(currentRunId),
  'ATOMIC_FINALIZATION_V2_PRIOR_INCIDENT_ATTEMPT_EXISTS');
  return {
    run_id: Number(currentRunId),
    run_attempt: 1,
    workflow_id: Number(workflowId),
    workflow_path: workflowPath,
    matching_run_count: 1,
    incident_run_count: 1,
    dispatch_actor: repositoryOwner,
    triggering_actor: repositoryOwner,
    run_name_sha256: sha256(expectedRunName),
  };
}

export function exactArtifact(artifacts, expected, code) {
  const values = Array.isArray(artifacts) ? artifacts : [];
  const matches = values.filter(item => Number(item?.id) === Number(expected.id));
  assert(matches.length === 1, `${code}_CARDINALITY_INVALID`, String(matches.length));
  const artifact = matches[0];
  assert(artifact?.name === expected.name
    && normalizeSha256(artifact?.digest) === normalizeSha256(expected.digest)
    && artifact?.expired === false,
  `${code}_BINDING_INVALID`);
  return artifact;
}

export function validatePriorRemediationRun(run, jobs, artifacts,
  repositoryOwner, manifest) {
  validateManifest(manifest);
  const expected = manifest.prior_failed_remediation;
  assert(Number(run?.id) === expected.run_id
    && Number(run?.run_attempt) === expected.run_attempt
    && Number(run?.workflow_id) === expected.workflow_id
    && run?.path === expected.workflow_path
    && run?.head_branch === 'main'
    && run?.head_sha === expected.head_sha
    && run?.event === 'workflow_dispatch'
    && run?.status === 'completed'
    && run?.conclusion === expected.conclusion
    && run?.display_title === expected.display_title,
  'ATOMIC_FINALIZATION_V2_PRIOR_REMEDIATION_RUN_INVALID');
  assert(run?.actor?.login === repositoryOwner
    && run?.triggering_actor?.login === repositoryOwner,
  'ATOMIC_FINALIZATION_V2_PRIOR_REMEDIATION_ACTOR_INVALID');
  const values = Array.isArray(jobs?.jobs) ? jobs.jobs : [];
  const reconciliation = values.filter(job =>
    job?.name === 'Reconcile predecessor evidence without status-write authority');
  const publication = values.filter(job =>
    job?.name === 'Publish distinct recovery status from sealed evidence');
  assert(reconciliation.length === 1
    && reconciliation[0]?.conclusion === 'success',
  'ATOMIC_FINALIZATION_V2_PRIOR_REMEDIATION_RECONCILIATION_INVALID');
  assert(publication.length === 1 && publication[0]?.conclusion === 'failure',
    'ATOMIC_FINALIZATION_V2_PRIOR_REMEDIATION_PUBLICATION_INVALID');
  assert(Array.isArray(artifacts) && artifacts.length === 2,
    'ATOMIC_FINALIZATION_V2_PRIOR_REMEDIATION_ARTIFACT_SET_INVALID');
  exactArtifact(artifacts, expected.evidence_artifact,
    'ATOMIC_FINALIZATION_V2_PRIOR_REMEDIATION_EVIDENCE');
  exactArtifact(artifacts, expected.publication_artifact,
    'ATOMIC_FINALIZATION_V2_PRIOR_REMEDIATION_PUBLICATION');
  return expected;
}

export function validatePriorFinalizationRun(run, jobs, artifacts,
  repositoryOwner, manifest) {
  validateManifest(manifest);
  const expected = manifest.prior_failed_finalization;
  assert(Number(run?.id) === expected.run_id
    && Number(run?.run_attempt) === expected.run_attempt
    && Number(run?.workflow_id) === expected.workflow_id
    && run?.path === expected.workflow_path
    && run?.head_branch === 'main'
    && run?.head_sha === expected.head_sha
    && run?.event === 'workflow_dispatch'
    && run?.status === 'completed'
    && run?.conclusion === expected.conclusion
    && run?.display_title === expected.display_title
    && run?.created_at === expected.created_at,
  'ATOMIC_FINALIZATION_V2_PRIOR_FINALIZATION_RUN_INVALID');
  assert(run?.actor?.login === repositoryOwner
    && run?.triggering_actor?.login === repositoryOwner,
  'ATOMIC_FINALIZATION_V2_PRIOR_FINALIZATION_ACTOR_INVALID');
  const values = Array.isArray(jobs?.jobs) ? jobs.jobs : [];
  const validation = values.filter(job =>
    job?.name === 'Validate failed recovery finalization contract');
  const evidence = values.filter(job =>
    job?.name === 'Finalize failed recovery evidence without status-write authority');
  const publication = values.filter(job =>
    job?.name === 'Publish final recovery success from sealed lineage');
  assert(validation.length === 1 && validation[0]?.conclusion === 'skipped',
    'ATOMIC_FINALIZATION_V2_PRIOR_FINALIZATION_VALIDATION_JOB_INVALID');
  assert(evidence.length === 1 && evidence[0]?.conclusion === 'failure',
    'ATOMIC_FINALIZATION_V2_PRIOR_FINALIZATION_EVIDENCE_JOB_INVALID');
  assert(publication.length === 1 && publication[0]?.conclusion === 'skipped',
    'ATOMIC_FINALIZATION_V2_PRIOR_FINALIZATION_PUBLICATION_JOB_INVALID');
  assert(Array.isArray(artifacts) && artifacts.length === 1,
    'ATOMIC_FINALIZATION_V2_PRIOR_FINALIZATION_ARTIFACT_SET_INVALID');
  exactArtifact(artifacts, expected.evidence_artifact,
    'ATOMIC_FINALIZATION_V2_PRIOR_FINALIZATION_EVIDENCE');
  return expected;
}

export function validatePriorRemediationEvidenceReceipt(receipt, manifest,
  repositoryOwner) {
  validateManifest(manifest);
  const expected = manifest.prior_failed_remediation;
  const predecessor = receipt?.predecessor_atomic_run;
  assert(receipt?.id === 'kidults-atomic-terminal-recovery-evidence-receipt-v2'
    && receipt?.version === '2.0.0'
    && receipt?.state === 'VERIFIED_PASS'
    && receipt?.failure_code == null,
  'ATOMIC_FINALIZATION_V2_SOURCE_REMEDIATION_EVIDENCE_STATE_INVALID');
  assert(receipt?.repository === manifest.repository
    && Number(receipt?.predecessor_pull_request) ===
      manifest.predecessor_pull_request.number
    && predecessor != null && typeof predecessor === 'object'
    && !Array.isArray(predecessor)
    && Number(predecessor.id) === manifest.predecessor_atomic_run.id
    && Number(predecessor.attempt) === manifest.predecessor_atomic_run.attempt
    && predecessor.conclusion ===
      manifest.predecessor_atomic_run.expected_conclusion
    && predecessor.actor === repositoryOwner
    && receipt?.predecessor_merge_sha ===
      manifest.predecessor_pull_request.merge_commit_sha,
  'ATOMIC_FINALIZATION_V2_SOURCE_REMEDIATION_EVIDENCE_PREDECESSOR_INVALID');
  assert(receipt?.exact_current_main_sha === expected.head_sha
    && Number(receipt?.recovery_workflow_run_id) === expected.run_id
    && Number(receipt?.recovery_workflow_run_attempt) === expected.run_attempt
    && receipt?.authorization_id_sha256 === expected.authorization_id_sha256,
  'ATOMIC_FINALIZATION_V2_SOURCE_REMEDIATION_EVIDENCE_GENERATION_INVALID');
  assert(receipt?.approval?.comment_id === expected.approval_comment_id
    && receipt?.approval?.comment_body_digest ===
      expected.approval_comment_body_digest
    && receipt?.approval?.actor === repositoryOwner,
  'ATOMIC_FINALIZATION_V2_SOURCE_REMEDIATION_EVIDENCE_APPROVAL_INVALID');
  assert(receipt?.one_use_dispatch?.run_id === expected.run_id
    && receipt?.one_use_dispatch?.run_attempt === expected.run_attempt
    && receipt?.one_use_dispatch?.workflow_id === expected.workflow_id
    && receipt?.one_use_dispatch?.matching_run_count === 1
    && receipt?.one_use_dispatch?.incident_run_count === 1,
  'ATOMIC_FINALIZATION_V2_SOURCE_REMEDIATION_EVIDENCE_ONE_USE_INVALID');
  assert(receipt?.historical_terminal_status?.id ===
    manifest.historical_terminal_status.id
    && receipt?.historical_terminal_status?.immutable === true
    && receipt?.recovery_status_before?.prior_status_count === 0,
  'ATOMIC_FINALIZATION_V2_SOURCE_REMEDIATION_EVIDENCE_STATUS_INVALID');
  assert(receipt?.status_write_authority === false
    && receipt?.status_write_performed === false
    && receipt?.historical_terminal_context_mutated === false
    && receipt?.merge_reexecuted === false
    && receipt?.landing_authorization_reused === false,
  'ATOMIC_FINALIZATION_V2_SOURCE_REMEDIATION_EVIDENCE_BOUNDARY_INVALID');
  return receipt;
}

export function validatePriorRemediationPublicationReceipt(receipt, manifest) {
  validateManifest(manifest);
  const expected = manifest.prior_failed_remediation;
  assert(receipt?.id === 'kidults-atomic-terminal-recovery-publication-receipt-v2'
    && receipt?.version === '2.0.0'
    && receipt?.state === 'VERIFIED_FAIL'
    && receipt?.failure_code ===
      'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_PREDECESSOR_MISMATCH',
  'ATOMIC_FINALIZATION_V2_SOURCE_REMEDIATION_PUBLICATION_STATE_INVALID');
  assert(receipt?.repository === manifest.repository
    && Number(receipt?.predecessor_pull_request) ===
      manifest.predecessor_pull_request.number
    && Number(receipt?.predecessor_atomic_run) ===
      manifest.predecessor_atomic_run.id
    && receipt?.predecessor_merge_sha ===
      manifest.predecessor_pull_request.merge_commit_sha
    && receipt?.exact_current_main_sha === expected.head_sha
    && Number(receipt?.recovery_workflow_run_id) === expected.run_id
    && Number(receipt?.recovery_workflow_run_attempt) === expected.run_attempt
    && receipt?.authorization_id_sha256 === expected.authorization_id_sha256,
  'ATOMIC_FINALIZATION_V2_SOURCE_REMEDIATION_PUBLICATION_TUPLE_INVALID');
  assert(receipt?.status_write_authority_established === true
    && receipt?.distinct_recovery_failure_status_attempted === true
    && Number(receipt?.distinct_recovery_failure_status_http_status) === 201
    && receipt?.historical_terminal_context_mutated === false
    && receipt?.merge_reexecuted === false
    && receipt?.landing_authorization_reused === false,
  'ATOMIC_FINALIZATION_V2_SOURCE_REMEDIATION_PUBLICATION_BOUNDARY_INVALID');
  return receipt;
}

export function validatePriorFinalizationReceipts(preflight, terminal, manifest) {
  validateManifest(manifest);
  const expected = manifest.prior_failed_finalization;
  assert(preflight?.id ===
    'kidults-atomic-terminal-recovery-finalization-preflight-receipt-v1'
    && preflight?.version === '2.0.0'
    && preflight?.state === 'VERIFIED_FAIL'
    && preflight?.failure_code === expected.failure_code,
  'ATOMIC_FINALIZATION_V2_SOURCE_FINALIZATION_PREFLIGHT_STATE_INVALID');
  assert(preflight?.repository === manifest.repository
    && preflight?.exact_current_main_sha === expected.head_sha
    && Number(preflight?.recovery_workflow_run_id) === expected.run_id
    && Number(preflight?.recovery_workflow_run_attempt) === expected.run_attempt
    && preflight?.authorization_id_sha256 === expected.authorization_id_sha256,
  'ATOMIC_FINALIZATION_V2_SOURCE_FINALIZATION_PREFLIGHT_TUPLE_INVALID');
  assert(preflight?.status_write_authority === false
    && preflight?.status_write_performed === false
    && preflight?.prior_authorization_reused === false
    && preflight?.prior_run_rerun_performed === false
    && preflight?.historical_terminal_context_mutated === false,
  'ATOMIC_FINALIZATION_V2_SOURCE_FINALIZATION_PREFLIGHT_BOUNDARY_INVALID');
  assert(terminal?.id ===
    'kidults-atomic-terminal-recovery-finalization-terminal-receipt-v1'
    && terminal?.version === '1.0.0'
    && terminal?.state === 'VERIFIED_FAIL'
    && terminal?.failure_code === 'FINALIZATION_PREFLIGHT_NOT_SUCCESS'
    && terminal?.repository === manifest.repository
    && terminal?.exact_current_main_sha === expected.head_sha
    && Number(terminal?.workflow_run_id) === expected.run_id
    && Number(terminal?.workflow_run_attempt) === expected.run_attempt
    && terminal?.outcomes?.contract_regressions === 'success'
    && terminal?.outcomes?.finalization_preflight === 'failure',
  'ATOMIC_FINALIZATION_V2_SOURCE_FINALIZATION_TERMINAL_STATE_INVALID');
  assert(terminal?.status_write_authority === false
    && terminal?.status_write_performed === false
    && terminal?.prior_authorization_reused === false
    && terminal?.prior_run_rerun_performed === false
    && terminal?.promotion_eligible === false
    && terminal?.public === 'HOLD'
    && terminal?.production === 'HOLD'
    && terminal?.g5 === 'HOLD',
  'ATOMIC_FINALIZATION_V2_SOURCE_FINALIZATION_TERMINAL_BOUNDARY_INVALID');
  return {preflight, terminal};
}

export function assertHistoricalTerminalImmutable(statusPayload, manifest) {
  validateManifest(manifest);
  const entries = statusesFor(statusPayload, HISTORICAL_CONTEXT);
  assert(entries.length === 1,
    'ATOMIC_FINALIZATION_V2_HISTORICAL_STATUS_CARDINALITY_INVALID',
    String(entries.length));
  const expected = manifest.historical_terminal_status;
  const observed = entries[0];
  assert(Number(observed?.id) === expected.id
    && observed?.state === expected.state
    && observed?.description === expected.description
    && observed?.target_url === expected.target_url
    && observed?.created_at === expected.created_at,
  'ATOMIC_FINALIZATION_V2_HISTORICAL_STATUS_DRIFT');
  return {id: expected.id, state: 'failure', immutable: true};
}

export function assertPriorRecoveryFailureImmutable(statusPayload, manifest) {
  validateManifest(manifest);
  const entries = statusesFor(statusPayload, RECOVERY_CONTEXT);
  assert(entries.length === 1,
    'ATOMIC_FINALIZATION_V2_PRIOR_RECOVERY_CARDINALITY_INVALID',
    String(entries.length));
  const expected = manifest.prior_recovery_failure_status;
  const observed = entries[0];
  assert(Number(observed?.id) === expected.id
    && observed?.state === expected.state
    && observed?.description === expected.description
    && observed?.target_url === expected.target_url
    && observed?.created_at === expected.created_at,
  'ATOMIC_FINALIZATION_V2_PRIOR_RECOVERY_DRIFT');
  return {id: expected.id, state: 'failure', immutable: true};
}

export function assertFinalizedReadback(combinedStatus, rawStatusHistory,
  publishedId, runId, manifest) {
  validateManifest(manifest);
  assert(Array.isArray(rawStatusHistory),
    'ATOMIC_FINALIZATION_V2_RAW_HISTORY_SHAPE_INVALID');
  const historical = assertHistoricalTerminalImmutable(combinedStatus, manifest);
  const combinedRecovery = latestStatus(combinedStatus, RECOVERY_CONTEXT);
  const expectedTarget =
    `https://github.com/${manifest.repository}/actions/runs/${Number(runId)}`;
  assert(combinedRecovery
    && Number(combinedRecovery.id) === Number(publishedId)
    && combinedRecovery.state === 'success'
    && combinedRecovery.description ===
      'Recovery evidence finalized V2; historical failures preserved'
    && combinedRecovery.target_url === expectedTarget,
  'ATOMIC_FINALIZATION_V2_COMBINED_RECOVERY_SUCCESS_INVALID');
  const entries = statusesFor({statuses: rawStatusHistory}, RECOVERY_CONTEXT);
  assert(entries.length === 2,
    'ATOMIC_FINALIZATION_V2_STATUS_LINEAGE_CARDINALITY_INVALID',
    String(entries.length));
  const expectedPrior = manifest.prior_recovery_failure_status;
  const prior = entries.find(item => Number(item?.id) === expectedPrior.id);
  const latest = entries.find(item => Number(item?.id) === Number(publishedId));
  assert(prior
    && prior.state === expectedPrior.state
    && prior.description === expectedPrior.description
    && prior.target_url === expectedPrior.target_url
    && prior.created_at === expectedPrior.created_at,
  'ATOMIC_FINALIZATION_V2_PRIOR_FAILURE_LINEAGE_INVALID');
  assert(latest
    && latest.state === 'success'
    && latest.description ===
      'Recovery evidence finalized V2; historical failures preserved'
    && latest.target_url === expectedTarget,
  'ATOMIC_FINALIZATION_V2_SUCCESS_LINEAGE_INVALID');
  assert(Number(entries[0]?.id) === Number(publishedId),
    'ATOMIC_FINALIZATION_V2_SUCCESS_NOT_LATEST');
  return {historical, prior, latest, lineage_count: 2};
}
