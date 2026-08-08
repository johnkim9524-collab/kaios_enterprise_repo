/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: approval-record.ts
 *
 * Canonical approval record schema and lifecycle status.
 * Immutable once created; status transitions must be recorded.
 */

import type { AuthorityLevel, ActorType } from '../control-tower/authority-model.js';
import type { DecisionLifecycleState } from './decision-lifecycle.js';

// ---------------------------------------------------------------------------
// Approval Record Status
// ---------------------------------------------------------------------------

export type ApprovalStatus =
  | 'VALID'
  | 'EXPIRED'
  | 'REVOKED'
  | 'SUPERSEDED'
  | 'INVALID';

// ---------------------------------------------------------------------------
// Executive Actions
// ---------------------------------------------------------------------------

export type ExecutiveAction =
  | 'APPROVE'
  | 'REJECT'
  | 'DEFER'
  | 'ACKNOWLEDGE'
  | 'APPROVE_LIMITED_SCOPE'
  | 'MAINTAIN_FREEZE'
  | 'RELEASE_FREEZE'
  | 'ALLOW_DEGRADED_OPERATION'
  | 'HALT_SCOPE'
  | 'RESUME_SCOPE';

const VALID_EXECUTIVE_ACTIONS: ReadonlySet<ExecutiveAction> = new Set([
  'APPROVE',
  'REJECT',
  'DEFER',
  'ACKNOWLEDGE',
  'APPROVE_LIMITED_SCOPE',
  'MAINTAIN_FREEZE',
  'RELEASE_FREEZE',
  'ALLOW_DEGRADED_OPERATION',
  'HALT_SCOPE',
  'RESUME_SCOPE',
]);

export function isValidExecutiveAction(action: string): action is ExecutiveAction {
  return VALID_EXECUTIVE_ACTIONS.has(action as ExecutiveAction);
}

// ---------------------------------------------------------------------------
// Approval Record
// ---------------------------------------------------------------------------

export interface ApprovalRecord {
  approvalId: string;
  decisionId: string;
  actorType: ActorType;
  authorityLevel: AuthorityLevel;
  action: ExecutiveAction;
  scope: string;
  reason: string;
  policyVersion: string;
  evidenceRefs: string[];
  timestamp: string;
  expiresAt: string | null;
  status: ApprovalStatus;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function buildApprovalRecord(
  params: Omit<ApprovalRecord, 'status'> & { status?: ApprovalStatus },
): ApprovalRecord {
  return {
    status: 'VALID',
    ...params,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ApprovalValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export function validateApprovalRecord(
  record: ApprovalRecord,
  nowIso: string,
): ApprovalValidationResult {
  if (record.status !== 'VALID') {
    return { valid: false, reason: `Approval record ${record.approvalId} status is ${record.status}. Not VALID.` };
  }
  if (record.expiresAt !== null && record.expiresAt < nowIso) {
    return { valid: false, reason: `Approval record ${record.approvalId} expired at ${record.expiresAt}.` };
  }
  if (!isValidExecutiveAction(record.action)) {
    return { valid: false, reason: `Approval record contains unknown executive action: ${record.action}.` };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Lifecycle state that maps to approval actions
// ---------------------------------------------------------------------------

export function lifecycleStateForAction(action: ExecutiveAction): DecisionLifecycleState {
  const map: Record<ExecutiveAction, DecisionLifecycleState> = {
    APPROVE:                   'APPROVED',
    REJECT:                    'REJECTED',
    DEFER:                     'DEFERRED',
    ACKNOWLEDGE:               'APPROVED',
    APPROVE_LIMITED_SCOPE:     'APPROVED',
    MAINTAIN_FREEZE:           'APPROVED',
    RELEASE_FREEZE:            'APPROVED',
    ALLOW_DEGRADED_OPERATION:  'APPROVED',
    HALT_SCOPE:                'APPROVED',
    RESUME_SCOPE:              'APPROVED',
  };
  return map[action];
}
