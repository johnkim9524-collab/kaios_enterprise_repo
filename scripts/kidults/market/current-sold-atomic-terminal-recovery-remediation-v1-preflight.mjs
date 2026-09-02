#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  SHA40,
  assert,
  sha256,
  normalizeSha256,
  writeJsonSecure,
  validateManifest,
  buildRecoveryRunName,
  makeGitHubClient,
  allowedArtifactRedirect,
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

async function downloadJsonArtifact({repository, token, expected, entry}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kidults-atomic-terminal-recovery-remediation-v1',
  };
  const first = await fetch(
    `https://api.github.com/repos/${repository}/actions/artifacts/${expected.id}/zip`,
    {headers, redirect: 'manual'},
  );
  let response = first;
  if (first.status >= 300 && first.status < 400) {
    response = await fetch(allowedArtifactRedirect(first.headers.get('location') || ''),
      {redirect: 'error'});
  }
  assert(response.ok, `ATOMIC_RECOVERY_REMEDIATION_ARTIFACT_DOWNLOAD_${response.status}`);
  const archiveBytes = Buffer.from(await response.arrayBuffer());
  assert(sha256(archiveBytes) === normalizeSha256(expected.digest),
    'ATOMIC_RECOVERY_REMEDIATION_ARTIFACT_ARCHIVE_DIGEST_MISMATCH');

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-recovery-remediation-v1-'));
  try {
    const zip = path.join(directory, 'artifact.zip');
    fs.writeFileSync(zip, archiveBytes, {mode: 0o600, flag: 'wx'});
    const unzip = spawnSync('unzip', ['-p', zip, entry], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
    assert(!unzip.error && unzip.status === 0,
      'ATOMIC_RECOVERY_REMEDIATION_ARTIFACT_EXTRACTION_FAILED');
    const receiptBytes = Buffer.from(unzip.stdout, 'utf8');
    let receipt;
    try {
      receipt = JSON.parse(receiptBytes.toString('utf8'));
    } catch {
      throw Object.assign(new Error('ATOMIC_RECOVERY_REMEDIATION_ARTIFACT_RECEIPT_INVALID'), {
        code: 'ATOMIC_RECOVERY_REMEDIATION_ARTIFACT_RECEIPT_INVALID',
      });
    }
    return {receipt, receiptBytes, archiveBytes};
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

async function preflight(manifestFile, outputPath) {
  const repository = process.env.GH_REPOSITORY || process.env.GITHUB_REPOSITORY || '';
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  const currentMainInput = process.env.EXPECTED_CURRENT_MAIN_SHA || '';
  const authorizationId = process.env.RECOVERY_AUTHORIZATION_ID || '';
  const runId = process.env.GITHUB_RUN_ID || '';
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT || '';
  assert(repository && token && SHA40.test(currentMainInput),
    'ATOMIC_RECOVERY_REMEDIATION_RUNTIME_BINDING_INVALID');
  assert(/^\d+$/.test(runId) && Number(runAttempt) === 1,
    'ATOMIC_RECOVERY_REMEDIATION_EXECUTOR_IDENTITY_INVALID');
  assert(process.env.GITHUB_REF === 'refs/heads/main',
    'ATOMIC_RECOVERY_REMEDIATION_MAIN_REF_REQUIRED');

  const manifestBytes = fs.readFileSync(manifestFile);
  const manifest = validateManifest(JSON.parse(manifestBytes.toString('utf8')));
  const manifestDigest = sha256(manifestBytes);
  const {prior, artifact} = validateRemediationManifest(manifest);
  assert(repository === manifest.repository,
    'ATOMIC_RECOVERY_REMEDIATION_REPOSITORY_MISMATCH');

  const expectedRunName = buildRecoveryRunName({
    predecessorRunId: manifest.atomic_run.id,
    currentMainSha: currentMainInput,
    authorizationId,
  });
  const client = makeGitHubClient({repository, token});
  const [repo, main, currentRun, priorRun, priorArtifacts, priorJobs, headStatus] =
    await Promise.all([
      client.api(''),
      client.api('/branches/main'),
      client.api(`/actions/runs/${runId}`),
      client.api(`/actions/runs/${prior.id}`),
      client.api(`/actions/runs/${prior.id}/artifacts?per_page=100`),
      client.api(`/actions/runs/${prior.id}/jobs?per_page=100`),
      client.api(`/commits/${manifest.predecessor_pull_request.exact_head_sha}/status`),
    ]);

  const repositoryOwner = repo?.owner?.login;
  assert(repositoryOwner, 'ATOMIC_RECOVERY_REMEDIATION_REPOSITORY_OWNER_INVALID');
  assert(main?.commit?.sha === currentMainInput,
    'ATOMIC_RECOVERY_REMEDIATION_CURRENT_MAIN_DRIFT');
  assert(Number(currentRun?.id) === Number(runId)
    && Number(currentRun?.run_attempt) === 1
    && currentRun?.path === manifest.authorized_recovery_workflow_path
    && currentRun?.event === 'workflow_dispatch'
    && currentRun?.head_branch === 'main'
    && currentRun?.head_sha === currentMainInput
    && currentRun?.display_title === expectedRunName,
  'ATOMIC_RECOVERY_REMEDIATION_CURRENT_RUN_TUPLE_INVALID');
  assert(Number(currentRun?.workflow_id) !== prior.workflow_id,
    'ATOMIC_RECOVERY_REMEDIATION_WORKFLOW_GENERATION_NOT_DISTINCT');
  assert(currentRun?.actor?.login === repositoryOwner
    && currentRun?.triggering_actor?.login === repositoryOwner,
  'ATOMIC_RECOVERY_REMEDIATION_CURRENT_RUN_ACTOR_INVALID');

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

  const historical = assertHistoricalRedImmutable(headStatus, manifest);
  const recoveryBefore = assertRecoveryContextAbsent(headStatus);
  const receipt = {
    ...baseReceipt({
      id: 'kidults-atomic-terminal-recovery-remediation-preflight-receipt-v1',
      state: 'VERIFIED_PASS',
      manifest,
      manifestDigest,
      currentMainSha: currentMainInput,
      runId,
      runAttempt,
      authorizationId,
    }),
    completed_at: new Date().toISOString(),
    authorized_recovery_workflow_path: manifest.authorized_recovery_workflow_path,
    current_workflow_id: Number(currentRun.workflow_id),
    current_workflow_generation_distinct: true,
    prior_failed_recovery: {
      run_id: prior.id,
      run_attempt: prior.attempt,
      workflow_id: prior.workflow_id,
      workflow_path: prior.workflow_path,
      conclusion: prior.conclusion,
      failure_code: prior.failure_code,
      artifact_id: observedArtifact.id,
      artifact_name: observedArtifact.name,
      artifact_digest: normalizeSha256(observedArtifact.digest),
      receipt_sha256: sha256(downloaded.receiptBytes),
      status_write_authority: false,
      status_write_performed: false,
    },
    historical_terminal_status: historical,
    recovery_status_before: recoveryBefore,
    fresh_owner_authority_required: true,
    prior_authorization_reused: false,
    prior_run_rerun_performed: false,
    status_write_authority: false,
    status_write_performed: false,
  };
  writeJsonSecure(outputPath, receipt);
  console.log(JSON.stringify(receipt));
}

async function main() {
  const [mode, manifestFile] = process.argv.slice(2);
  assert(mode === '--preflight' && manifestFile,
    'ATOMIC_RECOVERY_REMEDIATION_ARGUMENTS_INVALID');
  const outputPath = process.env.ATOMIC_TERMINAL_RECOVERY_REMEDIATION_PREFLIGHT_PATH
    || 'out/atomic-terminal-recovery-remediation-v1/preflight-receipt.json';
  let manifest = null;
  let manifestDigest = null;
  try {
    const bytes = fs.readFileSync(manifestFile);
    manifest = validateManifest(JSON.parse(bytes.toString('utf8')));
    manifestDigest = sha256(bytes);
    await preflight(manifestFile, outputPath);
  } catch (error) {
    const code = String(error?.code || error?.message
      || 'ATOMIC_RECOVERY_REMEDIATION_PREFLIGHT_FAILED').split(':')[0].slice(0, 160);
    const receipt = {
      ...baseReceipt({
        id: 'kidults-atomic-terminal-recovery-remediation-preflight-receipt-v1',
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
      prior_authorization_reused: false,
      prior_run_rerun_performed: false,
      status_write_authority: false,
      status_write_performed: false,
    };
    try { writeJsonSecure(outputPath, receipt); } catch {}
    console.error(code);
    process.exit(1);
  }
}

await main();
