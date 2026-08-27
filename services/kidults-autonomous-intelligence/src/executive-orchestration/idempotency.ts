/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: idempotency.ts
 *
 * No module-level state is permitted here. Production callers must inject a
 * durable idempotency store owned by the canonical control plane.
 */

export interface IdempotencyRecord<T = unknown> {
  key: string;
  decisionId: string;
  result: T;
  createdAt: string;
}

export interface IdempotencyStore {
  get(key: string): IdempotencyRecord | undefined;
  set(key: string, record: IdempotencyRecord): void;
}

export function buildIdempotencyKey(decisionId: string, planId: string): string {
  return `a29:exec:${decisionId}:${planId}`;
}

export type IdempotencyCheckResult<T> =
  | { exists: false }
  | { exists: true; record: IdempotencyRecord<T> };

export function checkIdempotency<T>(store: IdempotencyStore, key: string): IdempotencyCheckResult<T> {
  const record = store.get(key);
  if (!record) return { exists: false };
  return { exists: true, record: record as IdempotencyRecord<T> };
}

export function registerIdempotencyResult<T>(
  store: IdempotencyStore,
  key: string,
  decisionId: string,
  result: T,
  nowIso: string,
): IdempotencyRecord<T> {
  const record: IdempotencyRecord<T> = { key, decisionId, result, createdAt: nowIso };
  store.set(key, record as IdempotencyRecord);
  return record;
}
