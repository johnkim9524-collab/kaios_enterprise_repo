import { describe, expect, it } from "vitest";
import { confidenceGradeFromScore, evaluateCommercialEligibility } from "./eligibility";
import type {
  ConfidenceAssessment,
  MethodologyRegistryRecord,
  RightsRegistryRecord,
  SourceRegistryRecord,
} from "./index";

const now = "2026-07-29T00:00:00.000Z";

const source: SourceRegistryRecord = {
  sourceId: "SRC-KID-000001",
  vertical: "kidults",
  sourceName: "Approved Source",
  sourceType: "official",
  sourceTier: "tier_1",
  collectionMethod: "rss",
  status: "active",
  qualityScore: 95,
  createdAt: now,
  updatedAt: now,
};

const rights: RightsRegistryRecord = {
  rightsId: "RGT-000001",
  sourceId: source.sourceId,
  collectAllowed: true,
  storeAllowed: true,
  transformAllowed: true,
  displayAllowed: true,
  redistributeAllowed: true,
  sellAllowed: true,
  attributionRequired: true,
  status: "approved",
  createdAt: now,
  updatedAt: now,
};

const confidence: ConfidenceAssessment = {
  assessmentId: "CFA-000001",
  vertical: "kidults",
  subjectType: "source",
  subjectId: source.sourceId,
  grade: "A",
  score: 95,
  sourceCoverage: 100,
  evidenceCount: 25,
  rationale: "Tier-one verified source",
  assessedAt: now,
  createdAt: now,
};

const methodology: MethodologyRegistryRecord = {
  methodologyId: "MET-KID-000001",
  vertical: "kidults",
  methodologyName: "Kidult 100",
  methodologyType: "index",
  version: "0.9.0",
  status: "approved",
  inputContract: {},
  calculationContract: {},
  restatementPolicy: "Versioned restatement only",
  checksum: "sha256:test",
  createdAt: now,
  updatedAt: now,
};

describe("evaluateCommercialEligibility", () => {
  it("allows every product surface when all gates pass", () => {
    const result = evaluateCommercialEligibility({ source, rights, confidence, methodology });
    expect(result.eligibleForPortal).toBe(true);
    expect(result.eligibleForIndex).toBe(true);
    expect(result.eligibleForReport).toBe(true);
    expect(result.eligibleForApi).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("blocks commercial use when rights are unknown", () => {
    const result = evaluateCommercialEligibility({
      source,
      rights: { ...rights, status: "unknown" },
      confidence,
      methodology,
    });
    expect(result.eligibleForPortal).toBe(false);
    expect(result.eligibleForIndex).toBe(false);
    expect(result.eligibleForApi).toBe(false);
    expect(result.reasons).toContain("rights_status:unknown");
  });

  it("blocks index use without an approved methodology", () => {
    const result = evaluateCommercialEligibility({
      source,
      rights,
      confidence,
      methodology: { ...methodology, status: "draft" },
    });
    expect(result.eligibleForPortal).toBe(true);
    expect(result.eligibleForIndex).toBe(false);
    expect(result.eligibleForReport).toBe(false);
  });
});

describe("confidenceGradeFromScore", () => {
  it.each([
    [95, "A"],
    [85, "B"],
    [75, "C"],
    [60, "D"],
    [40, "U"],
  ])("maps %s to %s", (score, grade) => {
    expect(confidenceGradeFromScore(score)).toBe(grade);
  });

  it("rejects invalid scores", () => {
    expect(() => confidenceGradeFromScore(101)).toThrow(RangeError);
  });
});
