import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDurableCheckpointManifest } from
  '../../scripts/governance/verify-durable-git-checkpoint-v1.mjs';

const currentSha = '157c4dda45be1aba74441aa56de57ce738dc60fd';
const checkpointRef = 'refs/heads/checkpoint-snapshots/foundation-157c4dda45be';
const remoteSha = '0293908dc163cbe331789f0164be34e271f1bb6a';
const valid = {
  contractId: 'kidults-durable-recovery-snapshot-v1', version: '1.0.0',
  state: 'DURABLE_CHECKPOINT_WRITTEN', sourceBranch: 'codex/common-control-foundation-v1',
  sourceHead: currentSha, baseMainSha: 'a28a55e44365a30946e253809d20065bee17cacb',
  changedFileCount: 116, storage: 'GITHUB_INDEPENDENT_REMOTE_REF',
  automaticPromotion: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  createdAt: '2026-09-20T01:04:09.000Z',
};

test('accepts exact durable checkpoint identity', () => {
  assert.equal(validateDurableCheckpointManifest(valid,
    { currentSha, remoteSha, checkpointRef }), valid);
});

for (const [name, mutate] of [
  ['source SHA mismatch', value => ({ ...value, sourceHead: '0'.repeat(40) })],
  ['promotion escalation', value => ({ ...value, automaticPromotion: true })],
  ['release escalation', value => ({ ...value, production: 'READY' })],
  ['unknown field', value => ({ ...value, extra: true })],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(() => validateDurableCheckpointManifest(mutate(valid),
      { currentSha, remoteSha, checkpointRef }), /DURABLE_CHECKPOINT_MANIFEST_INVALID/);
  });
}
