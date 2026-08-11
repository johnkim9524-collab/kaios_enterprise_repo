import test from 'node:test';
import assert from 'node:assert/strict';

import { computeScarcityTargetCapacity } from '../scripts/lib/scarcity-target-capacity.mjs';

test('uses the full calibration gap when candidate supply is sufficient', () => {
  assert.deepEqual(
    computeScarcityTargetCapacity({ operationalReference: 25, currentEligible: 5, availableTargets: 30 }),
    {
      calibrationTargetGap: 20,
      acquisitionTargetGap: 20,
      calibrationReferenceShortfall: 0,
      candidateSupplyBounded: false,
    },
  );
});

test('bounds the acquisition queue by real relevant candidate supply while preserving calibration shortfall', () => {
  assert.deepEqual(
    computeScarcityTargetCapacity({ operationalReference: 25, currentEligible: 2, availableTargets: 7 }),
    {
      calibrationTargetGap: 23,
      acquisitionTargetGap: 7,
      calibrationReferenceShortfall: 16,
      candidateSupplyBounded: true,
    },
  );
});

test('does not create targets when the operational reference is already filled', () => {
  assert.deepEqual(
    computeScarcityTargetCapacity({ operationalReference: 25, currentEligible: 25, availableTargets: 8 }),
    {
      calibrationTargetGap: 0,
      acquisitionTargetGap: 0,
      calibrationReferenceShortfall: 0,
      candidateSupplyBounded: false,
    },
  );
});

test('rejects malformed capacity inputs fail-closed', () => {
  for (const input of [
    { operationalReference: 0, currentEligible: 0, availableTargets: 0 },
    { operationalReference: 25, currentEligible: -1, availableTargets: 0 },
    { operationalReference: 25, currentEligible: 0, availableTargets: 1.5 },
  ]) {
    assert.throws(() => computeScarcityTargetCapacity(input));
  }
});
