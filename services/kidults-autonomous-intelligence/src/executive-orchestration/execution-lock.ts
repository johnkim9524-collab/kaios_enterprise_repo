/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: execution-lock.ts
 *
 * Lock state must be injected. No module-level process-memory lock registry is
 * permitted because it cannot serialize executions across restarts/instances.
 * Legacy call shapes are retained only to fail closed.
 */

export type LockState = 'LOCKED' | 'UNLOCKED';

export interface LockEntry {
  decisionId: string;
  lockedAt: string;
  lockedBy: string;
}

export interface ExecutionLockStore {
  get(decisionId: string): LockEntry | undefined;
  set(decisionId: string, entry: LockEntry): void;
  delete(decisionId: string): void;
}

export type LockAcquisitionResult =
  | { acquired: true; lockEntry: LockEntry }
  | { acquired: false; reason: string; existingLock: LockEntry };

export function acquireExecutionLock(store: ExecutionLockStore, decisionId: string, acquiredBy: string, nowIso: string): LockAcquisitionResult;
export function acquireExecutionLock(decisionId: string, acquiredBy: string, nowIso: string): LockAcquisitionResult;
export function acquireExecutionLock(
  storeOrDecisionId: ExecutionLockStore | string,
  decisionIdOrAcquiredBy: string,
  acquiredByOrNowIso: string,
  maybeNowIso?: string,
): LockAcquisitionResult {
  if (typeof storeOrDecisionId === 'string') {
    throw new Error('DURABLE_EXECUTION_LOCK_STORE_REQUIRED');
  }
  const decisionId = decisionIdOrAcquiredBy;
  const acquiredBy = acquiredByOrNowIso;
  const nowIso = maybeNowIso;
  if (!nowIso) throw new Error('EXECUTION_LOCK_TIMESTAMP_REQUIRED');
  const existing = storeOrDecisionId.get(decisionId);
  if (existing) {
    return {
      acquired: false,
      reason: `Decision ${decisionId} is already locked for execution by ${existing.lockedBy} since ${existing.lockedAt}. Concurrent execution rejected.`,
      existingLock: existing,
    };
  }
  const entry: LockEntry = { decisionId, lockedAt: nowIso, lockedBy: acquiredBy };
  storeOrDecisionId.set(decisionId, entry);
  return { acquired: true, lockEntry: entry };
}

export function releaseExecutionLock(store: ExecutionLockStore, decisionId: string): void;
export function releaseExecutionLock(decisionId: string): void;
export function releaseExecutionLock(storeOrDecisionId: ExecutionLockStore | string, maybeDecisionId?: string): void {
  if (typeof storeOrDecisionId === 'string') {
    throw new Error('DURABLE_EXECUTION_LOCK_STORE_REQUIRED');
  }
  if (!maybeDecisionId) throw new Error('DECISION_ID_REQUIRED');
  storeOrDecisionId.delete(maybeDecisionId);
}

export function isLocked(store: ExecutionLockStore, decisionId: string): boolean;
export function isLocked(decisionId: string): boolean;
export function isLocked(storeOrDecisionId: ExecutionLockStore | string, maybeDecisionId?: string): boolean {
  if (typeof storeOrDecisionId === 'string') {
    throw new Error('DURABLE_EXECUTION_LOCK_STORE_REQUIRED');
  }
  if (!maybeDecisionId) throw new Error('DECISION_ID_REQUIRED');
  return Boolean(storeOrDecisionId.get(maybeDecisionId));
}
