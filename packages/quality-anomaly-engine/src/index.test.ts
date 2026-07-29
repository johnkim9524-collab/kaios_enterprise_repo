import { describe, expect, it } from "vitest";
import {
  assessObservation,
  calculateZScore,
  findDataGap,
  scoreArtfundTransaction,
  scoreKidultsMarketSignal,
} from "./index.js";

const base = {
  observationId: "obs-1",
  vertical: "kidults" as const,
  entityId: "kid-product-1",
  observedAt: "2026-07-29T12:00:00.000Z",
  collectedAt: "2026-07-29T12:01:00.000Z",
  value: 100,
  currency: "USD",
  sourceId: "source-1",
  evidenceHash: "hash-1",
  confidenceScore: 90,
  rightsStatus: "approved" as const,
  requiredFields: { entityId: "kid-product-1", value: 100 },
};

describe("quality anomaly engine", () => {
  it("accepts a valid observation", () => {
    const result = assessObservation(base, { assessedAt: "2026-07-29T13:00:00.000Z" });
    expect(result.decision).toBe("accept");
    expect(result.score).toBe(100);
  });

  it("quarantines unknown rights", () => {
    const result = assessObservation({ ...base, rightsStatus: "unknown" }, { assessedAt: base.collectedAt });
    expect(result.decision).toBe("quarantine");
    expect(result.findings.some((finding) => finding.code === "RIGHTS_BLOCK")).toBe(true);
  });

  it("rejects low confidence without misclassifying as transport failure", () => {
    const result = assessObservation({ ...base, confidenceScore: 50 }, { assessedAt: base.collectedAt });
    expect(result.decision).toBe("reject");
    expect(result.findings.map((finding) => finding.code)).toContain("LOW_CONFIDENCE");
  });

  it("detects duplicate evidence", () => {
    const result = assessObservation(base, {
      assessedAt: base.collectedAt,
      existingEvidenceHashes: new Set(["hash-1"]),
    });
    expect(result.decision).toBe("review");
    expect(result.findings.map((finding) => finding.code)).toContain("DUPLICATE_EVIDENCE");
  });

  it("detects deterministic outliers", () => {
    const history = [90, 95, 100, 105, 110].map((value, index) => ({
      value,
      observedAt: `2026-07-2${index + 1}T00:00:00.000Z`,
    }));
    expect(calculateZScore(1000, history)).toBeGreaterThan(4);
    const result = assessObservation({ ...base, value: 1000 }, { history, assessedAt: base.collectedAt });
    expect(result.findings.map((finding) => finding.code)).toContain("OUTLIER_VALUE");
  });

  it("detects material data gaps", () => {
    expect(
      findDataGap([{ value: 90, observedAt: "2026-07-20T00:00:00.000Z" }], base.observedAt, 72),
    ).toBe(true);
  });

  it("quarantines disputed Artfund provenance", () => {
    const result = assessObservation(
      { ...base, vertical: "artfund", provenanceStatus: "disputed" },
      { assessedAt: base.collectedAt },
    );
    expect(result.decision).toBe("quarantine");
    expect(result.findings.map((finding) => finding.code)).toContain("PROVENANCE_DISPUTE");
  });

  it("scores Kidults and Artfund quality deterministically", () => {
    expect(scoreKidultsMarketSignal({ signalId: "s1", evidenceCount: 5, sourceCoverage: 8, confidenceScore: 90, duplicateEvidenceCount: 0 })).toBe(85);
    expect(scoreArtfundTransaction({ signalId: "a1", evidenceCount: 5, sourceCoverage: 8, confidenceScore: 90, duplicateEvidenceCount: 0, provenanceCompleteness: 90, provenanceDisputed: false })).toBe(87);
    expect(scoreArtfundTransaction({ signalId: "a2", evidenceCount: 5, sourceCoverage: 8, confidenceScore: 90, duplicateEvidenceCount: 0, provenanceCompleteness: 90, provenanceDisputed: true })).toBe(0);
  });
});
