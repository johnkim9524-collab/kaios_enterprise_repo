export type ControlTowerScenario =
  | 'healthy'
  | 'decision-required'
  | 'provider-outage'
  | 'sev1-incident'
  | 'change-freeze'
  | 'decision-executing'
  | 'decision-verified'
  | 'rollback-completed'
  | 'critical-halt';

export const CONTROL_TOWER_SCENARIOS: readonly ControlTowerScenario[] = [
  'healthy',
  'decision-required',
  'provider-outage',
  'sev1-incident',
  'change-freeze',
  'decision-executing',
  'decision-verified',
  'rollback-completed',
  'critical-halt',
] as const;

type A28Fixture = {
  snapshotId: string;
  generatedAt: string;
  platform: {
    platformStatus: string;
    summary: string;
    executiveActionRequired: boolean;
    highestRisk: string;
    activeDecisionCount: number;
    activeIncidentCount: number;
    degradedScopeCount: number;
    haltedScopeCount: number;
  };
  metrics: {
    activeDecisionCount: number;
    activeIncidentCount: number;
    degradedScopeCount: number;
    haltedScopeCount: number;
  };
  operations: { changeFreezeActive: boolean; changeFreezeReason: string | null };
  freezes: {
    state: string;
    reason: string | null;
    scope: string[];
    initiatedAt: string | null;
    releaseConditions: string[];
    releaseEligible: boolean;
  };
  risk: {
    operationalRisk: string;
    securityRisk: string;
    providerRisk: string;
    dataRisk: string;
    publicationRisk: string;
    commercialRisk: string;
    financialRisk: string;
    dependencyRisk: string;
    continuityRisk: string;
  };
  products: Array<{
    productId: string;
    readiness: string;
    runtimeStatus: string;
    publicationStatus: string;
    commercialStatus: string;
    dependencyStatus: string;
    sloStatus: string;
    executiveDecisionRequired: boolean;
  }>;
  providers: Array<{
    providerId: string;
    health: string;
    dependencyLevel: string;
    affectedProducts: string[];
    contractStatus: string;
    credentialStatus: string;
    costRisk: string;
    decisionRequired: boolean;
  }>;
  publication: {
    publicationState: string;
    eligibleProducts: string[];
    blockedProducts: string[];
    channels: string[];
    blockedReasons: Record<string, string>;
    activeFreeze: boolean;
    decisionRequired: boolean;
  };
  commercial: {
    commercialState: string;
    eligibleProducts: string[];
    eligibleChannels: string[];
    blockedChannels: string[];
    providerDependencies: string[];
    billingDependencies: string[];
    contractDependencies: string[];
    commercialRisk: string;
    decisionRequired: boolean;
  };
  security: {
    securityStatus: string;
    activeSecurityIncidents: number;
    credentialRisk: string;
    policyViolations: string[];
    changeFreeze: boolean;
    recommendedExecutiveAction: string | null;
  };
  incidents: { activeCount: number; summaries: string[] };
  evidenceRefs: Array<{ stage: string; evidenceId: string; producedAt: string }>;
};

type A29Fixture = {
  evidenceId: string;
  generatedAt: string;
  policyVersion: string;
  decisionContracts: Array<Record<string, unknown>>;
  auditLog: Array<{ timestamp: string; detail: string }>;
};

const now = '2026-08-08T20:33:39.945Z';

const baseA28: A28Fixture = {
  snapshotId: 'a28-control-tower-demo',
  generatedAt: now,
  platform: {
    platformStatus: 'HEALTHY',
    summary: 'Platform is healthy. Autonomous operations are active.',
    executiveActionRequired: false,
    highestRisk: 'LOW',
    activeDecisionCount: 0,
    activeIncidentCount: 0,
    degradedScopeCount: 0,
    haltedScopeCount: 0,
  },
  metrics: {
    activeDecisionCount: 0,
    activeIncidentCount: 0,
    degradedScopeCount: 0,
    haltedScopeCount: 0,
  },
  operations: { changeFreezeActive: false, changeFreezeReason: null },
  freezes: {
    state: 'NONE',
    reason: null,
    scope: [],
    initiatedAt: null,
    releaseConditions: [],
    releaseEligible: false,
  },
  risk: {
    operationalRisk: 'LOW',
    securityRisk: 'LOW',
    providerRisk: 'LOW',
    dataRisk: 'LOW',
    publicationRisk: 'LOW',
    commercialRisk: 'LOW',
    financialRisk: 'LOW',
    dependencyRisk: 'LOW',
    continuityRisk: 'LOW',
  },
  products: [{
    productId: 'kidults-intelligence-core', readiness: 'READY', runtimeStatus: 'ACTIVE', publicationStatus: 'PUBLISHED',
    commercialStatus: 'LIVE', dependencyStatus: 'SATISFIED', sloStatus: 'HEALTHY', executiveDecisionRequired: false,
  }],
  providers: [{
    providerId: 'provider-alpha', health: 'HEALTHY', dependencyLevel: 'HIGH', affectedProducts: ['kidults-intelligence-core'],
    contractStatus: 'ACTIVE', credentialStatus: 'VALID', costRisk: 'LOW', decisionRequired: false,
  }],
  publication: {
    publicationState: 'ACTIVE', eligibleProducts: ['kidults-intelligence-core'], blockedProducts: [], channels: ['api', 'dashboard'],
    blockedReasons: {}, activeFreeze: false, decisionRequired: false,
  },
  commercial: {
    commercialState: 'ACTIVE', eligibleProducts: ['kidults-intelligence-core'], eligibleChannels: ['direct', 'partner'],
    blockedChannels: [], providerDependencies: ['provider-alpha'], billingDependencies: ['billing-account-primary'],
    contractDependencies: ['contract-v2'], commercialRisk: 'LOW', decisionRequired: false,
  },
  security: {
    securityStatus: 'SECURE', activeSecurityIncidents: 0, credentialRisk: 'LOW', policyViolations: [], changeFreeze: false,
    recommendedExecutiveAction: null,
  },
  incidents: { activeCount: 0, summaries: [] },
  evidenceRefs: [{
    stage: 'A28', evidenceId: 'a28-control-tower-evidence', producedAt: now,
  }],
};

