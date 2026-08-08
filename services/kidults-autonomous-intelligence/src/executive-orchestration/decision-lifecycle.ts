/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: decision-lifecycle.ts
 *
 * Canonical lifecycle state machine for executive decisions.
 * Invalid transitions fail closed — never implicitly approve.
 */

// ---------------------------------------------------------------------------
// Lifecycle States
// ---------------------------------------------------------------------------

export type DecisionLifecycleState =
  | 'CREATED'
  | 'RECOMMENDED'
  | 'AWAITING_AUTHORITY'
  | 'AWAITING_DECISION'
  | 'APPROVED'
  | 'REJECTED'
  | 'DEFERRED'
  | 'EXPIRED'
  | 'PREFLIGHT_PENDING'
  | 'PREFLIGHT_PASSED'
  | 'PREFLIGHT_FAILED'
  | 'EXECUTION_PENDING'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'ROLLBACK_PENDING'
  | 'ROLLED_BACK'
  | 'FAILED_CLOSED'
  | 'CLOSED'
  | 'SUPERSEDED';

// ---------------------------------------------------------------------------
// Valid Transitions (allowlist)
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<DecisionLifecycleState, ReadonlyArray<DecisionLifecycleState>> = {
  CREATED:            ['RECOMMENDED', 'EXPIRED', 'SUPERSEDED', 'FAILED_CLOSED'],
  RECOMMENDED:        ['AWAITING_AUTHORITY', 'AWAITING_DECISION', 'EXPIRED', 'SUPERSEDED', 'FAILED_CLOSED'],
  AWAITING_AUTHORITY: ['AWAITING_DECISION', 'EXPIRED', 'SUPERSEDED', 'FAILED_CLOSED'],
  AWAITING_DECISION:  ['APPROVED', 'REJECTED', 'DEFERRED', 'EXPIRED', 'SUPERSEDED', 'FAILED_CLOSED'],
  APPROVED:           ['PREFLIGHT_PENDING', 'REJECTED', 'SUPERSEDED', 'FAILED_CLOSED'],
  REJECTED:           ['CLOSED'],
  DEFERRED:           ['AWAITING_DECISION', 'EXPIRED', 'SUPERSEDED', 'FAILED_CLOSED'],
  EXPIRED:            ['CLOSED', 'FAILED_CLOSED'],
  PREFLIGHT_PENDING:  ['PREFLIGHT_PASSED', 'PREFLIGHT_FAILED', 'FAILED_CLOSED'],
  PREFLIGHT_PASSED:   ['EXECUTION_PENDING', 'FAILED_CLOSED'],
  PREFLIGHT_FAILED:   ['FAILED_CLOSED', 'PREFLIGHT_PENDING'],
  EXECUTION_PENDING:  ['EXECUTING', 'FAILED_CLOSED'],
  EXECUTING:          ['VERIFYING', 'ROLLBACK_PENDING', 'FAILED_CLOSED'],
  VERIFYING:          ['VERIFIED', 'ROLLBACK_PENDING', 'FAILED_CLOSED'],
  VERIFIED:           ['CLOSED', 'ROLLBACK_PENDING'],
  ROLLBACK_PENDING:   ['ROLLED_BACK', 'FAILED_CLOSED'],
  ROLLED_BACK:        ['CLOSED', 'FAILED_CLOSED'],
  FAILED_CLOSED:      ['CLOSED'],
  CLOSED:             [],
  SUPERSEDED:         ['CLOSED'],
};

// ---------------------------------------------------------------------------
// Transition Validation
// ---------------------------------------------------------------------------

export type TransitionResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export function validateTransition(
  from: DecisionLifecycleState,
  to: DecisionLifecycleState,
): TransitionResult {
  const allowed = VALID_TRANSITIONS[from] as readonly DecisionLifecycleState[];
  if (!allowed.includes(to)) {
    return {
      allowed: false,
      reason: `Invalid lifecycle transition: ${from} → ${to}. Failing closed.`,
    };
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Terminal States
// ---------------------------------------------------------------------------

export const TERMINAL_STATES: ReadonlySet<DecisionLifecycleState> = new Set([
  'CLOSED',
  'FAILED_CLOSED',
]);

export function isTerminal(state: DecisionLifecycleState): boolean {
  return TERMINAL_STATES.has(state);
}

// ---------------------------------------------------------------------------
// Execution-Eligible States
// ---------------------------------------------------------------------------

export function canExecute(state: DecisionLifecycleState): boolean {
  return state === 'EXECUTION_PENDING';
}

// ---------------------------------------------------------------------------
// Preflight-Eligible States
// ---------------------------------------------------------------------------

export function requiresPreflight(state: DecisionLifecycleState): boolean {
  return state === 'APPROVED';
}
