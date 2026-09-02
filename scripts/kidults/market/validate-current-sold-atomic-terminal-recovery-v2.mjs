#!/usr/bin/env node
import fs from 'node:fs';
import {
  APPROVAL_MARKER,
  APPROVAL_OPERATION,
  APPROVAL_SCOPE,
  HISTORICAL_CONTEXT,
  RECOVERY_CONTEXT,
  sha256,
  validateManifest,
  parseRecoveryApprovalBody,
  selectRecoveryApproval,
  buildRecoveryRunName,
  evaluateRecoveryRunSet,
  assertHistoricalRedImmutable,
  assertRecoveryContextAbsent,
  assertRecoverySuccessReadback,
} from './atomic-terminal-recovery-v2-policy.mjs';

const manifestPath = process.argv[2]
  || 'coordination/kidults/market/current-sold-atomic-terminal-recovery-33603816578-v2.json';
const workflowPath = process.argv[3]
  || '.github/workflows/kidults-current-sold-atomic-terminal-recovery-v2.yml';
const manifestBytes = fs.readFileSync(manifestPath);
const manifest = validateManifest(JSON.parse(manifestBytes.toString('utf8')));
const manifestDigest = sha256(manifestBytes);
const mainSha = 'a'.repeat(40);
const authorizationId = `RECOVER-RUN-${manifest.atomic_run.id}-${mainSha.slice(0, 12)}`;
const approvedAt = '2026-09-02T08:10:00Z';
const expiresAt = '2026-09-02T08:40:00Z';
const repositoryOwner = 'johnkim9524-collab';

function approvalBody(overrides = {}) {
  const values = {
    repository: manifest.repository,
    source_issue: String(manifest.approval_issue),
    predecessor_pull_request: String(manifest.predecessor_pull_request.number),
    predecessor_atomic_run: String(manifest.atomic_run.id),
    predecessor_merge_sha: manifest.predecessor_pull_request.merge_commit_sha,
    historical_terminal_status_id: String(manifest.historical_terminal_status.id),
    exact_current_main_sha: mainSha,
    recovery_manifest_sha256: manifestDigest,
    operation: APPROVAL_OPERATION,
    recovery_context: RECOVERY_CONTEXT,
    authorization_id: authorizationId,
    nonce: 'b'.repeat(32),
    expires_at: expiresAt,
    scope: APPROVAL_SCOPE,
    approval_rebind: 'FORBIDDEN',
    ...overrides,
  };
  return [APPROVAL_MARKER, ...Object.entries(values).map(([key, value]) => `${key}=${value}`)].join('\n');
}

function comment(overrides = {}, fieldOverrides = {}) {
  return {
    id: 9001,
    user: {login: repositoryOwner},
    author_association: 'OWNER',
    performed_via_github_app: null,
    created_at: approvedAt,
    updated_at: approvedAt,
    body: approvalBody(fieldOverrides),
    ...overrides,
  };
}

function validApproval(comments = [comment()], evaluationTime = '2026-09-02T08:20:00Z') {
  return selectRecoveryApproval(comments, {
    manifest,
    repositoryOwner,
    currentMainSha: mainSha,
    currentMainCommittedAt: '2026-09-02T08:00:00Z',
    manifestDigest,
    authorizationId,
    evaluationTime,
  });
}

const runName = buildRecoveryRunName({
  predecessorRunId: manifest.atomic_run.id,
  currentMainSha: mainSha,
  authorizationId,
});
function run(overrides = {}) {
  return {
    id: 7001,
    workflow_id: 8001,
    run_attempt: 1,
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: mainSha,
    display_title: runName,
    actor: {login: repositoryOwner},
    triggering_actor: {login: repositoryOwner},
    created_at: '2026-09-02T08:20:00Z',
    ...overrides,
  };
}
function validRunSet(runs = [run()]) {
  return evaluateRecoveryRunSet(runs, {
    currentRunId: 7001,
    currentRunAttempt: 1,
    workflowId: 8001,
    predecessorRunId: manifest.atomic_run.id,
    expectedRunName: runName,
    currentMainSha: mainSha,
    repositoryOwner,
    approval: validApproval(),
  });
}

