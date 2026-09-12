#!/usr/bin/env node
import fs from 'node:fs';
import {
  SHA40,
  RECOVERY_CONTEXT,
  assert,
  sha256,
  normalizeSha256,
  writeJsonSecure,
  validateManifest,
  makeGitHubClient,
  statusesFor,
  assertHistoricalRedImmutable,
  assertRecoveryContextAbsent,
  baseReceipt,
} from './atomic-terminal-recovery-v2-runtime.mjs';
import {
  validateRemediationManifest,
  validatePriorFailedRecoveryRun,
  validatePriorFailedRecoveryArtifact,
  validatePriorFailedRecoveryReceipt,
} from './atomic-terminal-recovery-remediation-v1-policy.mjs';
import {
  validateFinalizationManifest,
  assertPriorRecoveryFailureImmutable,
} from './atomic-terminal-recovery-finalization-v1-policy.mjs';
import {
  downloadJsonArtifact,
} from './current-sold-atomic-terminal-recovery-remediation-v1-preflight.mjs';

const LIVE_AUDIT_WORKFLOW_PATH =
  '.github/workflows/kidults-current-sold-atomic-terminal-recovery-remediation-live-audit-v1.yml';
const FINALIZATION_MANIFEST_PATH =
  'coordination/kidults/market/current-sold-atomic-terminal-recovery-finalization-33603816578-v1.json';

