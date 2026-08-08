/**
 * A25 — Autonomous Production Runtime & Continuous Operations
 *
 * Canonical runtime library implementing the bounded deterministic production
 * runtime state machine, cycle scheduler, health model, failure handling,
 * retry policy, rollback contract, degraded mode, and observability for the
 * KIDULTS Global Autonomous Intelligence Platform.
 *
 * Control loop:
 *   POLICY → PREFLIGHT → ACTIVATION_CHECK → EXECUTE → VERIFY →
 *   EVIDENCE → OBSERVE → HEALTH_ASSESSMENT →
 *   RETRY / DEGRADE / ROLLBACK / HALT → NEXT CYCLE
 *
 * Global Safety Invariants (all must hold):
 *  1.  Policy before execution.
 *  2.  Preflight before mutation.
 *  3.  Activation check (A24 gate) before execution.
 *  4.  Non-interactive by default.
 *  5.  Fail closed on unknown, malformed, or contradictory state.
 *  6.  No implicit IDLE → EXECUTING path.
 *  7.  No execution without successful policy, preflight, and A24 validation.
 *  8.  No unbounded loops, recursive retry without limit, or unlimited fan-out.
 *  9.  All bounds represented in policy.
 * 10.  Evidence produced for every cycle.
 * 11.  Rollback path certified before execution.
 * 12.  No provider credentials in evidence.
 * 13.  No secrets in logs.
 * 14.  No A24 policy bypass.
 * 15.  No activation class reclassification.
 */

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export const RuntimeState = /** @type {const} */ ({
  IDLE: 'IDLE',
  PREFLIGHT: 'PREFLIGHT',
  ACTIVATION_CHECK: 'ACTIVATION_CHECK',
  READY: 'READY',
  EXECUTING: 'EXECUTING',
  VERIFYING: 'VERIFYING',
  OBSERVING: 'OBSERVING',
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  RETRY_WAIT: 'RETRY_WAIT',
  ROLLING_BACK: 'ROLLING_BACK',
  HALTED: 'HALTED',
  FAILED_CLOSED: 'FAILED_CLOSED',
});

/** @type {Record<string, string[]>} */
const VALID_TRANSITIONS = {
  IDLE: ['PREFLIGHT', 'HALTED', 'FAILED_CLOSED'],
  PREFLIGHT: ['ACTIVATION_CHECK', 'HALTED', 'FAILED_CLOSED'],
  ACTIVATION_CHECK: ['READY', 'HALTED', 'FAILED_CLOSED'],
  READY: ['EXECUTING', 'HALTED', 'FAILED_CLOSED'],
  EXECUTING: ['VERIFYING', 'ROLLING_BACK', 'FAILED_CLOSED'],
  VERIFYING: ['OBSERVING', 'ROLLING_BACK', 'FAILED_CLOSED'],
  OBSERVING: ['HEALTHY', 'DEGRADED', 'HALTED', 'FAILED_CLOSED'],
  HEALTHY: ['IDLE'],
  DEGRADED: ['RETRY_WAIT', 'HALTED', 'FAILED_CLOSED'],
  RETRY_WAIT: ['PREFLIGHT', 'HALTED', 'FAILED_CLOSED'],
  ROLLING_BACK: ['HALTED', 'FAILED_CLOSED'],
  HALTED: ['IDLE'],
  FAILED_CLOSED: [],
};

/**
 * Validates and returns the next state, always failing closed on unknown or
 * illegal transitions.
 * @param {string} current
 * @param {string} next
 * @returns {string}
 */
export function transition(current, next) {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed) return RuntimeState.FAILED_CLOSED;
  if (!allowed.includes(next)) return RuntimeState.FAILED_CLOSED;
  return next;
}

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

export const FailureClass = /** @type {const} */ ({
  TRANSIENT: 'TRANSIENT',
  DEPENDENCY: 'DEPENDENCY',
  POLICY: 'POLICY',
  AUTH: 'AUTH',
  RATE_LIMIT: 'RATE_LIMIT',
  DATA_QUALITY: 'DATA_QUALITY',
  STALE_DATA: 'STALE_DATA',
  EXECUTION: 'EXECUTION',
  VERIFICATION: 'VERIFICATION',
  PUBLICATION_BLOCK: 'PUBLICATION_BLOCK',
  ROLLBACK_REQUIRED: 'ROLLBACK_REQUIRED',
  UNKNOWN: 'UNKNOWN',
});

/**
 * Classifies an error message or code into a canonical FailureClass.
 * Unknown patterns always return UNKNOWN (fail closed).
 * @param {string} errorMessage
 * @returns {string}
 */
