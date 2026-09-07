import {
  SHA40,
  SHA256,
  RECOVERY_CONTEXT,
  assert,
  normalizeSha256,
  statusesFor,
  validateManifest,
} from './atomic-terminal-recovery-v2-policy.mjs';

export const FINALIZATION_ID = 'kidults-atomic-terminal-recovery-finalization-v1';
export const FINALIZATION_CAUSE = 'PRODUCER_PUBLISHER_PREDECESSOR_SHAPE_MISMATCH';
export const FINALIZATION_WORKFLOW_PATH =
  '.github/workflows/kidults-current-sold-atomic-terminal-recovery-finalization-v1.yml';
export const FINALIZATION_EVIDENCE_ARTIFACT_PREFIX =
  'kidults-atomic-terminal-recovery-finalization-evidence-v1';
export const SOURCE_MANIFEST_PATH =
  'coordination/kidults/market/current-sold-atomic-terminal-recovery-33603816578-v2.json';
export const SOURCE_MANIFEST_DIGEST =
  'sha256:45251ea842208eca1df738c0e10faa9babb65058c99889cf7a40b9e5666f8bd2';
export const PRIOR_REMEDIATION_RUN_ID = 33621062695;
export const PRIOR_REMEDIATION_WORKFLOW_ID = 348289049;
export const PRIOR_REMEDIATION_WORKFLOW_PATH =
  '.github/workflows/kidults-current-sold-atomic-terminal-recovery-remediation-v1.yml';
export const PRIOR_REMEDIATION_HEAD_SHA =
  '23c98e1b04f4105cd3f3f0be5fc42c2e6302deef';
export const PRIOR_REMEDIATION_AUTHORIZATION_ID =
  'RECOVER-RUN-33603816578-23c98e1b04f4';
export const PRIOR_REMEDIATION_FAILURE_CODE =
  'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_PREDECESSOR_MISMATCH';
export const PRIOR_RECOVERY_FAILURE_STATUS_ID = 53372834946;

function exactArtifact(values, expected, code) {
  const artifacts = Array.isArray(values) ? values : [];
  const matches = artifacts.filter(item => Number(item?.id) === Number(expected?.id));
  assert(matches.length === 1, `${code}_CARDINALITY_INVALID`, String(matches.length));
  const artifact = matches[0];
  assert(artifact?.name === expected.name
    && normalizeSha256(artifact?.digest) === normalizeSha256(expected.digest)
    && artifact?.expired === false,
  `${code}_BINDING_INVALID`);
  return artifact;
}

export function expectedFinalizationEvidenceArtifactName(manifest, runId) {
  const generation = manifest?.finalization_generation;
  assert(generation?.evidence_artifact_name_prefix === FINALIZATION_EVIDENCE_ARTIFACT_PREFIX,
    'ATOMIC_RECOVERY_FINALIZATION_EVIDENCE_PREFIX_INVALID');
  assert(Number.isInteger(Number(runId)) && Number(runId) > 0,
    'ATOMIC_RECOVERY_FINALIZATION_RUN_ID_INVALID');
  return `${FINALIZATION_EVIDENCE_ARTIFACT_PREFIX}-${Number(runId)}-1`;
}

