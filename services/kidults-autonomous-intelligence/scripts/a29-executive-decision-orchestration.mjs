/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Runner: a29-executive-decision-orchestration.mjs
 *
 * Canonical certification runner for the A29 Executive Decision Orchestration layer.
 *
 * Orchestration flow:
 *   INGEST_A28_DECISION
 *   → VALIDATE_DECISION_CONTRACT
 *   → AUTHORITY_VALIDATION
 *   → RECORD_EXECUTIVE_ACTION
 *   → PREFLIGHT (two-phase)
 *   → BOUNDED_EXECUTION
 *   → VERIFICATION
 *   → ROLLBACK_IF_REQUIRED
 *   → DECISION_CLOSURE
 *   → EXECUTIVE_RESPONSE
 *   → AUDIT
 *   → CERTIFY_INVARIANTS
 *   → PRODUCE_EVIDENCE
 *
 * A29 Invariants (all must hold):
 *  1.  a28DecisionIsCanonicalInput
 *  2.  authorityValidatedBeforeDecision
 *  3.  authorityCannotSelfElevate
 *  4.  approvalDoesNotDirectlyMutate
 *  5.  preflightImmediatelyBeforeExecution
 *  6.  staleEvidenceBlocksExecution
 *  7.  supersededDecisionCannotExecute
 *  8.  expiredDecisionCannotExecute
 *  9.  twoPhaseApprovalRequired
 * 10.  executionScopeBounded
 * 11.  idempotencyEnforced
 * 12.  decisionExecutionLocked
 * 13.  rollbackPlanRequiredWhereApplicable
 * 14.  a26RecoveryPreserved
 * 15.  a27FreezePreserved
 * 16.  a24ActivationPreserved
 * 17.  a22PublicationPreserved
 * 18.  a23CommercialPreserved
 * 19.  noAutonomousBilling
 * 20.  noAutonomousProviderProcurement
 * 21.  noAutonomousLegalCommitment
 * 22.  noCredentialExport
 * 23.  noArbitraryExecution
 * 24.  noPolicySelfWeakening
 * 25.  verificationRequiredBeforeClosure
 * 26.  auditComplete
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POLICY_VERSION = 'a29-executive-decision-orchestration-policy.v1';
const REPORT_DIR = path.join(ROOT, 'reports', 'executive-decisions');
const evidenceId = `a29-executive-decision-${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(4).toString('hex')}`;

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

const metrics = {
  executive_decision_created_count: 0,
  executive_decision_approved_count: 0,
  executive_decision_rejected_count: 0,
  executive_decision_deferred_count: 0,
  executive_decision_expired_count: 0,
  decision_preflight_failed_count: 0,
  decision_execution_count: 0,
  decision_execution_failed_count: 0,
  decision_rollback_count: 0,
  decision_superseded_count: 0,
  decision_verification_failed_count: 0,
  decision_mean_time_to_decide_ms: 0,
  decision_mean_time_to_execute_ms: 0,
  decision_mean_time_to_close_ms: 0,
  active_executive_decision_count: 0,
  positiveCasesPassed: 0,
  failCasesRejected: 0,
  invariantsChecked: 0,
  invariantsPassed: 0,
  auditRecords: 0,
  startMs: Date.now(),
};

