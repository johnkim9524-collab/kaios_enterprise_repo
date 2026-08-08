/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: decision-gate.ts
 *
 * Deterministic Executive Decision Gate.
 * Every decision is policy-governed, evidence-first, and bounded.
 */

import type { AuthorityLevel, ActorType } from './authority-model.js';
import type { EvidenceRef } from './signal-aggregator.js';

// ---------------------------------------------------------------------------
// Decision Classes
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
// Decision Severity
// ---------------------------------------------------------------------------

export type DecisionSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';

// ---------------------------------------------------------------------------
// Decision Status
// ---------------------------------------------------------------------------

export type DecisionStatus =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'SUPERSEDED'
  | 'RESOLVED';

// ---------------------------------------------------------------------------
// Decision Option
// ---------------------------------------------------------------------------

export type DecisionOption =
  | 'APPROVE'
  | 'REJECT'
  | 'DEFER'
  | 'MAINTAIN_FREEZE'
  | 'LIMIT_SCOPE'
  | 'ALLOW_DEGRADED_OPERATION'
  | 'HALT_SCOPE'
  | 'HALT_PLATFORM';

// ---------------------------------------------------------------------------
// Executive Decision
// ---------------------------------------------------------------------------

export interface ExecutiveDecision {
  readonly decisionId: string;
  readonly decisionClass: DecisionClass;
  readonly severity: DecisionSeverity;
  readonly title: string;
  readonly summary: string;
  readonly reason: string;
  readonly affectedScopes: string[];
  readonly requestedBy: ActorType;
  readonly policyBasis: string;
  readonly recommendedOption: DecisionOption;
  readonly allowedOptions: DecisionOption[];
  readonly prohibitedOptions: DecisionOption[];
  readonly evidenceRefs: EvidenceRef[];
  readonly riskIfApproved: string;
  readonly riskIfRejected: string;
  readonly riskIfNoDecision: string;
  readonly deadline: string | null;
  readonly defaultOnTimeout: 'FAIL_CLOSED' | 'MAINTAIN_FREEZE' | 'DEGRADE' | 'HALT_SCOPE' | 'ESCALATE_AUTHORITY' | 'NO_CHANGE';
  readonly requiredAuthority: AuthorityLevel;
  readonly status: DecisionStatus;
}

// ---------------------------------------------------------------------------
// Decision Gate
// ---------------------------------------------------------------------------

export interface DecisionGateResult {
  readonly gated: boolean;  // true = requires executive action
  readonly decisions: ExecutiveDecision[];
  readonly autonomousActionsPermitted: string[];
  readonly blockedActions: string[];
  readonly reason: string;
}

export function evaluateDecisionGate(
  decisions: ExecutiveDecision[],
  platformStatus: string,
): DecisionGateResult {
  const openDecisions = decisions.filter(
    (d) => d.status === 'OPEN' || d.status === 'ACKNOWLEDGED',
  );
  const requiresAction = openDecisions.some(
    (d) =>
      d.decisionClass !== 'NO_ACTION' && d.decisionClass !== 'INFORMATION_ONLY',
  );

  const blockedActions: string[] = [];
  const autonomousActionsPermitted: string[] = [];

  for (const d of openDecisions) {
    if (d.decisionClass === 'NO_ACTION' || d.decisionClass === 'INFORMATION_ONLY') {
      autonomousActionsPermitted.push(d.title);
    } else {
      blockedActions.push(d.title);
    }
  }

  // UNKNOWN platform status always gates
  const unknownBlocked = platformStatus === 'UNKNOWN';

  return Object.freeze({
    gated: requiresAction || unknownBlocked,
    decisions: openDecisions,
    autonomousActionsPermitted,
    blockedActions,
    reason: unknownBlocked
      ? 'Platform status UNKNOWN — authority expansion blocked per policy.'
      : requiresAction
        ? `${openDecisions.length} open executive decision(s) require attention.`
        : 'No executive action required.',
  });
}

// ---------------------------------------------------------------------------
// Build a decision record
// ---------------------------------------------------------------------------

export function buildDecision(
  id: string,
  cls: DecisionClass,
  severity: DecisionSeverity,
  title: string,
  summary: string,
  reason: string,
  opts: {
    affectedScopes?: string[];
    requestedBy?: ActorType;
    policyBasis?: string;
    recommendedOption?: DecisionOption;
    allowedOptions?: DecisionOption[];
    prohibitedOptions?: DecisionOption[];
    evidenceRefs?: EvidenceRef[];
    riskIfApproved?: string;
    riskIfRejected?: string;
    riskIfNoDecision?: string;
    deadline?: string | null;
    defaultOnTimeout?: ExecutiveDecision['defaultOnTimeout'];
    requiredAuthority?: AuthorityLevel;
    status?: DecisionStatus;
  } = {},
): ExecutiveDecision {
  return Object.freeze({
    decisionId: id,
    decisionClass: cls,
    severity,
    title,
    summary,
    reason,
    affectedScopes: opts.affectedScopes ?? [],
    requestedBy: opts.requestedBy ?? 'SYSTEM_POLICY',
    policyBasis: opts.policyBasis ?? 'a28-executive-governance-policy.v1',
    recommendedOption: opts.recommendedOption ?? 'REJECT',
    allowedOptions: (opts.allowedOptions ?? ['DEFER']) as DecisionOption[],
    prohibitedOptions: (opts.prohibitedOptions ?? []) as DecisionOption[],
    evidenceRefs: opts.evidenceRefs ?? [],
    riskIfApproved: opts.riskIfApproved ?? 'Unknown — evidence required before assessment.',
    riskIfRejected: opts.riskIfRejected ?? 'Operation remains blocked.',
    riskIfNoDecision: opts.riskIfNoDecision ?? 'Default timeout action applies per policy.',
    deadline: opts.deadline ?? null,
    defaultOnTimeout: opts.defaultOnTimeout ?? 'FAIL_CLOSED',
    requiredAuthority: opts.requiredAuthority ?? 'EXECUTIVE',
    status: opts.status ?? 'OPEN',
  });
}
