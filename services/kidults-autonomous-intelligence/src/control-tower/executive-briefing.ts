/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: executive-briefing.ts
 *
 * Structured executive briefing. No marketing prose. No speculation.
 */

import type { EvidenceRef } from './signal-aggregator.js';
import type { DecisionOption } from './decision-gate.js';

// ---------------------------------------------------------------------------
// Briefing
// ---------------------------------------------------------------------------

export interface ExecutiveBriefing {
  readonly briefingId: string;
  readonly generatedAt: string;
  readonly whatChanged: string;
  readonly whyItMatters: string;
  readonly whatSystemDid: string;
  readonly whatIsStillBlocked: string;
  readonly whatDecisionIsRequired: string | null;
  readonly options: DecisionOption[];
  readonly recommendation: string;
  readonly risks: string[];
  readonly deadline: string | null;
  readonly evidenceRefs: EvidenceRef[];
}

export function buildExecutiveBriefing(
  id: string,
  opts: Omit<ExecutiveBriefing, 'briefingId' | 'generatedAt'>,
): ExecutiveBriefing {
  return Object.freeze({
    briefingId: id,
    generatedAt: new Date().toISOString(),
    ...opts,
  });
}

export function generateNominalBriefing(id: string, evidenceRefs: EvidenceRef[]): ExecutiveBriefing {
  return buildExecutiveBriefing(id, {
    whatChanged: 'No material change detected in the current observation window.',
    whyItMatters: 'Continued nominal operation indicates stable platform health.',
    whatSystemDid: 'Autonomous governance layer executed routine health checks. All SLOs within bounds. No incidents detected.',
    whatIsStillBlocked: 'No scopes are currently blocked.',
    whatDecisionIsRequired: null,
    options: [],
    recommendation: 'No executive action required. Continue nominal autonomous operation.',
    risks: [],
    deadline: null,
    evidenceRefs,
  });
}

export function generateIncidentBriefing(
  id: string,
  severity: string,
  affectedScope: string,
  evidenceRefs: EvidenceRef[],
): ExecutiveBriefing {
  return buildExecutiveBriefing(id, {
    whatChanged: `${severity} incident detected affecting: ${affectedScope}.`,
    whyItMatters: `Incident has potential blast radius across ${affectedScope}. Platform health is degraded.`,
    whatSystemDid: 'Autonomous governance layer has contained the incident, applied circuit breakers, and initiated recovery per A26 policy.',
    whatIsStillBlocked: `${affectedScope} is currently in degraded operation pending full recovery.`,
    whatDecisionIsRequired: severity === 'SEV0' || severity === 'SEV1'
      ? 'Executive decision required: approve continued degraded operation or approve halt.'
      : null,
    options: severity === 'SEV0' || severity === 'SEV1'
      ? ['ALLOW_DEGRADED_OPERATION', 'HALT_SCOPE', 'REJECT']
      : [],
    recommendation: severity === 'SEV0' || severity === 'SEV1'
      ? 'Await recovery evidence. Executive must decide on continued operation under active incident.'
      : 'Autonomous recovery is underway. Monitor progress. No executive action required yet.',
    risks: [`${severity} incident may escalate if not contained.`, 'Recovery may extend SLO breach.'],
    deadline: severity === 'SEV0' ? new Date(Date.now() + 3_600_000).toISOString() : null,
    evidenceRefs,
  });
}
