/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: executive-response.ts
 *
 * Post-decision result card for the executive.
 * Business-first language — no developer implementation details.
 */

import type { VerificationOutcome } from './verification.js';
import type { ClosureClass } from './decision-closure.js';

// ---------------------------------------------------------------------------
// Executive Response Contract
// ---------------------------------------------------------------------------

export interface ExecutiveResponseContract {
  decisionId: string;
  decision: string;
  result: string;
  executed: boolean;
  scope: string;
  verification: VerificationOutcome | null;
  rollback: string;
  platformImpact: string;
  remainingRisk: string;
  remainingBlockedScopes: string[];
  nextExecutiveActionRequired: string | null;
  summary: string;
}

// ---------------------------------------------------------------------------
// Business-First View
// ---------------------------------------------------------------------------

export interface ExecutiveBusinessView {
  WHAT_YOU_APPROVED: string;
  WHAT_SYSTEM_DID: string;
  WHAT_CHANGED: string;
  WHAT_REMAINS_BLOCKED: string;
  WHAT_RISK_REMAINS: string;
  WHAT_HAPPENS_NEXT: string;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildExecutiveResponse(params: {
  decisionId: string;
  action: string;
  closureClass: ClosureClass;
  executed: boolean;
  scope: string;
  verificationOutcome: VerificationOutcome | null;
  rolledBack: boolean;
  platformImpact: string;
  remainingRisk: string;
  remainingBlockedScopes: string[];
  nextAction: string | null;
  title: string;
}): { contract: ExecutiveResponseContract; businessView: ExecutiveBusinessView } {
  const result = params.closureClass === 'APPROVED_AND_EXECUTED'
    ? 'SUCCESS'
    : params.closureClass === 'APPROVED_AND_ROLLED_BACK'
    ? 'ROLLED_BACK'
    : params.closureClass;

  const contract: ExecutiveResponseContract = {
    decisionId: params.decisionId,
    decision: params.action,
    result,
    executed: params.executed,
    scope: params.scope,
    verification: params.verificationOutcome,
    rollback: params.rolledBack ? 'Rollback was performed.' : 'No rollback required.',
    platformImpact: params.platformImpact,
    remainingRisk: params.remainingRisk,
    remainingBlockedScopes: params.remainingBlockedScopes,
    nextExecutiveActionRequired: params.nextAction,
    summary: `Decision "${params.title}" (${params.decisionId}): ${params.action} → ${result}.`,
  };

  const businessView: ExecutiveBusinessView = {
    WHAT_YOU_APPROVED: params.action === 'APPROVE' || params.action === 'APPROVE_LIMITED_SCOPE'
      ? `You approved: ${params.title} within scope "${params.scope}".`
      : `You ${params.action.toLowerCase().replace(/_/g, ' ')}: ${params.title}.`,
    WHAT_SYSTEM_DID: params.executed
      ? `The system executed the approved plan within bounded scope "${params.scope}".`
      : `No system execution occurred (decision was ${params.action.toLowerCase().replace(/_/g, ' ')}).`,
    WHAT_CHANGED: params.executed
      ? `Scope "${params.scope}" was affected. Platform impact: ${params.platformImpact}.`
      : 'No platform state was mutated.',
    WHAT_REMAINS_BLOCKED: params.remainingBlockedScopes.length > 0
      ? `The following scopes remain blocked: ${params.remainingBlockedScopes.join(', ')}.`
      : 'No scopes are blocked by this decision.',
    WHAT_RISK_REMAINS: params.remainingRisk || 'No residual risk identified.',
    WHAT_HAPPENS_NEXT: params.nextAction ?? 'No further executive action is required at this time.',
  };

  return { contract, businessView };
}
