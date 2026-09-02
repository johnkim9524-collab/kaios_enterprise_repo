import {
  assert,
  sha256,
} from './atomic-terminal-recovery-v2-runtime.mjs';
import {
  PRIOR_FAILURE_CODE,
  SOURCE_RECOVERY_MANIFEST_DIGEST,
  validatePublicationRemediationManifest,
} from './atomic-terminal-recovery-publication-remediation-v2-policy.mjs';

export function assertPriorEvidenceReceipt(r, manifest, owner) {
  const {prior} = validatePublicationRemediationManifest(manifest);
  const run = r?.predecessor_atomic_run;
  assert(r?.id === 'kidults-atomic-terminal-recovery-evidence-receipt-v2'
    && r?.version === '2.0.0' && r?.state === 'VERIFIED_PASS' && r?.failure_code == null,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_EVIDENCE_STATE_INVALID');
  assert(r?.repository === manifest.repository
    && Number(r?.predecessor_pull_request) === manifest.predecessor_pull_request.number
    && run && typeof run === 'object' && !Array.isArray(run)
    && Number(run?.id) === manifest.atomic_run.id
    && Number(run?.attempt) === manifest.atomic_run.attempt
    && run?.conclusion === manifest.atomic_run.expected_conclusion
    && run?.actor === owner
    && r?.predecessor_merge_sha === manifest.predecessor_pull_request.merge_commit_sha,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_EVIDENCE_PREDECESSOR_INVALID');
  assert(r?.exact_current_main_sha === prior.head_sha
    && r?.recovery_manifest_sha256 === SOURCE_RECOVERY_MANIFEST_DIGEST
    && Number(r?.recovery_workflow_run_id) === prior.id
    && Number(r?.recovery_workflow_run_attempt) === prior.attempt
    && r?.authorization_id_sha256 === prior.authorization_id_sha256,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_EVIDENCE_GENERATION_INVALID');
  assert(r?.approval?.comment_id === prior.approval.comment_id
    && r?.approval?.comment_created_at === prior.approval.comment_created_at
    && r?.approval?.comment_body_digest === prior.approval.comment_body_digest
    && r?.approval?.actor === owner && r?.approval?.app_mediated === false
    && r?.approval?.edited === false,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_EVIDENCE_APPROVAL_INVALID');
  assert(Number(r?.one_use_dispatch?.run_id) === prior.id
    && Number(r?.one_use_dispatch?.run_attempt) === prior.attempt
    && Number(r?.one_use_dispatch?.workflow_id) === prior.workflow_id
    && r?.one_use_dispatch?.dispatch_actor === prior.one_use_dispatch.dispatch_actor
    && r?.one_use_dispatch?.triggering_actor === prior.one_use_dispatch.triggering_actor
    && r?.one_use_dispatch?.matching_run_count === 1
    && r?.one_use_dispatch?.incident_run_count === 1,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_EVIDENCE_ONE_USE_INVALID');
  assert(r?.historical_terminal_status?.id === manifest.historical_terminal_status.id
    && r?.historical_terminal_status?.immutable === true
    && r?.recovery_status_before?.prior_status_count === 0,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_EVIDENCE_STATUS_BOUNDARY_INVALID');
  assert(r?.exact_merge?.sha === manifest.predecessor_pull_request.merge_commit_sha
    && r?.exact_merge?.tree_sha === manifest.predecessor_pull_request.merge_tree_sha
    && r?.exact_merge?.parents?.[0] === manifest.predecessor_pull_request.exact_base_sha
    && r?.exact_merge?.parents?.[1] === manifest.predecessor_pull_request.exact_head_sha
    && r?.exact_merge?.current_main_descends_from_merge === true,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_EVIDENCE_MERGE_INVALID');
  assert(r?.postlanding_proof?.state === 'VERIFIED_PASS'
    && r?.postlanding_proof?.tests_passed === 56 && r?.postlanding_proof?.tests_failed === 0
    && r?.postlanding_proof?.artifact_id === manifest.postlanding_artifact.id
    && r?.postlanding_proof?.artifact_digest === manifest.postlanding_artifact.digest
    && r?.failed_terminal_evidence?.state === 'VERIFIED_FAIL'
    && r?.failed_terminal_evidence?.failure_class === manifest.historical_terminal_status.description
    && r?.failed_terminal_evidence?.artifact_id === manifest.failed_terminal_artifact.id
    && r?.failed_terminal_evidence?.artifact_digest === manifest.failed_terminal_artifact.digest
    && r?.classifier?.result === 'PASS' && r?.classifier?.matcher_surfaces_verified === 3
    && Array.isArray(r?.classifier?.findings) && r.classifier.findings.length === 0,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_EVIDENCE_PROOF_INVALID');
  assert(r?.status_write_authority === false && r?.status_write_performed === false
    && r?.historical_terminal_context_mutated === false && r?.merge_reexecuted === false
    && r?.landing_authorization_reused === false && r?.provider_calls === 0
    && r?.postgres_rows_written === 0 && r?.deployment === false
    && r?.empirical_authority_created === false
    && r?.public === 'HOLD' && r?.production === 'HOLD' && r?.g5 === 'HOLD',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_EVIDENCE_BOUNDARY_INVALID');
  return r;
}

export function assertPriorPreflightReceipt(r, manifest) {
  const {prior} = validatePublicationRemediationManifest(manifest);
  assert(r?.id === 'kidults-atomic-terminal-recovery-remediation-preflight-receipt-v1'
    && r?.state === 'VERIFIED_PASS' && r?.failure_code == null
    && r?.repository === manifest.repository
    && Number(r?.predecessor_pull_request) === manifest.predecessor_pull_request.number
    && Number(r?.predecessor_atomic_run) === manifest.atomic_run.id
    && r?.predecessor_merge_sha === manifest.predecessor_pull_request.merge_commit_sha
    && r?.exact_current_main_sha === prior.head_sha
    && r?.recovery_manifest_sha256 === SOURCE_RECOVERY_MANIFEST_DIGEST
    && Number(r?.recovery_workflow_run_id) === prior.id
    && Number(r?.recovery_workflow_run_attempt) === prior.attempt
    && r?.authorization_id_sha256 === prior.authorization_id_sha256
    && r?.status_write_authority === false && r?.status_write_performed === false
    && r?.prior_authorization_reused === false && r?.prior_run_rerun_performed === false,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PRIOR_PREFLIGHT_INVALID');
  return r;
}

export function assertPriorTerminalReceipt(r, manifest) {
  const {prior} = validatePublicationRemediationManifest(manifest);
  assert(r?.id === 'kidults-atomic-terminal-recovery-remediation-terminal-receipt-v1'
    && r?.state === 'VERIFIED_PASS' && r?.failure_code == null
    && r?.repository === manifest.repository && r?.exact_current_main_sha === prior.head_sha
    && Number(r?.workflow_run_id) === prior.id && Number(r?.workflow_run_attempt) === 1
    && r?.outcomes?.preflight === 'success' && r?.outcomes?.runtime_regressions === 'success'
    && r?.outcomes?.reconcile === 'success'
    && r?.status_write_authority === false && r?.status_write_performed === false
    && r?.prior_authorization_reused === false && r?.prior_run_rerun_performed === false
    && r?.promotion_eligible === false
    && r?.public === 'HOLD' && r?.production === 'HOLD' && r?.g5 === 'HOLD',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PRIOR_TERMINAL_INVALID');
  return r;
}

export function assertPriorPublicationFailureReceipt(r, manifest) {
  const {prior} = validatePublicationRemediationManifest(manifest);
  assert(r?.id === 'kidults-atomic-terminal-recovery-publication-receipt-v2'
    && r?.state === 'VERIFIED_FAIL' && r?.failure_code === PRIOR_FAILURE_CODE
    && r?.repository === manifest.repository
    && Number(r?.predecessor_pull_request) === manifest.predecessor_pull_request.number
    && Number(r?.predecessor_atomic_run) === manifest.atomic_run.id
    && r?.predecessor_merge_sha === manifest.predecessor_pull_request.merge_commit_sha
    && r?.exact_current_main_sha === prior.head_sha
    && r?.recovery_manifest_sha256 === SOURCE_RECOVERY_MANIFEST_DIGEST
    && Number(r?.recovery_workflow_run_id) === prior.id
    && Number(r?.recovery_workflow_run_attempt) === prior.attempt
    && r?.authorization_id_sha256 === prior.authorization_id_sha256
    && r?.status_write_authority_established === true
    && r?.distinct_recovery_failure_status_attempted === true
    && r?.distinct_recovery_failure_status_http_status === 201
    && r?.historical_terminal_context_mutated === false && r?.merge_reexecuted === false
    && r?.landing_authorization_reused === false && r?.provider_calls === 0
    && r?.postgres_rows_written === 0 && r?.deployment === false
    && r?.empirical_authority_created === false
    && r?.public === 'HOLD' && r?.production === 'HOLD' && r?.g5 === 'HOLD',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PRIOR_PUBLICATION_INVALID');
  return r;
}

export function assertCurrentPreflightReceipt(r, authority) {
  const {manifest} = authority;
  const {prior, evidence, publication, status} = validatePublicationRemediationManifest(manifest);
  assert(r?.id === 'kidults-atomic-terminal-recovery-publication-remediation-preflight-receipt-v2'
    && r?.version === '2.0.0' && r?.state === 'VERIFIED_PASS' && r?.failure_code == null,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PREFLIGHT_STATE_INVALID');
  assert(r?.repository === manifest.repository
    && Number(r?.predecessor_pull_request) === manifest.predecessor_pull_request.number
    && Number(r?.predecessor_atomic_run) === manifest.atomic_run.id
    && r?.predecessor_merge_sha === manifest.predecessor_pull_request.merge_commit_sha
    && r?.exact_current_main_sha === authority.currentMainInput
    && r?.recovery_manifest_sha256 === authority.manifestDigest
    && Number(r?.recovery_workflow_run_id) === Number(authority.runId)
    && Number(r?.recovery_workflow_run_attempt) === 1
    && r?.authorization_id_sha256 === sha256(authority.authorizationId),
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PREFLIGHT_GENERATION_INVALID');
  assert(r?.approval?.comment_id === authority.approval.comment_id
    && r?.approval?.comment_body_digest === authority.approval.comment_body_digest
    && r?.approval?.actor === authority.repositoryOwner
    && r?.one_use_dispatch?.run_id === Number(authority.runId)
    && r?.one_use_dispatch?.run_attempt === 1
    && r?.one_use_dispatch?.matching_run_count === authority.oneUse.matching_run_count
    && r?.one_use_dispatch?.incident_run_count === authority.oneUse.incident_run_count,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PREFLIGHT_AUTHORITY_INVALID');
  assert(r?.prior_failed_recovery?.run_id === prior.id
    && r?.prior_failed_recovery?.evidence_artifact_id === evidence.id
    && r?.prior_failed_recovery?.publication_artifact_id === publication.id
    && r?.prior_failed_recovery?.failure_status_id === status.id
    && r?.prior_failed_recovery?.failure_code === PRIOR_FAILURE_CODE
    && r?.prior_failed_recovery?.evidence_receipt_sha256 === evidence.evidence_receipt_sha256
    && r?.prior_failed_recovery?.publication_receipt_sha256 === publication.publication_receipt_sha256,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PREFLIGHT_PRIOR_BINDING_INVALID');
  assert(r?.historical_terminal_status?.id === manifest.historical_terminal_status.id
    && r?.historical_terminal_status?.immutable === true
    && r?.prior_recovery_failure_status?.id === status.id
    && r?.prior_recovery_failure_status?.immutable === true
    && r?.status_write_authority === false && r?.status_write_performed === false
    && r?.failure_status_write_forbidden === true
    && r?.prior_authorization_reused === false && r?.prior_run_rerun_performed === false,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PREFLIGHT_BOUNDARY_INVALID');
  return r;
}
