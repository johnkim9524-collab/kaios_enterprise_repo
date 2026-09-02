#!/usr/bin/env node
import fs from 'node:fs';
import {
  APPROVAL_MARKER,
  APPROVAL_OPERATION,
  APPROVAL_SCOPE,
  RECOVERY_CONTEXT,
  assert,
  sha256,
  validateManifest,
  buildFinalizationRunName,
  expectedEvidenceArtifactName,
  expectedPublicationArtifactName,
  selectApproval,
  evaluateRunSet,
  validatePriorFinalizationRun,
  validatePriorFinalizationReceipts,
  assertHistoricalTerminalImmutable,
  assertPriorRecoveryFailureImmutable,
  assertFinalizedReadback,
} from './atomic-terminal-recovery-finalization-v2-policy.mjs';

const manifestPath = process.argv[2]
  || 'coordination/kidults/market/current-sold-atomic-terminal-recovery-finalization-33603816578-v2.json';
const workflowPath = process.argv[3]
  || '.github/workflows/kidults-current-sold-atomic-terminal-recovery-finalization-v2.yml';
const manifestBytes = fs.readFileSync(manifestPath);
const manifest = validateManifest(JSON.parse(manifestBytes.toString('utf8')));
const manifestDigest = sha256(manifestBytes);
const workflow = fs.readFileSync(workflowPath, 'utf8');
const runtime = fs.readFileSync(
  new URL('./atomic-terminal-recovery-finalization-v2-runtime.mjs', import.meta.url),
  'utf8');
const preflight = fs.readFileSync(
  new URL('./current-sold-atomic-terminal-recovery-finalization-v2-preflight.mjs',
    import.meta.url), 'utf8');
const publisher = fs.readFileSync(
  new URL('./current-sold-atomic-terminal-recovery-finalization-v2-publish.mjs',
    import.meta.url), 'utf8');

function reject(label, expected, fn) {
  let observed = '';
  try { fn(); } catch (error) {
    observed = String(error?.code || error?.message || '');
  }
  if (!observed.startsWith(expected)) {
    throw new Error(`${label}: expected ${expected}, observed ${observed || 'NO_REJECTION'}`);
  }
  return label;
}

function requireText(text, marker, code) {
  if (!text.includes(marker)) throw new Error(code);
}

const owner = 'johnkim9524-collab';
const currentMain = 'e8e957f97cc46f711e90040ad68827362d880990';
const authorizationId = `FINALIZE-RUN-33603816578-${currentMain.slice(0, 12)}`;
const expectedRunName = buildFinalizationRunName({
  predecessorRunId: manifest.predecessor_atomic_run.id,
  currentMainSha: currentMain,
  authorizationId,
});
assert(expectedRunName ===
  `KIDULTS Atomic Terminal Recovery Finalization V2 Run #33603816578 @ ${currentMain} / ${authorizationId}`,
'ATOMIC_FINALIZATION_V2_RUN_NAME_PROBE_FAILED');
assert(expectedEvidenceArtifactName(7002) ===
  'kidults-atomic-terminal-recovery-finalization-evidence-v2-7002-1',
'ATOMIC_FINALIZATION_V2_EVIDENCE_NAME_PROBE_FAILED');
assert(expectedPublicationArtifactName(7002) ===
  'kidults-atomic-terminal-recovery-finalization-publication-v2-7002-1',
'ATOMIC_FINALIZATION_V2_PUBLICATION_NAME_PROBE_FAILED');

