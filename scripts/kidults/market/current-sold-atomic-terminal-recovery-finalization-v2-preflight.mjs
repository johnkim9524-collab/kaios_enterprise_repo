#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {
  assert,
  fail,
  sha256,
  validateManifest,
  validatePriorRemediationRun,
  validatePriorFinalizationRun,
  validatePriorRemediationEvidenceReceipt,
  validatePriorRemediationPublicationReceipt,
  validatePriorFinalizationReceipts,
  assertHistoricalTerminalImmutable,
  assertPriorRecoveryFailureImmutable,
  writeJsonSecure,
} from './atomic-terminal-recovery-finalization-v2-policy.mjs';
import {
  baseReceipt,
  establishFinalizationAuthority,
  downloadArtifactEntry,
  writeReceiptOrFail,
} from './atomic-terminal-recovery-finalization-v2-runtime.mjs';

function writeBytesSecure(file, bytes) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  fs.chmodSync(directory, 0o700);
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(temporary, bytes, {mode: 0o600, flag: 'wx'});
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

async function preflight(manifestFile, outputPath) {
  const authority = await establishFinalizationAuthority(manifestFile);
  const {manifest, client, repositoryOwner} = authority;
  validateManifest(manifest);
  const remediation = manifest.prior_failed_remediation;
  const priorFinalization = manifest.prior_failed_finalization;
  const predecessorSha = manifest.predecessor_pull_request.exact_head_sha;

  const [remediationRun, remediationJobs, remediationArtifacts,
    finalizationRun, finalizationJobs, finalizationArtifacts,
    initialStatus] = await Promise.all([
    client.api(`/actions/runs/${remediation.run_id}`),
    client.api(`/actions/runs/${remediation.run_id}/jobs?per_page=100`),
    client.pages(`/actions/runs/${remediation.run_id}/artifacts?per_page=100`,
      'artifacts'),
    client.api(`/actions/runs/${priorFinalization.run_id}`),
    client.api(`/actions/runs/${priorFinalization.run_id}/jobs?per_page=100`),
    client.pages(`/actions/runs/${priorFinalization.run_id}/artifacts?per_page=100`,
      'artifacts'),
    client.api(`/commits/${predecessorSha}/status`),
  ]);

  validatePriorRemediationRun(remediationRun, remediationJobs,
    remediationArtifacts, repositoryOwner, manifest);
  validatePriorFinalizationRun(finalizationRun, finalizationJobs,
    finalizationArtifacts, repositoryOwner, manifest);

  const [sourceEvidence, sourcePublication,
    sourceFinalizationPreflight, sourceFinalizationTerminal] = await Promise.all([
    downloadArtifactEntry(authority, remediation.evidence_artifact,
      remediation.evidence_artifact.entry),
    downloadArtifactEntry(authority, remediation.publication_artifact,
      remediation.publication_artifact.entry),
    downloadArtifactEntry(authority, priorFinalization.evidence_artifact,
      priorFinalization.evidence_artifact.preflight_entry),
    downloadArtifactEntry(authority, priorFinalization.evidence_artifact,
      priorFinalization.evidence_artifact.terminal_entry),
  ]);

  assert(sha256(sourceEvidence.bytes) ===
    remediation.evidence_artifact.receipt_sha256,
  'ATOMIC_FINALIZATION_V2_REMEDIATION_EVIDENCE_RECEIPT_DIGEST_MISMATCH');
  assert(sha256(sourcePublication.bytes) ===
    remediation.publication_artifact.receipt_sha256,
  'ATOMIC_FINALIZATION_V2_REMEDIATION_PUBLICATION_RECEIPT_DIGEST_MISMATCH');
  assert(sha256(sourceFinalizationPreflight.bytes) ===
    priorFinalization.evidence_artifact.preflight_receipt_sha256,
  'ATOMIC_FINALIZATION_V2_PRIOR_FINALIZATION_PREFLIGHT_DIGEST_MISMATCH');
  assert(sha256(sourceFinalizationTerminal.bytes) ===
    priorFinalization.evidence_artifact.terminal_receipt_sha256,
  'ATOMIC_FINALIZATION_V2_PRIOR_FINALIZATION_TERMINAL_DIGEST_MISMATCH');

  validatePriorRemediationEvidenceReceipt(sourceEvidence.receipt,
    manifest, repositoryOwner);
  validatePriorRemediationPublicationReceipt(sourcePublication.receipt,
    manifest);
  validatePriorFinalizationReceipts(sourceFinalizationPreflight.receipt,
    sourceFinalizationTerminal.receipt, manifest);
  const historical = assertHistoricalTerminalImmutable(initialStatus, manifest);
  const priorRecovery = assertPriorRecoveryFailureImmutable(initialStatus, manifest);

  const directory = path.dirname(outputPath);
  const sourceFiles = {
    remediation_evidence:
      path.join(directory, 'source-remediation-evidence-receipt.json'),
    remediation_publication:
      path.join(directory, 'source-remediation-publication-receipt.json'),
    finalization_preflight:
      path.join(directory, 'source-finalization-v1-preflight-receipt.json'),
    finalization_terminal:
      path.join(directory, 'source-finalization-v1-terminal-receipt.json'),
  };
  writeBytesSecure(sourceFiles.remediation_evidence, sourceEvidence.bytes);
  writeBytesSecure(sourceFiles.remediation_publication, sourcePublication.bytes);
  writeBytesSecure(sourceFiles.finalization_preflight,
    sourceFinalizationPreflight.bytes);
  writeBytesSecure(sourceFiles.finalization_terminal,
    sourceFinalizationTerminal.bytes);

  const receipt = {
    ...baseReceipt({
      id: 'kidults-atomic-terminal-recovery-finalization-preflight-receipt-v2',
      state: 'VERIFIED_PASS',
      manifest,
      manifestDigest: authority.manifestDigest,
      currentMainSha: authority.currentMainInput,
      runId: authority.runId,
      runAttempt: authority.runAttempt,
      authorizationId: authority.authorizationId,
    }),
    completed_at: new Date().toISOString(),
    workflow_id: Number(authority.currentRun.workflow_id),
    workflow_path: manifest.authorized_workflow_path,
    expected_run_name: authority.expectedRunName,
    approval: authority.approval,
    one_use_dispatch: authority.oneUse,
    historical_terminal_status: historical,
    prior_recovery_failure_status: priorRecovery,
    prior_failed_remediation: {
      run_id: remediation.run_id,
      run_attempt: remediation.run_attempt,
      evidence_artifact_id: remediation.evidence_artifact.id,
      evidence_artifact_digest: remediation.evidence_artifact.digest,
      evidence_receipt_sha256: sha256(sourceEvidence.bytes),
      publication_artifact_id: remediation.publication_artifact.id,
      publication_artifact_digest: remediation.publication_artifact.digest,
      publication_receipt_sha256: sha256(sourcePublication.bytes),
    },
    prior_failed_finalization: {
      run_id: priorFinalization.run_id,
      run_attempt: priorFinalization.run_attempt,
      failure_code: priorFinalization.failure_code,
      evidence_artifact_id: priorFinalization.evidence_artifact.id,
      evidence_artifact_digest: priorFinalization.evidence_artifact.digest,
      preflight_receipt_sha256: sha256(sourceFinalizationPreflight.bytes),
      terminal_receipt_sha256: sha256(sourceFinalizationTerminal.bytes),
      run_name_mismatch_confirmed: true,
      status_write_performed: false,
      immutable: true,
    },
    source_files: Object.fromEntries(Object.entries(sourceFiles)
      .map(([key, value]) => [key, path.basename(value)])),
    status_write_authority: false,
    status_write_performed: false,
    remote_mutation_scope: 'NONE_READ_ONLY_PREFLIGHT',
  };
  writeJsonSecure(outputPath, receipt);
  console.log(JSON.stringify(receipt));
}

