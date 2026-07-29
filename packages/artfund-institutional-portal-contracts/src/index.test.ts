import { describe, expect, it } from "vitest";
import {
  buildInstitutionalPortalState,
  decideInstitutionalVisibility,
  type ArtfundInstitutionalSnapshot,
  type InstitutionalTrustSurface,
} from "./index.js";

const trust = (overrides: Partial<InstitutionalTrustSurface> = {}): InstitutionalTrustSurface => ({
  confidenceGrade: "A",
  confidenceScore: 92,
  sourceCoverage: 88,
  evidenceCount: 14,
  methodologyId: "AF-METH-GAMI-001",
  methodologyVersion: "0.1.0",
  methodologyStatus: "approved",
  rightsStatus: "approved",
  freshness: "fresh",
  provenanceCompleteness: 91,
  provenanceDisputed: false,
  updatedAt: "2026-07-30T00:00:00.000Z",
  ...overrides,
});

const metric = (metricId: string, overrides: Partial<InstitutionalTrustSurface> = {}) => ({
  metricId,
  label: metricId,
  value: 100,
  unit: "score" as const,
  asOf: "2026-07-30",
  trust: trust(overrides),
});

const snapshot = (): ArtfundInstitutionalSnapshot => ({
  vertical: "artfund",
  environment: "staging",
  illustrative: true,
  generatedAt: "2026-07-30T00:00:00.000Z",
  globalArtMarketIndex: metric("global_art_market_index"),
  artistMomentum: [metric("artist_momentum")],
  auctionLiquidity: [metric("auction_liquidity")],
  provenanceStrength: [metric("provenance_strength")],
  marketBreadth: metric("market_breadth"),
  segmentRotation: [metric("segment_rotation")],
  decisionSignals: [],
});

describe("Artfund institutional portal visibility", () => {
  it("permits approved evidence-backed metrics", () => {
    expect(decideInstitutionalVisibility(trust(), true)).toEqual({
      state: "ready",
      visible: true,
      reasons: [],
    });
  });

  it("fails closed for unauthenticated access", () => {
    expect(decideInstitutionalVisibility(trust(), false).state).toBe("unauthorized");
  });

  it("blocks unknown rights", () => {
    expect(decideInstitutionalVisibility(trust({ rightsStatus: "unknown" }), true).state).toBe("rights_restricted");
  });

  it("blocks disputed provenance", () => {
    expect(decideInstitutionalVisibility(trust({ provenanceDisputed: true }), true).state).toBe("provenance_disputed");
  });

  it("blocks low confidence and missing evidence", () => {
    expect(decideInstitutionalVisibility(trust({ confidenceScore: 69 }), true).visible).toBe(false);
    expect(decideInstitutionalVisibility(trust({ evidenceCount: 0 }), true).state).toBe("partial");
  });

  it("builds a ready portal state for eligible snapshots", () => {
    expect(buildInstitutionalPortalState(snapshot(), true)).toBe("ready");
  });

  it("supports empty and unauthorized states", () => {
    expect(buildInstitutionalPortalState(null, true)).toBe("empty");
    expect(buildInstitutionalPortalState(snapshot(), false)).toBe("unauthorized");
  });
});