export function validateFinalizationManifest(manifest) {
  validateManifest(manifest);
  assert(manifest?.authorized_recovery_workflow_path === FINALIZATION_WORKFLOW_PATH,
    'ATOMIC_RECOVERY_FINALIZATION_WORKFLOW_PATH_INVALID');
  const generation = manifest?.finalization_generation;
  assert(generation?.id === FINALIZATION_ID
    && generation?.cause === FINALIZATION_CAUSE
    && generation?.evidence_artifact_name_prefix === FINALIZATION_EVIDENCE_ARTIFACT_PREFIX,
  'ATOMIC_RECOVERY_FINALIZATION_IDENTITY_INVALID');
  assert(generation?.source_manifest?.path === SOURCE_MANIFEST_PATH
    && generation?.source_manifest?.digest === SOURCE_MANIFEST_DIGEST,
  'ATOMIC_RECOVERY_FINALIZATION_SOURCE_MANIFEST_INVALID');

  const prior = generation?.prior_failed_remediation_run;
  assert(prior?.id === PRIOR_REMEDIATION_RUN_ID
    && prior?.attempt === 1
    && prior?.workflow_id === PRIOR_REMEDIATION_WORKFLOW_ID
    && prior?.workflow_path === PRIOR_REMEDIATION_WORKFLOW_PATH
    && prior?.head_sha === PRIOR_REMEDIATION_HEAD_SHA
    && SHA40.test(prior?.head_sha || '')
    && prior?.conclusion === 'failure'
    && prior?.authorization_id === PRIOR_REMEDIATION_AUTHORIZATION_ID
    && SHA256.test(prior?.authorization_id_sha256 || '')
    && Number.isInteger(prior?.approval_comment_id)
    && SHA256.test(prior?.approval_comment_body_digest || '')
    && prior?.publication_failure_code === PRIOR_REMEDIATION_FAILURE_CODE,
  'ATOMIC_RECOVERY_FINALIZATION_PRIOR_RUN_BINDING_INVALID');
  assert(typeof prior?.display_title === 'string'
    && prior.display_title ===
      `KIDULTS Atomic Terminal Recovery Run #33603816578 @ ${PRIOR_REMEDIATION_HEAD_SHA} / ${PRIOR_REMEDIATION_AUTHORIZATION_ID}`,
  'ATOMIC_RECOVERY_FINALIZATION_PRIOR_RUN_TITLE_INVALID');

  const evidence = prior?.evidence_artifact;
  assert(evidence?.id === 9842911193
    && evidence?.name ===
      'kidults-atomic-terminal-recovery-remediation-evidence-v1-33621062695-1'
    && SHA256.test(evidence?.digest || '')
    && SHA256.test(evidence?.evidence_receipt_sha256 || '')
    && SHA256.test(evidence?.preflight_receipt_sha256 || '')
    && SHA256.test(evidence?.terminal_receipt_sha256 || ''),
  'ATOMIC_RECOVERY_FINALIZATION_EVIDENCE_ARTIFACT_INVALID');
  const publication = prior?.publication_artifact;
  assert(publication?.id === 9842919682
    && publication?.name ===
      'kidults-atomic-terminal-recovery-remediation-publication-v1-33621062695-1'
    && SHA256.test(publication?.digest || '')
    && SHA256.test(publication?.publication_receipt_sha256 || ''),
  'ATOMIC_RECOVERY_FINALIZATION_PUBLICATION_ARTIFACT_INVALID');

  const failedStatus = prior?.recovery_failure_status;
  assert(failedStatus?.id === PRIOR_RECOVERY_FAILURE_STATUS_ID
    && failedStatus?.context === RECOVERY_CONTEXT
    && failedStatus?.state === 'failure'
    && failedStatus?.description === PRIOR_REMEDIATION_FAILURE_CODE
    && failedStatus?.target_url ===
      `https://github.com/${manifest.repository}/actions/runs/${PRIOR_REMEDIATION_RUN_ID}`
    && failedStatus?.created_at === '2026-09-02T10:45:29Z',
  'ATOMIC_RECOVERY_FINALIZATION_FAILURE_STATUS_INVALID');

  assert(generation?.fresh_owner_authority_required === true
    && generation?.prior_authorization_reuse_forbidden === true
    && generation?.prior_run_rerun_forbidden === true
    && generation?.prior_failure_status_immutable === true
    && generation?.single_new_workflow_generation_only === true,
  'ATOMIC_RECOVERY_FINALIZATION_AUTHORITY_POLICY_INVALID');
  assert(manifest?.public === 'HOLD'
    && manifest?.production === 'HOLD'
    && manifest?.g5 === 'HOLD',
  'ATOMIC_RECOVERY_FINALIZATION_HOLD_INVALID');
  return {generation, prior, evidence, publication, failedStatus};
}