function status(overrides = {}) {
  return {
    id: manifest.historical_terminal_status.id,
    context: HISTORICAL_CONTEXT,
    state: 'failure',
    description: manifest.historical_terminal_status.description,
    target_url: manifest.historical_terminal_status.target_url,
    created_at: manifest.historical_terminal_status.created_at,
    updated_at: manifest.historical_terminal_status.created_at,
    ...overrides,
  };
}

function reject(label, expected, fn) {
  let observed = '';
  try { fn(); } catch (error) { observed = String(error?.code || error?.message || ''); }
  if (!observed.startsWith(expected)) {
    throw new Error(`${label}: expected ${expected}, observed ${observed || 'NO_REJECTION'}`);
  }
  return label;
}

const passed = [];
if (!parseRecoveryApprovalBody(approvalBody())) throw new Error('valid approval did not parse');
validApproval();
validRunSet();
assertHistoricalRedImmutable({statuses: [status()]}, manifest);
assertRecoveryContextAbsent({statuses: [status()]});
assertRecoverySuccessReadback({statuses: [{
  id: 77,
  context: RECOVERY_CONTEXT,
  state: 'success',
  description: 'Recovered evidence verified; original terminal RED preserved',
  target_url: 'https://github.com/x/y/actions/runs/7001',
  created_at: '2026-09-02T08:21:00Z',
}]}, 77, 7001);

passed.push(reject('wrong approval actor', 'ATOMIC_RECOVERY_APPROVAL_ACTOR_INVALID',
  () => validApproval([comment({user: {login: 'intruder'}})])));
passed.push(reject('app-mediated approval', 'ATOMIC_RECOVERY_APPROVAL_APP_MEDIATED',
  () => validApproval([comment({performed_via_github_app: {id: 1}})])));
passed.push(reject('edited approval', 'ATOMIC_RECOVERY_APPROVAL_EDITED',
  () => validApproval([comment({updated_at: '2026-09-02T08:11:00Z'})])));
passed.push(reject('wrong approval main', 'ATOMIC_RECOVERY_APPROVAL_MAIN_MISMATCH',
  () => validApproval([comment({}, {exact_current_main_sha: 'c'.repeat(40)})])));
passed.push(reject('wrong manifest digest', 'ATOMIC_RECOVERY_APPROVAL_MANIFEST_MISMATCH',
  () => validApproval([comment({}, {recovery_manifest_sha256: `sha256:${'d'.repeat(64)}`})])));
passed.push(reject('wrong operation', 'ATOMIC_RECOVERY_APPROVAL_OPERATION_INVALID',
  () => validApproval([comment({}, {operation: 'MERGE_PROTECTED_MAIN'})])));
passed.push(reject('context substitution', 'ATOMIC_RECOVERY_APPROVAL_CONTEXT_INVALID',
  () => validApproval([comment({}, {recovery_context: HISTORICAL_CONTEXT})])));
passed.push(reject('bad nonce', 'ATOMIC_RECOVERY_APPROVAL_NONCE_INVALID',
  () => validApproval([comment({}, {nonce: 'short'})])));
passed.push(reject('expired approval', 'ATOMIC_RECOVERY_APPROVAL_EXPIRED',
  () => validApproval([comment()], '2026-09-02T08:41:00Z')));
passed.push(reject('approval before current main', 'ATOMIC_RECOVERY_APPROVAL_PRECEDES_CURRENT_MAIN',
  () => selectRecoveryApproval([comment()], {
    manifest, repositoryOwner, currentMainSha: mainSha,
    currentMainCommittedAt: '2026-09-02T08:11:00Z', manifestDigest,
    authorizationId, evaluationTime: '2026-09-02T08:20:00Z',
  })));
