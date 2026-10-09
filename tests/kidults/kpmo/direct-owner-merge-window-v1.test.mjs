import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyDirectOwnerMergeWindow} from '../../../scripts/kidults/kpmo/lib/direct-owner-merge-window-v1.mjs';
const good = {mergedAt: '2026-10-08T22:00:02Z', openedAt: '2026-10-08T22:00:00.750Z',
  handoffWindowSeconds: 60, approvalExpiresAt: '2026-10-08T22:10:00.000Z'};
test('whole-second evidence wholly within the window preserves precision and does not enlarge authority', () => {
  const result = verifyDirectOwnerMergeWindow(good);
  assert.equal(result.state, 'MERGE_WINDOW_INTERVAL_VERIFIED');
  assert.equal(result.resolution_ms, 1000); assert.equal(result.latest_possible_ms - result.earliest_possible_ms, 999);
  assert.equal(result.window_enlarged, false);
});
test('original same-second case is ambiguous rather than falsely certified before the window', () => {
  assert.throws(() => verifyDirectOwnerMergeWindow({...good, mergedAt: '2026-10-08T22:00:00Z'}), error => {
    assert.equal(error.code, 'DIRECT_OWNER_HANDOFF_TIMESTAMP_PRECISION_AMBIGUOUS');
    assert.equal(error.merge_time_precision.resolution_ms, 1000); return true;
  });
});
test('coarse end and approval-expiry boundaries remain ambiguous and never extend the window', () => {
  for (const value of [{mergedAt: '2026-10-08T22:01:00Z'},
    {mergedAt: '2026-10-08T22:00:20Z', approvalExpiresAt: '2026-10-08T22:00:20.750Z'}]) {
    assert.throws(() => verifyDirectOwnerMergeWindow({...good, ...value}), /TIMESTAMP_PRECISION_AMBIGUOUS/);
  }
});
test('definite before, after and expired evidence retains the respective denial code', () => {
  for (const [value, code] of [
    [{mergedAt: '2026-10-08T21:59:59Z'}, 'MERGE_BEFORE_WINDOW_OPEN'],
    [{mergedAt: '2026-10-08T22:01:01Z'}, 'MERGE_AFTER_WINDOW'],
    [{mergedAt: '2026-10-08T22:00:21Z', approvalExpiresAt: '2026-10-08T22:00:20.750Z'}, 'MERGE_AFTER_APPROVAL_EXPIRY']]) {
    assert.throws(() => verifyDirectOwnerMergeWindow({...good, ...value}), new RegExp(code));
  }
});
test('fractional precision is bounded by its exposed decimal places', () => {
  assert.equal(verifyDirectOwnerMergeWindow({...good, mergedAt: '2026-10-08T22:00:02.9Z'}).resolution_ms, 100);
  assert.equal(verifyDirectOwnerMergeWindow({...good, mergedAt: '2026-10-08T22:00:02.95Z'}).resolution_ms, 10);
  const exact = verifyDirectOwnerMergeWindow({...good, mergedAt: '2026-10-08T22:00:00.950Z'});
  assert.equal(exact.resolution_ms, 1);
});
test('invalid timestamps, rollover dates and oversized windows fail closed', () => {
  for (const field of ['mergedAt', 'openedAt', 'approvalExpiresAt']) {
    for (const value of [undefined, 'not-a-time', '2026-02-30T22:00:00Z', '2026-10-08T22:00:00', '2026-10-08T24:00:00Z']) {
      assert.throws(() => verifyDirectOwnerMergeWindow({...good, [field]: value}));
    }
  }
  assert.throws(() => verifyDirectOwnerMergeWindow({...good, handoffWindowSeconds: 901}), /WINDOW_INVALID/);
});
test('runner consumes interval guard and retains precision in success and failure receipts', () => {
  const runner = fs.readFileSync('scripts/kidults/kpmo/run-direct-owner-landing-handoff-v1.mjs', 'utf8');
  assert.match(runner, /const mergeTimePrecision = verifyDirectOwnerMergeWindow/);
  assert.match(runner, /merge_time_precision: mergeTimePrecision/);
  assert.match(runner, /merge_time_precision: error\.merge_time_precision/);
});

test('a coarse controller opening timestamp cannot expand the authorized interval', () => {
  for (const openedAt of ['2026-10-08T22:00:00Z', '2026-10-08T22:00:00.7Z', '2026-10-08T22:00:00.75Z']) {
    assert.throws(() => verifyDirectOwnerMergeWindow({...good, openedAt, mergedAt: '2026-10-08T22:00:00.100Z'}), /OPENED_AT_PRECISION_REQUIRED/);
  }
});
