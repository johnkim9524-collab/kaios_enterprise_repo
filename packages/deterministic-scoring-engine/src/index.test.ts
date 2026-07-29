import { describe, expect, it } from "vitest";
import { calculateDailyIndex, calculateScore } from "./index";

const methodology = {
  methodologyId: "METHOD-001",
  version: "0.9.0",
  checksum: "sha256-demo",
  status: "active" as const,
};

describe("deterministic scoring engine", () => {
  it("produces the same score regardless of input order", () => {
    const first = calculateScore({
      vertical: "kidults",
      scoreName: "brand_momentum",
      subjectId: "KID-BRAND-1",
      asOf: "2026-07-30",
      methodology,
      inputs: [
        { name: "price", value: 80, weight: 0.5, confidence: 90, evidenceCount: 10 },
        { name: "velocity", value: 60, weight: 0.5, confidence: 80, evidenceCount: 5 },
      ],
    });
    const second = calculateScore({
      vertical: "kidults",
      scoreName: "brand_momentum",
      subjectId: "KID-BRAND-1",
      asOf: "2026-07-30",
      methodology,
      inputs: [
        { name: "velocity", value: 60, weight: 0.5, confidence: 80, evidenceCount: 5 },
        { name: "price", value: 80, weight: 0.5, confidence: 90, evidenceCount: 10 },
      ],
    });

    expect(first).toEqual(second);
    expect(first.value).toBe(70);
    expect(first.confidence).toBe(85);
    expect(first.evidenceCount).toBe(15);
  });

  it("excludes low-confidence constituents from daily indices", () => {
    const result = calculateDailyIndex({
      indexId: "KIDULT-100",
      vertical: "kidults",
      asOf: "2026-07-30",
      baseValue: 1000,
      methodology,
      constituents: [
        { constituentId: "A", normalizedValue: 1.1, weight: 0.6, eligible: true, confidence: 90 },
        { constituentId: "B", normalizedValue: 0.9, weight: 0.4, eligible: true, confidence: 60 },
      ],
    });

    expect(result.level).toBe(1100);
    expect(result.eligibleConstituentCount).toBe(1);
  });

  it("blocks draft methodologies", () => {
    expect(() =>
      calculateScore({
        vertical: "artfund",
        scoreName: "artist_momentum",
        subjectId: "ART-ARTIST-1",
        asOf: "2026-07-30",
        methodology: { ...methodology, status: "draft" as never },
        inputs: [{ name: "auction", value: 70, weight: 1, confidence: 90, evidenceCount: 4 }],
      }),
    ).toThrow("methodology_not_approved");
  });
});
