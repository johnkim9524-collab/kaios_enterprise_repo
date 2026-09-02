import {
  SHA40,
  SHA256,
  RECOVERY_CONTEXT,
  assert,
  normalizeSha256,
  statusesFor,
} from './atomic-terminal-recovery-v2-policy.mjs';

export const PUBLICATION_REMEDIATION_ID =
  'kidults-atomic-terminal-recovery-publication-remediation-v2';
export const PUBLICATION_REMEDIATION_CAUSE =
  'EVIDENCE_RECEIPT_PREDECESSOR_OBJECT_SCALAR_CONTRACT_DRIFT';
export const PUBLICATION_REMEDIATION_WORKFLOW_PATH =
  '.github/workflows/kidults-current-sold-atomic-terminal-recovery-publication-remediation-v2.yml';
export const PUBLICATION_REMEDIATION_PREFLIGHT_ARTIFACT_PREFIX =
  'kidults-atomic-terminal-recovery-publication-remediation-evidence-v2';
export const PRIOR_FAILED_RUN_ID = 33621062695;
export const PRIOR_FAILED_WORKFLOW_ID = 348289049;
export const PRIOR_FAILED_WORKFLOW_PATH =
  '.github/workflows/kidults-current-sold-atomic-terminal-recovery-remediation-v1.yml';
export const PRIOR_FAILED_MAIN_SHA =
  '23c98e1b04f4105cd3f3f0be5fc42c2e6302deef';
export const PRIOR_FAILURE_CODE =
  'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_PREDECESSOR_MISMATCH';
export const PRIOR_RECOVERY_FAILURE_STATUS_ID = 53372834946;
export const PRIOR_APPROVAL_COMMENT_ID = 5508325466;
export const PRIOR_APPROVAL_CREATED_AT = '2026-09-02T10:44:19Z';
export const PRIOR_APPROVAL_BODY_DIGEST =
  'sha256:6b4f402784b627302c13a5a678aa9d95d39b64cca02e75ba748218872a4c19f9';
export const SOURCE_RECOVERY_MANIFEST_DIGEST =
  'sha256:45251ea842208eca1df738c0e10faa9babb65058c99889cf7a40b9e5666f8bd2';
export const RECOVERY_SUCCESS_DESCRIPTION =
  'Recovered evidence verified; original terminal RED preserved';

