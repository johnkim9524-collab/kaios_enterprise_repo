/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: verification.ts
 *
 * Execution cannot close without verification.
 * UNKNOWN outcome fails closed.
 */

// ---------------------------------------------------------------------------
// Verification Outcome
// ---------------------------------------------------------------------------

export type VerificationOutcome =
  | 'VERIFIED_SUCCESS'
  | 'VERIFIED_DEGRADED'
  | 'VERIFIED_ROLLED_BACK'
  | 'VERIFICATION_FAILED'
  | 'UNKNOWN';

// ---------------------------------------------------------------------------
// Verification Result
// ---------------------------------------------------------------------------

export interface VerificationResult {
  decisionId: string;
  planId: string;
  outcome: VerificationOutcome;
  detail: string;
  verifiedAt: string;
  evidenceRefs: string[];
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

export type VerificationCheckResult =
  | { closeable: true; outcome: VerificationOutcome }
  | { closeable: false; reason: string; outcome: VerificationOutcome };

export function evaluateVerificationResult(result: VerificationResult): VerificationCheckResult {
  if (result.outcome === 'UNKNOWN') {
    return {
      closeable: false,
      outcome: 'UNKNOWN',
      reason: `Verification outcome is UNKNOWN for decision ${result.decisionId}. Failing closed per A29 invariants.`,
    };
  }

  if (result.outcome === 'VERIFICATION_FAILED') {
    return {
      closeable: false,
      outcome: 'VERIFICATION_FAILED',
      reason: `Verification failed for decision ${result.decisionId}. Rollback may be required.`,
    };
  }

  return { closeable: true, outcome: result.outcome };
}
