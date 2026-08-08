/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: gateway-errors.ts
 *
 * Business-readable error mapping for all gateway error codes.
 * Never expose implementation details, secrets, or raw HTTP status codes.
 */

import type { GatewayErrorCode } from './gateway-types.js';

// ---------------------------------------------------------------------------
// Business-readable error messages (spec §26)
// ---------------------------------------------------------------------------

const BUSINESS_MESSAGES: Readonly<Record<GatewayErrorCode, string>> = {
  INVALID_REQUEST:         'The request could not be understood. Please review required fields and try again.',
  UNKNOWN_DECISION:        'The requested decision could not be found. It may have been closed or superseded.',
  AUTHORITY_DENIED:        'This action requires a higher approval authority.',
  DECISION_EXPIRED:        'This decision has expired and can no longer be acted upon.',
  DECISION_SUPERSEDED:     'This decision has been superseded by a newer decision. Review the current decision.',
  EVIDENCE_STALE:          'Current evidence is too old to safely execute this decision. Please refresh and try again.',
  POLICY_UNKNOWN:          'The governance policy for this decision could not be resolved. Action blocked.',
  FREEZE_BLOCKED:          'A change freeze is active. This action is blocked until the freeze is released.',
  DEPENDENCY_BLOCKED:      'A required upstream dependency is blocking this action. Review dependencies and retry.',
  PREFLIGHT_FAILED:        'Pre-execution safety checks did not pass. The action cannot proceed safely.',
  EXECUTION_FAILED:        'The action could not be executed. The system has failed closed to protect integrity.',
  VERIFICATION_FAILED:     'Execution could not be verified. A rollback may be required.',
  ROLLBACK_REQUIRED:       'A rollback is required before further actions can be taken on this scope.',
  SERVICE_UNAVAILABLE:     'The governance service is temporarily unavailable. Please try again shortly.',
  FAILED_CLOSED:           'The system failed closed to protect integrity. No partial action was taken.',
} as const;

// ---------------------------------------------------------------------------
// Sanitize errors — never expose raw error internals
// ---------------------------------------------------------------------------

export interface GatewayError {
  readonly code: GatewayErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

const RETRYABLE_CODES: ReadonlySet<GatewayErrorCode> = new Set([
  'SERVICE_UNAVAILABLE',
  'FAILED_CLOSED',
]);

export function buildGatewayError(code: GatewayErrorCode): GatewayError {
  return {
    code,
    message: BUSINESS_MESSAGES[code],
    retryable: RETRYABLE_CODES.has(code),
  };
}

export function sanitizeErrorForClient(error: unknown): GatewayError {
  // Never leak implementation details
  if (error instanceof GatewayException) {
    return buildGatewayError(error.code);
  }
  // All unhandled errors fail closed
  return buildGatewayError('FAILED_CLOSED');
}

export class GatewayException extends Error {
  constructor(
    public readonly code: GatewayErrorCode,
    detail?: string,
  ) {
    super(`[${code}] ${detail ?? BUSINESS_MESSAGES[code]}`);
    this.name = 'GatewayException';
  }
}
