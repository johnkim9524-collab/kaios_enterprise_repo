export type Vertical = "kidults" | "artfund";
export type AlertSeverity = "info" | "watch" | "warning" | "critical";
export type AlertStatus = "candidate" | "eligible" | "blocked" | "delivered" | "suppressed";
export type AlertChannel = "portal" | "email" | "webhook" | "archive";

export interface AlertSignal {
  signalId: string;
  vertical: Vertical;
  subjectType: string;
  subjectId: string;
  alertType: string;
  severity: AlertSeverity;
  value: number;
  threshold: number;
  direction: "above" | "below" | "change";
  confidence: number;
  evidenceIds: string[];
  methodologyId: string;
  methodologyStatus: "approved" | "active" | "draft" | "deprecated";
  rightsStatus: "approved" | "unknown" | "restricted" | "expired" | "disputed";
  freshnessStatus: "current" | "stale" | "expired";
  provenanceStatus?: "verified" | "partial" | "disputed";
  observedAt: string;
}

export interface AlertPolicy {
  policyId: string;
  vertical: Vertical;
  alertType: string;
  minimumSeverity: AlertSeverity;
  minimumConfidence: number;
  cooldownSeconds: number;
  channels: AlertChannel[];
  enabled: boolean;
}

export interface AlertEvaluation {
  alertId: string;
  status: AlertStatus;
  deliverable: boolean;
  reasons: string[];
  channels: AlertChannel[];
  deduplicationKey: string;
  checksum: string;
  evaluatedAt: string;
}

const severityRank: Record<AlertSeverity, number> = {
  info: 1,
  watch: 2,
  warning: 3,
  critical: 4,
};

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildDeduplicationKey(signal: AlertSignal): string {
  return [signal.vertical, signal.subjectType, signal.subjectId, signal.alertType, signal.severity].join(":");
}

export function evaluateAlert(
  signal: AlertSignal,
  policy: AlertPolicy,
  evaluatedAt: string,
): AlertEvaluation {
  const reasons: string[] = [];

  if (!policy.enabled) reasons.push("policy_disabled");
  if (signal.vertical !== policy.vertical) reasons.push("vertical_mismatch");
  if (signal.alertType !== policy.alertType) reasons.push("alert_type_mismatch");
  if (severityRank[signal.severity] < severityRank[policy.minimumSeverity]) reasons.push("severity_below_policy");
  if (signal.confidence < Math.max(70, policy.minimumConfidence)) reasons.push("confidence_below_threshold");
  if (signal.evidenceIds.length === 0) reasons.push("missing_evidence");
  if (!signal.methodologyId) reasons.push("missing_methodology");
  if (!(["approved", "active"] as string[]).includes(signal.methodologyStatus)) reasons.push("methodology_not_publishable");
  if (signal.rightsStatus !== "approved") reasons.push("rights_not_approved");
  if (signal.freshnessStatus !== "current") reasons.push("data_not_current");
  if (signal.vertical === "artfund" && signal.provenanceStatus === "disputed") reasons.push("provenance_disputed");

  const thresholdMet =
    signal.direction === "above"
      ? signal.value >= signal.threshold
      : signal.direction === "below"
        ? signal.value <= signal.threshold
        : Math.abs(signal.value) >= Math.abs(signal.threshold);
  if (!thresholdMet) reasons.push("threshold_not_met");

  const deduplicationKey = buildDeduplicationKey(signal);
  const channels = [...new Set(policy.channels)].sort();
  const deliverable = reasons.length === 0;
  const status: AlertStatus = deliverable ? "eligible" : "blocked";
  const checksum = stableHash(JSON.stringify({ signal: { ...signal, evidenceIds: [...signal.evidenceIds].sort() }, policy: { ...policy, channels }, status }));

  return {
    alertId: `ALT-${stableHash(`${signal.signalId}:${policy.policyId}:${evaluatedAt}`)}`,
    status,
    deliverable,
    reasons,
    channels,
    deduplicationKey,
    checksum,
    evaluatedAt,
  };
}

export interface DeliveryHistoryRecord {
  deduplicationKey: string;
  deliveredAt: string;
}

export function applyCooldown(
  evaluation: AlertEvaluation,
  policy: AlertPolicy,
  history: readonly DeliveryHistoryRecord[],
  now: string,
): AlertEvaluation {
  if (!evaluation.deliverable) return evaluation;
  const nowMs = Date.parse(now);
  const latest = history
    .filter((record) => record.deduplicationKey === evaluation.deduplicationKey)
    .map((record) => Date.parse(record.deliveredAt))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  if (latest !== undefined && nowMs - latest < policy.cooldownSeconds * 1000) {
    return {
      ...evaluation,
      status: "suppressed",
      deliverable: false,
      reasons: ["cooldown_active"],
    };
  }
  return evaluation;
}

export function markDelivered(evaluation: AlertEvaluation): AlertEvaluation {
  if (!evaluation.deliverable || evaluation.status !== "eligible") {
    throw new Error("Only eligible alerts may be marked delivered");
  }
  return { ...evaluation, status: "delivered" };
}
