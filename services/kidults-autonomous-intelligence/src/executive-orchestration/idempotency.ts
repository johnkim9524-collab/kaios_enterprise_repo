/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: idempotency.ts
 *
 * Runtime idempotency MUST be durable. Process-memory state is forbidden here.
 * Until the PostgreSQL-backed A29 execution service is connected, every runtime
 * lookup/register attempt fails closed instead of pretending a Map is durable.
 */

export const A29_IDEMPOTENCY_BACKEND = 'POSTGRESQL_DURABLE_BACKEND_REQUIRED' as const;
export const A29_IDEMPOTENCY_RUNTIME_READY = false as const;

export interface IdempotencyRecord<T = unknown> {
  key: string;
  decisionId: string;
  result: T;
  createdAt: string;
}

export function buildIdempotencyKey(decisionId: string, planId: string): string {
  return `a29:exec:${decisionId}:${planId}`;
}

export type IdempotencyCheckResult<T> =
  | { exists: false }
  | { exists: true; record: IdempotencyRecord<T> };

function durableBackendRequired(): never {
  throw new Error('A29_DURABLE_IDEMPOTENCY_BACKEND_REQUIRED');
}

export function checkIdempotency<T>(_key: string): IdempotencyCheckResult<T> {
  return durableBackendRequired();
}

export function registerIdempotencyResult<T>(
  _key: string,
  _decisionId: string,
  _result: T,
  _nowIso: string,
): IdempotencyRecord<T> {
  return durableBackendRequired();
}
