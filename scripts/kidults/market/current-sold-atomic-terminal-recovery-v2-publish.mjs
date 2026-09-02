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
  assertRecoveryContextAbsent,
  assertRecoverySuccessReadback,
  writeJsonSecure,
  baseReceipt,
} from './atomic-terminal-recovery-v2-runtime.mjs';
import {
  expectedRemediationEvidenceArtifactName,
} from './atomic-terminal-recovery-remediation-v1-policy.mjs';

export function assertEvidenceReceipt(receipt, authority, {
  artifactId,
  artifactDigest,
  artifactName,
  receiptSha,
} = {}) {
  const {manifest} = authority;
  assert(receipt?.id === 'kidults-atomic-terminal-recovery-evidence-receipt-v2'
    && receipt?.version === '2.0.0' && receipt?.state === 'VERIFIED_PASS',
  'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_STATE_INVALID');
  const predecessorAtomicRun = receipt?.predecessor_atomic_run;
  assert(receipt?.repository === manifest.repository
    && Number(receipt?.predecessor_pull_request) === manifest.predecessor_pull_request.number
    && predecessorAtomicRun && typeof predecessorAtomicRun === 'object'
    && !Array.isArray(predecessorAtomicRun)
    && Number(predecessorAtomicRun?.id) === manifest.atomic_run.id
    && Number(predecessorAtomicRun?.attempt) === manifest.atomic_run.attempt
    && predecessorAtomicRun?.conclusion === manifest.atomic_run.expected_conclusion
    && predecessorAtomicRun?.actor === authority.repositoryOwner
    && receipt?.predecessor_merge_sha === manifest.predecessor_pull_request.merge_commit_sha,
  'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_PREDECESSOR_MISMATCH');
  assert(receipt?.exact_current_main_sha === authority.currentMainInput
    && receipt?.recovery_manifest_sha256 === authority.manifestDigest,
  'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_CURRENT_GENERATION_MISMATCH');
  assert(Number(receipt?.recovery_workflow_run_id) === Number(authority.runId)
    && Number(receipt?.recovery_workflow_run_attempt) === 1,
  'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_RUN_MISMATCH');
  assert(receipt?.authorization_id_sha256 === sha256(authority.authorizationId),
    'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_AUTHORIZATION_MISMATCH');
  assert(receipt?.approval?.comment_id === authority.approval.comment_id
    && receipt?.approval?.comment_body_digest === authority.approval.comment_body_digest
    && receipt?.approval?.actor === authority.repositoryOwner,
  'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_APPROVAL_MISMATCH');
  assert(receipt?.one_use_dispatch?.run_id === Number(authority.runId)
    && receipt?.one_use_dispatch?.run_attempt === 1
    && receipt?.one_use_dispatch?.matching_run_count === 1
    && receipt?.one_use_dispatch?.incident_run_count === 1,
  'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_ONE_USE_MISMATCH');
  assert(receipt?.historical_terminal_status?.id === manifest.historical_terminal_status.id
    && receipt?.historical_terminal_status?.immutable === true
    && receipt?.recovery_status_before?.prior_status_count === 0,
  'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_STATUS_BOUNDARY_INVALID');
  assert(receipt?.postlanding_proof?.state === 'VERIFIED_PASS'
    && receipt?.postlanding_proof?.tests_passed === 56
    && receipt?.postlanding_proof?.tests_failed === 0
    && receipt?.classifier?.result === 'PASS'
    && receipt?.classifier?.matcher_surfaces_verified === 3,
  'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_PROOF_INVALID');
  assert(receipt?.status_write_authority === false && receipt?.status_write_performed === false,
    'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_WRITE_AUTHORITY_INVALID');
  assert(receipt?.historical_terminal_context_mutated === false
    && receipt?.merge_reexecuted === false
    && receipt?.landing_authorization_reused === false,
  'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_BOUNDARY_INVALID');
  assert(Number.isInteger(Number(artifactId)) && Number(artifactId) > 0,
    'ATOMIC_RECOVERY_EVIDENCE_ARTIFACT_ID_INVALID');
  assert(SHA256.test(normalizeSha256(artifactDigest)),
    'ATOMIC_RECOVERY_EVIDENCE_ARTIFACT_DIGEST_INVALID');
  assert(artifactName === expectedRemediationEvidenceArtifactName(manifest, authority.runId),
    'ATOMIC_RECOVERY_EVIDENCE_ARTIFACT_NAME_INVALID');
  assert(SHA256.test(receiptSha), 'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_DIGEST_INVALID');
  return receipt;
}