const approvalBody = [
  APPROVAL_MARKER,
  `repository=${manifest.repository}`,
  `source_issue=${manifest.approval_issue}`,
  `correction_issue=${manifest.correction_issue}`,
  `predecessor_pull_request=${manifest.predecessor_pull_request.number}`,
  `predecessor_atomic_run=${manifest.predecessor_atomic_run.id}`,
  `prior_recovery_failure_status_id=${manifest.prior_recovery_failure_status.id}`,
  `prior_failed_finalization_run=${manifest.prior_failed_finalization.run_id}`,
  `exact_current_main_sha=${currentMain}`,
  `finalization_manifest_sha256=${manifestDigest}`,
  `operation=${APPROVAL_OPERATION}`,
  `finalization_context=${RECOVERY_CONTEXT}`,
  `authorization_id=${authorizationId}`,
  'nonce=0123456789abcdef0123456789abcdef',
  'expires_at=2026-09-02T17:30:00Z',
  `scope=${APPROVAL_SCOPE}`,
  'approval_rebind=FORBIDDEN',
].join('\n');
const approval = selectApproval([{
  id: 99001,
  body: approvalBody,
  created_at: '2026-09-02T16:30:00Z',
  updated_at: '2026-09-02T16:30:00Z',
  user: {login: owner},
  author_association: 'OWNER',
  performed_via_github_app: null,
}], {
  manifest,
  repositoryOwner: owner,
  currentMainSha: currentMain,
  currentMainCommittedAt: '2026-09-02T15:39:58Z',
  manifestDigest,
  authorizationId,
  evaluationTime: '2026-09-02T16:45:00Z',
});
const currentRun = {
  id: 7002,
  run_attempt: 1,
  workflow_id: 777777777,
  path: manifest.authorized_workflow_path,
  event: 'workflow_dispatch',
  head_branch: 'main',
  head_sha: currentMain,
  display_title: expectedRunName,
  created_at: '2026-09-02T16:40:00Z',
  actor: {login: owner},
  triggering_actor: {login: owner},
};
const oneUse = evaluateRunSet([currentRun], {
  currentRunId: currentRun.id,
  currentRunAttempt: 1,
  workflowId: currentRun.workflow_id,
  workflowPath: manifest.authorized_workflow_path,
  predecessorRunId: manifest.predecessor_atomic_run.id,
  expectedRunName,
  currentMainSha: currentMain,
  repositoryOwner: owner,
  approval,
});
assert(oneUse.matching_run_count === 1 && oneUse.incident_run_count === 1,
  'ATOMIC_FINALIZATION_V2_ONE_USE_PROBE_FAILED');

const priorFinalization = manifest.prior_failed_finalization;
const priorRun = {
  id: priorFinalization.run_id,
  run_attempt: priorFinalization.run_attempt,
  workflow_id: priorFinalization.workflow_id,
  path: priorFinalization.workflow_path,
  head_branch: 'main',
  head_sha: priorFinalization.head_sha,
  event: 'workflow_dispatch',
  status: 'completed',
  conclusion: 'failure',
  display_title: priorFinalization.display_title,
  created_at: priorFinalization.created_at,
  actor: {login: owner},
  triggering_actor: {login: owner},
};
const priorJobs = {jobs: [
  {name: 'Validate failed recovery finalization contract', conclusion: 'skipped'},
  {name: 'Finalize failed recovery evidence without status-write authority',
    conclusion: 'failure'},
  {name: 'Publish final recovery success from sealed lineage', conclusion: 'skipped'},
]};
const priorArtifacts = [{
  id: priorFinalization.evidence_artifact.id,
  name: priorFinalization.evidence_artifact.name,
  digest: priorFinalization.evidence_artifact.digest,
  expired: false,
}];
validatePriorFinalizationRun(priorRun, priorJobs, priorArtifacts, owner, manifest);

const priorPreflight = {
  id: 'kidults-atomic-terminal-recovery-finalization-preflight-receipt-v1',
  version: '2.0.0',
  state: 'VERIFIED_FAIL',
  failure_code: priorFinalization.failure_code,
  repository: manifest.repository,
  exact_current_main_sha: priorFinalization.head_sha,
  recovery_workflow_run_id: priorFinalization.run_id,
  recovery_workflow_run_attempt: priorFinalization.run_attempt,
  authorization_id_sha256: priorFinalization.authorization_id_sha256,
  historical_terminal_context_mutated: false,
  status_write_authority: false,
  status_write_performed: false,
  prior_authorization_reused: false,
  prior_run_rerun_performed: false,
};
const priorTerminal = {
  id: 'kidults-atomic-terminal-recovery-finalization-terminal-receipt-v1',
  version: '1.0.0',
  state: 'VERIFIED_FAIL',
  failure_code: 'FINALIZATION_PREFLIGHT_NOT_SUCCESS',
  repository: manifest.repository,
  exact_current_main_sha: priorFinalization.head_sha,
  workflow_run_id: priorFinalization.run_id,
  workflow_run_attempt: priorFinalization.run_attempt,
  outcomes: {contract_regressions: 'success', finalization_preflight: 'failure'},
  status_write_authority: false,
  status_write_performed: false,
  prior_authorization_reused: false,
  prior_run_rerun_performed: false,
  promotion_eligible: false,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};
validatePriorFinalizationReceipts(priorPreflight, priorTerminal, manifest);

const historical = {...manifest.historical_terminal_status};
const priorFailure = {...manifest.prior_recovery_failure_status};
const success = {
  id: 60000000001,
  context: RECOVERY_CONTEXT,
  state: 'success',
  description: 'Recovery evidence finalized V2; historical failures preserved',
  target_url:
    'https://github.com/johnkim9524-collab/kaios_enterprise_repo/actions/runs/7002',
  created_at: '2026-09-02T16:50:00Z',
};
assertHistoricalTerminalImmutable({statuses: [historical, priorFailure]}, manifest);
assertPriorRecoveryFailureImmutable({statuses: [historical, priorFailure]}, manifest);
assertFinalizedReadback({statuses: [historical, success]},
  [historical, priorFailure, success], success.id, 7002, manifest);

