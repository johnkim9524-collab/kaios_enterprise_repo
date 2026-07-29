export type GovernanceRecordKind =
  | "source"
  | "rights"
  | "evidence"
  | "methodology"
  | "confidence";

export type GovernanceRecord = {
  id: string;
  kind: GovernanceRecordKind;
  vertical: "shared" | "kidults" | "artfund";
  status: string;
  version: string;
  updatedAt: string;
  payload: Readonly<Record<string, unknown>>;
};

export type GovernanceQuery = {
  kind?: GovernanceRecordKind;
  vertical?: GovernanceRecord["vertical"];
  status?: string;
  limit?: number;
  cursor?: string;
};

export type GovernancePage = {
  items: readonly GovernanceRecord[];
  nextCursor: string | null;
};

export interface GovernanceRepository {
  findById(id: string): Promise<GovernanceRecord | null>;
  list(query?: GovernanceQuery): Promise<GovernancePage>;
}

export class InMemoryGovernanceRepository implements GovernanceRepository {
  readonly #records: readonly GovernanceRecord[];

  public constructor(records: readonly GovernanceRecord[]) {
    this.#records = [...records];
  }

  public async findById(id: string): Promise<GovernanceRecord | null> {
    return this.#records.find((record) => record.id === id) ?? null;
  }

  public async list(query: GovernanceQuery = {}): Promise<GovernancePage> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const start = query.cursor ? Number.parseInt(query.cursor, 10) : 0;
    if (!Number.isFinite(start) || start < 0) {
      throw new Error("INVALID_CURSOR");
    }

    const filtered = this.#records.filter((record) => {
      if (query.kind && record.kind !== query.kind) return false;
      if (query.vertical && record.vertical !== query.vertical) return false;
      if (query.status && record.status !== query.status) return false;
      return true;
    });

    const items = filtered.slice(start, start + limit);
    const next = start + items.length;
    return {
      items,
      nextCursor: next < filtered.length ? String(next) : null,
    };
  }
}
