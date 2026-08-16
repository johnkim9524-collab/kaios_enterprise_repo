export function buildPrecisionRecoveryHeadroomDiagnostic(latency) {
  const elapsedSeconds = Number(latency?.elapsedSeconds);
  const timeoutSeconds = Number(latency?.timeoutSeconds);

  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error('precision recovery latency elapsedSeconds must be a non-negative finite number');
  }
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new Error('precision recovery latency timeoutSeconds must be a positive finite number');
  }

  const budgetUtilization = elapsedSeconds / timeoutSeconds;
  const remainingHeadroomSeconds = Math.max(0, timeoutSeconds - elapsedSeconds);
  const headroomStatus = budgetUtilization >= 0.9
    ? 'HIGH_UTILIZATION_WATCH'
    : budgetUtilization >= 0.75
      ? 'WATCH'
      : 'HEALTHY';

  return {
    status: latency?.status ?? 'UNKNOWN',
    elapsedSeconds,
    timeoutSeconds,
    budgetUtilization,
    budgetUtilizationPercent: Number((budgetUtilization * 100).toFixed(2)),
    remainingHeadroomSeconds,
    headroomStatus,
    observationalOnly: true,
    productionInput: false,
    productionEvidence: false,
    autoPruningAllowed: false,
    sourceBehaviorModified: false,
    retryPolicyModified: false,
    timeoutPolicyModified: false,
    sourceEtiquetteModified: false,
    evidenceSemanticsModified: false,
    rightsProvenanceModified: false,
    productionGateWeakened: false,
  };
}
