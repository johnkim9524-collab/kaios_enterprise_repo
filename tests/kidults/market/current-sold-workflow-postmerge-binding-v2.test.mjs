import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const engineWorkflowPath = '.github/workflows/kidults-current-sold-engine-v1.yml';
const atomicWorkflowPath = '.github/workflows/kidults-atomic-governed-landing-v1.yml';
const atomicRunnerPath = 'scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs';
const atomicTerminalReconcilerPath = 'scripts/kidults/kpmo/reconcile-atomic-landing-terminal-v1.mjs';
const postLandingValidatorPath = 'scripts/kidults/market/current-sold-postlanding-v1.mjs';
const removedFanoutWorkflowPath = '.github/workflows/kidults-current-sold-postlanding-v1.yml';

function fileText(path) {
  return fs.readFileSync(path, 'utf8');
}

function eventPaths(text, eventName) {
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf(`  ${eventName}:`);
  assert.notEqual(start, -1, `${eventName} trigger must exist`);

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z_][A-Za-z0-9_]*:$/.test(lines[index])) {
      end = index;
      break;
    }
  }

  const pathsIndex = lines.findIndex((line, index) => index > start && index < end && line === '    paths:');
  assert.notEqual(pathsIndex, -1, `${eventName} trigger must have a paths list`);

  const paths = [];
  for (let index = pathsIndex + 1; index < end; index += 1) {
    const match = lines[index].match(/^      - '([^']+)'$/);
    if (match) paths.push(match[1]);
  }
  assert.ok(paths.length > 0, `${eventName} paths list must not be empty`);
  return paths;
}

test('Current-SOLD keeps an exact-surface main-push fallback without treating it as token-safe authority', () => {
  const engine = fileText(engineWorkflowPath);
  assert.match(
    engine,
    /on:\n  push:\n    branches:\n      - main\n    paths:\n/,
    'Current-SOLD engine must retain a protected-main push fallback',
  );
  assert.doesNotMatch(engine, /branches-ignore:/, 'main-push fallback must not use branch exclusions');

  const pushPaths = eventPaths(engine, 'push');
  const pullRequestPaths = eventPaths(engine, 'pull_request');
  assert.deepEqual(pushPaths, pullRequestPaths, 'push and pull-request Current-SOLD change surfaces must stay identical');
  assert.ok(pushPaths.includes('.github/workflows/kidults-current-sold-engine-v1.yml'));
  assert.ok(pushPaths.includes('tests/kidults/market/current-sold-*.mjs'));
  assert.ok(pushPaths.includes('coordination/kidults/market/current-sold-private-dry-run-receipt-schema-v1.json'));
  assert.ok(pushPaths.includes('scripts/kidults/market/current-sold-atomic-batch-v1.mjs'));
  assert.ok(pushPaths.includes('scripts/kidults/market/current-sold-private-dry-run-v1.mjs'));
  assert.ok(pushPaths.includes('scripts/kidults/market/current-sold-control-smoke-v1.mjs'));
});