export function validatePriorFailedRemediationRun(run, jobs, repositoryOwner, manifest) {
  const {prior} = validateFinalizationManifest(manifest);
  assert(Number(run?.id) === prior.id
    && Number(run?.run_attempt) === prior.attempt
    && Number(run?.workflow_id) === prior.workflow_id
    && run?.path === prior.workflow_path
    && run?.head_branch === 'main'
    && run?.head_sha === prior.head_sha
    && run?.event === 'workflow_dispatch'
    && run?.status === 'completed'
    && run?.conclusion === prior.conclusion
    && run?.display_title === prior.display_title,
  'ATOMIC_RECOVERY_FINALIZATION_PRIOR_RUN_STATE_INVALID');
  assert(run?.actor?.login === repositoryOwner
    && run?.triggering_actor?.login === repositoryOwner,
  'ATOMIC_RECOVERY_FINALIZATION_PRIOR_RUN_ACTOR_INVALID');
  const values = Array.isArray(jobs?.jobs) ? jobs.jobs : [];
  const validation = values.filter(job =>
    job?.name === 'Validate failed-run binding and corrected recovery runtime');
  const reconciliation = values.filter(job =>
    job?.name === 'Reconcile predecessor evidence without status-write authority');
  const publication = values.filter(job =>
    job?.name === 'Publish distinct recovery status from sealed evidence');
  assert(validation.length === 1 && validation[0]?.conclusion === 'skipped',
    'ATOMIC_RECOVERY_FINALIZATION_PRIOR_VALIDATION_JOB_INVALID');
  assert(reconciliation.length === 1 && reconciliation[0]?.conclusion === 'success',
    'ATOMIC_RECOVERY_FINALIZATION_PRIOR_RECONCILIATION_JOB_INVALID');
  assert(publication.length === 1 && publication[0]?.conclusion === 'failure',
    'ATOMIC_RECOVERY_FINALIZATION_PRIOR_PUBLICATION_JOB_INVALID');
  return prior;
}

export function validatePriorFailedRemediationArtifacts(artifacts, manifest) {
  const {evidence, publication} = validateFinalizationManifest(manifest);
  const values = Array.isArray(artifacts) ? artifacts : [];
  assert(values.length === 2,
    'ATOMIC_RECOVERY_FINALIZATION_PRIOR_ARTIFACT_CARDINALITY_INVALID', String(values.length));
  return {
    evidence: exactArtifact(values, evidence, 'ATOMIC_RECOVERY_FINALIZATION_EVIDENCE_ARTIFACT'),
    publication: exactArtifact(values, publication,
      'ATOMIC_RECOVERY_FINALIZATION_PUBLICATION_ARTIFACT'),
  };
}

