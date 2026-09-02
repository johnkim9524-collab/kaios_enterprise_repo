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
  RECOVERY_SUCCESS_DESCRIPTION,
  expectedPublicationRemediationArtifactName,
  validatePublicationRemediationManifest,
  assertPriorRecoveryFailureBoundary,
  assertRecoverySuccessAfterPriorFailure,
} from './atomic-terminal-recovery-publication-remediation-v2-policy.mjs';
import {
  assertCurrentPreflightReceipt,
} from './atomic-terminal-recovery-publication-remediation-v2-receipts.mjs';

function json(file, code) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw Object.assign(new Error(code), {code}); }
}

async function verifyReadback(authority, publishedId) {
  let last;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const [history, combined, main] = await Promise.all([
        authority.client.pages(
          `/commits/${authority.manifest.predecessor_pull_request.exact_head_sha}/statuses`),
        authority.client.api(
          `/commits/${authority.manifest.predecessor_pull_request.exact_head_sha}/status`),
        authority.client.api('/branches/main'),
      ]);
      const result = assertRecoverySuccessAfterPriorFailure(
        {statuses: history}, authority.manifest, publishedId, authority.runId);
      assertHistoricalRedImmutable({statuses: history}, authority.manifest);
      const latest = (combined?.statuses || []).find(x => x?.context === RECOVERY_CONTEXT);
      assert(Number(latest?.id) === Number(publishedId) && latest?.state === 'success',
        'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_COMBINED_STATUS_INVALID');
      assert(main?.commit?.sha === authority.currentMainInput,
        'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_MAIN_DRIFT_AFTER_WRITE');
      return result;
    } catch (error) {
      last = error;
      if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 300 * attempt));
    }
  }
  throw last;
}

