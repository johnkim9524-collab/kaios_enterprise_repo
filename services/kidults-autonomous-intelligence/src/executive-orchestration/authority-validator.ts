/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: authority-validator.ts
 *
 * Wraps A28 authority model with A29-specific validation rules.
 * Unknown identity or expired authority context fails closed.
 * Authority cannot self-elevate.
 */

import {
  type AuthorityLevel,
  type ActorType,
  isSufficientAuthority,
  actorAuthorityLevel,
  isSelfElevation,
} from '../control-tower/authority-model.js';
import type { ExecutiveAction } from './approval-record.js';

// ---------------------------------------------------------------------------
// Authority Validation Result
// ---------------------------------------------------------------------------

export type A29AuthorityValidationResult =
  | { valid: true; actorAuthority: AuthorityLevel }
  | { valid: false; reason: string };

// ---------------------------------------------------------------------------
// Known Actor Types
// ---------------------------------------------------------------------------

const KNOWN_ACTOR_TYPES: ReadonlySet<ActorType> = new Set([
  'AUTONOMOUS_SYSTEM',
  'OPERATIONS_USER',
  'ENGINEERING_USER',
  'SECURITY_USER',
  'COMMERCIAL_USER',
  'EXECUTIVE_USER',
  'BOARD_USER',
  'SYSTEM_POLICY',
]);

// ---------------------------------------------------------------------------
// Actions requiring material (≥ OPERATIONS) authority
// ---------------------------------------------------------------------------

const MATERIAL_ACTIONS: ReadonlySet<ExecutiveAction> = new Set([
  'APPROVE',
  'APPROVE_LIMITED_SCOPE',
  'RELEASE_FREEZE',
  'ALLOW_DEGRADED_OPERATION',
  'HALT_SCOPE',
  'RESUME_SCOPE',
]);

export function isMaterialAction(action: ExecutiveAction): boolean {
  return MATERIAL_ACTIONS.has(action);
}

// ---------------------------------------------------------------------------
// Main Validator
// ---------------------------------------------------------------------------

export function validateActorAuthority(params: {
  actorType: string | null | undefined;
  requiredAuthority: AuthorityLevel;
  authorityContextExpiry: string | null;
  nowIso: string;
  requestedAuthority?: AuthorityLevel;
}): A29AuthorityValidationResult {
  const { actorType, requiredAuthority, authorityContextExpiry, nowIso, requestedAuthority } = params;

  // Unknown identity fails closed
  if (!actorType || !KNOWN_ACTOR_TYPES.has(actorType as ActorType)) {
    return { valid: false, reason: `Unknown or missing actor identity: "${actorType}". Failing closed.` };
  }

  const actor = actorType as ActorType;
  const actorLevel = actorAuthorityLevel(actor);

  // Expired authority context fails closed
  if (authorityContextExpiry !== null && authorityContextExpiry < nowIso) {
    return { valid: false, reason: `Authority context expired at ${authorityContextExpiry}. Failing closed.` };
  }

  // Self-elevation prohibited
  if (requestedAuthority !== undefined && isSelfElevation(actorLevel, requestedAuthority)) {
    return {
      valid: false,
      reason: `Authority self-elevation is prohibited. Actor ${actorLevel} cannot claim ${requestedAuthority}.`,
    };
  }

  // Insufficient authority
  if (!isSufficientAuthority(actorLevel, requiredAuthority)) {
    return {
      valid: false,
      reason: `Actor ${actorLevel} (rank ${actorLevel}) is insufficient for required authority ${requiredAuthority}. Failing closed.`,
    };
  }

  return { valid: true, actorAuthority: actorLevel };
}
