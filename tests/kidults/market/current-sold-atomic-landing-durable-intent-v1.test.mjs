import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/kidults-atomic-governed-landing-v1.yml', 'utf8');
const reconciler = fs.readFileSync('scripts/kidults/kpmo/reconcile-atomic-landing-terminal-v1.mjs', 'utf8');

test('Atomic landing durably publishes fail-closed intent before irreversible merge', () => {
  const initIndex = workflow.indexOf('Initialize durable atomic landing terminal receipt');
  const intentUploadIndex = workflow.indexOf('Upload pre-mutation atomic landing intent');
  const mergeIndex = workflow.indexOf('Re-read live authority and execute exact-head server merge');
  assert.ok(initIndex >= 0 && initIndex < intentUploadIndex && intentUploadIndex < mergeIndex);
  assert.match(workflow, /name: kidults-atomic-governed-landing-intent-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /Upload pre-mutation atomic landing intent[\s\S]*?if-no-files-found: error[\s\S]*?retention-days: 90/);
  assert.match(workflow, /Initialize durable atomic landing terminal receipt[\s\S]*?GH_TOKEN: \$\{\{ github\.token \}\}/);
});

test('Atomic landing blocks GITHUB_TOKEN merge before authority consumption', () => {
  const transportIndex = workflow.indexOf('Require event-emitting post-merge CI transport');
  const lifecycleIndex = workflow.indexOf('Require latest terminal exact-head lifecycle authority');
  const consumptionIndex = workflow.indexOf('Consume one-use exact-head landing authorization');
  assert.ok(transportIndex >= 0 && transportIndex < lifecycleIndex && lifecycleIndex < consumptionIndex);
  assert.match(workflow, /ATOMIC_LANDING_GITHUB_TOKEN_POSTMERGE_CI_SUPPRESSED/);
});

test('Atomic landing durable status cannot silently green a missing post-merge proof', () => {
  assert.match(reconciler, /const terminalStatusContext = 'KIDULTS Atomic Landing Terminal V2';/);
  assert.match(reconciler, /await postHeadStatus\('pending', 'Pre-merge intent staged; terminal landing proof pending'\)/);
  assert.match(reconciler, /request\(`\/pulls\/\$\{prNumber\}`\)/);
  assert.match(reconciler, /request\('\/branches\/main'\)/);
  assert.match(reconciler, /pr\.base\.sha === mainBranch\.commit\.sha/);
  assert.match(reconciler, /ATOMIC_TERMINAL_PREMERGE_MAIN_BASE_DRIFT/);
  assert.match(reconciler, /let state = 'MERGE_COMMITTED_PROOF_PENDING'/);
  assert.match(reconciler, /state = 'MERGE_COMMITTED_POSTLANDING_PROOF_PENDING'/);
  assert.match(reconciler, /terminalClass = 'EXACT_MERGE_SHA_PUSH_SUITE_REQUIRED'/);
  assert.match(reconciler, /proof = 'REQUIRED_NOT_OBSERVED'/);
  assert.match(reconciler, /exact_merge_sha_push_suite_required: !currentSoldChanged/);
  assert.match(reconciler, /github_token_recursive_push_trigger_claimed: false/);
  assert.doesNotMatch(reconciler, /proof = 'NOT_REQUIRED_NON_CURRENT_SOLD'/);
  assert.match(reconciler, /if \(state === 'VERIFIED_PASS'\)[\s\S]*?postHeadStatus\('success'/);
  assert.match(reconciler, /else if \(state === 'VERIFIED_FAIL'\)[\s\S]*?postHeadStatus\('failure'/);
  assert.match(reconciler, /else \{[\s\S]*?postHeadStatus\('pending', terminalClass\)/);
  assert.doesNotMatch(reconciler, /operation_authorization_id:/);
  assert.match(reconciler, /authorization_id_sha256:/);
});

test('Terminal artifact remains unconditional and run-attempt bound', () => {
  assert.match(workflow, /Reconcile durable atomic landing terminal receipt\n        if: always\(\)/);
  assert.match(workflow, /Upload durable atomic landing terminal receipt\n        if: always\(\)/);
  assert.match(workflow, /name: kidults-atomic-governed-landing-terminal-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /Upload durable atomic landing terminal receipt[\s\S]*?if-no-files-found: error[\s\S]*?retention-days: 90/);
});
