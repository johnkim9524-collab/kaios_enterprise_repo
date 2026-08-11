export function computeScarcityTargetCapacity({ operationalReference, currentEligible, availableTargets }) {
  if (!Number.isInteger(operationalReference) || operationalReference <= 0) {
    throw new Error('operationalReference must be a positive integer');
  }
  if (!Number.isInteger(currentEligible) || currentEligible < 0) {
    throw new Error('currentEligible must be a non-negative integer');
  }
  if (!Number.isInteger(availableTargets) || availableTargets < 0) {
    throw new Error('availableTargets must be a non-negative integer');
  }

  const calibrationTargetGap = Math.max(0, operationalReference - currentEligible);
  const acquisitionTargetGap = Math.min(calibrationTargetGap, availableTargets);
  const calibrationReferenceShortfall = calibrationTargetGap - acquisitionTargetGap;

  return {
    calibrationTargetGap,
    acquisitionTargetGap,
    calibrationReferenceShortfall,
    candidateSupplyBounded: calibrationReferenceShortfall > 0,
  };
}
