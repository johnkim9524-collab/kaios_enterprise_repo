/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: execution-lock.ts
 *
 * Runtime execution locking MUST be durable and cross-process. Process-memory
 * locking is forbidden. Until the PostgreSQL control-plane lock backend is
 * connected, acquisition fails closed.
 */

export const A29_EXECUTION_LOCK_BACKEND = 'POSTGRESQL_DURABLE_BACKEND_REQUIRED' as const;
export const A29_EXECUTION_LOCK_RUNTIME_READY = false as const;

export type LockState = 'LOCKED' | 'UNLOCKED';

interface LockEntry {
  decisionId: string;
  lockedAt: string;
  lockedBy: string;
}

export type LockAcquisitionResult =
  | { acquired: true; lockEntry: LockEntry }
  | { acquired: false; reason: string; existingLock: LockEntry };

function durableBackendRequired(): never {
  throw new Error('A29_DURABLE_EXECUTION_LOCK_BACKEND_REQUIRED');
}

export function acquireExecutionLock(
  _decisionId: string,
  _acquiredBy: string,
  _nowIso: string,
): LockAcquisitionResult {
  return durableBackendRequired();
}

export function releaseExecutionLock(_decisionId: string): void {
  durableBackendRequired();
}

export function isLocked(_decisionId: string): boolean {
  return durableBackendRequired();
}
