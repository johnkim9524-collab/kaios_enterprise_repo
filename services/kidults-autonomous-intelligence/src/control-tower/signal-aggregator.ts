/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: signal-aggregator.ts
 *
 * Aggregates canonical evidence signals from A15–A27 by stable evidenceRef.
 * Does NOT create parallel definitions; references upstream evidence directly.
 */

import type { HealthStatus } from './control-plane.js';

// ---------------------------------------------------------------------------
// Upstream Evidence References
// ---------------------------------------------------------------------------

export interface EvidenceRef {
  readonly stage: string;
  readonly evidenceId: string;
  readonly path: string;
  readonly producedAt: string;
  readonly signalType: string;
}

export interface AggregatedSignal {
  readonly source: string;         // A15 … A27
  readonly evidenceRef: EvidenceRef;
  readonly health: HealthStatus;
  readonly changeFreeze: boolean;
  readonly activeIncidents: number;
  readonly degradedScopes: number;
  readonly haltedScopes: number;
  readonly executiveActionRequired: boolean;
  readonly notes: string[];
}

// ---------------------------------------------------------------------------
// Signal Sources (canonical — do not redefine upstream logic)
// ---------------------------------------------------------------------------

export type SignalSource =
  | 'A15_POLICY'
  | 'A16_EXECUTION'
  | 'A17_ADAPTER_READINESS'
  | 'A18_ACQUISITION'
  | 'A19_PRODUCTIZATION_GAP'
  | 'A20_PRODUCT_READINESS'
  | 'A21_PIPELINE'
  | 'A22_PUBLICATION'
  | 'A23_COMMERCIAL_DELIVERY'
  | 'A24_PRODUCTION_ACTIVATION'
  | 'A25_RUNTIME'
  | 'A26_RECOVERY'
  | 'A27_GOVERNANCE';

// ---------------------------------------------------------------------------
// Signal Aggregation
// ---------------------------------------------------------------------------

export interface SignalAggregationResult {
  readonly aggregatedAt: string;
  readonly signals: AggregatedSignal[];
  readonly overallHealth: HealthStatus;
  readonly changeFreezeDetected: boolean;
  readonly totalActiveIncidents: number;
  readonly totalDegradedScopes: number;
  readonly totalHaltedScopes: number;
  readonly executiveActionRequired: boolean;
  readonly evidenceRefs: EvidenceRef[];
}

export function aggregateSignals(signals: AggregatedSignal[]): SignalAggregationResult {
  const healthRank: Record<HealthStatus, number> = {
    HEALTHY: 0,
    DEGRADED: 1,
    CRITICAL: 2,
    UNKNOWN: 3,
  };

  const overallHealth: HealthStatus = signals.reduce<HealthStatus>((worst, s) => {
    return healthRank[s.health] > healthRank[worst] ? s.health : worst;
  }, 'HEALTHY');

  const changeFreezeDetected = signals.some((s) => s.changeFreeze);
  const totalActiveIncidents = signals.reduce((sum, s) => sum + s.activeIncidents, 0);
  const totalDegradedScopes = signals.reduce((sum, s) => sum + s.degradedScopes, 0);
  const totalHaltedScopes = signals.reduce((sum, s) => sum + s.haltedScopes, 0);
  const executiveActionRequired = signals.some((s) => s.executiveActionRequired);
  const evidenceRefs = signals.map((s) => s.evidenceRef);

  return Object.freeze({
    aggregatedAt: new Date().toISOString(),
    signals,
    overallHealth,
    changeFreezeDetected,
    totalActiveIncidents,
    totalDegradedScopes,
    totalHaltedScopes,
    executiveActionRequired,
    evidenceRefs,
  });
}

// ---------------------------------------------------------------------------
// Build a synthetic simulation signal (used by control-tower runner)
// ---------------------------------------------------------------------------

export function buildSimulatedSignal(
  source: SignalSource,
  evidenceId: string,
  health: HealthStatus,
  opts: Partial<Omit<AggregatedSignal, 'source' | 'evidenceRef' | 'health'>> = {},
): AggregatedSignal {
  const ref: EvidenceRef = {
    stage: source,
    evidenceId,
    path: `reports/${source.toLowerCase()}/${evidenceId}.json`,
    producedAt: new Date().toISOString(),
    signalType: 'AUTONOMOUS_EVIDENCE',
  };
  return Object.freeze({
    source,
    evidenceRef: ref,
    health,
    changeFreeze: opts.changeFreeze ?? false,
    activeIncidents: opts.activeIncidents ?? 0,
    degradedScopes: opts.degradedScopes ?? 0,
    haltedScopes: opts.haltedScopes ?? 0,
    executiveActionRequired: opts.executiveActionRequired ?? false,
    notes: opts.notes ?? [],
  });
}
