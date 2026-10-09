import {
  SHA40,
  SHA256,
  assert,
  normalizeSha256,
} from './atomic-terminal-recovery-v2-policy.mjs';

export const REMEDIATION_ID = 'kidults-atomic-terminal-recovery-remediation-v1';
export const REMEDIATION_CAUSE = 'RUNTIME_MAX_PAGES_IMPORT_MISSING';
export const REMEDIATION_WORKFLOW_PATH =
  '.github/workflows/kidults-current-sold-atomic-terminal-recovery-remediation-v1.yml';
export const REMEDIATION_EVIDENCE_ARTIFACT_PREFIX =
  'kidults-atomic-terminal-recovery-remediation-evidence-v1';
export const FAILED_WORKFLOW_PATH =
  '.github/workflows/kidults-current-sold-atomic-terminal-recovery-v2.yml';
export const FAILED_RUN_ID = 33614615356;
export const FAILED_WORKFLOW_ID = 348248201;
export const FAILED_ARTIFACT_ID = 9840385828;
export const FAILED_CODE = 'MAX_PAGES is not defined';

export function expectedRemediationEvidenceArtifactName(manifest, runId) {
  const generation = manifest?.remediation_generation;
  assert(generation?.evidence_artifact_name_prefix === REMEDIATION_EVIDENCE_ARTIFACT_PREFIX,
    'ATOMIC_RECOVERY_REMEDIATION_EVIDENCE_ARTIFACT_PREFIX_INVALID');
  assert(Number.isInteger(Number(runId)) && Number(runId) > 0,
    'ATOMIC_RECOVERY_REMEDIATION_EVIDENCE_RUN_ID_INVALID');
  return `${REMEDIATION_EVIDENCE_ARTIFACT_PREFIX}-${Number(runId)}-1`;
}

export function validateRemediationManifest(manifest) {
  assert(manifest?.authorized_recovery_workflow_path === REMEDIATION_WORKFLOW_PATH,
    'ATOMIC_RECOVERY_REMEDIATION_WORKFLOW_PATH_INVALID');
  const generation = manifest?.remediation_generation;
  assert(generation?.id === REMEDIATION_ID
    && generation?.cause === REMEDIATION_CAUSE
    && generation?.evidence_artifact_name_prefix === REMEDIATION_EVIDENCE_ARTIFACT_PREFIX,
  'ATOMIC_RECOVERY_REMEDIATION_IDENTITY_INVALID');

  const prior = generation?.prior_failed_recovery_run;
  assert(prior?.id === FAILED_RUN_ID
    && prior?.attempt === 1
    && prior?.workflow_id === FAILED_WORKFLOW_ID
    && prior?.workflow_path === FAILED_WORKFLOW_PATH
    && SHA40.test(prior?.head_sha || '')
    && prior?.conclusion === 'failure'
    && SHA256.test(prior?.authorization_id_sha256 || ''),
  'ATOMIC_RECOVERY_REMEDIATION_FAILED_RUN_BINDING_INVALID');
  assert(typeof prior?.display_title === 'string'
    && prior.display_title.startsWith('KIDULTS Atomic Terminal Recovery Run #33603816578 @ ')
    && prior.display_title.includes('/ RECOVER-RUN-33603816578-'),
  'ATOMIC_RECOVERY_REMEDIATION_FAILED_RUN_TITLE_INVALID');

  const artifact = prior?.evidence_artifact;
  assert(artifact?.id === FAILED_ARTIFACT_ID
    && typeof artifact?.name === 'string'
    && artifact.name === `kidults-atomic-terminal-recovery-evidence-v2-${FAILED_RUN_ID}-1`
    && SHA256.test(artifact?.digest || ''),
  'ATOMIC_RECOVERY_REMEDIATION_FAILED_ARTIFACT_INVALID');

  assert(prior?.receipt_state === 'VERIFIED_FAIL'
    && prior?.failure_code === FAILED_CODE
    && prior?.historical_terminal_context_mutated === false
    && prior?.status_write_authority === false
    && prior?.status_write_performed === false
    && prior?.merge_reexecuted === false
    && prior?.landing_authorization_reused === false
    && prior?.provider_calls === 0
    && prior?.postgres_rows_written === 0
    && prior?.deployment === false
    && prior?.empirical_authority_created === false
    && prior?.public === 'HOLD'
    && prior?.production === 'HOLD'
    && prior?.g5 === 'HOLD',
  'ATOMIC_RECOVERY_REMEDIATION_FAILED_RECEIPT_POLICY_INVALID');

  assert(generation?.fresh_owner_authority_required === true
    && generation?.prior_authorization_reuse_forbidden === true
    && generation?.prior_run_rerun_forbidden === true
    && generation?.single_new_workflow_generation_only === true,
  'ATOMIC_RECOVERY_REMEDIATION_AUTHORITY_POLICY_INVALID');
  return {generation, prior, artifact};
}

