import { describe, expect, it } from "vitest";
import { buildEnterprisePortalSnapshot, evaluateEnterpriseVisibility, type EnterpriseMetric, type TrustSurface } from "./index.js";

const trust: TrustSurface = {
  confidenceGrade: "A",
  confidenceScore: 92,
  sourceCoverage: 87,
  evidenceCount: 120,
  methodologyId: "kidult100",
  methodologyVersion: "0.9.0",
  methodologyStatus: "active",
  rightsStatus: "approved",
  freshnessMinutes: 60,
  updatedAt: "2026-07-30T00:00:00Z",
};

const metric = (metricId: string, overrides: Partial<TrustSurface> = {}): EnterpriseMetric => ({
  metricId,
  label: metricId,
  value: 88,
  trust: { ...trust, ...overrides },
});

describe("Kidults enterprise portal contracts", () => {
  it("permits approved evidence-linked intelligence", () => {
    expect(evaluateEnterpriseVisibility(trust)).toEqual({ visible: true, state: "ready", reasons: [] });
  });

  it("blocks unknown rights", () => {
    expect(evaluateEnterpriseVisibility({ ...trust, rightsStatus: "unknown" }).state).toBe("rights_restricted");
  });

  it("blocks low confidence and draft methodology", () => {
    const decision = evaluateEnterpriseVisibility({ ...trust, confidenceScore: 69, methodologyStatus: "draft" });
    expect(decision.visible).toBe(false);
    expect(decision.reasons).toContain("confidence_below_70");
    expect(decision.reasons).toContain("methodology_not_approved");
  });

  it("builds a partial snapshot when one metric is restricted", () => {
    const snapshot = buildEnterprisePortalSnapshot("2026-07-30", [
      metric("kidult100"),
      metric("brand_momentum:bandai"),
      metric("category:designer_toys", { rightsStatus: "restricted" }),
    ]);
    expect(snapshot.state).toBe("partial");
    expect(snapshot.kidult100?.value).toBe(88);
    expect(snapshot.brandMomentum).toHaveLength(1);
    expect(snapshot.categoryIntelligence).toHaveLength(0);
  });
});
