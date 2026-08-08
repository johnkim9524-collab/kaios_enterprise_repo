/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: decision-supersession.ts
 *
 * If incident/risk/platform state materially changes, old decision is SUPERSEDED.
 * A new decision is generated from current evidence.
 * Never execute stale superseded decisions.
 */

import type { DecisionContract } from './decision-contract.js';

// ---------------------------------------------------------------------------
// Supersession Record
// ---------------------------------------------------------------------------

export interface SupersessionRecord {
  supersededDecisionId: string;
  newDecisionId: string;
  reason: string;
  materialChangeType: string;
  supersededAt: string;
}

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export type SupersessionCheckResult =
  | { superseded: false }
  | { superseded: true; reason: string };

export function checkIfSuperseded(contract: DecisionContract): SupersessionCheckResult {
  if (contract.status === 'SUPERSEDED') {
    return {
      superseded: true,
      reason: `Decision ${contract.decisionId} has been superseded. Execution blocked. A new decision must be generated from current evidence.`,
    };
  }
  return { superseded: false };
}

// ---------------------------------------------------------------------------
// Mark as Superseded
// ---------------------------------------------------------------------------

export function buildSupersessionRecord(params: {
  supersededDecisionId: string;
  newDecisionId: string;
  materialChangeType: string;
  reason: string;
  nowIso: string;
}): SupersessionRecord {
  return {
    supersededDecisionId: params.supersededDecisionId,
    newDecisionId: params.newDecisionId,
    reason: params.reason,
    materialChangeType: params.materialChangeType,
    supersededAt: params.nowIso,
  };
}
