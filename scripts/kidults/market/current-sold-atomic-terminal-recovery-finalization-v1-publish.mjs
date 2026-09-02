#!/usr/bin/env node
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {
  SHA256,
  RECOVERY_CONTEXT,
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
  expectedFinalizationEvidenceArtifactName,
  validateFinalizationManifest,
  validatePriorRemediationEvidenceReceipt,
  validatePriorRemediationPublicationReceipt,
  assertPriorRecoveryFailureImmutable,
  assertFinalizedRecoveryReadback,
} from './atomic-terminal-recovery-finalization-v1-policy.mjs';

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw Object.assign(new Error(code), {code}); }
}

function validatePreflightReceipt(receipt, authority, {
  artifactId,
  artifactDigest,
  artifactName,
  sourceEvidenceSha,
  sourcePublicationSha,
} = {}) {
  const {manifest} = authority;
  const {prior, evidence, publication} = validateFinalizationManifest(manifest);
  assert(receipt?.id === 'kidults-atomic-terminal-recovery-finalization-preflight-receipt-v1'
    && receipt?.version === '2.0.0'
    && receipt?.state === 'VERIFIED_PASS'
    && receipt?.failure_code == null,
  'ATOMIC_RECOVERY_FINALIZATION_PREFLIGHT_STATE_INVALID');
  assert(receipt?.repository === manifest.repository
    && receipt?.exact_current_main_sha === authority.currentMainInput
    && receipt?.recovery_manifest_sha256 === authority.manifestDigest
    && Number(receipt?.recovery_workflow_run_id) === Number(authority.runId)
    && Number(receipt?.recovery_workflow_run_attempt) === 1
    && receipt?.authorization_id_sha256 === sha256(authority.authorizationId),
  'ATOMIC_RECOVERY_FINALIZATION_PREFLIGHT_GENERATION_INVALID');
  assert(receipt?.approval?.comment_id === authority.approval.comment_id
    && receipt?.approval?.comment_body_digest === authority.approval.comment_body_digest
    && receipt?.approval?.actor === authority.repositoryOwner,
  'ATOMIC_RECOVERY_FINALIZATION_PREFLIGHT_APPROVAL_INVALID');
  assert(receipt?.one_use_dispatch?.run_id === Number(authority.runId)
    && receipt?.one_use_dispatch?.run_attempt === 1
    && receipt?.one_use_dispatch?.matching_run_count === 1
    && receipt?.one_use_dispatch?.incident_run_count === 1,
  'ATOMIC_RECOVERY_FINALIZATION_PREFLIGHT_ONE_USE_INVALID');
  assert(receipt?.historical_terminal_status?.id === manifest.historical_terminal_status.id
    && receipt?.historical_terminal_status?.immutable === true
    && receipt?.prior_recovery_failure_status?.id === prior.recovery_failure_status.id
    && receipt?.prior_recovery_failure_status?.immutable === true
    && receipt?.prior_recovery_failure_status?.prior_status_count === 1,
  'ATOMIC_RECOVERY_FINALIZATION_PREFLIGHT_STATUS_LINEAGE_INVALID');
  assert(receipt?.prior_failed_remediation?.run_id === prior.id
    && receipt?.prior_failed_remediation?.run_attempt === prior.attempt
    && receipt?.prior_failed_remediation?.workflow_id === prior.workflow_id
    && receipt?.prior_failed_remediation?.failure_code === prior.publication_failure_code
    && receipt?.prior_failed_remediation?.evidence_artifact_id === evidence.id
    && receipt?.prior_failed_remediation?.evidence_receipt_sha256 === sourceEvidenceSha
    && receipt?.prior_failed_remediation?.publication_artifact_id === publication.id
    && receipt?.prior_failed_remediation?.publication_receipt_sha256 === sourcePublicationSha
    && receipt?.prior_failed_remediation?.failure_status_id === prior.recovery_failure_status.id,
  'ATOMIC_RECOVERY_FINALIZATION_PREFLIGHT_SOURCE_BINDING_INVALID');
  assert(receipt?.status_write_authority === false
    && receipt?.status_write_performed === false
    && receipt?.prior_authorization_reused === false
    && receipt?.prior_run_rerun_performed === false,
  'ATOMIC_RECOVERY_FINALIZATION_PREFLIGHT_BOUNDARY_INVALID');
  assert(Number.isInteger(Number(artifactId)) && Number(artifactId) > 0,
    'ATOMIC_RECOVERY_FINALIZATION_EVIDENCE_ARTIFACT_ID_INVALID');
  assert(SHA256.test(normalizeSha256(artifactDigest)),
    'ATOMIC_RECOVERY_FINALIZATION_EVIDENCE_ARTIFACT_DIGEST_INVALID');
  assert(artifactName === expectedFinalizationEvidenceArtifactName(manifest, authority.runId),
    'ATOMIC_RECOVERY_FINALIZATION_EVIDENCE_ARTIFACT_NAME_INVALID');
  return receipt;
}

