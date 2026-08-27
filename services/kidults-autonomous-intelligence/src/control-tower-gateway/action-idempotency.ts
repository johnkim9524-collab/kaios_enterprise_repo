/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: action-idempotency.ts
 *
 * Live action idempotency MUST be durable and cross-process. The gateway is not
 * allowed to use process memory for mutation safety. Until the PostgreSQL-backed
 * governed action service is connected, runtime lookup/register fails closed.
 */

import type { ExecutiveActionResponse } from './gateway-types.js';

export const A31_IDEMPOTENCY_BACKEND = 'POSTGRESQL_DURABLE_BACKEND_REQUIRED' as const;
export const A31_IDEMPOTENCY_RUNTIME_READY = false as const;

interface IdempotencyEntry {
  readonly key: string;
  readonly requestId: string;
  readonly decisionId: string;
  readonly result: ExecutiveActionResponse;
  readonly createdAt: string;
}

export function validateIdempotencyKey(key: string | null | undefined): key is string {
  return typeof key === 'string' && key.trim().length >= 8;
}

export function buildIdempotencyKey(
  requestId: string,
  decisionId: string,
  action: string,
): string {
  return `a31:action:${decisionId}:${action}:${requestId}`;
}

export type IdempotencyLookup =
  | { found: false }
  | { found: true; entry: IdempotencyEntry };

function durableBackendRequired(): never {
  throw new Error('A31_DURABLE_IDEMPOTENCY_BACKEND_REQUIRED');
}

export function lookupIdempotency(_key: string): IdempotencyLookup {
  return durableBackendRequired();
}

export function registerIdempotencyResult(
  _key: string,
  _requestId: string,
  _decisionId: string,
  _result: ExecutiveActionResponse,
): IdempotencyEntry {
  return durableBackendRequired();
}
