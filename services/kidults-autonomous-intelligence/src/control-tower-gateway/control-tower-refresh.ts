/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: control-tower-refresh.ts
 *
 * Bounded polling/refresh policy for action status and dashboard state.
 * No aggressive polling, no infinite retry.
 * Supports backoff, maximum retry window, manual refresh, stale visibility.
 */

import type { ExecutiveActionResponse } from './gateway-types.js';

// ---------------------------------------------------------------------------
// Refresh Policy (spec §14)
// ---------------------------------------------------------------------------

export interface RefreshPolicy {
  /** Initial poll interval in milliseconds */
  readonly initialIntervalMs: number;
  /** Backoff multiplier */
  readonly backoffFactor: number;
  /** Maximum poll interval in milliseconds */
  readonly maxIntervalMs: number;
  /** Maximum total polling window in milliseconds */
  readonly maxWindowMs: number;
  /** Maximum number of poll attempts */
  readonly maxAttempts: number;
}

export const DEFAULT_REFRESH_POLICY: Readonly<RefreshPolicy> = {
  initialIntervalMs: 3_000,
  backoffFactor:     1.5,
  maxIntervalMs:     30_000,
  maxWindowMs:       5 * 60_000, // 5 minutes
  maxAttempts:       20,
};

// ---------------------------------------------------------------------------
// Refresh State
// ---------------------------------------------------------------------------

export type RefreshPhase =
  | 'IDLE'
  | 'POLLING'
  | 'COMPLETED'
  | 'STALE'
  | 'MAX_ATTEMPTS_REACHED'
  | 'ERROR';

export interface RefreshState {
  readonly phase: RefreshPhase;
  readonly attempt: number;
  readonly nextPollMs: number;
  readonly startedAt: string | null;
  readonly lastPollAt: string | null;
  readonly statusMessage: string;
}

const TERMINAL_EXECUTION_STATUSES = new Set(['VERIFIED', 'ROLLED_BACK', 'FAILED_CLOSED']);

// ---------------------------------------------------------------------------
// Compute next poll interval (exponential backoff)
// ---------------------------------------------------------------------------

export function nextPollInterval(attempt: number, policy: RefreshPolicy): number {
  const raw = policy.initialIntervalMs * Math.pow(policy.backoffFactor, attempt);
  return Math.min(raw, policy.maxIntervalMs);
}

// ---------------------------------------------------------------------------
// Refresh Manager
// ---------------------------------------------------------------------------

export class ActionRefreshManager {
  private readonly policy: RefreshPolicy;
  private startedAt: string | null = null;
  private lastPollAt: string | null = null;
  private attempt = 0;
  private phase: RefreshPhase = 'IDLE';

  constructor(policy: RefreshPolicy = DEFAULT_REFRESH_POLICY) {
    this.policy = policy;
  }

  start(): void {
    this.startedAt = new Date().toISOString();
    this.lastPollAt = null;
    this.attempt = 0;
    this.phase = 'POLLING';
  }

  recordPoll(response: ExecutiveActionResponse | null): RefreshState {
    this.lastPollAt = new Date().toISOString();
    this.attempt += 1;

    const elapsedMs = this.startedAt
      ? Date.now() - new Date(this.startedAt).getTime()
      : 0;

    // Check terminal states
    if (response && TERMINAL_EXECUTION_STATUSES.has(response.executionStatus ?? '')) {
      this.phase = 'COMPLETED';
      return this.getState('Action completed.');
    }

    // Max window exceeded
    if (elapsedMs >= this.policy.maxWindowMs) {
      this.phase = 'STALE';
      return this.getState('Refresh window exceeded. Status may be stale. Refresh manually.');
    }

    // Max attempts exceeded
    if (this.attempt >= this.policy.maxAttempts) {
      this.phase = 'MAX_ATTEMPTS_REACHED';
      return this.getState('Maximum poll attempts reached. Use manual refresh.');
    }

    return this.getState('Checking status...');
  }

  recordError(): RefreshState {
    this.phase = 'ERROR';
    return this.getState('Unable to retrieve status. The service may be temporarily unavailable.');
  }

  manualRefresh(): void {
    if (this.phase !== 'COMPLETED') {
      this.phase = 'POLLING';
      this.attempt = 0;
      this.startedAt = new Date().toISOString();
    }
  }

  getState(statusMessage = ''): RefreshState {
    return {
      phase: this.phase,
      attempt: this.attempt,
      nextPollMs: this.phase === 'POLLING'
        ? nextPollInterval(this.attempt, this.policy)
        : 0,
      startedAt: this.startedAt,
      lastPollAt: this.lastPollAt,
      statusMessage,
    };
  }
}