async function publish(manifestFile, evidenceFile, outputPath) {
  let authority = await establishRecoveryAuthority(manifestFile);
  const artifactId = Number(process.env.EVIDENCE_ARTIFACT_ID || 0);
  const artifactDigest = normalizeSha256(process.env.EVIDENCE_ARTIFACT_DIGEST);
  const artifactName = process.env.EVIDENCE_ARTIFACT_NAME || '';
  const receiptSha = normalizeSha256(process.env.EVIDENCE_RECEIPT_SHA256);
  const evidenceBytes = fs.readFileSync(evidenceFile);
  assert(sha256(evidenceBytes) === receiptSha,
    'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_BYTES_MISMATCH');
  let evidence;
  try { evidence = JSON.parse(evidenceBytes.toString('utf8')); }
  catch { throw Object.assign(new Error('ATOMIC_RECOVERY_EVIDENCE_RECEIPT_JSON_INVALID'),
    {code: 'ATOMIC_RECOVERY_EVIDENCE_RECEIPT_JSON_INVALID'}); }
  assertEvidenceReceipt(evidence, authority, {
    artifactId, artifactDigest, artifactName, receiptSha,
  });

  const artifact = await authority.client.api(`/actions/artifacts/${artifactId}`);
  assert(artifact?.id === artifactId && artifact?.name === artifactName
    && normalizeSha256(artifact?.digest) === artifactDigest
    && artifact?.expired === false,
  'ATOMIC_RECOVERY_EVIDENCE_ARTIFACT_METADATA_INVALID');
  assert(Number(artifact?.workflow_run?.id) === Number(authority.runId)
    && artifact?.workflow_run?.head_sha === authority.currentMainInput,
  'ATOMIC_RECOVERY_EVIDENCE_ARTIFACT_RUN_BINDING_INVALID');

  const initialStatus = await authority.client.api(
    `/commits/${authority.manifest.predecessor_pull_request.exact_head_sha}/status`);
  assertHistoricalRedImmutable(initialStatus, authority.manifest);
  assertRecoveryContextAbsent(initialStatus);

  // A second full authority read is intentionally performed immediately before
  // the only remote mutation. Approval expiry, current-main drift, actor drift,
  // duplicate dispatches, or comment edits therefore fail closed.
  const finalAuthority = await establishRecoveryAuthority(manifestFile);
  assert(finalAuthority.currentMainInput === authority.currentMainInput
    && finalAuthority.manifestDigest === authority.manifestDigest
    && finalAuthority.approval.comment_id === authority.approval.comment_id
    && finalAuthority.approval.comment_body_digest === authority.approval.comment_body_digest
    && finalAuthority.oneUse.run_id === authority.oneUse.run_id,
  'ATOMIC_RECOVERY_AUTHORITY_DRIFT_BEFORE_STATUS_WRITE');
  authority = finalAuthority;
  const finalPreStatus = await authority.client.api(
    `/commits/${authority.manifest.predecessor_pull_request.exact_head_sha}/status`);
  assertHistoricalRedImmutable(finalPreStatus, authority.manifest);
  assertRecoveryContextAbsent(finalPreStatus);

  const targetUrl = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${authority.repository}/actions/runs/${authority.runId}`;
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
  const finalStatus = await authority.client.api(
    `/commits/${authority.manifest.predecessor_pull_request.exact_head_sha}/status`);
  const historicalAfter = assertHistoricalRedImmutable(finalStatus, authority.manifest);
  const recoveryAfter = assertRecoverySuccessReadback(
    finalStatus, published?.id, authority.runId);
  const mainAfter = await authority.client.api('/branches/main');
  assert(mainAfter?.commit?.sha === authority.currentMainInput,
    'ATOMIC_RECOVERY_CURRENT_MAIN_DRIFT_AFTER_STATUS_WRITE');

  const receipt = {
    ...baseReceipt({
      id: 'kidults-atomic-terminal-recovery-publication-receipt-v2',
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
    sealed_evidence: {
      receipt_sha256: receiptSha,
      artifact_id: artifactId,
      artifact_name: artifactName,
      artifact_digest: artifactDigest,
      artifact_run_id: Number(authority.runId),
    },
    historical_terminal_status_before: evidence.historical_terminal_status,
    historical_terminal_status_after: historicalAfter,
    recovery_success_status: {
      id: Number(recoveryAfter.id),
      context: RECOVERY_CONTEXT,
      state: 'success',
      target_url: recoveryAfter.target_url,
    },
    status_write_authority: true,
    status_write_performed: true,
    remote_mutation_scope: 'DISTINCT_RECOVERY_STATUS_ONLY',
  };
  writeJsonSecure(outputPath, receipt);
  console.log(JSON.stringify(receipt));
}

async function main() {
  const [mode, manifestFile, evidenceFile] = process.argv.slice(2);
  assert(mode === '--publish' && manifestFile && evidenceFile,
    'ATOMIC_RECOVERY_PUBLISH_ARGUMENTS_INVALID');
  const outputPath = process.env.ATOMIC_TERMINAL_RECOVERY_RECEIPT_PATH
    || 'out/atomic-terminal-recovery-v2/publication-receipt.json';
  let manifest = null;
  let manifestDigest = null;
  let authorityEstablished = false;
  try {
    const bytes = fs.readFileSync(manifestFile);
    manifest = validateManifest(JSON.parse(bytes.toString('utf8')));
    manifestDigest = sha256(bytes);
    // This dry establishment is repeated inside publish immediately before write.
    await establishRecoveryAuthority(manifestFile);
    authorityEstablished = true;
    await publish(manifestFile, evidenceFile, outputPath);
  } catch (error) {
    const code = String(error?.code || error?.message || 'ATOMIC_RECOVERY_PUBLICATION_FAILED')
      .split(':')[0].slice(0, 120);
    const receipt = {
      ...baseReceipt({
        id: 'kidults-atomic-terminal-recovery-publication-receipt-v2',
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
      status_write_authority_established: authorityEstablished,
      distinct_recovery_failure_status_attempted: false,
    };
    // Once fresh Owner authority is proven, a later publication uncertainty is
    // made fail-closed in the distinct recovery context only. The historical
    // terminal context is never a write target.
    if (authorityEstablished && manifest && process.env.GH_TOKEN) {
      receipt.distinct_recovery_failure_status_attempted = true;
      try {
        const response = await fetch(
          `https://api.github.com/repos/${manifest.repository}/statuses/${manifest.predecessor_pull_request.exact_head_sha}`,
          {
            method: 'POST', redirect: 'error',
            headers: {
              Authorization: `Bearer ${process.env.GH_TOKEN}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'kidults-atomic-terminal-recovery-v2',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              state: 'failure', context: RECOVERY_CONTEXT, description: code,
              target_url: `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${manifest.repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
            }),
          },
        );
        await response.arrayBuffer().catch(() => null);
        receipt.distinct_recovery_failure_status_http_status = response.status;
      } catch {}
    }
    try { writeJsonSecure(outputPath, receipt); } catch {}
    console.error(code);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
