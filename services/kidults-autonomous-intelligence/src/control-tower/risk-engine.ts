/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: risk-engine.ts
 *
 * Deterministic executive risk dimensions. UNKNOWN always fails closed.
 */

// ---------------------------------------------------------------------------
// Risk Level
// ---------------------------------------------------------------------------

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

const RISK_RANK: Record<RiskLevel, number> = {
  LOW: 0,
  MODERATE: 1,
  HIGH: 2,
  CRITICAL: 3,
  UNKNOWN: 4,
};

export function riskRank(level: RiskLevel): number {
  return RISK_RANK[level];
}

export function worstRisk(levels: RiskLevel[]): RiskLevel {
  if (levels.length === 0) return 'UNKNOWN';
  return levels.reduce((a, b) => (RISK_RANK[a] >= RISK_RANK[b] ? a : b));
}

// UNKNOWN risk blocks authority expansion
export function isRiskKnown(level: RiskLevel): boolean {
  return level !== 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Risk Dimensions
// ---------------------------------------------------------------------------

export interface ExecutiveRiskProfile {
  readonly operationalRisk: RiskLevel;
  readonly securityRisk: RiskLevel;
  readonly providerRisk: RiskLevel;
  readonly dataRisk: RiskLevel;
  readonly publicationRisk: RiskLevel;
  readonly commercialRisk: RiskLevel;
  readonly financialRisk: RiskLevel;
  readonly reputationalRisk: RiskLevel;
  readonly dependencyRisk: RiskLevel;
  readonly continuityRisk: RiskLevel;
  readonly overallRisk: RiskLevel;
  readonly requiresExecutiveAttention: boolean;
}

export function buildRiskProfile(
  dimensions: Omit<ExecutiveRiskProfile, 'overallRisk' | 'requiresExecutiveAttention'>,
): ExecutiveRiskProfile {
  const all: RiskLevel[] = [
    dimensions.operationalRisk,
    dimensions.securityRisk,
    dimensions.providerRisk,
    dimensions.dataRisk,
    dimensions.publicationRisk,
    dimensions.commercialRisk,
    dimensions.financialRisk,
    dimensions.reputationalRisk,
    dimensions.dependencyRisk,
    dimensions.continuityRisk,
  ];

  const overallRisk = worstRisk(all);
  const requiresExecutiveAttention =
    overallRisk === 'CRITICAL' || overallRisk === 'UNKNOWN';

  return Object.freeze({
    ...dimensions,
    overallRisk,
    requiresExecutiveAttention,
  });
}

export function defaultLowRiskProfile(): ExecutiveRiskProfile {
  return buildRiskProfile({
    operationalRisk: 'LOW',
    securityRisk: 'LOW',
    providerRisk: 'LOW',
    dataRisk: 'LOW',
    publicationRisk: 'LOW',
    commercialRisk: 'LOW',
    financialRisk: 'LOW',
    reputationalRisk: 'LOW',
    dependencyRisk: 'LOW',
    continuityRisk: 'LOW',
  });
}
