#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  APPROVAL_MARKER,
  APPROVAL_OPERATION,
  APPROVAL_SCOPE,
  AUTHORIZATION_CONTEXT,
  INCIDENT_RUN_ID,
  RECOVERY_CONTEXT,
  TERMINAL_CONTEXT,
  assertEvidenceReceipt,
  assertHistoricalStatuses,
  assertRecoveryAbsent,
  buildRunName,
  evaluateRunSet,
  selectApproval,
  sha256,
  validateManifest,
} from './atomic-landing-terminal-recovery-35564707631-v1.mjs';

const manifestFile = 'coordination/kidults/kpmo/atomic-landing-terminal-recovery-35564707631-v1.json';
const manifestBytes = fs.readFileSync(manifestFile);
const manifest = validateManifest(JSON.parse(manifestBytes.toString('utf8')));
const manifestDigest = sha256(manifestBytes);
const owner = 'johnkim9524-collab';
const currentMainSha = 'f'.repeat(40);
const authorizationId = `RECOVER-RUN-${INCIDENT_RUN_ID}-${currentMainSha.slice(0, 12)}`;
const approvedAt = '2026-09-21T04:10:00Z';
const expiresAt = '2026-09-21T05:10:00Z';
const approvalBody = ({head = currentMainSha, digest = manifestDigest, nonce = '1'.repeat(32)} = {}) => [
  APPROVAL_MARKER,
  `repository=${manifest.repository}`,
  `source_issue=${manifest.source_issue}`,
  `predecessor_pull_request=${manifest.predecessor_pull_request.number}`,
  `predecessor_atomic_run=${manifest.atomic_run.id}`,
  `predecessor_merge_sha=${manifest.predecessor_pull_request.merge_commit_sha}`,
  `historical_terminal_status_id=${manifest.historical_terminal_status.id}`,
  `historical_authorization_status_id=${manifest.historical_authorization_status.id}`,
  `exact_current_main_sha=${head}`,
  `recovery_manifest_sha256=${digest}`,
  `operation=${APPROVAL_OPERATION}`,
  `recovery_context=${RECOVERY_CONTEXT}`,
  `authorization_id=${authorizationId}`,
  `nonce=${nonce}`,
  `expires_at=${expiresAt}`,
  `scope=${APPROVAL_SCOPE}`,
  'approval_rebind=FORBIDDEN',
].join('\n');
const approvalComment = (overrides = {}) => ({
  id: 7001,
  body: approvalBody(),
  user: {login: owner},
  author_association: 'OWNER',
  performed_via_github_app: null,
  created_at: approvedAt,
  updated_at: approvedAt,
  ...overrides,
});
const approvalOptions = {
  manifest,
  repositoryOwner: owner,
  currentMainSha,
  currentMainCommittedAt: '2026-09-21T04:00:00Z',
  manifestDigest,
  authorizationId,
  evaluationTime: '2026-09-21T04:20:00Z',
};
const expectCode = (fn, code) => assert.throws(fn, error => error?.code === code);

const approval = selectApproval([approvalComment()], approvalOptions);
assert.equal(approval.actor, owner);
assert.equal(approval.authorization_id_sha256, sha256(authorizationId));
assert.equal(buildRunName(currentMainSha, authorizationId),
  `KIDULTS Atomic Landing Recovery Run #${INCIDENT_RUN_ID} @ ${currentMainSha} / ${authorizationId}`);

expectCode(() => selectApproval([], approvalOptions), 'RECOVERY_APPROVAL_MISSING');
expectCode(() => selectApproval([approvalComment({user: {login: 'automation-bot'}})], approvalOptions),
  'RECOVERY_APPROVAL_ACTOR_INVALID');
expectCode(() => selectApproval([approvalComment({performed_via_github_app: {id: 1}})], approvalOptions),
  'RECOVERY_APPROVAL_APP_MEDIATED');
expectCode(() => selectApproval([approvalComment({updated_at: '2026-09-21T04:11:00Z'})], approvalOptions),
  'RECOVERY_APPROVAL_EDITED');
expectCode(() => selectApproval([approvalComment({body: approvalBody({head: 'e'.repeat(40)})})], approvalOptions),
  'RECOVERY_APPROVAL_MAIN_MISMATCH');
expectCode(() => selectApproval([approvalComment({body: approvalBody({digest: `sha256:${'0'.repeat(64)}`})})],
  approvalOptions), 'RECOVERY_APPROVAL_MANIFEST_MISMATCH');
expectCode(() => selectApproval([approvalComment({body: approvalBody({nonce: 'invalid'})})], approvalOptions),
  'RECOVERY_APPROVAL_NONCE_INVALID');
expectCode(() => selectApproval([approvalComment()], {...approvalOptions,
  evaluationTime: '2026-09-21T05:10:01Z'}), 'RECOVERY_APPROVAL_EXPIRED');

