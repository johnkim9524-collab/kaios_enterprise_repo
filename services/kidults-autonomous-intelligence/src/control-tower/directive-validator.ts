/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: directive-validator.ts
 *
 * Every directive must pass all validation gates before execution.
 * Invalid directive → reject, evidence, fail closed.
 */

import type { AuthorityLevel, ActorType } from './authority-model.js';
import { validateAuthority } from './authority-model.js';
import type { DirectiveType } from './executive-directives.js';
import type { EvidenceRef } from './signal-aggregator.js';

// ---------------------------------------------------------------------------
// Prohibited Directives (hard-coded — no policy may enable these)
// ---------------------------------------------------------------------------

export const PROHIBITED_DIRECTIVES: ReadonlySet<string> = new Set([
  'ARBITRARY_SHELL',
  'ARBITRARY_SQL',
  'ARBITRARY_EXTERNAL_MUTATION',
  'UNLIMITED_PRODUCTION_ACCESS',
  'UNBOUNDED_PROVIDER_ACCESS',
  'CREDENTIAL_EXPORT',
  'SECURITY_POLICY_DISABLE',
]);

// ---------------------------------------------------------------------------
// Validation Context
// ---------------------------------------------------------------------------

export interface DirectiveValidationContext {
  readonly directiveType: DirectiveType;
  readonly actorType: ActorType;
  readonly requiredAuthority: AuthorityLevel;
  readonly scope: string[];
  readonly evidenceRefs: EvidenceRef[];
  readonly changeFreeze: boolean;
  readonly activeIncidents: number;
  readonly a24ActivationValid: boolean;
  readonly a22PublicationValid: boolean;
  readonly a23CommercialValid: boolean;
  readonly a27ChangeFreezeConsistent: boolean;
  readonly preflightPassed: boolean;
  readonly policyVersion: string;
}

// ---------------------------------------------------------------------------
// Validation Result
// ---------------------------------------------------------------------------

export interface DirectiveValidationResult {
  readonly valid: boolean;
  readonly failureReasons: string[];
  readonly evidenceRequired: string[];
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

export function validateDirective(
  ctx: DirectiveValidationContext,
): DirectiveValidationResult {
  const failureReasons: string[] = [];
  const evidenceRequired: string[] = [];

  // 1. Prohibited directive check
  if (PROHIBITED_DIRECTIVES.has(ctx.directiveType)) {
    failureReasons.push(`Directive ${ctx.directiveType} is explicitly prohibited. No policy may enable it.`);
  }

  // 2. Authority validation
  const authResult = validateAuthority(ctx.actorType, ctx.requiredAuthority);
  if (!authResult.valid) {
    failureReasons.push(authResult.reason);
  }

  // 3. Evidence validation
  if (ctx.evidenceRefs.length === 0) {
    failureReasons.push('No evidence provided. Evidence is required before any directive can be executed.');
    evidenceRequired.push('Upstream evidence refs from A15–A27');
  }

  // 4. Scope validation
  if (ctx.scope.length === 0) {
    failureReasons.push('Directive scope is empty. Scope must be explicitly bounded.');
  }

  // 5. Incident validation — some directives blocked during active incidents
  if (
    ctx.activeIncidents > 0 &&
    ['RELEASE_FREEZE', 'RESUME_SCOPE'].includes(ctx.directiveType)
  ) {
    failureReasons.push(
      `Active incidents (${ctx.activeIncidents}) block ${ctx.directiveType}. Resolve incidents first.`,
    );
  }

  // 6. Change-freeze validation
  if (ctx.changeFreeze && ctx.directiveType === 'RELEASE_FREEZE' && !ctx.a27ChangeFreezeConsistent) {
    failureReasons.push('A27 change-freeze conditions not satisfied. Cannot release freeze.');
  }

  // 7. A24 activation validation
  if (!ctx.a24ActivationValid) {
    failureReasons.push('A24 production activation gate is invalid. Directive rejected to preserve A24 controls.');
  }

  // 8. A22 publication validation
  if (!ctx.a22PublicationValid && ctx.directiveType.startsWith('ALLOW_PUBLICATION')) {
    failureReasons.push('A22 publication gate is invalid. Cannot allow publication scope — A22 must pass first.');
  }

  // 9. A23 commercial validation
  if (!ctx.a23CommercialValid && ctx.directiveType.startsWith('ALLOW_COMMERCIAL')) {
    failureReasons.push('A23 commercial gate is invalid. Cannot allow commercial scope — A23 must pass first.');
  }

  // 10. Preflight validation
  if (!ctx.preflightPassed) {
    failureReasons.push('Preflight validation has not passed. Directive cannot proceed without passing preflight.');
  }

  return Object.freeze({
    valid: failureReasons.length === 0,
    failureReasons,
    evidenceRequired,
  });
}
