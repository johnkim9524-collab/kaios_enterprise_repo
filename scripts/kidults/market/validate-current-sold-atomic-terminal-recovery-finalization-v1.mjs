#!/usr/bin/env node
import fs from 'node:fs';
import {
  RECOVERY_CONTEXT,
  assert,
  sha256,
  validateManifest,
} from './atomic-terminal-recovery-v2-runtime.mjs';
import {
  FINALIZATION_WORKFLOW_PATH,
  FINALIZATION_EVIDENCE_ARTIFACT_PREFIX,
  expectedFinalizationEvidenceArtifactName,
  validateFinalizationManifest,
  validatePriorFailedRemediationRun,
  validatePriorFailedRemediationArtifacts,
  validatePriorRemediationEvidenceReceipt,
  validatePriorRemediationPublicationReceipt,
  assertPriorRecoveryFailureImmutable,
  assertFinalizedRecoveryReadback,
} from './atomic-terminal-recovery-finalization-v1-policy.mjs';

const manifestPath = process.argv[2]
  || 'coordination/kidults/market/current-sold-atomic-terminal-recovery-finalization-33603816578-v1.json';
const workflowPath = process.argv[3]
  || '.github/workflows/kidults-current-sold-atomic-terminal-recovery-finalization-v1.yml';
const manifestBytes = fs.readFileSync(manifestPath);
const manifest = validateManifest(JSON.parse(manifestBytes.toString('utf8')));
const manifestDigest = sha256(manifestBytes);
const {prior, evidence, publication, failedStatus} = validateFinalizationManifest(manifest);
const owner = 'johnkim9524-collab';

function reject(label, expected, fn) {
  let observed = '';
  try { fn(); } catch (error) { observed = String(error?.code || error?.message || ''); }
  if (!observed.startsWith(expected)) {
    throw new Error(`${label}: expected ${expected}, observed ${observed || 'NO_REJECTION'}`);
  }
  return label;
}

const priorRun = {
  id: prior.id,
  run_attempt: prior.attempt,
  workflow_id: prior.workflow_id,
  path: prior.workflow_path,
  head_branch: 'main',
  head_sha: prior.head_sha,
  event: 'workflow_dispatch',
  status: 'completed',
  conclusion: 'failure',
  display_title: prior.display_title,
  actor: {login: owner},
  triggering_actor: {login: owner},
};
const priorJobs = {jobs: [
  {name: 'Validate failed-run binding and corrected recovery runtime', conclusion: 'skipped'},
  {name: 'Reconcile predecessor evidence without status-write authority', conclusion: 'success'},
  {name: 'Publish distinct recovery status from sealed evidence', conclusion: 'failure'},
]};
const priorArtifacts = [
  {id: evidence.id, name: evidence.name, digest: evidence.digest, expired: false},
  {id: publication.id, name: publication.name, digest: publication.digest, expired: false},
];
validatePriorFailedRemediationRun(priorRun, priorJobs, owner, manifest);
validatePriorFailedRemediationArtifacts(priorArtifacts, manifest);

