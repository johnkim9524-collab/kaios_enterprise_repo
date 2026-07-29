import { describe, expect, it } from "vitest";
import {
  checksumForIndexPoint,
  createRollbackEvent,
  publishIndexPoint,
  shouldRetryPublication,
  type IndexPointInput,
} from "./index";

const base: IndexPointInput = {
  indexId: "kidult-100",
  vertical: "kidults",
  asOfDate: "2026-07-30",
  value: 1024.1284,
  methodologyId: "method_kidult_100",
  methodologyVersion: "0.9.0",
  methodologyStatus: "approved",
  confidence: 91,
  evidenceCount: 24,
  sourceCoverage: 88,
  rightsStatus: "approved",
  freshnessStatus: "current",
};

describe("index auto-publisher", () => {
  it("publishes deterministic governed index points", () => {
    const first = publishIndexPoint(base, "2026-07-30T00:00:00Z");
    const second = publishIndexPoint({ ...base }, "2026-07-30T00:00:00Z");
    expect(first.status).toBe("published");
    expect(first.checksum).toBe(second.checksum);
    expect(first.publicationId).toBe(second.publicationId);
  });

  it("blocks unknown rights", () => {
    const result = publishIndexPoint({ ...base, rightsStatus: "unknown" }, "2026-07-30T00:00:00Z");
    expect(result.status).toBe("blocked");
    expect(result.blockReasons).toContain("rights_not_approved");
  });

  it("blocks disputed Artfund provenance", () => {
    const result = publishIndexPoint({
      ...base,
      vertical: "artfund",
      indexId: "global-art-market-index",
      provenanceDisputed: true,
    }, "2026-07-30T00:00:00Z");
    expect(result.blockReasons).toContain("provenance_disputed");
  });

  it("creates immutable rollback audit references", () => {
    const published = publishIndexPoint(base, "2026-07-30T00:00:00Z");
    const event = createRollbackEvent(published, "quality_gate_regression", "2026-07-30T00:05:00Z");
    expect(event.publicationId).toBe(published.publicationId);
    expect(event.previousChecksum).toBe(checksumForIndexPoint(base));
  });

  it("retries only recoverable publication failures", () => {
    expect(shouldRetryPublication(["missing_evidence", "data_not_current"])).toBe(true);
    expect(shouldRetryPublication(["rights_not_approved"])).toBe(false);
  });
});
