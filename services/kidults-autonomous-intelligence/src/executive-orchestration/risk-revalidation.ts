/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: risk-revalidation.ts
 *
 * Immediately before execution, recalculate all risk dimensions.
 * If any dimension crosses the policy threshold, block execution.
 */

// ---------------------------------------------------------------------------
// Risk Dimensions
// ---------------------------------------------------------------------------

export interface RiskProfile {
  operationalRisk: number;   // 0–100
  securityRisk: number;
  providerRisk: number;
  commercialRisk: number;
  financialRisk: number;
  publicationRisk: number;
  dependencyRisk: number;
  continuityRisk: number;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type RiskRevalidationResult =
  | { acceptable: true; profile: RiskProfile }
  | { acceptable: false; violations: string[]; reason: string; profile: RiskProfile };

// ---------------------------------------------------------------------------
// Threshold
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLD = 75;

export function revalidateRisk(
  profile: RiskProfile,
  threshold: number = DEFAULT_THRESHOLD,
): RiskRevalidationResult {
  const violations: string[] = [];

  const entries = Object.entries(profile) as [keyof RiskProfile, number][];
  for (const [dimension, score] of entries) {
    if (score > threshold) {
      violations.push(`${dimension}=${score} exceeds threshold ${threshold}`);
    }
  }

  if (violations.length > 0) {
    return {
      acceptable: false,
      violations,
      profile,
      reason: `Risk threshold violation immediately before execution: [${violations.join('; ')}]. Execution blocked.`,
    };
  }

  return { acceptable: true, profile };
}
