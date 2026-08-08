/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: escalation-queue.ts
 *
 * Canonical executive escalation queue.
 * Ordered by priority, severity, deadline, risk, dependency, age.
 */

import type { ExecutiveDecision, DecisionSeverity } from './decision-gate.js';
import type { ExecutivePriority } from './priority-engine.js';
import type { RiskLevel } from './risk-engine.js';

// ---------------------------------------------------------------------------
// Queue Entry
// ---------------------------------------------------------------------------

export interface EscalationQueueEntry {
  readonly queuePosition: number;
  readonly decisionId: string;
  readonly priority: ExecutivePriority;
  readonly severity: DecisionSeverity;
  readonly deadline: string | null;
  readonly ageMs: number;
  readonly blockingOperations: string[];
  readonly recommendedAction: string;
  readonly overallRisk: RiskLevel;
}

// ---------------------------------------------------------------------------
// Queue Builder
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<DecisionSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFORMATIONAL: 4,
};

const PRIORITY_RANK: Record<ExecutivePriority, number> = {
  P0: 0, P1: 1, P2: 2, P3: 3, P4: 4,
};

const RISK_RANK: Record<RiskLevel, number> = {
  CRITICAL: 0, UNKNOWN: 1, HIGH: 2, MODERATE: 3, LOW: 4,
};

interface QueueInput {
  decision: ExecutiveDecision;
  priority: ExecutivePriority;
  overallRisk: RiskLevel;
  createdAt: string;
  blockingOperations: string[];
}

export function buildEscalationQueue(inputs: QueueInput[]): EscalationQueueEntry[] {
  const now = Date.now();

  const scored = inputs
    .filter((i) => i.decision.status === 'OPEN' || i.decision.status === 'ACKNOWLEDGED')
    .map((i) => {
      const ageMs = now - new Date(i.createdAt).getTime();
      const deadlineScore = i.decision.deadline
        ? new Date(i.decision.deadline).getTime() - now
        : Number.MAX_SAFE_INTEGER;

      return {
        input: i,
        ageMs,
        deadlineScore,
        priorityRank: PRIORITY_RANK[i.priority],
        severityRank: SEVERITY_RANK[i.decision.severity],
        riskRank: RISK_RANK[i.overallRisk],
      };
    })
    .sort((a, b) => {
      // Primary: priority (lower rank = more urgent)
      if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
      // Secondary: severity
      if (a.severityRank !== b.severityRank) return a.severityRank - b.severityRank;
      // Tertiary: deadline (sooner first)
      if (a.deadlineScore !== b.deadlineScore) return a.deadlineScore - b.deadlineScore;
      // Quaternary: risk
      if (a.riskRank !== b.riskRank) return a.riskRank - b.riskRank;
      // Quinary: age (older first)
      return b.ageMs - a.ageMs;
    });

  return scored.map((s, idx) =>
    Object.freeze({
      queuePosition: idx + 1,
      decisionId: s.input.decision.decisionId,
      priority: s.input.priority,
      severity: s.input.decision.severity,
      deadline: s.input.decision.deadline,
      ageMs: s.ageMs,
      blockingOperations: s.input.blockingOperations,
      recommendedAction: s.input.decision.recommendedOption,
      overallRisk: s.input.overallRisk,
    }),
  );
}
