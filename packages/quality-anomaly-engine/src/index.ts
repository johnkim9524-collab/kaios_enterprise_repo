export type Vertical = "kidults" | "artfund";
export type Severity = "info" | "warning" | "high" | "critical";
export type QualityDecision = "accept" | "review" | "reject" | "quarantine";

export interface ObservationInput {
  observationId: string;
  vertical: Vertical;
  entityId: string;
  observedAt: string;
  collectedAt: string;
  value?: number;
  currency?: string;
  sourceId: string;
  evidenceHash: string;
  confidenceScore: number;
  rightsStatus: "approved" | "unknown" | "restricted" | "expired" | "disputed";
  provenanceStatus?: "verified" | "partial" | "disputed" | "unknown";
  requiredFields: Record<string, unknown>;
}

export interface HistoricalPoint {
  value: number;
  observedAt: string;
}

export interface QualityFinding {
  code:
    | "MISSING_REQUIRED_FIELD"
    | "INVALID_TIMESTAMP"
    | "INVALID_VALUE"
    | "OUTLIER_VALUE"
    | "DUPLICATE_EVIDENCE"
    | "STALE_OBSERVATION"
    | "RIGHTS_BLOCK"
    | "LOW_CONFIDENCE"
    | "PROVENANCE_DISPUTE"
    | "DATA_GAP";
  severity: Severity;
  message: string;
  field?: string;
}

export interface QualityAssessment {
  observationId: string;
  score: number;
  decision: QualityDecision;
  findings: QualityFinding[];
  assessedAt: string;
  methodologyVersion: "quality-v0.1";
}

export interface QualityPolicy {
  minimumConfidence: number;
  staleAfterHours: number;
  outlierZThreshold: number;
  maximumGapHours: number;
}

export const DEFAULT_QUALITY_POLICY: QualityPolicy = {
  minimumConfidence: 70,
  staleAfterHours: 168,
  outlierZThreshold: 4,
  maximumGapHours: 72,
};

function hoursBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 3_600_000;
}

export function calculateZScore(value: number, history: readonly HistoricalPoint[]): number {
  if (history.length < 3) return 0;
  const mean = history.reduce((sum, point) => sum + point.value, 0) / history.length;
  const variance = history.reduce((sum, point) => sum + (point.value - mean) ** 2, 0) / history.length;
  const deviation = Math.sqrt(variance);
  if (deviation === 0) return value === mean ? 0 : Number.POSITIVE_INFINITY;
  return Math.abs((value - mean) / deviation);
}

export function findDataGap(
  history: readonly HistoricalPoint[],
  currentObservedAt: string,
  maximumGapHours: number,
): boolean {
  if (history.length === 0) return false;
  const latest = [...history].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
  return hoursBetween(latest.observedAt, currentObservedAt) > maximumGapHours;
}

export function assessObservation(
  input: ObservationInput,
  options: {
    policy?: QualityPolicy;
    history?: readonly HistoricalPoint[];
    existingEvidenceHashes?: ReadonlySet<string>;
    assessedAt?: string;
  } = {},
): QualityAssessment {
  const policy = options.policy ?? DEFAULT_QUALITY_POLICY;
  const history = options.history ?? [];
  const hashes = options.existingEvidenceHashes ?? new Set<string>();
  const assessedAt = options.assessedAt ?? new Date().toISOString();
  const findings: QualityFinding[] = [];

  for (const [field, value] of Object.entries(input.requiredFields)) {
    if (value === null || value === undefined || value === "") {
      findings.push({ code: "MISSING_REQUIRED_FIELD", severity: "high", message: `Missing required field: ${field}`, field });
    }
  }

  if (!Number.isFinite(Date.parse(input.observedAt)) || !Number.isFinite(Date.parse(input.collectedAt))) {
    findings.push({ code: "INVALID_TIMESTAMP", severity: "critical", message: "Observation timestamps are invalid." });
  }

  if (input.value !== undefined && (!Number.isFinite(input.value) || input.value < 0)) {
    findings.push({ code: "INVALID_VALUE", severity: "critical", message: "Observation value must be finite and non-negative." });
  }

  if (input.value !== undefined && calculateZScore(input.value, history) > policy.outlierZThreshold) {
    findings.push({ code: "OUTLIER_VALUE", severity: "high", message: "Observation value exceeds the deterministic outlier threshold." });
  }

  if (hashes.has(input.evidenceHash)) {
    findings.push({ code: "DUPLICATE_EVIDENCE", severity: "warning", message: "Evidence hash already exists." });
  }

  if (Number.isFinite(Date.parse(input.observedAt)) && hoursBetween(input.observedAt, assessedAt) > policy.staleAfterHours) {
    findings.push({ code: "STALE_OBSERVATION", severity: "warning", message: "Observation freshness is below policy." });
  }

  if (input.rightsStatus !== "approved") {
    findings.push({ code: "RIGHTS_BLOCK", severity: "critical", message: `Rights status ${input.rightsStatus} blocks downstream use.` });
  }

  if (input.confidenceScore < policy.minimumConfidence) {
    findings.push({ code: "LOW_CONFIDENCE", severity: "high", message: "Confidence is below the premium product threshold." });
  }

  if (input.vertical === "artfund" && input.provenanceStatus === "disputed") {
    findings.push({ code: "PROVENANCE_DISPUTE", severity: "critical", message: "Disputed provenance blocks commercial use." });
  }

  if (findDataGap(history, input.observedAt, policy.maximumGapHours)) {
    findings.push({ code: "DATA_GAP", severity: "warning", message: "A material observation gap was detected." });
  }

  const penalty = findings.reduce((total, finding) => {
    const weight: Record<Severity, number> = { info: 2, warning: 8, high: 20, critical: 40 };
    return total + weight[finding.severity];
  }, 0);
  const score = Math.max(0, 100 - penalty);

  const hasCritical = findings.some((finding) => finding.severity === "critical");
  const hasHigh = findings.some((finding) => finding.severity === "high");
  const decision: QualityDecision = hasCritical
    ? "quarantine"
    : hasHigh
      ? "reject"
      : findings.length > 0
        ? "review"
        : "accept";

  return {
    observationId: input.observationId,
    score,
    decision,
    findings,
    assessedAt,
    methodologyVersion: "quality-v0.1",
  };
}

export interface MarketSignalQualityInput {
  signalId: string;
  evidenceCount: number;
  sourceCoverage: number;
  confidenceScore: number;
  duplicateEvidenceCount: number;
}

export function scoreKidultsMarketSignal(input: MarketSignalQualityInput): number {
  const evidence = Math.min(30, input.evidenceCount * 5);
  const coverage = Math.min(30, input.sourceCoverage * 3);
  const confidence = Math.min(40, input.confidenceScore * 0.4);
  const duplicatePenalty = Math.min(30, input.duplicateEvidenceCount * 10);
  return Math.max(0, Math.round(evidence + coverage + confidence - duplicatePenalty));
}

export interface ArtfundTransactionQualityInput extends MarketSignalQualityInput {
  provenanceCompleteness: number;
  provenanceDisputed: boolean;
}

export function scoreArtfundTransaction(input: ArtfundTransactionQualityInput): number {
  if (input.provenanceDisputed) return 0;
  const base = scoreKidultsMarketSignal(input) * 0.7;
  const provenance = Math.min(30, input.provenanceCompleteness * 0.3);
  return Math.max(0, Math.round(base + provenance));
}