passed.push(reject('dispatch actor', 'ATOMIC_RECOVERY_DISPATCH_ACTOR_NOT_OWNER',
  () => validRunSet([run({actor: {login: 'intruder'}})])));
passed.push(reject('triggering actor', 'ATOMIC_RECOVERY_TRIGGERING_ACTOR_NOT_OWNER',
  () => validRunSet([run({triggering_actor: {login: 'intruder'}})])));
passed.push(reject('rerun', 'ATOMIC_RECOVERY_RERUN_FORBIDDEN',
  () => evaluateRecoveryRunSet([run({run_attempt: 2})], {
    currentRunId: 7001, currentRunAttempt: 2, workflowId: 8001,
    predecessorRunId: manifest.atomic_run.id, expectedRunName: runName,
    currentMainSha: mainSha, repositoryOwner, approval: validApproval(),
  })));
passed.push(reject('duplicate exact dispatch', 'ATOMIC_RECOVERY_DUPLICATE_DISPATCH',
  () => validRunSet([run(), run({id: 7002})])));
passed.push(reject('prior incident dispatch', 'ATOMIC_RECOVERY_PRIOR_INCIDENT_ATTEMPT_EXISTS',
  () => validRunSet([run(), run({
    id: 7002,
    head_sha: 'c'.repeat(40),
    display_title: `KIDULTS Atomic Terminal Recovery Run #${manifest.atomic_run.id} @ ${'c'.repeat(40)} / RECOVER-RUN-${manifest.atomic_run.id}-${'c'.repeat(12)}`,
  })])));
passed.push(reject('dispatch before approval', 'ATOMIC_RECOVERY_DISPATCH_PRECEDES_APPROVAL',
  () => validRunSet([run({created_at: '2026-09-02T08:09:59Z'})])));
passed.push(reject('dispatch after expiry', 'ATOMIC_RECOVERY_DISPATCH_AFTER_APPROVAL_EXPIRY',
  () => validRunSet([run({created_at: '2026-09-02T08:40:01Z'})])));
passed.push(reject('historical status missing', 'ATOMIC_RECOVERY_HISTORICAL_STATUS_MISSING',
  () => assertHistoricalRedImmutable({statuses: []}, manifest)));
passed.push(reject('historical status overwritten', 'ATOMIC_RECOVERY_HISTORICAL_CONTEXT_OVERWRITTEN',
  () => assertHistoricalRedImmutable({statuses: [status(), status({
    id: manifest.historical_terminal_status.id + 1,
    created_at: '2026-09-02T08:30:00Z',
    updated_at: '2026-09-02T08:30:00Z',
  })]}, manifest)));
for (const state of ['pending', 'failure', 'success']) {
  passed.push(reject(`prior recovery ${state}`, 'ATOMIC_RECOVERY_PRIOR_STATUS_EXISTS',
    () => assertRecoveryContextAbsent({statuses: [status(), {
      id: 99, context: RECOVERY_CONTEXT, state,
      created_at: '2026-09-02T08:30:00Z', updated_at: '2026-09-02T08:30:00Z',
    }]})));
}
passed.push(reject('manifest context substitution', 'ATOMIC_RECOVERY_CONTEXT_SUBSTITUTION',
  () => validateManifest({...manifest, recovery_status_context: HISTORICAL_CONTEXT})));
passed.push(reject('manifest issue tamper', 'ATOMIC_RECOVERY_SOURCE_ISSUES_INVALID',
  () => validateManifest({...manifest, source_issues: [1864, 9999]})));
passed.push(reject('wrong run authorization', 'ATOMIC_RECOVERY_AUTHORIZATION_ID_INVALID',
  () => buildRecoveryRunName({
    predecessorRunId: manifest.atomic_run.id, currentMainSha: mainSha,
    authorizationId: 'RECOVER-RUN-WRONG',
  })));