const rejected = [];
rejected.push(reject('generic V1-style run name',
  'ATOMIC_FINALIZATION_V2_CURRENT_RUN_TUPLE_MISMATCH',
  () => evaluateRunSet([{...currentRun,
    display_title: `KIDULTS Atomic Terminal Recovery Run #33603816578 @ ${currentMain} / ${authorizationId}`,
  }], {
    currentRunId: currentRun.id,
    currentRunAttempt: 1,
    workflowId: currentRun.workflow_id,
    workflowPath: manifest.authorized_workflow_path,
    predecessorRunId: manifest.predecessor_atomic_run.id,
    expectedRunName,
    currentMainSha: currentMain,
    repositoryOwner: owner,
    approval,
  })));
rejected.push(reject('duplicate V2 dispatch',
  'ATOMIC_FINALIZATION_V2_DUPLICATE_DISPATCH',
  () => evaluateRunSet([currentRun, {...currentRun, id: 7003}], {
    currentRunId: currentRun.id,
    currentRunAttempt: 1,
    workflowId: currentRun.workflow_id,
    workflowPath: manifest.authorized_workflow_path,
    predecessorRunId: manifest.predecessor_atomic_run.id,
    expectedRunName,
    currentMainSha: currentMain,
    repositoryOwner: owner,
    approval,
  })));
rejected.push(reject('rerun attempt',
  'ATOMIC_FINALIZATION_V2_RERUN_FORBIDDEN',
  () => evaluateRunSet([{...currentRun, run_attempt: 2}], {
    currentRunId: currentRun.id,
    currentRunAttempt: 2,
    workflowId: currentRun.workflow_id,
    workflowPath: manifest.authorized_workflow_path,
    predecessorRunId: manifest.predecessor_atomic_run.id,
    expectedRunName,
    currentMainSha: currentMain,
    repositoryOwner: owner,
    approval,
  })));
rejected.push(reject('prior finalization artifact substitution',
  'ATOMIC_FINALIZATION_V2_PRIOR_FINALIZATION_EVIDENCE_BINDING_INVALID',
  () => validatePriorFinalizationRun(priorRun, priorJobs, [{
    ...priorArtifacts[0], digest: `sha256:${'0'.repeat(64)}`,
  }], owner, manifest)));
rejected.push(reject('prior finalization claimed write authority',
  'ATOMIC_FINALIZATION_V2_SOURCE_FINALIZATION_PREFLIGHT_BOUNDARY_INVALID',
  () => validatePriorFinalizationReceipts({...priorPreflight,
    status_write_authority: true}, priorTerminal, manifest)));
rejected.push(reject('historical RED drift',
  'ATOMIC_FINALIZATION_V2_HISTORICAL_STATUS_DRIFT',
  () => assertHistoricalTerminalImmutable({statuses: [
    {...historical, state: 'success'}, priorFailure,
  ]}, manifest)));
rejected.push(reject('third Recovery status',
  'ATOMIC_FINALIZATION_V2_STATUS_LINEAGE_CARDINALITY_INVALID',
  () => assertFinalizedReadback({statuses: [historical, success]},
    [historical, priorFailure, success, {...success, id: success.id + 1}],
    success.id, 7002, manifest)));
rejected.push(reject('cross-main approval replay',
  'ATOMIC_FINALIZATION_V2_APPROVAL_MAIN_MISMATCH',
  () => selectApproval([{
    id: 99001,
    body: approvalBody.replace(`exact_current_main_sha=${currentMain}`,
      `exact_current_main_sha=${'0'.repeat(40)}`),
    created_at: '2026-09-02T16:30:00Z',
    updated_at: '2026-09-02T16:30:00Z',
    user: {login: owner},
    author_association: 'OWNER',
    performed_via_github_app: null,
  }], {
    manifest,
    repositoryOwner: owner,
    currentMainSha: currentMain,
    currentMainCommittedAt: '2026-09-02T15:39:58Z',
    manifestDigest,
    authorizationId,
    evaluationTime: '2026-09-02T16:45:00Z',
  })));

requireText(workflow,
  'name: KIDULTS Current-SOLD Atomic Terminal Recovery Finalization V2',
  'ATOMIC_FINALIZATION_V2_WORKFLOW_NAME_INVALID');
requireText(workflow,
  'run-name: "KIDULTS Atomic Terminal Recovery Finalization V2 Run #33603816578 @ ${{ inputs.expected_current_main_sha }} / ${{ inputs.finalization_authorization_id }}"',
  'ATOMIC_FINALIZATION_V2_WORKFLOW_RUN_NAME_INVALID');
