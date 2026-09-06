#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildAtomicDispatchTerminalReceipt } from '../../../scripts/kidults/kpmo/initialize-atomic-dispatch-terminal-receipt-v1.mjs';

const repository = 'johnkim9524-collab/kaios_enterprise_repo';
const prNumber = '2014';
const head = '0123456789abcdef0123456789abcdef01234567';
const validAuthorization = `LAND-PR-${prNumber}-${head.slice(0, 12)}`;
const common = {
  repository,
  prNumber,
  expectedHeadSha: head,
  landingActor: 'johnkim9524-collab',
  landingRunId: '12345',
  landingRunAttempt: '1',
  now: '2026-09-05T00:00:00.000Z',
};

{
  const receipt = buildAtomicDispatchTerminalReceipt({...common, authorizationId: validAuthorization});
  assert.equal(receipt.state, 'DISPATCH_RECEIVED_FAIL_CLOSED');
  assert.equal(receipt.terminal_class, 'PREMUTATION_DISPATCH_RECEIPT_INITIALIZED');
  assert.equal(receipt.failure_code, null);
  assert.equal(receipt.authorization_binding_valid, true);
  assert.equal(receipt.raw_authorization_persisted, false);
  assert.equal(receipt.merge_committed, false);
  assert.equal(receipt.production, 'HOLD');
  assert.equal(receipt.public, 'HOLD');
  assert.equal(receipt.g5, 'HOLD');
  assert.equal(JSON.stringify(receipt).includes(validAuthorization), false);
}

{
  const malformedAuthorization = 'LAND-PR-2014-wrong-head';
  const receipt = buildAtomicDispatchTerminalReceipt({...common, authorizationId: malformedAuthorization});
  const expectedDigest = crypto.createHash('sha256').update(malformedAuthorization).digest('hex');
  assert.equal(receipt.state, 'VERIFIED_FAIL');
  assert.equal(receipt.terminal_class, 'PREMUTATION_DISPATCH_REJECTED');
  assert.equal(receipt.failure_code, 'ATOMIC_TERMINAL_AUTHORIZATION_BINDING_INVALID');
  assert.equal(receipt.authorization_binding_valid, false);
  assert.equal(receipt.authorization_id_sha256, `sha256:${expectedDigest}`);
  assert.equal(receipt.raw_authorization_persisted, false);
  assert.equal(receipt.merge_commit_sha, null);
  assert.equal(receipt.merge_committed, false);
  assert.equal(JSON.stringify(receipt).includes(malformedAuthorization), false);
}

{
  const receipt = buildAtomicDispatchTerminalReceipt({
    ...common,
    expectedHeadSha: 'bad-head',
    authorizationId: validAuthorization,
  });
  assert.equal(receipt.state, 'VERIFIED_FAIL');
  assert.equal(receipt.failure_code, 'ATOMIC_DISPATCH_RECEIPT_HEAD_INVALID');
  assert.equal(receipt.exact_head_sha, null);
  assert.equal(receipt.raw_authorization_persisted, false);
}

console.log(JSON.stringify({
  id: 'atomic-dispatch-terminal-receipt-v1-test',
  state: 'VERIFIED_PASS',
  valid_dispatch_is_fail_closed_until_later_gates: true,
  malformed_authorization_is_durably_sanitized: true,
  malformed_head_is_durably_sanitized: true,
  raw_authorization_persisted: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD',
}));
