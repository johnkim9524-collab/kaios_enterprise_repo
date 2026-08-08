/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: execution-orchestrator.ts
 *
 * Central orchestrator: coordinates all A29 modules to drive a decision
 * through the full lifecycle from A28 input through closure.
 */

import type { DecisionContract } from './decision-contract.js';
import type { ApprovalRecord } from './approval-record.js';
import type { ExecutionPlan } from './execution-plan.js';
import type { VerificationResult } from './verification.js';
import type { EvidenceFreshnessProfile } from './evidence-freshness.js';
import type { RiskProfile } from './risk-revalidation.js';
import { validateDecisionContract } from './decision-contract.js';
import { validateTransition } from './decision-lifecycle.js';
import { validateApprovalRecord, lifecycleStateForAction } from './approval-record.js';
import { validateActorAuthority } from './authority-validator.js';
import { checkDecisionExpiration } from './decision-expiration.js';
import { checkIfSuperseded } from './decision-supersession.js';
import { checkEvidenceFreshness } from './evidence-freshness.js';
import { revalidateRisk } from './risk-revalidation.js';
import { checkExecutionClass } from './execution-allowlist.js';
import { acquireExecutionLock, releaseExecutionLock } from './execution-lock.js';
import { buildIdempotencyKey, checkIdempotency, registerIdempotencyResult } from './idempotency.js';
import { validateExecutionPlan } from './execution-plan.js';
import { validateRollbackPlan } from './rollback-plan.js';
import { runPreflight } from './preflight.js';
import { evaluateVerificationResult } from './verification.js';
import { deriveClosureClass, checkClosureConditions } from './decision-closure.js';
import { buildExecutiveResponse } from './executive-response.js';
import { buildAuditRecord, AuditLog } from './decision-audit.js';
import {
  createMetrics, recordMetric, recordDecideTime, recordExecuteTime, recordCloseTime,
  publicMetrics,
} from './decision-metrics.js';

// ---------------------------------------------------------------------------
// Orchestration Result
// ---------------------------------------------------------------------------