const sourceEvidence = {
  id: 'kidults-atomic-terminal-recovery-evidence-receipt-v2',
  version: '2.0.0',
  state: 'VERIFIED_PASS',
  failure_code: null,
  repository: manifest.repository,
  predecessor_pull_request: manifest.predecessor_pull_request.number,
  predecessor_atomic_run: {
    id: manifest.atomic_run.id,
    attempt: manifest.atomic_run.attempt,
    conclusion: manifest.atomic_run.expected_conclusion,
    actor: owner,
  },
  predecessor_merge_sha: manifest.predecessor_pull_request.merge_commit_sha,
  exact_current_main_sha: prior.head_sha,
  recovery_manifest_sha256: manifest.finalization_generation.source_manifest.digest,
  recovery_workflow_run_id: prior.id,
  recovery_workflow_run_attempt: prior.attempt,
  authorization_id_sha256: prior.authorization_id_sha256,
  approval: {
    comment_id: prior.approval_comment_id,
    comment_body_digest: prior.approval_comment_body_digest,
    actor: owner,
  },
  one_use_dispatch: {
    run_id: prior.id,
    run_attempt: prior.attempt,
    workflow_id: prior.workflow_id,
    matching_run_count: 1,
    incident_run_count: 1,
  },
  historical_terminal_status: {
    id: manifest.historical_terminal_status.id,
    immutable: true,
  },
  recovery_status_before: {prior_status_count: 0},
  postlanding_proof: {state: 'VERIFIED_PASS', tests_passed: 56, tests_failed: 0},
  classifier: {result: 'PASS', matcher_surfaces_verified: 3},
  status_write_authority: false,
  status_write_performed: false,
  historical_terminal_context_mutated: false,
  merge_reexecuted: false,
  landing_authorization_reused: false,
};
const sourcePublication = {
  id: 'kidults-atomic-terminal-recovery-publication-receipt-v2',
  version: '2.0.0',
  state: 'VERIFIED_FAIL',
  failure_code: prior.publication_failure_code,
  repository: manifest.repository,
  predecessor_pull_request: manifest.predecessor_pull_request.number,
  predecessor_atomic_run: manifest.atomic_run.id,
  predecessor_merge_sha: manifest.predecessor_pull_request.merge_commit_sha,
  exact_current_main_sha: prior.head_sha,
  recovery_manifest_sha256: manifest.finalization_generation.source_manifest.digest,
  recovery_workflow_run_id: prior.id,
  recovery_workflow_run_attempt: prior.attempt,
  authorization_id_sha256: prior.authorization_id_sha256,
  status_write_authority_established: true,
  distinct_recovery_failure_status_attempted: true,
  distinct_recovery_failure_status_http_status: 201,
  historical_terminal_context_mutated: false,
  merge_reexecuted: false,
  landing_authorization_reused: false,
};
validatePriorRemediationEvidenceReceipt(sourceEvidence, manifest, owner);
validatePriorRemediationPublicationReceipt(sourcePublication, manifest);

const historical = {
  id: manifest.historical_terminal_status.id,
  context: manifest.historical_terminal_status.context,
  state: manifest.historical_terminal_status.state,
  description: manifest.historical_terminal_status.description,
  target_url: manifest.historical_terminal_status.target_url,
  created_at: manifest.historical_terminal_status.created_at,
};
const priorFailure = {
  id: failedStatus.id,
  context: RECOVERY_CONTEXT,
  state: failedStatus.state,
  description: failedStatus.description,
  target_url: failedStatus.target_url,
  created_at: failedStatus.created_at,
};
const success = {
  id: 60000000000,
  context: RECOVERY_CONTEXT,
  state: 'success',
  description: 'Recovered evidence verified; original terminal RED preserved',
  target_url: 'https://github.com/johnkim9524-collab/kaios_enterprise_repo/actions/runs/7002',
  created_at: '2026-09-02T12:00:00Z',
};
assertPriorRecoveryFailureImmutable({statuses: [historical, priorFailure]}, manifest);
assertFinalizedRecoveryReadback([historical, priorFailure, success],
  success.id, 7002, manifest);

const rejected = [];
rejected.push(reject('numeric predecessor source fixture',
  'ATOMIC_RECOVERY_FINALIZATION_SOURCE_EVIDENCE_PREDECESSOR_INVALID',
  () => validatePriorRemediationEvidenceReceipt({
    ...sourceEvidence,
    predecessor_atomic_run: manifest.atomic_run.id,
  }, manifest, owner)));
for (const [label, value] of [
  ['source predecessor id', {...sourceEvidence.predecessor_atomic_run, id: 1}],
  ['source predecessor attempt', {...sourceEvidence.predecessor_atomic_run, attempt: 2}],
  ['source predecessor conclusion', {...sourceEvidence.predecessor_atomic_run, conclusion: 'success'}],
  ['source predecessor actor', {...sourceEvidence.predecessor_atomic_run, actor: 'intruder'}],
]) {
  rejected.push(reject(label,
    'ATOMIC_RECOVERY_FINALIZATION_SOURCE_EVIDENCE_PREDECESSOR_INVALID',
    () => validatePriorRemediationEvidenceReceipt({
      ...sourceEvidence,
      predecessor_atomic_run: value,
    }, manifest, owner)));
}
rejected.push(reject('prior status missing',
  'ATOMIC_RECOVERY_FINALIZATION_PRIOR_STATUS_CARDINALITY_INVALID',
  () => assertPriorRecoveryFailureImmutable({statuses: [historical]}, manifest)));
rejected.push(reject('prior status duplicated',
  'ATOMIC_RECOVERY_FINALIZATION_PRIOR_STATUS_CARDINALITY_INVALID',
  () => assertPriorRecoveryFailureImmutable({statuses: [
    historical, priorFailure, {...priorFailure, id: priorFailure.id + 1},
  ]}, manifest)));
