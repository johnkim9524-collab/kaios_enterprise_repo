/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: decision-metrics.ts
 *
 * Canonical metrics emitted for the A29 orchestration lifecycle.
 */

// ---------------------------------------------------------------------------
// Metrics Registry
// ---------------------------------------------------------------------------

export interface A29Metrics {
  executive_decision_created_count: number;
  executive_decision_approved_count: number;
  executive_decision_rejected_count: number;
  executive_decision_deferred_count: number;
  executive_decision_expired_count: number;
  decision_preflight_failed_count: number;
  decision_execution_count: number;
  decision_execution_failed_count: number;
  decision_rollback_count: number;
  decision_superseded_count: number;
  decision_verification_failed_count: number;
  decision_mean_time_to_decide_ms: number;
  decision_mean_time_to_execute_ms: number;
  decision_mean_time_to_close_ms: number;
  active_executive_decision_count: number;
  // Internals for mean calculation
  _total_time_to_decide_ms: number;
  _total_time_to_execute_ms: number;
  _total_time_to_close_ms: number;
  _decided_count: number;
  _executed_count: number;
  _closed_count: number;
}

export function createMetrics(): A29Metrics {
  return {
    executive_decision_created_count: 0,
    executive_decision_approved_count: 0,
    executive_decision_rejected_count: 0,
    executive_decision_deferred_count: 0,
    executive_decision_expired_count: 0,
    decision_preflight_failed_count: 0,
    decision_execution_count: 0,
    decision_execution_failed_count: 0,
    decision_rollback_count: 0,
    decision_superseded_count: 0,
    decision_verification_failed_count: 0,
    decision_mean_time_to_decide_ms: 0,
    decision_mean_time_to_execute_ms: 0,
    decision_mean_time_to_close_ms: 0,
    active_executive_decision_count: 0,
    _total_time_to_decide_ms: 0,
    _total_time_to_execute_ms: 0,
    _total_time_to_close_ms: 0,
    _decided_count: 0,
    _executed_count: 0,
    _closed_count: 0,
  };
}

export function recordMetric(metrics: A29Metrics, key: keyof A29Metrics, value = 1): void {
  (metrics[key] as number) += value;
}

export function recordDecideTime(metrics: A29Metrics, ms: number): void {
  metrics._total_time_to_decide_ms += ms;
  metrics._decided_count += 1;
  metrics.decision_mean_time_to_decide_ms =
    metrics._total_time_to_decide_ms / metrics._decided_count;
}

export function recordExecuteTime(metrics: A29Metrics, ms: number): void {
  metrics._total_time_to_execute_ms += ms;
  metrics._executed_count += 1;
  metrics.decision_mean_time_to_execute_ms =
    metrics._total_time_to_execute_ms / metrics._executed_count;
}

export function recordCloseTime(metrics: A29Metrics, ms: number): void {
  metrics._total_time_to_close_ms += ms;
  metrics._closed_count += 1;
  metrics.decision_mean_time_to_close_ms =
    metrics._total_time_to_close_ms / metrics._closed_count;
}

export function publicMetrics(metrics: A29Metrics): Omit<A29Metrics,
  '_total_time_to_decide_ms' | '_total_time_to_execute_ms' | '_total_time_to_close_ms' |
  '_decided_count' | '_executed_count' | '_closed_count'> {
  const {
    _total_time_to_decide_ms: _a,
    _total_time_to_execute_ms: _b,
    _total_time_to_close_ms: _c,
    _decided_count: _d,
    _executed_count: _e,
    _closed_count: _f,
    ...pub
  } = metrics;
  return pub;
}
