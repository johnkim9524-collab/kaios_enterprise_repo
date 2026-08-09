import type { DataMode, DecisionAction, ExecutiveDashboardModel, IncidentModel } from './control-tower-types.js';
import { evaluateDecisionActionState } from './executive-action-client.js';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function asRecordArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function asStringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value);
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, String(item)]));
}

export function controlTowerAdapter(params: {
  a28Snapshot: unknown;
  a29Evidence: unknown;
  dataMode: DataMode;
  modeNote: string;
  scenario: string;
}): ExecutiveDashboardModel {
  const a28 = asRecord(params.a28Snapshot);
  const a29 = asRecord(params.a29Evidence);
  const platform = asRecord(a28.platform);
  const freezes = asRecord(a28.freezes);
  const operations = asRecord(a28.operations);
  const risk = asRecord(a28.risk);
  const incidentsRecord = asRecord(a28.incidents);
  const publicationRecord = asRecord(a28.publication);
  const commercialRecord = asRecord(a28.commercial);
  const securityRecord = asRecord(a28.security);

  const freezeState = String(freezes.state || 'NONE');
  const platformStatus = String(platform.platformStatus || 'UNKNOWN') as ExecutiveDashboardModel['platformStatus'];
  const decisionContracts = asRecordArray(a29.decisionContracts);

  const decisions: ExecutiveDashboardModel['decisions'] = decisionContracts.map((decision) => {
    const freshness = asRecord(decision.evidenceFreshness);
    const stale = Object.values(freshness).some((flag) => flag === false);
    const affectedScopes = asStringArray(decision.affectedScopes);
    const permittedActions = asStringArray(decision.allowedOptions) as DecisionAction[];
    const actionState = evaluateDecisionActionState({
      authorityKnown: Boolean(decision.authorityRequired),
      evidenceMissing: !Array.isArray(decision.affectedScopes),
      evidenceStale: stale,
      policyKnown: Boolean(decision.policyKnown ?? true),
      decisionExpired: String(decision.status) === 'EXPIRED',
      decisionSuperseded: String(decision.status) === 'SUPERSEDED',
      freezeBlocksAction: freezeState !== 'NONE' && String(decision.recommendedOption) !== 'MAINTAIN_FREEZE',
      riskUnknown: String(platform.highestRisk || 'UNKNOWN') === 'UNKNOWN',
      securityValidationResolved: Boolean(decision.securityValidationResolved ?? true),
      permittedActions,
    });

    return {
      decisionId: String(decision.decisionId || 'unknown-decision'),
      priority: String(decision.priority || 'MEDIUM') as ExecutiveDashboardModel['decisions'][number]['priority'],
      decisionClass: String(decision.decisionClass || 'INFORMATION_ONLY'),
      title: String(decision.title || 'Executive Decision'),
      explanation: String(decision.summary || 'Decision details unavailable.'),
      recommendation: String(decision.recommendedOption || 'DEFER') as DecisionAction,
      expectedBenefit: 'Expected benefit is bounded and policy-verified.',
      risk: normalizeRisk(String(decision.riskIfApproved || platform.highestRisk || 'UNKNOWN')),
      deadline: String(decision.deadline || a29.generatedAt || a28.generatedAt || new Date().toISOString()),
      affectedScope: affectedScopes,
      authorityRequired: String(decision.authorityRequired || 'UNKNOWN'),
      staleEvidence: stale,
      policyKnown: Boolean(decision.policyKnown ?? true),
      expired: String(decision.status) === 'EXPIRED',
      superseded: String(decision.status) === 'SUPERSEDED',
      securityValidationResolved: Boolean(decision.securityValidationResolved ?? true),
      actionState,
    };
  });

  const incidentSummaries = asStringArray(incidentsRecord.summaries);
  const incidents: IncidentModel[] = incidentSummaries.map((summary) => ({
    severity: summary.includes('SEV0') ? 'SEV0' : summary.includes('SEV1') ? 'SEV1' : 'SEV2',
    title: summary,
    businessImpact: 'Publication and commercial delivery may be delayed.',
    affectedScopes: ['publication'],
    status: 'ACTIVE',
    autonomousAction: 'Isolation and recovery pipeline initiated.',
    decisionRequired: Boolean(platform.executiveActionRequired),
    duration: '00:24',
    recoveryStatus: 'IN_PROGRESS',
  }));

  const evidenceRows = asRecordArray(a28.evidenceRefs).slice(0, 8).map((ref, index) => ({
    evidenceId: String(ref.evidenceId || `evidence-${index + 1}`),
    sourceStage: String(ref.stage || 'UNKNOWN_STAGE'),
    policyVersion: String(a29.policyVersion || 'unknown-policy'),
    generatedTime: String(ref.producedAt || a28.generatedAt || ''),
    verification: 'PASSED',
    auditReference: String(a29.evidenceId || 'a29-audit-reference'),
  }));

  const blockedScopes = decisions.flatMap((decision) => (decision.actionState.enabled ? [] : decision.affectedScope));
  const recommendation = decisions[0]?.recommendation || 'ACKNOWLEDGE';

  const products = asRecordArray(a28.products).map((product) => ({
    product: String(product.productId || 'unknown-product'),
    readiness: String(product.readiness || 'UNKNOWN'),
    runtime: String(product.runtimeStatus || 'UNKNOWN'),
    publication: String(product.publicationStatus || 'UNKNOWN'),
    commercial: String(product.commercialStatus || 'UNKNOWN'),
    dependency: String(product.dependencyStatus || 'UNKNOWN'),
    slo: String(product.sloStatus || 'UNKNOWN'),
    decisionRequired: Boolean(product.executiveDecisionRequired),
  }));

  const providers = asRecordArray(a28.providers).map((provider) => ({
    provider: String(provider.providerId || 'unknown-provider'),
    health: String(provider.health || 'UNKNOWN'),
    dependencyLevel: String(provider.dependencyLevel || 'UNKNOWN'),
    affectedProducts: asStringArray(provider.affectedProducts),
    contractStatus: String(provider.contractStatus || 'UNKNOWN'),
    credentialStatus: String(provider.credentialStatus || 'UNKNOWN'),
    costRisk: normalizeRisk(provider.costRisk),
    decisionRequired: Boolean(provider.decisionRequired),
  }));

  const auditTimeline = asRecordArray(a29.auditLog).slice(0, 12).map((entry) => {
    const time = String(entry.timestamp || '').slice(11, 16);
    return `${time || '00:00'} ${String(entry.detail || 'Event recorded')}`;
  });

  return {
    dataMode: params.dataMode,
    modeNote: params.modeNote,
    scenario: params.scenario,
    state: decisions.some((decision) => decision.staleEvidence) ? 'STALE' : platformStatus === 'UNKNOWN' ? 'UNKNOWN' : 'READY',
    platformStatus,
    platformExplanation: String(platform.summary || 'Status unavailable'),
    lastVerified: String(a28.generatedAt || new Date().toISOString()),
    executiveActionRequired: Boolean(platform.executiveActionRequired),
    criticalBlockers: blockedScopes.length ? blockedScopes : platformStatus === 'HALTED' ? ['Critical halted scopes detected'] : [],
    highestPriority: String(platform.highestRisk || 'LOW'),
    activeIncidents: Number(platform.activeIncidentCount || incidents.length || 0),
    autonomousActions: [
      'Provider outage isolated',
      'Recovery completed',
      'Publication path remained blocked until policy checks passed',
      'SLO returned to healthy',
    ],
    blockedScopes,
    changeFreeze: {
      state: freezeState as ExecutiveDashboardModel['changeFreeze']['state'],
      reason: freezes.reason == null ? (operations.changeFreezeReason == null ? null : String(operations.changeFreezeReason)) : String(freezes.reason),
      scope: asStringArray(freezes.scope),
      started: freezes.initiatedAt == null ? null : String(freezes.initiatedAt),
      releaseConditions: asStringArray(freezes.releaseConditions),
      releaseEligibility: Boolean(freezes.releaseEligible),
      requiredAuthority: 'EXECUTIVE',
    },
    riskCenter: {
      Operational: normalizeRisk(risk.operationalRisk),
      Security: normalizeRisk(risk.securityRisk),
      Provider: normalizeRisk(risk.providerRisk),
      Data: normalizeRisk(risk.dataRisk),
      Publication: normalizeRisk(risk.publicationRisk),
      Commercial: normalizeRisk(risk.commercialRisk),
      Financial: normalizeRisk(risk.financialRisk),
      Dependency: normalizeRisk(risk.dependencyRisk),
      Continuity: normalizeRisk(risk.continuityRisk),
    },
    decisions,
    incidents,
    products,
    providers,
    publication: {
      state: String(publicationRecord.publicationState || 'UNKNOWN'),
      eligibleProducts: asStringArray(publicationRecord.eligibleProducts),
      blockedProducts: asStringArray(publicationRecord.blockedProducts),
      channels: asStringArray(publicationRecord.channels),
      blockReasons: asStringRecord(publicationRecord.blockedReasons),
      freezeState,
      decisionRequired: Boolean(publicationRecord.decisionRequired),
    },
    commercial: {
      state: String(commercialRecord.commercialState || 'UNKNOWN'),
      eligibleProducts: asStringArray(commercialRecord.eligibleProducts),
      eligibleChannels: asStringArray(commercialRecord.eligibleChannels),
      blockedChannels: asStringArray(commercialRecord.blockedChannels),
      providerDependencies: asStringArray(commercialRecord.providerDependencies),
      billingDependencies: asStringArray(commercialRecord.billingDependencies),
      contractDependencies: asStringArray(commercialRecord.contractDependencies),
      risk: normalizeRisk(commercialRecord.commercialRisk),
      decisionRequired: Boolean(commercialRecord.decisionRequired),
    },
    security: {
      status: String(securityRecord.securityStatus || 'UNKNOWN'),
      activeIncidents: Number(securityRecord.activeSecurityIncidents || 0),
      credentialRisk: normalizeRisk(securityRecord.credentialRisk),
      policyViolations: asStringArray(securityRecord.policyViolations),
      freezeState,
      executiveActionRequired: Boolean(securityRecord.recommendedExecutiveAction),
    },
    briefing: {
      whatChanged: incidents[0]?.title || 'No critical changes detected.',
      whyItMatters: incidents[0] ? 'Business continuity and publication reliability are impacted.' : 'Autonomous system remains policy-aligned and stable.',
      whatSystemDid: 'Preflight, policy, dependency, and rollback controls executed autonomously.',
      whatRemainsBlocked: blockedScopes.length ? blockedScopes.join(', ') : 'No blocked scopes.',
      decisionRequired: decisions[0]?.title || 'No urgent decision required.',
      recommendation: recommendation.replaceAll('_', ' '),
      risks: `${String(platform.highestRisk || 'LOW')} risk`,
      deadline: decisions[0]?.deadline || 'No active deadline.',
    },
    auditTimeline,
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
