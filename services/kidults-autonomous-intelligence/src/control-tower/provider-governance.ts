/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: provider-governance.ts
 *
 * Provider executive state. Does NOT expose secrets.
 */

// ---------------------------------------------------------------------------
// Provider Status
// ---------------------------------------------------------------------------

export type ProviderStatus = 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE' | 'UNKNOWN';
export type ContractStatus = 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'NONE' | 'UNKNOWN';
export type CredentialStatus = 'VALID' | 'EXPIRING' | 'EXPIRED' | 'REVOKED' | 'UNKNOWN';
export type BillingStatus = 'CURRENT' | 'OVERDUE' | 'SUSPENDED' | 'UNKNOWN';

import type { RiskLevel } from './risk-engine.js';

// ---------------------------------------------------------------------------
// Provider Governance View
// ---------------------------------------------------------------------------

export interface ProviderGovernanceView {
  readonly providerId: string;
  readonly status: ProviderStatus;
  readonly dependencyLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  readonly health: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';
  readonly contractStatus: ContractStatus;
  readonly credentialStatus: CredentialStatus;   // status only — no secret values
  readonly billingStatus: BillingStatus;
  readonly usageStatus: 'WITHIN_LIMITS' | 'APPROACHING_LIMIT' | 'EXCEEDED' | 'UNKNOWN';
  readonly costRisk: RiskLevel;
  readonly operationalRisk: RiskLevel;
  readonly affectedProducts: string[];
  readonly decisionRequired: boolean;
  readonly decisionReason: string | null;
  // Note: no credentials, tokens, or secrets ever exposed
}

export function buildProviderGovernanceView(
  providerId: string,
  opts: Omit<ProviderGovernanceView, 'providerId'>,
): ProviderGovernanceView {
  return Object.freeze({ providerId, ...opts });
}

export function simulateHealthyProvider(providerId: string): ProviderGovernanceView {
  return buildProviderGovernanceView(providerId, {
    status: 'OPERATIONAL',
    dependencyLevel: 'HIGH',
    health: 'HEALTHY',
    contractStatus: 'ACTIVE',
    credentialStatus: 'VALID',
    billingStatus: 'CURRENT',
    usageStatus: 'WITHIN_LIMITS',
    costRisk: 'LOW',
    operationalRisk: 'LOW',
    affectedProducts: [],
    decisionRequired: false,
    decisionReason: null,
  });
}

export function simulateDegradedProvider(providerId: string): ProviderGovernanceView {
  return buildProviderGovernanceView(providerId, {
    status: 'DEGRADED',
    dependencyLevel: 'CRITICAL',
    health: 'DEGRADED',
    contractStatus: 'ACTIVE',
    credentialStatus: 'VALID',
    billingStatus: 'CURRENT',
    usageStatus: 'WITHIN_LIMITS',
    costRisk: 'MODERATE',
    operationalRisk: 'HIGH',
    affectedProducts: ['kidults-intelligence-core'],
    decisionRequired: true,
    decisionReason: 'Provider outage requires executive decision on continuity plan.',
  });
}