const workflowId = 999001;
const runId = 999002;
const runName = buildRunName(currentMainSha, authorizationId);
const run = {
  id: runId,
  workflow_id: workflowId,
  event: 'workflow_dispatch',
  head_branch: 'main',
  head_sha: currentMainSha,
  display_title: runName,
  run_attempt: 1,
  actor: {login: owner},
  triggering_actor: {login: owner},
  created_at: '2026-09-21T04:20:00Z',
};
const oneUse = evaluateRunSet([run], {currentRunId: runId, currentRunAttempt: '1',
  currentWorkflowId: workflowId, currentMainSha, repositoryOwner: owner, approval,
  expectedRunName: runName});
assert.equal(oneUse.incident_run_count, 1);
expectCode(() => evaluateRunSet([run, {...run, id: 999003}], {currentRunId: runId,
  currentRunAttempt: '1', currentWorkflowId: workflowId, currentMainSha,
  repositoryOwner: owner, approval, expectedRunName: runName}),
  'RECOVERY_PRIOR_INCIDENT_ATTEMPT_EXISTS');
expectCode(() => evaluateRunSet([run], {currentRunId: runId, currentRunAttempt: '2',
  currentWorkflowId: workflowId, currentMainSha, repositoryOwner: owner, approval,
  expectedRunName: runName}), 'RECOVERY_RERUN_FORBIDDEN');

const terminal = manifest.historical_terminal_status;
const authorization = manifest.historical_authorization_status;
const status = (expected, context) => ({id: expected.id, context, state: expected.state,
  description: expected.description, target_url: expected.target_url, created_at: expected.created_at});
const historicalPayload = {statuses: [status(terminal, TERMINAL_CONTEXT),
  status(authorization, AUTHORIZATION_CONTEXT)]};
const historical = assertHistoricalStatuses(historicalPayload, manifest);
assert.equal(historical.terminal.immutable, true);
assertRecoveryAbsent(historicalPayload);
expectCode(() => assertHistoricalStatuses({statuses: [...historicalPayload.statuses,
  {...status(terminal, TERMINAL_CONTEXT), id: terminal.id + 1, created_at: '2026-09-21T06:00:00Z'}]}, manifest),
  'RECOVERY_TERMINAL_STATUS_OVERWRITTEN');
expectCode(() => assertRecoveryAbsent({statuses: [...historicalPayload.statuses, {
  id: 8001, context: RECOVERY_CONTEXT, state: 'success', description: 'unexpected',
  target_url: 'https://example.invalid', created_at: '2026-09-21T04:00:00Z'}]}),
  'RECOVERY_STATUS_ALREADY_EXISTS');

const evidence = {
  id: 'kidults-atomic-landing-terminal-recovery-evidence-v1', version: '1.0.0', state: 'VERIFIED_PASS',
  repository: manifest.repository, exact_current_main_sha: currentMainSha,
  recovery_manifest_sha256: manifestDigest, recovery_workflow_run_id: runId,
  authorization_id_sha256: sha256(authorizationId), approval,
  one_use_dispatch: oneUse, historical_statuses: historical,
  recovery_status_before: {prior_status_count: 0},
  exact_merge: {sha: manifest.predecessor_pull_request.merge_commit_sha},
  changed_file_classification: {count: manifest.predecessor_pull_request.changed_files,`n    current_sold_changed: manifest.predecessor_pull_request.current_sold_changed},
  postmerge_runs: [{}, {}], status_write_authority: false, status_write_performed: false,
  historical_status_contexts_mutated: false, merge_reexecuted: false,
  landing_authorization_reused: false, provider_calls: 0,
};
const evidenceAuthority = {manifest, currentMainSha, manifestDigest, runId, authorizationId,
  approval, oneUse};
assert.equal(assertEvidenceReceipt(evidence, evidenceAuthority, {artifactId: 9001,
  artifactName: `kidults-atomic-landing-recovery-evidence-v1-${runId}-1`,
  artifactDigest: `sha256:${crypto.randomBytes(32).toString('hex')}`,
  receiptDigest: `sha256:${crypto.randomBytes(32).toString('hex')}`}), evidence);
expectCode(() => assertEvidenceReceipt({...evidence, status_write_performed: true}, evidenceAuthority, {
  artifactId: 9001, artifactName: `kidults-atomic-landing-recovery-evidence-v1-${runId}-1`,
  artifactDigest: `sha256:${'2'.repeat(64)}`, receiptDigest: `sha256:${'3'.repeat(64)}`}),
  'RECOVERY_EVIDENCE_BOUNDARY_INVALID');

console.log(JSON.stringify({id: 'kidults-atomic-landing-terminal-recovery-validation-v1',
  version: '1.0.0', result: 'PASS', incident_run_id: INCIDENT_RUN_ID,
  historical_terminal_red_immutable: true, historical_authorization_red_immutable: true,
  distinct_recovery_context_only: true, fresh_owner_approval_required: true,
  rerun_forbidden: true, merge_reexecution: false, provider_calls: 0,
  public: 'HOLD', production: 'HOLD', g5: 'HOLD'}));
