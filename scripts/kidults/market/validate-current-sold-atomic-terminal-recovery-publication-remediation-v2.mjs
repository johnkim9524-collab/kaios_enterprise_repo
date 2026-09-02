#!/usr/bin/env node
import fs from 'node:fs';
import {RECOVERY_CONTEXT, assert, sha256, validateManifest}
  from './atomic-terminal-recovery-v2-runtime.mjs';
import {
  PRIOR_FAILED_RUN_ID, PRIOR_FAILED_WORKFLOW_ID, PRIOR_FAILED_WORKFLOW_PATH,
  PRIOR_FAILED_MAIN_SHA, PRIOR_FAILURE_CODE, PRIOR_RECOVERY_FAILURE_STATUS_ID,
  PRIOR_APPROVAL_COMMENT_ID, PRIOR_APPROVAL_CREATED_AT, PRIOR_APPROVAL_BODY_DIGEST,
  SOURCE_RECOVERY_MANIFEST_DIGEST, RECOVERY_SUCCESS_DESCRIPTION,
  PUBLICATION_REMEDIATION_WORKFLOW_PATH, PUBLICATION_REMEDIATION_PREFLIGHT_ARTIFACT_PREFIX,
  expectedPublicationRemediationArtifactName, validatePublicationRemediationManifest,
  validatePriorFailedRemediationRun, validatePriorArtifacts,
  assertPriorRecoveryFailureBoundary, assertRecoverySuccessAfterPriorFailure,
} from './atomic-terminal-recovery-publication-remediation-v2-policy.mjs';
import {
  assertPriorEvidenceReceipt, assertPriorPreflightReceipt, assertPriorTerminalReceipt,
  assertPriorPublicationFailureReceipt, assertCurrentPreflightReceipt,
} from './atomic-terminal-recovery-publication-remediation-v2-receipts.mjs';

const manifestPath = process.argv[2]
  || 'coordination/kidults/market/current-sold-atomic-terminal-recovery-33603816578-publication-remediation-v2.json';
const workflowPath = process.argv[3]
  || '.github/workflows/kidults-current-sold-atomic-terminal-recovery-publication-remediation-v2.yml';
const bytes = fs.readFileSync(manifestPath);
const manifest = validateManifest(JSON.parse(bytes.toString('utf8')));
const manifestDigest = sha256(bytes);
const {prior, evidence, publication, status} = validatePublicationRemediationManifest(manifest);
const owner = 'johnkim9524-collab';
const reject = (label, code, fn) => {
  let observed = '';
  try { fn(); } catch (error) { observed = String(error?.code || error?.message || ''); }
  if (!observed.startsWith(code)) throw new Error(`${label}:${observed || 'NO_REJECTION'}`);
  return label;
};

const priorRun = {
  id: PRIOR_FAILED_RUN_ID, run_attempt: 1, workflow_id: PRIOR_FAILED_WORKFLOW_ID,
  path: PRIOR_FAILED_WORKFLOW_PATH, head_branch: 'main', head_sha: PRIOR_FAILED_MAIN_SHA,
  event: 'workflow_dispatch', status: 'completed', conclusion: 'failure',
  display_title: prior.display_title, created_at: prior.created_at,
  actor: {login: owner}, triggering_actor: {login: owner},
};
const priorJobs = {jobs: [
  {name: 'Reconcile predecessor evidence without status-write authority', conclusion: 'success'},
  {name: 'Publish distinct recovery status from sealed evidence', conclusion: 'failure'},
]};
const priorArtifacts = [evidence, publication].map(x => ({
  id: x.id, name: x.name, digest: x.digest, expired: false,
  workflow_run: {id: PRIOR_FAILED_RUN_ID, head_sha: PRIOR_FAILED_MAIN_SHA},
}));
validatePriorFailedRemediationRun(priorRun, priorJobs, owner, manifest);
validatePriorArtifacts(priorArtifacts, manifest);

