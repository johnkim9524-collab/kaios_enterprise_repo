/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: control-tower-live-adapter.ts
 *
 * Canonical live evidence adapter.
 * Aggregates A22–A29 upstream evidence into ExecutiveDashboardModel.
 * The UI must not perform governance calculations — this layer does it.
 */

import type {
  DataMode,
  EvidenceFreshnessEnvelope,
  FreshnessClass,
  GatewayHealthReport,
  HealthState,
  LiveSnapshotResponse,
  DecisionSummary,
  IncidentSummary,
  ProductSummary,
  ProviderSummary,
} from './gateway-types.js';

// ---------------------------------------------------------------------------
// Freshness Policy
// ---------------------------------------------------------------------------

const FRESH_WINDOW_MS   = 5  * 60 * 1000;   // 5 min
const AGING_WINDOW_MS   = 15 * 60 * 1000;   // 15 min
const STALE_CUTOFF_MS   = 30 * 60 * 1000;   // 30 min

export function classifyFreshness(generatedAt: string, nowMs: number): FreshnessClass {
  if (!generatedAt) return 'UNKNOWN';
  const age = nowMs - new Date(generatedAt).getTime();
  if (isNaN(age) || age < 0) return 'UNKNOWN';
  if (age < FRESH_WINDOW_MS)  return 'FRESH';
  if (age < AGING_WINDOW_MS)  return 'AGING';
  if (age < STALE_CUTOFF_MS)  return 'STALE';
  return 'STALE';
}

export function buildFreshnessEnvelope(params: {
  source: string;
  generatedAt: string;
  policyVersion: string;
  nowIso: string;
}): EvidenceFreshnessEnvelope {
  const nowMs = new Date(params.nowIso).getTime();
  const freshnessClass = classifyFreshness(params.generatedAt, nowMs);
  const staleAfterMs = new Date(params.generatedAt).getTime() + STALE_CUTOFF_MS;

  return {
    source: params.source,
    generatedAt: params.generatedAt,
    receivedAt: params.nowIso,
    freshnessClass,
    staleAfter: new Date(staleAfterMs).toISOString(),
    policyVersion: params.policyVersion,
    verificationStatus: freshnessClass === 'UNKNOWN' ? 'UNKNOWN' : 'VERIFIED',
  };
}

// ---------------------------------------------------------------------------
// Health Assessment
// ---------------------------------------------------------------------------

