/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: gateway-metrics.ts
 *
 * Non-sensitive observability counters and latency tracking (spec §29).
 */

// ---------------------------------------------------------------------------
// Counter Registry
// ---------------------------------------------------------------------------

type MetricKey =
  | 'control_tower_snapshot_read'
  | 'control_tower_live_refresh'
  | 'executive_action_request'
  | 'executive_action_accepted'
  | 'executive_action_rejected'
  | 'executive_action_authority_denied'
  | 'executive_action_preflight_failed'
  | 'executive_action_verified'
  | 'executive_action_rolled_back'
  | 'gateway_error_count';

const counters: Record<MetricKey, number> = {
  control_tower_snapshot_read:          0,
  control_tower_live_refresh:           0,
  executive_action_request:             0,
  executive_action_accepted:            0,
  executive_action_rejected:            0,
  executive_action_authority_denied:    0,
  executive_action_preflight_failed:    0,
  executive_action_verified:            0,
  executive_action_rolled_back:         0,
  gateway_error_count:                  0,
};

// Latency tracking (milliseconds)
const latencies: number[] = [];
const MAX_LATENCY_SAMPLES = 1000;

export function increment(metric: MetricKey, amount = 1): void {
  counters[metric] += amount;
}

export function recordLatency(ms: number): void {
  latencies.push(ms);
  if (latencies.length > MAX_LATENCY_SAMPLES) latencies.shift();
}

export function getMetricSnapshot(): {
  counters: Record<MetricKey, number>;
  gateway_latency_ms: { p50: number; p95: number; p99: number; samples: number };
} {
  const sorted = [...latencies].sort((a, b) => a - b);
  const p = (pct: number) =>
    sorted.length === 0 ? 0 : sorted[Math.floor((pct / 100) * sorted.length)] ?? 0;

  return {
    counters: { ...counters },
    gateway_latency_ms: {
      p50: p(50),
      p95: p(95),
      p99: p(99),
      samples: sorted.length,
    },
  };
}
