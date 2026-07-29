import { describe, expect, it } from "vitest";
import {
  InMemoryKidultsEntityRepository,
  buildTrustSurface,
  type KidultsEntityRecord,
} from "./index.js";

const records: KidultsEntityRecord[] = [
  {
    entityId: "KID-BRAND-000001",
    entityType: "brand",
    canonicalName: "Example Brand",
    slug: "example-brand",
    lifecycleStatus: "active",
    confidenceGrade: "A",
    confidenceScore: 96,
    methodologyId: "KID-METHOD-ENTITY-0.9",
    rightsStatus: "approved",
    evidenceCount: 12,
    observedAt: "2026-07-29T12:00:00.000Z",
    createdAt: "2026-07-29T12:00:00.000Z",
    updatedAt: "2026-07-29T12:00:00.000Z",
  },
  {
    entityId: "KID-PRODUCT-000001",
    entityType: "product",
    parentEntityId: "KID-BRAND-000001",
    canonicalName: "Example Product",
    slug: "example-product",
    lifecycleStatus: "active",
    confidenceGrade: "B",
    confidenceScore: 84,
    rightsStatus: "approved",
    evidenceCount: 6,
    observedAt: "2026-07-28T12:00:00.000Z",
    createdAt: "2026-07-29T12:00:00.000Z",
    updatedAt: "2026-07-29T12:00:00.000Z",
  },
];

describe("InMemoryKidultsEntityRepository", () => {
  it("returns entities by ID and slug", async () => {
    const repository = new InMemoryKidultsEntityRepository(records);
    expect((await repository.getById("KID-BRAND-000001"))?.canonicalName).toBe("Example Brand");
    expect((await repository.getBySlug("example-product"))?.entityType).toBe("product");
  });

  it("filters by type, parent, status, and confidence", async () => {
    const repository = new InMemoryKidultsEntityRepository(records);
    const page = await repository.list({
      entityType: "product",
      parentEntityId: "KID-BRAND-000001",
      lifecycleStatus: "active",
      minimumConfidence: 80,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.entityId).toBe("KID-PRODUCT-000001");
  });

  it("rejects invalid pagination inputs", async () => {
    const repository = new InMemoryKidultsEntityRepository(records);
    await expect(repository.list({ limit: 101 })).rejects.toThrow("INVALID_LIMIT");
    await expect(repository.list({ cursor: "invalid" })).rejects.toThrow("INVALID_CURSOR");
  });
});

describe("buildTrustSurface", () => {
  it("exposes methodology, evidence, rights, confidence, and freshness", () => {
    const trust = buildTrustSurface(records[0]!, 0.8, new Date("2026-07-29T18:00:00.000Z"));
    expect(trust.confidenceGrade).toBe("A");
    expect(trust.evidenceCount).toBe(12);
    expect(trust.rightsStatus).toBe("approved");
    expect(trust.methodologyId).toBe("KID-METHOD-ENTITY-0.9");
    expect(trust.freshnessStatus).toBe("current");
  });
});
