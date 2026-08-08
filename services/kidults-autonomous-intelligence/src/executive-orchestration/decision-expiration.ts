/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: decision-expiration.ts
 *
 * Expired decisions must not execute.
 * Timeout actions follow A28 policy — never default to implicit approval.
 */

import type { TimeoutDefaultAction } from './decision-contract.js';
import type { DecisionLifecycleState } from './decision-lifecycle.js';

// ---------------------------------------------------------------------------
// Expiration Check
// ---------------------------------------------------------------------------

export type ExpirationCheckResult =
  | { expired: false }
  | { expired: true; reason: string; timeoutAction: TimeoutDefaultAction };

export function checkDecisionExpiration(params: {
  decisionId: string;
  deadline: string;
  nowIso: string;
  defaultOnTimeout: TimeoutDefaultAction;
  status: DecisionLifecycleState;
}): ExpirationCheckResult {
  const { decisionId, deadline, nowIso, defaultOnTimeout, status } = params;

  if (status === 'EXPIRED' || status === 'CLOSED' || status === 'SUPERSEDED') {
    return {
      expired: true,
      reason: `Decision ${decisionId} is already in terminal/expiry state: ${status}.`,
      timeoutAction: defaultOnTimeout,
    };
  }

  if (nowIso >= deadline) {
    return {
      expired: true,
      reason: `Decision ${decisionId} deadline ${deadline} has passed (now: ${nowIso}). Applying timeout action: ${defaultOnTimeout}.`,
      timeoutAction: defaultOnTimeout,
    };
  }

  return { expired: false };
}

// ---------------------------------------------------------------------------
// Timeout Action to Lifecycle State
// ---------------------------------------------------------------------------

export function lifecycleStateForTimeoutAction(
  action: TimeoutDefaultAction,
): DecisionLifecycleState {
  const map: Record<TimeoutDefaultAction, DecisionLifecycleState> = {
    NO_CHANGE:          'EXPIRED',
    MAINTAIN_FREEZE:    'EXPIRED',
    DEGRADE:            'EXPIRED',
    HALT_SCOPE:         'EXPIRED',
    HALT_PLATFORM:      'FAILED_CLOSED',
    ESCALATE_AUTHORITY: 'AWAITING_AUTHORITY',
    FAIL_CLOSED:        'FAILED_CLOSED',
  };
  return map[action];
}
