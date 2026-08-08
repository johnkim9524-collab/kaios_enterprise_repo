/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: decision-closure.ts
 *
 * Decision may close only when all required conditions are met.
 */

import type { VerificationOutcome } from './verification.js';

// ---------------------------------------------------------------------------
// Closure Class
// ---------------------------------------------------------------------------

export type ClosureClass =
  | 'APPROVED_AND_EXECUTED'
  | 'APPROVED_AND_ROLLED_BACK'
  | 'REJECTED'
  | 'DEFERRED'
  | 'EXPIRED'
  | 'FAILED_CLOSED';

// ---------------------------------------------------------------------------
// Closure Conditions
// ---------------------------------------------------------------------------

export interface ClosureConditions {
  finalActionKnown: boolean;
  executionCompletedOrNotRequired: boolean;
  verificationCompleted: boolean;
  evidenceComplete: boolean;
  auditComplete: boolean;
  noUnresolvedRollback: boolean;
  noUnresolvedCriticalEscalation: boolean;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type ClosureCheckResult =
  | { canClose: true; closureClass: ClosureClass }
  | { canClose: false; blockers: string[] };

// ---------------------------------------------------------------------------
// Derive Closure Class
// ---------------------------------------------------------------------------

export function deriveClosureClass(params: {
  verificationOutcome?: VerificationOutcome;
  wasRolledBack: boolean;
  wasRejected: boolean;
  wasDeferred: boolean;
  wasExpired: boolean;
  wasFailedClosed: boolean;
}): ClosureClass {
  if (params.wasFailedClosed) return 'FAILED_CLOSED';
  if (params.wasExpired) return 'EXPIRED';
  if (params.wasDeferred) return 'DEFERRED';
  if (params.wasRejected) return 'REJECTED';
  if (params.wasRolledBack) return 'APPROVED_AND_ROLLED_BACK';
  return 'APPROVED_AND_EXECUTED';
}

// ---------------------------------------------------------------------------
// Closure Check
// ---------------------------------------------------------------------------

export function checkClosureConditions(
  conditions: ClosureConditions,
  closureClass: ClosureClass,
): ClosureCheckResult {
  const blockers: string[] = [];

  if (!conditions.finalActionKnown) blockers.push('Final action is not yet known.');
  if (!conditions.executionCompletedOrNotRequired) blockers.push('Execution has not completed or been appropriately resolved.');
  if (!conditions.verificationCompleted) blockers.push('Verification has not completed.');
  if (!conditions.evidenceComplete) blockers.push('Evidence record is incomplete.');
  if (!conditions.auditComplete) blockers.push('Audit record is incomplete.');
  if (!conditions.noUnresolvedRollback) blockers.push('There is an unresolved rollback.');
  if (!conditions.noUnresolvedCriticalEscalation) blockers.push('There is an unresolved critical escalation.');

  if (blockers.length > 0) {
    return { canClose: false, blockers };
  }

  return { canClose: true, closureClass };
}
