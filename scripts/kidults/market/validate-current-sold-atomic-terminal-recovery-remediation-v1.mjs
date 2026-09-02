#!/usr/bin/env node
import fs from 'node:fs';
import {
  assert,
  sha256,
  validateManifest,
  makeGitHubClient,
} from './atomic-terminal-recovery-v2-runtime.mjs';
import {
  REMEDIATION_WORKFLOW_PATH,
  REMEDIATION_EVIDENCE_ARTIFACT_PREFIX,
  expectedRemediationEvidenceArtifactName,
  validateRemediationManifest,
  validatePriorFailedRecoveryRun,
  validatePriorFailedRecoveryArtifact,
  validatePriorFailedRecoveryReceipt,
} from './atomic-terminal-recovery-remediation-v1-policy.mjs';
import {
  assertEvidenceReceipt,
} from './current-sold-atomic-terminal-recovery-v2-publish.mjs';

const manifestPath = process.argv[2]
  || 'coordination/kidults/market/current-sold-atomic-terminal-recovery-33603816578-v2.json';
const workflowPath = process.argv[3]
  || '.github/workflows/kidults-current-sold-atomic-terminal-recovery-remediation-v1.yml';
const manifestBytes = fs.readFileSync(manifestPath);
const manifest = validateManifest(JSON.parse(manifestBytes.toString('utf8')));
const manifestDigest = sha256(manifestBytes);
const {prior, artifact} = validateRemediationManifest(manifest);

function reject(label, expected, fn) {
  let observed = '';
  try { fn(); } catch (error) { observed = String(error?.code || error?.message || ''); }
  if (!observed.startsWith(expected)) {
    throw new Error(`${label}: expected ${expected}, observed ${observed || 'NO_REJECTION'}`);
  }
  return label;
}

const owner = 'johnkim9524-collab';
const priorRun = {
  id: prior.id,
  run_attempt: prior.attempt,
  workflow_id: prior.workflow_id,
  path: prior.workflow_path,
  head_branch: 'main',
  head_sha: prior.head_sha,
  event: 'workflow_dispatch',
  status: 'completed',
  conclusion: prior.conclusion,
  display_title: prior.display_title,
  actor: {login: owner},
  triggering_actor: {login: owner},
};
const jobs = {jobs: [
  {name: 'Reconcile predecessor evidence without status-write authority', conclusion: 'failure'},
  {name: 'Publish distinct recovery status from sealed evidence', conclusion: 'skipped'},
]};
const artifacts = [{
  id: artifact.id,
  name: artifact.name,
  digest: artifact.digest,
  expired: false,
}];
const failedReceipt = {
  id: 'kidults-atomic-terminal-recovery-evidence-receipt-v2',
  version: '2.0.0',
  state: prior.receipt_state,
  failure_code: prior.failure_code,
  repository: manifest.repository,
  predecessor_pull_request: manifest.predecessor_pull_request.number,
  predecessor_atomic_run: manifest.atomic_run.id,
  predecessor_merge_sha: manifest.predecessor_pull_request.merge_commit_sha,
  exact_current_main_sha: prior.head_sha,
  recovery_workflow_run_id: prior.id,
  recovery_workflow_run_attempt: prior.attempt,
  authorization_id_sha256: prior.authorization_id_sha256,
  historical_terminal_context_mutated: false,
  status_write_authority: false,
  status_write_performed: false,
  merge_reexecuted: false,
  landing_authorization_reused: false,
  provider_calls: 0,
  postgres_rows_written: 0,
  deployment: false,
  empirical_authority_created: false,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};

validatePriorFailedRecoveryRun(priorRun, jobs, owner, manifest);
validatePriorFailedRecoveryArtifact(artifacts, manifest);
validatePriorFailedRecoveryReceipt(failedReceipt, manifest);

