/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: preflight.ts
 *
 * Two-phase approval: Phase 2 — Execution Preflight.
 * Approval alone must never directly trigger irreversible execution.
 * Preflight runs immediately before execution and re-validates everything.
 */

import type { DecisionContract } from './decision-contract.js';
import type { ApprovalRecord } from './approval-record.js';
import { validateApprovalRecord } from './approval-record.js';
import { checkEvidenceFreshness, type EvidenceFreshnessProfile } from './evidence-freshness.js';
import { revalidateRisk, type RiskProfile } from './risk-revalidation.js';
import { checkDecisionExpiration } from './decision-expiration.js';
import { checkIfSuperseded } from './decision-supersession.js';

// ---------------------------------------------------------------------------
// Preflight Context
// ---------------------------------------------------------------------------

export interface PreflightContext {
  approval: ApprovalRecord;
  contract: DecisionContract;
  nowIso: string;
  freezeActive: boolean;
  a24ActivationRequired: boolean;
  a24ActivationMet: boolean;
  a22PublicationRequired: boolean;
  a22PublicationMet: boolean;
  a23CommercialRequired: boolean;
  a23CommercialMet: boolean;
  securityClearance: boolean;
  evidenceFreshness: EvidenceFreshnessProfile;
  riskProfile: RiskProfile;
  dependencyHealthy: boolean;
}

// ---------------------------------------------------------------------------
// Preflight Result
// ---------------------------------------------------------------------------

export interface PreflightResult {
  passed: boolean;
  checks: PreflightCheck[];
  blockers: string[];
}

export interface PreflightCheck {
  name: string;
  passed: boolean;
  detail: string;
}

// ---------------------------------------------------------------------------
// Preflight Runner
// ---------------------------------------------------------------------------

export function runPreflight(ctx: PreflightContext): PreflightResult {
  const checks: PreflightCheck[] = [];
  const blockers: string[] = [];

  function check(name: string, passed: boolean, detail: string) {
    checks.push({ name, passed, detail });
    if (!passed) blockers.push(`${name}: ${detail}`);
  }

  // 1. Policy validity (approval record)
  const approvalCheck = validateApprovalRecord(ctx.approval, ctx.nowIso);
  check('POLICY_VALID', approvalCheck.valid, approvalCheck.valid ? 'Approval record valid.' : (approvalCheck as { valid: false; reason: string }).reason);

  // 2. Decision not expired
  const expiryCheck = checkDecisionExpiration({
    decisionId: ctx.contract.decisionId,
    deadline: ctx.contract.deadline,
    nowIso: ctx.nowIso,
    defaultOnTimeout: ctx.contract.defaultOnTimeout,
    status: ctx.contract.status,
  });
  check('NOT_EXPIRED', !expiryCheck.expired, expiryCheck.expired ? (expiryCheck as { expired: true; reason: string }).reason : 'Decision not expired.');

  // 3. Not superseded
  const supersededCheck = checkIfSuperseded(ctx.contract);
  check('NOT_SUPERSEDED', !supersededCheck.superseded, supersededCheck.superseded ? (supersededCheck as { superseded: true; reason: string }).reason : 'Decision not superseded.');

  // 4. Change freeze
  const freezeAllowed = !ctx.freezeActive;
  check('FREEZE_CLEAR', freezeAllowed, freezeAllowed ? 'No active change freeze.' : 'Change freeze is active. Expansion blocked.');

  // 5. A24 Activation
  const a24Met = !ctx.a24ActivationRequired || ctx.a24ActivationMet;
  check('A24_ACTIVATION', a24Met, a24Met ? 'A24 activation satisfied.' : 'A24 production activation gate not met. Execution blocked.');

  // 6. A22 Publication
  const a22Met = !ctx.a22PublicationRequired || ctx.a22PublicationMet;
  check('A22_PUBLICATION', a22Met, a22Met ? 'A22 publication satisfied.' : 'A22 publication control gate not met. Execution blocked.');

  // 7. A23 Commercial
  const a23Met = !ctx.a23CommercialRequired || ctx.a23CommercialMet;
  check('A23_COMMERCIAL', a23Met, a23Met ? 'A23 commercial satisfied.' : 'A23 commercial delivery gate not met. Execution blocked.');

  // 8. Security clearance
  check('SECURITY_CLEARANCE', ctx.securityClearance, ctx.securityClearance ? 'Security clearance granted.' : 'Security clearance not granted. Execution blocked.');

  // 9. Evidence freshness
  const freshnessResult = checkEvidenceFreshness(ctx.evidenceFreshness);
  check('EVIDENCE_FRESH', freshnessResult.fresh, freshnessResult.fresh ? 'All evidence is fresh.' : (freshnessResult as { fresh: false; reason: string }).reason);

  // 10. Risk revalidation
  const riskResult = revalidateRisk(ctx.riskProfile);
  check('RISK_ACCEPTABLE', riskResult.acceptable, riskResult.acceptable ? 'Risk within acceptable thresholds.' : (riskResult as { acceptable: false; reason: string }).reason);

  // 11. Dependency health
  check('DEPENDENCIES_HEALTHY', ctx.dependencyHealthy, ctx.dependencyHealthy ? 'Dependencies healthy.' : 'Dependency health check failed. Execution blocked.');

  const passed = blockers.length === 0;
  return { passed, checks, blockers };
}