export function validatePriorRemediationEvidenceReceipt(receipt, manifest, repositoryOwner) {
  const {prior, evidence} = validateFinalizationManifest(manifest);
  const predecessor = receipt?.predecessor_atomic_run;
  assert(receipt?.id === 'kidults-atomic-terminal-recovery-evidence-receipt-v2'
    && receipt?.version === '2.0.0'
    && receipt?.state === 'VERIFIED_PASS'
    && receipt?.failure_code == null,
  'ATOMIC_RECOVERY_FINALIZATION_SOURCE_EVIDENCE_STATE_INVALID');
  assert(receipt?.repository === manifest.repository
    && Number(receipt?.predecessor_pull_request) === manifest.predecessor_pull_request.number
    && predecessor != null && typeof predecessor === 'object' && !Array.isArray(predecessor)
    && Number(predecessor?.id) === manifest.atomic_run.id
    && Number(predecessor?.attempt) === manifest.atomic_run.attempt
    && predecessor?.conclusion === manifest.atomic_run.expected_conclusion
    && predecessor?.actor === repositoryOwner
    && receipt?.predecessor_merge_sha === manifest.predecessor_pull_request.merge_commit_sha,
  'ATOMIC_RECOVERY_FINALIZATION_SOURCE_EVIDENCE_PREDECESSOR_INVALID');
  assert(receipt?.exact_current_main_sha === prior.head_sha
    && receipt?.recovery_manifest_sha256 === SOURCE_MANIFEST_DIGEST
    && Number(receipt?.recovery_workflow_run_id) === prior.id
    && Number(receipt?.recovery_workflow_run_attempt) === prior.attempt
    && receipt?.authorization_id_sha256 === prior.authorization_id_sha256,
  'ATOMIC_RECOVERY_FINALIZATION_SOURCE_EVIDENCE_GENERATION_INVALID');
  assert(receipt?.approval?.comment_id === prior.approval_comment_id
    && receipt?.approval?.comment_body_digest === prior.approval_comment_body_digest
    && receipt?.approval?.actor === repositoryOwner,
  'ATOMIC_RECOVERY_FINALIZATION_SOURCE_EVIDENCE_APPROVAL_INVALID');
  assert(receipt?.one_use_dispatch?.run_id === prior.id
    && receipt?.one_use_dispatch?.run_attempt === prior.attempt
    && receipt?.one_use_dispatch?.workflow_id === prior.workflow_id
    && receipt?.one_use_dispatch?.matching_run_count === 1
    && receipt?.one_use_dispatch?.incident_run_count === 1,
  'ATOMIC_RECOVERY_FINALIZATION_SOURCE_EVIDENCE_ONE_USE_INVALID');
  assert(receipt?.historical_terminal_status?.id === manifest.historical_terminal_status.id
    && receipt?.historical_terminal_status?.immutable === true
    && receipt?.recovery_status_before?.prior_status_count === 0,
  'ATOMIC_RECOVERY_FINALIZATION_SOURCE_EVIDENCE_STATUS_BOUNDARY_INVALID');
  assert(receipt?.postlanding_proof?.state === 'VERIFIED_PASS'
    && receipt?.postlanding_proof?.tests_passed === 56
    && receipt?.postlanding_proof?.tests_failed === 0
    && receipt?.classifier?.result === 'PASS'
    && receipt?.classifier?.matcher_surfaces_verified === 3,
  'ATOMIC_RECOVERY_FINALIZATION_SOURCE_EVIDENCE_PROOF_INVALID');
  assert(receipt?.status_write_authority === false
    && receipt?.status_write_performed === false
    && receipt?.historical_terminal_context_mutated === false
    && receipt?.merge_reexecuted === false
    && receipt?.landing_authorization_reused === false,
  'ATOMIC_RECOVERY_FINALIZATION_SOURCE_EVIDENCE_BOUNDARY_INVALID');
  assert(evidence?.evidence_receipt_sha256
    === 'sha256:4c4c5a658fc50186e222a8692e47b25832702426e6b0bf13680b31922deb77e5',
  'ATOMIC_RECOVERY_FINALIZATION_SOURCE_EVIDENCE_DIGEST_INVALID');
  return receipt;
}

