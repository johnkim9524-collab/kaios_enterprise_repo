/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: publication-governance.ts
 *
 * Publication governance view. A28 must never bypass A22.
 */

import type { RiskLevel } from './risk-engine.js';

// ---------------------------------------------------------------------------
// Publication Governance View
// ---------------------------------------------------------------------------

export type PublicationState = 'ACTIVE' | 'DEGRADED' | 'BLOCKED' | 'FROZEN' | 'UNKNOWN';

export interface PublicationGovernanceView {
  readonly publicationState: PublicationState;
  readonly eligibleProducts: string[];
  readonly blockedProducts: string[];
  readonly blockedReasons: Record<string, string>;
  readonly channels: string[];
  readonly activeFreeze: boolean;
  readonly freezeReason: string | null;
  readonly risk: RiskLevel;
  readonly decisionRequired: boolean;
  // Invariant: A28 never bypasses A22 — publication eligibility is derived from A22 evidence
  readonly a22EvidenceRef: string;
}

export function buildPublicationGovernanceView(
  opts: PublicationGovernanceView,
): PublicationGovernanceView {
  return Object.freeze(opts);
}

export function simulateHealthyPublication(): PublicationGovernanceView {
  return buildPublicationGovernanceView({
    publicationState: 'ACTIVE',
    eligibleProducts: ['kidults-intelligence-core', 'kidults-analytics'],
    blockedProducts: [],
    blockedReasons: {},
    channels: ['api', 'dashboard'],
    activeFreeze: false,
    freezeReason: null,
    risk: 'LOW',
    decisionRequired: false,
    a22EvidenceRef: 'A22_PUBLICATION_CONTROL',
  });
}

export function simulateBlockedPublication(reason: string): PublicationGovernanceView {
  return buildPublicationGovernanceView({
    publicationState: 'BLOCKED',
    eligibleProducts: [],
    blockedProducts: ['kidults-intelligence-core'],
    blockedReasons: { 'kidults-intelligence-core': reason },
    channels: [],
    activeFreeze: true,
    freezeReason: reason,
    risk: 'HIGH',
    decisionRequired: true,
    a22EvidenceRef: 'A22_PUBLICATION_CONTROL',
  });
}
