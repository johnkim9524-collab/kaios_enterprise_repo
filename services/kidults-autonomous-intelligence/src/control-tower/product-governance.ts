/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: product-governance.ts
 *
 * Intelligence product executive state. Derives from upstream evidence.
 */

// ---------------------------------------------------------------------------
// Product Governance View
// ---------------------------------------------------------------------------

export type ProductReadiness = 'READY' | 'PARTIAL' | 'NOT_READY' | 'UNKNOWN';
export type ProductStatus = 'ACTIVE' | 'DEGRADED' | 'SUSPENDED' | 'INACTIVE' | 'UNKNOWN';

export interface ProductGovernanceView {
  readonly productId: string;
  readonly readiness: ProductReadiness;
  readonly runtimeStatus: ProductStatus;
  readonly activationStatus: 'ACTIVATED' | 'PENDING' | 'BLOCKED' | 'INACTIVE' | 'UNKNOWN';
  readonly publicationStatus: 'PUBLISHED' | 'PENDING' | 'BLOCKED' | 'UNPUBLISHED' | 'UNKNOWN';
  readonly commercialStatus: 'LIVE' | 'PENDING' | 'BLOCKED' | 'INACTIVE' | 'UNKNOWN';
  readonly dependencyStatus: 'SATISFIED' | 'PARTIAL' | 'MISSING' | 'UNKNOWN';
  readonly sloStatus: 'HEALTHY' | 'BREACHED' | 'CRITICAL' | 'UNKNOWN';
  readonly incidentStatus: 'NONE' | 'ACTIVE' | 'CRITICAL' | 'UNKNOWN';
  readonly recoveryStatus: 'NONE_NEEDED' | 'IN_PROGRESS' | 'FAILED' | 'UNKNOWN';
  readonly executiveDecisionRequired: boolean;
  readonly blockReason: string | null;
  // Evidence-derived — does not define canonical product logic
}

export function buildProductGovernanceView(
  productId: string,
  opts: Omit<ProductGovernanceView, 'productId'>,
): ProductGovernanceView {
  return Object.freeze({ productId, ...opts });
}

export function simulateHealthyProduct(productId: string): ProductGovernanceView {
  return buildProductGovernanceView(productId, {
    readiness: 'READY',
    runtimeStatus: 'ACTIVE',
    activationStatus: 'ACTIVATED',
    publicationStatus: 'PUBLISHED',
    commercialStatus: 'LIVE',
    dependencyStatus: 'SATISFIED',
    sloStatus: 'HEALTHY',
    incidentStatus: 'NONE',
    recoveryStatus: 'NONE_NEEDED',
    executiveDecisionRequired: false,
    blockReason: null,
  });
}

export function simulateBlockedProduct(
  productId: string,
  blockReason: string,
): ProductGovernanceView {
  return buildProductGovernanceView(productId, {
    readiness: 'NOT_READY',
    runtimeStatus: 'SUSPENDED',
    activationStatus: 'BLOCKED',
    publicationStatus: 'BLOCKED',
    commercialStatus: 'BLOCKED',
    dependencyStatus: 'MISSING',
    sloStatus: 'CRITICAL',
    incidentStatus: 'ACTIVE',
    recoveryStatus: 'IN_PROGRESS',
    executiveDecisionRequired: true,
    blockReason,
  });
}
