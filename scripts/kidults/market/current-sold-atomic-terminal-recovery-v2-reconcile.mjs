#!/usr/bin/env node
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {
  SHA40,
  POST_CONTEXT,
  assert,
  sha256,
  readJson,
  writeJsonSecure,
  validateManifest,
  establishRecoveryAuthority,
  exactArtifact,
  downloadArtifactReceipt,
  assertHistoricalRedImmutable,
  assertRecoveryContextAbsent,
  latestStatus,
  baseReceipt,
} from './atomic-terminal-recovery-v2-runtime.mjs';

function runClassifier() {
  const result = spawnSync(process.execPath, [
    'scripts/kidults/kpmo/validate-workflow-repository-mutation-boundary-v1.mjs',
  ], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  if (result.error || result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw Object.assign(new Error('ATOMIC_RECOVERY_CLASSIFIER_COMMAND_FAILED'), {
      code: 'ATOMIC_RECOVERY_CLASSIFIER_COMMAND_FAILED',
    });
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw Object.assign(new Error('ATOMIC_RECOVERY_CLASSIFIER_OUTPUT_INVALID'), {
      code: 'ATOMIC_RECOVERY_CLASSIFIER_OUTPUT_INVALID',
    });
  }
}

async function reconcile(manifestFile, outputPath) {
  const authority = await establishRecoveryAuthority(manifestFile);
  const {manifest, client, repository, token, currentMainInput} = authority;
  const expectedPr = manifest.predecessor_pull_request;
  const expectedRun = manifest.atomic_run;

  const [pr, merge, originalRun, artifactPayload, main, mergeStatus, headStatus, ancestry] =
    await Promise.all([
      client.api(`/pulls/${expectedPr.number}`),
      client.api(`/commits/${expectedPr.merge_commit_sha}`),
      client.api(`/actions/runs/${expectedRun.id}`),
      client.api(`/actions/runs/${expectedRun.id}/artifacts?per_page=100`),
      client.api('/branches/main'),
      client.api(`/commits/${expectedPr.merge_commit_sha}/status`),
      client.api(`/commits/${expectedPr.exact_head_sha}/status`),
      client.api(`/compare/${expectedPr.merge_commit_sha}...${currentMainInput}`),
    ]);

  assert(main?.commit?.sha === currentMainInput, 'ATOMIC_RECOVERY_CURRENT_MAIN_DRIFT');
  assert(pr?.state === 'closed' && pr?.merged === true
    && pr?.user?.login === authority.repositoryOwner,
  'ATOMIC_RECOVERY_PREDECESSOR_PR_STATE_INVALID');
  assert(pr?.head?.sha === expectedPr.exact_head_sha
    && pr?.base?.sha === expectedPr.exact_base_sha
    && pr?.merge_commit_sha === expectedPr.merge_commit_sha,
  'ATOMIC_RECOVERY_PREDECESSOR_PR_TUPLE_MISMATCH');
  assert(merge?.sha === expectedPr.merge_commit_sha
    && merge?.commit?.tree?.sha === expectedPr.merge_tree_sha,
  'ATOMIC_RECOVERY_MERGE_IDENTITY_MISMATCH');
  assert(Array.isArray(merge?.parents) && merge.parents.length === 2
    && merge.parents[0]?.sha === expectedPr.exact_base_sha
    && merge.parents[1]?.sha === expectedPr.exact_head_sha,
  'ATOMIC_RECOVERY_MERGE_PARENTS_MISMATCH');
  assert(Number(originalRun?.id) === expectedRun.id
    && Number(originalRun?.run_attempt) === expectedRun.attempt
    && Number(originalRun?.workflow_id) === expectedRun.workflow_id,
  'ATOMIC_RECOVERY_PREDECESSOR_RUN_IDENTITY_MISMATCH');
  assert(originalRun?.display_title === expectedRun.display_title
    && originalRun?.event === 'workflow_dispatch'
    && originalRun?.head_sha === expectedPr.exact_base_sha
    && originalRun?.conclusion === expectedRun.expected_conclusion,
  'ATOMIC_RECOVERY_PREDECESSOR_RUN_STATE_MISMATCH');
  assert(originalRun?.actor?.login === authority.repositoryOwner
    && originalRun?.triggering_actor?.login === authority.repositoryOwner,
  'ATOMIC_RECOVERY_PREDECESSOR_RUN_ACTOR_MISMATCH');

  const artifacts = artifactPayload?.artifacts;
  const postArtifact = exactArtifact(artifacts, manifest.postlanding_artifact,
    'ATOMIC_RECOVERY_POST_ARTIFACT');
  const failedArtifact = exactArtifact(artifacts, manifest.failed_terminal_artifact,
    'ATOMIC_RECOVERY_TERMINAL_ARTIFACT');
  const [postReceipt, terminalReceipt] = await Promise.all([
    downloadArtifactReceipt({repository, token, expected: manifest.postlanding_artifact}),
    downloadArtifactReceipt({repository, token, expected: manifest.failed_terminal_artifact}),
  ]);

  assert(postReceipt?.id === 'kidults-current-sold-postlanding-receipt-v1'
    && postReceipt?.state === 'VERIFIED_PASS',
  'ATOMIC_RECOVERY_POST_RECEIPT_STATE_INVALID');
  assert(Number(postReceipt?.pull_request) === expectedPr.number
    && postReceipt?.exact_merge_sha === expectedPr.merge_commit_sha
    && postReceipt?.premerge_main_sha === expectedPr.exact_base_sha
    && postReceipt?.merged_pr_head_sha === expectedPr.exact_head_sha,
  'ATOMIC_RECOVERY_POST_RECEIPT_TUPLE_MISMATCH');
  assert(Number(postReceipt?.landing_workflow_run_id) === expectedRun.id
    && Number(postReceipt?.landing_workflow_run_attempt) === expectedRun.attempt,
  'ATOMIC_RECOVERY_POST_RECEIPT_RUN_MISMATCH');
  assert(postReceipt?.tests_passed === 56 && postReceipt?.tests_failed === 0
    && postReceipt?.merge_parent_binding_verified === true,
  'ATOMIC_RECOVERY_POST_RECEIPT_PROOF_INVALID');
  assert(postReceipt?.control_smoke === 'PASS'
    && postReceipt?.raw_persistence_guard === 'PASS'
    && postReceipt?.postgres_append_only_static_guard === 'PASS',
  'ATOMIC_RECOVERY_POST_RECEIPT_GUARDS_INVALID');
  assert(postReceipt?.provider_calls === 0 && postReceipt?.postgres_rows_written === 0
    && postReceipt?.deployment === false,
  'ATOMIC_RECOVERY_POST_RECEIPT_EXTERNAL_MUTATION_INVALID');
  assert(postReceipt?.public === 'HOLD' && postReceipt?.production === 'HOLD'
    && postReceipt?.g5 === 'HOLD',
  'ATOMIC_RECOVERY_POST_RECEIPT_HOLD_INVALID');

  assert(terminalReceipt?.id === 'kidults-atomic-governed-landing-terminal-receipt-v2'
    && terminalReceipt?.state === 'VERIFIED_FAIL'
    && terminalReceipt?.terminal_class === manifest.historical_terminal_status.description,
  'ATOMIC_RECOVERY_FAILED_TERMINAL_STATE_INVALID');
  assert(Number(terminalReceipt?.landing_workflow_run_id) === expectedRun.id
    && Number(terminalReceipt?.landing_workflow_run_attempt) === expectedRun.attempt
    && terminalReceipt?.landing_step_outcome === 'success'
    && terminalReceipt?.current_sold_postlanding_outcome === 'success',
  'ATOMIC_RECOVERY_FAILED_TERMINAL_BINDING_INVALID');
  assert(`sha256:${terminalReceipt?.authorization_id_sha256}`
    === expectedRun.authorization_id_sha256,
  'ATOMIC_RECOVERY_LANDING_AUTHORIZATION_DIGEST_MISMATCH');

  const historical = assertHistoricalRedImmutable(headStatus, manifest);
  const recoveryBefore = assertRecoveryContextAbsent(headStatus);
  const postStatus = latestStatus(mergeStatus, POST_CONTEXT);
  assert(postStatus?.state === 'success'
    && String(postStatus?.target_url || '').endsWith(`/actions/runs/${expectedRun.id}`),
  'ATOMIC_RECOVERY_REMOTE_POST_STATUS_INVALID');
  assert(ancestry?.status === 'ahead' || ancestry?.status === 'identical',
    'ATOMIC_RECOVERY_CURRENT_MAIN_ANCESTRY_INVALID');

  const classifier = runClassifier();
  assert(classifier?.result === 'PASS'
    && classifier?.current_sold_matcher_surfaces_verified === 3
    && Array.isArray(classifier?.findings) && classifier.findings.length === 0,
  'ATOMIC_RECOVERY_CLASSIFIER_INVALID');

  const receipt = {
    ...baseReceipt({
      id: 'kidults-atomic-terminal-recovery-evidence-receipt-v2',
      state: 'VERIFIED_PASS',
      manifest,
      manifestDigest: authority.manifestDigest,
      currentMainSha: currentMainInput,
      runId: authority.runId,
      runAttempt: authority.runAttempt,
      authorizationId: authority.authorizationId,
    }),
    completed_at: new Date().toISOString(),
    workflow_id: Number(authority.currentRun.workflow_id),
    approval: authority.approval,
    one_use_dispatch: authority.oneUse,
    historical_terminal_status: historical,
    recovery_status_before: recoveryBefore,
    predecessor_atomic_run: {
      id: expectedRun.id,
      attempt: expectedRun.attempt,
      conclusion: 'failure',
      actor: authority.repositoryOwner,
    },
    exact_merge: {
      sha: expectedPr.merge_commit_sha,
      tree_sha: expectedPr.merge_tree_sha,
      parents: [expectedPr.exact_base_sha, expectedPr.exact_head_sha],
      current_main_descends_from_merge: true,
    },
    postlanding_proof: {
      state: 'VERIFIED_PASS',
      tests_passed: 56,
      tests_failed: 0,
      artifact_id: postArtifact.id,
      artifact_digest: manifest.postlanding_artifact.digest,
      receipt_sha256: sha256(Buffer.from(JSON.stringify(postReceipt))),
    },
    failed_terminal_evidence: {
      state: 'VERIFIED_FAIL',
      failure_class: manifest.historical_terminal_status.description,
      artifact_id: failedArtifact.id,
      artifact_digest: manifest.failed_terminal_artifact.digest,
      receipt_sha256: sha256(Buffer.from(JSON.stringify(terminalReceipt))),
    },
    classifier: {
      result: 'PASS',
      matcher_surfaces_verified: 3,
      findings: [],
    },
    status_write_authority: false,
    status_write_performed: false,
  };
  writeJsonSecure(outputPath, receipt);
  console.log(JSON.stringify(receipt));
}

async function main() {
  const [mode, manifestFile] = process.argv.slice(2);
  assert(mode === '--reconcile' && manifestFile,
    'ATOMIC_RECOVERY_RECONCILE_ARGUMENTS_INVALID');
  const outputPath = process.env.ATOMIC_TERMINAL_RECOVERY_RECEIPT_PATH
    || 'out/atomic-terminal-recovery-v2/evidence-receipt.json';
  let manifest = null;
  let manifestDigest = null;
  try {
    const bytes = fs.readFileSync(manifestFile);
    manifest = validateManifest(JSON.parse(bytes.toString('utf8')));
    manifestDigest = sha256(bytes);
    await reconcile(manifestFile, outputPath);
  } catch (error) {
    const code = String(error?.code || error?.message || 'ATOMIC_RECOVERY_RECONCILIATION_FAILED')
      .split(':')[0].slice(0, 120);
    const receipt = {
      ...baseReceipt({
        id: 'kidults-atomic-terminal-recovery-evidence-receipt-v2',
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
    };
    try { writeJsonSecure(outputPath, receipt); } catch {}
    console.error(code);
    process.exit(1);
  }
}

await main();
