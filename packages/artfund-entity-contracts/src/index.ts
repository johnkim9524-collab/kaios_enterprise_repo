export type ArtfundEntityType =
  | "artist"
  | "artwork"
  | "edition"
  | "object_instance"
  | "provenance_event"
  | "exhibition"
  | "auction_lot"
  | "transaction"
  | "institution"
  | "market_signal";

export type EntityStatus = "candidate" | "active" | "merged" | "retired" | "disputed";
export type RightsStatus = "unknown" | "restricted" | "approved" | "expired" | "disputed";

export interface ArtfundEntity {
  entityId: string;
  entityType: ArtfundEntityType;
  parentEntityId?: string;
  canonicalName: string;
  slug: string;
  status: EntityStatus;
  confidenceScore: number;
  methodologyId?: string;
  rightsStatus: RightsStatus;
  sourceCoverage: number;
  evidenceCount: number;
  freshnessAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArtfundEntityQuery {
  entityType?: ArtfundEntityType;
  parentEntityId?: string;
  status?: EntityStatus;
  minimumConfidence?: number;
  cursor?: string;
  limit?: number;
}

export interface ArtfundEntityPage {
  items: ArtfundEntity[];
  nextCursor?: string;
}

export interface ArtfundEntityRepository {
  getById(entityId: string): Promise<ArtfundEntity | undefined>;
  getBySlug(slug: string): Promise<ArtfundEntity | undefined>;
  list(query?: ArtfundEntityQuery): Promise<ArtfundEntityPage>;
}

const normalizeLimit = (value?: number): number => {
  if (value === undefined) return 25;
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error("INVALID_LIMIT");
  }
  return value;
};

const decodeCursor = (cursor?: string): number => {
  if (!cursor) return 0;
  const value = Number.parseInt(cursor, 10);
  if (!Number.isInteger(value) || value < 0) throw new Error("INVALID_CURSOR");
  return value;
};

export class InMemoryArtfundEntityRepository implements ArtfundEntityRepository {
  private readonly entities: readonly ArtfundEntity[];

  constructor(entities: readonly ArtfundEntity[]) {
    this.entities = [...entities].sort((a, b) => a.entityId.localeCompare(b.entityId));
  }

  async getById(entityId: string): Promise<ArtfundEntity | undefined> {
    return this.entities.find((entity) => entity.entityId === entityId);
  }

  async getBySlug(slug: string): Promise<ArtfundEntity | undefined> {
    return this.entities.find((entity) => entity.slug === slug);
  }

  async list(query: ArtfundEntityQuery = {}): Promise<ArtfundEntityPage> {
    const offset = decodeCursor(query.cursor);
    const limit = normalizeLimit(query.limit);
    const minimumConfidence = query.minimumConfidence ?? 0;

    if (minimumConfidence < 0 || minimumConfidence > 100) {
      throw new Error("INVALID_CONFIDENCE");
    }

    const filtered = this.entities.filter((entity) => {
      if (query.entityType && entity.entityType !== query.entityType) return false;
      if (query.parentEntityId && entity.parentEntityId !== query.parentEntityId) return false;
      if (query.status && entity.status !== query.status) return false;
      if (entity.confidenceScore < minimumConfidence) return false;
      return true;
    });

    const items = filtered.slice(offset, offset + limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor: nextOffset < filtered.length ? String(nextOffset) : undefined,
    };
  }
}

export interface ProvenanceTrustSurfaceInput {
  confidenceScore: number;
  sourceCoverage: number;
  evidenceCount: number;
  methodologyId?: string;
  rightsStatus: RightsStatus;
  freshnessAt?: string;
  updatedAt: string;
  provenanceEventCount: number;
  verifiedProvenanceEventCount: number;
  disputedProvenanceEventCount: number;
}

export interface ProvenanceTrustSurface {
  confidenceGrade: "A" | "B" | "C" | "D" | "U";
  confidenceScore: number;
  sourceCoverage: number;
  evidenceCount: number;
  methodologyId?: string;
  rightsStatus: RightsStatus;
  freshnessAt?: string;
  updatedAt: string;
  provenanceCompletenessPercent: number;
  provenanceStatus: "verified" | "partial" | "disputed" | "unknown";
  commerciallyDisplayable: boolean;
}

const confidenceGrade = (score: number): ProvenanceTrustSurface["confidenceGrade"] => {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 50) return "D";
  return "U";
};

export const buildProvenanceTrustSurface = (
  input: ProvenanceTrustSurfaceInput,
): ProvenanceTrustSurface => {
  if (input.confidenceScore < 0 || input.confidenceScore > 100) {
    throw new Error("INVALID_CONFIDENCE");
  }

  const completeness = input.provenanceEventCount === 0
    ? 0
    : Math.round((input.verifiedProvenanceEventCount / input.provenanceEventCount) * 100);

  const provenanceStatus = input.disputedProvenanceEventCount > 0
    ? "disputed"
    : input.provenanceEventCount === 0
      ? "unknown"
      : completeness >= 90
        ? "verified"
        : "partial";

  return {
    confidenceGrade: confidenceGrade(input.confidenceScore),
    confidenceScore: input.confidenceScore,
    sourceCoverage: input.sourceCoverage,
    evidenceCount: input.evidenceCount,
    methodologyId: input.methodologyId,
    rightsStatus: input.rightsStatus,
    freshnessAt: input.freshnessAt,
    updatedAt: input.updatedAt,
    provenanceCompletenessPercent: completeness,
    provenanceStatus,
    commerciallyDisplayable:
      input.rightsStatus === "approved" &&
      input.confidenceScore >= 70 &&
      provenanceStatus !== "disputed",
  };
};
