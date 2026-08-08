/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: evidence-freshness.ts
 *
 * All execution-sensitive evidence must pass freshness checks.
 * Stale critical evidence → preflight fail → no execution.
 */

// ---------------------------------------------------------------------------
// Evidence Freshness Profile
// ---------------------------------------------------------------------------

export interface EvidenceFreshnessProfile {
  policyFresh: boolean;
  incidentFresh: boolean;
  SLOFresh: boolean;
  providerFresh: boolean;
  securityFresh: boolean;
  activationFresh: boolean;
  publicationFresh: boolean;
  commercialFresh: boolean;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type EvidenceFreshnessResult =
  | { fresh: true }
  | { fresh: false; stale: string[]; reason: string };

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export function checkEvidenceFreshness(
  profile: EvidenceFreshnessProfile,
): EvidenceFreshnessResult {
  const stale: string[] = [];

  const entries = Object.entries(profile) as [keyof EvidenceFreshnessProfile, boolean][];
  for (const [key, value] of entries) {
    if (!value) {
      stale.push(key);
    }
  }

  if (stale.length > 0) {
    return {
      fresh: false,
      stale,
      reason: `Stale critical evidence detected: [${stale.join(', ')}]. Preflight fails. Execution blocked.`,
    };
  }

  return { fresh: true };
}

// ---------------------------------------------------------------------------
// Build profile from A28 snapshot context (simulation)
// ---------------------------------------------------------------------------

export function buildFreshnessProfileFromContext(params: {
  policyGeneratedAt: string;
  incidentUpdatedAt: string;
  sloUpdatedAt: string;
  providerUpdatedAt: string;
  securityUpdatedAt: string;
  activationUpdatedAt: string;
  publicationUpdatedAt: string;
  commercialUpdatedAt: string;
  nowIso: string;
  maxAgeMs?: number;
}): EvidenceFreshnessProfile {
  const maxAge = params.maxAgeMs ?? 30 * 60 * 1000; // 30 min default
  const now = new Date(params.nowIso).getTime();

  const isFresh = (ts: string) => now - new Date(ts).getTime() < maxAge;

  return {
    policyFresh:       isFresh(params.policyGeneratedAt),
    incidentFresh:     isFresh(params.incidentUpdatedAt),
    SLOFresh:          isFresh(params.sloUpdatedAt),
    providerFresh:     isFresh(params.providerUpdatedAt),
    securityFresh:     isFresh(params.securityUpdatedAt),
    activationFresh:   isFresh(params.activationUpdatedAt),
    publicationFresh:  isFresh(params.publicationUpdatedAt),
    commercialFresh:   isFresh(params.commercialUpdatedAt),
  };
}
