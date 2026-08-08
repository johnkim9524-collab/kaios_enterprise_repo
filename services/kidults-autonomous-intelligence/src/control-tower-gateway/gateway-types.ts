/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: gateway-types.ts
 *
 * Canonical type contracts for A31.
 * Consumed by all A31 modules; no governance logic here.
 */

// ---------------------------------------------------------------------------
// Data Modes (explicit — no silent fallback)
// ---------------------------------------------------------------------------

export type DataMode = 'LIVE' | 'EVIDENCE' | 'DEMO';

// ---------------------------------------------------------------------------
// Evidence Freshness
// ---------------------------------------------------------------------------

export type FreshnessClass = 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';

export interface EvidenceFreshnessEnvelope {
  readonly source: string;
  readonly generatedAt: string;
  readonly receivedAt: string;
  readonly freshnessClass: FreshnessClass;
  readonly staleAfter: string;
  readonly policyVersion: string;
  readonly verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Health States
// ---------------------------------------------------------------------------

export type HealthState = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN';

export interface GatewayHealthReport {
  readonly gatewayHealth: HealthState;
  readonly evidenceHealth: HealthState;
  readonly orchestrationHealth: HealthState;
  readonly runtimeHealth: HealthState;
}

// ---------------------------------------------------------------------------
// Supported Executive Actions
// ---------------------------------------------------------------------------

export type ExecutiveActionKind =
  | 'ACKNOWLEDGE'
  | 'APPROVE'
  | 'APPROVE_LIMITED_SCOPE'
  | 'REJECT'
  | 'DEFER'
  | 'MAINTAIN_FREEZE'
  | 'RELEASE_FREEZE'
  | 'ALLOW_DEGRADED_OPERATION'
  | 'HALT_SCOPE'
  | 'RESUME_SCOPE';

export const SUPPORTED_ACTIONS: ReadonlySet<ExecutiveActionKind> = new Set([
  'ACKNOWLEDGE',
  'APPROVE',
  'APPROVE_LIMITED_SCOPE',
  'REJECT',
  'DEFER',
  'MAINTAIN_FREEZE',
  'RELEASE_FREEZE',
  'ALLOW_DEGRADED_OPERATION',
  'HALT_SCOPE',
  'RESUME_SCOPE',
] as const);

// ---------------------------------------------------------------------------
// Preflight & Execution States
// ---------------------------------------------------------------------------

export type PreflightStatus = 'NOT_STARTED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'BLOCKED';
export type ExecutionStatus = 'PENDING' | 'EXECUTING' | 'VERIFYING' | 'VERIFIED' | 'ROLLED_BACK' | 'FAILED_CLOSED';
export type VerificationStatus = 'PENDING' | 'PASSED' | 'FAILED' | 'UNKNOWN';
export type RollbackStatus = 'NOT_REQUIRED' | 'PENDING' | 'COMPLETED' | 'FAILED' | 'UNKNOWN';

// ---------------------------------------------------------------------------
// Action Request Contract
// ---------------------------------------------------------------------------

export interface ActorContext {
  readonly actorId: string;
  readonly actorRole: string;
  readonly sessionRef: string;
}

export interface AuthorityContext {
  /** Advisory only — server policy is authoritative */
  readonly claimedAuthority: string;
  readonly authoritySource: string;
}

export interface ClientContext {
  readonly userAgent: string;
  readonly clientVersion: string;
  readonly requestOrigin: string;
}

export interface ExecutiveActionRequest {
  readonly requestId: string;
  readonly decisionId: string;
  readonly requestedAction: ExecutiveActionKind;
  readonly requestedScope: string[];
  readonly actorContext: ActorContext;
  /** Advisory only — not trusted without server validation */
  readonly authorityContext: AuthorityContext;
  readonly clientContext: ClientContext;
  readonly evidenceRefs: string[];
  readonly submittedAt: string;
  readonly idempotencyKey: string;
  /** No arbitrary command field. No free-form execution payload. */
}

// ---------------------------------------------------------------------------
// Action Response Contract
// ---------------------------------------------------------------------------

export type ActionResponseStatus =
  | 'ACCEPTED'
  | 'REJECTED'
  | 'IN_PROGRESS'
  | 'EXISTING_RESULT'
  | 'FAILED'
  | 'BLOCKED';

export interface ExecutiveActionResponse {
  readonly requestId: string;
  readonly decisionId: string;
  readonly accepted: boolean;
  readonly status: ActionResponseStatus;
  readonly reason: string;
  readonly orchestrationId: string | null;
  readonly preflightStatus: PreflightStatus;
  readonly executionStatus: ExecutionStatus | null;
  readonly verificationStatus: VerificationStatus;
  readonly rollbackStatus: RollbackStatus;
  readonly remainingRisk: string;
  readonly nextActionRequired: string | null;
  readonly evidenceRefs: string[];
  readonly completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Gateway Error Classes
// ---------------------------------------------------------------------------

export type GatewayErrorCode =
  | 'INVALID_REQUEST'
  | 'UNKNOWN_DECISION'
  | 'AUTHORITY_DENIED'
  | 'DECISION_EXPIRED'
  | 'DECISION_SUPERSEDED'
  | 'EVIDENCE_STALE'
  | 'POLICY_UNKNOWN'
  | 'FREEZE_BLOCKED'
  | 'DEPENDENCY_BLOCKED'
  | 'PREFLIGHT_FAILED'
  | 'EXECUTION_FAILED'
  | 'VERIFICATION_FAILED'
  | 'ROLLBACK_REQUIRED'
  | 'SERVICE_UNAVAILABLE'
  | 'FAILED_CLOSED';

// ---------------------------------------------------------------------------
// Live Snapshot Response
// ---------------------------------------------------------------------------

export interface LiveSnapshotResponse {
  readonly platformStatus: string;
  readonly executiveActionRequired: boolean;
  readonly activeDecisions: DecisionSummary[];
  readonly activeIncidents: IncidentSummary[];
  readonly autonomousActions: string[];
  readonly blockedScopes: string[];
  readonly risks: Record<string, string>;
  readonly products: ProductSummary[];
  readonly providers: ProviderSummary[];
  readonly publication: PublicationSummary;
  readonly commercial: CommercialSummary;
  readonly security: SecuritySummary;
  readonly freeze: FreezeSummary;
  readonly dataMode: DataMode;
  readonly freshness: EvidenceFreshnessEnvelope;
  readonly generatedAt: string;
  readonly policyVersion: string;
  readonly health: GatewayHealthReport;
}

// ---------------------------------------------------------------------------
// Decision Detail Response
// ---------------------------------------------------------------------------

export interface DecisionDetailResponse {
  readonly decision: DecisionSummary;
  readonly recommendation: string;
  readonly allowedActions: ExecutiveActionKind[];
  readonly prohibitedActions: ExecutiveActionKind[];
  readonly authorityRequired: string;
  readonly risk: string;
  readonly deadline: string;
  readonly scope: string[];
  readonly evidence: EvidenceFreshnessEnvelope;
  readonly status: string;
  readonly executionState: ExecutionStatus | null;
  readonly verificationState: VerificationStatus;
}

// ---------------------------------------------------------------------------
// Summary Sub-types
// ---------------------------------------------------------------------------

export interface DecisionSummary {
  readonly decisionId: string;
  readonly title: string;
  readonly priority: string;
  readonly decisionClass: string;
  readonly status: string;
  readonly deadline: string;
  readonly authorityRequired: string;
  readonly risk: string;
  readonly actionEnabled: boolean;
  readonly actionBlockedReason: string | null;
}

export interface IncidentSummary {
  readonly severity: string;
  readonly title: string;
  readonly businessImpact: string;
  readonly affectedScopes: string[];
  readonly status: string;
}

export interface ProductSummary {
  readonly product: string;
  readonly readiness: string;
  readonly publication: string;
  readonly commercial: string;
  readonly slo: string;
  readonly decisionRequired: boolean;
}

export interface ProviderSummary {
  readonly provider: string;
  readonly health: string;
  readonly costRisk: string;
  readonly decisionRequired: boolean;
}

export interface PublicationSummary {
  readonly state: string;
  readonly decisionRequired: boolean;
  readonly blockedProducts: string[];
}

export interface CommercialSummary {
  readonly state: string;
  readonly risk: string;
  readonly decisionRequired: boolean;
}

export interface SecuritySummary {
  readonly status: string;
  readonly credentialRisk: string;
  readonly executiveActionRequired: boolean;
}

export interface FreezeSummary {
  readonly state: string;
  readonly reason: string | null;
  readonly scope: string[];
}
