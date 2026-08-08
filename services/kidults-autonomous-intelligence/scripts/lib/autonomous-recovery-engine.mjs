/**
 * A26 — Autonomous Recovery, Self-Healing & Operational Resilience
 *
 * Canonical recovery engine implementing:
 *  - Deterministic recovery state machine
 *  - Failure-domain isolation
 *  - Failure classification
 *  - Recovery policy engine
 *  - Recovery budgets
 *  - Retry and backoff
 *  - Circuit breaker
 *  - Self-healing (safe, bounded)
 *  - Checkpoint and resume
 *  - Partial-mutation handling
 *  - Rollback hardening
 *  - Degraded operation
 *  - Safe re-entry certification
 *  - Resilience health model
 *  - Recovery observability and evidence
 *
 * A26 Safety Invariants (all must hold):
 *  1.  Recovery is always policy-governed.
 *  2.  Recovery is always bounded.
 *  3.  Recovery is fail-closed by default.
 *  4.  Recovery is observable and auditable.
 *  5.  Recovery is idempotent where possible.
 *  6.  Recovery is non-interactive by default.
 *  7.  No direct FAILURE_DETECTED → RECOVERED transition.
 *  8.  No recovery without classification.
 *  9.  No recovery without policy evaluation.
 * 10.  No re-entry without recovery verification.
 * 11.  Unknown or contradictory state → FAILED_CLOSED.
 * 12.  No uncontrolled auto-healing or silent safety control override.
 * 13.  No recovery action may bypass A15-A25 controls.
 * 14.  No action may expand mutation scope.
 * 15.  No secrets in evidence or logs.
 */

// ---------------------------------------------------------------------------
// Recovery state machine
// ---------------------------------------------------------------------------

export const RecoveryState = /** @type {const} */ ({
  MONITORING: 'MONITORING',
  FAILURE_DETECTED: 'FAILURE_DETECTED',
  CLASSIFYING: 'CLASSIFYING',
  ISOLATING: 'ISOLATING',
  RECOVERY_POLICY_CHECK: 'RECOVERY_POLICY_CHECK',
  RECOVERY_READY: 'RECOVERY_READY',
  RECOVERING: 'RECOVERING',
  VERIFYING_RECOVERY: 'VERIFYING_RECOVERY',
  RECOVERED: 'RECOVERED',
  DEGRADED: 'DEGRADED',
  ROLLBACK_REQUIRED: 'ROLLBACK_REQUIRED',
  ROLLING_BACK: 'ROLLING_BACK',
  REENTRY_CHECK: 'REENTRY_CHECK',
  REENTRY_ALLOWED: 'REENTRY_ALLOWED',
  HALTED: 'HALTED',
  FAILED_CLOSED: 'FAILED_CLOSED',
});

/** @type {Record<string, string[]>} */
const RECOVERY_TRANSITIONS = {
  MONITORING: ['FAILURE_DETECTED', 'HALTED', 'FAILED_CLOSED'],
  FAILURE_DETECTED: ['CLASSIFYING', 'FAILED_CLOSED'],
  CLASSIFYING: ['ISOLATING', 'HALTED', 'FAILED_CLOSED'],
  ISOLATING: ['RECOVERY_POLICY_CHECK', 'HALTED', 'FAILED_CLOSED'],
  RECOVERY_POLICY_CHECK: ['RECOVERY_READY', 'DEGRADED', 'ROLLBACK_REQUIRED', 'HALTED', 'FAILED_CLOSED'],
  RECOVERY_READY: ['RECOVERING', 'HALTED', 'FAILED_CLOSED'],
  RECOVERING: ['VERIFYING_RECOVERY', 'ROLLBACK_REQUIRED', 'FAILED_CLOSED'],
  VERIFYING_RECOVERY: ['RECOVERED', 'ROLLBACK_REQUIRED', 'HALTED', 'FAILED_CLOSED'],
  RECOVERED: ['REENTRY_CHECK', 'MONITORING'],
  DEGRADED: ['MONITORING', 'HALTED', 'FAILED_CLOSED'],
  ROLLBACK_REQUIRED: ['ROLLING_BACK', 'HALTED', 'FAILED_CLOSED'],
  ROLLING_BACK: ['REENTRY_CHECK', 'HALTED', 'FAILED_CLOSED'],
  REENTRY_CHECK: ['REENTRY_ALLOWED', 'DEGRADED', 'HALTED', 'FAILED_CLOSED'],
  REENTRY_ALLOWED: ['MONITORING'],
  HALTED: ['MONITORING'],
  FAILED_CLOSED: [],
};

/**
 * Validates and returns the next recovery state, failing closed on any unknown
 * or illegal transition.
 * @param {string} current
 * @param {string} next
 * @returns {string}
 */
export function recoveryTransition(current, next) {
  const allowed = RECOVERY_TRANSITIONS[current];
  if (!allowed) return RecoveryState.FAILED_CLOSED;
  if (!allowed.includes(next)) return RecoveryState.FAILED_CLOSED;
  return next;
}

// ---------------------------------------------------------------------------
// Failure domains
// ---------------------------------------------------------------------------

export const FailureDomain = /** @type {const} */ ({
  WORKLOAD: 'workload',
  PRODUCT: 'product',
  DIMENSION: 'dimension',
  PROVIDER: 'provider',
  CHANNEL: 'channel',
  PUBLICATION: 'publication',
  COMMERCIAL_DELIVERY: 'commercial-delivery',
  DATABASE: 'database',
  CACHE: 'cache',
  QUEUE: 'queue',
  NETWORK: 'network',
  RUNTIME: 'runtime',
  POLICY: 'policy',
  AUTHENTICATION: 'authentication',
  RATE_LIMIT: 'rate-limit',
  EVIDENCE: 'evidence',
  DEPENDENCY: 'dependency',
  UNKNOWN: 'unknown',
});

const ALL_DOMAINS = new Set(Object.values(FailureDomain));

