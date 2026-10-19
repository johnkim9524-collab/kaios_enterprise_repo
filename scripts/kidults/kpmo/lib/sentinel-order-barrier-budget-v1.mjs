// Reserve/Sentinel may consume 35 minutes; allow terminal upload/readback margin.
export const SENTINEL_PRODUCER_WAIT_SECONDS = 2100;
export const SENTINEL_TERMINAL_MARGIN_SECONDS = 300;
export const SENTINEL_ORDER_BARRIER_TIMEOUT_SECONDS = SENTINEL_PRODUCER_WAIT_SECONDS + SENTINEL_TERMINAL_MARGIN_SECONDS;
export const SENTINEL_ORDER_BARRIER_LOOKBACK_SECONDS = 2700;
export function sentinelOrderBarrierBudget(env = {}) {
  const integer = (value, fallback, min, max, name) => {
    const n = value == null || value === '' ? fallback : Number(value);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`ASSURANCE_SENTINEL_BARRIER_${name}_INVALID`);
    return n;
  };
  return {
    timeoutSeconds: integer(env.KPMO_SENTINEL_BARRIER_TIMEOUT_SECONDS, SENTINEL_ORDER_BARRIER_TIMEOUT_SECONDS,
      SENTINEL_ORDER_BARRIER_TIMEOUT_SECONDS, SENTINEL_ORDER_BARRIER_TIMEOUT_SECONDS, 'TIMEOUT'),
    pollSeconds: integer(env.KPMO_SENTINEL_BARRIER_POLL_SECONDS, 10, 2, 60, 'POLL'),
    cutoffWindowSeconds: SENTINEL_ORDER_BARRIER_LOOKBACK_SECONDS,
  };
}
export function withinSentinelObservationWindow(createdMs, cutoffMs, windowSeconds, observationStartMs = cutoffMs - windowSeconds * 1000) {
  return Number.isFinite(createdMs) && Number.isFinite(cutoffMs) && Number.isFinite(observationStartMs)
    && createdMs <= cutoffMs && createdMs >= observationStartMs;
}

export function sentinelRunNameMatches(runName, runId, eventName) {
  return Number.isSafeInteger(runId) && runId > 0
    && ['repository_dispatch', 'workflow_dispatch'].includes(eventName)
    && (runName === `KIDULTS_SENTINEL/${runId}` || runName === 'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1');
}
