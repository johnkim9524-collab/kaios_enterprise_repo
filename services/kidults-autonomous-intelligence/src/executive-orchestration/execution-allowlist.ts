/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: execution-allowlist.ts
 *
 * Strict allowlist of permitted execution classes.
 * Prohibited actions fail closed immediately.
 */

// ---------------------------------------------------------------------------
// Allowed Execution Classes
// ---------------------------------------------------------------------------

export type AllowedExecutionClass =
  | 'ACKNOWLEDGE_INCIDENT'
  | 'HALT_SCOPE'
  | 'RESUME_SCOPE'
  | 'MAINTAIN_FREEZE'
  | 'RELEASE_FREEZE'
  | 'ALLOW_DEGRADED_SCOPE'
  | 'ENABLE_APPROVED_SCOPE'
  | 'DISABLE_SCOPE'
  | 'ALLOW_PROVIDER_SCOPE'
  | 'DENY_PROVIDER_SCOPE'
  | 'ALLOW_PUBLICATION_SCOPE'
  | 'DENY_PUBLICATION_SCOPE'
  | 'ALLOW_COMMERCIAL_SCOPE'
  | 'DENY_COMMERCIAL_SCOPE';

const ALLOWED_EXECUTION_CLASSES: ReadonlySet<string> = new Set([
  'ACKNOWLEDGE_INCIDENT',
  'HALT_SCOPE',
  'RESUME_SCOPE',
  'MAINTAIN_FREEZE',
  'RELEASE_FREEZE',
  'ALLOW_DEGRADED_SCOPE',
  'ENABLE_APPROVED_SCOPE',
  'DISABLE_SCOPE',
  'ALLOW_PROVIDER_SCOPE',
  'DENY_PROVIDER_SCOPE',
  'ALLOW_PUBLICATION_SCOPE',
  'DENY_PUBLICATION_SCOPE',
  'ALLOW_COMMERCIAL_SCOPE',
  'DENY_COMMERCIAL_SCOPE',
]);

// ---------------------------------------------------------------------------
// Prohibited Execution Classes
// ---------------------------------------------------------------------------

export type ProhibitedExecutionClass =
  | 'ARBITRARY_SHELL'
  | 'ARBITRARY_SQL'
  | 'CREDENTIAL_EXPORT'
  | 'SECRET_ROTATION_WITHOUT_SECURITY_POLICY'
  | 'UNBOUNDED_PROVIDER_ACCESS'
  | 'UNLIMITED_PRODUCTION_ACCESS'
  | 'UNCONTROLLED_BILLING'
  | 'AUTONOMOUS_PROVIDER_PURCHASE'
  | 'AUTONOMOUS_CONTRACT_SIGNING'
  | 'POLICY_SELF_WEAKENING'
  | 'SECURITY_CONTROL_DISABLE';

const PROHIBITED_EXECUTION_CLASSES: ReadonlySet<string> = new Set([
  'ARBITRARY_SHELL',
  'ARBITRARY_SQL',
  'CREDENTIAL_EXPORT',
  'SECRET_ROTATION_WITHOUT_SECURITY_POLICY',
  'UNBOUNDED_PROVIDER_ACCESS',
  'UNLIMITED_PRODUCTION_ACCESS',
  'UNCONTROLLED_BILLING',
  'AUTONOMOUS_PROVIDER_PURCHASE',
  'AUTONOMOUS_CONTRACT_SIGNING',
  'POLICY_SELF_WEAKENING',
  'SECURITY_CONTROL_DISABLE',
]);

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export type AllowlistCheckResult =
  | { allowed: true; executionClass: AllowedExecutionClass }
  | { allowed: false; reason: string };

export function checkExecutionClass(executionClass: string): AllowlistCheckResult {
  if (PROHIBITED_EXECUTION_CLASSES.has(executionClass)) {
    return {
      allowed: false,
      reason: `Execution class "${executionClass}" is explicitly prohibited. Failing closed.`,
    };
  }
  if (!ALLOWED_EXECUTION_CLASSES.has(executionClass)) {
    return {
      allowed: false,
      reason: `Execution class "${executionClass}" is not on the execution allowlist. Failing closed.`,
    };
  }
  return { allowed: true, executionClass: executionClass as AllowedExecutionClass };
}

export function isProhibited(executionClass: string): boolean {
  return PROHIBITED_EXECUTION_CLASSES.has(executionClass);
}
