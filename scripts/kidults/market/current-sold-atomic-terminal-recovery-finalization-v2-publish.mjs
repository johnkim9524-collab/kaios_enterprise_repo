#!/usr/bin/env node
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {
  SHA256,
  RECOVERY_CONTEXT,
  assert,
  fail,
  sha256,
  normalizeSha256,
  validateManifest,
  expectedEvidenceArtifactName,
  validatePriorRemediationEvidenceReceipt,
  validatePriorRemediationPublicationReceipt,
  validatePriorFinalizationReceipts,
  assertHistoricalTerminalImmutable,
  assertPriorRecoveryFailureImmutable,
  assertFinalizedReadback,
  writeJsonSecure,
} from './atomic-terminal-recovery-finalization-v2-policy.mjs';
import {
  baseReceipt,
  establishFinalizationAuthority,
  writeReceiptOrFail,
} from './atomic-terminal-recovery-finalization-v2-runtime.mjs';

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { fail(code); }
}

function validatePreflightReceipt(receipt, authority, {
  artifactId,
  artifactDigest,
  artifactName,
  remediationEvidenceSha,
  remediationPublicationSha,
  finalizationPreflightSha,
  finalizationTerminalSha,
} = {}) {
  const {manifest} = authority;
  validateManifest(manifest);
  assert(receipt?.id ===
    'kidults-atomic-terminal-recovery-finalization-preflight-receipt-v2'
    && receipt?.version === '2.0.0'
    && receipt?.state === 'VERIFIED_PASS'
    && receipt?.failure_code == null,
  'ATOMIC_FINALIZATION_V2_PREFLIGHT_STATE_INVALID');
  assert(receipt?.repository === manifest.repository
    && receipt?.exact_current_main_sha === authority.currentMainInput
    && receipt?.finalization_manifest_sha256 === authority.manifestDigest
    && Number(receipt?.finalization_workflow_run_id) === Number(authority.runId)
    && Number(receipt?.finalization_workflow_run_attempt) === 1
    && receipt?.authorization_id_sha256 === sha256(authority.authorizationId),
  'ATOMIC_FINALIZATION_V2_PREFLIGHT_GENERATION_INVALID');
  assert(Number(receipt?.workflow_id) === Number(authority.currentRun.workflow_id)
    && receipt?.workflow_path === manifest.authorized_workflow_path
    && receipt?.expected_run_name === authority.expectedRunName,
  'ATOMIC_FINALIZATION_V2_PREFLIGHT_WORKFLOW_INVALID');
  assert(receipt?.approval?.comment_id === authority.approval.comment_id
    && receipt?.approval?.comment_body_digest ===
      authority.approval.comment_body_digest
    && receipt?.approval?.actor === authority.repositoryOwner,
  'ATOMIC_FINALIZATION_V2_PREFLIGHT_APPROVAL_INVALID');
  assert(receipt?.one_use_dispatch?.run_id === Number(authority.runId)
    && receipt?.one_use_dispatch?.run_attempt === 1
    && receipt?.one_use_dispatch?.workflow_id ===
      Number(authority.currentRun.workflow_id)
    && receipt?.one_use_dispatch?.matching_run_count === 1
    && receipt?.one_use_dispatch?.incident_run_count === 1,
  'ATOMIC_FINALIZATION_V2_PREFLIGHT_ONE_USE_INVALID');
  assert(receipt?.historical_terminal_status?.id ===
    manifest.historical_terminal_status.id
    && receipt?.historical_terminal_status?.immutable === true
    && receipt?.prior_recovery_failure_status?.id ===
      manifest.prior_recovery_failure_status.id
    && receipt?.prior_recovery_failure_status?.immutable === true,
  'ATOMIC_FINALIZATION_V2_PREFLIGHT_STATUS_LINEAGE_INVALID');
  assert(receipt?.prior_failed_remediation?.run_id ===
    manifest.prior_failed_remediation.run_id
    && receipt?.prior_failed_remediation?.evidence_receipt_sha256 ===
      remediationEvidenceSha
    && receipt?.prior_failed_remediation?.publication_receipt_sha256 ===
      remediationPublicationSha,
  'ATOMIC_FINALIZATION_V2_PREFLIGHT_REMEDIATION_LINEAGE_INVALID');
  assert(receipt?.prior_failed_finalization?.run_id ===
    manifest.prior_failed_finalization.run_id
    && receipt?.prior_failed_finalization?.failure_code ===
      manifest.prior_failed_finalization.failure_code
    && receipt?.prior_failed_finalization?.preflight_receipt_sha256 ===
      finalizationPreflightSha
    && receipt?.prior_failed_finalization?.terminal_receipt_sha256 ===
      finalizationTerminalSha
    && receipt?.prior_failed_finalization?.run_name_mismatch_confirmed === true
    && receipt?.prior_failed_finalization?.status_write_performed === false
    && receipt?.prior_failed_finalization?.immutable === true,
  'ATOMIC_FINALIZATION_V2_PREFLIGHT_PRIOR_FINALIZATION_LINEAGE_INVALID');
  assert(receipt?.status_write_authority === false
    && receipt?.status_write_performed === false
    && receipt?.remote_mutation_scope === 'NONE_READ_ONLY_PREFLIGHT',
  'ATOMIC_FINALIZATION_V2_PREFLIGHT_BOUNDARY_INVALID');
  assert(Number.isInteger(Number(artifactId)) && Number(artifactId) > 0,
    'ATOMIC_FINALIZATION_V2_EVIDENCE_ARTIFACT_ID_INVALID');
  assert(SHA256.test(normalizeSha256(artifactDigest)),
    'ATOMIC_FINALIZATION_V2_EVIDENCE_ARTIFACT_DIGEST_INVALID');
  assert(artifactName === expectedEvidenceArtifactName(authority.runId, 1),
    'ATOMIC_FINALIZATION_V2_EVIDENCE_ARTIFACT_NAME_INVALID');
  return receipt;
}

