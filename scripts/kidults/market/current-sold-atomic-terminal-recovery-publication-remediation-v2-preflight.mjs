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
  PRIOR_APPROVAL_COMMENT_ID,
  PRIOR_APPROVAL_CREATED_AT,
  PRIOR_APPROVAL_BODY_DIGEST,
  SOURCE_RECOVERY_MANIFEST_DIGEST,
  validatePublicationRemediationManifest,
  validatePriorFailedRemediationRun,
  validatePriorArtifacts,
  assertPriorRecoveryFailureBoundary,
} from './atomic-terminal-recovery-publication-remediation-v2-policy.mjs';
import {
  assertPriorEvidenceReceipt,
  assertPriorPreflightReceipt,
  assertPriorTerminalReceipt,
  assertPriorPublicationFailureReceipt,
} from './atomic-terminal-recovery-publication-remediation-v2-receipts.mjs';

function json(file, code) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw Object.assign(new Error(code), {code}); }
}
function digest(file, expected, code) {
  const observed = sha256(fs.readFileSync(file));
  assert(observed === normalizeSha256(expected), code);
  return observed;
}

export async function runPreflight(manifestFile, evidenceDir, publicationDir, outputPath) {
  const authority = await establishRecoveryAuthority(manifestFile);
  const {manifest, client, repositoryOwner, currentMainInput} = authority;
  const {prior, evidence, publication} = validatePublicationRemediationManifest(manifest);
  const [run, jobs, artifacts, statuses, main, oldApproval] = await Promise.all([
    client.api(`/actions/runs/${prior.id}`),
    client.api(`/actions/runs/${prior.id}/jobs?per_page=100`),
    client.api(`/actions/runs/${prior.id}/artifacts?per_page=100`),
    client.pages(`/commits/${manifest.predecessor_pull_request.exact_head_sha}/statuses`),
    client.api('/branches/main'),
    client.api(`/issues/comments/${prior.approval.comment_id}`),
  ]);
  assert(main?.commit?.sha === currentMainInput,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_CURRENT_MAIN_DRIFT');
  validatePriorFailedRemediationRun(run, jobs, repositoryOwner, manifest);
  validatePriorArtifacts(artifacts?.artifacts, manifest);
  assert(Number(oldApproval?.id) === PRIOR_APPROVAL_COMMENT_ID
    && oldApproval?.user?.login === repositoryOwner
    && oldApproval?.author_association === 'OWNER'
    && oldApproval?.performed_via_github_app == null
    && oldApproval?.created_at === PRIOR_APPROVAL_CREATED_AT
    && oldApproval?.updated_at === PRIOR_APPROVAL_CREATED_AT
    && sha256(String(oldApproval?.body || '')) === PRIOR_APPROVAL_BODY_DIGEST,
  'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PRIOR_APPROVAL_REMOTE_INVALID');

  const files = {
    evidence: path.join(evidenceDir, 'evidence-receipt.json'),
    preflight: path.join(evidenceDir, 'preflight-receipt.json'),
    terminal: path.join(evidenceDir, 'terminal-receipt.json'),
    publication: path.join(publicationDir, 'publication-receipt.json'),
  };
  digest(files.evidence, evidence.evidence_receipt_sha256,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_EVIDENCE_DIGEST_MISMATCH');
  digest(files.preflight, evidence.preflight_receipt_sha256,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PRIOR_PREFLIGHT_DIGEST_MISMATCH');
  digest(files.terminal, evidence.terminal_receipt_sha256,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PRIOR_TERMINAL_DIGEST_MISMATCH');
  digest(files.publication, publication.publication_receipt_sha256,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PRIOR_PUBLICATION_DIGEST_MISMATCH');
  assertPriorEvidenceReceipt(json(files.evidence,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_EVIDENCE_JSON_INVALID'), manifest, repositoryOwner);
  assertPriorPreflightReceipt(json(files.preflight,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PRIOR_PREFLIGHT_JSON_INVALID'), manifest);
  assertPriorTerminalReceipt(json(files.terminal,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PRIOR_TERMINAL_JSON_INVALID'), manifest);
  assertPriorPublicationFailureReceipt(json(files.publication,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PRIOR_PUBLICATION_JSON_INVALID'), manifest);
  const historical = assertHistoricalRedImmutable({statuses}, manifest);
  const priorFailure = assertPriorRecoveryFailureBoundary({statuses}, manifest);

  const receipt = {
    ...baseReceipt({
      id: 'kidults-atomic-terminal-recovery-publication-remediation-preflight-receipt-v2',
      state: 'VERIFIED_PASS', manifest, manifestDigest: authority.manifestDigest,
      currentMainSha: currentMainInput, runId: authority.runId,
      runAttempt: authority.runAttempt, authorizationId: authority.authorizationId,
    }),
    completed_at: new Date().toISOString(),
    workflow_id: Number(authority.currentRun.workflow_id),
    approval: authority.approval,
    one_use_dispatch: authority.oneUse,
    prior_failed_recovery: {
      run_id: prior.id,
      workflow_id: prior.workflow_id,
      head_sha: prior.head_sha,
      evidence_artifact_id: evidence.id,
      evidence_artifact_digest: evidence.digest,
      evidence_receipt_sha256: evidence.evidence_receipt_sha256,
      publication_artifact_id: publication.id,
      publication_artifact_digest: publication.digest,
      publication_receipt_sha256: publication.publication_receipt_sha256,
      failure_status_id: prior.recovery_failure_status.id,
      failure_code: prior.recovery_failure_status.description,
      source_recovery_manifest_sha256: SOURCE_RECOVERY_MANIFEST_DIGEST,
    },
    historical_terminal_status: historical,
    prior_recovery_failure_status: priorFailure,
    status_write_authority: false,
    status_write_performed: false,
    failure_status_write_forbidden: true,
    prior_authorization_reused: false,
    prior_run_rerun_performed: false,
  };
  writeJsonSecure(outputPath, receipt);
  console.log(JSON.stringify(receipt));
}

async function main() {
  const [mode, manifestFile, evidenceDir, publicationDir] = process.argv.slice(2);
  assert(mode === '--preflight' && manifestFile && evidenceDir && publicationDir,
    'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PREFLIGHT_ARGUMENTS_INVALID');
  const output = process.env.ATOMIC_TERMINAL_RECOVERY_RECEIPT_PATH
    || 'out/atomic-terminal-recovery-publication-remediation-v2/preflight-receipt.json';
  let manifest = null;
  let manifestDigest = null;
  try {
    const bytes = fs.readFileSync(manifestFile);
    manifest = validateManifest(JSON.parse(bytes.toString('utf8')));
    validatePublicationRemediationManifest(manifest);
    manifestDigest = sha256(bytes);
    await runPreflight(manifestFile, evidenceDir, publicationDir, output);
  } catch (error) {
    const code = String(error?.code || error?.message || 'ATOMIC_RECOVERY_PUBLICATION_REMEDIATION_PREFLIGHT_FAILED')
      .split(':')[0].slice(0, 120);
    const receipt = {
      ...baseReceipt({
        id: 'kidults-atomic-terminal-recovery-publication-remediation-preflight-receipt-v2',
        state: 'VERIFIED_FAIL', failureCode: code, manifest, manifestDigest,
        currentMainSha: process.env.EXPECTED_CURRENT_MAIN_SHA,
        runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
        authorizationId: process.env.RECOVERY_AUTHORIZATION_ID,
      }),
      failed_at: new Date().toISOString(),
      status_write_authority: false,
      status_write_performed: false,
      failure_status_write_attempted: false,
      failure_status_write_forbidden: true,
    };
    try { writeJsonSecure(output, receipt); } catch {}
    console.error(code);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