async function main() {
  const [mode, manifestFile] = process.argv.slice(2);
  assert(mode === '--preflight' && manifestFile,
    'ATOMIC_FINALIZATION_V2_PREFLIGHT_ARGUMENTS_INVALID');
  const outputPath = process.env.ATOMIC_FINALIZATION_V2_PREFLIGHT_RECEIPT_PATH
    || 'out/atomic-terminal-recovery-finalization-v2/preflight-receipt.json';
  let manifest = null;
  let manifestDigest = null;
  try {
    const bytes = fs.readFileSync(manifestFile);
    try { manifest = validateManifest(JSON.parse(bytes.toString('utf8'))); }
    catch (error) {
      if (error?.code) throw error;
      fail('ATOMIC_FINALIZATION_V2_MANIFEST_JSON_INVALID');
    }
    manifestDigest = sha256(bytes);
    await preflight(manifestFile, outputPath);
  } catch (error) {
    const code = String(error?.code || error?.message
      || 'ATOMIC_FINALIZATION_V2_PREFLIGHT_FAILED')
      .split(':')[0].slice(0, 160);
    const receipt = {
      ...baseReceipt({
        id: 'kidults-atomic-terminal-recovery-finalization-preflight-receipt-v2',
        state: 'VERIFIED_FAIL',
        failureCode: code,
        manifest,
        manifestDigest,
        currentMainSha: process.env.EXPECTED_CURRENT_MAIN_SHA,
        runId: process.env.GITHUB_RUN_ID,
        runAttempt: process.env.GITHUB_RUN_ATTEMPT,
        authorizationId: process.env.FINALIZATION_AUTHORIZATION_ID,
      }),
      failed_at: new Date().toISOString(),
      status_write_authority: false,
      status_write_performed: false,
      failure_status_published: false,
    };
    writeReceiptOrFail(outputPath, receipt);
    console.error(code);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