async function publish(manifestFile, preflightFile, remediationEvidenceFile,
  remediationPublicationFile, finalizationPreflightFile,
  finalizationTerminalFile, outputPath, mutationState) {
  let authority = await establishFinalizationAuthority(manifestFile);
  const artifactId = Number(process.env.FINALIZATION_V2_EVIDENCE_ARTIFACT_ID || 0);
  const artifactDigest = normalizeSha256(
    process.env.FINALIZATION_V2_EVIDENCE_ARTIFACT_DIGEST);
  const artifactName = process.env.FINALIZATION_V2_EVIDENCE_ARTIFACT_NAME || '';
  const preflightBytes = fs.readFileSync(preflightFile);
  const remediationEvidenceBytes = fs.readFileSync(remediationEvidenceFile);
  const remediationPublicationBytes = fs.readFileSync(remediationPublicationFile);
  const finalizationPreflightBytes = fs.readFileSync(finalizationPreflightFile);
  const finalizationTerminalBytes = fs.readFileSync(finalizationTerminalFile);
  const preflight = parseJson(preflightBytes,
    'ATOMIC_FINALIZATION_V2_PREFLIGHT_JSON_INVALID');
  const remediationEvidence = parseJson(remediationEvidenceBytes,
    'ATOMIC_FINALIZATION_V2_REMEDIATION_EVIDENCE_JSON_INVALID');
  const remediationPublication = parseJson(remediationPublicationBytes,
    'ATOMIC_FINALIZATION_V2_REMEDIATION_PUBLICATION_JSON_INVALID');
  const finalizationPreflight = parseJson(finalizationPreflightBytes,
    'ATOMIC_FINALIZATION_V2_SOURCE_FINALIZATION_PREFLIGHT_JSON_INVALID');
  const finalizationTerminal = parseJson(finalizationTerminalBytes,
    'ATOMIC_FINALIZATION_V2_SOURCE_FINALIZATION_TERMINAL_JSON_INVALID');
  const remediationEvidenceSha = sha256(remediationEvidenceBytes);
  const remediationPublicationSha = sha256(remediationPublicationBytes);
  const finalizationPreflightSha = sha256(finalizationPreflightBytes);
  const finalizationTerminalSha = sha256(finalizationTerminalBytes);

  validateManifest(authority.manifest);
  assert(remediationEvidenceSha ===
    authority.manifest.prior_failed_remediation.evidence_artifact.receipt_sha256,
  'ATOMIC_FINALIZATION_V2_SOURCE_REMEDIATION_EVIDENCE_DIGEST_INVALID');
  assert(remediationPublicationSha ===
    authority.manifest.prior_failed_remediation.publication_artifact.receipt_sha256,
  'ATOMIC_FINALIZATION_V2_SOURCE_REMEDIATION_PUBLICATION_DIGEST_INVALID');
  assert(finalizationPreflightSha ===
    authority.manifest.prior_failed_finalization.evidence_artifact
      .preflight_receipt_sha256,
  'ATOMIC_FINALIZATION_V2_SOURCE_FINALIZATION_PREFLIGHT_DIGEST_INVALID');
  assert(finalizationTerminalSha ===
    authority.manifest.prior_failed_finalization.evidence_artifact
      .terminal_receipt_sha256,
  'ATOMIC_FINALIZATION_V2_SOURCE_FINALIZATION_TERMINAL_DIGEST_INVALID');
  validatePriorRemediationEvidenceReceipt(remediationEvidence,
    authority.manifest, authority.repositoryOwner);
  validatePriorRemediationPublicationReceipt(remediationPublication,
    authority.manifest);
  validatePriorFinalizationReceipts(finalizationPreflight,
    finalizationTerminal, authority.manifest);
  validatePreflightReceipt(preflight, authority, {
    artifactId,
    artifactDigest,
    artifactName,
    remediationEvidenceSha,
    remediationPublicationSha,
    finalizationPreflightSha,
    finalizationTerminalSha,
  });

  const artifact = await authority.client.api(`/actions/artifacts/${artifactId}`);
  assert(Number(artifact?.id) === artifactId
    && artifact?.name === artifactName
    && normalizeSha256(artifact?.digest) === artifactDigest
    && artifact?.expired === false
    && Number(artifact?.workflow_run?.id) === Number(authority.runId)
    && artifact?.workflow_run?.head_sha === authority.currentMainInput,
  'ATOMIC_FINALIZATION_V2_EVIDENCE_ARTIFACT_METADATA_INVALID');

  const statusSha = authority.manifest.predecessor_pull_request.exact_head_sha;
  const initialStatus = await authority.client.api(`/commits/${statusSha}/status`);
  assertHistoricalTerminalImmutable(initialStatus, authority.manifest);
  assertPriorRecoveryFailureImmutable(initialStatus, authority.manifest);

  const finalAuthority = await establishFinalizationAuthority(manifestFile);
  assert(finalAuthority.currentMainInput === authority.currentMainInput
    && finalAuthority.manifestDigest === authority.manifestDigest
    && finalAuthority.approval.comment_id === authority.approval.comment_id
    && finalAuthority.approval.comment_body_digest ===
      authority.approval.comment_body_digest
    && finalAuthority.oneUse.run_id === authority.oneUse.run_id
    && finalAuthority.expectedRunName === authority.expectedRunName,
  'ATOMIC_FINALIZATION_V2_AUTHORITY_DRIFT_BEFORE_STATUS_WRITE');
  authority = finalAuthority;
  const finalPreStatus = await authority.client.api(`/commits/${statusSha}/status`);
  assertHistoricalTerminalImmutable(finalPreStatus, authority.manifest);
  assertPriorRecoveryFailureImmutable(finalPreStatus, authority.manifest);

  const targetUrl = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${authority.repository}/actions/runs/${authority.runId}`;
  mutationState.statusWriteAttempted = true;
  const published = await authority.client.api(`/statuses/${statusSha}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      state: 'success',
      context: RECOVERY_CONTEXT,
      description: 'Recovery evidence finalized V2; historical failures preserved',
      target_url: targetUrl,
    }),
  });
  mutationState.publishedStatusId = Number(published?.id) || null;

  const [finalCombinedStatus, finalRawStatusHistory, mainAfter] = await Promise.all([
    authority.client.api(`/commits/${statusSha}/status`),
    authority.client.pages(`/commits/${statusSha}/statuses?per_page=100`),
    authority.client.api('/branches/main'),
  ]);
  const lineage = assertFinalizedReadback(finalCombinedStatus,
    finalRawStatusHistory, published?.id, authority.runId, authority.manifest);
  assert(mainAfter?.commit?.sha === authority.currentMainInput,
    'ATOMIC_FINALIZATION_V2_CURRENT_MAIN_DRIFT_AFTER_STATUS_WRITE');

  const receipt = {
    ...baseReceipt({
      id: 'kidults-atomic-terminal-recovery-finalization-publication-receipt-v2',
      state: 'VERIFIED_PASS',
      manifest: authority.manifest,
      manifestDigest: authority.manifestDigest,
      currentMainSha: authority.currentMainInput,
      runId: authority.runId,
      runAttempt: authority.runAttempt,
      authorizationId: authority.authorizationId,
    }),
    completed_at: new Date().toISOString(),
    workflow_id: Number(authority.currentRun.workflow_id),
    workflow_path: authority.manifest.authorized_workflow_path,
    expected_run_name: authority.expectedRunName,
    approval: authority.approval,
    one_use_dispatch: authority.oneUse,
    sealed_finalization_evidence: {
      artifact_id: artifactId,
      artifact_name: artifactName,
      artifact_digest: artifactDigest,
      artifact_run_id: Number(authority.runId),
      preflight_receipt_sha256: sha256(preflightBytes),
      remediation_evidence_receipt_sha256: remediationEvidenceSha,
      remediation_publication_receipt_sha256: remediationPublicationSha,
      prior_finalization_preflight_receipt_sha256: finalizationPreflightSha,
      prior_finalization_terminal_receipt_sha256: finalizationTerminalSha,
    },
    historical_terminal_status_after: lineage.historical,
    prior_recovery_failure_status_after: {
      id: Number(lineage.prior.id),
      state: lineage.prior.state,
      immutable: true,
    },
    recovery_success_status: {
      id: Number(lineage.latest.id),
      context: RECOVERY_CONTEXT,
      state: 'success',
      target_url: lineage.latest.target_url,
    },
    status_lineage_count: lineage.lineage_count,
    latest_recovery_status: 'success',
    status_write_authority: true,
    status_write_performed: true,
    remote_mutation_scope: 'APPEND_ONE_RECOVERY_SUCCESS_STATUS_ONLY',
  };
  writeJsonSecure(outputPath, receipt);
  console.log(JSON.stringify(receipt));
}