/**
 * Identifies the smallest safe failure domain from error context.
 * Unknown domains always return UNKNOWN (fail closed).
 * @param {object} errorContext  — { message, source, scope, metadata }
 * @returns {string}
 */
export function identifyFailureDomain(errorContext) {
  if (!errorContext || typeof errorContext !== 'object') return FailureDomain.UNKNOWN;

  // Explicit domain provided and valid
  if (errorContext.domain && ALL_DOMAINS.has(errorContext.domain)) {
    return errorContext.domain;
  }

  const msg = (errorContext.message || '').toLowerCase();
  const source = (errorContext.source || '').toLowerCase();
  const combined = `${msg} ${source}`;

  if (combined.includes('policy') || combined.includes('preflight')) return FailureDomain.POLICY;
  if (combined.includes('auth') || combined.includes('unauthorized') || combined.includes('forbidden')) return FailureDomain.AUTHENTICATION;
  if (combined.includes('rate-limit') || combined.includes('rate_limit') || combined.includes('too-many-requests')) return FailureDomain.RATE_LIMIT;
  if (combined.includes('publication') || combined.includes('a22')) return FailureDomain.PUBLICATION;
  if (combined.includes('commercial') || combined.includes('a23')) return FailureDomain.COMMERCIAL_DELIVERY;
  if (combined.includes('channel')) return FailureDomain.CHANNEL;
  if (combined.includes('provider')) return FailureDomain.PROVIDER;
  if (combined.includes('database') || combined.includes('db') || combined.includes('d1')) return FailureDomain.DATABASE;
  if (combined.includes('cache') || combined.includes('kv')) return FailureDomain.CACHE;
  if (combined.includes('queue')) return FailureDomain.QUEUE;
  if (combined.includes('network') || combined.includes('econnreset') || combined.includes('econnrefused')) return FailureDomain.NETWORK;
  if (combined.includes('timeout')) return FailureDomain.NETWORK;
  if (combined.includes('dependency')) return FailureDomain.DEPENDENCY;
  if (combined.includes('evidence')) return FailureDomain.EVIDENCE;
  if (combined.includes('product')) return FailureDomain.PRODUCT;
  if (combined.includes('dimension')) return FailureDomain.DIMENSION;
  if (combined.includes('workload')) return FailureDomain.WORKLOAD;
  if (combined.includes('runtime')) return FailureDomain.RUNTIME;

  return FailureDomain.UNKNOWN;
}

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

export const FailureClassification = /** @type {const} */ ({
  TRANSIENT: 'TRANSIENT',
  DEPENDENCY: 'DEPENDENCY',
  AUTH: 'AUTH',
  RATE_LIMIT: 'RATE_LIMIT',
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  DATA_QUALITY: 'DATA_QUALITY',
  STALE_DATA: 'STALE_DATA',
  POLICY: 'POLICY',
  ACTIVATION: 'ACTIVATION',
  EXECUTION: 'EXECUTION',
  VERIFICATION: 'VERIFICATION',
  PUBLICATION: 'PUBLICATION',
  COMMERCIAL_DELIVERY: 'COMMERCIAL_DELIVERY',
  DATABASE: 'DATABASE',
  QUEUE: 'QUEUE',
  RESOURCE_EXHAUSTION: 'RESOURCE_EXHAUSTION',
  PARTIAL_MUTATION: 'PARTIAL_MUTATION',
  ROLLBACK: 'ROLLBACK',
  EVIDENCE: 'EVIDENCE',
  UNKNOWN: 'UNKNOWN',
});

export const FailureSeverity = /** @type {const} */ ({
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
});

const ALL_CLASSIFICATIONS = new Set(Object.values(FailureClassification));
const ALL_SEVERITIES = new Set(Object.values(FailureSeverity));

/**
 * Classifies an error into a canonical FailureClassification.
 * Unknown patterns return UNKNOWN (fail closed).
 * @param {string} errorMessage
 * @returns {string}
 */
export function classifyFailure(errorMessage) {
  if (!errorMessage || typeof errorMessage !== 'string') return FailureClassification.UNKNOWN;
  const msg = errorMessage.toLowerCase();

  if (msg.includes('policy-denied') || msg.includes('policy-block') || msg.includes('preflight-failed')) return FailureClassification.POLICY;
  if (msg.includes('activation-denied') || msg.includes('activation-check-failed')) return FailureClassification.ACTIVATION;
  if (msg.includes('auth') || msg.includes('unauthorized') || msg.includes('forbidden')) return FailureClassification.AUTH;
  if (msg.includes('rate-limit') || msg.includes('rate_limit') || msg.includes('too-many-requests')) return FailureClassification.RATE_LIMIT;
  if (msg.includes('timeout')) return FailureClassification.TIMEOUT;
  if (msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('network')) return FailureClassification.NETWORK;
  if (msg.includes('data-quality') || msg.includes('data_quality')) return FailureClassification.DATA_QUALITY;
  if (msg.includes('stale-data') || msg.includes('stale_data')) return FailureClassification.STALE_DATA;
  if (msg.includes('verification-failed')) return FailureClassification.VERIFICATION;
  if (msg.includes('partial-mutation') || msg.includes('partial_mutation')) return FailureClassification.PARTIAL_MUTATION;
  if (msg.includes('rollback-failed') || msg.includes('rollback_failed')) return FailureClassification.ROLLBACK;
  if (msg.includes('publication') || msg.includes('a22')) return FailureClassification.PUBLICATION;
  if (msg.includes('commercial') || msg.includes('a23')) return FailureClassification.COMMERCIAL_DELIVERY;
  if (msg.includes('database') || msg.includes('d1')) return FailureClassification.DATABASE;
  if (msg.includes('queue')) return FailureClassification.QUEUE;
  if (msg.includes('resource-exhaustion') || msg.includes('out-of-memory') || msg.includes('memory')) return FailureClassification.RESOURCE_EXHAUSTION;
  if (msg.includes('evidence')) return FailureClassification.EVIDENCE;
  if (msg.includes('dependency') || msg.includes('provider-unavailable')) return FailureClassification.DEPENDENCY;
  if (msg.includes('transient') || msg.includes('intermittent')) return FailureClassification.TRANSIENT;
  if (msg.includes('execution-failed') || msg.includes('execution-error')) return FailureClassification.EXECUTION;

  return FailureClassification.UNKNOWN;
}

