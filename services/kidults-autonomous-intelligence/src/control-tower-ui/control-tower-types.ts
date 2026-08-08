export type DataMode = 'LIVE' | 'EVIDENCE' | 'DEMO';

export type PlatformStatus = 'EXCELLENT' | 'HEALTHY' | 'DEGRADED' | 'AT_RISK' | 'CRITICAL' | 'HALTED' | 'UNKNOWN';
export type ViewState = 'LOADING' | 'READY' | 'EMPTY' | 'DEGRADED' | 'ERROR' | 'UNKNOWN' | 'STALE';
export type DecisionAction =
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

export type DecisionRiskClass = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
export type IncidentSeverity = 'SEV0' | 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';

export interface DecisionActionState {
  readonly enabled: boolean;
  readonly reason: string | null;
  readonly permittedActions: DecisionAction[];
}

export interface DecisionModel {
  readonly decisionId: string;
  readonly priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
  readonly decisionClass: string;
  readonly title: string;
  readonly explanation: string;
  readonly recommendation: DecisionAction;
  readonly expectedBenefit: string;
  readonly risk: DecisionRiskClass;
  readonly deadline: string;
  readonly affectedScope: string[];
  readonly authorityRequired: string;
  readonly staleEvidence: boolean;
  readonly policyKnown: boolean;
  readonly expired: boolean;
  readonly superseded: boolean;
  readonly securityValidationResolved: boolean;
  readonly actionState: DecisionActionState;
}

export interface IncidentModel {
  readonly severity: IncidentSeverity;
  readonly title: string;
  readonly businessImpact: string;
  readonly affectedScopes: string[];
  readonly status: string;
  readonly autonomousAction: string;
  readonly decisionRequired: boolean;
  readonly duration: string;
  readonly recoveryStatus: string;
}

export interface ExecutiveDashboardModel {
  readonly dataMode: DataMode;
  readonly modeNote: string;
  readonly scenario: string;
  readonly state: ViewState;
  readonly platformStatus: PlatformStatus;
  readonly platformExplanation: string;
  readonly lastVerified: string;
  readonly executiveActionRequired: boolean;
  readonly criticalBlockers: string[];
  readonly highestPriority: string;
  readonly activeIncidents: number;
  readonly autonomousActions: string[];
  readonly blockedScopes: string[];
  readonly changeFreeze: {
    readonly state: 'NONE' | 'PARTIAL' | 'FULL' | 'SECURITY' | 'EMERGENCY';
    readonly reason: string | null;
    readonly scope: string[];
    readonly started: string | null;
    readonly releaseConditions: string[];
    readonly releaseEligibility: boolean;
    readonly requiredAuthority: string;
  };
  readonly riskCenter: Record<'Operational' | 'Security' | 'Provider' | 'Data' | 'Publication' | 'Commercial' | 'Financial' | 'Dependency' | 'Continuity', DecisionRiskClass>;
  readonly decisions: DecisionModel[];
  readonly incidents: IncidentModel[];
  readonly products: Array<{
    readonly product: string;
    readonly readiness: string;
    readonly runtime: string;
    readonly publication: string;
    readonly commercial: string;
    readonly dependency: string;
    readonly slo: string;
    readonly decisionRequired: boolean;
  }>;
  readonly providers: Array<{
    readonly provider: string;
    readonly health: string;
    readonly dependencyLevel: string;
    readonly affectedProducts: string[];
    readonly contractStatus: string;
    readonly credentialStatus: string;
    readonly costRisk: DecisionRiskClass;
    readonly decisionRequired: boolean;
  }>;
  readonly publication: {
    readonly state: string;
    readonly eligibleProducts: string[];
    readonly blockedProducts: string[];
    readonly channels: string[];
    readonly blockReasons: Record<string, string>;
    readonly freezeState: string;
    readonly decisionRequired: boolean;
  };
  readonly commercial: {
    readonly state: string;
    readonly eligibleProducts: string[];
    readonly eligibleChannels: string[];
    readonly blockedChannels: string[];
    readonly providerDependencies: string[];
    readonly billingDependencies: string[];
    readonly contractDependencies: string[];
    readonly risk: DecisionRiskClass;
    readonly decisionRequired: boolean;
  };
  readonly security: {
    readonly status: string;
    readonly activeIncidents: number;
    readonly credentialRisk: DecisionRiskClass;
    readonly policyViolations: string[];
    readonly freezeState: string;
    readonly executiveActionRequired: boolean;
  };
  readonly briefing: {
    readonly whatChanged: string;
    readonly whyItMatters: string;
    readonly whatSystemDid: string;
    readonly whatRemainsBlocked: string;
    readonly decisionRequired: string;
    readonly recommendation: string;
    readonly risks: string;
    readonly deadline: string;
  };
  readonly auditTimeline: string[];
  readonly evidence: Array<{
    readonly evidenceId: string;
    readonly sourceStage: string;
    readonly policyVersion: string;
    readonly generatedTime: string;
    readonly verification: string;
    readonly auditReference: string;
  }>;
}