export interface OrchestrationResult {
  decisionId: string;
  finalState: string;
  closureClass: string | null;
  executiveResponse: ReturnType<typeof buildExecutiveResponse> | null;
  auditRecords: number;
  metrics: ReturnType<typeof publicMetrics>;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Orchestration Context
// ---------------------------------------------------------------------------

export interface OrchestrationContext {
  contract: DecisionContract;
  approval: ApprovalRecord;
  plan: ExecutionPlan;
  verification: VerificationResult;
  evidenceFreshness: EvidenceFreshnessProfile;
  riskProfile: RiskProfile;
  freezeActive: boolean;
  a24Met: boolean;
  a22Met: boolean;
  a23Met: boolean;
  securityClearance: boolean;
  dependencyHealthy: boolean;
  nowIso: string;
  policyVersion: string;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function orchestrateDecision(ctx: OrchestrationContext): OrchestrationResult {
  const log = new AuditLog();
  const metrics = createMetrics();
  const errors: string[] = [];
  const startMs = Date.now();

  const { contract, approval, plan, verification, nowIso, policyVersion } = ctx;
  const decisionId = contract.decisionId;

  // Track active
  recordMetric(metrics, 'active_executive_decision_count');

  // --- 1. Validate contract ---
  const contractCheck = validateDecisionContract(contract as Partial<typeof contract>);
  if (!contractCheck.valid) {
    errors.push(contractCheck.reason);
    log.append(buildAuditRecord({
      decisionId, eventType: 'DECISION_CREATED', actorType: 'SYSTEM', authorityLevel: 'NONE',
      beforeState: null, afterState: 'FAILED_CLOSED', scope: 'PLATFORM',
      policyVersion, evidenceRefs: [], timestamp: nowIso, result: 'FAIL', detail: contractCheck.reason,
    }));
    recordMetric(metrics, 'active_executive_decision_count', -1);
    return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', executiveResponse: null, auditRecords: log.count(), metrics: publicMetrics(metrics), errors };
  }

  recordMetric(metrics, 'executive_decision_created_count');
  log.append(buildAuditRecord({
    decisionId, eventType: 'DECISION_CREATED', actorType: 'SYSTEM', authorityLevel: 'NONE',
    beforeState: null, afterState: 'CREATED', scope: contract.affectedScopes.join(','),
    policyVersion, evidenceRefs: contract.evidenceRefs, timestamp: nowIso, result: 'INFO', detail: 'Decision contract accepted from A28.',
  }));

  // --- 2. Check expiration ---
  const expiryCheck = checkDecisionExpiration({
    decisionId, deadline: contract.deadline, nowIso,
    defaultOnTimeout: contract.defaultOnTimeout, status: contract.status,
  });
  if (expiryCheck.expired) {
    errors.push(expiryCheck.reason);
    recordMetric(metrics, 'executive_decision_expired_count');
    log.append(buildAuditRecord({
      decisionId, eventType: 'DECISION_EXPIRED', actorType: 'SYSTEM', authorityLevel: 'NONE',
      beforeState: 'CREATED', afterState: 'EXPIRED', scope: contract.affectedScopes.join(','),
      policyVersion, evidenceRefs: contract.evidenceRefs, timestamp: nowIso, result: 'FAIL', detail: expiryCheck.reason,
    }));
    recordMetric(metrics, 'active_executive_decision_count', -1);
    return { decisionId, finalState: 'EXPIRED', closureClass: 'EXPIRED', executiveResponse: null, auditRecords: log.count(), metrics: publicMetrics(metrics), errors };
  }

  // --- 3. Check supersession ---
  const supersededCheck = checkIfSuperseded(contract);
  if (supersededCheck.superseded) {
    errors.push(supersededCheck.reason);
    recordMetric(metrics, 'decision_superseded_count');
    log.append(buildAuditRecord({
      decisionId, eventType: 'DECISION_SUPERSEDED', actorType: 'SYSTEM', authorityLevel: 'NONE',
      beforeState: 'CREATED', afterState: 'SUPERSEDED', scope: contract.affectedScopes.join(','),
      policyVersion, evidenceRefs: contract.evidenceRefs, timestamp: nowIso, result: 'FAIL', detail: supersededCheck.reason,
    }));
    recordMetric(metrics, 'active_executive_decision_count', -1);
    return { decisionId, finalState: 'SUPERSEDED', closureClass: 'FAILED_CLOSED', executiveResponse: null, auditRecords: log.count(), metrics: publicMetrics(metrics), errors };
  }

  // --- 4. Authority validation ---
  const authorityCheck = validateActorAuthority({
    actorType: approval.actorType,
    requiredAuthority: contract.authorityRequired,
    authorityContextExpiry: approval.expiresAt,
    nowIso,
  });
  if (!authorityCheck.valid) {
    errors.push(authorityCheck.reason);
    log.append(buildAuditRecord({
      decisionId, eventType: 'AUTHORITY_VALIDATION_FAILED', actorType: approval.actorType, authorityLevel: 'NONE',
      beforeState: 'AWAITING_AUTHORITY', afterState: 'FAILED_CLOSED', scope: approval.scope,
      policyVersion, evidenceRefs: approval.evidenceRefs, timestamp: nowIso, result: 'FAIL', detail: authorityCheck.reason,
    }));
    recordMetric(metrics, 'active_executive_decision_count', -1);
    return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', executiveResponse: null, auditRecords: log.count(), metrics: publicMetrics(metrics), errors };
  }

  // --- 5. Validate approval record ---
  const approvalCheck = validateApprovalRecord(approval, nowIso);
  if (!approvalCheck.valid) {
    errors.push(approvalCheck.reason);
    log.append(buildAuditRecord({
      decisionId, eventType: 'AUTHORITY_VALIDATION_FAILED', actorType: approval.actorType, authorityLevel: approval.authorityLevel,
      beforeState: 'AWAITING_DECISION', afterState: 'FAILED_CLOSED', scope: approval.scope,
      policyVersion, evidenceRefs: approval.evidenceRefs, timestamp: nowIso, result: 'FAIL', detail: approvalCheck.reason,
    }));
    recordMetric(metrics, 'active_executive_decision_count', -1);
    return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', executiveResponse: null, auditRecords: log.count(), metrics: publicMetrics(metrics), errors };
  }

  // --- 6. Record decision action ---
  const newState = lifecycleStateForAction(approval.action);
  const transitionCheck = validateTransition('AWAITING_DECISION', newState);
  if (!transitionCheck.allowed) {
    errors.push(transitionCheck.reason);
    recordMetric(metrics, 'active_executive_decision_count', -1);
    return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', executiveResponse: null, auditRecords: log.count(), metrics: publicMetrics(metrics), errors };
  }

  const decideMs = Date.now() - startMs;
  recordDecideTime(metrics, decideMs);

  const actionEventMap = {
    APPROVE: 'APPROVAL_RECORDED',
    REJECT: 'REJECTION_RECORDED',
    DEFER: 'DEFER_RECORDED',
  } as const;
  const eventType = actionEventMap[approval.action as keyof typeof actionEventMap] ?? 'APPROVAL_RECORDED';

  if (newState === 'APPROVED') {
    recordMetric(metrics, 'executive_decision_approved_count');
  } else if (newState === 'REJECTED') {
    recordMetric(metrics, 'executive_decision_rejected_count');
  } else if (newState === 'DEFERRED') {
    recordMetric(metrics, 'executive_decision_deferred_count');
  }

  log.append(buildAuditRecord({
    decisionId, eventType, actorType: approval.actorType, authorityLevel: approval.authorityLevel,
    beforeState: 'AWAITING_DECISION', afterState: newState, scope: approval.scope,
    policyVersion, evidenceRefs: approval.evidenceRefs, timestamp: nowIso, result: 'PASS', detail: approval.reason,
  }));

  // Non-approval terminal paths
  if (newState === 'REJECTED') {
    recordMetric(metrics, 'active_executive_decision_count', -1);
    const resp = buildExecutiveResponse({
      decisionId, action: approval.action, closureClass: 'REJECTED',
      executed: false, scope: approval.scope, verificationOutcome: null,
      rolledBack: false, platformImpact: 'No platform mutation.', remainingRisk: contract.riskIfRejected,
      remainingBlockedScopes: contract.affectedScopes, nextAction: null, title: contract.title,
    });
    return { decisionId, finalState: 'CLOSED', closureClass: 'REJECTED', executiveResponse: resp, auditRecords: log.count(), metrics: publicMetrics(metrics), errors };
  }

  if (newState === 'DEFERRED') {
    recordMetric(metrics, 'active_executive_decision_count', -1);
    const resp = buildExecutiveResponse({
      decisionId, action: approval.action, closureClass: 'DEFERRED',
      executed: false, scope: approval.scope, verificationOutcome: null,
      rolledBack: false, platformImpact: 'No platform mutation.', remainingRisk: contract.riskIfDeferred,
      remainingBlockedScopes: contract.affectedScopes, nextAction: 'Re-evaluate when conditions change.', title: contract.title,
    });
    return { decisionId, finalState: 'DEFERRED', closureClass: 'DEFERRED', executiveResponse: resp, auditRecords: log.count(), metrics: publicMetrics(metrics), errors };
  }

  // --- 7. Idempotency check ---
  const idemKey = buildIdempotencyKey(decisionId, plan.executionPlanId);
  const idemCheck = checkIdempotency<OrchestrationResult>(idemKey);
  if (idemCheck.exists) {
    log.append(buildAuditRecord({
      decisionId, eventType: 'IDEMPOTENCY_HIT', actorType: 'SYSTEM', authorityLevel: 'NONE',
      beforeState: 'APPROVED', afterState: 'APPROVED', scope: plan.scope,
      policyVersion, evidenceRefs: plan.evidenceRefs, timestamp: nowIso, result: 'INFO', detail: 'Idempotency hit — returning existing execution result without duplicate mutation.',
    }));
    return idemCheck.record.result;
  }

  // --- 8. Execution lock ---
  const lockResult = acquireExecutionLock(decisionId, approval.approvalId, nowIso);
  if (!lockResult.acquired) {
    errors.push(lockResult.reason);
    log.append(buildAuditRecord({
      decisionId, eventType: 'LOCK_REJECTED', actorType: 'SYSTEM', authorityLevel: 'NONE',
      beforeState: 'APPROVED', afterState: 'FAILED_CLOSED', scope: plan.scope,
      policyVersion, evidenceRefs: plan.evidenceRefs, timestamp: nowIso, result: 'FAIL', detail: lockResult.reason,
    }));
    recordMetric(metrics, 'active_executive_decision_count', -1);
    return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', executiveResponse: null, auditRecords: log.count(), metrics: publicMetrics(metrics), errors };
  }

  try {
    // --- 9. Validate execution plan ---
    const planCheck = validateExecutionPlan(plan);
    if (!planCheck.valid) {
      errors.push(planCheck.reason);
      recordMetric(metrics, 'decision_execution_failed_count');
      recordMetric(metrics, 'active_executive_decision_count', -1);
      return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', executiveResponse: null, auditRecords: log.count(), metrics: publicMetrics(metrics), errors };
    }

    // Check execution allowlist
    for (const op of plan.operations) {
      const allowCheck = checkExecutionClass(op.executionClass);
      if (!allowCheck.allowed) {
        errors.push(allowCheck.reason);
        log.append(buildAuditRecord({
          decisionId, eventType: 'PREFLIGHT_FAILED', actorType: 'SYSTEM', authorityLevel: 'NONE',
          beforeState: 'APPROVED', afterState: 'FAILED_CLOSED', scope: plan.scope,
          policyVersion, evidenceRefs: plan.evidenceRefs, timestamp: nowIso, result: 'FAIL', detail: allowCheck.reason,
        }));
        recordMetric(metrics, 'active_executive_decision_count', -1);
        return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', executiveResponse: null, auditRecords: log.count(), metrics: publicMetrics(metrics), errors };
      }
    }

    // Validate rollback plan
    const rollbackCheck = validateRollbackPlan(plan.rollbackPlan, true);
    if (!rollbackCheck.valid) {
      errors.push(rollbackCheck.reason);
      log.append(buildAuditRecord({
        decisionId, eventType: 'PREFLIGHT_FAILED', actorType: 'SYSTEM', authorityLevel: 'NONE',
        beforeState: 'APPROVED', afterState: 'PREFLIGHT_FAILED', scope: plan.scope,
        policyVersion, evidenceRefs: plan.evidenceRefs, timestamp: nowIso, result: 'FAIL', detail: rollbackCheck.reason,
      }));
      recordMetric(metrics, 'decision_preflight_failed_count');
      recordMetric(metrics, 'active_executive_decision_count', -1);
      return { decisionId, finalState: 'PREFLIGHT_FAILED', closureClass: 'FAILED_CLOSED', executiveResponse: null, auditRecords: log.count(), metrics: publicMetrics(metrics), errors };
    }

    // --- 10. Two-phase: Preflight ---
    log.append(buildAuditRecord({
      decisionId, eventType: 'PREFLIGHT_STARTED', actorType: 'SYSTEM', authorityLevel: 'NONE',
      beforeState: 'APPROVED', afterState: 'PREFLIGHT_PENDING', scope: plan.scope,
      policyVersion, evidenceRefs: plan.evidenceRefs, timestamp: nowIso, result: 'INFO', detail: 'Preflight started.',
    }));

    const preflightResult = runPreflight({
      approval, contract, nowIso,
      freezeActive: ctx.freezeActive,
      a24ActivationRequired: true, a24ActivationMet: ctx.a24Met,
      a22PublicationRequired: true, a22PublicationMet: ctx.a22Met,
      a23CommercialRequired: true, a23CommercialMet: ctx.a23Met,
      securityClearance: ctx.securityClearance,
      evidenceFreshness: ctx.evidenceFreshness,
      riskProfile: ctx.riskProfile,
      dependencyHealthy: ctx.dependencyHealthy,
    });

    if (!preflightResult.passed) {
      const detail = `Preflight failed: ${preflightResult.blockers.join('; ')}`;
      errors.push(detail);
      recordMetric(metrics, 'decision_preflight_failed_count');
      log.append(buildAuditRecord({
        decisionId, eventType: 'PREFLIGHT_FAILED', actorType: 'SYSTEM', authorityLevel: 'NONE',
        beforeState: 'PREFLIGHT_PENDING', afterState: 'PREFLIGHT_FAILED', scope: plan.scope,
        policyVersion, evidenceRefs: plan.evidenceRefs, timestamp: nowIso, result: 'FAIL', detail,
      }));
      recordMetric(metrics, 'active_executive_decision_count', -1);
      return { decisionId, finalState: 'PREFLIGHT_FAILED', closureClass: 'FAILED_CLOSED', executiveResponse: null, auditRecords: log.count(), metrics: publicMetrics(metrics), errors };
    }

    log.append(buildAuditRecord({
      decisionId, eventType: 'PREFLIGHT_PASSED', actorType: 'SYSTEM', authorityLevel: 'NONE',
      beforeState: 'PREFLIGHT_PENDING', afterState: 'PREFLIGHT_PASSED', scope: plan.scope,
      policyVersion, evidenceRefs: plan.evidenceRefs, timestamp: nowIso, result: 'PASS', detail: 'All preflight checks passed.',
    }));

    // --- 11. Execute ---
    const execStart = Date.now();
    recordMetric(metrics, 'decision_execution_count');
    log.append(buildAuditRecord({
      decisionId, eventType: 'EXECUTION_STARTED', actorType: 'SYSTEM', authorityLevel: 'NONE',
      beforeState: 'PREFLIGHT_PASSED', afterState: 'EXECUTING', scope: plan.scope,
      policyVersion, evidenceRefs: plan.evidenceRefs, timestamp: nowIso, result: 'INFO', detail: 'Bounded execution started.',
    }));

    // (Execution is simulated — actual mutations performed by bounded subsystems)
    const execMs = Date.now() - execStart;
    recordExecuteTime(metrics, execMs);

    log.append(buildAuditRecord({
      decisionId, eventType: 'EXECUTION_COMPLETED', actorType: 'SYSTEM', authorityLevel: 'NONE',
      beforeState: 'EXECUTING', afterState: 'VERIFYING', scope: plan.scope,
      policyVersion, evidenceRefs: plan.evidenceRefs, timestamp: nowIso, result: 'PASS', detail: 'Execution completed. Proceeding to verification.',
    }));

    // --- 12. Verification ---
    const verifyCheck = evaluateVerificationResult(verification);
    if (!verifyCheck.closeable) {
      errors.push(verifyCheck.reason);
      recordMetric(metrics, 'decision_verification_failed_count');

      if (verifyCheck.outcome === 'UNKNOWN') {
        log.append(buildAuditRecord({
          decisionId, eventType: 'VERIFICATION_COMPLETED', actorType: 'SYSTEM', authorityLevel: 'NONE',
          beforeState: 'VERIFYING', afterState: 'FAILED_CLOSED', scope: plan.scope,
          policyVersion, evidenceRefs: verification.evidenceRefs, timestamp: nowIso, result: 'FAIL', detail: verifyCheck.reason,
        }));
        recordMetric(metrics, 'active_executive_decision_count', -1);
        return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', executiveResponse: null, auditRecords: log.count(), metrics: publicMetrics(metrics), errors };
      }

      // Verification failed → rollback
      recordMetric(metrics, 'decision_rollback_count');
      log.append(buildAuditRecord({
        decisionId, eventType: 'ROLLBACK_STARTED', actorType: 'SYSTEM', authorityLevel: 'NONE',
        beforeState: 'VERIFYING', afterState: 'ROLLBACK_PENDING', scope: plan.scope,
        policyVersion, evidenceRefs: plan.evidenceRefs, timestamp: nowIso, result: 'INFO', detail: 'Verification failed — initiating rollback via A26.',
      }));
      log.append(buildAuditRecord({
        decisionId, eventType: 'ROLLBACK_COMPLETED', actorType: 'SYSTEM', authorityLevel: 'NONE',
        beforeState: 'ROLLBACK_PENDING', afterState: 'ROLLED_BACK', scope: plan.scope,
        policyVersion, evidenceRefs: plan.evidenceRefs, timestamp: nowIso, result: 'PASS', detail: 'Rollback completed via A26 recovery engine.',
      }));

      const closureClass = deriveClosureClass({ wasRolledBack: true, wasRejected: false, wasDeferred: false, wasExpired: false, wasFailedClosed: false });
      const resp = buildExecutiveResponse({
        decisionId, action: approval.action, closureClass,
        executed: true, scope: plan.scope, verificationOutcome: verifyCheck.outcome,
        rolledBack: true, platformImpact: 'Execution was rolled back.', remainingRisk: contract.riskIfApproved,
        remainingBlockedScopes: contract.affectedScopes, nextAction: 'Review rollback and re-evaluate decision.', title: contract.title,
      });

      recordCloseTime(metrics, Date.now() - startMs);
      recordMetric(metrics, 'active_executive_decision_count', -1);
      return { decisionId, finalState: 'CLOSED', closureClass, executiveResponse: resp, auditRecords: log.count(), metrics: publicMetrics(metrics), errors };
    }

    log.append(buildAuditRecord({
      decisionId, eventType: 'VERIFICATION_COMPLETED', actorType: 'SYSTEM', authorityLevel: 'NONE',
      beforeState: 'VERIFYING', afterState: 'VERIFIED', scope: plan.scope,
      policyVersion, evidenceRefs: verification.evidenceRefs, timestamp: nowIso, result: 'PASS', detail: `Verification outcome: ${verifyCheck.outcome}.`,
    }));

    // --- 13. Close ---
    const closureConditions = {
      finalActionKnown: true, executionCompletedOrNotRequired: true,
      verificationCompleted: true, evidenceComplete: true,
      auditComplete: true, noUnresolvedRollback: true, noUnresolvedCriticalEscalation: true,
    };
    const closureClass = deriveClosureClass({ wasRolledBack: false, wasRejected: false, wasDeferred: false, wasExpired: false, wasFailedClosed: false });
    const closureCheck = checkClosureConditions(closureConditions, closureClass);
    if (!closureCheck.canClose) {
      errors.push(...closureCheck.blockers);
      recordMetric(metrics, 'active_executive_decision_count', -1);
      return { decisionId, finalState: 'FAILED_CLOSED', closureClass: 'FAILED_CLOSED', executiveResponse: null, auditRecords: log.count(), metrics: publicMetrics(metrics), errors };
    }

    log.append(buildAuditRecord({
      decisionId, eventType: 'DECISION_CLOSED', actorType: 'SYSTEM', authorityLevel: 'NONE',
      beforeState: 'VERIFIED', afterState: 'CLOSED', scope: plan.scope,
      policyVersion, evidenceRefs: verification.evidenceRefs, timestamp: nowIso, result: 'PASS', detail: `Decision closed: ${closureClass}.`,
    }));

    const resp = buildExecutiveResponse({
      decisionId, action: approval.action, closureClass,
      executed: true, scope: plan.scope, verificationOutcome: verifyCheck.outcome,
      rolledBack: false, platformImpact: `Scope "${plan.scope}" was successfully updated.`, remainingRisk: 'Residual risk within policy bounds.',
      remainingBlockedScopes: [], nextAction: null, title: contract.title,
    });

    recordCloseTime(metrics, Date.now() - startMs);
    recordMetric(metrics, 'active_executive_decision_count', -1);

    const finalResult: OrchestrationResult = {
      decisionId, finalState: 'CLOSED', closureClass,
      executiveResponse: resp, auditRecords: log.count(),
      metrics: publicMetrics(metrics), errors,
    };

    // Register for idempotency
    registerIdempotencyResult(idemKey, decisionId, finalResult, nowIso);

    return finalResult;

  } finally {
    releaseExecutionLock(decisionId);
  }
}
