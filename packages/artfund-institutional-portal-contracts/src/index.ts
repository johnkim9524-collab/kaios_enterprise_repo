export type InstitutionalPortalState =
  | "loading"
  | "ready"
  | "empty"
  | "partial"
  | "degraded"
  | "unauthorized"
  | "rights_restricted"
  | "provenance_disputed"
  | "error";

export type ConfidenceGrade = "A" | "B" | "C" | "D" | "U";

export interface InstitutionalTrustSurface {
  confidenceGrade: ConfidenceGrade;
  confidenceScore: number;
  sourceCoverage: number;
  evidenceCount: number;
  methodologyId: string;
  methodologyVersion: string;
  methodologyStatus: "draft" | "approved" | "active" | "deprecated" | "retired";
  rightsStatus: "unknown" | "restricted" | "approved" | "expired" | "disputed";
  freshness: "fresh" | "aging" | "stale" | "unknown";
  provenanceCompleteness: number;
  provenanceDisputed: boolean;
  updatedAt: string;
}

export interface InstitutionalMetric {
  metricId: string;
  label: string;
  value: number;
  unit: "index" | "score" | "percent" | "count";
  direction?: "up" | "down" | "flat";
  change?: number;
  asOf: string;
  trust: InstitutionalTrustSurface;
}

export interface ArtfundInstitutionalSnapshot {
  vertical: "artfund";
  environment: "staging";
  illustrative: boolean;
  generatedAt: string;
  globalArtMarketIndex: InstitutionalMetric;
  artistMomentum: InstitutionalMetric[];
  auctionLiquidity: InstitutionalMetric[];
  provenanceStrength: InstitutionalMetric[];
  marketBreadth: InstitutionalMetric;
  segmentRotation: InstitutionalMetric[];
  decisionSignals: Array<{
    signalId: string;
    title: string;
    summary: string;
    severity: "low" | "moderate" | "high";
    trust: InstitutionalTrustSurface;
  }>;
}

export interface InstitutionalVisibilityDecision {
  state: InstitutionalPortalState;
  visible: boolean;
  reasons: string[];
}

export function decideInstitutionalVisibility(
  trust: InstitutionalTrustSurface,
  authenticated: boolean,
): InstitutionalVisibilityDecision {
  if (!authenticated) {
    return { state: "unauthorized", visible: false, reasons: ["authentication_required"] };
  }

  if (trust.rightsStatus === "unknown" || trust.rightsStatus === "restricted") {
    return { state: "rights_restricted", visible: false, reasons: ["commercial_rights_not_approved"] };
  }

  if (trust.provenanceDisputed) {
    return { state: "provenance_disputed", visible: false, reasons: ["provenance_disputed"] };
  }

  if (trust.methodologyStatus === "draft") {
    return { state: "partial", visible: false, reasons: ["methodology_not_approved"] };
  }

  if (trust.confidenceScore < 70) {
    return { state: "degraded", visible: false, reasons: ["confidence_below_threshold"] };
  }

  if (trust.evidenceCount < 1) {
    return { state: "partial", visible: false, reasons: ["evidence_missing"] };
  }

  if (trust.freshness === "stale" || trust.freshness === "unknown") {
    return { state: "degraded", visible: true, reasons: ["freshness_degraded"] };
  }

  return { state: "ready", visible: true, reasons: [] };
}

export function buildInstitutionalPortalState(
  snapshot: ArtfundInstitutionalSnapshot | null,
  authenticated: boolean,
): InstitutionalPortalState {
  if (!authenticated) return "unauthorized";
  if (!snapshot) return "empty";

  const decisions = [
    snapshot.globalArtMarketIndex,
    ...snapshot.artistMomentum,
    ...snapshot.auctionLiquidity,
    ...snapshot.provenanceStrength,
    snapshot.marketBreadth,
    ...snapshot.segmentRotation,
  ].map((metric) => decideInstitutionalVisibility(metric.trust, authenticated));

  if (decisions.some((decision) => decision.state === "provenance_disputed")) {
    return "provenance_disputed";
  }
  if (decisions.some((decision) => decision.state === "rights_restricted")) {
    return "rights_restricted";
  }
  if (decisions.every((decision) => decision.visible)) {
    return decisions.some((decision) => decision.state === "degraded") ? "degraded" : "ready";
  }
  return "partial";
}