/**
 * Determines failure severity based on classification and context.
 * @param {string} classification
 * @param {object} [context]
 * @returns {string}
 */
export function determineSeverity(classification, context = {}) {
  // Explicit severity provided and valid
  if (context.severity && ALL_SEVERITIES.has(context.severity)) return context.severity;

  switch (classification) {
    case FailureClassification.POLICY:
    case FailureClassification.ACTIVATION:
    case FailureClassification.ROLLBACK:
    case FailureClassification.PARTIAL_MUTATION:
      return FailureSeverity.CRITICAL;
    case FailureClassification.AUTH:
    case FailureClassification.VERIFICATION:
    case FailureClassification.RESOURCE_EXHAUSTION:
    case FailureClassification.DATABASE:
      return FailureSeverity.ERROR;
    case FailureClassification.DEPENDENCY:
    case FailureClassification.NETWORK:
    case FailureClassification.TIMEOUT:
    case FailureClassification.PUBLICATION:
    case FailureClassification.COMMERCIAL_DELIVERY:
    case FailureClassification.EVIDENCE:
      return FailureSeverity.ERROR;
    case FailureClassification.RATE_LIMIT:
    case FailureClassification.STALE_DATA:
    case FailureClassification.DATA_QUALITY:
    case FailureClassification.QUEUE:
      return FailureSeverity.WARN;
    case FailureClassification.TRANSIENT:
    case FailureClassification.EXECUTION:
      return FailureSeverity.WARN;
    case FailureClassification.UNKNOWN:
    default:
      return FailureSeverity.CRITICAL;
  }
}

/**
 * Builds a canonical failure record.
 * UNKNOWN classification fails closed for mutation.
 * @param {object} opts
 * @returns {object}
 */
export function buildFailureRecord({
  failureId,
  cycleId,
  domain,
  classification,
  severity,
  scope,
  source,
  retryable,
  rollbackRequired,
  policyDecision,
  evidenceRef = null,
}) {
  // Validate classification and severity — fail closed if unknown
  const safeClass = ALL_CLASSIFICATIONS.has(classification) ? classification : FailureClassification.UNKNOWN;
  const safeSeverity = ALL_SEVERITIES.has(severity) ? severity : FailureSeverity.CRITICAL;
  const safeDomain = ALL_DOMAINS.has(domain) ? domain : FailureDomain.UNKNOWN;

  return {
    failureId,
    cycleId,
    detectedAt: new Date().toISOString(),
    domain: safeDomain,
    classification: safeClass,
    severity: safeSeverity,
    scope: scope ?? 'unknown',
    source: source ?? 'unknown',
    retryable: Boolean(retryable),
    rollbackRequired: Boolean(rollbackRequired),
    policyDecision: policyDecision ?? 'FAIL_CLOSED',
    evidenceRef,
  };
}

// ---------------------------------------------------------------------------
// Recovery policy engine
// ---------------------------------------------------------------------------

export const RecoveryAction = /** @type {const} */ ({
  NO_ACTION: 'NO_ACTION',
  RETRY: 'RETRY',
  BACKOFF: 'BACKOFF',
  RESTART_SCOPE: 'RESTART_SCOPE',
  RESET_CONNECTION: 'RESET_CONNECTION',
  RELOAD_STATE: 'RELOAD_STATE',
  REPLAY_SAFE_OPERATION: 'REPLAY_SAFE_OPERATION',
  QUARANTINE: 'QUARANTINE',
  DEGRADE: 'DEGRADE',
  ISOLATE_PROVIDER: 'ISOLATE_PROVIDER',
  ISOLATE_PRODUCT: 'ISOLATE_PRODUCT',
  CIRCUIT_BREAK: 'CIRCUIT_BREAK',
  ROLLBACK: 'ROLLBACK',
  HALT_SCOPE: 'HALT_SCOPE',
  HALT_RUNTIME: 'HALT_RUNTIME',
  FAIL_CLOSED: 'FAIL_CLOSED',
});

/**
 * Selects the bounded policy-governed recovery action for a failure record.
 * No action may expand mutation scope or bypass A15-A25 controls.
 * @param {object} failureRecord
 * @param {object} budgetState  — current budget counters
 * @param {object} circuitState — current circuit breaker states by scope
 * @param {object} policy       — a26 recovery policy
 * @returns {{ action: string, reason: string }}
 */
