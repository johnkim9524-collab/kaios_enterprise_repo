import { describe, expect, it } from "vitest";
import { archiveKey, generateReport, type ReportInput } from "./index.js";

const base: ReportInput = {
  reportId: "report-001",
  vertical: "kidults",
  title: "Kidults Global Collectibles Intelligence",
  edition: "2026-07",
  asOf: "2026-07-30T00:00:00.000Z",
  generatedAt: "2026-07-30T00:10:00.000Z",
  evidence: [
    {
      evidenceId: "evidence-1",
      sourceId: "source-1",
      rightsStatus: "approved",
      confidenceScore: 92,
      observedAt: "2026-07-29T23:00:00.000Z",
      contentHash: "sha256:a",
    },
  ],
  methodologies: [
    {
      methodologyId: "kidult-100",
      version: "0.9.0",
      checksum: "sha256:m",
      status: "approved",
    },
  ],
  sections: [
    {
      sectionId: "market",
      title: "Market",
      claims: [
        {
          claimId: "claim-1",
          text: "The governed market signal strengthened.",
          evidenceIds: ["evidence-1"],
          methodologyId: "kidult-100",
        },
      ],
    },
  ],
};

describe("autonomous report engine", () => {
  it("produces a deterministic ready report for supported claims", () => {
    const first = generateReport(base);
    const second = generateReport({ ...base, evidence: [...base.evidence].reverse() });
    expect(first.state).toBe("ready");
    expect(first.blockedClaimCount).toBe(0);
    expect(first.checksum).toBe(second.checksum);
    expect(archiveKey(first)).toContain("kidults/2026-07/report-001-");
  });

  it("blocks a claim without evidence", () => {
    const result = generateReport({
      ...base,
      sections: [{ ...base.sections[0], claims: [{ ...base.sections[0].claims[0], evidenceIds: [] }] }],
    });
    expect(result.state).toBe("blocked");
    expect(result.claims[0].state).toBe("insufficient_evidence");
  });

  it("blocks unknown rights and draft methodologies", () => {
    const result = generateReport({
      ...base,
      evidence: [{ ...base.evidence[0], rightsStatus: "unknown" }],
      methodologies: [{ ...base.methodologies[0], status: "draft" }],
    });
    expect(result.state).toBe("blocked");
    expect(result.claims[0].reasons).toContain("rights_blocked");
    expect(result.claims[0].reasons).toContain("methodology_blocked");
  });

  it("blocks low-confidence evidence", () => {
    const result = generateReport({
      ...base,
      evidence: [{ ...base.evidence[0], confidenceScore: 69 }],
    });
    expect(result.claims[0].state).toBe("low_confidence");
  });
});
