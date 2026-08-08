/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: action-idempotency.ts
 *
 * Every action request must carry a stable idempotency key.
 * Duplicate submissions return the canonical existing result without mutation.
 */

import type { ExecutiveActionResponse } from './gateway-types.js';

// ---------------------------------------------------------------------------
// Idempotency Store
// ---------------------------------------------------------------------------

interface IdempotencyEntry {
  readonly key: string;
  readonly requestId: string;
  readonly decisionId: string;
  readonly result: ExecutiveActionResponse;
  readonly createdAt: string;
}

// Bounded in-memory store — production would use durable storage
const MAX_ENTRIES = 2000;
const store = new Map<string, IdempotencyEntry>();

// ---------------------------------------------------------------------------
// Key Validation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Check / Register
// ---------------------------------------------------------------------------

export type IdempotencyLookup =
  | { found: false }
  | { found: true; entry: IdempotencyEntry };

export function lookupIdempotency(key: string): IdempotencyLookup {
  const entry = store.get(key);
  if (!entry) return { found: false };
  return { found: true, entry };
}

export function registerIdempotencyResult(
  key: string,
  requestId: string,
  decisionId: string,
  result: ExecutiveActionResponse,
): IdempotencyEntry {
  const entry: IdempotencyEntry = {
    key,
    requestId,
    decisionId,
    result,
    createdAt: new Date().toISOString(),
  };

  store.set(key, entry);

  // Bounded eviction — remove oldest entries when limit reached
  if (store.size > MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (firstKey !== undefined) store.delete(firstKey);
  }

  return entry;
}
