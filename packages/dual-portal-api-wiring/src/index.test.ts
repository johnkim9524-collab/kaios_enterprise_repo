import { describe, expect, it } from "vitest";
import {
  buildExportManifest,
  getPortalSnapshot,
  type IndexSnapshot,
  type PortalRepository,
  type ScoreSnapshot,
} from "./index";

function score(overrides: Partial<ScoreSnapshot> = {}): ScoreSnapshot {
  return {
    scoreId: "score-1",
    vertical: "kidults",
    metric: "brand_momentum",
    subjectId: "KID-BRAND-001",
    value: 82,
    confidence: 91,
    evidenceCount: 14,
    sourceCoverage: 88,
    methodologyId: "method-brand-momentum",
    methodologyVersion: "1.0.0",
    methodologyStatus: "active",
    rightsStatus: "approved",
    freshness: "current",
    asOf: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

function index(overrides: Partial<IndexSnapshot> = {}): IndexSnapshot {
  return {
    indexId: "index-1",
    vertical: "kidults",
    indexName: "Kidult 100",
    value: 1032.4,
    change1d: 0.4,
    change7d: 2.1,
    confidence: 92,
    evidenceCount: 20,
    sourceCoverage: 90,
    methodologyId: "method-kidult-100",
    methodologyVersion: "1.0.0",
    methodologyStatus: "active",
    rightsStatus: "approved",
    freshness: "current",
    asOf: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

function repository(scores: ScoreSnapshot[], indices: IndexSnapshot[]): PortalRepository {
  return {
    async listScores() {
      return scores;
    },
    async listIndices() {
      return indices;
    },
  };
}

describe("dual portal API wiring", () => {
  it("fails closed for unauthenticated access", async () => {
    const result = await getPortalSnapshot(
      { authenticated: false },
      "kidults",
      repository([score()], [index()]),
    );
    expect(result.status).toBe(401);
    expect(result.state).toBe("unauthorized");
  });

  it("returns a ready Kidults snapshot for approved governed data", async () => {
    const result = await getPortalSnapshot(
      { authenticated: true, role: "operator" },
      "kidults",
      repository([score()], [index()]),
      new Date("2026-07-30T01:00:00.000Z"),
    );
    expect(result.state).toBe("ready");
    expect(result.data?.scores).toHaveLength(1);
    expect(result.data?.indices).toHaveLength(1);
    expect(result.data?.exportReady).toBe(true);
  });

  it("blocks restricted records and exposes rights-restricted state", async () => {
    const result = await getPortalSnapshot(
      { authenticated: true, role: "viewer" },
      "kidults",
      repository([score({ rightsStatus: "restricted" })], [index()]),
    );
    expect(result.state).toBe("rights_restricted");
    expect(result.data?.scores).toHaveLength(0);
    expect(result.data?.exportReady).toBe(false);
  });

  it("blocks disputed Artfund provenance", async () => {
    const result = await getPortalSnapshot(
      { authenticated: true, role: "admin" },
      "artfund",
      repository(
        [score({ vertical: "artfund", metric: "provenance_strength", provenanceDisputed: true })],
        [index({ vertical: "artfund", indexName: "Global Art Market Index" })],
      ),
    );
    expect(result.state).toBe("provenance_disputed");
    expect(result.data?.scores).toHaveLength(0);
  });

  it("keeps viewer exports disabled", async () => {
    const result = await getPortalSnapshot(
      { authenticated: true, role: "viewer" },
      "kidults",
      repository([score()], [index()]),
    );
    expect(result.data?.exportReady).toBe(false);
  });

  it("builds an export manifest only for an eligible snapshot", async () => {
    const result = await getPortalSnapshot(
      { authenticated: true, role: "admin" },
      "kidults",
      repository([score()], [index()]),
      new Date("2026-07-30T01:00:00.000Z"),
    );
    const manifest = buildExportManifest(result.data!, "json", "sha256:abc");
    expect(manifest.methodologyIds).toEqual([
      "method-brand-momentum",
      "method-kidult-100",
    ]);
    expect(manifest.rightsStatus).toBe("approved");
  });

  it("maps repository failure to retryable 503", async () => {
    const failing: PortalRepository = {
      async listScores() {
        throw new Error("database unavailable");
      },
      async listIndices() {
        return [];
      },
    };
    const result = await getPortalSnapshot(
      { authenticated: true, role: "operator" },
      "kidults",
      failing,
    );
    expect(result.status).toBe(503);
    expect(result.error?.retryable).toBe(true);
  });
});
