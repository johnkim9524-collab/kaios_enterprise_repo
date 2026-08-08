/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: action-lock.ts
 *
 * Only one active request per decision/action scope at a time.
 * Concurrent duplicate requests return IN_PROGRESS or EXISTING_RESULT.
 */

// ---------------------------------------------------------------------------
// Lock Registry
// ---------------------------------------------------------------------------

interface LockEntry {
  readonly decisionId: string;
  readonly requestId: string;
  readonly lockedAt: string;
}

const lockRegistry = new Map<string, LockEntry>();

// Lock key: decision-level (action scope)
function lockKey(decisionId: string): string {
  return `a31:lock:${decisionId}`;
}

// ---------------------------------------------------------------------------
// Acquire / Release
// ---------------------------------------------------------------------------

export type LockResult =
  | { acquired: true; entry: LockEntry }
  | { acquired: false; reason: string; existingRequestId: string };

export function acquireActionLock(
  decisionId: string,
  requestId: string,
): LockResult {
  const key = lockKey(decisionId);
  const existing = lockRegistry.get(key);
  if (existing) {
    return {
      acquired: false,
      reason: 'This decision is already being processed.',
      existingRequestId: existing.requestId,
    };
  }

  const entry: LockEntry = {
    decisionId,
    requestId,
    lockedAt: new Date().toISOString(),
  };
  lockRegistry.set(key, entry);
  return { acquired: true, entry };
}

export function releaseActionLock(decisionId: string, requestId: string): void {
  const key = lockKey(decisionId);
  const existing = lockRegistry.get(key);
  // Only release if this request holds the lock
  if (existing && existing.requestId === requestId) {
    lockRegistry.delete(key);
  }
}

export function isDecisionLocked(decisionId: string): boolean {
  return lockRegistry.has(lockKey(decisionId));
}