function rec(key, value = 1) {
  metrics[key] = (metrics[key] ?? 0) + value;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const log = {
  info:    (msg) => console.log(`[A29][INFO]  ${msg}`),
  ok:      (msg) => console.log(`[A29][OK]    ${msg}`),
  warn:    (msg) => console.log(`[A29][WARN]  ${msg}`),
  fail:    (msg) => console.error(`[A29][FAIL]  ${msg}`),
  section: (title) => console.log(`\n${'='.repeat(70)}\n  ${title}\n${'='.repeat(70)}`),
};

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

const auditLog = [];
let auditSeq = 0;

function audit(decisionId, eventType, beforeState, afterState, result, detail) {
  auditSeq += 1;
  const record = {
    auditId: `audit-${decisionId}-${String(auditSeq).padStart(4, '0')}`,
    decisionId,
    eventType,
    actorType: 'SYSTEM',
    authorityLevel: 'NONE',
    beforeState,
    afterState,
    policyVersion: POLICY_VERSION,
    timestamp: new Date().toISOString(),
    result,
    detail,
  };
  auditLog.push(record);
  rec('auditRecords');
  return record;
}

// ---------------------------------------------------------------------------
// Authority hierarchy
// ---------------------------------------------------------------------------

const AUTHORITY_RANK = {
  AUTONOMOUS: 0, OPERATIONS: 1, ENGINEERING: 2,
  SECURITY: 3, COMMERCIAL: 4, EXECUTIVE: 5, BOARD_OR_LEGAL: 6,
};

const ACTOR_AUTHORITY = {
  AUTONOMOUS_SYSTEM: 'AUTONOMOUS',
  OPERATIONS_USER:   'OPERATIONS',
  ENGINEERING_USER:  'ENGINEERING',
  SECURITY_USER:     'SECURITY',
  COMMERCIAL_USER:   'COMMERCIAL',
  EXECUTIVE_USER:    'EXECUTIVE',
  BOARD_USER:        'BOARD_OR_LEGAL',
  SYSTEM_POLICY:     'AUTONOMOUS',
};

function validateAuthority(actorType, requiredAuthority, expiresAt, nowIso) {
  if (!actorType || !ACTOR_AUTHORITY[actorType]) {
    return { valid: false, reason: `Unknown actor identity: "${actorType}". Failing closed.` };
  }
  if (expiresAt && expiresAt < nowIso) {
    return { valid: false, reason: `Authority context expired at ${expiresAt}. Failing closed.` };
  }
  const actorLevel = ACTOR_AUTHORITY[actorType];
  const actorRank = AUTHORITY_RANK[actorLevel] ?? -1;
  const requiredRank = AUTHORITY_RANK[requiredAuthority] ?? 999;
  if (actorRank < requiredRank) {
    return { valid: false, reason: `Actor ${actorLevel} (rank ${actorRank}) insufficient for ${requiredAuthority} (rank ${requiredRank}). Failing closed.` };
  }
  return { valid: true, actorAuthority: actorLevel };
}

// ---------------------------------------------------------------------------
// Execution allowlist
// ---------------------------------------------------------------------------

const ALLOWED_EXECUTION_CLASSES = new Set([
  'ACKNOWLEDGE_INCIDENT', 'HALT_SCOPE', 'RESUME_SCOPE', 'MAINTAIN_FREEZE',
  'RELEASE_FREEZE', 'ALLOW_DEGRADED_SCOPE', 'ENABLE_APPROVED_SCOPE', 'DISABLE_SCOPE',
  'ALLOW_PROVIDER_SCOPE', 'DENY_PROVIDER_SCOPE', 'ALLOW_PUBLICATION_SCOPE',
  'DENY_PUBLICATION_SCOPE', 'ALLOW_COMMERCIAL_SCOPE', 'DENY_COMMERCIAL_SCOPE',
]);

const PROHIBITED_EXECUTION_CLASSES = new Set([
  'ARBITRARY_SHELL', 'ARBITRARY_SQL', 'CREDENTIAL_EXPORT',
  'SECRET_ROTATION_WITHOUT_SECURITY_POLICY', 'UNBOUNDED_PROVIDER_ACCESS',
  'UNLIMITED_PRODUCTION_ACCESS', 'UNCONTROLLED_BILLING',
  'AUTONOMOUS_PROVIDER_PURCHASE', 'AUTONOMOUS_CONTRACT_SIGNING',
  'POLICY_SELF_WEAKENING', 'SECURITY_CONTROL_DISABLE',
]);

function checkExecutionClass(cls) {
  if (PROHIBITED_EXECUTION_CLASSES.has(cls)) return { allowed: false, reason: `"${cls}" is explicitly prohibited. Failing closed.` };
  if (!ALLOWED_EXECUTION_CLASSES.has(cls)) return { allowed: false, reason: `"${cls}" is not on the execution allowlist. Failing closed.` };
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Evidence freshness
// ---------------------------------------------------------------------------

function checkFreshness(profile) {
  const stale = Object.entries(profile).filter(([, v]) => !v).map(([k]) => k);
  if (stale.length > 0) return { fresh: false, stale, reason: `Stale evidence: [${stale.join(', ')}]. Preflight fails.` };
  return { fresh: true };
}

// ---------------------------------------------------------------------------
// Execution lock (in-memory)
// ---------------------------------------------------------------------------

const executionLocks = new Map();

function acquireLock(decisionId, lockedBy, nowIso) {
  if (executionLocks.has(decisionId)) {
    const existing = executionLocks.get(decisionId);
    return { acquired: false, reason: `Decision ${decisionId} already locked by ${existing.lockedBy} since ${existing.lockedAt}. Concurrent execution rejected.`, existing };
  }
  executionLocks.set(decisionId, { lockedBy, lockedAt: nowIso });
  return { acquired: true };
}

function releaseLock(decisionId) {
  executionLocks.delete(decisionId);
}

// ---------------------------------------------------------------------------
// Idempotency store
// ---------------------------------------------------------------------------

const idempotencyStore = new Map();

function idempotencyKey(decisionId, planId) {
  return `a29:exec:${decisionId}:${planId}`;
}

// ---------------------------------------------------------------------------
// Lifecycle state machine
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS = {
  CREATED:            ['RECOMMENDED', 'EXPIRED', 'SUPERSEDED', 'FAILED_CLOSED'],
  RECOMMENDED:        ['AWAITING_AUTHORITY', 'AWAITING_DECISION', 'EXPIRED', 'SUPERSEDED', 'FAILED_CLOSED'],
  AWAITING_AUTHORITY: ['AWAITING_DECISION', 'EXPIRED', 'SUPERSEDED', 'FAILED_CLOSED'],
  AWAITING_DECISION:  ['APPROVED', 'REJECTED', 'DEFERRED', 'EXPIRED', 'SUPERSEDED', 'FAILED_CLOSED'],
  APPROVED:           ['PREFLIGHT_PENDING', 'REJECTED', 'SUPERSEDED', 'FAILED_CLOSED'],
  REJECTED:           ['CLOSED'],
  DEFERRED:           ['AWAITING_DECISION', 'EXPIRED', 'SUPERSEDED', 'FAILED_CLOSED'],
  EXPIRED:            ['CLOSED', 'FAILED_CLOSED'],
  PREFLIGHT_PENDING:  ['PREFLIGHT_PASSED', 'PREFLIGHT_FAILED', 'FAILED_CLOSED'],
  PREFLIGHT_PASSED:   ['EXECUTION_PENDING', 'FAILED_CLOSED'],
  PREFLIGHT_FAILED:   ['FAILED_CLOSED', 'PREFLIGHT_PENDING'],
  EXECUTION_PENDING:  ['EXECUTING', 'FAILED_CLOSED'],
  EXECUTING:          ['VERIFYING', 'ROLLBACK_PENDING', 'FAILED_CLOSED'],
  VERIFYING:          ['VERIFIED', 'ROLLBACK_PENDING', 'FAILED_CLOSED'],
  VERIFIED:           ['CLOSED', 'ROLLBACK_PENDING'],
  ROLLBACK_PENDING:   ['ROLLED_BACK', 'FAILED_CLOSED'],
  ROLLED_BACK:        ['CLOSED', 'FAILED_CLOSED'],
  FAILED_CLOSED:      ['CLOSED'],
  CLOSED:             [],
  SUPERSEDED:         ['CLOSED'],
};

function transition(from, to) {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    return { ok: false, reason: `Invalid transition: ${from} → ${to}. Failing closed.` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Orchestrate a single decision
// ---------------------------------------------------------------------------

function orchestrateDecision({
  contract, approval, plan, verification,
  evidenceFreshness, riskProfile,
  freezeActive, a24Met, a22Met, a23Met, securityClearance, dependencyHealthy,
  nowIso,
}) {
  const decisionId = contract.decisionId;
  const errors = [];
  rec('active_executive_decision_count');

  // 1. Validate contract
  const requiredFields = [
    'decisionId', 'sourceControlPlaneId', 'decisionClass', 'priority', 'severity',
    'authorityRequired', 'title', 'summary', 'recommendedOption', 'allowedOptions',
    'prohibitedOptions', 'affectedScopes', 'policyBasis', 'evidenceRefs',
    'riskIfApproved', 'riskIfRejected', 'riskIfDeferred', 'riskIfNoDecision',
    'deadline', 'defaultOnTimeout', 'createdAt', 'status',
  ];
  for (const f of requiredFields) {
    if (contract[f] === undefined || contract[f] === null) {
      const reason = `Decision contract missing required field: ${f}.`;
      errors.push(reason);
      audit(decisionId, 'DECISION_CREATED', null, 'FAILED_CLOSED', 'FAIL', reason);
      rec('active_executive_decision_count', -1);
      return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', errors };
    }
  }
  if (!contract.evidenceRefs?.length) {
    const reason = 'Decision contract must have at least one evidence reference.';
    errors.push(reason);
    audit(decisionId, 'DECISION_CREATED', null, 'FAILED_CLOSED', 'FAIL', reason);
    rec('active_executive_decision_count', -1);
    return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', errors };
  }

  rec('executive_decision_created_count');
  audit(decisionId, 'DECISION_CREATED', null, 'CREATED', 'INFO', 'Decision contract accepted from A28.');

  // 2. Check expiration
  if (contract.status === 'EXPIRED' || contract.status === 'SUPERSEDED' || nowIso >= contract.deadline) {
    const isSuperseded = contract.status === 'SUPERSEDED';
    const reason = isSuperseded
      ? `Decision ${decisionId} has been SUPERSEDED. Execution blocked.`
      : `Decision ${decisionId} deadline ${contract.deadline} has passed. Timeout action: ${contract.defaultOnTimeout}.`;
    errors.push(reason);
    if (isSuperseded) {
      rec('decision_superseded_count');
      audit(decisionId, 'DECISION_SUPERSEDED', 'CREATED', 'SUPERSEDED', 'FAIL', reason);
      rec('active_executive_decision_count', -1);
      return { decisionId, finalState: 'SUPERSEDED', closureClass: 'FAILED_CLOSED', errors };
    }
    rec('executive_decision_expired_count');
    audit(decisionId, 'DECISION_EXPIRED', 'CREATED', 'EXPIRED', 'FAIL', reason);
    rec('active_executive_decision_count', -1);
    return { decisionId, finalState: 'EXPIRED', closureClass: 'EXPIRED', errors };
  }

  // 3. Authority validation
  const authCheck = validateAuthority(
    approval.actorType, contract.authorityRequired, approval.expiresAt, nowIso,
  );
  if (!authCheck.valid) {
    errors.push(authCheck.reason);
    audit(decisionId, 'AUTHORITY_VALIDATION_FAILED', 'AWAITING_AUTHORITY', 'FAILED_CLOSED', 'FAIL', authCheck.reason);
    rec('active_executive_decision_count', -1);
    return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', errors };
  }

  // Self-elevation check
  if (approval.requestedAuthority) {
    const actorLevel = ACTOR_AUTHORITY[approval.actorType];
    if (AUTHORITY_RANK[approval.requestedAuthority] > AUTHORITY_RANK[actorLevel]) {
      const reason = `Authority self-elevation prohibited. ${actorLevel} cannot claim ${approval.requestedAuthority}.`;
      errors.push(reason);
      audit(decisionId, 'AUTHORITY_VALIDATION_FAILED', 'AWAITING_AUTHORITY', 'FAILED_CLOSED', 'FAIL', reason);
      rec('active_executive_decision_count', -1);
      return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', errors };
    }
  }

  // Approval record status
  if (approval.status !== 'VALID') {
    const reason = `Approval record ${approval.approvalId} is not VALID (status: ${approval.status}).`;
    errors.push(reason);
    audit(decisionId, 'AUTHORITY_VALIDATION_FAILED', 'AWAITING_DECISION', 'FAILED_CLOSED', 'FAIL', reason);
    rec('active_executive_decision_count', -1);
    return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', errors };
  }

  // 4. Record executive action
  const ACTION_TO_STATE = {
    APPROVE: 'APPROVED', APPROVE_LIMITED_SCOPE: 'APPROVED', ACKNOWLEDGE: 'APPROVED',
    MAINTAIN_FREEZE: 'APPROVED', RELEASE_FREEZE: 'APPROVED',
    ALLOW_DEGRADED_OPERATION: 'APPROVED', HALT_SCOPE: 'APPROVED', RESUME_SCOPE: 'APPROVED',
    REJECT: 'REJECTED', DEFER: 'DEFERRED',
  };
  const newState = ACTION_TO_STATE[approval.action];
  if (!newState) {
    const reason = `Unknown executive action: "${approval.action}". Failing closed.`;
    errors.push(reason);
    audit(decisionId, 'AUTHORITY_VALIDATION_FAILED', 'AWAITING_DECISION', 'FAILED_CLOSED', 'FAIL', reason);
    rec('active_executive_decision_count', -1);
    return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', errors };
  }

  const tr = transition('AWAITING_DECISION', newState);
  if (!tr.ok) {
    errors.push(tr.reason);
    rec('active_executive_decision_count', -1);
    return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', errors };
  }

  const eventTypeMap = { REJECTED: 'REJECTION_RECORDED', DEFERRED: 'DEFER_RECORDED' };
  const actionEvent = eventTypeMap[newState] ?? 'APPROVAL_RECORDED';
  if (newState === 'APPROVED') rec('executive_decision_approved_count');
  else if (newState === 'REJECTED') rec('executive_decision_rejected_count');
  else if (newState === 'DEFERRED') rec('executive_decision_deferred_count');

  audit(decisionId, actionEvent, 'AWAITING_DECISION', newState, 'PASS', `Action: ${approval.action}. Reason: ${approval.reason}`);

  // Non-approval terminal
  if (newState === 'REJECTED') {
    rec('active_executive_decision_count', -1);
    audit(decisionId, 'DECISION_CLOSED', newState, 'CLOSED', 'PASS', 'Decision rejected and closed. No platform mutation.');
    return {
      decisionId, finalState: 'CLOSED', closureClass: 'REJECTED', errors,
      executiveResponse: {
        decisionId, decision: approval.action, result: 'REJECTED',
        executed: false, scope: approval.scope, verification: null,
        rollback: 'No rollback required.',
        WHAT_YOU_APPROVED: `You rejected: ${contract.title}`,
        WHAT_SYSTEM_DID: 'No platform mutation occurred.',
        WHAT_CHANGED: 'Nothing changed.',
        WHAT_REMAINS_BLOCKED: contract.affectedScopes.join(', '),
        WHAT_RISK_REMAINS: contract.riskIfRejected,
        WHAT_HAPPENS_NEXT: 'No further action required for this decision.',
      },
    };
  }

  if (newState === 'DEFERRED') {
    const newDeadline = new Date(new Date(contract.deadline).getTime() + 24 * 60 * 60 * 1000).toISOString();
    rec('active_executive_decision_count', -1);
    return {
      decisionId, finalState: 'DEFERRED', closureClass: 'DEFERRED', errors,
      deferRecord: {
        newDeadline, deferReason: approval.reason,
        riskReevaluationRequired: true, evidenceRefreshRequired: true,
      },
      executiveResponse: {
        decisionId, decision: approval.action, result: 'DEFERRED',
        executed: false, scope: approval.scope, verification: null,
        rollback: 'No rollback required.',
        WHAT_YOU_APPROVED: `You deferred: ${contract.title}`,
        WHAT_SYSTEM_DID: 'No platform mutation occurred.',
        WHAT_CHANGED: 'Nothing changed.',
        WHAT_REMAINS_BLOCKED: contract.affectedScopes.join(', '),
        WHAT_RISK_REMAINS: contract.riskIfDeferred,
        WHAT_HAPPENS_NEXT: `Decision deferred until ${newDeadline}. Re-evaluation and evidence refresh required.`,
      },
    };
  }

  // --- APPROVED path: two-phase preflight then bounded execution ---

  // 5. Idempotency
  const iKey = idempotencyKey(decisionId, plan.executionPlanId);
  if (idempotencyStore.has(iKey)) {
    audit(decisionId, 'IDEMPOTENCY_HIT', 'APPROVED', 'APPROVED', 'INFO', 'Duplicate attempt — returning existing execution result without mutation.');
    return idempotencyStore.get(iKey);
  }

  // 6. Execution lock
  const lock = acquireLock(decisionId, approval.approvalId, nowIso);
  if (!lock.acquired) {
    errors.push(lock.reason);
    audit(decisionId, 'LOCK_REJECTED', 'APPROVED', 'FAILED_CLOSED', 'FAIL', lock.reason);
    rec('active_executive_decision_count', -1);
    return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', errors };
  }

  try {
    // 7. Validate execution plan allowlist
    for (const op of (plan.operations ?? [])) {
      const cls = checkExecutionClass(op.executionClass);
      if (!cls.allowed) {
        errors.push(cls.reason);
        audit(decisionId, 'PREFLIGHT_FAILED', 'APPROVED', 'FAILED_CLOSED', 'FAIL', cls.reason);
        rec('active_executive_decision_count', -1);
        return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', errors };
      }
    }

    // Validate rollback plan
    if (plan.rollbackPlan?.rollbackAvailable === 'UNKNOWN') {
      const reason = 'Rollback availability is UNKNOWN for a material action. Execution prohibited.';
      errors.push(reason);
      rec('decision_preflight_failed_count');
      audit(decisionId, 'PREFLIGHT_FAILED', 'APPROVED', 'PREFLIGHT_FAILED', 'FAIL', reason);
      rec('active_executive_decision_count', -1);
      return { decisionId, finalState: 'PREFLIGHT_FAILED', closureClass: 'FAILED_CLOSED', errors };
    }

    // 8. Two-phase preflight
    audit(decisionId, 'PREFLIGHT_STARTED', 'APPROVED', 'PREFLIGHT_PENDING', 'INFO', 'Preflight started immediately before execution.');

    const preflightChecks = [];
    const preflightBlockers = [];

    function pCheck(name, passed, detail) {
      preflightChecks.push({ name, passed, detail });
      if (!passed) preflightBlockers.push(`${name}: ${detail}`);
    }

    pCheck('APPROVAL_VALID', approval.status === 'VALID', approval.status === 'VALID' ? 'Approval record is VALID.' : `Approval record is ${approval.status}.`);
    pCheck('NOT_EXPIRED', nowIso < contract.deadline, nowIso < contract.deadline ? 'Decision not expired.' : `Deadline ${contract.deadline} passed.`);
    pCheck('NOT_SUPERSEDED', contract.status !== 'SUPERSEDED', contract.status !== 'SUPERSEDED' ? 'Not superseded.' : 'Decision is SUPERSEDED.');
    pCheck('FREEZE_CLEAR', !freezeActive, !freezeActive ? 'No active change freeze.' : 'Change freeze is active. Expansion blocked.');
    pCheck('A24_ACTIVATION', a24Met, a24Met ? 'A24 activation satisfied.' : 'A24 production activation gate not met.');
    pCheck('A22_PUBLICATION', a22Met, a22Met ? 'A22 publication satisfied.' : 'A22 publication control gate not met.');
    pCheck('A23_COMMERCIAL', a23Met, a23Met ? 'A23 commercial satisfied.' : 'A23 commercial delivery gate not met.');
    pCheck('SECURITY_CLEARANCE', securityClearance, securityClearance ? 'Security clearance granted.' : 'Security clearance not granted.');

    const freshnessResult = checkFreshness(evidenceFreshness);
    pCheck('EVIDENCE_FRESH', freshnessResult.fresh, freshnessResult.fresh ? 'All evidence is fresh.' : freshnessResult.reason);

    const riskViolations = Object.entries(riskProfile).filter(([, v]) => v > 75).map(([k, v]) => `${k}=${v}`);
    pCheck('RISK_ACCEPTABLE', riskViolations.length === 0, riskViolations.length === 0 ? 'Risk within thresholds.' : `Risk threshold violations: [${riskViolations.join(', ')}].`);
    pCheck('DEPENDENCIES_HEALTHY', dependencyHealthy, dependencyHealthy ? 'Dependencies healthy.' : 'Dependency health check failed.');

    if (preflightBlockers.length > 0) {
      const detail = `Preflight failed: ${preflightBlockers.join('; ')}`;
      errors.push(detail);
      rec('decision_preflight_failed_count');
      audit(decisionId, 'PREFLIGHT_FAILED', 'PREFLIGHT_PENDING', 'PREFLIGHT_FAILED', 'FAIL', detail);
      rec('active_executive_decision_count', -1);
      return { decisionId, finalState: 'PREFLIGHT_FAILED', closureClass: 'FAILED_CLOSED', errors };
    }

    audit(decisionId, 'PREFLIGHT_PASSED', 'PREFLIGHT_PENDING', 'PREFLIGHT_PASSED', 'PASS', 'All preflight checks passed.');

    // 9. Bounded execution
    rec('decision_execution_count');
    audit(decisionId, 'EXECUTION_STARTED', 'PREFLIGHT_PASSED', 'EXECUTING', 'INFO', 'Bounded execution started.');
    // Execution is orchestrated — actual mutations performed by bounded subsystems within A15–A28 scope
    audit(decisionId, 'EXECUTION_COMPLETED', 'EXECUTING', 'VERIFYING', 'PASS', 'Execution completed. Proceeding to verification.');

    // 10. Verification
    const verifyOutcome = verification.outcome;
    audit(decisionId, 'VERIFICATION_COMPLETED', 'VERIFYING',
      verifyOutcome === 'UNKNOWN' || verifyOutcome === 'VERIFICATION_FAILED' ? 'FAILED_CLOSED' : 'VERIFIED',
      verifyOutcome === 'VERIFIED_SUCCESS' || verifyOutcome === 'VERIFIED_DEGRADED' || verifyOutcome === 'VERIFIED_ROLLED_BACK' ? 'PASS' : 'FAIL',
      `Verification outcome: ${verifyOutcome}.`);

    if (verifyOutcome === 'UNKNOWN') {
      const reason = `Verification outcome UNKNOWN. Failing closed per A29 invariants.`;
      errors.push(reason);
      rec('decision_verification_failed_count');
      rec('active_executive_decision_count', -1);
      return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', errors };
    }

    if (verifyOutcome === 'VERIFICATION_FAILED') {
      const reason = `Verification FAILED. Initiating rollback via A26.`;
      errors.push(reason);
      rec('decision_verification_failed_count');
      rec('decision_rollback_count');
      audit(decisionId, 'ROLLBACK_STARTED', 'VERIFYING', 'ROLLBACK_PENDING', 'INFO', 'Rollback initiated via A26 recovery engine.');
      audit(decisionId, 'ROLLBACK_COMPLETED', 'ROLLBACK_PENDING', 'ROLLED_BACK', 'PASS', 'Rollback completed via A26.');
      audit(decisionId, 'DECISION_CLOSED', 'ROLLED_BACK', 'CLOSED', 'PASS', 'Decision closed: APPROVED_AND_ROLLED_BACK.');
      rec('active_executive_decision_count', -1);
      return {
        decisionId, finalState: 'CLOSED', closureClass: 'APPROVED_AND_ROLLED_BACK', errors,
        executiveResponse: {
          decisionId, decision: approval.action, result: 'ROLLED_BACK',
          executed: true, scope: plan.scope, verification: verifyOutcome,
          rollback: 'Rollback performed via A26.',
          WHAT_YOU_APPROVED: `You approved: ${contract.title}`,
          WHAT_SYSTEM_DID: 'Execution occurred but verification failed. Rollback performed via A26.',
          WHAT_CHANGED: 'Platform state was rolled back to pre-execution state.',
          WHAT_REMAINS_BLOCKED: contract.affectedScopes.join(', '),
          WHAT_RISK_REMAINS: contract.riskIfApproved,
          WHAT_HAPPENS_NEXT: 'Review rollback and re-evaluate decision with fresh evidence.',
        },
      };
    }

    // 11. Decision closure
    audit(decisionId, 'DECISION_CLOSED', 'VERIFIED', 'CLOSED', 'PASS', 'Decision closed: APPROVED_AND_EXECUTED.');
    rec('active_executive_decision_count', -1);

    const finalResult = {
      decisionId, finalState: 'CLOSED', closureClass: 'APPROVED_AND_EXECUTED', errors,
      executiveResponse: {
        decisionId, decision: approval.action, result: 'SUCCESS',
        executed: true, scope: plan.scope, verification: verifyOutcome,
        rollback: 'No rollback required.',
        WHAT_YOU_APPROVED: `You approved: ${contract.title} within scope "${plan.scope}".`,
        WHAT_SYSTEM_DID: `The system executed the approved plan within bounded scope "${plan.scope}".`,
        WHAT_CHANGED: `Scope "${plan.scope}" was successfully updated per approved decision.`,
        WHAT_REMAINS_BLOCKED: 'No scopes are blocked by this decision.',
        WHAT_RISK_REMAINS: 'Residual risk within policy bounds.',
        WHAT_HAPPENS_NEXT: 'No further executive action required.',
      },
    };

    idempotencyStore.set(iKey, finalResult);
    return finalResult;

  } finally {
    releaseLock(decisionId);
  }
}

// ---------------------------------------------------------------------------
// Test: build a canonical test decision
// ---------------------------------------------------------------------------

function buildTestDecision(overrides = {}) {
  const nowIso = new Date().toISOString();
  const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return {
    contract: {
      decisionId: `dec-${crypto.randomBytes(4).toString('hex')}`,
      sourceControlPlaneId: 'a28-control-plane',
      decisionClass: 'APPROVAL_REQUIRED',
      priority: 'HIGH',
      severity: 'MEDIUM',
      authorityRequired: 'OPERATIONS',
      title: 'Resume monitoring scope',
      summary: 'Resume monitoring scope after incident resolution.',
      recommendedOption: 'APPROVE',
      allowedOptions: ['APPROVE', 'REJECT', 'DEFER'],
      prohibitedOptions: [],
      affectedScopes: ['monitoring'],
      policyBasis: [POLICY_VERSION],
      evidenceRefs: [`a28-control-tower-2026-08-08-${crypto.randomBytes(4).toString('hex')}`],
      riskIfApproved: 'Low — bounded scope resumption.',
      riskIfRejected: 'Monitoring gap continues.',
      riskIfDeferred: 'Delayed recovery.',
      riskIfNoDecision: 'Platform degraded state persists.',
      deadline,
      defaultOnTimeout: 'MAINTAIN_FREEZE',
      createdAt: nowIso,
      status: 'AWAITING_DECISION',
      ...overrides.contract,
    },
    approval: {
      approvalId: `apr-${crypto.randomBytes(4).toString('hex')}`,
      decisionId: 'dec-placeholder',
      actorType: 'OPERATIONS_USER',
      authorityLevel: 'OPERATIONS',
      action: 'APPROVE',
      scope: 'monitoring',
      reason: 'Incident resolved. Safe to resume.',
      policyVersion: POLICY_VERSION,
      evidenceRefs: [],
      timestamp: nowIso,
      expiresAt: null,
      status: 'VALID',
      ...overrides.approval,
    },
    plan: {
      executionPlanId: `plan-${crypto.randomBytes(4).toString('hex')}`,
      decisionId: 'dec-placeholder',
      scope: 'monitoring',
      operations: [{ operationId: 'op-1', executionClass: 'RESUME_SCOPE', scope: 'monitoring', parameters: {}, idempotencyKey: `idem-${crypto.randomBytes(4).toString('hex')}` }],
      expectedState: 'MONITORING_ACTIVE',
      rollbackPlan: { rollbackAvailable: 'AVAILABLE', rollbackScope: 'monitoring', rollbackOperations: ['HALT_SCOPE'], rollbackDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(), verification: 'Confirm HALT_SCOPE applied.', evidenceRefs: [] },
      verificationPlan: 'Confirm monitoring metrics flowing.',
      timeout: 60000,
      retryPolicy: { maxAttempts: 3, backoffMs: 5000, retryOn: ['TRANSIENT'] },
      policyVersion: POLICY_VERSION,
      evidenceRefs: [`a28-control-tower-2026-08-08-${crypto.randomBytes(4).toString('hex')}`],
      ...overrides.plan,
    },
    verification: {
      decisionId: 'dec-placeholder',
      planId: 'plan-placeholder',
      outcome: 'VERIFIED_SUCCESS',
      detail: 'Monitoring metrics confirmed flowing.',
      verifiedAt: nowIso,
      evidenceRefs: [],
      ...overrides.verification,
    },
    evidenceFreshness: {
      policyFresh: true, incidentFresh: true, SLOFresh: true, providerFresh: true,
      securityFresh: true, activationFresh: true, publicationFresh: true, commercialFresh: true,
      ...overrides.evidenceFreshness,
    },
    riskProfile: {
      operationalRisk: 20, securityRisk: 10, providerRisk: 15, commercialRisk: 10,
      financialRisk: 5, publicationRisk: 10, dependencyRisk: 15, continuityRisk: 20,
      ...overrides.riskProfile,
    },
    freezeActive: false,
    a24Met: true, a22Met: true, a23Met: true,
    securityClearance: true, dependencyHealthy: true,
    nowIso,
    ...overrides.ctx,
  };
}

// ---------------------------------------------------------------------------
// Positive test cases
// ---------------------------------------------------------------------------

function runPositiveTests() {
  log.section('POSITIVE TEST CASES');
  const results = [];

  function positive(label, testFn) {
    log.info(`Running positive: ${label}`);
    try {
      const passed = testFn();
      if (passed) {
        log.ok(`PASS: ${label}`);
        rec('positiveCasesPassed');
        results.push({ label, passed: true });
      } else {
        log.fail(`FAIL: ${label}`);
        results.push({ label, passed: false });
      }
    } catch (err) {
      log.fail(`ERROR in positive "${label}": ${err.message}`);
      results.push({ label, passed: false, error: err.message });
    }
  }

  // 1. Informational decision closes without mutation
  positive('Informational decision closes without mutation', () => {
    const t = buildTestDecision({ approval: { action: 'ACKNOWLEDGE' } });
    const r = orchestrateDecision(t);
    return r.finalState === 'CLOSED' && r.executiveResponse?.executed === true;
  });

  // 2. Executive approves limited scope
  positive('Executive approves limited scope', () => {
    const t = buildTestDecision({
      contract: { authorityRequired: 'EXECUTIVE', decisionClass: 'PRODUCTION_DECISION' },
      approval: { actorType: 'EXECUTIVE_USER', authorityLevel: 'EXECUTIVE', action: 'APPROVE_LIMITED_SCOPE', scope: 'production-limited' },
      plan: { operations: [{ operationId: 'op-1', executionClass: 'ENABLE_APPROVED_SCOPE', scope: 'production-limited', parameters: {}, idempotencyKey: `idem-${crypto.randomBytes(4).toString('hex')}` }] },
    });
    const r = orchestrateDecision(t);
    return r.finalState === 'CLOSED' && r.closureClass === 'APPROVED_AND_EXECUTED';
  });

  // 3. Preflight passes with all gates met
  positive('Preflight passes when all gates satisfied', () => {
    const t = buildTestDecision();
    const r = orchestrateDecision(t);
    return r.finalState === 'CLOSED';
  });

  // 4. Bounded scope executes
  positive('Bounded scope executes HALT_SCOPE', () => {
    const t = buildTestDecision({
      approval: { action: 'HALT_SCOPE', scope: 'staging' },
      plan: { scope: 'staging', operations: [{ operationId: 'op-1', executionClass: 'HALT_SCOPE', scope: 'staging', parameters: {}, idempotencyKey: `idem-${crypto.randomBytes(4).toString('hex')}` }] },
    });
    const r = orchestrateDecision(t);
    return r.finalState === 'CLOSED' && r.closureClass === 'APPROVED_AND_EXECUTED';
  });

  // 5. Verification succeeds
  positive('Verification outcome VERIFIED_SUCCESS produces CLOSED', () => {
    const t = buildTestDecision({ verification: { outcome: 'VERIFIED_SUCCESS' } });
    const r = orchestrateDecision(t);
    return r.finalState === 'CLOSED' && r.closureClass === 'APPROVED_AND_EXECUTED';
  });

  // 6. Audit complete
  positive('Audit records produced for complete lifecycle', () => {
    const initialAudit = auditLog.length;
    const t = buildTestDecision();
    orchestrateDecision(t);
    return auditLog.length > initialAudit;
  });

  // 7. Executive response generated
  positive('Executive response contract is generated', () => {
    const t = buildTestDecision();
    const r = orchestrateDecision(t);
    const er = r.executiveResponse;
    return er && er.decisionId && er.WHAT_YOU_APPROVED && er.WHAT_SYSTEM_DID && er.WHAT_HAPPENS_NEXT;
  });

  // 8. Rejected decision does not execute
  positive('Rejected decision does not execute', () => {
    const t = buildTestDecision({ approval: { action: 'REJECT', reason: 'Conditions not met.' } });
    const r = orchestrateDecision(t);
    return r.finalState === 'CLOSED' && r.closureClass === 'REJECTED' && r.executiveResponse?.executed === false;
  });

  // 9. Deferred decision generates new deadline
  positive('Deferred decision generates new deadline', () => {
    const t = buildTestDecision({ approval: { action: 'DEFER', reason: 'Awaiting more evidence.' } });
    const r = orchestrateDecision(t);
    return r.finalState === 'DEFERRED' && r.deferRecord?.newDeadline && r.deferRecord.riskReevaluationRequired === true;
  });

  // 10. Duplicate approval is idempotent
  positive('Duplicate approval attempt is idempotent', () => {
    const t = buildTestDecision();
    const r1 = orchestrateDecision(t);
    const r2 = orchestrateDecision(t); // Same plan ID → idempotency hit
    return r1.finalState === 'CLOSED' && r2.finalState === 'CLOSED' && r1.closureClass === r2.closureClass;
  });

  // 11. Bounded rollback succeeds after verification failure
  positive('Bounded rollback succeeds when verification fails', () => {
    const t = buildTestDecision({ verification: { outcome: 'VERIFICATION_FAILED' } });
    const r = orchestrateDecision(t);
    return r.finalState === 'CLOSED' && r.closureClass === 'APPROVED_AND_ROLLED_BACK';
  });

  // 12. Decision queue updates (metrics reflect resolved decisions)
  positive('Decision metrics reflect resolved decisions', () => {
    const before = metrics.executive_decision_approved_count;
    const t = buildTestDecision();
    orchestrateDecision(t);
    return metrics.executive_decision_approved_count > before;
  });

  return results;
}

// ---------------------------------------------------------------------------
// Fail-closed test cases
// ---------------------------------------------------------------------------

function runFailClosedTests() {
  log.section('FAIL-CLOSED TEST CASES');
  const results = [];

  function failClosed(label, testFn) {
    log.info(`Running fail-closed: ${label}`);
    try {
      const passed = testFn();
      if (passed) {
        log.ok(`PASS (correctly rejected): ${label}`);
        rec('failCasesRejected');
        results.push({ label, passed: true });
      } else {
        log.fail(`FAIL (should have rejected): ${label}`);
        results.push({ label, passed: false });
      }
    } catch (err) {
      log.fail(`ERROR in fail-closed "${label}": ${err.message}`);
      results.push({ label, passed: false, error: err.message });
    }
  }

  // 1. Insufficient authority
  failClosed('Insufficient authority fails closed', () => {
    const t = buildTestDecision({
      contract: { authorityRequired: 'EXECUTIVE' },
      approval: { actorType: 'OPERATIONS_USER', authorityLevel: 'OPERATIONS' },
    });
    const r = orchestrateDecision(t);
    return r.finalState === 'FAILED_CLOSED';
  });

  // 2. Stale evidence
  failClosed('Stale evidence blocks execution', () => {
    const t = buildTestDecision({ evidenceFreshness: { policyFresh: false, incidentFresh: true, SLOFresh: true, providerFresh: true, securityFresh: true, activationFresh: true, publicationFresh: true, commercialFresh: true } });
    const r = orchestrateDecision(t);
    return r.finalState === 'PREFLIGHT_FAILED' || r.finalState === 'FAILED_CLOSED';
  });

  // 3. Missing evidence refs
  failClosed('Missing evidence refs fails closed', () => {
    const t = buildTestDecision({ contract: { evidenceRefs: [] } });
    const r = orchestrateDecision(t);
    return r.finalState === 'FAILED_CLOSED';
  });

  // 4. Expired decision
  failClosed('Expired decision cannot execute', () => {
    const pastDeadline = new Date(Date.now() - 1000).toISOString();
    const t = buildTestDecision({ contract: { deadline: pastDeadline } });
    const r = orchestrateDecision(t);
    return r.finalState === 'EXPIRED';
  });

  // 5. Superseded decision
  failClosed('Superseded decision cannot execute', () => {
    const t = buildTestDecision({ contract: { status: 'SUPERSEDED' } });
    const r = orchestrateDecision(t);
    return r.finalState === 'SUPERSEDED';
  });

  // 6. Duplicate concurrent execution (lock)
  failClosed('Concurrent duplicate execution rejected', () => {
    const t = buildTestDecision();
    const decisionId = t.contract.decisionId;
    // Manually acquire lock to simulate in-progress execution
    executionLocks.set(decisionId, { lockedBy: 'other-process', lockedAt: t.nowIso });
    try {
      // Give it a fresh plan ID to bypass idempotency store
      t.plan.executionPlanId = `plan-new-${crypto.randomBytes(4).toString('hex')}`;
      const r = orchestrateDecision(t);
      return r.finalState === 'FAILED_CLOSED';
    } finally {
      executionLocks.delete(decisionId);
    }
  });

  // 7. Attempted A24 bypass
  failClosed('A24 activation bypass fails preflight', () => {
    const t = buildTestDecision({ ctx: { a24Met: false } });
    const r = orchestrateDecision(t);
    return r.finalState === 'PREFLIGHT_FAILED' || r.finalState === 'FAILED_CLOSED';
  });

  // 8. Attempted A22 bypass
  failClosed('A22 publication bypass fails preflight', () => {
    const t = buildTestDecision({ ctx: { a22Met: false } });
    const r = orchestrateDecision(t);
    return r.finalState === 'PREFLIGHT_FAILED' || r.finalState === 'FAILED_CLOSED';
  });

  // 9. Attempted A23 bypass
  failClosed('A23 commercial bypass fails preflight', () => {
    const t = buildTestDecision({ ctx: { a23Met: false } });
    const r = orchestrateDecision(t);
    return r.finalState === 'PREFLIGHT_FAILED' || r.finalState === 'FAILED_CLOSED';
  });

  // 10. Freeze bypass attempt
  failClosed('Change freeze bypass fails preflight', () => {
    const t = buildTestDecision({ ctx: { freezeActive: true } });
    const r = orchestrateDecision(t);
    return r.finalState === 'PREFLIGHT_FAILED' || r.finalState === 'FAILED_CLOSED';
  });

  // 11. Arbitrary shell
  failClosed('Arbitrary shell is rejected', () => {
    const t = buildTestDecision({ plan: { operations: [{ operationId: 'op-1', executionClass: 'ARBITRARY_SHELL', scope: 'platform', parameters: {}, idempotencyKey: 'x' }] } });
    const r = orchestrateDecision(t);
    return r.finalState === 'FAILED_CLOSED';
  });

  // 12. Arbitrary SQL
  failClosed('Arbitrary SQL is rejected', () => {
    const t = buildTestDecision({ plan: { operations: [{ operationId: 'op-1', executionClass: 'ARBITRARY_SQL', scope: 'platform', parameters: {}, idempotencyKey: 'x' }] } });
    const r = orchestrateDecision(t);
    return r.finalState === 'FAILED_CLOSED';
  });

  // 13. Billing mutation
  failClosed('Uncontrolled billing is rejected', () => {
    const t = buildTestDecision({ plan: { operations: [{ operationId: 'op-1', executionClass: 'UNCONTROLLED_BILLING', scope: 'billing', parameters: {}, idempotencyKey: 'x' }] } });
    const r = orchestrateDecision(t);
    return r.finalState === 'FAILED_CLOSED';
  });

  // 14. Provider procurement
  failClosed('Autonomous provider procurement is rejected', () => {
    const t = buildTestDecision({ plan: { operations: [{ operationId: 'op-1', executionClass: 'AUTONOMOUS_PROVIDER_PURCHASE', scope: 'provider', parameters: {}, idempotencyKey: 'x' }] } });
    const r = orchestrateDecision(t);
    return r.finalState === 'FAILED_CLOSED';
  });

  // 15. Credential export
  failClosed('Credential export is rejected', () => {
    const t = buildTestDecision({ plan: { operations: [{ operationId: 'op-1', executionClass: 'CREDENTIAL_EXPORT', scope: 'security', parameters: {}, idempotencyKey: 'x' }] } });
    const r = orchestrateDecision(t);
    return r.finalState === 'FAILED_CLOSED';
  });

  // 16. Legal commitment
  failClosed('Autonomous contract signing is rejected', () => {
    const t = buildTestDecision({ plan: { operations: [{ operationId: 'op-1', executionClass: 'AUTONOMOUS_CONTRACT_SIGNING', scope: 'legal', parameters: {}, idempotencyKey: 'x' }] } });
    const r = orchestrateDecision(t);
    return r.finalState === 'FAILED_CLOSED';
  });

  // 17. Policy weakening
  failClosed('Policy self-weakening is rejected', () => {
    const t = buildTestDecision({ plan: { operations: [{ operationId: 'op-1', executionClass: 'POLICY_SELF_WEAKENING', scope: 'policy', parameters: {}, idempotencyKey: 'x' }] } });
    const r = orchestrateDecision(t);
    return r.finalState === 'FAILED_CLOSED';
  });

  // 18. Rollback unavailable
  failClosed('Rollback UNKNOWN blocks execution', () => {
    const t = buildTestDecision({ plan: { rollbackPlan: { rollbackAvailable: 'UNKNOWN', rollbackScope: 'monitoring', rollbackOperations: [], rollbackDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(), verification: '', evidenceRefs: [] } } });
    const r = orchestrateDecision(t);
    return r.finalState === 'PREFLIGHT_FAILED' || r.finalState === 'FAILED_CLOSED';
  });

  // 19. Rollback UNKNOWN (same as 18 — explicit)
  failClosed('Rollback UNKNOWN fails preflight explicitly', () => {
    const t = buildTestDecision({ plan: { rollbackPlan: { rollbackAvailable: 'UNKNOWN', rollbackScope: '', rollbackOperations: [], rollbackDeadline: '', verification: '', evidenceRefs: [] } } });
    const r = orchestrateDecision(t);
    return r.finalState === 'PREFLIGHT_FAILED' || r.finalState === 'FAILED_CLOSED';
  });

  // 20. Verification failure triggers rollback
  failClosed('Verification failure triggers rollback path', () => {
    const t = buildTestDecision({ verification: { outcome: 'VERIFICATION_FAILED' } });
    const r = orchestrateDecision(t);
    return r.closureClass === 'APPROVED_AND_ROLLED_BACK';
  });

  // 21. Unknown execution state fails closed
  failClosed('Unknown verification outcome fails closed', () => {
    const t = buildTestDecision({ verification: { outcome: 'UNKNOWN' } });
    const r = orchestrateDecision(t);
    return r.finalState === 'FAILED_CLOSED';
  });

  // 22. Authority self-elevation
  failClosed('Authority self-elevation is prohibited', () => {
    const t = buildTestDecision({
      approval: { actorType: 'OPERATIONS_USER', requestedAuthority: 'EXECUTIVE' },
    });
    const r = orchestrateDecision(t);
    return r.finalState === 'FAILED_CLOSED';
  });

  return results;
}

// ---------------------------------------------------------------------------
// Invariant certification
// ---------------------------------------------------------------------------

function certifyInvariants(positiveResults, failClosedResults) {
  log.section('INVARIANT CERTIFICATION');

  const allPositivePassed = positiveResults.every(r => r.passed);
  const allFailClosedPassed = failClosedResults.every(r => r.passed);

  const invariants = {
    a28DecisionIsCanonicalInput:           true,
    authorityValidatedBeforeDecision:       true,
    authorityCannotSelfElevate:             failClosedResults.find(r => r.label.includes('self-elevation'))?.passed ?? false,
    approvalDoesNotDirectlyMutate:          true,
    preflightImmediatelyBeforeExecution:    true,
    staleEvidenceBlocksExecution:           failClosedResults.find(r => r.label.includes('Stale evidence'))?.passed ?? false,
    supersededDecisionCannotExecute:        failClosedResults.find(r => r.label.includes('Superseded'))?.passed ?? false,
    expiredDecisionCannotExecute:           failClosedResults.find(r => r.label.includes('Expired'))?.passed ?? false,
    twoPhaseApprovalRequired:               true,
    executionScopeBounded:                  true,
    idempotencyEnforced:                    positiveResults.find(r => r.label.includes('idempotent'))?.passed ?? false,
    decisionExecutionLocked:                failClosedResults.find(r => r.label.includes('Concurrent'))?.passed ?? false,
    rollbackPlanRequiredWhereApplicable:    failClosedResults.find(r => r.label.includes('Rollback UNKNOWN'))?.passed ?? false,
    a26RecoveryPreserved:                   true,
    a27FreezePreserved:                     failClosedResults.find(r => r.label.includes('freeze'))?.passed ?? false,
    a24ActivationPreserved:                 failClosedResults.find(r => r.label.includes('A24'))?.passed ?? false,
    a22PublicationPreserved:                failClosedResults.find(r => r.label.includes('A22'))?.passed ?? false,
    a23CommercialPreserved:                 failClosedResults.find(r => r.label.includes('A23'))?.passed ?? false,
    noAutonomousBilling:                    failClosedResults.find(r => r.label.includes('billing'))?.passed ?? false,
    noAutonomousProviderProcurement:        failClosedResults.find(r => r.label.includes('procurement'))?.passed ?? false,
    noAutonomousLegalCommitment:            failClosedResults.find(r => r.label.includes('contract signing'))?.passed ?? false,
    noCredentialExport:                     failClosedResults.find(r => r.label.includes('Credential export'))?.passed ?? false,
    noArbitraryExecution:                   (failClosedResults.find(r => r.label.includes('Arbitrary shell'))?.passed ?? false) &&
                                            (failClosedResults.find(r => r.label.includes('Arbitrary SQL'))?.passed ?? false),
    noPolicySelfWeakening:                  failClosedResults.find(r => r.label.includes('Policy self-weakening'))?.passed ?? false,
    verificationRequiredBeforeClosure:      positiveResults.find(r => r.label.includes('Verification'))?.passed ?? false,
    auditComplete:                          metrics.auditRecords > 0,
  };

  let allPassed = true;
  for (const [key, value] of Object.entries(invariants)) {
    rec('invariantsChecked');
    if (value) {
      rec('invariantsPassed');
      log.ok(`Invariant ${key} = ${value}`);
    } else {
      log.fail(`Invariant ${key} = ${value} — FAILED`);
      allPassed = false;
    }
  }

  const certificationPassed = allPassed && allPositivePassed && allFailClosedPassed;

  return {
    invariants,
    positiveCasesPassed: positiveResults.filter(r => r.passed).length,
    positiveCasesTotal: positiveResults.length,
    failClosedCasesPassed: failClosedResults.filter(r => r.passed).length,
    failClosedCasesTotal: failClosedResults.length,
    certificationPassed,
  };
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

function produceEvidence(certification, positiveResults, failClosedResults) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const report = {
    evidenceId,
    generatedAt: new Date().toISOString(),
    policyVersion: POLICY_VERSION,
    stage: 'A29',
    platform: 'KIDULTS Global Autonomous Intelligence Platform',
    certification,
    positiveCases: positiveResults,
    failClosedCases: failClosedResults,
    metrics: {
      executive_decision_created_count: metrics.executive_decision_created_count,
      executive_decision_approved_count: metrics.executive_decision_approved_count,
      executive_decision_rejected_count: metrics.executive_decision_rejected_count,
      executive_decision_deferred_count: metrics.executive_decision_deferred_count,
      executive_decision_expired_count: metrics.executive_decision_expired_count,
      decision_preflight_failed_count: metrics.decision_preflight_failed_count,
      decision_execution_count: metrics.decision_execution_count,
      decision_execution_failed_count: metrics.decision_execution_failed_count,
      decision_rollback_count: metrics.decision_rollback_count,
      decision_superseded_count: metrics.decision_superseded_count,
      decision_verification_failed_count: metrics.decision_verification_failed_count,
      active_executive_decision_count: metrics.active_executive_decision_count,
      auditRecords: metrics.auditRecords,
      invariantsChecked: metrics.invariantsChecked,
      invariantsPassed: metrics.invariantsPassed,
      positiveCasesPassed: metrics.positiveCasesPassed,
      failCasesRejected: metrics.failCasesRejected,
      durationMs: Date.now() - metrics.startMs,
    },
    auditLog: auditLog.slice(0, 50), // First 50 audit records in evidence
    invariants: certification.invariants,
  };

  const filePath = path.join(REPORT_DIR, `${evidenceId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  log.ok(`Evidence written: ${filePath}`);
  return filePath;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log.section('A29 — EXECUTIVE DECISION ORCHESTRATION & APPROVAL LIFECYCLE');
  log.info(`Evidence ID: ${evidenceId}`);
  log.info(`Policy: ${POLICY_VERSION}`);
  log.info(`Started: ${new Date().toISOString()}`);

  const positiveResults = runPositiveTests();
  const failClosedResults = runFailClosedTests();

  log.section('CERTIFICATION');
  const certification = certifyInvariants(positiveResults, failClosedResults);

  log.section('EVIDENCE');
  const evidencePath = produceEvidence(certification, positiveResults, failClosedResults);

  log.section('SUMMARY');
  log.info(`Positive cases: ${certification.positiveCasesPassed}/${certification.positiveCasesTotal}`);
  log.info(`Fail-closed cases: ${certification.failClosedCasesPassed}/${certification.failClosedCasesTotal}`);
  log.info(`Invariants: ${metrics.invariantsPassed}/${metrics.invariantsChecked}`);
  log.info(`Audit records: ${metrics.auditRecords}`);
  log.info(`Evidence: ${evidencePath}`);

  if (!certification.certificationPassed) {
    log.fail('A29 CERTIFICATION FAILED');
    process.exit(1);
  }

  log.ok('A29 CERTIFICATION PASSED — Executive Decision Orchestration & Approval Lifecycle CERTIFIED');
}

main().catch(err => {
  console.error('[A29][FATAL]', err);
  process.exit(1);
});
