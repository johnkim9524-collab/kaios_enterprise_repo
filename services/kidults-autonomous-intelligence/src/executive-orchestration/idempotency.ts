/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: idempotency.ts
 *
 * No module-level state is permitted here. Production callers must inject a
 * durable idempotency store owned by the canonical control plane. Legacy
 * call shapes are retained only to fail closed instead of silently falling
 * back to process memory.
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

export function checkIdempotency<T>(store: IdempotencyStore, key: string): IdempotencyCheckResult<T>;
export function checkIdempotency<T>(key: string): IdempotencyCheckResult<T>;
export function checkIdempotency<T>(storeOrKey: IdempotencyStore | string, maybeKey?: string): IdempotencyCheckResult<T> {
  if (typeof storeOrKey === 'string') throw new Error('DURABLE_IDEMPOTENCY_STORE_REQUIRED');
  const key = maybeKey;
  if (!key) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  const record = storeOrKey.get(key);
  if (!record) return { exists: false };
  return { exists: true, record: record as IdempotencyRecord<T> };
}

export function registerIdempotencyResult<T>(store: IdempotencyStore,key: string,decisionId: string,result: T,nowIso: string): IdempotencyRecord<T>;
export function registerIdempotencyResult<T>(key: string,decisionId: string,result: T,nowIso: string): IdempotencyRecord<T>;
export function registerIdempotencyResult<T>(storeOrKey: IdempotencyStore | string,keyOrDecisionId: string,decisionIdOrResult: string | T,resultOrNowIso: T | string,maybeNowIso?: string): IdempotencyRecord<T> {
  if (typeof storeOrKey === 'string') throw new Error('DURABLE_IDEMPOTENCY_STORE_REQUIRED');
  const key = keyOrDecisionId;
  const decisionId = decisionIdOrResult as string;
  const result = resultOrNowIso as T;
  const nowIso = maybeNowIso;
  if (!nowIso) throw new Error('IDEMPOTENCY_TIMESTAMP_REQUIRED');
  const record: IdempotencyRecord<T> = { key, decisionId, result, createdAt: nowIso };
  storeOrKey.set(key, record as IdempotencyRecord);
  return record;
}
