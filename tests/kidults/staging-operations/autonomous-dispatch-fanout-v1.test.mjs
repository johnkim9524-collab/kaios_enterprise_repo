import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  AutonomousDispatchError,
  buildDispatchRequest,
  DISPATCH_ROLES,
  transitionDispatchReceipt,
  validateDispatchEvent,
  writeJsonAtomic,
} from '../../../scripts/kidults/kpmo/lib/autonomous-dispatch-fanout-v1.mjs';

const sha = character => character.repeat(40);
const envelope = pullRequest => ({
  repository:'johnkim9524-collab/kaios_enterprise_repo',
  repository_id:'1281328888',
  pull_request:pullRequest,
  base_sha:sha('a'),
  head_sha:sha(String(pullRequest).at(-1) === '1' ? 'b' : 'd'),
  head_tree_sha:sha('c'),
  scope_digest:`sha256:${'1'.repeat(64)}`,
  authorization_generation:`pr-${pullRequest}-${'b'.repeat(20)}`,
  nonce_digest:`sha256:${'2'.repeat(64)}`,
});

test('initial receipt exists before token mint and binds one common event to all roles', () => {
  const built=buildDispatchRequest({envelope:envelope(41),runId:'1001',runAttempt:1,now:'2026-09-30T09:00:00.000Z'});
  assert.equal(built.receipt.state,'DISPATCH_REQUESTED');
  assert.equal(built.request.event_type,'kidults.authorization.generation.v1');
  assert.deepEqual(built.receipt.target_roles,DISPATCH_ROLES);
  assert.deepEqual(Object.values(built.receipt.role_delivery_bitmap),DISPATCH_ROLES.map(()=>'PENDING_COMMON_EVENT'));
  assert.equal(built.request.client_payload.dispatch.receipt_digest,built.receipt.receipt_digest);
});

test('accepted and failed paths always produce a sealed terminal role bitmap', () => {
  const initial=buildDispatchRequest({envelope:envelope(41),runId:'1001',runAttempt:1}).receipt;
  const accepted=transitionDispatchReceipt(initial,{state:'DISPATCH_ACCEPTED'});
  assert.equal(accepted.terminal,true);
  assert.deepEqual(Object.values(accepted.role_delivery_bitmap),DISPATCH_ROLES.map(()=>'COMMON_EVENT_ACCEPTED'));
  const failed=transitionDispatchReceipt(initial,{state:'DISPATCH_FAILED',failureCode:'INJECTED_AFTER_POST'});
  assert.equal(failed.terminal,true);
  assert.equal(failed.failure_code,'INJECTED_AFTER_POST');
  assert.deepEqual(Object.values(failed.role_delivery_bitmap),DISPATCH_ROLES.map(()=>'DELIVERY_UNKNOWN'));
});

test('transport retry keeps one logical idempotency generation while retaining run evidence', () => {
  const first=buildDispatchRequest({envelope:envelope(41),runId:'1001',runAttempt:1,now:'2026-09-30T09:00:00.000Z'}).receipt;
  const retry=buildDispatchRequest({envelope:envelope(41),runId:'1002',runAttempt:2,now:'2026-09-30T09:01:00.000Z'}).receipt;
  assert.equal(retry.dispatch_id,first.dispatch_id);
  assert.equal(retry.idempotency_key,first.idempotency_key);
  assert.notDeepEqual(retry.transport,first.transport);
  assert.equal(validateDispatchEvent({eventAction:retry.event_type,envelope:envelope(41),dispatch:retry,role:'INDEPENDENT_VERIFIER'}).dispatch_id,first.dispatch_id);
});

test('multi-PR scan receipts are isolated and a tampered role or binding fails closed', () => {
  const first=buildDispatchRequest({envelope:envelope(41),runId:'1001',runAttempt:1}).receipt;
  const second=buildDispatchRequest({envelope:envelope(42),runId:'1001',runAttempt:1}).receipt;
  assert.notEqual(first.dispatch_id,second.dispatch_id);
  assert.throws(()=>validateDispatchEvent({eventAction:first.event_type,envelope:envelope(41),dispatch:first,role:'FINALIZER'}),AutonomousDispatchError);
  assert.throws(()=>validateDispatchEvent({eventAction:'kidults.kpmo.authorization.v1',envelope:envelope(41),dispatch:first,role:'KPMO'}),AutonomousDispatchError);
  assert.throws(()=>validateDispatchEvent({eventAction:first.event_type,envelope:envelope(42),dispatch:first,role:'KPMO'}),AutonomousDispatchError);
});

test('receipt persistence is atomic and preserves the sealed digest', () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'kidults-fanout-'));
  const receiptPath=path.join(directory,'receipt.json');
  try {
    const receipt=buildDispatchRequest({envelope:envelope(41),runId:'1001',runAttempt:1}).receipt;
    writeJsonAtomic(receiptPath,receipt);
    assert.deepEqual(JSON.parse(fs.readFileSync(receiptPath,'utf8')),receipt);
    assert.equal(fs.statSync(receiptPath).mode & 0o777,0o600);
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
