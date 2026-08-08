/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: executive-directives.ts
 *
 * Bounded executive directives. Two-phase: PROPOSE → VALIDATE → APPROVE →
 * PREFLIGHT → EXECUTE → VERIFY → EVIDENCE → CLOSE.
 */

import type { ActorType, AuthorityLevel } from './authority-model.js';
import type { EvidenceRef } from './signal-aggregator.js';

// ---------------------------------------------------------------------------
// Directive Types (bounded)
// ---------------------------------------------------------------------------

export type DirectiveType =
  | 'ACKNOWLEDGE'
  | 'APPROVE_SCOPE'
  | 'REJECT_SCOPE'
  | 'MAINTAIN_FREEZE'
  | 'RELEASE_FREEZE'
  | 'ALLOW_DEGRADED'
  | 'HALT_SCOPE'
  | 'RESUME_SCOPE'
  | 'ALLOW_PROVIDER_USE'
  | 'DENY_PROVIDER_USE'
  | 'ALLOW_PUBLICATION_SCOPE'
  | 'DENY_PUBLICATION_SCOPE'
  | 'ALLOW_COMMERCIAL_SCOPE'
  | 'DENY_COMMERCIAL_SCOPE';

// ---------------------------------------------------------------------------
// Two-Phase Directive State
// ---------------------------------------------------------------------------

export type DirectivePhase =
  | 'PROPOSE'
  | 'VALIDATE'
  | 'APPROVE'
  | 'PREFLIGHT'
  | 'EXECUTE'
  | 'VERIFY'
  | 'EVIDENCE'
  | 'CLOSE'
  | 'REJECTED'
  | 'FAILED';

// ---------------------------------------------------------------------------
// Directive Record
// ---------------------------------------------------------------------------

export interface ExecutiveDirective {
  readonly directiveId: string;
  readonly directiveType: DirectiveType;
  readonly phase: DirectivePhase;
  readonly actorType: ActorType;
  readonly authorityLevel: AuthorityLevel;
  readonly scope: string[];
  readonly policyBasis: string;
  readonly evidenceRefs: EvidenceRef[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly reason: string;
  readonly reversible: boolean;
  readonly requiresExplicitApproval: boolean;
}

// ---------------------------------------------------------------------------
// Phase Transition
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<DirectivePhase, DirectivePhase[]> = {
  PROPOSE:   ['VALIDATE', 'REJECTED'],
  VALIDATE:  ['APPROVE', 'REJECTED'],
  APPROVE:   ['PREFLIGHT', 'REJECTED'],
  PREFLIGHT: ['EXECUTE', 'REJECTED'],
  EXECUTE:   ['VERIFY', 'FAILED'],
  VERIFY:    ['EVIDENCE', 'FAILED'],
  EVIDENCE:  ['CLOSE'],
  CLOSE:     [],
  REJECTED:  [],
  FAILED:    [],
};

export function isValidPhaseTransition(from: DirectivePhase, to: DirectivePhase): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function transitionDirective(
  directive: ExecutiveDirective,
  to: DirectivePhase,
): { directive: ExecutiveDirective; valid: boolean; reason?: string } {
  if (!isValidPhaseTransition(directive.phase, to)) {
    return {
      directive,
      valid: false,
      reason: `Invalid phase transition: ${directive.phase} → ${to}. Directive fails closed.`,
    };
  }

  // Irreversible actions require explicit approval at APPROVE phase
  if (to === 'EXECUTE' && !directive.reversible && !directive.requiresExplicitApproval) {
    return {
      directive,
      valid: false,
      reason: 'Irreversible action requires explicit approval before execution. Directive rejected.',
    };
  }

  const updated: ExecutiveDirective = Object.freeze({
    ...directive,
    phase: to,
    updatedAt: new Date().toISOString(),
  });

  return { directive: updated, valid: true };
}

// ---------------------------------------------------------------------------
// Build a directive
// ---------------------------------------------------------------------------

export function buildDirective(
  id: string,
  type: DirectiveType,
  actorType: ActorType,
  authorityLevel: AuthorityLevel,
  scope: string[],
  reason: string,
  opts: {
    policyBasis?: string;
    evidenceRefs?: EvidenceRef[];
    reversible?: boolean;
    requiresExplicitApproval?: boolean;
  } = {},
): ExecutiveDirective {
  const now = new Date().toISOString();
  return Object.freeze({
    directiveId: id,
    directiveType: type,
    phase: 'PROPOSE',
    actorType,
    authorityLevel,
    scope,
    policyBasis: opts.policyBasis ?? 'a28-executive-governance-policy.v1',
    evidenceRefs: opts.evidenceRefs ?? [],
    createdAt: now,
    updatedAt: now,
    reason,
    reversible: opts.reversible ?? true,
    requiresExplicitApproval: opts.requiresExplicitApproval ?? false,
  });
}
