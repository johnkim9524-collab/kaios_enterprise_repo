import { describe, expect, it } from "vitest";
import {
  assertMobileSafeWidth,
  decidePortalState,
  type GovernanceSnapshot,
  type IntegratedEntityView,
} from "./index";

const governance: GovernanceSnapshot = {
  sourceId: "SRC-1",
  rightsId: "RGT-1",
  methodologyId: "MTH-1",
  confidenceAssessmentId: "CNF-1",
  commerciallyEligible: true,
  reasons: [],
};

const kidultsView: IntegratedEntityView = {
  vertical: "kidults",
  entityId: "KID-PRODUCT-1",
  entityType: "product",
  label: "Illustrative Product",
  slug: "illustrative-product",
  status: "active",
  trust: {
    confidenceGrade: "A",
    confidenceScore: 92,
    sourceCoverage: 0.94,
    evidenceCount: 12,
    methodologyId: "MTH-1",
    methodologyVersion: "0.9.0",
    rightsStatus: "approved",
    freshnessSeconds: 300,
    updatedAt: "2026-07-29T14:00:00Z",
  },
};

describe("dual staging portal integration", () => {
  it("returns ready for eligible Kidults intelligence", () => {
    expect(decidePortalState(kidultsView, governance, true)).toEqual({
      state: "ready",
      customerVisible: true,
      retryable: false,
      reasons: [],
    });
  });

  it("fails closed when unauthenticated", () => {
    expect(decidePortalState(kidultsView, governance, false).state).toBe(
      "unauthorized",
    );
  });

  it("blocks restricted rights", () => {
    const restricted = {
      ...kidultsView,
      trust: { ...kidultsView.trust, rightsStatus: "restricted" as const },
    };
    expect(decidePortalState(restricted, governance, true).state).toBe(
      "rights_restricted",
    );
  });

  it("blocks low confidence", () => {
    const lowConfidence = {
      ...kidultsView,
      trust: { ...kidultsView.trust, confidenceScore: 69 },
    };
    expect(decidePortalState(lowConfidence, governance, true).state).toBe(
      "degraded",
    );
  });

  it("blocks disputed Artfund provenance", () => {
    const artfundView: IntegratedEntityView = {
      ...kidultsView,
      vertical: "artfund",
      entityId: "ART-WORK-1",
      trust: {
        ...kidultsView.trust,
        provenanceCompleteness: 0.88,
        provenanceDisputed: true,
      },
    };
    expect(decidePortalState(artfundView, governance, true).state).toBe(
      "rights_restricted",
    );
  });

  it("accepts supported mobile widths", () => {
    expect(() => assertMobileSafeWidth(320)).not.toThrow();
    expect(() => assertMobileSafeWidth(390)).not.toThrow();
    expect(() => assertMobileSafeWidth(319)).toThrow(
      "viewport_width_below_supported_minimum",
    );
  });
});
