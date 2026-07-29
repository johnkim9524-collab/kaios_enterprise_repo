export type SourceVertical = "kidults" | "artfund";
export type ExecutionStatus =
  | "scheduled"
  | "running"
  | "succeeded"
  | "partial"
  | "retry_scheduled"
  | "failed"
  | "quarantined"
  | "recovered";

export type SourceLifecycle = "candidate" | "active" | "degraded" | "quarantined" | "retired";

export interface SourceExecutionAuditRecord {
  executionId: string;
  sourceId: string;
  vertical: SourceVertical;
  attempt: number;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  recordsReceived: number;
  recordsAccepted: number;
  recordsRejected: number;
  schemaFingerprint?: string;
  errorCode?: string;
  errorMessage?: string;
  retryAt?: string;
  createdAt: string;
}

export interface SourceHealthRecord {
  sourceId: string;
  vertical: SourceVertical;
  lifecycle: SourceLifecycle;
  healthScore: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastExecutionId?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  quarantineReason?: string;
  quarantinedAt?: string;
  recoverAfter?: string;
  updatedAt: string;
}

export interface RetryInstruction {
  shouldRetry: boolean;
  retryAt?: string;
  nextAttempt: number;
  reason: string;
}

export interface SourceAdapterInput {
  sourceId: string;
  vertical: SourceVertical;
  endpoint: string;
  expectedFields: readonly string[];
  rightsApproved: boolean;
}

export interface SourceAdapterOutput {
  records: readonly Record<string, unknown>[];
  schemaFields: readonly string[];
  observedAt: string;
}

export interface SourceAdapter {
  readonly adapterId: string;
  readonly sourceId: string;
  readonly vertical: SourceVertical;
  collect(input: SourceAdapterInput): Promise<SourceAdapterOutput>;
}

export interface SourceExecutionRepository {
  appendAudit(record: SourceExecutionAuditRecord): Promise<void>;
  getAudit(executionId: string): Promise<SourceExecutionAuditRecord | undefined>;
  listAudits(sourceId: string, limit?: number): Promise<readonly SourceExecutionAuditRecord[]>;
  putHealth(record: SourceHealthRecord): Promise<void>;
  getHealth(sourceId: string): Promise<SourceHealthRecord | undefined>;
}

export class InMemorySourceExecutionRepository implements SourceExecutionRepository {
  private readonly audits = new Map<string, SourceExecutionAuditRecord>();
  private readonly health = new Map<string, SourceHealthRecord>();

  async appendAudit(record: SourceExecutionAuditRecord): Promise<void> {
    this.audits.set(record.executionId, structuredClone(record));
  }

  async getAudit(executionId: string): Promise<SourceExecutionAuditRecord | undefined> {
    const value = this.audits.get(executionId);
    return value ? structuredClone(value) : undefined;
  }

  async listAudits(sourceId: string, limit = 50): Promise<readonly SourceExecutionAuditRecord[]> {
    const safeLimit = Math.max(1, Math.min(limit, 200));
    return [...this.audits.values()]
      .filter((record) => record.sourceId === sourceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, safeLimit)
      .map((record) => structuredClone(record));
  }

  async putHealth(record: SourceHealthRecord): Promise<void> {
    this.health.set(record.sourceId, structuredClone(record));
  }

  async getHealth(sourceId: string): Promise<SourceHealthRecord | undefined> {
    const value = this.health.get(sourceId);
    return value ? structuredClone(value) : undefined;
  }
}

export function calculateRetryInstruction(
  attempt: number,
  retryable: boolean,
  now: Date,
  maxAttempts = 4,
): RetryInstruction {
  const nextAttempt = attempt + 1;
  if (!retryable) {
    return { shouldRetry: false, nextAttempt, reason: "failure_not_retryable" };
  }
  if (nextAttempt > maxAttempts) {
    return { shouldRetry: false, nextAttempt, reason: "retry_budget_exhausted" };
  }
  const delaySeconds = Math.min(15 * 2 ** Math.max(0, attempt - 1), 300);
  return {
    shouldRetry: true,
    retryAt: new Date(now.getTime() + delaySeconds * 1000).toISOString(),
    nextAttempt,
    reason: "retry_scheduled",
  };
}

