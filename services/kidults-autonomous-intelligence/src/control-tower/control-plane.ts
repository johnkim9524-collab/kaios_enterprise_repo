/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: control-plane.ts
 *
 * Canonical platform-wide executive state model.
 * All invariants from A15–A27 are preserved. This plane does NOT
 * expand authority — it governs, aggregates, and gates decisions.
 */

// ---------------------------------------------------------------------------
// Platform Status
// ---------------------------------------------------------------------------

export type PlatformStatus =
  | 'EXCELLENT'
  | 'HEALTHY'
  | 'DEGRADED'
  | 'AT_RISK'
  | 'CRITICAL'
  | 'HALTED'
  | 'UNKNOWN';

// UNKNOWN blocks authority expansion
export function isPlatformStatusKnown(s: PlatformStatus): boolean {
  return s !== 'UNKNOWN';
}

export function platformStatusSeverityRank(s: PlatformStatus): number {
  const rank: Record<PlatformStatus, number> = {
    EXCELLENT: 0,
    HEALTHY: 1,
    DEGRADED: 2,
    AT_RISK: 3,
    CRITICAL: 4,
    HALTED: 5,
    UNKNOWN: 6,
  };
  return rank[s];
}

export function worstPlatformStatus(statuses: PlatformStatus[]): PlatformStatus {
  if (statuses.length === 0) return 'UNKNOWN';
  return statuses.reduce((a, b) =>
    platformStatusSeverityRank(a) >= platformStatusSeverityRank(b) ? a : b,
  );
}

// ---------------------------------------------------------------------------
// Health Dimension
// ---------------------------------------------------------------------------

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';

export function healthStatusFromPlatformStatus(p: PlatformStatus): HealthStatus {
  if (p === 'EXCELLENT' || p === 'HEALTHY') return 'HEALTHY';
  if (p === 'DEGRADED' || p === 'AT_RISK') return 'DEGRADED';
  if (p === 'CRITICAL' || p === 'HALTED') return 'CRITICAL';
  return 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Executive Control Plane State
// ---------------------------------------------------------------------------

export interface ExecutiveControlPlane {
  readonly controlPlaneId: string;
  readonly generatedAt: string;
  readonly policyVersion: string;
  readonly platformStatus: PlatformStatus;
  readonly operationalHealth: HealthStatus;
  readonly runtimeHealth: HealthStatus;
  readonly recoveryHealth: HealthStatus;
  readonly sloHealth: HealthStatus;
  readonly incidentHealth: HealthStatus;
  readonly providerHealth: HealthStatus;
  readonly publicationHealth: HealthStatus;
  readonly commercialHealth: HealthStatus;
  readonly securityHealth: HealthStatus;
  readonly dataQualityHealth: HealthStatus;
  readonly evidenceHealth: HealthStatus;
  readonly changeFreeze: boolean;
  readonly executiveActionRequired: boolean;
  readonly highestRisk: string;
  readonly activeDecisionCount: number;
  readonly activeIncidentCount: number;
  readonly degradedScopeCount: number;
  readonly haltedScopeCount: number;
  readonly summary: string;
}

export function buildControlPlane(
  id: string,
  policyVersion: string,
  dimensions: {
    operationalHealth: HealthStatus;
    runtimeHealth: HealthStatus;
    recoveryHealth: HealthStatus;
    sloHealth: HealthStatus;
    incidentHealth: HealthStatus;
    providerHealth: HealthStatus;
    publicationHealth: HealthStatus;
    commercialHealth: HealthStatus;
    securityHealth: HealthStatus;
    dataQualityHealth: HealthStatus;
    evidenceHealth: HealthStatus;
    changeFreeze: boolean;
    executiveActionRequired: boolean;
    highestRisk: string;
    activeDecisionCount: number;
    activeIncidentCount: number;
    degradedScopeCount: number;
    haltedScopeCount: number;
    summary: string;
  },
): ExecutiveControlPlane {
  const allHealthStatuses: HealthStatus[] = [
    dimensions.operationalHealth,
    dimensions.runtimeHealth,
    dimensions.recoveryHealth,
    dimensions.sloHealth,
    dimensions.incidentHealth,
    dimensions.providerHealth,
    dimensions.publicationHealth,
    dimensions.commercialHealth,
    dimensions.securityHealth,
    dimensions.dataQualityHealth,
    dimensions.evidenceHealth,
  ];

  const platformStatus = derivePlatformStatus(allHealthStatuses, dimensions);

  return Object.freeze({
    controlPlaneId: id,
    generatedAt: new Date().toISOString(),
    policyVersion,
    platformStatus,
    ...dimensions,
  });
}

function derivePlatformStatus(
  statuses: HealthStatus[],
  dims: { haltedScopeCount: number; activeIncidentCount: number; changeFreeze: boolean },
): PlatformStatus {
  if (statuses.some((s) => s === 'UNKNOWN')) return 'UNKNOWN';
  if (dims.haltedScopeCount > 0) return 'HALTED';
  if (statuses.some((s) => s === 'CRITICAL')) return 'CRITICAL';
  if (dims.activeIncidentCount > 0 || statuses.some((s) => s === 'DEGRADED')) {
    return dims.changeFreeze ? 'AT_RISK' : 'DEGRADED';
  }
  return 'HEALTHY';
}
