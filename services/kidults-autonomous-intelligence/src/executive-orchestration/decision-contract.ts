/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: decision-contract.ts
 *
 * Canonical decision contract produced by A28 and consumed by A29.
 */

import type { AuthorityLevel } from '../control-tower/authority-model.js';
import type { DecisionLifecycleState } from './decision-lifecycle.js';
import type { ExecutiveAction } from './approval-record.js';

// ---------------------------------------------------------------------------
// Decision Classes (from A28)
// ---------------------------------------------------------------------------

export type DecisionClass =
  | 'NO_ACTION'
  | 'INFORMATION_ONLY'
  | 'ACKNOWLEDGEMENT_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'REJECTION_REQUIRED'
  | 'SECURITY_DECISION'
  | 'COMMERCIAL_DECISION'
  | 'PROVIDER_DECISION'
  | 'BILLING_DECISION'
  | 'LEGAL_DECISION'
  | 'PRODUCTION_DECISION'
  | 'POLICY_DECISION'
  | 'EMERGENCY_DECISION';

// ---------------------------------------------------------------------------
// Priority / Severity
// ---------------------------------------------------------------------------

export type DecisionPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
export type DecisionSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

// ---------------------------------------------------------------------------
// Timeout Default Actions (A28 policy)
// ---------------------------------------------------------------------------

export type TimeoutDefaultAction =
  | 'NO_CHANGE'
  | 'MAINTAIN_FREEZE'
  | 'DEGRADE'
  | 'HALT_SCOPE'
  | 'HALT_PLATFORM'
  | 'ESCALATE_AUTHORITY'
  | 'FAIL_CLOSED';

// ---------------------------------------------------------------------------
// Decision Contract
// ---------------------------------------------------------------------------

export interface DecisionContract {
  decisionId: string;
  sourceControlPlaneId: string;
  decisionClass: DecisionClass;
  priority: DecisionPriority;
  severity: DecisionSeverity;
  authorityRequired: AuthorityLevel;
  title: string;
  summary: string;
  recommendedOption: ExecutiveAction;
  allowedOptions: ExecutiveAction[];
  prohibitedOptions: ExecutiveAction[];
  affectedScopes: string[];
  policyBasis: string[];
  evidenceRefs: string[];
  riskIfApproved: string;
  riskIfRejected: string;
  riskIfDeferred: string;
  riskIfNoDecision: string;
  deadline: string;
  defaultOnTimeout: TimeoutDefaultAction;
  createdAt: string;
  status: DecisionLifecycleState;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ContractValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

const REQUIRED_FIELDS: ReadonlyArray<keyof DecisionContract> = [
  'decisionId', 'sourceControlPlaneId', 'decisionClass', 'priority', 'severity',
  'authorityRequired', 'title', 'summary', 'recommendedOption', 'allowedOptions',
  'prohibitedOptions', 'affectedScopes', 'policyBasis', 'evidenceRefs',
  'riskIfApproved', 'riskIfRejected', 'riskIfDeferred', 'riskIfNoDecision',
  'deadline', 'defaultOnTimeout', 'createdAt', 'status',
];

export function validateDecisionContract(contract: Partial<DecisionContract>): ContractValidationResult {
  for (const field of REQUIRED_FIELDS) {
    if (contract[field] === undefined || contract[field] === null) {
      return { valid: false, reason: `Decision contract missing required field: ${field}.` };
    }
  }
  if (!contract.evidenceRefs || contract.evidenceRefs.length === 0) {
    return { valid: false, reason: 'Decision contract must have at least one evidence reference.' };
  }
  return { valid: true };
}
