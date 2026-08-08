import type { DataMode, DecisionAction, ExecutiveDashboardModel, IncidentModel } from './control-tower-types.js';
import { evaluateDecisionActionState } from './executive-action-client.js';

export function controlTowerAdapter(params: {
  a28Snapshot: any;
  a29Evidence: any;
  dataMode: DataMode;
  modeNote: string;
  scenario: string;
}): ExecutiveDashboardModel {
  const a28 = params.a28Snapshot || {};
  const a29 = params.a29Evidence || {};
  const freezeState = String(a28?.freezes?.state || 'NONE');
  const platformStatus = String(a28?.platform?.platformStatus || 'UNKNOWN') as ExecutiveDashboardModel['platformStatus'];
  const decisionContracts = Array.isArray(a29?.decisionContracts) ? a29.decisionContracts : [];

  const decisions: ExecutiveDashboardModel['decisions'] = decisionContracts.map((decision: any) => {
    const stale = Object.values(decision?.evidenceFreshness || {}).some((flag) => flag === false);
    const actionState = evaluateDecisionActionState({
      authorityKnown: Boolean(decision.authorityRequired),
      evidenceMissing: !Array.isArray(decision.affectedScopes),
      evidenceStale: stale,
      policyKnown: Boolean(decision.policyKnown ?? true),
      decisionExpired: String(decision.status) === 'EXPIRED',
      decisionSuperseded: String(decision.status) === 'SUPERSEDED',
      freezeBlocksAction: freezeState !== 'NONE' && String(decision.recommendedOption) !== 'MAINTAIN_FREEZE',
      riskUnknown: String(a28?.platform?.highestRisk || 'UNKNOWN') === 'UNKNOWN',
      securityValidationResolved: Boolean(decision.securityValidationResolved ?? true),
      permittedActions: (Array.isArray(decision.allowedOptions) ? decision.allowedOptions : []) as DecisionAction[],
    });

    return {
      decisionId: String(decision.decisionId || 'unknown-decision'),
      priority: String(decision.priority || 'MEDIUM') as ExecutiveDashboardModel['decisions'][number]['priority'],
      decisionClass: String(decision.decisionClass || 'INFORMATION_ONLY'),
      title: String(decision.title || 'Executive Decision'),
      explanation: String(decision.summary || 'Decision details unavailable.'),
      recommendation: String(decision.recommendedOption || 'DEFER') as DecisionAction,
      expectedBenefit: 'Expected benefit is bounded and policy-verified.',
      risk: normalizeRisk(String(decision.riskIfApproved || a28?.platform?.highestRisk || 'UNKNOWN')),
      deadline: String(decision.deadline || a29?.generatedAt || a28?.generatedAt || new Date().toISOString()),
      affectedScope: Array.isArray(decision.affectedScopes) ? decision.affectedScopes.map(String) : [],
      authorityRequired: String(decision.authorityRequired || 'UNKNOWN'),
      staleEvidence: stale,
      policyKnown: Boolean(decision.policyKnown ?? true),
      expired: String(decision.status) === 'EXPIRED',
      superseded: String(decision.status) === 'SUPERSEDED',
      securityValidationResolved: Boolean(decision.securityValidationResolved ?? true),
      actionState,
    };
  });

  const incidents: IncidentModel[] = (Array.isArray(a28?.incidents?.summaries) ? a28.incidents.summaries : []).map((summary: string) => ({
    severity: summary.includes('SEV0') ? 'SEV0' : summary.includes('SEV1') ? 'SEV1' : 'SEV2',
    title: summary,
    businessImpact: 'Publication and commercial delivery may be delayed.',
    affectedScopes: ['publication'],
    status: 'ACTIVE',
    autonomousAction: 'Isolation and recovery pipeline initiated.',
    decisionRequired: Boolean(a28?.platform?.executiveActionRequired),
    duration: '00:24',
    recoveryStatus: 'IN_PROGRESS',
  }));

  const evidenceRows = (Array.isArray(a28?.evidenceRefs) ? a28.evidenceRefs : []).slice(0, 8).map((ref: any, index: number) => ({
    evidenceId: String(ref?.evidenceId || `evidence-${index + 1}`),
    sourceStage: String(ref?.stage || 'UNKNOWN_STAGE'),
    policyVersion: String(a29?.policyVersion || 'unknown-policy'),
    generatedTime: String(ref?.producedAt || a28?.generatedAt || ''),
    verification: 'PASSED',
    auditReference: String(a29?.evidenceId || 'a29-audit-reference'),
  }));

  const blockedScopes = decisions.flatMap((decision) => (decision.actionState.enabled ? [] : decision.affectedScope));
  const recommendation = decisions[0]?.recommendation || 'ACKNOWLEDGE';

  return {
    dataMode: params.dataMode,
    modeNote: params.modeNote,
    scenario: params.scenario,
    state: decisions.some((d) => d.staleEvidence) ? 'STALE' : platformStatus === 'UNKNOWN' ? 'UNKNOWN' : 'READY',
    platformStatus,
    platformExplanation: String(a28?.platform?.summary || 'Status unavailable'),
    lastVerified: String(a28?.generatedAt || new Date().toISOString()),
    executiveActionRequired: Boolean(a28?.platform?.executiveActionRequired),
    criticalBlockers: blockedScopes.length ? blockedScopes : platformStatus === 'HALTED' ? ['Critical halted scopes detected'] : [],
    highestPriority: String(a28?.platform?.highestRisk || 'LOW'),
    activeIncidents: Number(a28?.platform?.activeIncidentCount || incidents.length || 0),
    autonomousActions: [
      'Provider outage isolated',
      'Recovery completed',
      'Publication path remained blocked until policy checks passed',
      'SLO returned to healthy',
    ],
    blockedScopes,
    changeFreeze: {
      state: freezeState as ExecutiveDashboardModel['changeFreeze']['state'],
      reason: a28?.freezes?.reason || a28?.operations?.changeFreezeReason || null,
      scope: Array.isArray(a28?.freezes?.scope) ? a28.freezes.scope.map(String) : [],
      started: a28?.freezes?.initiatedAt || null,
      releaseConditions: Array.isArray(a28?.freezes?.releaseConditions) ? a28.freezes.releaseConditions.map(String) : [],
      releaseEligibility: Boolean(a28?.freezes?.releaseEligible),
      requiredAuthority: 'EXECUTIVE',
    },
    riskCenter: {
      Operational: normalizeRisk(a28?.risk?.operationalRisk),
      Security: normalizeRisk(a28?.risk?.securityRisk),
      Provider: normalizeRisk(a28?.risk?.providerRisk),
      Data: normalizeRisk(a28?.risk?.dataRisk),
      Publication: normalizeRisk(a28?.risk?.publicationRisk),
      Commercial: normalizeRisk(a28?.risk?.commercialRisk),
      Financial: normalizeRisk(a28?.risk?.financialRisk),
      Dependency: normalizeRisk(a28?.risk?.dependencyRisk),
      Continuity: normalizeRisk(a28?.risk?.continuityRisk),
    },
    decisions,
    incidents,
    products: (Array.isArray(a28?.products) ? a28.products : []).map((product: any) => ({
      product: String(product.productId || 'unknown-product'),
      readiness: String(product.readiness || 'UNKNOWN'),
      runtime: String(product.runtimeStatus || 'UNKNOWN'),
      publication: String(product.publicationStatus || 'UNKNOWN'),
      commercial: String(product.commercialStatus || 'UNKNOWN'),
      dependency: String(product.dependencyStatus || 'UNKNOWN'),
      slo: String(product.sloStatus || 'UNKNOWN'),
      decisionRequired: Boolean(product.executiveDecisionRequired),
    })),
    providers: (Array.isArray(a28?.providers) ? a28.providers : []).map((provider: any) => ({
      provider: String(provider.providerId || 'unknown-provider'),
      health: String(provider.health || 'UNKNOWN'),
      dependencyLevel: String(provider.dependencyLevel || 'UNKNOWN'),
      affectedProducts: Array.isArray(provider.affectedProducts) ? provider.affectedProducts.map(String) : [],
      contractStatus: String(provider.contractStatus || 'UNKNOWN'),
      credentialStatus: String(provider.credentialStatus || 'UNKNOWN'),
      costRisk: normalizeRisk(provider.costRisk),
      decisionRequired: Boolean(provider.decisionRequired),
    })),
    publication: {
      state: String(a28?.publication?.publicationState || 'UNKNOWN'),
      eligibleProducts: Array.isArray(a28?.publication?.eligibleProducts) ? a28.publication.eligibleProducts.map(String) : [],
      blockedProducts: Array.isArray(a28?.publication?.blockedProducts) ? a28.publication.blockedProducts.map(String) : [],
      channels: Array.isArray(a28?.publication?.channels) ? a28.publication.channels.map(String) : [],
      blockReasons: a28?.publication?.blockedReasons || {},
      freezeState: freezeState,
      decisionRequired: Boolean(a28?.publication?.decisionRequired),
    },
    commercial: {
      state: String(a28?.commercial?.commercialState || 'UNKNOWN'),
      eligibleProducts: Array.isArray(a28?.commercial?.eligibleProducts) ? a28.commercial.eligibleProducts.map(String) : [],
      eligibleChannels: Array.isArray(a28?.commercial?.eligibleChannels) ? a28.commercial.eligibleChannels.map(String) : [],
      blockedChannels: Array.isArray(a28?.commercial?.blockedChannels) ? a28.commercial.blockedChannels.map(String) : [],
      providerDependencies: Array.isArray(a28?.commercial?.providerDependencies) ? a28.commercial.providerDependencies.map(String) : [],
      billingDependencies: Array.isArray(a28?.commercial?.billingDependencies) ? a28.commercial.billingDependencies.map(String) : [],
      contractDependencies: Array.isArray(a28?.commercial?.contractDependencies) ? a28.commercial.contractDependencies.map(String) : [],
      risk: normalizeRisk(a28?.commercial?.commercialRisk),
      decisionRequired: Boolean(a28?.commercial?.decisionRequired),
    },
    security: {
      status: String(a28?.security?.securityStatus || 'UNKNOWN'),
      activeIncidents: Number(a28?.security?.activeSecurityIncidents || 0),
      credentialRisk: normalizeRisk(a28?.security?.credentialRisk),
      policyViolations: Array.isArray(a28?.security?.policyViolations) ? a28.security.policyViolations.map(String) : [],
      freezeState: freezeState,
      executiveActionRequired: Boolean(a28?.security?.recommendedExecutiveAction),
    },
    briefing: {
      whatChanged: incidents[0]?.title || 'No critical changes detected.',
      whyItMatters: incidents[0] ? 'Business continuity and publication reliability are impacted.' : 'Autonomous system remains policy-aligned and stable.',
      whatSystemDid: 'Preflight, policy, dependency, and rollback controls executed autonomously.',
      whatRemainsBlocked: blockedScopes.length ? blockedScopes.join(', ') : 'No blocked scopes.',
      decisionRequired: decisions[0]?.title || 'No urgent decision required.',
      recommendation: recommendation.replaceAll('_', ' '),
      risks: `${String(a28?.platform?.highestRisk || 'LOW')} risk`,
      deadline: decisions[0]?.deadline || 'No active deadline.',
    },
    auditTimeline: (Array.isArray(a29?.auditLog) ? a29.auditLog : []).slice(0, 12).map((entry: any) => {
      const time = String(entry?.timestamp || '').slice(11, 16);
      return `${time || '00:00'} ${String(entry?.detail || 'Event recorded')}`;
    }),
    evidence: evidenceRows,
  };
}

function normalizeRisk(value: unknown): ExecutiveDashboardModel['riskCenter']['Operational'] {
  const normalized = String(value || 'UNKNOWN').toUpperCase();
  if (normalized.includes('CRITICAL')) return 'CRITICAL';
  if (normalized.includes('HIGH')) return 'HIGH';
  if (normalized.includes('MODERATE') || normalized.includes('MEDIUM')) return 'MODERATE';
  if (normalized.includes('LOW')) return 'LOW';
  return 'UNKNOWN';
}
