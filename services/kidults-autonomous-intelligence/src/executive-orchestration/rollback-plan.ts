/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: rollback-plan.ts
 *
 * Every reversible material action requires a rollback plan.
 * Rollback UNKNOWN → execution prohibited.
 * Rollback FAILED → incident escalation.
 */

// ---------------------------------------------------------------------------
// Rollback Availability
// ---------------------------------------------------------------------------

export type RollbackAvailability = 'AVAILABLE' | 'NOT_REQUIRED' | 'UNKNOWN' | 'UNAVAILABLE';

// ---------------------------------------------------------------------------
// Rollback Plan
// ---------------------------------------------------------------------------

export interface RollbackPlan {
  rollbackAvailable: RollbackAvailability;
  rollbackScope: string;
  rollbackOperations: string[];
  rollbackDeadline: string;
  verification: string;
  evidenceRefs: string[];
}

// ---------------------------------------------------------------------------
// Rollback Outcome
// ---------------------------------------------------------------------------

export type RollbackOutcome = 'SUCCESS' | 'FAILED' | 'NOT_REQUIRED';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type RollbackPlanValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export function validateRollbackPlan(
  plan: RollbackPlan,
  isMaterialAction: boolean,
): RollbackPlanValidationResult {
  if (!isMaterialAction) return { valid: true };

  if (plan.rollbackAvailable === 'UNKNOWN') {
    return {
      valid: false,
      reason: 'Rollback availability is UNKNOWN for a material action. Execution prohibited per A29 invariants.',
    };
  }

  if (plan.rollbackAvailable === 'UNAVAILABLE') {
    return {
      valid: false,
      reason: 'Rollback is UNAVAILABLE for a material action. Execution blocked unless explicitly approved as irreversible.',
    };
  }

  if (plan.rollbackAvailable === 'AVAILABLE') {
    if (plan.rollbackOperations.length === 0) {
      return {
        valid: false,
        reason: 'Rollback plan claims AVAILABLE but provides no rollback operations.',
      };
    }
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Handle Rollback Failure
// ---------------------------------------------------------------------------

export interface RollbackFailureEscalation {
  decisionId: string;
  planId: string;
  failedAt: string;
  reason: string;
  escalationRequired: true;
}

export function buildRollbackFailureEscalation(
  decisionId: string,
  planId: string,
  reason: string,
  nowIso: string,
): RollbackFailureEscalation {
  return {
    decisionId,
    planId,
    failedAt: nowIso,
    reason,
    escalationRequired: true,
  };
}
