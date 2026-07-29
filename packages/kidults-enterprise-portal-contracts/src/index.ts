export type PortalState =
  | "loading"
  | "ready"
  | "empty"
  | "partial"
  | "degraded"
  | "unauthorized"
  | "rights_restricted"
  | "error";

export interface TrustSurface {
  confidenceGrade: "A" | "B" | "C" | "D" | "U";
  confidenceScore: number;
  sourceCoverage: number;
  evidenceCount: number;
  methodologyId: string;
  methodologyVersion: string;
  methodologyStatus: "draft" | "approved" | "active" | "deprecated" | "retired";
  rightsStatus: "unknown" | "restricted" | "approved" | "expired" | "disputed";
  freshnessMinutes: number;
  updatedAt: string;
}

export interface EnterpriseMetric {
  metricId: string;
  label: string;
  value: number;
  unit?: string;
  change?: number;
  trust: TrustSurface;
}

export interface EnterprisePortalSnapshot {
  state: PortalState;
  asOf: string;
  kidult100?: EnterpriseMetric;
  brandMomentum: EnterpriseMetric[];
  canonStrength: EnterpriseMetric[];
  liquidityGrades: EnterpriseMetric[];
  categoryIntelligence: EnterpriseMetric[];
  notices: string[];
  illustrative: boolean;
}

export interface VisibilityDecision {
  visible: boolean;
  state: PortalState;
  reasons: string[];
}

export function evaluateEnterpriseVisibility(trust: TrustSurface): VisibilityDecision {
  const reasons: string[] = [];
  if (trust.rightsStatus !== "approved") reasons.push("rights_not_approved");
  if (!['approved', 'active'].includes(trust.methodologyStatus)) reasons.push("methodology_not_approved");
  if (trust.confidenceScore < 70) reasons.push("confidence_below_70");
  if (trust.evidenceCount < 1) reasons.push("evidence_missing");

  if (reasons.includes("rights_not_approved")) {
    return { visible: false, state: "rights_restricted", reasons };
  }
  if (reasons.length > 0) {
    return { visible: false, state: "partial", reasons };
  }
  return { visible: true, state: "ready", reasons: [] };
}

export function buildEnterprisePortalSnapshot(
  asOf: string,
  metrics: EnterpriseMetric[],
  illustrative = true,
): EnterprisePortalSnapshot {
  const visible = metrics.filter((metric) => evaluateEnterpriseVisibility(metric.trust).visible);
  const byPrefix = (prefix: string) => visible.filter((metric) => metric.metricId.startsWith(prefix));
  return {
    state: visible.length === 0 ? "empty" : visible.length < metrics.length ? "partial" : "ready",
    asOf,
    kidult100: visible.find((metric) => metric.metricId === "kidult100"),
    brandMomentum: byPrefix("brand_momentum:"),
    canonStrength: byPrefix("canon_strength:"),
    liquidityGrades: byPrefix("liquidity_grade:"),
    categoryIntelligence: byPrefix("category:"),
    notices: illustrative ? ["Illustrative staging values. Production promotion is separately gated."] : [],
    illustrative,
  };
}