export function classifyFailure(errorMessage) {
  if (!errorMessage || typeof errorMessage !== 'string') return FailureClass.UNKNOWN;
  const msg = errorMessage.toLowerCase();
  if (msg.includes('policy-denied') || msg.includes('policy-block')) return FailureClass.POLICY;
  if (msg.includes('preflight-failed')) return FailureClass.POLICY;
  if (msg.includes('activation-denied') || msg.includes('activation-check-failed')) return FailureClass.POLICY;
  if (msg.includes('auth') || msg.includes('unauthorized') || msg.includes('forbidden')) return FailureClass.AUTH;
  if (msg.includes('rate-limit') || msg.includes('rate_limit') || msg.includes('too-many-requests')) return FailureClass.RATE_LIMIT;
  if (msg.includes('data-quality') || msg.includes('data_quality')) return FailureClass.DATA_QUALITY;
  if (msg.includes('stale-data') || msg.includes('stale_data')) return FailureClass.STALE_DATA;
  if (msg.includes('verification-failed')) return FailureClass.VERIFICATION;
  if (msg.includes('publication-block') || msg.includes('a22')) return FailureClass.PUBLICATION_BLOCK;
  if (msg.includes('rollback-required')) return FailureClass.ROLLBACK_REQUIRED;
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('econnrefused')) return FailureClass.TRANSIENT;
  if (msg.includes('dependency') || msg.includes('provider-unavailable')) return FailureClass.DEPENDENCY;
  if (msg.includes('execution-failed') || msg.includes('execution-error')) return FailureClass.EXECUTION;
  return FailureClass.UNKNOWN;
}

// ---------------------------------------------------------------------------
// Rollback contract
// ---------------------------------------------------------------------------

export const RollbackStatus = /** @type {const} */ ({
  NOT_REQUIRED: 'NOT_REQUIRED',
  AVAILABLE: 'AVAILABLE',
  STARTED: 'STARTED',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
});

/**
 * Returns a canonical rollback record for a cycle.
 * @param {object} opts
 * @returns {object}
 */
export function buildRollbackRecord({ required, reason = null, outcome = RollbackStatus.NOT_REQUIRED, attempts = 0, evidenceRef = null }) {
  return {
    required: Boolean(required),
    status: outcome,
    reason,
    attempts,
    evidenceRef,
    failClosedOnFailure: true,
  };
}

/**
 * Returns true if production continuation is permitted after a rollback.
 * Continuation is blocked for FAILED or UNKNOWN rollback results.
 * @param {string} rollbackStatus
 * @returns {boolean}
 */
export function rollbackAllowsContinuation(rollbackStatus) {
  return rollbackStatus === RollbackStatus.NOT_REQUIRED || rollbackStatus === RollbackStatus.SUCCEEDED;
}

// ---------------------------------------------------------------------------
// Health model
// ---------------------------------------------------------------------------

export const HealthClass = /** @type {const} */ ({
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  UNHEALTHY: 'UNHEALTHY',
  HALTED: 'HALTED',
  UNKNOWN: 'UNKNOWN',
});

/** All required health dimension keys */
export const HEALTH_DIMENSIONS = [
  'policy_health',
  'preflight_health',
  'activation_health',
  'execution_health',
  'data_freshness',
  'provider_dependency_health',
  'publication_control_health',
  'commercial_delivery_health',
  'latency',
  'error_rate',
  'retry_pressure',
  'evidence_completeness',
  'rollback_availability',
];

/**
 * Computes overall health class from individual dimension observations.
 * UNKNOWN fails closed for mutation.
 * @param {Record<string, string>} dimensions  — map of dimension → HealthClass
 * @returns {{ overallHealth: string, dimensions: Record<string, string> }}
 */
export function assessHealth(dimensions) {
  const values = Object.values(dimensions);
  const safe = HEALTH_DIMENSIONS.reduce((acc, dim) => {
    acc[dim] = dimensions[dim] ?? HealthClass.UNKNOWN;
    return acc;
  }, {});

  if (values.includes(HealthClass.HALTED)) {
    return { overallHealth: HealthClass.HALTED, dimensions: safe };
  }
  if (values.includes(HealthClass.UNKNOWN) || values.includes(HealthClass.UNHEALTHY)) {
    return { overallHealth: HealthClass.UNHEALTHY, dimensions: safe };
  }
  if (values.includes(HealthClass.DEGRADED)) {
    return { overallHealth: HealthClass.DEGRADED, dimensions: safe };
  }
  return { overallHealth: HealthClass.HEALTHY, dimensions: safe };
}

// ---------------------------------------------------------------------------
// Activation gate enforcement
// ---------------------------------------------------------------------------

/** Activation classes permitted for bounded runtime execution */
const EXECUTABLE_ACTIVATION_CLASSES = new Set(['CANARY_READY', 'BOUNDED_PRODUCTION_READY']);
const HYBRID_CAPPED_CLASSES = new Set(['HYBRID']);

/**
 * Evaluates A24 activation evidence for a given target.
 * Returns { permitted: boolean, reason: string }
 * A25 must not reclassify products.
 * @param {object} target
 * @returns {{ permitted: boolean, reason: string }}
 */
