/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: action-lock.ts
 *
 * Live action locking MUST be durable and cross-process. Process-memory locks
 * are forbidden. Until the PostgreSQL governed action service is connected,
 * runtime lock operations fail closed.
 */

export const A31_ACTION_LOCK_BACKEND = 'POSTGRESQL_DURABLE_BACKEND_REQUIRED' as const;
export const A31_ACTION_LOCK_RUNTIME_READY = false as const;

interface LockEntry {
  readonly decisionId: string;
  readonly requestId: string;
  readonly lockedAt: string;
}

export type LockResult =
  | { acquired: true; entry: LockEntry }
  | { acquired: false; reason: string; existingRequestId: string };

function durableBackendRequired(): never {
  throw new Error('A31_DURABLE_ACTION_LOCK_BACKEND_REQUIRED');
}

export function acquireActionLock(
  _decisionId: string,
  _requestId: string,
): LockResult {
  return durableBackendRequired();
}

export function releaseActionLock(_decisionId: string, _requestId: string): void {
  durableBackendRequired();
}

export function isDecisionLocked(_decisionId: string): boolean {
  return durableBackendRequired();
}
