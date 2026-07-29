import { describe, expect, it } from "vitest";
import { certifyAutonomousProduct, certifyWeek5, type ProductCertificationInput } from "./index";

const base: ProductCertificationInput = {
  vertical: "kidults",
  productKind: "report",
  productId: "kidults-flagship-2026-08",
  productQualityScore: 94,
  dataTrustScore: 95,
  luxuryBrandFit: 97,
  confidenceScore: 88,
  evidenceCount: 24,
  sourceCoverage: 82,
  rightsApproved: true,
  methodologyPublishable: true,
  freshnessCurrent: true,
  checksumPresent: true,
  selfHealingVerified: true,
  rollbackVerified: true,
  immutableHistoryVerified: true,
  failureIsolationVerified: true,
};

describe("autonomous product certification", () => {
  it("publishes an eligible product deterministically", () => {
    const first = certifyAutonomousProduct(base, "2026-07-30T01:40:00+09:00");
    const second = certifyAutonomousProduct({ ...base }, "2026-07-30T01:40:00+09:00");
    expect(first).toEqual(second);
    expect(first.passed).toBe(true);
    expect(first.state).toBe("published");
  });

  it("schedules retry only for recoverable evidence coverage or freshness gaps", () => {
    const result = certifyAutonomousProduct(
      { ...base, evidenceCount: 0, sourceCoverage: 0, freshnessCurrent: false },
      "2026-07-30T01:40:00+09:00",
    );
    expect(result.passed).toBe(false);
    expect(result.state).toBe("retry_scheduled");
  });

  it("blocks governance failures and disputed Artfund provenance", () => {
    const result = certifyAutonomousProduct(
      {
        ...base,
        vertical: "artfund",
        productKind: "index",
        productId: "artfund-global-market-index",
        rightsApproved: false,
        provenanceDisputed: true,
      },
      "2026-07-30T01:40:00+09:00",
    );
    expect(result.state).toBe("blocked");
    expect(result.reasons).toContain("rights_not_approved");
    expect(result.reasons).toContain("provenance_disputed");
  });

  it("authorizes Week 6 only when all six dual-vertical products pass", () => {
    const products: ProductCertificationInput[] = [
      { ...base, productKind: "report", productId: "kidults-report" },
      { ...base, productKind: "alert", productId: "kidults-alert" },
      { ...base, productKind: "index", productId: "kidult-100" },
      { ...base, vertical: "artfund", productKind: "report", productId: "artfund-report", provenanceDisputed: false },
      { ...base, vertical: "artfund", productKind: "alert", productId: "artfund-alert", provenanceDisputed: false },
      { ...base, vertical: "artfund", productKind: "index", productId: "artfund-index", provenanceDisputed: false },
    ];
    const result = certifyWeek5({ products, certifiedAt: "2026-07-30T01:40:00+09:00" });
    expect(result.passed).toBe(true);
    expect(result.authorizedNextStage).toBe("week_6_release_candidate");
    expect(result.results).toHaveLength(6);
  });
});