rejected.push(reject('prior status state drift',
  'ATOMIC_RECOVERY_FINALIZATION_PRIOR_STATUS_DRIFT',
  () => assertPriorRecoveryFailureImmutable({statuses: [
    historical, {...priorFailure, state: 'success'},
  ]}, manifest)));
rejected.push(reject('combined latest-only status surface',
  'ATOMIC_RECOVERY_FINALIZATION_RAW_HISTORY_SHAPE_INVALID',
  () => assertFinalizedRecoveryReadback([success]},
    success.id, 7002, manifest)));
rejected.push(reject('success missing',
  'ATOMIC_RECOVERY_FINALIZATION_STATUS_CARDINALITY_INVALID',
  () => assertFinalizedRecoveryReadback([historical, priorFailure],
    success.id, 7002, manifest)));
rejected.push(reject('success state drift',
  'ATOMIC_RECOVERY_FINALIZATION_SUCCESS_STATUS_INVALID',
  () => assertFinalizedRecoveryReadback([
    historical, priorFailure, {...success, state: 'failure'},
  ], success.id, 7002, manifest)));
rejected.push(reject('success target drift',
  'ATOMIC_RECOVERY_FINALIZATION_SUCCESS_TARGET_INVALID',
  () => assertFinalizedRecoveryReadback([
    historical, priorFailure, {...success, target_url: 'https://github.com/other/run'},
  ], success.id, 7002, manifest)));
rejected.push(reject('third recovery status',
  'ATOMIC_RECOVERY_FINALIZATION_STATUS_CARDINALITY_INVALID',
  () => assertFinalizedRecoveryReadback([
    historical, priorFailure, success, {...success, id: success.id + 1},
  ], success.id, 7002, manifest)));
rejected.push(reject('prior run rerun',
  'ATOMIC_RECOVERY_FINALIZATION_PRIOR_RUN_STATE_INVALID',
  () => validatePriorFailedRemediationRun({...priorRun, run_attempt: 2},
    priorJobs, owner, manifest)));
rejected.push(reject('prior publication success',
  'ATOMIC_RECOVERY_FINALIZATION_PRIOR_PUBLICATION_JOB_INVALID',
  () => validatePriorFailedRemediationRun(priorRun, {jobs: priorJobs.jobs.map(job =>
    job.name === 'Publish distinct recovery status from sealed evidence'
      ? {...job, conclusion: 'success'} : job)}, owner, manifest)));
rejected.push(reject('source publication claimed success',
  'ATOMIC_RECOVERY_FINALIZATION_SOURCE_PUBLICATION_STATE_INVALID',
  () => validatePriorRemediationPublicationReceipt({
    ...sourcePublication, state: 'VERIFIED_PASS', failure_code: null,
  }, manifest)));

const workflow = fs.readFileSync(workflowPath, 'utf8');
const preflight = fs.readFileSync(
  new URL('./current-sold-atomic-terminal-recovery-finalization-v1-preflight.mjs',
    import.meta.url), 'utf8');
const publisher = fs.readFileSync(
  new URL('./current-sold-atomic-terminal-recovery-finalization-v1-publish.mjs',
    import.meta.url), 'utf8');
const sourcePublisher = fs.readFileSync(
  new URL('./current-sold-atomic-terminal-recovery-v2-publish.mjs', import.meta.url), 'utf8');
const requireText = (text, marker, code) => {
  if (!text.includes(marker)) throw new Error(code);
};

requireText(workflow, 'name: KIDULTS Current-SOLD Atomic Terminal Recovery Finalization V1',
  'ATOMIC_RECOVERY_FINALIZATION_WORKFLOW_NAME_INVALID');
requireText(workflow, 'workflow_dispatch:', 'ATOMIC_RECOVERY_FINALIZATION_DISPATCH_MISSING');
requireText(workflow, 'group: kidults-atomic-governed-landing-v1-main',
  'ATOMIC_RECOVERY_FINALIZATION_SERIALIZATION_MISSING');
requireText(workflow, 'Finalize failed recovery evidence without status-write authority',
  'ATOMIC_RECOVERY_FINALIZATION_READ_JOB_MISSING');
requireText(workflow, 'Publish final recovery success from sealed lineage',
  'ATOMIC_RECOVERY_FINALIZATION_WRITE_JOB_MISSING');
