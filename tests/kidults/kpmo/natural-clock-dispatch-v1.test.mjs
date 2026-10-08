import assert from 'node:assert/strict';
import test from 'node:test';
import {NaturalClockError, verifyNaturalClockDispatch} from '../../../scripts/kidults/kpmo/lib/natural-clock-dispatch-v1.mjs';

const sha = '7'.repeat(40);
const now = Date.parse('2026-09-28T03:00:00.000Z');
const payload = {
  dispatch_id: `kidults-natural-clock-v1:P0B:${sha}:${'n'.repeat(32)}`,
  exact_main_sha: sha,
  issued_at: '2026-09-28T03:00:00.000Z',
  nonce: 'n'.repeat(32),
  slot: 'P0B',
  source: 'AWS_EVENTBRIDGE_SCHEDULER',
};

test('accepts one fresh exact-main EventBridge dispatch without promotion authority', () => {
  const receipt = verifyNaturalClockDispatch({payload, liveMainSha: sha, now});
  assert.equal(receipt.state, 'VERIFIED_PASS');
  assert.equal(receipt.manual_dispatch, false);
  assert.equal(receipt.production, 'HOLD');
  assert.match(receipt.receipt_digest, /^sha256:[0-9a-f]{64}$/);
});

for (const [name, mutate, code] of [
  ['stale SHA', x => {
    x.exact_main_sha = '8'.repeat(40);
    x.dispatch_id = `kidults-natural-clock-v1:P0B:${x.exact_main_sha}:${x.nonce}`;
  }, 'NATURAL_CLOCK_EXACT_MAIN_MISMATCH'],
  ['manual source', x => { x.source = 'WORKFLOW_DISPATCH'; }, 'NATURAL_CLOCK_SOURCE_INVALID'],
  ['unknown slot', x => { x.slot = 'DEPLOY'; }, 'NATURAL_CLOCK_SLOT_INVALID'],
  ['extra field', x => { x.authority = true; }, 'NATURAL_CLOCK_PAYLOAD_FIELDS_INVALID'],
  ['stale time', x => { x.issued_at = '2026-09-28T02:49:59.000Z'; }, 'NATURAL_CLOCK_OUTSIDE_ACCEPTANCE_WINDOW'],
]) test(`rejects ${name}`, () => {
  const changed = structuredClone(payload);
  mutate(changed);
  assert.throws(() => verifyNaturalClockDispatch({payload: changed, liveMainSha: sha, now}),
    error => error instanceof NaturalClockError && error.code === code);
});

test('rejects a replayed dispatch id', () => {
  assert.throws(() => verifyNaturalClockDispatch({payload, liveMainSha: sha, now, seenDispatchIds: new Set([payload.dispatch_id])}),
    error => error instanceof NaturalClockError && error.code === 'NATURAL_CLOCK_REPLAY');
});

test('accepts Pooling as the governed producer root', () => {
  const pooling = {...payload, slot:'POOLING'};
  pooling.dispatch_id = `kidults-natural-clock-v1:POOLING:${sha}:${pooling.nonce}`;
  assert.equal(verifyNaturalClockDispatch({payload:pooling,liveMainSha:sha,now}).slot,'POOLING');
});

test('a seven-minute authenticated runner queue does not stale a fresh dispatch', () => {
  assert.equal(verifyNaturalClockDispatch({payload, liveMainSha: sha, now: now + 7 * 60000,
    authenticatedRunCreatedAt: new Date(now).toISOString()}).state, 'VERIFIED_PASS');
});
test('authenticated admission does not admit a dispatch already stale when GitHub received it', () => {
  assert.throws(() => verifyNaturalClockDispatch({payload, liveMainSha: sha, now: now + 15 * 60000,
    authenticatedRunCreatedAt: new Date(now + 6 * 60000).toISOString()}), /OUTSIDE_ACCEPTANCE_WINDOW/);
});
test('queue delay remains bounded and cannot be future or malformed', () => {
  for (const admission of [new Date(now - 2100001).toISOString(), new Date(now + 1).toISOString(), 'bad']) {
    assert.throws(() => verifyNaturalClockDispatch({payload, liveMainSha: sha, now,
      authenticatedRunCreatedAt: admission}), /QUEUE_DELAY_INVALID/);
  }
});
