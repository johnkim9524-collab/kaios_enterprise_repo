import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('direct-owner post-merge push-suite consumer rejects predecessor and nonterminal evidence', () => {
  const output = execFileSync(
    process.execPath,
    ['scripts/kidults/kpmo/consume-direct-owner-postmerge-push-suite-v1.mjs', '--self-test'],
    {encoding: 'utf8'},
  );
  const receipt = JSON.parse(output.trim().split(/\r?\n/).at(-1));
  assert.equal(receipt.state, 'VERIFIED_PASS');
  assert.equal(receipt.contract, 'DIRECT_OWNER_POSTMERGE_PUSH_SUITE_CONSUMER_V1');
  assert.equal(receipt.negative_mutations_rejected, 6);
  assert.equal(receipt.terminal_failure_preserved_as_evidence, true);
  assert.equal(receipt.predecessor_head_proof_reuse_forbidden, true);
});