const evidenceReceipt = {
  id: 'kidults-atomic-terminal-recovery-evidence-receipt-v2', version: '2.0.0',
  state: 'VERIFIED_PASS', failure_code: null, repository: manifest.repository,
  predecessor_pull_request: manifest.predecessor_pull_request.number,
  predecessor_atomic_run: {id: manifest.atomic_run.id, attempt: manifest.atomic_run.attempt,
    conclusion: manifest.atomic_run.expected_conclusion, actor: owner},
  predecessor_merge_sha: manifest.predecessor_pull_request.merge_commit_sha,
  exact_current_main_sha: prior.head_sha, recovery_manifest_sha256: SOURCE_RECOVERY_MANIFEST_DIGEST,
  recovery_workflow_run_id: prior.id, recovery_workflow_run_attempt: 1,
  authorization_id_sha256: prior.authorization_id_sha256,
  approval: {comment_id: PRIOR_APPROVAL_COMMENT_ID, comment_created_at: PRIOR_APPROVAL_CREATED_AT,
    comment_body_digest: PRIOR_APPROVAL_BODY_DIGEST, actor: owner, app_mediated: false, edited: false},
  one_use_dispatch: {run_id: prior.id, run_attempt: 1, workflow_id: prior.workflow_id,
    dispatch_actor: owner, triggering_actor: owner, matching_run_count: 1, incident_run_count: 1},
  historical_terminal_status: {id: manifest.historical_terminal_status.id, immutable: true},
  recovery_status_before: {prior_status_count: 0},
  exact_merge: {sha: manifest.predecessor_pull_request.merge_commit_sha,
    tree_sha: manifest.predecessor_pull_request.merge_tree_sha,
    parents: [manifest.predecessor_pull_request.exact_base_sha,
      manifest.predecessor_pull_request.exact_head_sha], current_main_descends_from_merge: true},
  postlanding_proof: {state: 'VERIFIED_PASS', tests_passed: 56, tests_failed: 0,
    artifact_id: manifest.postlanding_artifact.id, artifact_digest: manifest.postlanding_artifact.digest},
  failed_terminal_evidence: {state: 'VERIFIED_FAIL',
    failure_class: manifest.historical_terminal_status.description,
    artifact_id: manifest.failed_terminal_artifact.id,
    artifact_digest: manifest.failed_terminal_artifact.digest},
  classifier: {result: 'PASS', matcher_surfaces_verified: 3, findings: []},
  status_write_authority: false, status_write_performed: false,
  historical_terminal_context_mutated: false, merge_reexecuted: false,
  landing_authorization_reused: false, provider_calls: 0, postgres_rows_written: 0,
  deployment: false, empirical_authority_created: false,
  public: 'HOLD', production: 'HOLD', g5: 'HOLD',
};
assertPriorEvidenceReceipt(evidenceReceipt, manifest, owner);
assertPriorPreflightReceipt({
  id: 'kidults-atomic-terminal-recovery-remediation-preflight-receipt-v1',
  state: 'VERIFIED_PASS', failure_code: null, repository: manifest.repository,
  predecessor_pull_request: manifest.predecessor_pull_request.number,
  predecessor_atomic_run: manifest.atomic_run.id,
  predecessor_merge_sha: manifest.predecessor_pull_request.merge_commit_sha,
  exact_current_main_sha: prior.head_sha, recovery_manifest_sha256: SOURCE_RECOVERY_MANIFEST_DIGEST,
  recovery_workflow_run_id: prior.id, recovery_workflow_run_attempt: 1,
  authorization_id_sha256: prior.authorization_id_sha256,
  status_write_authority: false, status_write_performed: false,
  prior_authorization_reused: false, prior_run_rerun_performed: false,
}, manifest);
assertPriorTerminalReceipt({
  id: 'kidults-atomic-terminal-recovery-remediation-terminal-receipt-v1',
  state: 'VERIFIED_PASS', failure_code: null, repository: manifest.repository,
  exact_current_main_sha: prior.head_sha, workflow_run_id: prior.id, workflow_run_attempt: 1,
  outcomes: {preflight: 'success', runtime_regressions: 'success', reconcile: 'success'},
  status_write_authority: false, status_write_performed: false,
  prior_authorization_reused: false, prior_run_rerun_performed: false,
  promotion_eligible: false, public: 'HOLD', production: 'HOLD', g5: 'HOLD',
}, manifest);
assertPriorPublicationFailureReceipt({
  id: 'kidults-atomic-terminal-recovery-publication-receipt-v2',
  state: 'VERIFIED_FAIL', failure_code: PRIOR_FAILURE_CODE, repository: manifest.repository,
  predecessor_pull_request: manifest.predecessor_pull_request.number,
  predecessor_atomic_run: manifest.atomic_run.id,
  predecessor_merge_sha: manifest.predecessor_pull_request.merge_commit_sha,
  exact_current_main_sha: prior.head_sha, recovery_manifest_sha256: SOURCE_RECOVERY_MANIFEST_DIGEST,
  recovery_workflow_run_id: prior.id, recovery_workflow_run_attempt: 1,
  authorization_id_sha256: prior.authorization_id_sha256,
  status_write_authority_established: true, distinct_recovery_failure_status_attempted: true,
  distinct_recovery_failure_status_http_status: 201,
  historical_terminal_context_mutated: false, merge_reexecuted: false,
  landing_authorization_reused: false, provider_calls: 0, postgres_rows_written: 0,
  deployment: false, empirical_authority_created: false,
  public: 'HOLD', production: 'HOLD', g5: 'HOLD',
}, manifest);