const baseA29: A29Fixture = {
  evidenceId: 'a29-executive-decision-demo',
  generatedAt: now,
  policyVersion: 'a29-executive-decision-orchestration-policy.v1',
  decisionContracts: [],
  auditLog: [
    { timestamp: '2026-08-08T10:01:00.000Z', detail: 'Decision generated' },
    { timestamp: '2026-08-08T10:02:00.000Z', detail: 'Preflight passed' },
    { timestamp: '2026-08-08T10:03:00.000Z', detail: 'Verification passed' },
  ],
};

export function buildControlTowerFixture(scenario: ControlTowerScenario) {
  const a28: A28Fixture = structuredClone(baseA28);
  const a29: A29Fixture = structuredClone(baseA29);

  if (scenario === 'decision-required') {
    a28.platform.executiveActionRequired = true;
    a28.platform.activeDecisionCount = 1;
    a28.metrics.activeDecisionCount = 1;
    a28.platform.highestRisk = 'MODERATE';
    a29.decisionContracts.push({
      decisionId: 'dec-provider-expansion',
      priority: 'HIGH',
      decisionClass: 'PROVIDER_DECISION',
      title: 'Provider Expansion Required',
      summary: 'Transaction-pricing coverage can increase, but external provider evidence is required.',
      recommendedOption: 'APPROVE_LIMITED_SCOPE',
      allowedOptions: ['APPROVE_LIMITED_SCOPE', 'DEFER', 'REJECT'],
      riskIfApproved: 'Moderate',
      affectedScopes: ['transaction-pricing'],
      authorityRequired: 'EXECUTIVE',
      deadline: '2026-08-09T17:00:00.000Z',
      status: 'AWAITING_DECISION',
      evidenceFreshness: { a28: true, a29: true },
      policyKnown: true,
      securityValidationResolved: true,
    });
  }

  if (scenario === 'provider-outage') {
    a28.platform.platformStatus = 'DEGRADED';
    a28.platform.summary = 'Provider outage isolated. Recovery in progress.';
    a28.risk.providerRisk = 'HIGH';
    a28.providers[0].health = 'DEGRADED';
    a28.providers[0].costRisk = 'MODERATE';
  }

  if (scenario === 'sev1-incident') {
    a28.platform.platformStatus = 'AT_RISK';
    a28.platform.activeIncidentCount = 1;
    a28.metrics.activeIncidentCount = 1;
    a28.incidents.activeCount = 1;
    a28.incidents.summaries = ['SEV1 ingestion latency escalation affecting publication windows'];
  }

  if (scenario === 'change-freeze') {
    a28.operations.changeFreezeActive = true;
    a28.operations.changeFreezeReason = 'Security containment';
    a28.freezes.state = 'SECURITY';
    a28.freezes.reason = 'Containment pending verification';
    a28.freezes.scope = ['publication', 'commercial'];
    a28.freezes.initiatedAt = '2026-08-08T19:40:00.000Z';
    a28.freezes.releaseConditions = ['Security verification passed', 'Executive approval'];
    a28.freezes.releaseEligible = false;
  }

  if (scenario === 'decision-executing') {
    a28.platform.executiveActionRequired = true;
    a28.platform.activeDecisionCount = 1;
    a28.metrics.activeDecisionCount = 1;
    a29.decisionContracts.push({
      decisionId: 'dec-runtime-resume',
      priority: 'CRITICAL',
      decisionClass: 'PRODUCTION_DECISION',
      title: 'Resume Runtime Scope',
      summary: 'Resume bounded runtime after validation.',
      recommendedOption: 'RESUME_SCOPE',
      allowedOptions: ['RESUME_SCOPE', 'DEFER'],
      riskIfApproved: 'Low',
      affectedScopes: ['runtime-eu-west'],
      authorityRequired: 'EXECUTIVE',
      deadline: '2026-08-08T21:30:00.000Z',
      status: 'EXECUTING',
      evidenceFreshness: { a28: true, a29: true },
      policyKnown: true,
      securityValidationResolved: true,
    });
  }

  if (scenario === 'decision-verified') {
    a29.auditLog.push({ timestamp: '2026-08-08T10:03:00.000Z', detail: 'Decision closed' });
  }

  if (scenario === 'rollback-completed') {
    a28.platform.platformStatus = 'DEGRADED';
    a28.platform.summary = 'Rollback completed; bounded scope remains paused.';
    a28.risk.operationalRisk = 'MODERATE';
    a29.auditLog.push({ timestamp: '2026-08-08T10:03:00.000Z', detail: 'Rollback completed' });
  }

  if (scenario === 'critical-halt') {
    a28.platform.platformStatus = 'HALTED';
    a28.platform.summary = 'Critical halt enforced by policy.';
    a28.platform.haltedScopeCount = 2;
    a28.metrics.haltedScopeCount = 2;
    a28.risk.operationalRisk = 'CRITICAL';
    a28.risk.continuityRisk = 'CRITICAL';
  }

  return { a28, a29 };
}