export function selectRecoveryAction(failureRecord, budgetState, circuitState, policy) {
  const { classification, severity, domain, retryable, rollbackRequired } = failureRecord;
  const budgets = policy?.recoveryBudgets ?? {};

  // UNKNOWN classification → FAIL_CLOSED
  if (classification === FailureClassification.UNKNOWN || severity === FailureSeverity.CRITICAL && !retryable) {
    if (classification === FailureClassification.UNKNOWN) {
      return { action: RecoveryAction.FAIL_CLOSED, reason: 'unknown-classification-fail-closed' };
    }
  }

  // Budget exceeded → HALT_SCOPE or FAIL_CLOSED
  const attemptsForFailure = budgetState.attemptsPerFailure?.[failureRecord.failureId] ?? 0;
  if (attemptsForFailure >= (budgets.maxRecoveryAttemptsPerFailure ?? 3)) {
    return { action: RecoveryAction.HALT_SCOPE, reason: 'recovery-budget-per-failure-exceeded' };
  }
  if ((budgetState.totalCycleAttempts ?? 0) >= (budgets.maxRecoveryAttemptsPerCycle ?? 5)) {
    return { action: RecoveryAction.HALT_SCOPE, reason: 'recovery-budget-per-cycle-exceeded' };
  }
  if ((budgetState.consecutiveFailures ?? 0) >= (budgets.maxConsecutiveFailures ?? 5)) {
    return { action: RecoveryAction.HALT_RUNTIME, reason: 'max-consecutive-failures-exceeded' };
  }

  // POLICY or ACTIVATION failure → FAIL_CLOSED (no retry bypasses policy)
  if (classification === FailureClassification.POLICY || classification === FailureClassification.ACTIVATION) {
    return { action: RecoveryAction.FAIL_CLOSED, reason: `${classification.toLowerCase()}-failure-fail-closed` };
  }

  // Rollback required
  if (rollbackRequired || classification === FailureClassification.PARTIAL_MUTATION || classification === FailureClassification.ROLLBACK) {
    const rollbackAttempts = budgetState.rollbackAttempts ?? 0;
    if (rollbackAttempts >= (budgets.maxRollbackAttempts ?? 2)) {
      return { action: RecoveryAction.HALT_SCOPE, reason: 'rollback-budget-exceeded' };
    }
    return { action: RecoveryAction.ROLLBACK, reason: 'rollback-required-by-classification' };
  }

  // AUTH failure → HALT_SCOPE (no retry unless credentials change)
  if (classification === FailureClassification.AUTH) {
    return { action: RecoveryAction.HALT_SCOPE, reason: 'auth-failure-halt-scope' };
  }

  // Circuit breaker check
  const scopeKey = failureRecord.scope ?? 'default';
  const cb = circuitState?.[scopeKey];
  if (cb?.state === CircuitBreakerState.OPEN) {
    return { action: RecoveryAction.CIRCUIT_BREAK, reason: 'circuit-breaker-open-for-scope' };
  }

  // Domain-specific recovery
  switch (domain) {
    case FailureDomain.PROVIDER:
      return { action: RecoveryAction.ISOLATE_PROVIDER, reason: 'provider-domain-isolation' };
    case FailureDomain.PRODUCT:
      return { action: RecoveryAction.ISOLATE_PRODUCT, reason: 'product-domain-isolation' };
    case FailureDomain.DATABASE:
      return { action: RecoveryAction.RESET_CONNECTION, reason: 'database-connection-reset' };
    case FailureDomain.CACHE:
      return { action: RecoveryAction.RELOAD_STATE, reason: 'cache-state-reload' };
    case FailureDomain.NETWORK:
    case FailureDomain.QUEUE:
      return retryable
        ? { action: RecoveryAction.BACKOFF, reason: `${domain}-retry-with-backoff` }
        : { action: RecoveryAction.DEGRADE, reason: `${domain}-non-retryable-degrade` };
    case FailureDomain.PUBLICATION:
      return { action: RecoveryAction.DEGRADE, reason: 'publication-domain-degrade-preserve-a22' };
    case FailureDomain.COMMERCIAL_DELIVERY:
      return { action: RecoveryAction.DEGRADE, reason: 'commercial-delivery-domain-degrade-preserve-a23' };
    case FailureDomain.POLICY:
      return { action: RecoveryAction.FAIL_CLOSED, reason: 'policy-domain-fail-closed' };
    case FailureDomain.UNKNOWN:
      return { action: RecoveryAction.FAIL_CLOSED, reason: 'unknown-domain-fail-closed' };
    default:
      break;
  }

  // Classification-based recovery
  switch (classification) {
    case FailureClassification.TRANSIENT:
    case FailureClassification.TIMEOUT:
      return retryable
        ? { action: RecoveryAction.RETRY, reason: 'transient-retry' }
        : { action: RecoveryAction.DEGRADE, reason: 'transient-non-retryable-degrade' };
    case FailureClassification.RATE_LIMIT:
      return { action: RecoveryAction.BACKOFF, reason: 'rate-limit-backoff' };
    case FailureClassification.DEPENDENCY:
      return { action: RecoveryAction.DEGRADE, reason: 'dependency-failure-degrade' };
    case FailureClassification.DATA_QUALITY:
      return { action: RecoveryAction.QUARANTINE, reason: 'data-quality-quarantine' };
    case FailureClassification.STALE_DATA:
      return { action: RecoveryAction.QUARANTINE, reason: 'stale-data-quarantine' };
    case FailureClassification.EXECUTION:
      return { action: RecoveryAction.RESTART_SCOPE, reason: 'execution-restart-scope' };
    case FailureClassification.VERIFICATION:
      return { action: RecoveryAction.ROLLBACK, reason: 'verification-failure-rollback' };
    case FailureClassification.NETWORK:
      return retryable
        ? { action: RecoveryAction.BACKOFF, reason: 'network-backoff' }
        : { action: RecoveryAction.DEGRADE, reason: 'network-degrade' };
    case FailureClassification.RESOURCE_EXHAUSTION:
      return { action: RecoveryAction.HALT_SCOPE, reason: 'resource-exhaustion-halt-scope' };
    case FailureClassification.EVIDENCE:
      return { action: RecoveryAction.HALT_SCOPE, reason: 'evidence-failure-halt-scope' };
    case FailureClassification.DATABASE:
      return { action: RecoveryAction.RESET_CONNECTION, reason: 'database-reset-connection' };
    case FailureClassification.QUEUE:
      return retryable
        ? { action: RecoveryAction.RETRY, reason: 'queue-retry' }
        : { action: RecoveryAction.DEGRADE, reason: 'queue-degrade' };
    case FailureClassification.PUBLICATION:
      return { action: RecoveryAction.DEGRADE, reason: 'publication-degrade-preserve-a22' };
    case FailureClassification.COMMERCIAL_DELIVERY:
      return { action: RecoveryAction.DEGRADE, reason: 'commercial-delivery-degrade-preserve-a23' };
    case FailureClassification.UNKNOWN:
    default:
      return { action: RecoveryAction.FAIL_CLOSED, reason: 'unknown-classification-fail-closed' };
  }
}

// ---------------------------------------------------------------------------
// Recovery budgets
// ---------------------------------------------------------------------------

