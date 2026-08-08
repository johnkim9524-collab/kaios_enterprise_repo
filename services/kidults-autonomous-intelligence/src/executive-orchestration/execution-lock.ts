/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: execution-lock.ts
 *
 * Only one active execution per decision.
 * Concurrent duplicate execution attempts are rejected.
 */

// ---------------------------------------------------------------------------
// Lock State
// ---------------------------------------------------------------------------

export type LockState = 'LOCKED' | 'UNLOCKED';

interface LockEntry {
  decisionId: string;
  lockedAt: string;
  lockedBy: string;
}

const lockRegistry: Map<string, LockEntry> = new Map();

// ---------------------------------------------------------------------------
// Acquire Lock
// ---------------------------------------------------------------------------

export type LockAcquisitionResult =
  | { acquired: true; lockEntry: LockEntry }
  | { acquired: false; reason: string; existingLock: LockEntry };

export function acquireExecutionLock(
  decisionId: string,
  acquiredBy: string,
  nowIso: string,
): LockAcquisitionResult {
  const existing = lockRegistry.get(decisionId);
  if (existing) {
    return {
      acquired: false,
      reason: `Decision ${decisionId} is already locked for execution by ${existing.lockedBy} since ${existing.lockedAt}. Concurrent execution rejected.`,
      existingLock: existing,
    };
  }

  const entry: LockEntry = { decisionId, lockedAt: nowIso, lockedBy: acquiredBy };
  lockRegistry.set(decisionId, entry);
  return { acquired: true, lockEntry: entry };
}

// ---------------------------------------------------------------------------
// Release Lock
// ---------------------------------------------------------------------------

export function releaseExecutionLock(decisionId: string): void {
  lockRegistry.delete(decisionId);
}

// ---------------------------------------------------------------------------
// Check Without Acquiring
// ---------------------------------------------------------------------------

export function isLocked(decisionId: string): boolean {
  return lockRegistry.has(decisionId);
}
