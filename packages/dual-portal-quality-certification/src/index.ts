export type PortalVertical = "kidults" | "artfund";

export type PortalQualityDimension =
  | "productQuality"
  | "dataTrust"
  | "luxuryBrandFit"
  | "desktopUx"
  | "mobileUx"
  | "accessibility"
  | "failureStates"
  | "governanceVisibility"
  | "exportReadiness";

export interface PortalQualityInput {
  vertical: PortalVertical;
  scores: Record<PortalQualityDimension, number>;
  hasHorizontalOverflowAt320: boolean;
  supportsLoading: boolean;
  supportsEmpty: boolean;
  supportsPartial: boolean;
  supportsDegraded: boolean;
  supportsUnauthorized: boolean;
  supportsRightsRestricted: boolean;
  supportsError: boolean;
  supportsProvenanceDisputed?: boolean;
  trustSurfaceComplete: boolean;
  illustrativeValuesLabelled: boolean;
  viewerExportBlocked: boolean;
  governedExportReady: boolean;
}

export interface PortalQualityCertification {
  vertical: PortalVertical;
  result: "pass" | "fail";
  productQualityScore: number;
  dataTrustScore: number;
  luxuryBrandFitScore: number;
  overallScore: number;
  blockers: string[];
  certifiedForWeek5: boolean;
}

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

const average = (values: number[]): number =>
  Math.round((values.reduce((total, value) => total + clamp(value), 0) / values.length) * 100) / 100;

export function certifyPortal(input: PortalQualityInput): PortalQualityCertification {
  const blockers: string[] = [];
  const productQualityScore = clamp(input.scores.productQuality);
  const dataTrustScore = clamp(input.scores.dataTrust);
  const luxuryBrandFitScore = clamp(input.scores.luxuryBrandFit);

  if (productQualityScore < 90) blockers.push("product_quality_below_90");
  if (dataTrustScore < 90) blockers.push("data_trust_below_90");
  if (luxuryBrandFitScore < 95) blockers.push("luxury_brand_fit_below_95");
  if (input.scores.desktopUx < 90) blockers.push("desktop_ux_below_90");
  if (input.scores.mobileUx < 90) blockers.push("mobile_ux_below_90");
  if (input.scores.accessibility < 85) blockers.push("accessibility_below_85");
  if (input.scores.failureStates < 90) blockers.push("failure_states_below_90");
  if (input.scores.governanceVisibility < 95) blockers.push("governance_visibility_below_95");
  if (input.scores.exportReadiness < 90) blockers.push("export_readiness_below_90");
  if (input.hasHorizontalOverflowAt320) blockers.push("horizontal_overflow_at_320");
  if (!input.supportsLoading) blockers.push("missing_loading_state");
  if (!input.supportsEmpty) blockers.push("missing_empty_state");
  if (!input.supportsPartial) blockers.push("missing_partial_state");
  if (!input.supportsDegraded) blockers.push("missing_degraded_state");
  if (!input.supportsUnauthorized) blockers.push("missing_unauthorized_state");
  if (!input.supportsRightsRestricted) blockers.push("missing_rights_restricted_state");
  if (!input.supportsError) blockers.push("missing_error_state");
  if (input.vertical === "artfund" && !input.supportsProvenanceDisputed) {
    blockers.push("missing_provenance_disputed_state");
  }
  if (!input.trustSurfaceComplete) blockers.push("trust_surface_incomplete");
  if (!input.illustrativeValuesLabelled) blockers.push("illustrative_values_not_labelled");
  if (!input.viewerExportBlocked) blockers.push("viewer_export_not_blocked");
  if (!input.governedExportReady) blockers.push("governed_export_not_ready");

  const overallScore = average(Object.values(input.scores));
  const result = blockers.length === 0 ? "pass" : "fail";

  return {
    vertical: input.vertical,
    result,
    productQualityScore,
    dataTrustScore,
    luxuryBrandFitScore,
    overallScore,
    blockers,
    certifiedForWeek5: result === "pass",
  };
}

export interface DualPortalGateResult {
  result: "pass" | "fail";
  kidults: PortalQualityCertification;
  artfund: PortalQualityCertification;
  week5Authorized: boolean;
}

export function certifyDualPortalGate(
  kidults: PortalQualityInput,
  artfund: PortalQualityInput,
): DualPortalGateResult {
  if (kidults.vertical !== "kidults") throw new Error("kidults input must use kidults vertical");
  if (artfund.vertical !== "artfund") throw new Error("artfund input must use artfund vertical");

  const kidultsResult = certifyPortal(kidults);
  const artfundResult = certifyPortal(artfund);
  const result = kidultsResult.result === "pass" && artfundResult.result === "pass" ? "pass" : "fail";

  return {
    result,
    kidults: kidultsResult,
    artfund: artfundResult,
    week5Authorized: result === "pass",
  };
}