async function main() {
  const manifestFile = process.argv[2]
    || 'coordination/kidults/market/current-sold-atomic-terminal-recovery-33603816578-v2.json';
  const outputPath = process.env.ATOMIC_TERMINAL_RECOVERY_LIVE_AUDIT_PATH
    || 'out/atomic-terminal-recovery-remediation-live-audit/receipt.json';
  const repository = process.env.GH_REPOSITORY || process.env.GITHUB_REPOSITORY || '';
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  const expectedBaseSha = process.env.EXPECTED_BASE_SHA || '';
  const expectedCandidateSha = process.env.EXPECTED_CANDIDATE_SHA || '';
  const currentRunId = process.env.GITHUB_RUN_ID || '';
  assert(repository && token && SHA40.test(expectedBaseSha)
    && SHA40.test(expectedCandidateSha) && /^\d+$/.test(currentRunId),
  'ATOMIC_RECOVERY_REMEDIATION_LIVE_AUDIT_BINDING_INVALID');
  assert(process.env.GITHUB_EVENT_NAME === 'pull_request',
    'ATOMIC_RECOVERY_REMEDIATION_LIVE_AUDIT_EVENT_INVALID');

  const manifestBytes = fs.readFileSync(manifestFile);
  const manifest = validateManifest(JSON.parse(manifestBytes.toString('utf8')));
  const manifestDigest = sha256(manifestBytes);
  const {prior, artifact} = validateRemediationManifest(manifest);
  assert(repository === manifest.repository,
    'ATOMIC_RECOVERY_REMEDIATION_LIVE_AUDIT_REPOSITORY_MISMATCH');

  const client = makeGitHubClient({repository, token});
  const [repo, main, currentRun, priorRun, priorArtifacts, priorJobs, headStatus,
    oldWorkflowRuns] = await Promise.all([
    client.api(''),
    client.api('/branches/main'),
    client.api(`/actions/runs/${currentRunId}`),
    client.api(`/actions/runs/${prior.id}`),
    client.api(`/actions/runs/${prior.id}/artifacts?per_page=100`),
    client.api(`/actions/runs/${prior.id}/jobs?per_page=100`),
    client.api(`/commits/${manifest.predecessor_pull_request.exact_head_sha}/status`),
    client.api(`/actions/workflows/${prior.workflow_id}/runs?event=workflow_dispatch&branch=main&per_page=100&page=1`),
  ]);
  const repositoryOwner = repo?.owner?.login;
  assert(repositoryOwner, 'ATOMIC_RECOVERY_REMEDIATION_LIVE_AUDIT_OWNER_INVALID');
  assert(main?.commit?.sha === expectedBaseSha,
    'ATOMIC_RECOVERY_REMEDIATION_LIVE_AUDIT_MAIN_DRIFT');
  assert(Number(currentRun?.id) === Number(currentRunId)
    && currentRun?.event === 'pull_request'
    && currentRun?.head_branch === process.env.GITHUB_HEAD_REF
    && currentRun?.head_sha === expectedCandidateSha
    && currentRun?.path === LIVE_AUDIT_WORKFLOW_PATH
    && Number(currentRun?.workflow_id) !== prior.workflow_id,
  'ATOMIC_RECOVERY_REMEDIATION_LIVE_AUDIT_CURRENT_RUN_INVALID');

  validatePriorFailedRecoveryRun(priorRun, priorJobs, repositoryOwner, manifest);
  const observedArtifact = validatePriorFailedRecoveryArtifact(
    priorArtifacts?.artifacts,
    manifest,
  );
  const downloaded = await downloadJsonArtifact({
    repository,
    token,
    expected: artifact,
    entry: 'evidence-receipt.json',
  });
  validatePriorFailedRecoveryReceipt(downloaded.receipt, manifest);

  const dispatchRuns = Array.isArray(oldWorkflowRuns?.workflow_runs)
    ? oldWorkflowRuns.workflow_runs : [];
  const incidentPrefix = `KIDULTS Atomic Terminal Recovery Run #${manifest.atomic_run.id} @ `;
  const incidentDispatches = dispatchRuns.filter(run =>
    run?.event === 'workflow_dispatch'
    && run?.head_branch === 'main'
    && String(run?.display_title || '').startsWith(incidentPrefix));
  assert(incidentDispatches.length === 1
    && Number(incidentDispatches[0]?.id) === prior.id
    && Number(incidentDispatches[0]?.run_attempt) === 1
    && incidentDispatches[0]?.conclusion === 'failure',
  'ATOMIC_RECOVERY_REMEDIATION_LIVE_AUDIT_FAILED_RUN_CARDINALITY_INVALID');

  const historical = assertHistoricalRedImmutable(headStatus, manifest);
  const recoveryEntries = statusesFor(headStatus, RECOVERY_CONTEXT);
  let recoveryBefore;
  if (recoveryEntries.length === 0) {
    recoveryBefore = assertRecoveryContextAbsent(headStatus);
  } else {
    const finalizationBytes = fs.readFileSync(FINALIZATION_MANIFEST_PATH);
    const finalizationManifest = validateManifest(
      JSON.parse(finalizationBytes.toString('utf8')));
    validateFinalizationManifest(finalizationManifest);
    assert(finalizationManifest.repository === manifest.repository
      && finalizationManifest.predecessor_pull_request.number
        === manifest.predecessor_pull_request.number
      && finalizationManifest.predecessor_pull_request.exact_head_sha
        === manifest.predecessor_pull_request.exact_head_sha,
    'ATOMIC_RECOVERY_REMEDIATION_LIVE_AUDIT_FINALIZATION_TUPLE_INVALID');
    recoveryBefore = assertPriorRecoveryFailureImmutable(
      headStatus, finalizationManifest);
  }
  const receipt = {
    ...baseReceipt({
      id: 'kidults-atomic-terminal-recovery-remediation-live-audit-receipt-v1',
      state: 'VERIFIED_PASS',
      manifest,
      manifestDigest,
      currentMainSha: expectedBaseSha,
      runId: currentRunId,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      authorizationId: null,
    }),
    completed_at: new Date().toISOString(),
    audit_event: 'pull_request',
    candidate_sha: expectedCandidateSha,
    audit_workflow_id: Number(currentRun.workflow_id),
    audit_workflow_path: currentRun.path,
    audit_workflow_generation_distinct: true,
    authorized_dispatch_workflow_path: manifest.authorized_recovery_workflow_path,
    audit_and_dispatch_workflows_separated:
      currentRun.path !== manifest.authorized_recovery_workflow_path,
    prior_failed_recovery: {
      run_id: prior.id,
      run_attempt: prior.attempt,
      workflow_id: prior.workflow_id,
      workflow_path: prior.workflow_path,
      exact_incident_dispatch_count: incidentDispatches.length,
      conclusion: prior.conclusion,
      failure_code: prior.failure_code,
      artifact_id: observedArtifact.id,
      artifact_name: observedArtifact.name,
      artifact_digest: normalizeSha256(observedArtifact.digest),
      archive_sha256: sha256(downloaded.archiveBytes),
      receipt_sha256: sha256(downloaded.receiptBytes),
      status_write_authority: false,
      status_write_performed: false,
    },
    historical_terminal_status: historical,
    recovery_status_before: recoveryBefore,
    recovery_failure_lineage_supported: recoveryEntries.length === 1,
    remote_reads_verified: true,
    artifact_download_verified: true,
    artifact_extraction_verified: true,
    status_write_authority: false,
    status_write_performed: false,
  };
  writeJsonSecure(outputPath, receipt);
  console.log(JSON.stringify(receipt));
}

try {
  await main();
} catch (error) {
  console.error(String(error?.code || error?.message
    || 'ATOMIC_RECOVERY_REMEDIATION_LIVE_AUDIT_FAILED').split(':')[0]);
  process.exit(1);
}
