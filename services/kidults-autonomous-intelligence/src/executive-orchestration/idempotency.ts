/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: idempotency.ts
 *
 * Every execution plan requires a stable idempotency key.
 * Duplicate approval/execution attempts return existing result without mutation.
 */

// ---------------------------------------------------------------------------
// Idempotency Store
// ---------------------------------------------------------------------------

export interface IdempotencyRecord<T = unknown> {
  key: string;
  decisionId: string;
  result: T;
  createdAt: string;
}

const idempotencyStore: Map<string, IdempotencyRecord> = new Map();

// ---------------------------------------------------------------------------
// Key Generation
// ---------------------------------------------------------------------------

export function buildIdempotencyKey(decisionId: string, planId: string): string {
  return `a29:exec:${decisionId}:${planId}`;
}

// ---------------------------------------------------------------------------
// Check / Register
// ---------------------------------------------------------------------------

export type IdempotencyCheckResult<T> =
  | { exists: false }
  | { exists: true; record: IdempotencyRecord<T> };

export function checkIdempotency<T>(key: string): IdempotencyCheckResult<T> {
  const record = idempotencyStore.get(key);
  if (!record) return { exists: false };
  return { exists: true, record: record as IdempotencyRecord<T> };
}

export function registerIdempotencyResult<T>(
  key: string,
  decisionId: string,
  result: T,
  nowIso: string,
): IdempotencyRecord<T> {
  const record: IdempotencyRecord<T> = { key, decisionId, result, createdAt: nowIso };
  idempotencyStore.set(key, record as IdempotencyRecord);
  return record;
}
