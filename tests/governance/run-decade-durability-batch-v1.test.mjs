import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReplicaReceipt, objectKeys, parseNodeTestCount, selectCurrentObjectVersion,
  validateBatchInput } from '../../scripts/governance/run-decade-durability-batch-v1.mjs';

const sourceSha = 'a'.repeat(40);
const sourceTree = 'b'.repeat(40);
const digest = 'c'.repeat(64);
const target = {
  checkpointRoot: '/protected/checkpoints', receiptRoot: '/protected/receipts',
  branch: 'codex/common-control-foundation-v1', bucket: 'kidults-recovery-example',
  region: 'ap-northeast-2',
  kmsKeyArn: 'arn:aws:kms:ap-northeast-2:123456789012:key/encryption',
  signingKeyArn: 'arn:aws:kms:ap-northeast-2:123456789012:key/signing',
  providerDomain: 'aws-ap-northeast-2', adminDomain: 'aws-recovery-account',
};
const objects = () => ['source.bundle', 'manifest.json'].map((name, index) => ({
  key: `recovery/git/${sourceSha}/${name}`, versionId: `version-${index}`, sha256: digest,
  providerChecksumSHA256: 'Y2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2M=',
  readBackSha256: digest, objectLockMode: 'COMPLIANCE',
  retainUntil: '2036-09-20T00:00:00.000Z',
}));

test('accepts an isolated absolute-path batch input', () => {
  assert.equal(validateBatchInput(target).branch, target.branch);
});

test('rejects relative storage and non-independent failure domains', () => {
  assert.throws(() => validateBatchInput({ ...target, checkpointRoot: 'relative' }),
    /DURABILITY_BATCH_INPUT_INVALID/);
  assert.throws(() => validateBatchInput({ ...target, providerDomain: 'github' }),
    /DURABILITY_BATCH_INPUT_INVALID/);
  assert.throws(() => validateBatchInput({ ...target, adminDomain: 'primary' }),
    /DURABILITY_BATCH_INPUT_INVALID/);
  assert.throws(() => validateBatchInput({ ...target, adminDomain: '' }),
    /DURABILITY_BATCH_INPUT_INVALID/);
  assert.throws(() => validateBatchInput({ ...target, kmsKeyArn:
    'arn:aws:kms:us-east-1:123456789012:key/wrong-region' }),
  /DURABILITY_BATCH_INPUT_INVALID/);
});

test('derives immutable object keys only from an exact source SHA', () => {
  assert.deepEqual(objectKeys(sourceSha), {
    bundle: `recovery/git/${sourceSha}/source.bundle`,
    manifest: `recovery/git/${sourceSha}/manifest.json`,
    receipt: `recovery/git/${sourceSha}/receipt.json`,
    restore: `recovery/git/${sourceSha}/restore-drills`,
  });
  assert.throws(() => objectKeys('../unsafe'), /DURABILITY_SOURCE_SHA_INVALID/);
});

test('parses both TAP and spec reporter test totals', () => {
  assert.equal(parseNodeTestCount('# tests 30\n# pass 30\n'), 30);
  assert.equal(parseNodeTestCount(Buffer.from('ℹ tests 30\nℹ pass 30\n')), 30);
  assert.equal(parseNodeTestCount('tests unavailable'), 0);
});

test('selects the exact latest object version for interruption-safe reuse', () => {
  const key = `recovery/git/${sourceSha}/source.bundle`;
  assert.equal(selectCurrentObjectVersion({ Versions: [
    { Key: key, VersionId: 'old', IsLatest: false },
    { Key: key, VersionId: 'current', IsLatest: true },
    { Key: `${key}.unrelated`, VersionId: 'other', IsLatest: true },
  ] }, key), 'current');
  assert.equal(selectCurrentObjectVersion({}, key), null);
});

test('fails closed on deleted or ambiguous current object versions', () => {
  const key = `recovery/git/${sourceSha}/manifest.json`;
  assert.throws(() => selectCurrentObjectVersion({ DeleteMarkers: [
    { Key: key, VersionId: 'deleted', IsLatest: true },
  ] }, key), /DURABILITY_OBJECT_CURRENT_VERSION_DELETED/);
  assert.throws(() => selectCurrentObjectVersion({ Versions: [
    { Key: key, VersionId: 'orphaned', IsLatest: false },
  ] }, key), /DURABILITY_OBJECT_VERSION_STATE_INVALID/);
  assert.throws(() => selectCurrentObjectVersion({ Versions: 'invalid' }, key),
    /DURABILITY_OBJECT_VERSION_STATE_INVALID/);
});

test('builds a fail-closed signed object-lock replica receipt', () => {
  const receipt = buildReplicaReceipt({ sourceSha, sourceTree,
    observedAt: '2026-09-20T00:00:00.000Z', target, objects: objects(),
    signingKeyArn: target.signingKeyArn });
  assert.equal(receipt.state, 'VERIFIED');
  assert.equal(receipt.replica.class, 'CROSS_PROVIDER_OBJECT_LOCK');
  assert.equal(receipt.replica.retentionYears, 10);
  assert.equal(receipt.signature.state, 'VERIFIED');
  assert.equal(receipt.production, 'HOLD');
  assert.equal(receipt.automaticPromotion, false);
});

test('rejects digest mismatch, governance retention, and malformed timestamps', () => {
  const badDigest = objects();
  badDigest[0].sha256 = 'bad';
  assert.throws(() => buildReplicaReceipt({ sourceSha, sourceTree,
    observedAt: '2026-09-20T00:00:00.000Z', target, objects: badDigest,
    signingKeyArn: target.signingKeyArn }), /DURABILITY_RECEIPT_INPUT_INVALID/);
  const governance = objects();
  governance[0].objectLockMode = 'GOVERNANCE';
  assert.throws(() => buildReplicaReceipt({ sourceSha, sourceTree,
    observedAt: 'invalid', target, objects: governance,
    signingKeyArn: target.signingKeyArn }), /DURABILITY_RECEIPT_INPUT_INVALID/);
  const readBackMismatch = objects();
  readBackMismatch[0].readBackSha256 = 'd'.repeat(64);
  assert.throws(() => buildReplicaReceipt({ sourceSha, sourceTree,
    observedAt: '2026-09-20T00:00:00.000Z', target, objects: readBackMismatch,
    signingKeyArn: target.signingKeyArn }), /DURABILITY_RECEIPT_INPUT_INVALID/);
  const shortRetention = objects();
  shortRetention[0].retainUntil = '2027-09-20T00:00:00.000Z';
  assert.throws(() => buildReplicaReceipt({ sourceSha, sourceTree,
    observedAt: '2026-09-20T00:00:00.000Z', target, objects: shortRetention,
    signingKeyArn: target.signingKeyArn }), /DURABILITY_RECEIPT_INPUT_INVALID/);
});