export async function runPublication(manifestFile, sealedPreflightFile, outputPath, state) {
  let authority = await establishRecoveryAuthority(manifestFile);
  state.authorityEstablished = true;
  validatePublicationRemediationManifest(authority.manifest);
  const artifactId = Number(process.env.PREFLIGHT_ARTIFACT_ID || 0);
  const artifactDigest = normalizeSha256(process.env.PREFLIGHT_ARTIFACT_DIGEST);
  const artifactName = process.env.PREFLIGHT_ARTIFACT_NAME || '';
  const receiptSha = normalizeSha256(process.env.PREFLIGHT_RECEIPT_SHA256);
  const bytes = fs.readFileSync(sealedPreflightFile);
  assert(sha256(bytes) === receiptSha,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PREFLIGHT_BYTES_MISMATCH');
  assertCurrentPreflightReceipt(json(sealedPreflightFile,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PREFLIGHT_JSON_INVALID'), authority);
  assert(Number.isInteger(artifactId) && artifactId > 0,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PREFLIGHT_ARTIFACT_ID_INVALID');
  assert(SHA256.test(artifactDigest) && SHA256.test(receiptSha),
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PREFLIGHT_DIGEST_INVALID');
  assert(artifactName === expectedPublicationRemediationArtifactName(authority.runId),
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PREFLIGHT_ARTIFACT_NAME_INVALID');
  const artifact = await authority.client.api(`/actions/artifacts/${artifactId}`);
  assert(Number(artifact?.id) === artifactId && artifact?.name === artifactName
    && normalizeSha256(artifact?.digest) === artifactDigest && artifact?.expired === false
    && Number(artifact?.workflow_run?.id) === Number(authority.runId)
    && artifact?.workflow_run?.head_sha === authority.currentMainInput,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PREFLIGHT_ARTIFACT_BINDING_INVALID');

  const before = {statuses: await authority.client.pages(
    `/commits/${authority.manifest.predecessor_pull_request.exact_head_sha}/statuses`)};
  assertHistoricalRedImmutable(before, authority.manifest);
  assertPriorRecoveryFailureBoundary(before, authority.manifest);
  const finalAuthority = await establishRecoveryAuthority(manifestFile);
  assert(finalAuthority.currentMainInput === authority.currentMainInput
    && finalAuthority.manifestDigest === authority.manifestDigest
    && finalAuthority.approval.comment_id === authority.approval.comment_id
    && finalAuthority.approval.comment_body_digest === authority.approval.comment_body_digest
    && finalAuthority.oneUse.run_id === authority.oneUse.run_id,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_AUTHORITY_DRIFT_BEFORE_WRITE');
  authority = finalAuthority;
  const finalBefore = {statuses: await authority.client.pages(
    `/commits/${authority.manifest.predecessor_pull_request.exact_head_sha}/statuses`)};
  const historicalBefore = assertHistoricalRedImmutable(finalBefore, authority.manifest);
  const priorFailureBefore = assertPriorRecoveryFailureBoundary(finalBefore, authority.manifest);

  const targetUrl = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}`
    + `/${authority.repository}/actions/runs/${authority.runId}`;
  state.successStatusPostAttempted = true;
  const published = await authority.client.api(
    `/statuses/${authority.manifest.predecessor_pull_request.exact_head_sha}`,
    {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
      state: 'success', context: RECOVERY_CONTEXT,
      description: RECOVERY_SUCCESS_DESCRIPTION, target_url: targetUrl,
    })},
  );
  assert(Number.isInteger(Number(published?.id)) && Number(published.id) > 0,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_STATUS_RESPONSE_INVALID');
  const {latest, prior} = await verifyReadback(authority, published.id);
  const receipt = {
    ...baseReceipt({
      id: 'kidults-atomic-terminal-recovery-publication-remediation-receipt-v2',
      state: 'VERIFIED_PASS', manifest: authority.manifest,
      manifestDigest: authority.manifestDigest, currentMainSha: authority.currentMainInput,
      runId: authority.runId, runAttempt: authority.runAttempt,
      authorizationId: authority.authorizationId,
    }),
    completed_at: new Date().toISOString(),
    workflow_id: Number(authority.currentRun.workflow_id),
    approval: authority.approval,
    one_use_dispatch: authority.oneUse,
    sealed_preflight: {
      receipt_sha256: receiptSha, artifact_id: artifactId, artifact_name: artifactName,
      artifact_digest: artifactDigest, artifact_run_id: Number(authority.runId),
    },
    historical_terminal_status_before: historicalBefore,
    historical_terminal_status_after: {...historicalBefore, immutable: true},
    prior_recovery_failure_status_before: priorFailureBefore,
    prior_recovery_failure_status_after: {
      id: Number(prior.id), context: RECOVERY_CONTEXT, state: 'failure', immutable: true,
    },
    recovery_success_status: {
      id: Number(latest.id), context: RECOVERY_CONTEXT, state: 'success',
      description: RECOVERY_SUCCESS_DESCRIPTION, target_url: latest.target_url,
    },
    status_write_authority: true,
    status_write_performed: true,
    failure_status_write_attempted: false,
    remote_mutation_scope: 'ONE_DISTINCT_RECOVERY_SUCCESS_STATUS_ONLY',
  };
  writeJsonSecure(outputPath, receipt);
  console.log(JSON.stringify(receipt));
}

async function main() {
  const [mode, manifestFile, sealedPreflightFile] = process.argv.slice(2);
  assert(mode === '--publish' && manifestFile && sealedPreflightFile,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PUBLISH_ARGUMENTS_INVALID');
  const output = process.env.ATOMIC_TERMINAL_RECOVERY_RECEIPT_PATH
    || 'out/atomic-terminal-recovery-publication-remediation-v2/publication-receipt.json';
  let manifest = null;
  let manifestDigest = null;
  const state = {authorityEstablished: false, successStatusPostAttempted: false};
  try {
    const bytes = fs.readFileSync(manifestFile);
    manifest = validateManifest(JSON.parse(bytes.toString('utf8')));
    validatePublicationRemediationManifest(manifest);
    manifestDigest = sha256(bytes);
    await runPublication(manifestFile, sealedPreflightFile, output, state);
  } catch (error) {
    const code = String(error?.code || error?.message
      || 'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_FAILED').split(':')[0].slice(0, 120);
    const receipt = {
      ...baseReceipt({
        id: 'kidults-atomic-terminal-recovery-publication-remediation-receipt-v2',
        state: 'VERIFIED_FAIL', failureCode: code, manifest, manifestDigest,
        currentMainSha: process.env.EXPECTED_CURRENT_MAIN_SHA,
        runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
        authorizationId: process.env.RECOVERY_AUTHORIZATION_ID,
      }),
      failed_at: new Date().toISOString(),
      status_write_authority_established: state.authorityEstablished,
      success_status_post_attempted: state.successStatusPostAttempted,
      failure_status_write_attempted: false,
      failure_status_write_forbidden: true,
    };
    try { writeJsonSecure(output, receipt); } catch {}
    console.error(code);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
