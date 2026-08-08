/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: timeout-policy.ts
 *
 * Deterministic timeout policy. No timeout implies approval for irreversible,
 * financial, security, legal, billing, or provider-procurement actions.
 */

import type { DecisionClass } from './decision-gate.js';

// ---------------------------------------------------------------------------
// Timeout Actions
// ---------------------------------------------------------------------------

export type TimeoutAction =
  | 'NO_CHANGE'
  | 'MAINTAIN_FREEZE'
  | 'DEGRADE'
  | 'HALT_SCOPE'
  | 'HALT_PLATFORM'
  | 'ESCALATE_AUTHORITY'
  | 'FAIL_CLOSED';

// ---------------------------------------------------------------------------
// Timeout Policy
// ---------------------------------------------------------------------------

export interface TimeoutPolicy {
  readonly decisionClass: DecisionClass;
  readonly defaultTimeoutMs: number;
  readonly timeoutAction: TimeoutAction;
  readonly impliesApprovalOnTimeout: false;  // NEVER true per invariant
}

// Invariant: no timeout may imply approval for sensitive decision classes
const SENSITIVE_CLASSES: DecisionClass[] = [
  'BILLING_DECISION',
  'LEGAL_DECISION',
  'PROVIDER_DECISION',
  'COMMERCIAL_DECISION',
  'SECURITY_DECISION',
  'PRODUCTION_DECISION',
  'POLICY_DECISION',
  'EMERGENCY_DECISION',
];

export function isSensitiveDecisionClass(cls: DecisionClass): boolean {
  return SENSITIVE_CLASSES.includes(cls);
}

export function getTimeoutPolicy(cls: DecisionClass): TimeoutPolicy {
  const policies: Record<DecisionClass, Pick<TimeoutPolicy, 'defaultTimeoutMs' | 'timeoutAction'>> = {
    NO_ACTION:                { defaultTimeoutMs: 0,         timeoutAction: 'NO_CHANGE' },
    INFORMATION_ONLY:         { defaultTimeoutMs: 0,         timeoutAction: 'NO_CHANGE' },
    ACKNOWLEDGEMENT_REQUIRED: { defaultTimeoutMs: 86_400_000, timeoutAction: 'ESCALATE_AUTHORITY' },
    APPROVAL_REQUIRED:        { defaultTimeoutMs: 86_400_000, timeoutAction: 'MAINTAIN_FREEZE' },
    REJECTION_REQUIRED:       { defaultTimeoutMs: 86_400_000, timeoutAction: 'FAIL_CLOSED' },
    SECURITY_DECISION:        { defaultTimeoutMs: 14_400_000, timeoutAction: 'FAIL_CLOSED' },
    COMMERCIAL_DECISION:      { defaultTimeoutMs: 86_400_000, timeoutAction: 'FAIL_CLOSED' },
    PROVIDER_DECISION:        { defaultTimeoutMs: 86_400_000, timeoutAction: 'FAIL_CLOSED' },
    BILLING_DECISION:         { defaultTimeoutMs: 86_400_000, timeoutAction: 'FAIL_CLOSED' },
    LEGAL_DECISION:           { defaultTimeoutMs: 259_200_000, timeoutAction: 'FAIL_CLOSED' },
    PRODUCTION_DECISION:      { defaultTimeoutMs: 86_400_000, timeoutAction: 'HALT_SCOPE' },
    POLICY_DECISION:          { defaultTimeoutMs: 86_400_000, timeoutAction: 'MAINTAIN_FREEZE' },
    EMERGENCY_DECISION:       { defaultTimeoutMs: 3_600_000,  timeoutAction: 'HALT_PLATFORM' },
  };

  const p = policies[cls];
  return Object.freeze({
    decisionClass: cls,
    defaultTimeoutMs: p.defaultTimeoutMs,
    timeoutAction: p.timeoutAction,
    impliesApprovalOnTimeout: false as const,
  });
}

export function validateTimeoutAction(
  cls: DecisionClass,
  proposedAction: TimeoutAction,
): { valid: boolean; reason?: string } {
  if (proposedAction === 'NO_CHANGE' && isSensitiveDecisionClass(cls)) {
    return {
      valid: false,
      reason: `NO_CHANGE on timeout is not permitted for sensitive decision class ${cls}. Must fail closed.`,
    };
  }
  return { valid: true };
}
