import { describe, expect, it } from "vitest";
import { buildExportManifest, checksum, decideExport, renderCsv, type ExportRequest } from "./index.js";

const ready = (overrides: Partial<ExportRequest> = {}): ExportRequest => ({
  vertical: "kidults",
  format: "json",
  role: "operator",
  generatedAt: "2026-07-30T00:00:00Z",
  records: [{ id: "kid-1", score: 88 }],
  trust: {
    confidenceScore: 91,
    sourceCoverage: 84,
    evidenceCount: 12,
    methodologyIds: ["kidult-100@0.9"],
    rightsStatus: "approved",
    freshnessStatus: "current",
    updatedAt: "2026-07-29T23:55:00Z",
  },
  ...overrides,
});

describe("portal export pipeline", () => {
  it("blocks viewer export", () => {
    expect(decideExport(ready({ role: "viewer" }))).toEqual({
      allowed: false,
      reasons: ["viewer_export_forbidden"],
    });
  });

  it("blocks ungoverned customer exports", () => {
    const decision = decideExport(ready({
      trust: {
        ...ready().trust,
        confidenceScore: 60,
        evidenceCount: 0,
        rightsStatus: "unknown",
        freshnessStatus: "expired",
        methodologyIds: [],
      },
    }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toEqual([
      "rights_not_approved",
      "confidence_below_70",
      "evidence_missing",
      "methodology_missing",
      "freshness_not_current",
    ]);
  });

  it("blocks disputed Artfund provenance", () => {
    const decision = decideExport(ready({
      vertical: "artfund",
      trust: { ...ready().trust, provenanceDisputed: true },
    }));
    expect(decision).toEqual({ allowed: false, reasons: ["provenance_disputed"] });
  });

  it("creates a deterministic manifest with mandatory attachments", () => {
    const first = buildExportManifest(ready());
    const second = buildExportManifest(ready());
    expect(first).toEqual(second);
    expect(first.attachments.map((item) => item.name)).toEqual([
      "methodology.json",
      "evidence-manifest.json",
      "rights-manifest.json",
    ]);
  });

  it("keeps checksums stable across object key ordering", () => {
    expect(checksum({ a: 1, b: 2 })).toBe(checksum({ b: 2, a: 1 }));
  });

  it("renders deterministic CSV columns", () => {
    expect(renderCsv([{ score: 88, id: "kid-1" }, { id: "kid-2", score: 77 }])).toBe(
      '"id","score"\n"kid-1","88"\n"kid-2","77"',
    );
  });
});
