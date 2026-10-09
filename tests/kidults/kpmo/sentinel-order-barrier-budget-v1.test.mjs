import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sentinelOrderBarrierBudget, withinSentinelObservationWindow, SENTINEL_PRODUCER_WAIT_SECONDS}
  from '../../../scripts/kidults/kpmo/lib/sentinel-order-barrier-budget-v1.mjs';
test('Assurance waits through the full producer budget and terminal publication margin', () => {
  const b = sentinelOrderBarrierBudget();
  assert.equal(b.timeoutSeconds, SENTINEL_PRODUCER_WAIT_SECONDS + 300);
  assert.ok(b.cutoffWindowSeconds > b.timeoutSeconds);
  const w = fs.readFileSync('.github/workflows/kidults-platform-continuous-assurance-v1.yml', 'utf8');
  assert.match(w, /KPMO_SENTINEL_BARRIER_TIMEOUT_SECONDS=2400/);
  assert.match(w, /timeout-minutes: 60/);
});
test('a 35-minute producer remains selectable but future and expired runs do not', () => {
  const cutoff = Date.parse('2026-10-08T03:45:00Z');
  const window = sentinelOrderBarrierBudget().cutoffWindowSeconds;
  assert.equal(withinSentinelObservationWindow(cutoff - 2100 * 1000, cutoff, window), true);
  assert.equal(withinSentinelObservationWindow(cutoff - window * 1000, cutoff, window), true);
  assert.equal(withinSentinelObservationWindow(cutoff - window * 1000 - 1, cutoff, window), false);
  assert.equal(withinSentinelObservationWindow(cutoff + 1, cutoff, window), false);
  assert.equal(withinSentinelObservationWindow(NaN, cutoff, window), false);
});
test('undersized, unbounded and malformed timeout budgets fail closed', () => {
  for (const value of ['900', '1800', '2100', '2401', 'Infinity', 'NaN', '-1', '2400.5'])
    assert.throws(() => sentinelOrderBarrierBudget({KPMO_SENTINEL_BARRIER_TIMEOUT_SECONDS:value}));
  assert.equal(sentinelOrderBarrierBudget({KPMO_SENTINEL_BARRIER_TIMEOUT_SECONDS:'2400'}).timeoutSeconds, 2400);
  for (const value of ['0', '61', 'NaN', '2.5'])
    assert.throws(() => sentinelOrderBarrierBudget({KPMO_SENTINEL_BARRIER_POLL_SECONDS:value}));
});
