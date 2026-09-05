import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCurrentSoldTerminalReceipt } from '../../../scripts/kidults/market/reconcile-current-sold-terminal-v1.mjs';

const stages = Object.fromEntries([
  'INITIALIZE','CHECKOUT','SOURCE','SETUP_NODE','SCHEMAS','SYNTAX','TESTS','LEGACY','SMOKE','MIGRATION'
].map(stage => [stage, 'success']));
const base = {
  expectedHeadSha: 'a'.repeat(40),
  sourceSha: 'a'.repeat(40),
  runId: '100',
  runAttempt: '1',
  triggerEvent: 'pull_request',
  repository: 'o/r',
  expectedTests: '57',
  stageOutcomes: stages,
};

test('terminal PASS requires every stage, exact head and observed TAP count', () => {
  const receipt = buildCurrentSoldTerminalReceipt(base);
  assert.equal(receipt.state, 'VERIFIED_PASS');
  assert.equal(receipt.overall_state, 'GREEN');
  assert.equal(receipt.expected_tests, 57);
  assert.equal(receipt.whole_batch_atomic, true);
  assert.equal(receipt.producer_health_authority, true);
  assert.equal(receipt.promotion_eligible, false);
  assert.deepEqual(receipt.failed_check_ids, []);
});

for (const [name, mutation, failure] of [
  ['failed test stage', x => { x.stageOutcomes.TESTS = 'failure'; }, 'TESTS'],
  ['skipped migration stage', x => { x.stageOutcomes.MIGRATION = 'skipped'; }, 'MIGRATION'],
  ['exact-head drift', x => { x.sourceSha = 'b'.repeat(40); }, 'EXACT_HEAD_BINDING'],
  ['missing TAP total', x => { x.expectedTests = ''; }, 'TEST_COUNT_INVALID'],
]) test(`terminal receipt fails closed on ${name}`, () => {
  const input = structuredClone(base);
  mutation(input);
  const receipt = buildCurrentSoldTerminalReceipt(input);
  assert.equal(receipt.state, 'VERIFIED_FAIL');
  assert.equal(receipt.overall_state, 'RED');
  assert.ok(receipt.failed_check_ids.includes(failure));
  assert.equal(receipt.whole_batch_atomic, false);
  assert.equal(receipt.producer_health_authority, false);
  assert.equal(receipt.promotion_eligible, false);
  assert.equal(receipt.public, 'HOLD');
  assert.equal(receipt.production, 'HOLD');
  assert.equal(receipt.g5, 'HOLD');
});

test('workflow initializes durable fail receipt and reconciles all required outcomes before always-upload', () => {
  const workflow = fs.readFileSync('.github/workflows/kidults-current-sold-engine-v1.yml', 'utf8');
  const init = workflow.indexOf('Initialize fail-closed Current-SOLD terminal receipt');
  const checkout = workflow.indexOf('id: checkout');
  const reconcile = workflow.indexOf('Reconcile Current-SOLD semantic terminal receipt');
  const upload = workflow.indexOf('Upload Current-SOLD terminal artifact');
  assert.ok(init >= 0 && checkout > init && reconcile > checkout && upload > reconcile);
  assert.match(workflow.slice(init, checkout), /"state":"VERIFIED_FAIL"/);
  assert.match(workflow.slice(init, checkout), /"failed_check_ids":\["CURRENT_SOLD_WORKFLOW_NOT_RECONCILED"\]/);
  assert.match(workflow.slice(reconcile, upload), /if: always\(\)/);
  for (const stage of Object.keys(stages)) assert.ok(workflow.includes(`${stage}_OUTCOME:`), stage);
  assert.match(workflow, /CURRENT_SOLD_EXPECTED_TESTS: \$\{\{ steps\.current_sold_tests\.outputs\.expected_tests \}\}/);
  assert.match(workflow, /scripts\/kidults\/market\/reconcile-current-sold-terminal-v1\.mjs/);
  assert.doesNotMatch(workflow, /"expected_tests":[1-9][0-9]*/);
});