async function publish(manifestFile, preflightFile, sourceEvidenceFile,
  sourcePublicationFile, outputPath, mutationState) {
  let authority = await establishRecoveryAuthority(manifestFile);
  const artifactId = Number(process.env.FINALIZATION_EVIDENCE_ARTIFACT_ID || 0);
  const artifactDigest = normalizeSha256(
    process.env.FINALIZATION_EVIDENCE_ARTIFACT_DIGEST);
  const artifactName = process.env.FINALIZATION_EVIDENCE_ARTIFACT_NAME || '';
  const preflightBytes = fs.readFileSync(preflightFile);
  const sourceEvidenceBytes = fs.readFileSync(sourceEvidenceFile);
  const sourcePublicationBytes = fs.readFileSync(sourcePublicationFile);
  const preflight = parseJson(preflightBytes,
    'ATOMIC_RECOVERY_FINALIZATION_PREFLIGHT_JSON_INVALID');
  const sourceEvidence = parseJson(sourceEvidenceBytes,
    'ATOMIC_RECOVERY_FINALIZATION_SOURCE_EVIDENCE_JSON_INVALID');
  const sourcePublication = parseJson(sourcePublicationBytes,
    'ATOMIC_RECOVERY_FINALIZATION_SOURCE_PUBLICATION_JSON_INVALID');
  const sourceEvidenceSha = sha256(sourceEvidenceBytes);
  const sourcePublicationSha = sha256(sourcePublicationBytes);

  validateFinalizationManifest(authority.manifest);
  validatePriorRemediationEvidenceReceipt(
    sourceEvidence, authority.manifest, authority.repositoryOwner);
  validatePriorRemediationPublicationReceipt(sourcePublication, authority.manifest);
  validatePreflightReceipt(preflight, authority, {
    artifactId,
    artifactDigest,
    artifactName,
    sourceEvidenceSha,
    sourcePublicationSha,
  });

  const artifact = await authority.client.api(`/actions/artifacts/${artifactId}`);
  assert(artifact?.id === artifactId
    && artifact?.name === artifactName
    && normalizeSha256(artifact?.digest) === artifactDigest
    && artifact?.expired === false
    && Number(artifact?.workflow_run?.id) === Number(authority.runId)
    && artifact?.workflow_run?.head_sha === authority.currentMainInput,
  'ATOMIC_RECOVERY_FINALIZATION_EVIDENCE_ARTIFACT_METADATA_INVALID');

  const initialStatus = await authority.client.api(
    `/commits/${authority.manifest.predecessor_pull_request.exact_head_sha}/status`);
  assertHistoricalRedImmutable(initialStatus, authority.manifest);
  assertPriorRecoveryFailureImmutable(initialStatus, authority.manifest);

  const finalAuthority = await establishRecoveryAuthority(manifestFile);
  assert(finalAuthority.currentMainInput === authority.currentMainInput
    && finalAuthority.manifestDigest === authority.manifestDigest
    && finalAuthority.approval.comment_id === authority.approval.comment_id
    && finalAuthority.approval.comment_body_digest === authority.approval.comment_body_digest
    && finalAuthority.oneUse.run_id === authority.oneUse.run_id,
  'ATOMIC_RECOVERY_FINALIZATION_AUTHORITY_DRIFT_BEFORE_STATUS_WRITE');
  authority = finalAuthority;
  const finalPreStatus = await authority.client.api(
    `/commits/${authority.manifest.predecessor_pull_request.exact_head_sha}/status`);
  assertHistoricalRedImmutable(finalPreStatus, authority.manifest);
  assertPriorRecoveryFailureImmutable(finalPreStatus, authority.manifest);

  const targetUrl = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${authority.repository}/actions/runs/${authority.runId}`;
  mutationState.statusWriteAttempted = true;
  const published = await authority.client.api(
    `/statuses/${authority.manifest.predecessor_pull_request.exact_head_sha}`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        state: 'success',
        context: RECOVERY_CONTEXT,
        description: 'Recovered evidence verified; original terminal RED preserved',
        target_url: targetUrl,
      }),
    },
  );
  mutationState.publishedStatusId = Number(published?.id) || null;
  const finalStatus = await authority.client.api(
    `/commits/${authority.manifest.predecessor_pull_request.exact_head_sha}/status`);
  const historicalAfter = assertHistoricalRedImmutable(finalStatus, authority.manifest);
  const lineage = assertFinalizedRecoveryReadback(
    finalStatus, published?.id, authority.runId, authority.manifest);
  const mainAfter = await authority.client.api('/branches/main');
  assert(mainAfter?.commit?.sha === authority.currentMainInput,
    'ATOMIC_RECOVERY_FINALIZATION_CURRENT_MAIN_DRIFT_AFTER_STATUS_WRITE');

  const receipt = {
    ...baseReceipt({
      id: 'kidults-atomic-terminal-recovery-finalization-publication-receipt-v1',
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
    approval: authority.approval,
    one_use_dispatch: authority.oneUse,
    sealed_finalization_evidence: {
      artifact_id: artifactId,
      artifact_name: artifactName,
      artifact_digest: artifactDigest,
      artifact_run_id: Number(authority.runId),
      preflight_receipt_sha256: sha256(preflightBytes),
      source_evidence_receipt_sha256: sourceEvidenceSha,
      source_publication_receipt_sha256: sourcePublicationSha,
    },
    historical_terminal_status_after: historicalAfter,
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
    status_lineage_count: 2,
    latest_recovery_status: 'success',
    status_write_authority: true,
    status_write_performed: true,
    remote_mutation_scope: 'APPEND_DISTINCT_RECOVERY_SUCCESS_STATUS_ONLY',
  };
  writeJsonSecure(outputPath, receipt);
  console.log(JSON.stringify(receipt));
}

async function main() {
  const [mode, manifestFile, preflightFile, sourceEvidenceFile,
    sourcePublicationFile] = process.argv.slice(2);
  assert(mode === '--publish' && manifestFile && preflightFile
    && sourceEvidenceFile && sourcePublicationFile,
  'ATOMIC_RECOVERY_FINALIZATION_PUBLISH_ARGUMENTS_INVALID');
  const outputPath = process.env.ATOMIC_TERMINAL_RECOVERY_FINALIZATION_RECEIPT_PATH
    || 'out/atomic-terminal-recovery-finalization-v1/publication-receipt.json';
  let manifest = null;
  let manifestDigest = null;
  const mutationState = {statusWriteAttempted: false, publishedStatusId: null};
  try {
    const bytes = fs.readFileSync(manifestFile);
    manifest = validateManifest(JSON.parse(bytes.toString('utf8')));
    manifestDigest = sha256(bytes);
    await establishRecoveryAuthority(manifestFile);
    await publish(manifestFile, preflightFile, sourceEvidenceFile,
      sourcePublicationFile, outputPath, mutationState);
  } catch (error) {
    const code = String(error?.code || error?.message
      || 'ATOMIC_RECOVERY_FINALIZATION_PUBLICATION_FAILED').split(':')[0].slice(0, 160);
    const receipt = {
      ...baseReceipt({
        id: 'kidults-atomic-terminal-recovery-finalization-publication-receipt-v1',
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
      status_write_attempted: mutationState.statusWriteAttempted,
      published_status_id: mutationState.publishedStatusId,
      failure_status_published: false,
      historical_terminal_context_write_attempted: false,
      prior_recovery_failure_status_write_attempted: false,
    };
    try { writeJsonSecure(outputPath, receipt); } catch {}
    console.error(code);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
