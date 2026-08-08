/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: recommendation-engine.ts
 *
 * Deterministic recommendation generation.
 * LOW or UNKNOWN confidence on critical irreversible action → executive decision required.
 */

import type { DecisionOption } from './decision-gate.js';
import type { RiskLevel } from './risk-engine.js';

// ---------------------------------------------------------------------------
// Recommendation Confidence
// ---------------------------------------------------------------------------

export type RecommendationConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

// ---------------------------------------------------------------------------
// Recommendation
// ---------------------------------------------------------------------------

export interface ExecutiveRecommendation {
  readonly recommendedOption: DecisionOption;
  readonly confidence: RecommendationConfidence;
  readonly rationale: string;
  readonly requiresExecutiveDecision: boolean;
  readonly supportingFactors: string[];
  readonly contraIndicators: string[];
}

// ---------------------------------------------------------------------------
// Recommendation Inputs
// ---------------------------------------------------------------------------

export interface RecommendationInputs {
  readonly platformStatus: string;
  readonly incidentSeverity: string;
  readonly sloBreaches: number;
  readonly errorBudgetExhausted: boolean;
  readonly blastRadius: string;
  readonly commercialImpact: boolean;
  readonly securityImpact: boolean;
  readonly providerDependency: boolean;
  readonly publicationRisk: RiskLevel;
  readonly recoveryInProgress: boolean;
  readonly changeFreeze: boolean;
  readonly historicalRecurrences: number;
  readonly evidenceComplete: boolean;
  readonly timeSensitive: boolean;
  readonly irreversible: boolean;
}

// ---------------------------------------------------------------------------
// Recommendation Engine
// ---------------------------------------------------------------------------

export function generateRecommendation(inputs: RecommendationInputs): ExecutiveRecommendation {
  const supportingFactors: string[] = [];
  const contraIndicators: string[] = [];

  // Evidence completeness gates everything
  if (!inputs.evidenceComplete) {
    return {
      recommendedOption: 'DEFER',
      confidence: 'UNKNOWN',
      rationale: 'Evidence is incomplete. No recommendation can be made without full upstream evidence.',
      requiresExecutiveDecision: true,
      supportingFactors: [],
      contraIndicators: ['Evidence incomplete — policy requires evidence before decision.'],
    };
  }

  // HALTED / CRITICAL always need attention
  if (inputs.platformStatus === 'HALTED' || inputs.platformStatus === 'CRITICAL') {
    return {
      recommendedOption: 'HALT_SCOPE',
      confidence: 'HIGH',
      rationale: 'Platform is in a critical or halted state. Executive action required to restore safe operation.',
      requiresExecutiveDecision: true,
      supportingFactors: [`Platform status: ${inputs.platformStatus}`],
      contraIndicators: [],
    };
  }

  // Security impact → always requires security decision
  if (inputs.securityImpact) {
    contraIndicators.push('Security impact detected.');
    return {
      recommendedOption: 'REJECT',
      confidence: 'HIGH',
      rationale: 'Security impact requires explicit security-authority decision. No autonomous action permitted.',
      requiresExecutiveDecision: true,
      supportingFactors: [],
      contraIndicators,
    };
  }

  // Irreversible action without HIGH confidence → executive required
  if (inputs.irreversible) {
    contraIndicators.push('Action is irreversible.');
    return {
      recommendedOption: 'DEFER',
      confidence: 'LOW',
      rationale: 'Irreversible actions require explicit executive approval with HIGH confidence evidence.',
      requiresExecutiveDecision: true,
      supportingFactors: [],
      contraIndicators,
    };
  }

  // Error budget exhausted + change freeze → maintain freeze
  if (inputs.errorBudgetExhausted && inputs.changeFreeze) {
    supportingFactors.push('Error budget exhausted.', 'Change freeze active per A27.');
    return {
      recommendedOption: 'MAINTAIN_FREEZE',
      confidence: 'HIGH',
      rationale: 'Error budget is exhausted and change freeze is active. Maintain freeze until budget recovers.',
      requiresExecutiveDecision: false,
      supportingFactors,
      contraIndicators: [],
    };
  }

  // Recurrent incidents → executive review
  if (inputs.historicalRecurrences >= 3) {
    contraIndicators.push(`Recurrent incident — ${inputs.historicalRecurrences} occurrences.`);
    return {
      recommendedOption: 'DEFER',
      confidence: 'MEDIUM',
      rationale: 'Recurring pattern detected. Executive review recommended to address root cause.',
      requiresExecutiveDecision: true,
      supportingFactors: [],
      contraIndicators,
    };
  }

  // Degraded but recoverable
  if (inputs.recoveryInProgress) {
    supportingFactors.push('Autonomous recovery in progress.');
    return {
      recommendedOption: 'ALLOW_DEGRADED_OPERATION',
      confidence: 'MEDIUM',
      rationale: 'Autonomous recovery is in progress. Allow degraded operation until recovery completes.',
      requiresExecutiveDecision: false,
      supportingFactors,
      contraIndicators: [],
    };
  }

  // Healthy platform with SLO breaches — informational
  if (inputs.sloBreaches > 0) {
    return {
      recommendedOption: 'ALLOW_DEGRADED_OPERATION',
      confidence: 'MEDIUM',
      rationale: 'Minor SLO breaches detected. Autonomous remediation is underway.',
      requiresExecutiveDecision: false,
      supportingFactors: [`${inputs.sloBreaches} SLO breach(es) detected.`],
      contraIndicators: [],
    };
  }

  // Healthy
  return {
    recommendedOption: 'APPROVE',
    confidence: 'HIGH',
    rationale: 'Platform health is satisfactory. No executive action required at this time.',
    requiresExecutiveDecision: false,
    supportingFactors: ['All health dimensions nominal.'],
    contraIndicators: [],
  };
}