export function evolveSourceHealth(
  previous: SourceHealthRecord | undefined,
  input: {
    sourceId: string;
    vertical: SourceVertical;
    executionId: string;
    succeeded: boolean;
    partial?: boolean;
    criticalDrift?: boolean;
    rightsApproved: boolean;
    now: string;
  },
): SourceHealthRecord {
  const base: SourceHealthRecord = previous ?? {
    sourceId: input.sourceId,
    vertical: input.vertical,
    lifecycle: "candidate",
    healthScore: 70,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    updatedAt: input.now,
  };

  if (!input.rightsApproved) {
    return {
      ...base,
      lifecycle: "quarantined",
      healthScore: 0,
      quarantineReason: "rights_not_approved",
      quarantinedAt: input.now,
      recoverAfter: undefined,
      lastExecutionId: input.executionId,
      updatedAt: input.now,
    };
  }

  if (input.criticalDrift) {
    return {
      ...base,
      lifecycle: "quarantined",
      healthScore: Math.min(base.healthScore, 20),
      consecutiveFailures: base.consecutiveFailures + 1,
      consecutiveSuccesses: 0,
      quarantineReason: "critical_schema_drift",
      quarantinedAt: input.now,
      recoverAfter: undefined,
      lastFailureAt: input.now,
      lastExecutionId: input.executionId,
      updatedAt: input.now,
    };
  }

  if (input.succeeded) {
    const successes = base.consecutiveSuccesses + 1;
    const score = Math.min(100, base.healthScore + (input.partial ? 2 : 8));
    return {
      ...base,
      lifecycle: score >= 80 && successes >= 2 ? "active" : input.partial ? "degraded" : base.lifecycle,
      healthScore: score,
      consecutiveFailures: 0,
      consecutiveSuccesses: successes,
      lastSuccessAt: input.now,
      lastExecutionId: input.executionId,
      quarantineReason: successes >= 3 ? undefined : base.quarantineReason,
      quarantinedAt: successes >= 3 ? undefined : base.quarantinedAt,
      recoverAfter: successes >= 3 ? undefined : base.recoverAfter,
      updatedAt: input.now,
    };
  }

  const failures = base.consecutiveFailures + 1;
  const score = Math.max(0, base.healthScore - 20);
  const quarantine = failures >= 3 || score < 40;
  return {
    ...base,
    lifecycle: quarantine ? "quarantined" : "degraded",
    healthScore: score,
    consecutiveFailures: failures,
    consecutiveSuccesses: 0,
    lastFailureAt: input.now,
    lastExecutionId: input.executionId,
    quarantineReason: quarantine ? "repeated_execution_failure" : undefined,
    quarantinedAt: quarantine ? input.now : undefined,
    recoverAfter: quarantine
      ? new Date(new Date(input.now).getTime() + 60 * 60 * 1000).toISOString()
      : undefined,
    updatedAt: input.now,
  };
}

export function canAttemptRecovery(health: SourceHealthRecord, now: Date): boolean {
  if (health.lifecycle !== "quarantined") return false;
  if (health.quarantineReason === "rights_not_approved" || health.quarantineReason === "critical_schema_drift") {
    return false;
  }
  return Boolean(health.recoverAfter && new Date(health.recoverAfter).getTime() <= now.getTime());
}

export class KidultsNewsRssAdapter implements SourceAdapter {
  readonly adapterId = "kidults-news-rss-v1";
  readonly sourceId = "kidults-market-news-rss";
  readonly vertical = "kidults" as const;

  constructor(private readonly fetchJson: (endpoint: string) => Promise<readonly Record<string, unknown>[]>) {}

  async collect(input: SourceAdapterInput): Promise<SourceAdapterOutput> {
    if (!input.rightsApproved) throw new Error("RIGHTS_NOT_APPROVED");
    const records = await this.fetchJson(input.endpoint);
    return { records, schemaFields: ["title", "url", "publishedAt"], observedAt: new Date().toISOString() };
  }
}

export class ArtfundAuctionFeedAdapter implements SourceAdapter {
  readonly adapterId = "artfund-auction-feed-v1";
  readonly sourceId = "artfund-auction-results-feed";
  readonly vertical = "artfund" as const;

  constructor(private readonly fetchJson: (endpoint: string) => Promise<readonly Record<string, unknown>[]>) {}

  async collect(input: SourceAdapterInput): Promise<SourceAdapterOutput> {
    if (!input.rightsApproved) throw new Error("RIGHTS_NOT_APPROVED");
    const records = await this.fetchJson(input.endpoint);
    return {
      records,
      schemaFields: ["artist", "title", "saleDate", "currency", "hammerPrice"],
      observedAt: new Date().toISOString(),
    };
  }
}
