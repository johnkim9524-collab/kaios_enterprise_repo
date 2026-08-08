/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: commercial-governance.ts
 *
 * Commercial governance view. A28 must never bypass A23.
 */

import type { RiskLevel } from './risk-engine.js';

// ---------------------------------------------------------------------------
// Commercial Governance View
// ---------------------------------------------------------------------------

export type CommercialState = 'ACTIVE' | 'DEGRADED' | 'BLOCKED' | 'SUSPENDED' | 'UNKNOWN';

export interface CommercialGovernanceView {
  readonly commercialState: CommercialState;
  readonly eligibleProducts: string[];
  readonly eligibleChannels: string[];
  readonly blockedChannels: string[];
  readonly providerDependencies: string[];
  readonly billingDependencies: string[];
  readonly contractDependencies: string[];
  readonly commercialRisk: RiskLevel;
  readonly decisionRequired: boolean;
  readonly decisionReason: string | null;
  // Invariant: A28 never bypasses A23
  readonly a23EvidenceRef: string;
}

export function buildCommercialGovernanceView(
  opts: CommercialGovernanceView,
): CommercialGovernanceView {
  return Object.freeze(opts);
}

export function simulateHealthyCommercial(): CommercialGovernanceView {
  return buildCommercialGovernanceView({
    commercialState: 'ACTIVE',
    eligibleProducts: ['kidults-intelligence-core'],
    eligibleChannels: ['direct', 'partner'],
    blockedChannels: [],
    providerDependencies: ['provider-alpha'],
    billingDependencies: ['billing-account-primary'],
    contractDependencies: ['contract-v2'],
    commercialRisk: 'LOW',
    decisionRequired: false,
    decisionReason: null,
    a23EvidenceRef: 'A23_COMMERCIAL_DELIVERY_CONTROL',
  });
}

export function simulateBlockedCommercial(reason: string): CommercialGovernanceView {
  return buildCommercialGovernanceView({
    commercialState: 'BLOCKED',
    eligibleProducts: [],
    eligibleChannels: [],
    blockedChannels: ['direct', 'partner'],
    providerDependencies: ['provider-alpha'],
    billingDependencies: ['billing-account-primary'],
    contractDependencies: ['contract-v2'],
    commercialRisk: 'HIGH',
    decisionRequired: true,
    decisionReason: reason,
    a23EvidenceRef: 'A23_COMMERCIAL_DELIVERY_CONTROL',
  });
}
