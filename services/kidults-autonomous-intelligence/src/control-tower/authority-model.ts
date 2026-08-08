/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: authority-model.ts
 *
 * Deterministic authority hierarchy. Lower authority may NEVER approve
 * a decision requiring higher authority.
 */

// ---------------------------------------------------------------------------
// Authority Levels (ordered lowest → highest)
// ---------------------------------------------------------------------------

export type AuthorityLevel =
  | 'AUTONOMOUS'
  | 'OPERATIONS'
  | 'ENGINEERING'
  | 'SECURITY'
  | 'COMMERCIAL'
  | 'EXECUTIVE'
  | 'BOARD_OR_LEGAL';

const AUTHORITY_RANK: Record<AuthorityLevel, number> = {
  AUTONOMOUS: 0,
  OPERATIONS: 1,
  ENGINEERING: 2,
  SECURITY: 3,
  COMMERCIAL: 4,
  EXECUTIVE: 5,
  BOARD_OR_LEGAL: 6,
};

export function authorityRank(level: AuthorityLevel): number {
  return AUTHORITY_RANK[level];
}

/** Returns true iff `actor` has at least as much authority as `required`. */
export function isSufficientAuthority(actor: AuthorityLevel, required: AuthorityLevel): boolean {
  return AUTHORITY_RANK[actor] >= AUTHORITY_RANK[required];
}

// Self-elevation is never permitted
export function isSelfElevation(actor: AuthorityLevel, requested: AuthorityLevel): boolean {
  return AUTHORITY_RANK[requested] > AUTHORITY_RANK[actor];
}

// ---------------------------------------------------------------------------
// Actor Types
// ---------------------------------------------------------------------------

export type ActorType =
  | 'AUTONOMOUS_SYSTEM'
  | 'OPERATIONS_USER'
  | 'ENGINEERING_USER'
  | 'SECURITY_USER'
  | 'COMMERCIAL_USER'
  | 'EXECUTIVE_USER'
  | 'BOARD_USER'
  | 'SYSTEM_POLICY';

export function actorAuthorityLevel(actorType: ActorType): AuthorityLevel {
  const map: Record<ActorType, AuthorityLevel> = {
    AUTONOMOUS_SYSTEM: 'AUTONOMOUS',
    OPERATIONS_USER: 'OPERATIONS',
    ENGINEERING_USER: 'ENGINEERING',
    SECURITY_USER: 'SECURITY',
    COMMERCIAL_USER: 'COMMERCIAL',
    EXECUTIVE_USER: 'EXECUTIVE',
    BOARD_USER: 'BOARD_OR_LEGAL',
    SYSTEM_POLICY: 'AUTONOMOUS',
  };
  return map[actorType];
}

// ---------------------------------------------------------------------------
// Authority Validation
// ---------------------------------------------------------------------------

export type AuthorityValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export function validateAuthority(
  actorType: ActorType,
  requiredAuthority: AuthorityLevel,
): AuthorityValidationResult {
  const actorLevel = actorAuthorityLevel(actorType);

  // Reject self-elevation
  if (isSelfElevation(actorLevel, requiredAuthority) && actorType === 'AUTONOMOUS_SYSTEM') {
    return {
      valid: false,
      reason: `AUTONOMOUS_SYSTEM cannot approve decisions requiring ${requiredAuthority} authority. Authority self-elevation is prohibited.`,
    };
  }

  if (!isSufficientAuthority(actorLevel, requiredAuthority)) {
    return {
      valid: false,
      reason: `Actor authority ${actorLevel} (rank ${authorityRank(actorLevel)}) is insufficient for required authority ${requiredAuthority} (rank ${authorityRank(requiredAuthority)}).`,
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Minimum required authority for decision classes
// ---------------------------------------------------------------------------

import type { DecisionClass } from './decision-gate.js';

export function minimumAuthorityForDecisionClass(cls: DecisionClass): AuthorityLevel {
  const map: Record<DecisionClass, AuthorityLevel> = {
    NO_ACTION: 'AUTONOMOUS',
    INFORMATION_ONLY: 'AUTONOMOUS',
    ACKNOWLEDGEMENT_REQUIRED: 'OPERATIONS',
    APPROVAL_REQUIRED: 'OPERATIONS',
    REJECTION_REQUIRED: 'OPERATIONS',
    SECURITY_DECISION: 'SECURITY',
    COMMERCIAL_DECISION: 'COMMERCIAL',
    PROVIDER_DECISION: 'EXECUTIVE',
    BILLING_DECISION: 'EXECUTIVE',
    LEGAL_DECISION: 'BOARD_OR_LEGAL',
    PRODUCTION_DECISION: 'EXECUTIVE',
    POLICY_DECISION: 'EXECUTIVE',
    EMERGENCY_DECISION: 'EXECUTIVE',
  };
  return map[cls];
}
