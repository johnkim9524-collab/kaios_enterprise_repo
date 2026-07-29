import { describe, expect, it } from "vitest";
import {
  InMemoryArtfundEntityRepository,
  buildProvenanceTrustSurface,
  type ArtfundEntity,
} from "./index";

const entities: ArtfundEntity[] = [
  {
    entityId: "AF-ARTIST-0001",
    entityType: "artist",
    canonicalName: "Example Artist",
    slug: "example-artist",
    status: "active",
    confidenceScore: 96,
    methodologyId: "METH-ARTIST-001",
    rightsStatus: "approved",
    sourceCoverage: 8,
    evidenceCount: 21,
    freshnessAt: "2026-07-29T12:00:00Z",
    createdAt: "2026-07-29T12:00:00Z",
    updatedAt: "2026-07-29T12:00:00Z",
  },
  {
    entityId: "AF-ARTWORK-0001",
    entityType: "artwork",
    parentEntityId: "AF-ARTIST-0001",
    canonicalName: "Example Work",
    slug: "example-work",
    status: "active",
    confidenceScore: 88,
    methodologyId: "METH-ARTWORK-001",
    rightsStatus: "approved",
    sourceCoverage: 5,
    evidenceCount: 12,
    freshnessAt: "2026-07-29T12:00:00Z",
    createdAt: "2026-07-29T12:00:00Z",
    updatedAt: "2026-07-29T12:00:00Z",
  },
  {
    entityId: "AF-LOT-0001",
    entityType: "auction_lot",
    parentEntityId: "AF-ARTWORK-0001",
    canonicalName: "Example Lot",
    slug: "example-lot",
    status: "candidate",
    confidenceScore: 64,
    rightsStatus: "unknown",
    sourceCoverage: 1,
    evidenceCount: 1,
    createdAt: "2026-07-29T12:00:00Z",
    updatedAt: "2026-07-29T12:00:00Z",
  },
];

describe("InMemoryArtfundEntityRepository", () => {
  it("gets entities by id and slug", async () => {
    const repository = new InMemoryArtfundEntityRepository(entities);
    expect((await repository.getById("AF-ARTIST-0001"))?.canonicalName).toBe("Example Artist");
    expect((await repository.getBySlug("example-work"))?.entityId).toBe("AF-ARTWORK-0001");
  });

  it("filters and paginates deterministically", async () => {
    const repository = new InMemoryArtfundEntityRepository(entities);
    const first = await repository.list({ status: "active", limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBe("1");

    const second = await repository.list({ status: "active", limit: 1, cursor: first.nextCursor });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeUndefined();
  });

  it("fails closed for invalid pagination and confidence", async () => {
    const repository = new InMemoryArtfundEntityRepository(entities);
    await expect(repository.list({ cursor: "invalid" })).rejects.toThrow("INVALID_CURSOR");
    await expect(repository.list({ limit: 101 })).rejects.toThrow("INVALID_LIMIT");
    await expect(repository.list({ minimumConfidence: 101 })).rejects.toThrow("INVALID_CONFIDENCE");
  });
});

describe("buildProvenanceTrustSurface", () => {
  it("allows display when rights, confidence, and provenance pass", () => {
    const surface = buildProvenanceTrustSurface({
      confidenceScore: 92,
      sourceCoverage: 8,
      evidenceCount: 21,
      methodologyId: "METH-PROV-001",
      rightsStatus: "approved",
      freshnessAt: "2026-07-29T12:00:00Z",
      updatedAt: "2026-07-29T12:00:00Z",
      provenanceEventCount: 10,
      verifiedProvenanceEventCount: 9,
      disputedProvenanceEventCount: 0,
    });

    expect(surface.confidenceGrade).toBe("A");
    expect(surface.provenanceStatus).toBe("verified");
    expect(surface.provenanceCompletenessPercent).toBe(90);
    expect(surface.commerciallyDisplayable).toBe(true);
  });

  it("blocks disputed provenance", () => {
    const surface = buildProvenanceTrustSurface({
      confidenceScore: 95,
      sourceCoverage: 10,
      evidenceCount: 30,
      rightsStatus: "approved",
      updatedAt: "2026-07-29T12:00:00Z",
      provenanceEventCount: 10,
      verifiedProvenanceEventCount: 9,
      disputedProvenanceEventCount: 1,
    });

    expect(surface.provenanceStatus).toBe("disputed");
    expect(surface.commerciallyDisplayable).toBe(false);
  });
});