const historical = {...manifest.historical_terminal_status};
const failure = {...status};
assertPriorRecoveryFailureBoundary({statuses: [historical, failure]}, manifest);
const success = {id: 53380000001, context: RECOVERY_CONTEXT, state: 'success',
  description: RECOVERY_SUCCESS_DESCRIPTION,
  target_url: 'https://github.com/johnkim9524-collab/kaios_enterprise_repo/actions/runs/8001',
  created_at: '2026-09-02T11:45:00Z'};
assertRecoverySuccessAfterPriorFailure({statuses: [historical, failure, success]},
  manifest, success.id, 8001);

const current = {
  manifest, currentMainInput: '2'.repeat(40), manifestDigest, runId: '8001',
  authorizationId: `RECOVER-RUN-33603816578-${'2'.repeat(12)}`, repositoryOwner: owner,
  approval: {comment_id: 9001, comment_body_digest: `sha256:${'3'.repeat(64)}`, actor: owner},
  oneUse: {run_id: 8001, run_attempt: 1, workflow_id: 9999, dispatch_actor: owner,
    triggering_actor: owner, matching_run_count: 1, incident_run_count: 1},
};
const currentReceipt = {
  id: 'kidults-atomic-terminal-recovery-publication-remediation-preflight-receipt-v2',
  version: '2.0.0', state: 'VERIFIED_PASS', failure_code: null,
  repository: manifest.repository, predecessor_pull_request: manifest.predecessor_pull_request.number,
  predecessor_atomic_run: manifest.atomic_run.id,
  predecessor_merge_sha: manifest.predecessor_pull_request.merge_commit_sha,
  exact_current_main_sha: current.currentMainInput, recovery_manifest_sha256: manifestDigest,
  recovery_workflow_run_id: 8001, recovery_workflow_run_attempt: 1,
  authorization_id_sha256: sha256(current.authorizationId), approval: current.approval,
  one_use_dispatch: current.oneUse,
  prior_failed_recovery: {run_id: prior.id, evidence_artifact_id: evidence.id,
    publication_artifact_id: publication.id, failure_status_id: status.id,
    failure_code: PRIOR_FAILURE_CODE, evidence_receipt_sha256: evidence.evidence_receipt_sha256,
    publication_receipt_sha256: publication.publication_receipt_sha256},
  historical_terminal_status: {id: manifest.historical_terminal_status.id, immutable: true},
  prior_recovery_failure_status: {id: status.id, immutable: true},
  status_write_authority: false, status_write_performed: false,
  failure_status_write_forbidden: true, prior_authorization_reused: false,
  prior_run_rerun_performed: false,
};
assertCurrentPreflightReceipt(currentReceipt, current);

const rejected = [];
rejected.push(reject('scalar predecessor',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_EVIDENCE_PREDECESSOR_INVALID',
  () => assertPriorEvidenceReceipt({...evidenceReceipt,
    predecessor_atomic_run: manifest.atomic_run.id}, manifest, owner)));
rejected.push(reject('predecessor attempt drift',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_EVIDENCE_PREDECESSOR_INVALID',
  () => assertPriorEvidenceReceipt({...evidenceReceipt, predecessor_atomic_run:
    {...evidenceReceipt.predecessor_atomic_run, attempt: 2}}, manifest, owner)));
rejected.push(reject('missing failure status',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_STATUS_CARDINALITY_INVALID',
  () => assertPriorRecoveryFailureBoundary({statuses: [historical]}, manifest)));
rejected.push(reject('duplicate failure status',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_STATUS_CARDINALITY_INVALID',
  () => assertPriorRecoveryFailureBoundary({statuses: [historical, failure,
    {...failure, id: failure.id + 1}]}, manifest)));
rejected.push(reject('failure status drift',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_STATUS_DRIFT',
  () => assertPriorRecoveryFailureBoundary({statuses: [historical,
    {...failure, description: 'DRIFT'}]}, manifest)));
rejected.push(reject('success cardinality drift',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_SUCCESS_CARDINALITY_INVALID',
  () => assertRecoverySuccessAfterPriorFailure({statuses: [historical, failure]},
    manifest, success.id, 8001)));
rejected.push(reject('prior rerun',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_FAILED_RUN_STATE_INVALID',
  () => validatePriorFailedRemediationRun({...priorRun, run_attempt: 2},
    priorJobs, owner, manifest)));
