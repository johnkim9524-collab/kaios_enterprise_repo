export type Vertical = "kidults" | "artfund";
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
  methodologyId?: string;
  methodologyVersion?: string;
  rightsStatus: "approved" | "restricted" | "unknown" | "expired" | "disputed";
  freshnessSeconds: number;
  updatedAt: string;
  provenanceCompleteness?: number;
  provenanceDisputed?: boolean;
}

export interface IntegratedEntityView {
  vertical: Vertical;
  entityId: string;
  entityType: string;
  label: string;
  slug: string;
  status: string;
  trust: TrustSurface;
}

export interface GovernanceSnapshot {
  sourceId: string;
  rightsId?: string;
  methodologyId?: string;
  confidenceAssessmentId?: string;
  commerciallyEligible: boolean;
  reasons: string[];
}

export interface PortalDecision {
  state: PortalState;
  customerVisible: boolean;
  retryable: boolean;
  reasons: string[];
}

export function decidePortalState(
  view: IntegratedEntityView | undefined,
  governance: GovernanceSnapshot | undefined,
  authenticated: boolean,
): PortalDecision {
  if (!authenticated) {
    return {
      state: "unauthorized",
      customerVisible: false,
      retryable: false,
      reasons: ["authentication_required"],
    };
  }

  if (!view) {
    return {
      state: "empty",
      customerVisible: true,
      retryable: false,
      reasons: ["entity_not_available"],
    };
  }

  if (!governance) {
    return {
      state: "partial",
      customerVisible: false,
      retryable: true,
      reasons: ["governance_snapshot_missing"],
    };
  }

  if (
    view.trust.rightsStatus !== "approved" ||
    !governance.commerciallyEligible
  ) {
    return {
      state: "rights_restricted",
      customerVisible: false,
      retryable: false,
      reasons: governance.reasons.length
        ? governance.reasons
        : ["commercial_rights_not_approved"],
    };
  }

  if (view.trust.confidenceScore < 70) {
    return {
      state: "degraded",
      customerVisible: false,
      retryable: true,
      reasons: ["confidence_below_customer_threshold"],
    };
  }

  if (view.vertical === "artfund" && view.trust.provenanceDisputed) {
    return {
      state: "rights_restricted",
      customerVisible: false,
      retryable: false,
      reasons: ["provenance_disputed"],
    };
  }

  return {
    state: "ready",
    customerVisible: true,
    retryable: false,
    reasons: [],
  };
}

export function assertMobileSafeWidth(width: number): void {
  if (!Number.isFinite(width) || width < 320) {
    throw new Error("viewport_width_below_supported_minimum");
  }
}