requireText(workflow, 'workflow_dispatch:',
  'ATOMIC_FINALIZATION_V2_WORKFLOW_DISPATCH_MISSING');
requireText(workflow, 'group: kidults-atomic-governed-landing-v1-main',
  'ATOMIC_FINALIZATION_V2_SERIALIZATION_MISSING');
requireText(workflow, 'Validate finalization V2 contract',
  'ATOMIC_FINALIZATION_V2_VALIDATION_JOB_MISSING');
requireText(workflow,
  'Finalize immutable predecessor lineage without status-write authority',
  'ATOMIC_FINALIZATION_V2_READ_JOB_MISSING');
requireText(workflow, 'Publish append-only Recovery V1 success from sealed V2 evidence',
  'ATOMIC_FINALIZATION_V2_WRITE_JOB_MISSING');
requireText(workflow, 'statuses: read',
  'ATOMIC_FINALIZATION_V2_READ_PERMISSION_MISSING');
requireText(workflow, 'statuses: write',
  'ATOMIC_FINALIZATION_V2_WRITE_PERMISSION_MISSING');
requireText(workflow,
  'current-sold-atomic-terminal-recovery-finalization-v2-preflight.mjs',
  'ATOMIC_FINALIZATION_V2_PREFLIGHT_STEP_MISSING');
requireText(workflow,
  'current-sold-atomic-terminal-recovery-finalization-v2-publish.mjs',
  'ATOMIC_FINALIZATION_V2_PUBLISH_STEP_MISSING');
requireText(workflow, '${{ github.run_id }}-${{ github.run_attempt }}',
  'ATOMIC_FINALIZATION_V2_ARTIFACT_RUN_BINDING_MISSING');
requireText(runtime, 'buildFinalizationRunName',
  'ATOMIC_FINALIZATION_V2_RUNTIME_RUN_NAME_BUILDER_MISSING');
requireText(runtime, 'evaluateRunSet',
  'ATOMIC_FINALIZATION_V2_RUNTIME_ONE_USE_MISSING');
requireText(preflight, 'validatePriorFinalizationRun',
  'ATOMIC_FINALIZATION_V2_PREFLIGHT_PRIOR_RUN_MISSING');
requireText(preflight, 'assertPriorRecoveryFailureImmutable',
  'ATOMIC_FINALIZATION_V2_PREFLIGHT_PRIOR_STATUS_MISSING');
requireText(publisher, 'assertFinalizedReadback',
  'ATOMIC_FINALIZATION_V2_PUBLISH_READBACK_MISSING');
requireText(publisher, 'status_write_attempted: mutationState.statusWriteAttempted',
  'ATOMIC_FINALIZATION_V2_PUBLISH_MUTATION_RECEIPT_MISSING');
const readOnlySection = workflow.slice(
  workflow.indexOf('finalize-v2-evidence:'),
  workflow.indexOf('publish-v2-success:'),
);
if (/statuses:\s*write/.test(readOnlySection)) {
  throw new Error('ATOMIC_FINALIZATION_V2_READ_JOB_HAS_WRITE_PERMISSION');
}
if (preflight.includes("method: 'POST'") || preflight.includes('statuses: write')) {
  throw new Error('ATOMIC_FINALIZATION_V2_PREFLIGHT_WRITE_PATH_FORBIDDEN');
}
if (!publisher.includes("state: 'success'")) {
  throw new Error('ATOMIC_FINALIZATION_V2_SUCCESS_PUBLICATION_MISSING');
}
if (publisher.includes("state: 'failure'")) {
  throw new Error('ATOMIC_FINALIZATION_V2_FAILURE_STATUS_PUBLICATION_FORBIDDEN');
}
if (/\n\s*workflow_run:/.test(workflow)) {
  throw new Error('ATOMIC_FINALIZATION_V2_WORKFLOW_RUN_CONSUMER_FORBIDDEN');
}

console.log(JSON.stringify({
  id: 'kidults-atomic-terminal-recovery-finalization-v2-validation',
  state: 'VERIFIED_PASS',
  manifest_sha256: manifestDigest,
  correction_issue: manifest.correction_issue,
  prior_failed_finalization_run: priorFinalization.run_id,
  prior_failed_finalization_artifact: priorFinalization.evidence_artifact.id,
  run_name_single_source_contract: 'PASS',
  independent_workflow_generation: 'PASS',
  exact_owner_approval_v2: 'PASS',
  one_use_dispatch_v2: 'PASS',
  immutable_historical_terminal_red: 'PASS',
  immutable_prior_recovery_failure: 'PASS',
  append_only_raw_status_history: 'PASS',
  negative_cases_rejected: rejected.length,
  evidence_artifact_name_probe: expectedEvidenceArtifactName(7002),
  publication_artifact_name_probe: expectedPublicationArtifactName(7002),
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
