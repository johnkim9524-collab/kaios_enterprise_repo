import { describe, expect, it } from "vitest";
import {
  createMergeAudit,
  createSplitAudit,
  normalizeEntityName,
  resolveBestCandidate,
  scoreResolutionCandidate,
  suppressDuplicateCandidates,
  type AliasRecord,
  type CanonicalEntityRef,
  type ResolutionCandidate,
} from "./index.js";

const entity: CanonicalEntityRef = {
  entityId: "KID-PRODUCT-0001",
  vertical: "kidults",
  entityType: "product",
  canonicalName: "Bearbrick Series 46",
  normalizedName: "bearbrick series 46",
  parentEntityId: "KID-BRAND-0001",
  externalIds: { maker_sku: "BB-S46" },
  status: "active",
};

const alias: AliasRecord = {
  aliasId: "alias-1",
  entityId: entity.entityId,
  alias: "BE@RBRICK 46",
  normalizedAlias: "be rbrick 46",
  confidence: 95,
  createdAt: "2026-07-29T00:00:00Z",
};

const candidate: ResolutionCandidate = {
  candidateId: "candidate-1",
  vertical: "kidults",
  entityType: "product",
  name: "Bearbrick Series 46",
  parentEntityId: "KID-BRAND-0001",
  externalIds: { maker_sku: "BB-S46" },
  sourceId: "kidults-news-rss",
  observedAt: "2026-07-29T00:00:00Z",
};

describe("entity resolution", () => {
  it("normalizes names deterministically", () => {
    expect(normalizeEntityName("  BE@RBRICK™  Series-46 ")).toBe("be rbrick series 46");
  });

  it("auto-matches an exact external identifier", () => {
    const score = scoreResolutionCandidate({ candidate, entity, aliases: [alias] });
    expect(score.totalScore).toBe(100);
    expect(score.decision).toBe("match");
    expect(score.exactExternalId).toBe(true);
  });

  it("uses aliases and parent context", () => {
    const score = scoreResolutionCandidate({
      candidate: { ...candidate, externalIds: undefined, name: "BE@RBRICK 46" },
      entity,
      aliases: [alias],
    });
    expect(score.aliasScore).toBeGreaterThanOrEqual(90);
    expect(["match", "review"]).toContain(score.decision);
  });

  it("selects the highest deterministic candidate", () => {
    const result = resolveBestCandidate({
      candidate,
      entities: [
        { ...entity, entityId: "KID-PRODUCT-0002", canonicalName: "Bearbrick Series 45", externalIds: {} },
        entity,
      ],
      aliases: [alias],
    });
    expect(result?.entityId).toBe(entity.entityId);
  });

  it("suppresses duplicate source candidates", () => {
    const result = suppressDuplicateCandidates({
      candidates: [
        candidate,
        { ...candidate, candidateId: "candidate-2", name: "Bearbrick Series 46" },
        { ...candidate, candidateId: "candidate-3", name: "Bearbrick Series 47" },
      ],
    });
    expect(result.accepted.map((item) => item.candidateId)).toEqual([
      "candidate-1",
      "candidate-3",
    ]);
    expect(result.suppressed[0]).toMatchObject({
      candidateId: "candidate-2",
      duplicateOf: "candidate-1",
    });
  });

  it("creates auditable merge and split records", () => {
    const merge = createMergeAudit({
      auditId: "audit-merge-1",
      vertical: "artfund",
      survivorEntityId: "ART-ARTIST-0001",
      mergedEntityIds: ["ART-ARTIST-0003", "ART-ARTIST-0002"],
      actor: "operator",
      reason: "verified_duplicate_artist",
      evidenceIds: ["ev-1"],
      createdAt: "2026-07-29T00:00:00Z",
    });
    expect(merge.relatedEntityIds).toEqual(["ART-ARTIST-0002", "ART-ARTIST-0003"]);

    const split = createSplitAudit({
      auditId: "audit-split-1",
      vertical: "kidults",
      originalEntityId: "KID-PRODUCT-0099",
      resultingEntityIds: ["KID-PRODUCT-0100", "KID-PRODUCT-0101"],
      actor: "admin",
      reason: "edition_and_variant_were_conflated",
      createdAt: "2026-07-29T00:00:00Z",
    });
    expect(split.action).toBe("entity_split");
  });
});