const workflow = fs.readFileSync(workflowPath, 'utf8');
const common = fs.readFileSync(new URL('./atomic-terminal-recovery-v2-policy.mjs', import.meta.url), 'utf8');
const reconcile = fs.readFileSync(new URL('./current-sold-atomic-terminal-recovery-v2-reconcile.mjs', import.meta.url), 'utf8');
const publish = fs.readFileSync(new URL('./current-sold-atomic-terminal-recovery-v2-publish.mjs', import.meta.url), 'utf8');
const requireText = (text, marker, code) => { if (!text.includes(marker)) throw new Error(code); };
if (/\n\s*workflow_run:/.test(workflow)) throw new Error('RECOVERY_WORKFLOW_RUN_CONSUMER_FORBIDDEN');
requireText(workflow, 'group: kidults-atomic-governed-landing-v1-main', 'RECOVERY_GLOBAL_SERIALIZATION_MISSING');
requireText(workflow, 'Reconcile predecessor evidence without status-write authority', 'RECOVERY_EVIDENCE_JOB_MISSING');
requireText(workflow, 'Publish distinct recovery status from sealed evidence', 'RECOVERY_PUBLISH_JOB_MISSING');
requireText(workflow, 'needs: [reconcile-evidence]', 'RECOVERY_JOB_DEPENDENCY_MISSING');
requireText(workflow, 'statuses: read', 'RECOVERY_READ_ONLY_STATUS_PERMISSION_MISSING');
requireText(workflow, 'statuses: write', 'RECOVERY_DISTINCT_STATUS_PERMISSION_MISSING');
requireText(workflow, 'evidence_artifact_id:', 'RECOVERY_SEALED_ARTIFACT_ID_MISSING');
requireText(workflow, 'evidence_artifact_digest:', 'RECOVERY_SEALED_ARTIFACT_DIGEST_MISSING');
requireText(workflow, 'evidence_receipt_sha256:', 'RECOVERY_SEALED_RECEIPT_DIGEST_MISSING');
requireText(workflow, 'if: always()', 'RECOVERY_FAIL_CLOSED_ARTIFACT_MISSING');
requireText(common, `export const HISTORICAL_CONTEXT = '${HISTORICAL_CONTEXT}'`, 'RECOVERY_HISTORICAL_CONTEXT_MISSING');
requireText(common, `export const RECOVERY_CONTEXT = '${RECOVERY_CONTEXT}'`, 'RECOVERY_DISTINCT_CONTEXT_MISSING');
if (RECOVERY_CONTEXT === HISTORICAL_CONTEXT) throw new Error('RECOVERY_CONTEXT_NOT_DISTINCT');
if (/statuses:\s*write/.test(workflow.slice(
  workflow.indexOf('reconcile-evidence:'), workflow.indexOf('publish-distinct-recovery-status:')))) {
  throw new Error('RECOVERY_EVIDENCE_JOB_HAS_STATUS_WRITE');
}
if (reconcile.includes("method: 'POST'") || reconcile.includes('statuses: write')) {
  throw new Error('RECOVERY_RECONCILER_WRITE_PATH_FORBIDDEN');
}
requireText(publish, 'assertHistoricalRedImmutable', 'RECOVERY_HISTORICAL_REREAD_MISSING');
requireText(publish, 'assertRecoveryContextAbsent', 'RECOVERY_REPLAY_STATUS_GUARD_MISSING');
requireText(publish, `context: RECOVERY_CONTEXT`, 'RECOVERY_DISTINCT_STATUS_WRITE_MISSING');
if (publish.includes(`context: HISTORICAL_CONTEXT`)) {
  throw new Error('RECOVERY_HISTORICAL_STATUS_WRITE_FORBIDDEN');
}

console.log(JSON.stringify({
  id: 'kidults-atomic-terminal-recovery-v2-validation',
  state: 'VERIFIED_PASS',
  negative_cases_rejected: passed.length,
  historical_terminal_context_immutable: true,
  distinct_recovery_context: RECOVERY_CONTEXT,
  read_only_reconciliation_separated: true,
  first_dispatch_only: true,
  rerun_forbidden: true,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