export function validatePriorRemediationPublicationReceipt(receipt, manifest) {
  const {prior, publication} = validateFinalizationManifest(manifest);
  assert(receipt?.id === 'kidults-atomic-terminal-recovery-publication-receipt-v2'
    && receipt?.version === '2.0.0'
    && receipt?.state === 'VERIFIED_FAIL'
    && receipt?.failure_code === prior.publication_failure_code,
  'ATOMIC_RECOVERY_FINALIZATION_SOURCE_PUBLICATION_STATE_INVALID');
  assert(receipt?.repository === manifest.repository
    && Number(receipt?.predecessor_pull_request) === manifest.predecessor_pull_request.number
    && Number(receipt?.predecessor_atomic_run) === manifest.atomic_run.id
    && receipt?.predecessor_merge_sha === manifest.predecessor_pull_request.merge_commit_sha
    && receipt?.exact_current_main_sha === prior.head_sha
    && receipt?.recovery_manifest_sha256 === SOURCE_MANIFEST_DIGEST
    && Number(receipt?.recovery_workflow_run_id) === prior.id
    && Number(receipt?.recovery_workflow_run_attempt) === prior.attempt
    && receipt?.authorization_id_sha256 === prior.authorization_id_sha256,
  'ATOMIC_RECOVERY_FINALIZATION_SOURCE_PUBLICATION_TUPLE_INVALID');
  assert(receipt?.status_write_authority_established === true
    && receipt?.distinct_recovery_failure_status_attempted === true
    && Number(receipt?.distinct_recovery_failure_status_http_status) === 201
    && receipt?.historical_terminal_context_mutated === false
    && receipt?.merge_reexecuted === false
    && receipt?.landing_authorization_reused === false,
  'ATOMIC_RECOVERY_FINALIZATION_SOURCE_PUBLICATION_BOUNDARY_INVALID');
  assert(publication?.publication_receipt_sha256
    === 'sha256:5821656c57ddb6d84daacf45da6d9c1018f3a21dc78278a17c06d185b2cdb08e',
  'ATOMIC_RECOVERY_FINALIZATION_SOURCE_PUBLICATION_DIGEST_INVALID');
  return receipt;
}

export function assertPriorRecoveryFailureImmutable(statusPayload, manifest) {
  const {failedStatus} = validateFinalizationManifest(manifest);
  const entries = statusesFor(statusPayload, RECOVERY_CONTEXT);
  assert(entries.length === 1,
    'ATOMIC_RECOVERY_FINALIZATION_PRIOR_STATUS_CARDINALITY_INVALID', String(entries.length));
  const observed = entries[0];
  assert(Number(observed?.id) === failedStatus.id
    && observed?.state === failedStatus.state
    && observed?.description === failedStatus.description
    && observed?.target_url === failedStatus.target_url
    && observed?.created_at === failedStatus.created_at,
  'ATOMIC_RECOVERY_FINALIZATION_PRIOR_STATUS_DRIFT');
  return {
    id: failedStatus.id,
    context: RECOVERY_CONTEXT,
    state: 'failure',
    immutable: true,
    prior_status_count: 1,
  };
}

export function assertFinalizedRecoveryReadback(statusHistory, publishedId, runId, manifest) {
  const {failedStatus} = validateFinalizationManifest(manifest);
  assert(Array.isArray(statusHistory),
    'ATOMIC_RECOVERY_FINALIZATION_RAW_HISTORY_SHAPE_INVALID');
  const entries = statusesFor({statuses: statusHistory}, RECOVERY_CONTEXT);
  assert(entries.length === 2,
    'ATOMIC_RECOVERY_FINALIZATION_STATUS_CARDINALITY_INVALID', String(entries.length));
  const prior = entries.find(item => Number(item?.id) === failedStatus.id);
  assert(prior
    && prior.state === failedStatus.state
    && prior.description === failedStatus.description
    && prior.target_url === failedStatus.target_url
    && prior.created_at === failedStatus.created_at,
  'ATOMIC_RECOVERY_FINALIZATION_PRIOR_STATUS_OVERWRITTEN');
  const latest = entries[0];
  assert(Number(latest?.id) === Number(publishedId)
    && Number(latest?.id) !== failedStatus.id
    && latest?.state === 'success',
  'ATOMIC_RECOVERY_FINALIZATION_SUCCESS_STATUS_INVALID');
  assert(latest?.description === 'Recovered evidence verified; original terminal RED preserved',
    'ATOMIC_RECOVERY_FINALIZATION_SUCCESS_DESCRIPTION_INVALID');
  assert(String(latest?.target_url || '').endsWith(`/actions/runs/${runId}`),
    'ATOMIC_RECOVERY_FINALIZATION_SUCCESS_TARGET_INVALID');
  return {prior, latest};
}
