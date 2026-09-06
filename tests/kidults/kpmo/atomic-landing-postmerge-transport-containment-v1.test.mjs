import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/kidults-atomic-governed-landing-v1.yml', 'utf8');
const runner = fs.readFileSync('scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs', 'utf8');
const terminal = fs.readFileSync('scripts/kidults/kpmo/reconcile-atomic-landing-terminal-v1.mjs', 'utf8');

test('event-emitting transport is validated before lifecycle and one-use authorization consumption', () => {
  const transport = workflow.indexOf('Verify event-emitting merge transport before authority consumption');
  const lifecycle = workflow.indexOf('Require latest terminal exact-head lifecycle authority');
  const consumption = workflow.indexOf('Consume one-use exact-head landing authorization');
  const merge = workflow.indexOf('Re-read live authority and await exact-head event-emitting merge');
  assert.ok(transport >= 0 && transport < lifecycle && lifecycle < consumption && consumption < merge);
  assert.match(workflow, /EXPECTED_BASE_SHA: \$\{\{ inputs\.expected_base_sha \}\}/);
  assert.match(workflow, /EXPECTED_HEAD_TREE_SHA: \$\{\{ inputs\.expected_head_tree_sha \}\}/);
});

test('repository GITHUB_TOKEN cannot merge and external merge proof is exact', () => {
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pull-requests: read/);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.doesNotMatch(workflow, /pull-requests: write/);
  assert.doesNotMatch(runner, /method: 'PUT'/);
  assert.doesNotMatch(runner, /merge_method/);
  assert.match(runner, /POST_MERGE_TREE_SHA_MISMATCH/);
  assert.match(runner, /POST_MERGE_PARENT_BINDING_MISMATCH/);
  assert.match(runner, /ATOMIC_EVENT_TRANSPORT_MERGED_BY_NON_OWNER/);
});

test('terminal PASS requires successful exact merge-SHA push suite', () => {
  assert.match(workflow, /Consume exact merge-SHA protected-main push suite/);
  assert.match(workflow, /consume-atomic-postmerge-push-suite-v1\.mjs/);
  assert.match(terminal, /terminal_pass_requires_exact_merge_sha_postmerge_success: true/);
  assert.match(terminal, /postMergeSuiteReceipt\?\.all_required_terminal === true/);
  assert.match(terminal, /postMergeSuiteReceipt\?\.all_required_success === true/);
  assert.match(terminal, /let state = 'VERIFIED_FAIL'/);
});