function classifyHealth(freshnessClass: FreshnessClass): HealthState {
  if (freshnessClass === 'FRESH')   return 'HEALTHY';
  if (freshnessClass === 'AGING')   return 'DEGRADED';
  if (freshnessClass === 'STALE')   return 'DEGRADED';
  return 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Adapter — converts raw upstream snapshots into LiveSnapshotResponse
// ---------------------------------------------------------------------------

export interface LiveAdapterInputs {
  /** A28 control tower snapshot */
  a28Snapshot: Record<string, unknown> | null;
  /** A29 active executive decisions */
  a29Evidence: Record<string, unknown> | null;
  /** A27 incident/SLO state */
  a27State?: Record<string, unknown> | null;
  /** A26 recovery state */
  a26State?: Record<string, unknown> | null;
  /** A25 runtime state */
  a25State?: Record<string, unknown> | null;
  /** A24 activation state */
  a24State?: Record<string, unknown> | null;
  /** A23 commercial state */
  a23State?: Record<string, unknown> | null;
  /** A22 publication state */
  a22State?: Record<string, unknown> | null;
  /** provider state */
  providerState?: Record<string, unknown> | null;
  /** security state */
  securityState?: Record<string, unknown> | null;
  dataMode: DataMode;
  policyVersion: string;
  nowIso: string;
}

export function buildLiveSnapshot(inputs: LiveAdapterInputs): LiveSnapshotResponse {
  const a28 = inputs.a28Snapshot ?? {};
  const a29 = inputs.a29Evidence ?? {};
  const nowIso = inputs.nowIso;

  const a28GeneratedAt = String(a28['generatedAt'] ?? nowIso);
  const freshness = buildFreshnessEnvelope({
    source: `a28:${String(a28['snapshotId'] ?? 'unknown')}`,
    generatedAt: a28GeneratedAt,
    policyVersion: inputs.policyVersion,
    nowIso,
  });

  const health: GatewayHealthReport = {
    gatewayHealth:       'HEALTHY',
    evidenceHealth:      classifyHealth(freshness.freshnessClass),
    orchestrationHealth: a29 && Object.keys(a29).length > 0 ? 'HEALTHY' : 'UNKNOWN',
    runtimeHealth:       inputs.a25State ? 'HEALTHY' : 'UNKNOWN',
  };

  const platform = (a28['platform'] as Record<string, unknown>) ?? {};
  const freezes  = (a28['freezes']  as Record<string, unknown>) ?? {};
  const incidents = (a28['incidents'] as Record<string, unknown>) ?? {};

  const decisionContracts = Array.isArray(a29['decisionContracts'])
    ? a29['decisionContracts'] as Record<string, unknown>[]
    : [];

  const activeDecisions: DecisionSummary[] = decisionContracts.map((d) => {
    const status = String(d['status'] ?? 'UNKNOWN');
    const blocked = ['EXPIRED', 'SUPERSEDED', 'CLOSED', 'INVALID'];
    const stale = Boolean((d['evidenceFreshness'] as Record<string, boolean> | undefined)?.['policyFresh'] === false);
    return {
      decisionId:         String(d['decisionId'] ?? 'unknown'),
      title:              String(d['title'] ?? 'Executive Decision'),
      priority:           String(d['priority'] ?? 'MEDIUM'),
      decisionClass:      String(d['decisionClass'] ?? 'INFORMATION_ONLY'),
      status,
      deadline:           String(d['deadline'] ?? nowIso),
      authorityRequired:  String(d['authorityRequired'] ?? 'EXECUTIVE'),
      risk:               String(d['riskIfApproved'] ?? 'UNKNOWN'),
      actionEnabled:      !blocked.includes(status) && !stale,
      actionBlockedReason: blocked.includes(status)
        ? `Decision is ${status}.`
        : stale ? 'Evidence is stale.' : null,
    };
  });

  const incidentSummaries = Array.isArray(incidents['summaries'])
    ? (incidents['summaries'] as Record<string, unknown>[]).map((i): IncidentSummary => ({
        severity:       String(i['severity'] ?? 'UNKNOWN'),
        title:          String(i['title'] ?? 'Incident'),
        businessImpact: String(i['businessImpact'] ?? ''),
        affectedScopes: Array.isArray(i['affectedScopes']) ? i['affectedScopes'].map(String) : [],
        status:         String(i['status'] ?? 'ACTIVE'),
      }))
    : [];

  const products = Array.isArray(a28['products'])
    ? (a28['products'] as Record<string, unknown>[]).map((p): ProductSummary => ({
        product:         String(p['product'] ?? ''),
        readiness:       String(p['readiness'] ?? 'UNKNOWN'),
        publication:     String(p['publication'] ?? 'UNKNOWN'),
        commercial:      String(p['commercial'] ?? 'UNKNOWN'),
        slo:             String(p['slo'] ?? 'UNKNOWN'),
        decisionRequired: Boolean(p['decisionRequired']),
      }))
    : [];

  const providers = Array.isArray(a28['providers'])
    ? (a28['providers'] as Record<string, unknown>[]).map((p): ProviderSummary => ({
        provider:        String(p['provider'] ?? ''),
        health:          String(p['health'] ?? 'UNKNOWN'),
        costRisk:        String(p['costRisk'] ?? 'UNKNOWN'),
        decisionRequired: Boolean(p['decisionRequired']),
      }))
    : [];

  const pub = (a28['publication'] as Record<string, unknown>) ?? {};
  const com = (a28['commercial'] as Record<string, unknown>) ?? {};
  const sec = (a28['security']  as Record<string, unknown>) ?? {};

  return {
    platformStatus:          String(platform['platformStatus'] ?? 'UNKNOWN'),
    executiveActionRequired: Boolean(platform['executiveActionRequired']),
    activeDecisions,
    activeIncidents:         incidentSummaries,
    autonomousActions:       Array.isArray(a28['autonomousActions']) ? a28['autonomousActions'].map(String) : [],
    blockedScopes:           Array.isArray(a28['blockedScopes']) ? a28['blockedScopes'].map(String) : [],
    risks:                   (a28['riskCenter'] as Record<string, string>) ?? {},
    products,
    providers,
    publication: {
      state:           String(pub['state'] ?? 'UNKNOWN'),
      decisionRequired: Boolean(pub['decisionRequired']),
      blockedProducts: Array.isArray(pub['blockedProducts']) ? pub['blockedProducts'].map(String) : [],
    },
    commercial: {
      state:           String(com['state'] ?? 'UNKNOWN'),
      risk:            String(com['risk'] ?? 'UNKNOWN'),
      decisionRequired: Boolean(com['decisionRequired']),
    },
    security: {
      status:                String(sec['status'] ?? 'UNKNOWN'),
      credentialRisk:        String(sec['credentialRisk'] ?? 'UNKNOWN'),
      executiveActionRequired: Boolean(sec['executiveActionRequired']),
    },
    freeze: {
      state:  String(freezes['state'] ?? 'NONE'),
      reason: (freezes['reason'] as string | null) ?? null,
      scope:  Array.isArray(freezes['scope']) ? freezes['scope'].map(String) : [],
    },
    dataMode:      inputs.dataMode,
    freshness,
    generatedAt:   nowIso,
    policyVersion: inputs.policyVersion,
    health,
  };
}