rejected.push(reject('artifact multiplicity',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_ARTIFACT_CARDINALITY_INVALID',
  () => validatePriorArtifacts([...priorArtifacts, {...priorArtifacts[0], id: 1}], manifest)));
rejected.push(reject('preflight claimed write',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PREFLIGHT_BOUNDARY_INVALID',
  () => assertCurrentPreflightReceipt({...currentReceipt, status_write_performed: true}, current)));

const workflow = fs.readFileSync(workflowPath, 'utf8');
const preflight = fs.readFileSync(new URL(
  './current-sold-atomic-terminal-recovery-publication-remediation-v2-preflight.mjs',
  import.meta.url), 'utf8');
const publisher = fs.readFileSync(new URL(
  './current-sold-atomic-terminal-recovery-publication-remediation-v2-publish.mjs',
  import.meta.url), 'utf8');
const generic = fs.readFileSync(new URL(
  './current-sold-atomic-terminal-recovery-v2-publish.mjs', import.meta.url), 'utf8');
const legacy = fs.readFileSync(new URL(
  './validate-current-sold-atomic-terminal-recovery-remediation-v1.mjs', import.meta.url), 'utf8');
const has = (text, marker, code) => { if (!text.includes(marker)) throw new Error(code); };
has(workflow, 'name: KIDULTS Current-SOLD Atomic Terminal Recovery Publication Remediation V2', 'WORKFLOW_NAME');
has(workflow, 'workflow_dispatch:', 'DISPATCH');
has(workflow, 'group: kidults-atomic-governed-landing-v1-main', 'SERIALIZATION');
has(workflow, 'run-id: 33621062695', 'PRIOR_RUN_DOWNLOAD');
has(workflow, 'statuses: read', 'READ_PERMISSION');
has(workflow, 'statuses: write', 'WRITE_PERMISSION');
has(workflow, PUBLICATION_REMEDIATION_PREFLIGHT_ARTIFACT_PREFIX, 'ARTIFACT_PREFIX');
has(preflight, 'failure_status_write_attempted: false', 'PREFLIGHT_NO_FAILURE_WRITE');
has(publisher, 'assertRecoverySuccessAfterPriorFailure', 'SUCCESS_READBACK');
has(publisher, 'failure_status_write_attempted: false', 'PUBLISH_NO_FAILURE_WRITE');
has(generic, "typeof predecessorRun === 'object'", 'GENERIC_OBJECT_GUARD');
has(generic, 'failure_status_write_forbidden: true', 'GENERIC_NO_FAILURE_WRITE');
has(legacy, 'publication predecessor scalar substitution', 'LEGACY_REGRESSION');
if (/\n\s*workflow_run:/.test(workflow)) throw new Error('WORKFLOW_RUN_FORBIDDEN');
const ro = workflow.slice(workflow.indexOf('preflight-sealed-prior-evidence:'),
  workflow.indexOf('publish-one-recovery-success-status:'));
if (/statuses:\s*write/.test(ro)) throw new Error('PREFLIGHT_WRITE_PERMISSION');
const catchBlock = publisher.slice(publisher.lastIndexOf('} catch (error) {'));
if (catchBlock.includes("method: 'POST'") || catchBlock.includes('statuses: write'))
  throw new Error('CATCH_WRITE_PATH');
if (generic.includes("state: 'failure', context: RECOVERY_CONTEXT"))
  throw new Error('GENERIC_FAILURE_STATUS_WRITE');
assert(manifest.authorized_recovery_workflow_path === PUBLICATION_REMEDIATION_WORKFLOW_PATH,
  'MANIFEST_WORKFLOW_BINDING');
assert(expectedPublicationRemediationArtifactName(8001)
  === `${PUBLICATION_REMEDIATION_PREFLIGHT_ARTIFACT_PREFIX}-8001-1`, 'ARTIFACT_NAME');

console.log(JSON.stringify({
  id: 'kidults-atomic-terminal-recovery-publication-remediation-v2-validation',
  version: '2.0.0', state: 'VERIFIED_PASS', manifest_sha256: manifestDigest,
  prior_failed_run_id: PRIOR_FAILED_RUN_ID,
  prior_failure_status_id: PRIOR_RECOVERY_FAILURE_STATUS_ID,
  evidence_object_contract: 'PASS', scalar_contract_rejected: true,
  prior_failure_status_immutable: true, same_context_single_success_append: true,
  failure_status_write_forbidden: true, read_only_preflight_separated: true,
  sealed_current_run_artifact_required: true, negative_cases_rejected: rejected.length,
  authorized_workflow_path: PUBLICATION_REMEDIATION_WORKFLOW_PATH,
  public: 'HOLD', production: 'HOLD', g5: 'HOLD',
}, null, 2));