export function expectedPublicationRemediationArtifactName(runId) {
  assert(Number.isInteger(Number(runId)) && Number(runId) > 0,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_RUN_ID_INVALID');
  return `${PUBLICATION_REMEDIATION_PREFLIGHT_ARTIFACT_PREFIX}-${Number(runId)}-1`;
}

export function validatePublicationRemediationManifest(manifest) {
  assert(manifest?.authorized_recovery_workflow_path === PUBLICATION_REMEDIATION_WORKFLOW_PATH,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_WORKFLOW_PATH_INVALID');
  const generation = manifest?.publication_remediation_generation;
  assert(generation?.id === PUBLICATION_REMEDIATION_ID
    && generation?.cause === PUBLICATION_REMEDIATION_CAUSE,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_IDENTITY_INVALID');

  const prior = generation?.prior_failed_recovery_run;
  assert(prior?.id === PRIOR_FAILED_RUN_ID
    && prior?.attempt === 1
    && prior?.workflow_id === PRIOR_FAILED_WORKFLOW_ID
    && prior?.workflow_path === PRIOR_FAILED_WORKFLOW_PATH
    && prior?.head_sha === PRIOR_FAILED_MAIN_SHA
    && SHA40.test(prior?.head_sha || '')
    && prior?.conclusion === 'failure'
    && SHA256.test(prior?.authorization_id_sha256 || '')
    && prior?.created_at === '2026-09-02T10:44:59Z',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_FAILED_RUN_BINDING_INVALID');
  assert(prior?.display_title
    === 'KIDULTS Atomic Terminal Recovery Run #33603816578 @ 23c98e1b04f4105cd3f3f0be5fc42c2e6302deef / RECOVER-RUN-33603816578-23c98e1b04f4',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_FAILED_RUN_TITLE_INVALID');
  assert(prior?.jobs?.reconcile_evidence === 'success'
    && prior?.jobs?.publish_distinct_recovery_status === 'failure',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_FAILED_JOB_POLICY_INVALID');

  const approval = prior?.approval;
  assert(approval?.comment_id === PRIOR_APPROVAL_COMMENT_ID
    && approval?.comment_created_at === PRIOR_APPROVAL_CREATED_AT
    && approval?.comment_body_digest === PRIOR_APPROVAL_BODY_DIGEST
    && SHA256.test(approval?.comment_body_digest || ''),
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PRIOR_APPROVAL_INVALID');
  const oneUse = prior?.one_use_dispatch;
  assert(oneUse?.matching_run_count === 1
    && oneUse?.incident_run_count === 1
    && oneUse?.dispatch_actor === 'johnkim9524-collab'
    && oneUse?.triggering_actor === 'johnkim9524-collab',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PRIOR_ONE_USE_INVALID');
  assert(prior?.source_recovery_manifest_sha256 === SOURCE_RECOVERY_MANIFEST_DIGEST,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_SOURCE_MANIFEST_INVALID');

  const evidence = prior?.evidence_artifact;
  assert(evidence?.id === 9842911193
    && evidence?.name
      === 'kidults-atomic-terminal-recovery-remediation-evidence-v1-33621062695-1'
    && evidence?.digest
      === 'sha256:bc7e1648fcaa07f9307899345fbfe86ab11904d811e1a65e00787d1f86dfd732'
    && evidence?.evidence_receipt_sha256
      === 'sha256:4c4c5a658fc50186e222a8692e47b25832702426e6b0bf13680b31922deb77e5'
    && evidence?.preflight_receipt_sha256
      === 'sha256:dd1cf501491977e86e9d6a74d645d3e4c4197837d448ac4e38fd01dd89ef3b64'
    && evidence?.terminal_receipt_sha256
      === 'sha256:8c13a7970655232e5af70d3584f5e8ec235434808d6f060a5faa5f35d509811b'
    && SHA256.test(evidence?.digest || '')
    && SHA256.test(evidence?.evidence_receipt_sha256 || '')
    && SHA256.test(evidence?.preflight_receipt_sha256 || '')
    && SHA256.test(evidence?.terminal_receipt_sha256 || ''),
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_EVIDENCE_ARTIFACT_INVALID');

  const publication = prior?.publication_artifact;
  assert(publication?.id === 9842919682
    && publication?.name
      === 'kidults-atomic-terminal-recovery-remediation-publication-v1-33621062695-1'
    && publication?.digest
      === 'sha256:c5451c4390cdb4c45198b137dbae83a3be1fe8466e30fd7153613baf2820fcc1'
    && publication?.publication_receipt_sha256
      === 'sha256:5821656c57ddb6d84daacf45da6d9c1018f3a21dc78278a17c06d185b2cdb08e'
    && SHA256.test(publication?.digest || '')
    && SHA256.test(publication?.publication_receipt_sha256 || '')
    && publication?.receipt_state === 'VERIFIED_FAIL'
    && publication?.failure_code === PRIOR_FAILURE_CODE
    && publication?.failure_status_http_status === 201,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PUBLICATION_ARTIFACT_INVALID');

  const status = prior?.recovery_failure_status;
  assert(status?.id === PRIOR_RECOVERY_FAILURE_STATUS_ID
    && status?.context === RECOVERY_CONTEXT
    && status?.state === 'failure'
    && status?.description === PRIOR_FAILURE_CODE
    && status?.target_url
      === `https://github.com/${manifest.repository}/actions/runs/${PRIOR_FAILED_RUN_ID}`
    && status?.created_at === '2026-09-02T10:45:29Z',
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_FAILURE_STATUS_INVALID');

  assert(generation?.fresh_owner_authority_required === true
    && generation?.prior_authorization_reuse_forbidden === true
    && generation?.prior_run_rerun_forbidden === true
    && generation?.single_new_workflow_generation_only === true
    && generation?.historical_terminal_context_immutable === true
    && generation?.prior_recovery_failure_status_immutable === true
    && generation?.success_may_append_same_context_once === true
    && generation?.failure_status_write_forbidden === true,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_AUTHORITY_POLICY_INVALID');
  return {generation, prior, approval, oneUse, evidence, publication, status};
}

export function validatePriorFailedRemediationRun(run, jobs, repositoryOwner, manifest) {
  const {prior} = validatePublicationRemediationManifest(manifest);
  assert(Number(run?.id) === prior.id
    && Number(run?.run_attempt) === prior.attempt
    && Number(run?.workflow_id) === prior.workflow_id
    && run?.path === prior.workflow_path
    && run?.head_branch === 'main'
    && run?.head_sha === prior.head_sha
    && run?.event === 'workflow_dispatch'
    && run?.status === 'completed'
    && run?.conclusion === prior.conclusion
    && run?.display_title === prior.display_title
    && run?.created_at === prior.created_at,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_FAILED_RUN_STATE_INVALID');
  assert(run?.actor?.login === repositoryOwner
    && run?.triggering_actor?.login === repositoryOwner,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_FAILED_RUN_ACTOR_INVALID');
  const values = Array.isArray(jobs?.jobs) ? jobs.jobs : [];
  const readOnly = values.filter(job =>
    job?.name === 'Reconcile predecessor evidence without status-write authority');
  const publish = values.filter(job =>
    job?.name === 'Publish distinct recovery status from sealed evidence');
  assert(readOnly.length === 1 && readOnly[0]?.conclusion === prior.jobs.reconcile_evidence,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_RECONCILE_JOB_INVALID');
  assert(publish.length === 1
    && publish[0]?.conclusion === prior.jobs.publish_distinct_recovery_status,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PUBLISH_JOB_INVALID');
  return prior;
}

export function validatePriorArtifacts(artifacts, manifest) {
  const {evidence, publication} = validatePublicationRemediationManifest(manifest);
  const values = Array.isArray(artifacts) ? artifacts : [];
  assert(values.length === 2,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_ARTIFACT_CARDINALITY_INVALID');
  for (const expected of [evidence, publication]) {
    const matches = values.filter(item => Number(item?.id) === expected.id);
    assert(matches.length === 1,
      'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_ARTIFACT_ID_CARDINALITY_INVALID');
    const observed = matches[0];
    assert(observed?.name === expected.name
      && normalizeSha256(observed?.digest) === normalizeSha256(expected.digest)
      && observed?.expired === false
      && Number(observed?.workflow_run?.id) === PRIOR_FAILED_RUN_ID
      && observed?.workflow_run?.head_sha === PRIOR_FAILED_MAIN_SHA,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_ARTIFACT_BINDING_INVALID');
  }
  return {evidence, publication};
}

export function assertPriorRecoveryFailureBoundary(statusPayload, manifest) {
  const {status: expected} = validatePublicationRemediationManifest(manifest);
  const entries = statusesFor(statusPayload, RECOVERY_CONTEXT);
  assert(entries.length === 1,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_STATUS_CARDINALITY_INVALID',
    String(entries.length));
  const observed = entries[0];
  assert(Number(observed?.id) === expected.id
    && observed?.state === expected.state
    && observed?.description === expected.description
    && observed?.target_url === expected.target_url
    && observed?.created_at === expected.created_at,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_STATUS_DRIFT');
  return {
    id: expected.id,
    context: RECOVERY_CONTEXT,
    state: 'failure',
    immutable: true,
  };
}

export function assertRecoverySuccessAfterPriorFailure(
  statusPayload, manifest, publishedId, runId,
) {
  const {status: expected} = validatePublicationRemediationManifest(manifest);
  const entries = statusesFor(statusPayload, RECOVERY_CONTEXT);
  assert(entries.length === 2,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_SUCCESS_CARDINALITY_INVALID',
    String(entries.length));
  const [latest, prior] = entries;
  assert(Number(latest?.id) === Number(publishedId)
    && latest?.state === 'success'
    && latest?.description === RECOVERY_SUCCESS_DESCRIPTION
    && String(latest?.target_url || '').endsWith(`/actions/runs/${runId}`),
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_SUCCESS_READBACK_INVALID');
  assert(Number(prior?.id) === expected.id
    && prior?.state === expected.state
    && prior?.description === expected.description
    && prior?.target_url === expected.target_url
    && prior?.created_at === expected.created_at,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PRIOR_FAILURE_DRIFT');
  return {latest, prior};
}