const probeRunId = 7001;
const probeMainSha = '1'.repeat(40);
const probeAuthorizationId = `RECOVER-RUN-33603816578-${probeMainSha.slice(0, 12)}`;
const probeApproval = {
  comment_id: 8801,
  comment_body_digest: `sha256:${'2'.repeat(64)}`,
  actor: owner,
};
const expectedEvidenceArtifactName = expectedRemediationEvidenceArtifactName(manifest, probeRunId);
assert(expectedEvidenceArtifactName
  === `${REMEDIATION_EVIDENCE_ARTIFACT_PREFIX}-${probeRunId}-1`,
'ATOMIC_RECOVERY_REMEDIATION_EVIDENCE_ARTIFACT_RUNTIME_PROBE_FAILED');
const publicationAuthority = {
  manifest,
  currentMainInput: probeMainSha,
  manifestDigest,
  runId: String(probeRunId),
  authorizationId: probeAuthorizationId,
  approval: probeApproval,
  repositoryOwner: owner,
};
const publicationEvidence = {
  id: 'kidults-atomic-terminal-recovery-evidence-receipt-v2',
  version: '2.0.0',
  state: 'VERIFIED_PASS',
  repository: manifest.repository,
  predecessor_pull_request: manifest.predecessor_pull_request.number,
  predecessor_atomic_run: manifest.atomic_run.id,
  predecessor_merge_sha: manifest.predecessor_pull_request.merge_commit_sha,
  exact_current_main_sha: probeMainSha,
  recovery_manifest_sha256: manifestDigest,
  recovery_workflow_run_id: probeRunId,
  recovery_workflow_run_attempt: 1,
  authorization_id_sha256: sha256(probeAuthorizationId),
  approval: probeApproval,
  one_use_dispatch: {
    run_id: probeRunId,
    run_attempt: 1,
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
const publicationInputs = {
  artifactId: 9901,
  artifactDigest: `sha256:${'3'.repeat(64)}`,
  artifactName: expectedEvidenceArtifactName,
  receiptSha: `sha256:${'4'.repeat(64)}`,
};
assertEvidenceReceipt(publicationEvidence, publicationAuthority, publicationInputs);

const rejected = [];
rejected.push(reject('workflow path substitution',
  'ATOMIC_RECOVERY_REMEDIATION_WORKFLOW_PATH_INVALID',
  () => validateRemediationManifest({
    ...manifest,
    authorized_recovery_workflow_path: '.github/workflows/other.yml',
  })));
rejected.push(reject('evidence artifact prefix substitution',
  'ATOMIC_RECOVERY_REMEDIATION_IDENTITY_INVALID',
  () => validateRemediationManifest({
    ...manifest,
    remediation_generation: {
      ...manifest.remediation_generation,
      evidence_artifact_name_prefix: 'kidults-atomic-terminal-recovery-evidence-v2',
    },
  })));
rejected.push(reject('publication legacy artifact name',
  'ATOMIC_RECOVERY_EVIDENCE_ARTIFACT_NAME_INVALID',
  () => assertEvidenceReceipt(publicationEvidence, publicationAuthority, {
    ...publicationInputs,
    artifactName: `kidults-atomic-terminal-recovery-evidence-v2-${probeRunId}-1`,
  })));
rejected.push(reject('failed run path drift',
  'ATOMIC_RECOVERY_REMEDIATION_FAILED_RUN_STATE_INVALID',
  () => validatePriorFailedRecoveryRun({...priorRun, path: '.github/workflows/other.yml'},
    jobs, owner, manifest)));
rejected.push(reject('failed artifact multiplicity',
  'ATOMIC_RECOVERY_REMEDIATION_FAILED_ARTIFACT_CARDINALITY_INVALID',
  () => validatePriorFailedRecoveryArtifact([...artifacts, {...artifacts[0], id: 999}], manifest)));
rejected.push(reject('failed receipt claimed status write',
  'ATOMIC_RECOVERY_REMEDIATION_FAILED_RECEIPT_MUTATION_INVALID',
  () => validatePriorFailedRecoveryReceipt({...failedReceipt, status_write_performed: true}, manifest)));
rejected.push(reject('publication job was not skipped',
  'ATOMIC_RECOVERY_REMEDIATION_FAILED_PUBLICATION_JOB_INVALID',
  () => validatePriorFailedRecoveryRun(priorRun, {jobs: [
    jobs.jobs[0],
    {...jobs.jobs[1], conclusion: 'success'},
  ]}, owner, manifest)));

const originalFetch = globalThis.fetch;
let paginationCalls = 0;
let workflowRunCalls = 0;
try {
  globalThis.fetch = async url => {
    const value = String(url);
    if (value.includes('/actions/workflows/9001/runs?')) {
      workflowRunCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({workflow_runs: [{id: 7001}]}),
      };
    }
    if (value.includes('/issues/1/comments?')) {
      paginationCalls += 1;
      return {ok: true, status: 200, json: async () => []};
    }
    throw new Error(`UNEXPECTED_RUNTIME_PROBE_URL:${value}`);
  };
  const client = makeGitHubClient({repository: 'owner/repository', token: 'test-token'});
  const comments = await client.pages('/issues/1/comments');
  assert(Array.isArray(comments) && comments.length === 0 && paginationCalls === 1,
    'ATOMIC_RECOVERY_REMEDIATION_PAGINATION_RUNTIME_PROBE_FAILED');
  const runs = await client.loadWorkflowRuns(9001, 7001);
  assert(Array.isArray(runs) && runs.length === 1
    && Number(runs[0]?.id) === 7001 && workflowRunCalls === 1,
  'ATOMIC_RECOVERY_REMEDIATION_RUNSET_RUNTIME_PROBE_FAILED');
} finally {
  globalThis.fetch = originalFetch;
}

const workflow = fs.readFileSync(workflowPath, 'utf8');
const runtime = fs.readFileSync(
  new URL('./atomic-terminal-recovery-v2-runtime.mjs', import.meta.url),
  'utf8',
);
const preflight = fs.readFileSync(
  new URL('./current-sold-atomic-terminal-recovery-remediation-v1-preflight.mjs', import.meta.url),
  'utf8',
);
const publisher = fs.readFileSync(
  new URL('./current-sold-atomic-terminal-recovery-v2-publish.mjs', import.meta.url),
  'utf8',
);
const requireText = (text, marker, code) => {
  if (!text.includes(marker)) throw new Error(code);
};

requireText(runtime, '  MAX_PAGES,', 'ATOMIC_RECOVERY_REMEDIATION_MAX_PAGES_IMPORT_MISSING');
requireText(runtime, 'currentRun?.path === manifest.authorized_recovery_workflow_path',
  'ATOMIC_RECOVERY_REMEDIATION_RUNTIME_WORKFLOW_BINDING_MISSING');
requireText(workflow, 'name: KIDULTS Current-SOLD Atomic Terminal Recovery Remediation V1',
  'ATOMIC_RECOVERY_REMEDIATION_WORKFLOW_NAME_INVALID');
requireText(workflow, 'workflow_dispatch:',
  'ATOMIC_RECOVERY_REMEDIATION_DISPATCH_MISSING');
requireText(workflow, 'group: kidults-atomic-governed-landing-v1-main',
  'ATOMIC_RECOVERY_REMEDIATION_SERIALIZATION_MISSING');
requireText(workflow, 'current-sold-atomic-terminal-recovery-remediation-v1-preflight.mjs',
  'ATOMIC_RECOVERY_REMEDIATION_PREFLIGHT_STEP_MISSING');
requireText(workflow, 'Reconcile predecessor evidence without status-write authority',
  'ATOMIC_RECOVERY_REMEDIATION_RECONCILIATION_JOB_MISSING');
requireText(workflow, 'Publish distinct recovery status from sealed evidence',
  'ATOMIC_RECOVERY_REMEDIATION_PUBLICATION_JOB_MISSING');
requireText(workflow, 'needs: [reconcile-evidence]',
  'ATOMIC_RECOVERY_REMEDIATION_JOB_DEPENDENCY_MISSING');
requireText(workflow, 'statuses: read',
  'ATOMIC_RECOVERY_REMEDIATION_READ_PERMISSION_MISSING');
requireText(workflow, 'statuses: write',
  'ATOMIC_RECOVERY_REMEDIATION_WRITE_PERMISSION_MISSING');
requireText(workflow, 'preflight-receipt.json',
  'ATOMIC_RECOVERY_REMEDIATION_PREFLIGHT_RECEIPT_MISSING');
requireText(workflow, 'evidence-receipt.json',
  'ATOMIC_RECOVERY_REMEDIATION_EVIDENCE_RECEIPT_MISSING');
requireText(workflow, 'id: runtime_regressions',
  'ATOMIC_RECOVERY_REMEDIATION_RUNTIME_REGRESSION_OUTCOME_MISSING');
requireText(workflow, "if: steps.remediation_preflight.outcome == 'success' && steps.runtime_regressions.outcome == 'success'",
  'ATOMIC_RECOVERY_REMEDIATION_RECONCILE_GATE_INCOMPLETE');
requireText(workflow, 'Reconcile durable remediation terminal receipt',
  'ATOMIC_RECOVERY_REMEDIATION_TERMINAL_RECONCILIATION_MISSING');
requireText(workflow, 'terminal-receipt.json',
  'ATOMIC_RECOVERY_REMEDIATION_TERMINAL_RECEIPT_MISSING');
const remediationPreflightIndex = workflow.indexOf(
  'Verify sealed failed attempt and fresh workflow generation read-only');
const runtimeRegressionIndex = workflow.indexOf(
  'Re-run runtime and remediation contract regressions');
const terminalReconcileIndex = workflow.indexOf(
  'Reconcile durable remediation terminal receipt');
const durableUploadIndex = workflow.indexOf(
  'Upload durable read-only remediation evidence');
if (!(remediationPreflightIndex >= 0
  && remediationPreflightIndex < runtimeRegressionIndex
  && runtimeRegressionIndex < terminalReconcileIndex
  && terminalReconcileIndex < durableUploadIndex)) {
  throw new Error('ATOMIC_RECOVERY_REMEDIATION_TERMINAL_ORDER_INVALID');
}
requireText(workflow, '${{ github.run_id }}-${{ github.run_attempt }}',
  'ATOMIC_RECOVERY_REMEDIATION_ARTIFACT_RUN_BINDING_MISSING');
requireText(publisher, 'expectedRemediationEvidenceArtifactName(manifest, authority.runId)',
  'ATOMIC_RECOVERY_REMEDIATION_PUBLISHER_ARTIFACT_BINDING_MISSING');
requireText(publisher, 'pathToFileURL(process.argv[1]).href',
  'ATOMIC_RECOVERY_REMEDIATION_PUBLISHER_IMPORT_GUARD_MISSING');
if (publisher.includes('kidults-atomic-terminal-recovery-evidence-v2-${authority.runId}-1')) {
  throw new Error('ATOMIC_RECOVERY_REMEDIATION_LEGACY_ARTIFACT_BINDING_PRESENT');
}
if (/\n\s*workflow_run:/.test(workflow)) {
  throw new Error('ATOMIC_RECOVERY_REMEDIATION_WORKFLOW_RUN_CONSUMER_FORBIDDEN');
}
const readOnlySection = workflow.slice(
  workflow.indexOf('reconcile-evidence:'),
  workflow.indexOf('publish-distinct-recovery-status:'),
);
if (/statuses:\s*write/.test(readOnlySection)) {
  throw new Error('ATOMIC_RECOVERY_REMEDIATION_RECONCILIATION_HAS_WRITE_PERMISSION');
}
if (preflight.includes("method: 'POST'") || preflight.includes('statuses: write')) {
  throw new Error('ATOMIC_RECOVERY_REMEDIATION_PREFLIGHT_WRITE_PATH_FORBIDDEN');
}
assert(manifest.authorized_recovery_workflow_path === REMEDIATION_WORKFLOW_PATH,
  'ATOMIC_RECOVERY_REMEDIATION_MANIFEST_WORKFLOW_BINDING_INVALID');

console.log(JSON.stringify({
  id: 'kidults-atomic-terminal-recovery-remediation-v1-validation',
  state: 'VERIFIED_PASS',
  manifest_sha256: manifestDigest,
  failed_run_id: prior.id,
  failed_artifact_id: artifact.id,
  failed_status_write_performed: false,
  runtime_pagination_probe: 'PASS',
  runtime_workflow_run_probe: 'PASS',
  evidence_artifact_name_probe: 'PASS',
  publication_contract_probe: 'PASS',
  expected_evidence_artifact_name: expectedEvidenceArtifactName,
  negative_cases_rejected: rejected.length,
  authorized_workflow_path: REMEDIATION_WORKFLOW_PATH,
  historical_terminal_context_immutable: true,
  distinct_recovery_context_only: true,
  fresh_owner_authority_required: true,
  prior_authorization_reuse_forbidden: true,
  prior_run_rerun_forbidden: true,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