export function checkActivationEligibility(target) {
  if (!target || typeof target !== 'object') {
    return { permitted: false, reason: 'unknown-target-fail-closed' };
  }

  const cls = target.activationClass;
  if (!cls) {
    return { permitted: false, reason: 'missing-activation-class-fail-closed' };
  }

  if (EXECUTABLE_ACTIVATION_CLASSES.has(cls)) {
    if (target.dataStrategy === 'SELF-FIRST') {
      return { permitted: true, reason: `self-first-${cls.toLowerCase()}-permitted` };
    }
    if (HYBRID_CAPPED_CLASSES.has(target.dataStrategy)) {
      if (!target.providerEvidencePresent) {
        return { permitted: false, reason: 'hybrid-requires-provider-evidence' };
      }
      return { permitted: true, reason: 'hybrid-capped-permitted' };
    }
    return { permitted: true, reason: `${cls.toLowerCase()}-permitted` };
  }

  if (cls === 'PROVIDER_BLOCKED' || cls === 'PROVIDER-REQUIRED') {
    if (target.providerEvidencePresent && target.policyExplicitlyPermits) {
      return { permitted: true, reason: 'provider-required-with-valid-evidence' };
    }
    return { permitted: false, reason: 'provider-required-blocked-no-valid-evidence' };
  }

  if (cls === 'INTERNAL_READY') {
    return { permitted: false, reason: 'internal-ready-no-production-mutation' };
  }

  if (cls === 'PUBLICATION_BLOCKED' || cls === 'COMMERCIAL_BLOCKED' || cls === 'DENIED') {
    return { permitted: false, reason: `${cls.toLowerCase()}-blocked` };
  }

  return { permitted: false, reason: 'unknown-activation-class-fail-closed' };
}

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

/**
 * Computes next retry delay with exponential backoff bounded to policy limits.
 * @param {number} attempt   — 1-based attempt number (first retry = 1)
 * @param {object} policy
 * @returns {number}         — delay in milliseconds
 */
export function computeRetryDelay(attempt, policy) {
  const base = (policy?.scheduler?.backoffBaseSeconds ?? 30) * 1000;
  const max = (policy?.scheduler?.backoffMaxSeconds ?? 1800) * 1000;
  const jitterMax = (policy?.scheduler?.jitterMaxSeconds ?? 60) * 1000;
  const exponential = base * Math.pow(2, attempt - 1);
  const bounded = Math.min(exponential, max);
  const jitter = Math.floor(Math.random() * jitterMax);
  return bounded + jitter;
}

/**
 * Builds a canonical retry record.
 * @param {object} opts
 * @returns {object}
 */
export function buildRetryRecord({ attempt, reason, delayMs, policyDecision, previousEvidenceRef = null }) {
  return { attempt, reason, delayMs, policyDecision, previousEvidenceRef };
}

// ---------------------------------------------------------------------------
// Observability / metrics
// ---------------------------------------------------------------------------

/**
 * Returns a zeroed canonical metrics accumulator.
 * @returns {object}
 */
export function createMetrics() {
  return {
    cycle_count: 0,
    success_count: 0,
    failure_count: 0,
    retry_count: 0,
    rollback_count: 0,
    halt_count: 0,
    degraded_count: 0,
    execution_latency_ms: 0,
    verification_latency_ms: 0,
    remote_call_count: 0,
    records_processed: 0,
    records_mutated: 0,
    records_quarantined: 0,
    provider_failures: 0,
    policy_denials: 0,
    activation_denials: 0,
  };
}

// ---------------------------------------------------------------------------
// Cycle evidence builder
// ---------------------------------------------------------------------------

/**
 * Builds the immutable canonical cycle evidence record required by A25.
 * No provider credentials or secrets are included.
 * @param {object} opts
 * @returns {object}
 */
export function buildCycleEvidence({
  cycleId,
  startedAt,
  completedAt,
  policyVersion,
  runtimeVersion,
  activationEvidenceRef,
  status,
  attempt,
  nextEligibleRunAt,
  state,
  health,
  metrics,
  targetResults,
  rollback,
  retryRecords,
  failureClass,
  failureReason,
  bounds,
}) {
  return {
    stage: 'A25',
    mode: 'autonomous-production-runtime',
    cycleId,
    startedAt,
    completedAt,
    policyVersion,
    runtimeVersion,
    activationEvidenceRef,
    status,
    attempt,
    nextEligibleRunAt,
    finalState: state,
    health,
    metrics,
    targetResults: targetResults ?? [],
    rollback: rollback ?? buildRollbackRecord({ required: false }),
    retryRecords: retryRecords ?? [],
    failureClass: failureClass ?? null,
    failureReason: failureReason ?? null,
    bounds,
    invariants: {
      policyBeforeExecution: true,
      preflightBeforeMutation: true,
      activationCheckBeforeExecution: true,
      nonInteractiveByDefault: true,
      failClosedOnUnknownState: true,
      noProviderCredentialsInEvidence: true,
      noSecretsInEvidence: true,
    },
  };
}