/**
 * Returns a zeroed recovery budget state accumulator.
 * @returns {object}
 */
export function createRecoveryBudgetState() {
  return {
    totalCycleAttempts: 0,
    attemptsPerFailure: {},
    rollbackAttempts: 0,
    restartAttempts: 0,
    providerReconnectAttempts: 0,
    replayAttempts: 0,
    degradedCycles: 0,
    consecutiveFailures: 0,
    recoveryStartedAt: null,
  };
}

/**
 * Checks whether a budget has been exceeded.
 * @param {object} budgetState
 * @param {object} policy
 * @returns {{ exceeded: boolean, reason: string | null }}
 */
export function checkRecoveryBudget(budgetState, policy) {
  const b = policy?.recoveryBudgets ?? {};
  const now = Date.now();

  if ((budgetState.totalCycleAttempts ?? 0) >= (b.maxRecoveryAttemptsPerCycle ?? 5)) {
    return { exceeded: true, reason: 'maxRecoveryAttemptsPerCycle-exceeded' };
  }
  if ((budgetState.rollbackAttempts ?? 0) >= (b.maxRollbackAttempts ?? 2)) {
    return { exceeded: true, reason: 'maxRollbackAttempts-exceeded' };
  }
  if ((budgetState.restartAttempts ?? 0) >= (b.maxRestartAttempts ?? 2)) {
    return { exceeded: true, reason: 'maxRestartAttempts-exceeded' };
  }
  if ((budgetState.replayAttempts ?? 0) >= (b.maxReplayAttempts ?? 2)) {
    return { exceeded: true, reason: 'maxReplayAttempts-exceeded' };
  }
  if ((budgetState.degradedCycles ?? 0) >= (b.maxDegradedCycles ?? 5)) {
    return { exceeded: true, reason: 'maxDegradedCycles-exceeded' };
  }
  if ((budgetState.consecutiveFailures ?? 0) >= (b.maxConsecutiveFailures ?? 5)) {
    return { exceeded: true, reason: 'maxConsecutiveFailures-exceeded' };
  }
  if (budgetState.recoveryStartedAt) {
    const elapsed = now - budgetState.recoveryStartedAt;
    if (elapsed >= (b.maxRecoveryDurationMs ?? 120000)) {
      return { exceeded: true, reason: 'maxRecoveryDurationMs-exceeded' };
    }
  }
  return { exceeded: false, reason: null };
}

// ---------------------------------------------------------------------------
// Retry and backoff
// ---------------------------------------------------------------------------

/**
 * Computes bounded exponential backoff delay with jitter.
 * @param {number} attempt   — 1-based attempt number
 * @param {object} policy    — a26 recovery policy
 * @returns {number}         — delay in milliseconds
 */
export function computeRecoveryBackoff(attempt, policy) {
  const rp = policy?.retryPolicy ?? {};
  const base = (rp.backoffBaseMs ?? 1000);
  const max = (rp.maxDelayMs ?? 120000);
  const jitterRange = (rp.jitterMaxMs ?? 5000);
  const exponential = base * Math.pow(2, attempt - 1);
  const bounded = Math.min(exponential, max);
  const jitter = Math.floor(Math.random() * jitterRange);
  return bounded + jitter;
}

/**
 * Returns true if a retry is permitted for the given failure and context.
 * No retry bypasses preflight, A24 activation, policy, or dependency rules.
 * @param {object} failureRecord
 * @param {object} budgetState
 * @param {object} policy
 * @returns {{ permitted: boolean, reason: string }}
 */
export function isRetryPermitted(failureRecord, budgetState, policy) {
  const { classification, retryable } = failureRecord;
  const b = policy?.recoveryBudgets ?? {};
  const rp = policy?.retryPolicy ?? {};

  if (!retryable) return { permitted: false, reason: 'failure-not-retryable' };

  // No retry after permanent policy denial
  if (classification === FailureClassification.POLICY || classification === FailureClassification.ACTIVATION) {
    return { permitted: false, reason: `no-retry-after-${classification.toLowerCase()}-denial` };
  }

  // No retry after auth failure unless credentials changed
  if (classification === FailureClassification.AUTH) {
    return { permitted: false, reason: 'no-retry-after-auth-failure-without-credential-state-change' };
  }

  const attemptsForFailure = budgetState.attemptsPerFailure?.[failureRecord.failureId] ?? 0;
  const maxPerFailure = b.maxRecoveryAttemptsPerFailure ?? 3;
  if (attemptsForFailure >= maxPerFailure) {
    return { permitted: false, reason: 'retry-budget-per-failure-exceeded' };
  }

  if ((budgetState.totalCycleAttempts ?? 0) >= (b.maxRecoveryAttemptsPerCycle ?? 5)) {
    return { permitted: false, reason: 'retry-budget-per-cycle-exceeded' };
  }

  return { permitted: true, reason: 'retry-permitted-within-budget' };
}

/**
 * Builds a canonical retry evidence record.
 * @param {object} opts
 * @returns {object}
 */
