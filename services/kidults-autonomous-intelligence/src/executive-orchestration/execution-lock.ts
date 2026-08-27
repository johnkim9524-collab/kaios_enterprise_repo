/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: execution-lock.ts
 *
 * Lock state must be injected. No module-level process-memory lock registry is
 * permitted because it cannot serialize executions across restarts/instances.
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

export function acquireExecutionLock(
  store: ExecutionLockStore,
  decisionId: string,
  acquiredBy: string,
  nowIso: string,
): LockAcquisitionResult {
  const existing = store.get(decisionId);
  if (existing) {
    return {
      acquired: false,
      reason: `Decision ${decisionId} is already locked for execution by ${existing.lockedBy} since ${existing.lockedAt}. Concurrent execution rejected.`,
      existingLock: existing,
    };
  }

  const entry: LockEntry = { decisionId, lockedAt: nowIso, lockedBy: acquiredBy };
  store.set(decisionId, entry);
  return { acquired: true, lockEntry: entry };
}

export function releaseExecutionLock(store: ExecutionLockStore, decisionId: string): void {
  store.delete(decisionId);
}

export function isLocked(store: ExecutionLockStore, decisionId: string): boolean {
  return Boolean(store.get(decisionId));
}
