export type SourceVertical = "kidults" | "artfund";
export type SourceLifecycle = "candidate" | "approved" | "active" | "degraded" | "quarantined" | "retired";
export type SourceRunStatus = "passed" | "partial" | "failed" | "quarantined";
export type DriftSeverity = "none" | "low" | "medium" | "high" | "critical";

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  multiplier: number;
  maxDelayMs: number;
}

export interface SourceAdapterDefinition {
  sourceId: string;
  vertical: SourceVertical;
  sourceName: string;
  sourceType: string;
  endpoint: string;
  lifecycle: SourceLifecycle;
  expectedSchemaVersion: string;
  requiredFields: readonly string[];
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  rightsApproved: boolean;
}

export interface AdapterFetchResult {
  statusCode: number;
  body: unknown;
  observedAt: string;
  durationMs: number;
}

export interface SchemaDriftResult {
  severity: DriftSeverity;
  missingFields: string[];
  unexpectedFields: string[];
  expectedSchemaVersion: string;
}

export interface SourceHealthInput {
  successRate: number;
  freshnessScore: number;
  schemaStabilityScore: number;
  rightsScore: number;
  latencyScore: number;
}

export interface SourceHealthResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "U";
  lifecycle: SourceLifecycle;
  reasons: string[];
}

export interface AdapterExecutionResult {
  sourceId: string;
  status: SourceRunStatus;
  attempts: number;
  durationMs: number;
  drift: SchemaDriftResult;
  health: SourceHealthResult;
  retryable: boolean;
  quarantineReason?: string;
}

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

export function calculateRetryDelay(policy: RetryPolicy, attempt: number): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error("attempt must be a positive integer");
  }
  const delay = policy.initialDelayMs * policy.multiplier ** (attempt - 1);
  return Math.min(policy.maxDelayMs, Math.round(delay));
}

export function detectSchemaDrift(
  expectedFields: readonly string[],
  payload: unknown,
  expectedSchemaVersion: string,
): SchemaDriftResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      severity: "critical",
      missingFields: [...expectedFields],
      unexpectedFields: [],
      expectedSchemaVersion,
    };
  }

  const actualFields = Object.keys(payload as Record<string, unknown>);
  const missingFields = expectedFields.filter((field) => !actualFields.includes(field));
  const unexpectedFields = actualFields.filter((field) => !expectedFields.includes(field));

  let severity: DriftSeverity = "none";
  if (missingFields.length > 0) severity = missingFields.length >= Math.max(2, expectedFields.length / 2) ? "critical" : "high";
  else if (unexpectedFields.length >= 5) severity = "medium";
  else if (unexpectedFields.length > 0) severity = "low";

  return { severity, missingFields, unexpectedFields, expectedSchemaVersion };
}

export function scoreSourceHealth(input: SourceHealthInput): SourceHealthResult {
  const score = Math.round(
    clamp(input.successRate) * 0.35 +
      clamp(input.freshnessScore) * 0.2 +
      clamp(input.schemaStabilityScore) * 0.2 +
      clamp(input.rightsScore) * 0.15 +
      clamp(input.latencyScore) * 0.1,
  );

  const reasons: string[] = [];
  if (input.rightsScore < 100) reasons.push("rights_not_fully_approved");
  if (input.successRate < 90) reasons.push("success_rate_below_target");
  if (input.freshnessScore < 80) reasons.push("freshness_below_target");
  if (input.schemaStabilityScore < 80) reasons.push("schema_instability");

  const grade: SourceHealthResult["grade"] =
    score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 50 ? "D" : "U";
  const lifecycle: SourceLifecycle =
    input.rightsScore < 100 || score < 50 ? "quarantined" : score < 70 ? "degraded" : "active";

  return { score, grade, lifecycle, reasons };
}

export function decideExecutionState(input: {
  source: SourceAdapterDefinition;
  attempts: number;
  durationMs: number;
  drift: SchemaDriftResult;
  health: SourceHealthResult;
  transportSucceeded: boolean;
}): AdapterExecutionResult {
  if (!input.source.rightsApproved) {
    return {
      sourceId: input.source.sourceId,
      status: "quarantined",
      attempts: input.attempts,
      durationMs: input.durationMs,
      drift: input.drift,
      health: input.health,
      retryable: false,
      quarantineReason: "rights_not_approved",
    };
  }

  if (input.drift.severity === "critical" || input.health.lifecycle === "quarantined") {
    return {
      sourceId: input.source.sourceId,
      status: "quarantined",
      attempts: input.attempts,
      durationMs: input.durationMs,
      drift: input.drift,
      health: input.health,
      retryable: input.transportSucceeded === false,
      quarantineReason: input.drift.severity === "critical" ? "critical_schema_drift" : "health_gate_failed",
    };
  }

  if (!input.transportSucceeded) {
    return {
      sourceId: input.source.sourceId,
      status: "failed",
      attempts: input.attempts,
      durationMs: input.durationMs,
      drift: input.drift,
      health: input.health,
      retryable: input.attempts < input.source.retryPolicy.maxAttempts,
    };
  }

  return {
    sourceId: input.source.sourceId,
    status: input.drift.severity === "none" ? "passed" : "partial",
    attempts: input.attempts,
    durationMs: input.durationMs,
    drift: input.drift,
    health: input.health,
    retryable: false,
  };
}
