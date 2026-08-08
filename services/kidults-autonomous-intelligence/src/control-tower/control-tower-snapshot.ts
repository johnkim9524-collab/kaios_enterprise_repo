/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: control-tower-snapshot.ts
 *
 * Canonical snapshot contract. Stored under reports/control-tower/.
 */

import type { ExecutiveControlPlane, PlatformStatus } from './control-plane.js';
import type { AggregatedSignal, EvidenceRef } from './signal-aggregator.js';
import type { ExecutiveDecision } from './decision-gate.js';
import type { EscalationQueueEntry } from './escalation-queue.js';
import type { PublicationGovernanceView } from './publication-governance.js';
import type { CommercialGovernanceView } from './commercial-governance.js';
import type { SecurityGovernanceView } from './security-governance.js';
import type { ExecutiveRiskProfile } from './risk-engine.js';
import type { ProviderGovernanceView } from './provider-governance.js';
import type { ProductGovernanceView } from './product-governance.js';

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export interface ControlTowerSnapshot {
  readonly snapshotId: string;
  readonly generatedAt: string;
  readonly platform: ExecutiveControlPlane;
  readonly operations: {
    readonly signals: AggregatedSignal[];
    readonly changeFreezeActive: boolean;
    readonly changeFreezeReason: string | null;
  };
  readonly products: ProductGovernanceView[];
  readonly providers: ProviderGovernanceView[];
  readonly incidents: {
    readonly activeCount: number;
    readonly highestSeverity: string;
    readonly summaries: string[];
  };
  readonly decisions: ExecutiveDecision[];
  readonly freezes: {
    readonly state: 'NONE' | 'PARTIAL' | 'FULL' | 'SECURITY' | 'EMERGENCY';
    readonly reason: string | null;
    readonly scope: string[];
    readonly initiatedAt: string | null;
    readonly initiatedBy: string | null;
    readonly releaseConditions: string[];
    readonly releaseEligible: boolean;
  };
  readonly publication: PublicationGovernanceView;
  readonly commercial: CommercialGovernanceView;
  readonly security: SecurityGovernanceView;
  readonly risk: ExecutiveRiskProfile;
  readonly metrics: {
    readonly activeDecisionCount: number;
    readonly activeIncidentCount: number;
    readonly degradedScopeCount: number;
    readonly haltedScopeCount: number;
    readonly escalationQueueDepth: number;
    readonly policyVersion: string;
  };
  readonly evidenceRefs: EvidenceRef[];
  readonly escalationQueue: EscalationQueueEntry[];
}

export function buildControlTowerSnapshot(
  id: string,
  opts: Omit<ControlTowerSnapshot, 'snapshotId' | 'generatedAt'>,
): ControlTowerSnapshot {
  return Object.freeze({
    snapshotId: id,
    generatedAt: new Date().toISOString(),
    ...opts,
  });
}
