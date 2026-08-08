/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: executive-summary.ts
 *
 * Concise machine-readable executive summary suitable for Control Tower UI.
 */

import type { ExecutivePriority } from './priority-engine.js';
import type { RiskLevel } from './risk-engine.js';
import type { PlatformStatus } from './control-plane.js';

// ---------------------------------------------------------------------------
// Executive Summary
// ---------------------------------------------------------------------------

export interface ExecutiveSummary {
  readonly platformStatus: PlatformStatus;
  readonly executiveActionRequired: boolean;
  readonly highestPriority: ExecutivePriority;
  readonly activeDecisions: number;
  readonly activeIncidents: number;
  readonly criticalRisks: string[];
  readonly autonomousActionsInProgress: string[];
  readonly blockedScopes: string[];
  readonly recommendedNextDecision: string | null;
  readonly summary: string;
}

export function buildExecutiveSummary(
  opts: ExecutiveSummary,
): ExecutiveSummary {
  return Object.freeze(opts);
}

export function generateExecutiveSummary(params: {
  platformStatus: PlatformStatus;
  executiveActionRequired: boolean;
  highestPriority: ExecutivePriority;
  activeDecisions: number;
  activeIncidents: number;
  overallRisk: RiskLevel;
  autonomousActionsInProgress: string[];
  blockedScopes: string[];
  recommendedNextDecision: string | null;
}): ExecutiveSummary {
  const criticalRisks: string[] = [];
  if (params.overallRisk === 'CRITICAL' || params.overallRisk === 'UNKNOWN') {
    criticalRisks.push(`Overall risk: ${params.overallRisk}`);
  }
  if (params.activeIncidents > 0) {
    criticalRisks.push(`${params.activeIncidents} active incident(s)`);
  }
  if (params.platformStatus === 'CRITICAL' || params.platformStatus === 'HALTED') {
    criticalRisks.push(`Platform status: ${params.platformStatus}`);
  }

  const summaryParts: string[] = [];
  summaryParts.push(`Platform is ${params.platformStatus}.`);
  if (params.executiveActionRequired) {
    summaryParts.push(`Executive action required (${params.activeDecisions} open decision(s)).`);
  } else {
    summaryParts.push('No immediate executive action required.');
  }
  if (params.activeIncidents > 0) {
    summaryParts.push(`${params.activeIncidents} active incident(s) under governance.`);
  }
  if (params.blockedScopes.length > 0) {
    summaryParts.push(`${params.blockedScopes.length} scope(s) blocked.`);
  }
  if (params.autonomousActionsInProgress.length > 0) {
    summaryParts.push(`${params.autonomousActionsInProgress.length} autonomous action(s) in progress.`);
  }

  return buildExecutiveSummary({
    platformStatus: params.platformStatus,
    executiveActionRequired: params.executiveActionRequired,
    highestPriority: params.highestPriority,
    activeDecisions: params.activeDecisions,
    activeIncidents: params.activeIncidents,
    criticalRisks,
    autonomousActionsInProgress: params.autonomousActionsInProgress,
    blockedScopes: params.blockedScopes,
    recommendedNextDecision: params.recommendedNextDecision,
    summary: summaryParts.join(' '),
  });
}