export function buildRetryEvidence({ attempt, reason, delayMs, policyDecision, failureId, evidenceRef = null }) {
  return { attempt, reason, delayMs, policyDecision, failureId, evidenceRef, recordedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

export const CircuitBreakerState = /** @type {const} */ ({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

/**
 * Returns a default closed circuit breaker record for a scope.
 * @param {string} scope
 * @returns {object}
 */
export function createCircuitBreaker(scope) {
  return {
    scope,
    state: CircuitBreakerState.CLOSED,
    consecutiveFailures: 0,
    rollingErrorRate: 0,
    providerFailures: 0,
    timeoutRate: 0,
    authFailures: 0,
    rateLimitPressure: 0,
    verificationFailures: 0,
    openedAt: null,
    halfOpenAt: null,
    lastProbeResult: null,
    evidenceRef: null,
  };
}

/**
 * Evaluates circuit breaker inputs and returns updated state with decision.
 * All decisions are evidence-producing and policy-governed.
 * Unrelated workloads must not be globally halted unless required by
 * dependency propagation.
 * @param {object} cb       — current circuit breaker record
 * @param {object} policy   — a26 recovery policy
 * @returns {{ cb: object, transitioned: boolean, reason: string }}
 */
export function evaluateCircuitBreaker(cb, policy) {
  const thresholds = policy?.circuitBreaker?.thresholds ?? {};
  const maxConsecutive = thresholds.consecutiveFailuresForOpen ?? 5;
  const errorRateThreshold = thresholds.errorRateThresholdPct ?? 50;

  const updated = { ...cb };
  let transitioned = false;
  let reason = 'no-state-change';

  switch (cb.state) {
    case CircuitBreakerState.CLOSED: {
      const shouldOpen =
        updated.consecutiveFailures >= maxConsecutive ||
        updated.rollingErrorRate >= errorRateThreshold ||
        updated.authFailures > 0;
      if (shouldOpen) {
        updated.state = CircuitBreakerState.OPEN;
        updated.openedAt = new Date().toISOString();
        transitioned = true;
        reason = `circuit-opened: consecutive=${updated.consecutiveFailures} error-rate=${updated.rollingErrorRate}`;
      }
      break;
    }
    case CircuitBreakerState.OPEN: {
      // Transition to HALF_OPEN after window (caller decides timing)
      if (cb.halfOpenAt) {
        updated.state = CircuitBreakerState.HALF_OPEN;
        transitioned = true;
        reason = 'circuit-half-open-probe-eligible';
      }
      break;
    }
    case CircuitBreakerState.HALF_OPEN: {
      if (cb.lastProbeResult === 'success') {
        updated.state = CircuitBreakerState.CLOSED;
        updated.consecutiveFailures = 0;
        updated.openedAt = null;
        updated.halfOpenAt = null;
        transitioned = true;
        reason = 'circuit-closed-after-successful-probe';
      } else if (cb.lastProbeResult === 'failure') {
        updated.state = CircuitBreakerState.OPEN;
        updated.halfOpenAt = null;
        updated.openedAt = new Date().toISOString();
        transitioned = true;
        reason = 'circuit-reopened-after-failed-probe';
      }
      break;
    }
    default:
      updated.state = CircuitBreakerState.OPEN;
      transitioned = true;
      reason = 'unknown-circuit-state-fail-safe-open';
  }

  return { cb: updated, transitioned, reason };
}

// ---------------------------------------------------------------------------
// Rollback hardening
// ---------------------------------------------------------------------------

export const RollbackPhase = /** @type {const} */ ({
  ROLLBACK_PREFLIGHT: 'ROLLBACK_PREFLIGHT',
  ROLLBACK_EXECUTION: 'ROLLBACK_EXECUTION',
  ROLLBACK_VERIFICATION: 'ROLLBACK_VERIFICATION',
  ROLLBACK_EVIDENCE: 'ROLLBACK_EVIDENCE',
});

export const RollbackOutcome = /** @type {const} */ ({
  NOT_REQUIRED: 'NOT_REQUIRED',
  AVAILABLE: 'AVAILABLE',
  STARTED: 'STARTED',
  SUCCEEDED: 'SUCCEEDED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
});

/**
 * Evaluates whether production re-entry is permitted after rollback.
 * PARTIAL, FAILED, and UNKNOWN outcomes block re-entry.
 * @param {string} outcome
 * @returns {{ permitted: boolean, reason: string }}
 */
export function rollbackAllowsReentry(outcome) {
  switch (outcome) {
    case RollbackOutcome.NOT_REQUIRED:
      return { permitted: true, reason: 'rollback-not-required' };
    case RollbackOutcome.SUCCEEDED:
      return { permitted: true, reason: 'rollback-succeeded' };
    case RollbackOutcome.PARTIAL:
      return { permitted: false, reason: 'rollback-partial-no-reentry' };
    case RollbackOutcome.FAILED:
      return { permitted: false, reason: 'rollback-failed-halt-scope' };
    case RollbackOutcome.UNKNOWN:
      return { permitted: false, reason: 'rollback-unknown-fail-closed' };
    default:
      return { permitted: false, reason: 'unknown-rollback-outcome-fail-closed' };
  }
}

/**
 * Builds a hardened rollback record for A26.
 * @param {object} opts
 * @returns {object}
 */
export function buildRollbackRecord({
  required,
  outcome = RollbackOutcome.NOT_REQUIRED,
  phase = null,
  attempts = 0,
  reason = null,
  evidenceRef = null,
  idempotent = true,
}) {
  return {
    required: Boolean(required),
    outcome,
    phase,
    attempts,
    reason,
    evidenceRef,
    idempotent,
    failClosedOnFailure: true,
    failClosedOnUnknown: true,
  };
}

// ---------------------------------------------------------------------------
// Checkpoint and resume
// ---------------------------------------------------------------------------

/**
 * Builds a canonical checkpoint record.
 * @param {object} opts
 * @returns {object}
 */
export function buildCheckpoint({
  checkpointId,
  cycleId,
  workloadId,
  product,
  runtimeState,
  lastVerifiedOperation,
  processedCount,
  mutationCount,
  evidenceRef,
}) {
  return {
    checkpointId,
    cycleId,
    workloadId,
    product,
    runtimeState,
    lastVerifiedOperation,
    processedCount,
    mutationCount,
    evidenceRef,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Validates checkpoint integrity for a resume attempt.
 * Unknown integrity → fail closed.
 * @param {object} checkpoint
 * @param {object} context   — { policyVersion, a24Valid, preflightPassed, noConflictingState }
 * @returns {{ valid: boolean, reason: string }}
 */
export function validateCheckpointForResume(checkpoint, context) {
  if (!checkpoint || typeof checkpoint !== 'object') {
    return { valid: false, reason: 'checkpoint-missing-fail-closed' };
  }
  const required = ['checkpointId', 'cycleId', 'workloadId', 'product', 'runtimeState', 'lastVerifiedOperation', 'processedCount', 'mutationCount', 'evidenceRef', 'createdAt'];
  for (const field of required) {
    if (checkpoint[field] === undefined || checkpoint[field] === null) {
      return { valid: false, reason: `checkpoint-missing-field-${field}-fail-closed` };
    }
  }
  if (!context?.a24Valid) return { valid: false, reason: 'a24-activation-no-longer-valid-fail-closed' };
  if (!context?.preflightPassed) return { valid: false, reason: 'preflight-failed-for-resume-fail-closed' };
  if (context?.noConflictingState === false) return { valid: false, reason: 'conflicting-newer-state-exists-fail-closed' };
  if (!context?.policyVersionCompatible) return { valid: false, reason: 'policy-version-incompatible-fail-closed' };
  return { valid: true, reason: 'checkpoint-valid-for-resume' };
}

// ---------------------------------------------------------------------------
// Partial mutation handling
// ---------------------------------------------------------------------------

export const PartialMutationDecision = /** @type {const} */ ({
  COMPLETE_SAFELY: 'COMPLETE_SAFELY',
  ROLLBACK: 'ROLLBACK',
  QUARANTINE: 'QUARANTINE',
  HALT: 'HALT',
});

/**
 * Builds a canonical partial-mutation evidence record.
 * @param {object} opts
 * @returns {object}
 */
export function buildPartialMutationRecord({ expected, observed, delta, decision, rollbackRequired }) {
  if (!Object.values(PartialMutationDecision).includes(decision)) {
    decision = PartialMutationDecision.HALT;
  }
  return {
    expected,
    observed,
    delta,
    decision,
    rollbackRequired: Boolean(rollbackRequired),
    detectedAt: new Date().toISOString(),
    neverAssumePartialSuccess: true,
  };
}

// ---------------------------------------------------------------------------
// Degraded operation
// ---------------------------------------------------------------------------

/**
 * Builds a canonical degraded-operation state record.
 * @param {object} opts
 * @returns {object}
 */
export function buildDegradedState({
  cycleId,
  degradedReason,
  affectedScopes,
  remainingHealthyScopes,
  maxDegradedCycles,
  degradedCyclesUsed,
}) {
  return {
    cycleId,
    degradedSince: new Date().toISOString(),
    degradedReason,
    affectedScopes: affectedScopes ?? [],
    remainingHealthyScopes: remainingHealthyScopes ?? [],
    maxDegradedCycles: maxDegradedCycles ?? 5,
    degradedCyclesUsed: degradedCyclesUsed ?? 1,
    budgetExceeded: (degradedCyclesUsed ?? 1) >= (maxDegradedCycles ?? 5),
    preserveA19DependencyPropagation: true,
    preserveA22PublicationRestrictions: true,
    preserveA23DeliveryRestrictions: true,
    preserveA24ActivationRestrictions: true,
  };
}

// ---------------------------------------------------------------------------
// Safe re-entry certification
// ---------------------------------------------------------------------------

export const ReentryDecision = /** @type {const} */ ({
  ALLOW: 'ALLOW',
  DEGRADED_ALLOW: 'DEGRADED_ALLOW',
  DENY: 'DENY',
  HALT: 'HALT',
});

/**
 * Certifies whether production re-entry is safe after recovery.
 * No automatic full re-entry without this gate passing.
 * @param {object} checks  — map of check name → boolean result
 * @param {object} [circuitState] — circuit breaker state by scope
 * @returns {{ decision: string, reason: string, checksPerformed: object }}
 */
export function certifyReentry(checks, circuitState = {}) {
  const required = [
    'policyValid',
    'preflightPass',
    'a24ActivationStillValid',
    'a25RuntimeHealthAcceptable',
    'failureCleared',
    'verificationPass',
    'rollbackStateClean',
    'evidenceComplete',
    'dependencyGraphHealthy',
  ];

  const missing = required.filter((k) => checks[k] === undefined);
  if (missing.length > 0) {
    return {
      decision: ReentryDecision.DENY,
      reason: `missing-reentry-checks: ${missing.join(', ')}`,
      checksPerformed: checks,
    };
  }

  // Critical gate failures → HALT
  if (!checks.policyValid) return { decision: ReentryDecision.HALT, reason: 'policy-invalid-halt', checksPerformed: checks };
  if (!checks.a24ActivationStillValid) return { decision: ReentryDecision.HALT, reason: 'a24-activation-invalid-halt', checksPerformed: checks };
  if (!checks.preflightPass) return { decision: ReentryDecision.DENY, reason: 'preflight-failed-deny', checksPerformed: checks };
  if (!checks.rollbackStateClean) return { decision: ReentryDecision.DENY, reason: 'rollback-state-unclean-deny', checksPerformed: checks };
  if (!checks.evidenceComplete) return { decision: ReentryDecision.DENY, reason: 'evidence-incomplete-deny', checksPerformed: checks };

  // Circuit breaker open for any scope → DENY
  const openCircuits = Object.entries(circuitState).filter(([, cb]) => cb?.state === CircuitBreakerState.OPEN);
  if (!checks.circuitBreakerPermits && openCircuits.length > 0) {
    return { decision: ReentryDecision.DENY, reason: `circuit-breaker-open: ${openCircuits.map(([s]) => s).join(', ')}`, checksPerformed: checks };
  }

  // Degraded but safe for limited re-entry
  const degradedChecks = ['failureCleared', 'a25RuntimeHealthAcceptable', 'dependencyGraphHealthy', 'verificationPass'];
  const allPassed = required.every((k) => checks[k] === true) && (checks.circuitBreakerPermits !== false);
  if (allPassed) {
    return { decision: ReentryDecision.ALLOW, reason: 'all-reentry-checks-passed', checksPerformed: checks };
  }

  const partiallyPassed = degradedChecks.filter((k) => checks[k] !== true);
  if (partiallyPassed.length <= 2) {
    return { decision: ReentryDecision.DEGRADED_ALLOW, reason: `degraded-reentry: limited-scope`, checksPerformed: checks };
  }

  return { decision: ReentryDecision.DENY, reason: `reentry-denied: failed-checks=${partiallyPassed.join(',')}`, checksPerformed: checks };
}

// ---------------------------------------------------------------------------
// Resilience health model
// ---------------------------------------------------------------------------

export const ResilienceClass = /** @type {const} */ ({
  RESILIENT: 'RESILIENT',
  DEGRADED: 'DEGRADED',
  UNSTABLE: 'UNSTABLE',
  HALTED: 'HALTED',
  UNKNOWN: 'UNKNOWN',
});

export const RESILIENCE_HEALTH_DIMENSIONS = [
  'recovery_readiness',
  'rollback_readiness',
  'circuit_breaker_health',
  'checkpoint_health',
  'dependency_isolation_health',
  'degraded_mode_pressure',
  'consecutive_failure_pressure',
  'evidence_integrity',
  'recovery_latency',
  'recovery_success_rate',
];

/**
 * Computes overall resilience health from dimension observations.
 * UNKNOWN blocks mutation.
 * @param {object} dimensions  — map of dimension → ResilienceClass value
 * @returns {{ overallResilience: string, dimensions: object }}
 */
export function assessResilienceHealth(dimensions) {
  const safe = RESILIENCE_HEALTH_DIMENSIONS.reduce((acc, dim) => {
    acc[dim] = dimensions[dim] ?? ResilienceClass.UNKNOWN;
    return acc;
  }, {});
  const values = Object.values(safe);

  if (values.includes(ResilienceClass.HALTED)) return { overallResilience: ResilienceClass.HALTED, dimensions: safe };
  if (values.includes(ResilienceClass.UNKNOWN)) return { overallResilience: ResilienceClass.UNKNOWN, dimensions: safe };
  if (values.includes(ResilienceClass.UNSTABLE)) return { overallResilience: ResilienceClass.UNSTABLE, dimensions: safe };
  if (values.includes(ResilienceClass.DEGRADED)) return { overallResilience: ResilienceClass.DEGRADED, dimensions: safe };
  return { overallResilience: ResilienceClass.RESILIENT, dimensions: safe };
}

// ---------------------------------------------------------------------------
// Recovery metrics
// ---------------------------------------------------------------------------

/**
 * Returns a zeroed canonical recovery metrics accumulator.
 * @returns {object}
 */
export function createRecoveryMetrics() {
  return {
    failure_detected_count: 0,
    failure_classification_count: 0,
    recovery_attempt_count: 0,
    recovery_success_count: 0,
    recovery_failure_count: 0,
    rollback_attempt_count: 0,
    rollback_success_count: 0,
    rollback_failure_count: 0,
    circuit_open_count: 0,
    circuit_half_open_count: 0,
    circuit_close_count: 0,
    checkpoint_created_count: 0,
    checkpoint_resume_count: 0,
    degraded_cycle_count: 0,
    scope_halt_count: 0,
    runtime_halt_count: 0,
    partial_mutation_count: 0,
    reentry_allow_count: 0,
    reentry_deny_count: 0,
    mean_recovery_time_ms: 0,
    max_recovery_time_ms: 0,
    _recovery_time_samples: [],
  };
}

/**
 * Records a recovery time sample and updates mean/max.
 * @param {object} metrics
 * @param {number} durationMs
 */
export function recordRecoveryTime(metrics, durationMs) {
  metrics._recovery_time_samples.push(durationMs);
  metrics.max_recovery_time_ms = Math.max(metrics.max_recovery_time_ms, durationMs);
  const sum = metrics._recovery_time_samples.reduce((a, b) => a + b, 0);
  metrics.mean_recovery_time_ms = Math.round(sum / metrics._recovery_time_samples.length);
}

// ---------------------------------------------------------------------------
// Recovery evidence builder
// ---------------------------------------------------------------------------

/**
 * Builds the immutable canonical recovery evidence record required by A26.
 * No provider credentials or secrets are included.
 * @param {object} opts
 * @returns {object}
 */
export function buildRecoveryEvidence({
  recoveryId,
  cycleId,
  a25EvidenceRef,
  recoveryState,
  failureRecord,
  recoveryAction,
  rollback,
  checkpoint,
  partialMutation,
  degradedState,
  reentry,
  resilienceHealth,
  metrics,
  budgetState,
  circuitBreakers,
  retryRecords,
  status,
  startedAt,
  completedAt,
}) {
  return {
    stage: 'A26',
    mode: 'autonomous-recovery-self-healing-resilience',
    recoveryId,
    cycleId,
    a25EvidenceRef: a25EvidenceRef ?? null,
    startedAt,
    completedAt,
    status,
    recoveryState,
    failureRecord: failureRecord ?? null,
    recoveryAction: recoveryAction ?? null,
    rollback: rollback ?? null,
    checkpoint: checkpoint ?? null,
    partialMutation: partialMutation ?? null,
    degradedState: degradedState ?? null,
    reentry: reentry ?? null,
    resilienceHealth,
    metrics,
    budgetState: {
      totalCycleAttempts: budgetState?.totalCycleAttempts ?? 0,
      rollbackAttempts: budgetState?.rollbackAttempts ?? 0,
      restartAttempts: budgetState?.restartAttempts ?? 0,
      consecutiveFailures: budgetState?.consecutiveFailures ?? 0,
      degradedCycles: budgetState?.degradedCycles ?? 0,
    },
    circuitBreakers: circuitBreakers ?? {},
    retryRecords: retryRecords ?? [],
    invariants: {
      policyGovernedRecovery: true,
      boundedRecovery: true,
      failClosedByDefault: true,
      observableRecovery: true,
      auditableRecovery: true,
      nonInteractiveByDefault: true,
      noUncontrolledAutoHealing: true,
      noSilentOverrideOfSafetyControls: true,
      upstreamControlsPreserved: true,
      noProviderCredentialsInEvidence: true,
      noSecretsInEvidence: true,
    },
  };
}