export function validatePriorFailedRecoveryRun(run, jobs, repositoryOwner, manifest) {
  const {prior} = validateRemediationManifest(manifest);
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
  'ATOMIC_RECOVERY_REMEDIATION_FAILED_RUN_STATE_INVALID');
  assert(run?.actor?.login === repositoryOwner
    && run?.triggering_actor?.login === repositoryOwner,
  'ATOMIC_RECOVERY_REMEDIATION_FAILED_RUN_ACTOR_INVALID');

  const values = Array.isArray(jobs?.jobs) ? jobs.jobs : [];
  const reconciliation = values.filter(job =>
    job?.name === 'Reconcile predecessor evidence without status-write authority');
  const publication = values.filter(job =>
    job?.name === 'Publish distinct recovery status from sealed evidence');
  assert(reconciliation.length === 1 && reconciliation[0]?.conclusion === 'failure',
    'ATOMIC_RECOVERY_REMEDIATION_FAILED_RECONCILIATION_JOB_INVALID');
  assert(publication.length === 1 && publication[0]?.conclusion === 'skipped',
    'ATOMIC_RECOVERY_REMEDIATION_FAILED_PUBLICATION_JOB_INVALID');
  return {run_id: prior.id, run_attempt: prior.attempt, workflow_id: prior.workflow_id};
}

export function validatePriorFailedRecoveryArtifact(artifacts, manifest) {
  const {artifact} = validateRemediationManifest(manifest);
  const values = Array.isArray(artifacts) ? artifacts : [];
  const matches = values.filter(item => Number(item?.id) === artifact.id);
  assert(values.length === 1 && matches.length === 1,
    'ATOMIC_RECOVERY_REMEDIATION_FAILED_ARTIFACT_CARDINALITY_INVALID');
  const observed = matches[0];
  assert(observed?.name === artifact.name
    && normalizeSha256(observed?.digest) === normalizeSha256(artifact.digest)
    && observed?.expired === false,
  'ATOMIC_RECOVERY_REMEDIATION_FAILED_ARTIFACT_BINDING_INVALID');
  return observed;
}

export function validatePriorFailedRecoveryReceipt(receipt, manifest) {
  const {prior} = validateRemediationManifest(manifest);
  assert(receipt?.id === 'kidults-atomic-terminal-recovery-evidence-receipt-v2'
    && receipt?.version === '2.0.0'
    && receipt?.state === prior.receipt_state
    && receipt?.failure_code === prior.failure_code,
  'ATOMIC_RECOVERY_REMEDIATION_FAILED_RECEIPT_IDENTITY_INVALID');
  assert(receipt?.repository === manifest.repository
    && Number(receipt?.predecessor_pull_request) === manifest.predecessor_pull_request.number
    && Number(receipt?.predecessor_atomic_run) === manifest.atomic_run.id
    && receipt?.predecessor_merge_sha === manifest.predecessor_pull_request.merge_commit_sha
    && receipt?.exact_current_main_sha === prior.head_sha
    && Number(receipt?.recovery_workflow_run_id) === prior.id
    && Number(receipt?.recovery_workflow_run_attempt) === prior.attempt
    && normalizeSha256(receipt?.authorization_id_sha256)
      === normalizeSha256(prior.authorization_id_sha256),
  'ATOMIC_RECOVERY_REMEDIATION_FAILED_RECEIPT_TUPLE_INVALID');
  assert(receipt?.historical_terminal_context_mutated === false
    && receipt?.status_write_authority === false
    && receipt?.status_write_performed === false
    && receipt?.merge_reexecuted === false
    && receipt?.landing_authorization_reused === false
    && receipt?.provider_calls === 0
    && receipt?.postgres_rows_written === 0
    && receipt?.deployment === false
    && receipt?.empirical_authority_created === false
    && receipt?.public === 'HOLD'
    && receipt?.production === 'HOLD'
    && receipt?.g5 === 'HOLD',
  'ATOMIC_RECOVERY_REMEDIATION_FAILED_RECEIPT_MUTATION_INVALID');
  return receipt;
}