requireText(workflow, 'statuses: read', 'ATOMIC_RECOVERY_FINALIZATION_READ_PERMISSION_MISSING');
requireText(workflow, 'statuses: write', 'ATOMIC_RECOVERY_FINALIZATION_WRITE_PERMISSION_MISSING');
requireText(workflow, 'current-sold-atomic-terminal-recovery-finalization-v1-preflight.mjs',
  'ATOMIC_RECOVERY_FINALIZATION_PREFLIGHT_STEP_MISSING');
requireText(workflow, 'current-sold-atomic-terminal-recovery-finalization-v1-publish.mjs',
  'ATOMIC_RECOVERY_FINALIZATION_PUBLISH_STEP_MISSING');
requireText(workflow, '${{ github.run_id }}-${{ github.run_attempt }}',
  'ATOMIC_RECOVERY_FINALIZATION_ARTIFACT_RUN_BINDING_MISSING');
requireText(preflight, 'assertPriorRecoveryFailureImmutable',
  'ATOMIC_RECOVERY_FINALIZATION_PREFLIGHT_FAILURE_LINEAGE_MISSING');
requireText(publisher, 'assertFinalizedRecoveryReadback',
  'ATOMIC_RECOVERY_FINALIZATION_READBACK_MISSING');
requireText(publisher, 'authority.client.pages(`/commits/${statusSha}/statuses`)',
  'ATOMIC_RECOVERY_FINALIZATION_RAW_HISTORY_READ_MISSING');
requireText(publisher, 'failure_status_published: false',
  'ATOMIC_RECOVERY_FINALIZATION_FAILURE_STATUS_SUPPRESSION_MISSING');
requireText(sourcePublisher, "typeof predecessor === 'object'",
  'ATOMIC_RECOVERY_SOURCE_PUBLISHER_OBJECT_CONTRACT_MISSING');
if (/\n\s*workflow_run:/.test(workflow)) {
  throw new Error('ATOMIC_RECOVERY_FINALIZATION_WORKFLOW_RUN_CONSUMER_FORBIDDEN');
}
const readOnlySection = workflow.slice(
  workflow.indexOf('finalize-evidence:'),
  workflow.indexOf('publish-final-recovery-success:'),
);
if (/statuses:\s*write/.test(readOnlySection)) {
  throw new Error('ATOMIC_RECOVERY_FINALIZATION_READ_JOB_HAS_WRITE_PERMISSION');
}
if (preflight.includes("method: 'POST'") || preflight.includes('statuses: write')) {
  throw new Error('ATOMIC_RECOVERY_FINALIZATION_PREFLIGHT_WRITE_PATH_FORBIDDEN');
}
if (publisher.includes("state: 'failure',") || publisher.includes('failure status')) {
  throw new Error('ATOMIC_RECOVERY_FINALIZATION_FAILURE_STATUS_PUBLICATION_FORBIDDEN');
}
assert(manifest.authorized_recovery_workflow_path === FINALIZATION_WORKFLOW_PATH,
  'ATOMIC_RECOVERY_FINALIZATION_MANIFEST_WORKFLOW_BINDING_INVALID');
const probeName = expectedFinalizationEvidenceArtifactName(manifest, 7002);
assert(probeName === `${FINALIZATION_EVIDENCE_ARTIFACT_PREFIX}-7002-1`,
  'ATOMIC_RECOVERY_FINALIZATION_ARTIFACT_NAME_PROBE_FAILED');

console.log(JSON.stringify({
  id: 'kidults-atomic-terminal-recovery-finalization-v1-validation',
  state: 'VERIFIED_PASS',
  manifest_sha256: manifestDigest,
  prior_failed_remediation_run: prior.id,
  prior_failure_status_id: failedStatus.id,
  producer_publisher_predecessor_object_contract: 'PASS',
  immutable_prior_failure_lineage: 'PASS',
  append_only_success_readback: 'PASS',
  negative_cases_rejected: rejected.length,
  finalization_evidence_artifact_name_probe: probeName,
  authorized_workflow_path: FINALIZATION_WORKFLOW_PATH,
  historical_terminal_context_immutable: true,
  prior_recovery_failure_status_immutable: true,
  fresh_owner_authority_required: true,
  prior_authorization_reuse_forbidden: true,
  prior_run_rerun_forbidden: true,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