async function main() {
  const [mode, manifestFile, preflightFile, remediationEvidenceFile,
    remediationPublicationFile, finalizationPreflightFile,
    finalizationTerminalFile] = process.argv.slice(2);
  assert(mode === '--publish' && manifestFile && preflightFile
    && remediationEvidenceFile && remediationPublicationFile
    && finalizationPreflightFile && finalizationTerminalFile,
  'ATOMIC_FINALIZATION_V2_PUBLISH_ARGUMENTS_INVALID');
  const outputPath = process.env.ATOMIC_FINALIZATION_V2_PUBLICATION_RECEIPT_PATH
    || 'out/atomic-terminal-recovery-finalization-v2/publication-receipt.json';
  let manifest = null;
  let manifestDigest = null;
  const mutationState = {statusWriteAttempted: false, publishedStatusId: null};
  try {
    const bytes = fs.readFileSync(manifestFile);
    try { manifest = validateManifest(JSON.parse(bytes.toString('utf8'))); }
    catch (error) {
      if (error?.code) throw error;
      fail('ATOMIC_FINALIZATION_V2_MANIFEST_JSON_INVALID');
    }
    manifestDigest = sha256(bytes);
    await publish(manifestFile, preflightFile, remediationEvidenceFile,
      remediationPublicationFile, finalizationPreflightFile,
      finalizationTerminalFile, outputPath, mutationState);
  } catch (error) {
    const code = String(error?.code || error?.message
      || 'ATOMIC_FINALIZATION_V2_PUBLICATION_FAILED')
      .split(':')[0].slice(0, 160);
    const receipt = {
      ...baseReceipt({
        id: 'kidults-atomic-terminal-recovery-finalization-publication-receipt-v2',
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
      status_write_attempted: mutationState.statusWriteAttempted,
      published_status_id: mutationState.publishedStatusId,
      failure_status_published: false,
      historical_terminal_context_write_attempted: false,
      prior_recovery_failure_status_write_attempted: false,
    };
    writeReceiptOrFail(outputPath, receipt);
    console.error(code);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
