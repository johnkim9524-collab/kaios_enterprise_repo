/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: executive-action-validator.ts
 *
 * Server-side validation of every incoming executive action request.
 * Client-provided authority context is advisory only.
 * Server policy is authoritative.
 */

import { GatewayException } from './gateway-errors.js';
import type { ExecutiveActionRequest, ExecutiveActionKind } from './gateway-types.js';
import { SUPPORTED_ACTIONS } from './gateway-types.js';

// ---------------------------------------------------------------------------
// Server-side policy authority table (canonical — not trusting client claims)
// ---------------------------------------------------------------------------

// In production this would load from A28/A29 policy service; here deterministic.
const AUTHORITY_REQUIRED: Readonly<Record<ExecutiveActionKind, string>> = {
  ACKNOWLEDGE:              'OPERATIONAL',
  APPROVE:                  'EXECUTIVE',
  APPROVE_LIMITED_SCOPE:    'SENIOR_MANAGER',
  REJECT:                   'EXECUTIVE',
  DEFER:                    'SENIOR_MANAGER',
  MAINTAIN_FREEZE:          'EXECUTIVE',
  RELEASE_FREEZE:           'EXECUTIVE',
  ALLOW_DEGRADED_OPERATION: 'EXECUTIVE',
  HALT_SCOPE:               'EXECUTIVE',
  RESUME_SCOPE:             'EXECUTIVE',
};

// ---------------------------------------------------------------------------
// Validation Result
// ---------------------------------------------------------------------------

export interface ValidationResult {
  readonly valid: boolean;
  readonly serverValidatedAuthority: string;
  readonly reasons: string[];
}

// ---------------------------------------------------------------------------
// Validate Action Request
// ---------------------------------------------------------------------------

export function validateActionRequest(
  request: ExecutiveActionRequest,
  decisionStatus: string,
  evidenceFresh: boolean,
  evidenceKnown: boolean,
  policyKnown: boolean,
  freezeActive: boolean,
): ValidationResult {
  const reasons: string[] = [];

  // 1. Supported action
  if (!SUPPORTED_ACTIONS.has(request.requestedAction)) {
    reasons.push(`Unsupported action: ${request.requestedAction}`);
  }

  // 2. Blocked decision states
  const blocked = new Set(['EXPIRED', 'SUPERSEDED', 'CLOSED', 'INVALID']);
  if (blocked.has(decisionStatus)) {
    reasons.push(`Decision is ${decisionStatus} and cannot be acted upon.`);
  }

  // 3. Evidence freshness
  if (!evidenceFresh) {
    reasons.push('Evidence is stale. Action blocked.');
  }
  if (!evidenceKnown) {
    reasons.push('Evidence state is unknown. Action blocked.');
  }

  // 4. Policy
  if (!policyKnown) {
    reasons.push('Governance policy unknown. Action blocked.');
  }

  // 5. Freeze
  const freezeExempt: ReadonlySet<ExecutiveActionKind> = new Set(['MAINTAIN_FREEZE', 'RELEASE_FREEZE', 'HALT_SCOPE']);
  if (freezeActive && !freezeExempt.has(request.requestedAction)) {
    reasons.push('Change freeze blocks this action.');
  }

  // 6. Idempotency key required
  if (!request.idempotencyKey || request.idempotencyKey.trim().length < 8) {
    reasons.push('Valid idempotency key required.');
  }

  // 7. Required scope
  if (!Array.isArray(request.requestedScope) || request.requestedScope.length === 0) {
    reasons.push('Action scope must be specified.');
  }

  // Server-side authority — client claim is advisory; server resolves policy
  const serverValidatedAuthority = AUTHORITY_REQUIRED[request.requestedAction] ?? 'EXECUTIVE';

  return {
    valid: reasons.length === 0,
    serverValidatedAuthority,
    reasons,
  };
}
