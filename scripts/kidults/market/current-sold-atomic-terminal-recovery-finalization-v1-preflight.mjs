#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  assert,
  sha256,
  normalizeSha256,
  validateManifest,
  establishRecoveryAuthority,
  assertHistoricalRedImmutable,
  writeJsonSecure,
  baseReceipt,
} from './atomic-terminal-recovery-v2-runtime.mjs';
import {
  validateFinalizationManifest,
  validatePriorFailedRemediationRun,
  validatePriorFailedRemediationArtifacts,
  validatePriorRemediationEvidenceReceipt,
  validatePriorRemediationPublicationReceipt,
  assertPriorRecoveryFailureImmutable,
} from './atomic-terminal-recovery-finalization-v1-policy.mjs';
import {
  downloadJsonArtifact,
} from './current-sold-atomic-terminal-recovery-remediation-v1-preflight.mjs';

function writeExact(file, bytes) {
  fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
  fs.writeFileSync(file, bytes, {mode: 0o600, flag: 'wx'});
}

async function preflight(manifestFile, outputDirectory) {
  const manifestBytes = fs.readFileSync(manifestFile);
  const manifest = validateManifest(JSON.parse(manifestBytes.toString('utf8')));
  const manifestDigest = sha256(manifestBytes);
  const {prior, evidence, publication} = validateFinalizationManifest(manifest);
  const authority = await establishRecoveryAuthority(manifestFile);
  const {client, repository, token, repositoryOwner} = authority;

  const [priorRun, priorArtifacts, priorJobs, headStatus] = await Promise.all([
    client.api(`/actions/runs/${prior.id}`),
    client.api(`/actions/runs/${prior.id}/artifacts?per_page=100`),
    client.api(`/actions/runs/${prior.id}/jobs?per_page=100`),
    client.api(`/commits/${manifest.predecessor_pull_request.exact_head_sha}/status`),
  ]);
  validatePriorFailedRemediationRun(priorRun, priorJobs, repositoryOwner, manifest);
  const observedArtifacts = validatePriorFailedRemediationArtifacts(
    priorArtifacts?.artifacts, manifest);

  const sourceEvidence = await downloadJsonArtifact({
    repository,
    token,
    expected: evidence,
    entry: 'evidence-receipt.json',
  });
  const sourcePublication = await downloadJsonArtifact({
    repository,
    token,
    expected: publication,
    entry: 'publication-receipt.json',
  });
  assert(sha256(sourceEvidence.receiptBytes) === evidence.evidence_receipt_sha256,
    'ATOMIC_RECOVERY_FINALIZATION_SOURCE_EVIDENCE_BYTES_MISMATCH');
  assert(sha256(sourcePublication.receiptBytes) === publication.publication_receipt_sha256,
    'ATOMIC_RECOVERY_FINALIZATION_SOURCE_PUBLICATION_BYTES_MISMATCH');
  validatePriorRemediationEvidenceReceipt(
    sourceEvidence.receipt, manifest, repositoryOwner);
  validatePriorRemediationPublicationReceipt(sourcePublication.receipt, manifest);

  const historical = assertHistoricalRedImmutable(headStatus, manifest);
  const priorRecovery = assertPriorRecoveryFailureImmutable(headStatus, manifest);
  const sourceEvidencePath = path.join(outputDirectory, 'source-evidence-receipt.json');
  const sourcePublicationPath = path.join(outputDirectory, 'source-publication-receipt.json');
  writeExact(sourceEvidencePath, sourceEvidence.receiptBytes);
  writeExact(sourcePublicationPath, sourcePublication.receiptBytes);

  const receipt = {
    ...baseReceipt({
      id: 'kidults-atomic-terminal-recovery-finalization-preflight-receipt-v1',
      state: 'VERIFIED_PASS',
      manifest,
      manifestDigest,
      currentMainSha: authority.currentMainInput,
      runId: authority.runId,
      runAttempt: authority.runAttempt,
      authorizationId: authority.authorizationId,
    }),
    completed_at: new Date().toISOString(),
    workflow_id: Number(authority.currentRun.workflow_id),
    authorized_recovery_workflow_path: manifest.authorized_recovery_workflow_path,
    approval: authority.approval,
    one_use_dispatch: authority.oneUse,
    historical_terminal_status: historical,
    prior_recovery_failure_status: priorRecovery,
    prior_failed_remediation: {
      run_id: prior.id,
      run_attempt: prior.attempt,
      workflow_id: prior.workflow_id,
      workflow_path: prior.workflow_path,
      conclusion: prior.conclusion,
      failure_code: prior.publication_failure_code,
      evidence_artifact_id: observedArtifacts.evidence.id,
      evidence_artifact_name: observedArtifacts.evidence.name,
      evidence_artifact_digest: normalizeSha256(observedArtifacts.evidence.digest),
      evidence_receipt_sha256: sha256(sourceEvidence.receiptBytes),
      publication_artifact_id: observedArtifacts.publication.id,
      publication_artifact_name: observedArtifacts.publication.name,
      publication_artifact_digest: normalizeSha256(observedArtifacts.publication.digest),
      publication_receipt_sha256: sha256(sourcePublication.receiptBytes),
      failure_status_id: prior.recovery_failure_status.id,
      failure_status_immutable: true,
    },
    source_manifest_path: manifest.finalization_generation.source_manifest.path,
    source_manifest_digest: manifest.finalization_generation.source_manifest.digest,
    producer_publisher_predecessor_object_contract: 'VERIFIED',
    status_write_authority: false,
    status_write_performed: false,
    prior_authorization_reused: false,
    prior_run_rerun_performed: false,
  };
  writeJsonSecure(path.join(outputDirectory, 'preflight-receipt.json'), receipt);
  console.log(JSON.stringify(receipt));
}

async function main() {
  const [mode, manifestFile] = process.argv.slice(2);
  assert(mode === '--preflight' && manifestFile,
    'ATOMIC_RECOVERY_FINALIZATION_ARGUMENTS_INVALID');
  const outputDirectory = process.env.ATOMIC_TERMINAL_RECOVERY_FINALIZATION_DIR
    || 'out/atomic-terminal-recovery-finalization-v1';
  let manifest = null;
  let manifestDigest = null;
  try {
    const bytes = fs.readFileSync(manifestFile);
    manifest = validateManifest(JSON.parse(bytes.toString('utf8')));
    manifestDigest = sha256(bytes);
    await preflight(manifestFile, outputDirectory);
  } catch (error) {
    const code = String(error?.code || error?.message
      || 'ATOMIC_RECOVERY_FINALIZATION_PREFLIGHT_FAILED').split(':')[0].slice(0, 160);
    const receipt = {
      ...baseReceipt({
        id: 'kidults-atomic-terminal-recovery-finalization-preflight-receipt-v1',
        state: 'VERIFIED_FAIL',
        failureCode: code,
        manifest,
        manifestDigest,
        currentMainSha: process.env.EXPECTED_CURRENT_MAIN_SHA,
        runId: process.env.GITHUB_RUN_ID,
        runAttempt: process.env.GITHUB_RUN_ATTEMPT,
        authorizationId: process.env.RECOVERY_AUTHORIZATION_ID,
      }),
      failed_at: new Date().toISOString(),
      status_write_authority: false,
      status_write_performed: false,
      prior_authorization_reused: false,
      prior_run_rerun_performed: false,
    };
    try {
      writeJsonSecure(path.join(outputDirectory, 'preflight-receipt.json'), receipt);
    } catch {}
    console.error(code);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
