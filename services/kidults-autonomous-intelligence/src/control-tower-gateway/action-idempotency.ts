/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: action-idempotency.ts
 *
 * No hidden in-memory fallback is allowed. A durable store must be injected
 * by any future live gateway. Legacy call shapes fail closed.
 */

import type { ExecutiveActionResponse } from './gateway-types.js';

export interface IdempotencyEntry {
  readonly key: string;
  readonly requestId: string;
  readonly decisionId: string;
  readonly result: ExecutiveActionResponse;
  readonly createdAt: string;
}

export interface ActionIdempotencyStore {
  get(key: string): IdempotencyEntry | undefined;
  set(key: string, entry: IdempotencyEntry): void;
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

export function lookupIdempotency(store: ActionIdempotencyStore, key: string): IdempotencyLookup;
export function lookupIdempotency(key: string): IdempotencyLookup;
export function lookupIdempotency(storeOrKey: ActionIdempotencyStore | string, maybeKey?: string): IdempotencyLookup {
  if (typeof storeOrKey === 'string') throw new Error('DURABLE_ACTION_IDEMPOTENCY_STORE_REQUIRED');
  if (!maybeKey) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  const entry = storeOrKey.get(maybeKey);
  if (!entry) return { found: false };
  return { found: true, entry };
}

export function registerIdempotencyResult(
  store: ActionIdempotencyStore,
  key: string,
  requestId: string,
  decisionId: string,
  result: ExecutiveActionResponse,
): IdempotencyEntry;
export function registerIdempotencyResult(
  key: string,
  requestId: string,
  decisionId: string,
  result: ExecutiveActionResponse,
): IdempotencyEntry;
export function registerIdempotencyResult(
  storeOrKey: ActionIdempotencyStore | string,
  keyOrRequestId: string,
  requestIdOrDecisionId: string,
  decisionIdOrResult: string | ExecutiveActionResponse,
  maybeResult?: ExecutiveActionResponse,
): IdempotencyEntry {
  if (typeof storeOrKey === 'string') throw new Error('DURABLE_ACTION_IDEMPOTENCY_STORE_REQUIRED');
  const key = keyOrRequestId;
  const requestId = requestIdOrDecisionId;
  const decisionId = decisionIdOrResult as string;
  const result = maybeResult;
  if (!result) throw new Error('IDEMPOTENCY_RESULT_REQUIRED');
  const entry: IdempotencyEntry = {
    key,
    requestId,
    decisionId,
    result,
    createdAt: new Date().toISOString(),
  };
  storeOrKey.set(key, entry);
  return entry;
}
