export type KidultsEntityType =
  | "category"
  | "subcategory"
  | "brand"
  | "franchise"
  | "character"
  | "product_line"
  | "product"
  | "edition"
  | "variant"
  | "item_instance";

export type LifecycleStatus =
  | "candidate"
  | "active"
  | "merged"
  | "split"
  | "retired"
  | "disputed";

export type ConfidenceGrade = "A" | "B" | "C" | "D" | "U";
export type RightsStatus = "unknown" | "restricted" | "approved" | "expired" | "disputed";

export interface KidultsEntityRecord {
  entityId: string;
  entityType: KidultsEntityType;
  parentEntityId?: string;
  canonicalName: string;
  slug: string;
  lifecycleStatus: LifecycleStatus;
  confidenceGrade: ConfidenceGrade;
  confidenceScore: number;
  methodologyId?: string;
  rightsStatus: RightsStatus;
  evidenceCount: number;
  observedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KidultsEntityQuery {
  entityType?: KidultsEntityType;
  parentEntityId?: string;
  lifecycleStatus?: LifecycleStatus;
  minimumConfidence?: number;
  limit?: number;
  cursor?: string;
}

export interface KidultsEntityPage {
  items: KidultsEntityRecord[];
  nextCursor?: string;
}

export interface KidultsEntityRepository {
  getById(entityId: string): Promise<KidultsEntityRecord | undefined>;
  getBySlug(slug: string): Promise<KidultsEntityRecord | undefined>;
  list(query: KidultsEntityQuery): Promise<KidultsEntityPage>;
}

export interface TrustSurface {
  updatedAt: string;
  confidenceGrade: ConfidenceGrade;
  confidenceScore: number;
  sourceCoverage: number;
  evidenceCount: number;
  methodologyId?: string;
  rightsStatus: RightsStatus;
  freshnessStatus: "current" | "aging" | "stale" | "unknown";
}

export interface KidultsEntityView {
  entity: KidultsEntityRecord;
  trust: TrustSurface;
}

function normalizeLimit(value?: number): number {
  if (value === undefined) return 25;
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error("INVALID_LIMIT");
  }
  return value;
}

function encodeCursor(index: number): string {
  return Buffer.from(String(index), "utf8").toString("base64url");
}

function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  const value = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!Number.isInteger(value) || value < 0) throw new Error("INVALID_CURSOR");
  return value;
}

export class InMemoryKidultsEntityRepository implements KidultsEntityRepository {
  private readonly records: KidultsEntityRecord[];

  constructor(records: readonly KidultsEntityRecord[]) {
    this.records = [...records].sort((a, b) => a.entityId.localeCompare(b.entityId));
  }

  async getById(entityId: string): Promise<KidultsEntityRecord | undefined> {
    return this.records.find((record) => record.entityId === entityId);
  }

  async getBySlug(slug: string): Promise<KidultsEntityRecord | undefined> {
    return this.records.find((record) => record.slug === slug);
  }

  async list(query: KidultsEntityQuery): Promise<KidultsEntityPage> {
    const limit = normalizeLimit(query.limit);
    const offset = decodeCursor(query.cursor);
    const minimumConfidence = query.minimumConfidence ?? 0;

    const filtered = this.records.filter((record) => {
      if (query.entityType && record.entityType !== query.entityType) return false;
      if (query.parentEntityId && record.parentEntityId !== query.parentEntityId) return false;
      if (query.lifecycleStatus && record.lifecycleStatus !== query.lifecycleStatus) return false;
      if (record.confidenceScore < minimumConfidence) return false;
      return true;
    });

    const items = filtered.slice(offset, offset + limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor: nextOffset < filtered.length ? encodeCursor(nextOffset) : undefined,
    };
  }
}

export function buildTrustSurface(
  entity: KidultsEntityRecord,
  sourceCoverage: number,
  now: Date = new Date(),
): TrustSurface {
  const observed = entity.observedAt ? new Date(entity.observedAt) : undefined;
  const ageHours = observed ? Math.max(0, (now.getTime() - observed.getTime()) / 3_600_000) : undefined;
  const freshnessStatus =
    ageHours === undefined ? "unknown" : ageHours <= 24 ? "current" : ageHours <= 168 ? "aging" : "stale";

  return {
    updatedAt: entity.updatedAt,
    confidenceGrade: entity.confidenceGrade,
    confidenceScore: entity.confidenceScore,
    sourceCoverage: Math.max(0, Math.min(1, sourceCoverage)),
    evidenceCount: entity.evidenceCount,
    methodologyId: entity.methodologyId,
    rightsStatus: entity.rightsStatus,
    freshnessStatus,
  };
}
