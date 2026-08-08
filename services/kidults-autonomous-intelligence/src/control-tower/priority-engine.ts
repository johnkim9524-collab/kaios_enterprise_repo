/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: priority-engine.ts
 *
 * Deterministic executive priority model.
 */

import type { RiskLevel } from './risk-engine.js';

// ---------------------------------------------------------------------------
// Priority Levels
// ---------------------------------------------------------------------------

export type ExecutivePriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

const PRIORITY_RANK: Record<ExecutivePriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

export function priorityRank(p: ExecutivePriority): number {
  return PRIORITY_RANK[p];
}

export function highestPriority(priorities: ExecutivePriority[]): ExecutivePriority {
  if (priorities.length === 0) return 'P4';
  return priorities.reduce((a, b) => (PRIORITY_RANK[a] <= PRIORITY_RANK[b] ? a : b));
}

// ---------------------------------------------------------------------------
// Priority Inputs
// ---------------------------------------------------------------------------

export interface PriorityInputs {
  readonly incidentSeverity: 'SEV0' | 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4' | 'NONE';
  readonly overallRisk: RiskLevel;
  readonly hasDeadline: boolean;
  readonly blastRadius: 'PLATFORM' | 'DOMAIN' | 'PRODUCT' | 'OPERATION' | 'ISOLATED' | 'NONE';
  readonly financialImpact: boolean;
  readonly securityExposure: boolean;
  readonly customerImpact: boolean;
  readonly decisionDependency: boolean;
}

export function computePriority(inputs: PriorityInputs): ExecutivePriority {
  // P0: immediate executive action
  if (
    inputs.incidentSeverity === 'SEV0' ||
    inputs.overallRisk === 'CRITICAL' ||
    (inputs.securityExposure && inputs.financialImpact)
  ) {
    return 'P0';
  }

  // P1: urgent decision
  if (
    inputs.incidentSeverity === 'SEV1' ||
    inputs.overallRisk === 'HIGH' ||
    inputs.securityExposure ||
    (inputs.financialImpact && inputs.hasDeadline)
  ) {
    return 'P1';
  }

  // P2: same-day attention
  if (
    inputs.incidentSeverity === 'SEV2' ||
    inputs.overallRisk === 'MODERATE' ||
    inputs.customerImpact ||
    inputs.blastRadius === 'DOMAIN' ||
    inputs.blastRadius === 'PLATFORM'
  ) {
    return 'P2';
  }

  // P3: routine review
  if (
    inputs.incidentSeverity === 'SEV3' ||
    inputs.decisionDependency
  ) {
    return 'P3';
  }

  return 'P4';
}