test('Atomic Governed Landing performs exact Current-SOLD post-merge proof in the same trusted job', () => {
  const workflow = fileText(atomicWorkflowPath);
  const runner = fileText(atomicRunnerPath);
  const reconciler = fileText(atomicTerminalReconcilerPath);
  const validator = fileText(postLandingValidatorPath);

  assert.equal(fs.existsSync(removedFanoutWorkflowPath), false, 'post-landing proof must not add a workflow_run consumer');
  assert.match(workflow, /on:\n  workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^  workflow_run:/m);
  assert.doesNotMatch(workflow, /^  repository_dispatch:/m);
  assert.match(workflow, /group: kidults-atomic-governed-landing-v1-main/);
  assert.match(workflow, /Stage trusted Current-SOLD post-landing validator/);
  assert.match(workflow, /install -m 0500/);
  assert.match(workflow, /id: landing/);
  assert.match(workflow, /ref: \$\{\{ steps\.landing\.outputs\.merge_commit_sha \}\}/);
  assert.match(workflow, /fetch-depth: 2/);
  assert.match(workflow, /run: node "\$RUNNER_TEMP\/current-sold-postlanding-v1\.mjs"/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /statuses: write/);

  const stageIndex = workflow.indexOf('Stage trusted Current-SOLD post-landing validator');
  const initIndex = workflow.indexOf('Initialize durable atomic landing terminal receipt');
  const landingIndex = workflow.indexOf('Re-read live authority and execute exact-head server merge');
  const mergedCheckoutIndex = workflow.indexOf('Checkout exact merged Current-SOLD target');
  const validationIndex = workflow.indexOf('Validate exact merged Current-SOLD target and publish commit status');
  const reconcileIndex = workflow.indexOf('Reconcile durable atomic landing terminal receipt');
  const terminalUploadIndex = workflow.indexOf('Upload durable atomic landing terminal receipt');
  assert.ok(stageIndex >= 0 && stageIndex < initIndex && initIndex < landingIndex, 'durable pre-merge binding must be staged before mutation');
  assert.ok(landingIndex < mergedCheckoutIndex && mergedCheckoutIndex < validationIndex, 'post-merge validation order must be exact');
  assert.ok(validationIndex < reconcileIndex && reconcileIndex < terminalUploadIndex, 'terminal reconciliation and upload must run last');
  assert.match(workflow, /Reconcile durable atomic landing terminal receipt\n        if: always\(\)/);
  assert.match(workflow, /Upload durable atomic landing terminal receipt\n        if: always\(\)/);
  assert.match(workflow, /kidults-atomic-governed-landing-terminal-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /path: \$\{\{ runner\.temp \}\}\/kidults-atomic-landing-terminal\/receipt\.json/);
  assert.match(workflow, /if-no-files-found: error/);

  assert.match(runner, /const changedFileRecords = await pages\(`\/pulls\/\$\{prNumber\}\/files`\);/);
  assert.match(runner, /const currentSoldChangedFiles = changedFilenames\.filter\(isCurrentSoldPath\);/);
  assert.match(runner, /const postMergeMain = await request\('\/branches\/main'\);/);
  assert.match(runner, /POST_MERGE_MAIN_SHA_MISMATCH/);
  assert.match(runner, /fs\.appendFileSync\(githubOutput/);
  assert.match(runner, /`merge_commit_sha=\$\{merged\.sha\}`/);
  assert.match(runner, /`premerge_main_sha=\$\{initial\.base\.sha\}`/);
  assert.match(runner, /`merged_pr_head_sha=\$\{expectedHeadSha\}`/);
  assert.match(runner, /`current_sold_changed=\$\{currentSoldChanged\}`/);
  assert.match(runner, /MERGED_VERIFIED_POSTLANDING_REQUIRED/);
  assert.match(runner, /REQUIRED_SAME_TRUSTED_JOB/);

  assert.match(reconciler, /mode === '--initialize' \|\| mode === '--finalize'/);
  assert.match(reconciler, /'NOT_ATTEMPTED', 'PREMERGE_BINDING_STAGED'/);
  assert.match(reconciler, /'MERGE_REJECTED', 'MERGE_NOT_COMMITTED'/);
  assert.match(reconciler, /let state = 'MERGE_COMMITTED_PROOF_PENDING'/);
  assert.match(reconciler, /state = 'VERIFIED_PASS'/);
  assert.match(reconciler, /state = 'VERIFIED_FAIL'/);
  assert.match(reconciler, /request\(`\/pulls\/\$\{prNumber\}`\)/);
  assert.match(reconciler, /request\('\/branches\/main'\)/);
  assert.match(reconciler, /pages\(`\/pulls\/\$\{prNumber\}\/files`\)/);
  assert.match(reconciler, /authorization_id_sha256:/);
  assert.match(reconciler, /raw_authorization_persisted: false/);
  assert.doesNotMatch(reconciler, /operation_authorization_id:/);
  assert.match(reconciler, /fs\.renameSync\(temporaryPath, receiptPath\)/);
  assert.match(reconciler, /merge_commit_state: 'UNKNOWN_FAIL_CLOSED'/);

  assert.match(validator, /const statusContext = 'KIDULTS Current-SOLD Post-Landing V1';/);
  assert.match(validator, /await postStatus\('pending'/);
  assert.match(validator, /await postStatus\('success'/);
  assert.match(validator, /await postStatus\('failure'/);
  assert.match(validator, /parentLine\.length === 3/);
  assert.match(validator, /parentLine\[1\] === premergeMainSha/);
  assert.match(validator, /parentLine\[2\] === mergedPrHeadSha/);
  assert.match(validator, /POSTLANDING_CURRENT_SOLD_SURFACE_NOT_TOUCHED/);
  assert.match(validator, /expected_tests: 53/);
  assert.match(validator, /lawful_empirical_current_sold_count: 0/);
  assert.match(validator, /private_candidate_current_sold_count: 0/);
  assert.match(validator, /postgres_migration_applied: false/);
  assert.match(validator, /postgres_rows_written: 0/);
  assert.match(validator, /provider_calls: 0/);
  assert.match(validator, /deployment: false/);
  assert.match(validator, /public: 'HOLD'/);
  assert.match(validator, /production: 'HOLD'/);
  assert.match(validator, /g5: 'HOLD'/);
});
