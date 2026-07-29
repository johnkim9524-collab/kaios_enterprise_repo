import { describe, expect, it } from "vitest";
import { certifyDualPortalGate, certifyPortal, type PortalQualityInput } from "./index.js";

const baseScores = {
  productQuality: 93,
  dataTrust: 94,
  luxuryBrandFit: 96,
  desktopUx: 94,
  mobileUx: 93,
  accessibility: 88,
  failureStates: 94,
  governanceVisibility: 97,
  exportReadiness: 92,
};

const buildInput = (vertical: "kidults" | "artfund"): PortalQualityInput => ({
  vertical,
  scores: baseScores,
  hasHorizontalOverflowAt320: false,
  supportsLoading: true,
  supportsEmpty: true,
  supportsPartial: true,
  supportsDegraded: true,
  supportsUnauthorized: true,
  supportsRightsRestricted: true,
  supportsError: true,
  supportsProvenanceDisputed: vertical === "artfund",
  trustSurfaceComplete: true,
  illustrativeValuesLabelled: true,
  viewerExportBlocked: true,
  governedExportReady: true,
});

describe("dual portal quality certification", () => {
  it("passes Kidults when all quality and governance gates pass", () => {
    const result = certifyPortal(buildInput("kidults"));
    expect(result.result).toBe("pass");
    expect(result.certifiedForWeek5).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("requires provenance-disputed state for Artfund", () => {
    const input = buildInput("artfund");
    input.supportsProvenanceDisputed = false;
    const result = certifyPortal(input);
    expect(result.result).toBe("fail");
    expect(result.blockers).toContain("missing_provenance_disputed_state");
  });

  it("fails closed on mobile overflow and incomplete trust surface", () => {
    const input = buildInput("kidults");
    input.hasHorizontalOverflowAt320 = true;
    input.trustSurfaceComplete = false;
    const result = certifyPortal(input);
    expect(result.result).toBe("fail");
    expect(result.blockers).toContain("horizontal_overflow_at_320");
    expect(result.blockers).toContain("trust_surface_incomplete");
  });

  it("does not allow admin-quality certification to bypass export governance", () => {
    const input = buildInput("kidults");
    input.governedExportReady = false;
    const result = certifyPortal(input);
    expect(result.result).toBe("fail");
    expect(result.blockers).toContain("governed_export_not_ready");
  });

  it("authorizes Week 5 only when both verticals pass", () => {
    const result = certifyDualPortalGate(buildInput("kidults"), buildInput("artfund"));
    expect(result.result).toBe("pass");
    expect(result.week5Authorized).toBe(true);
  });
});
