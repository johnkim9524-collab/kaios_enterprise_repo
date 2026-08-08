/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: execution-plan.ts
 *
 * Every approved decision must generate a bounded execution plan.
 * Operations come from a strict allowlist — no arbitrary shell/SQL/external mutation.
 */

import type { AllowedExecutionClass } from './execution-allowlist.js';
import type { RollbackPlan } from './rollback-plan.js';

// ---------------------------------------------------------------------------
// Retry Policy
// ---------------------------------------------------------------------------

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  retryOn: string[];
}

// ---------------------------------------------------------------------------
// Execution Operation
// ---------------------------------------------------------------------------

export interface ExecutionOperation {
  operationId: string;
  executionClass: AllowedExecutionClass;
  scope: string;
  parameters: Record<string, string>;
  idempotencyKey: string;
}

// ---------------------------------------------------------------------------
// Execution Plan
// ---------------------------------------------------------------------------

export interface ExecutionPlan {
  executionPlanId: string;
  decisionId: string;
  scope: string;
  operations: ExecutionOperation[];
  expectedState: string;
  rollbackPlan: RollbackPlan;
  verificationPlan: string;
  timeout: number; // ms
  retryPolicy: RetryPolicy;
  policyVersion: string;
  evidenceRefs: string[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ExecutionPlanValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export function validateExecutionPlan(plan: ExecutionPlan): ExecutionPlanValidationResult {
  if (!plan.executionPlanId) {
    return { valid: false, reason: 'Execution plan missing executionPlanId.' };
  }
  if (!plan.decisionId) {
    return { valid: false, reason: 'Execution plan missing decisionId.' };
  }
  if (!plan.operations || plan.operations.length === 0) {
    return { valid: false, reason: 'Execution plan has no operations.' };
  }
  if (!plan.rollbackPlan) {
    return { valid: false, reason: 'Execution plan missing rollbackPlan.' };
  }
  if (!plan.policyVersion) {
    return { valid: false, reason: 'Execution plan missing policyVersion.' };
  }
  if (!plan.evidenceRefs || plan.evidenceRefs.length === 0) {
    return { valid: false, reason: 'Execution plan missing evidenceRefs.' };
  }
  if (plan.timeout <= 0) {
    return { valid: false, reason: 'Execution plan has invalid timeout.' };
  }
  return { valid: true };
}
