import { createHash } from "node:crypto";

export type Vertical = "kidults" | "artfund";
export type PublishStatus = "published" | "blocked" | "rolled_back";

export interface IndexPointInput {
  indexId: string;
  vertical: Vertical;
  asOfDate: string;
  value: number;
  methodologyId: string;
  methodologyVersion: string;
  methodologyStatus: "approved" | "active" | "draft" | "deprecated";
  confidence: number;
  evidenceCount: number;
  sourceCoverage: number;
  rightsStatus: "approved" | "unknown" | "restricted" | "expired" | "disputed";
  freshnessStatus: "current" | "stale" | "expired";
  provenanceDisputed?: boolean;
}

export interface PublishedIndexPoint extends IndexPointInput {
  publicationId: string;
  checksum: string;
  publishedAt: string;
  status: PublishStatus;
  blockReasons: string[];
}

export interface RollbackEvent {
  rollbackId: string;
  publicationId: string;
  reason: string;
  rolledBackAt: string;
  previousChecksum: string;
}

const canonicalize = (input: IndexPointInput): string =>
  JSON.stringify({
    indexId: input.indexId,
    vertical: input.vertical,
    asOfDate: input.asOfDate,
    value: Number(input.value.toFixed(8)),
    methodologyId: input.methodologyId,
    methodologyVersion: input.methodologyVersion,
    methodologyStatus: input.methodologyStatus,
    confidence: input.confidence,
    evidenceCount: input.evidenceCount,
    sourceCoverage: input.sourceCoverage,
    rightsStatus: input.rightsStatus,
    freshnessStatus: input.freshnessStatus,
    provenanceDisputed: Boolean(input.provenanceDisputed),
  });

export const checksumForIndexPoint = (input: IndexPointInput): string =>
  createHash("sha256").update(canonicalize(input)).digest("hex");

export const evaluatePublication = (input: IndexPointInput): string[] => {
  const reasons: string[] = [];
  if (!Number.isFinite(input.value)) reasons.push("invalid_index_value");
  if (input.methodologyStatus !== "approved" && input.methodologyStatus !== "active") {
    reasons.push("methodology_not_publishable");
  }
  if (input.confidence < 70) reasons.push("confidence_below_70");
  if (input.evidenceCount < 1) reasons.push("missing_evidence");
  if (input.sourceCoverage <= 0) reasons.push("missing_source_coverage");
  if (input.rightsStatus !== "approved") reasons.push("rights_not_approved");
  if (input.freshnessStatus !== "current") reasons.push("data_not_current");
  if (input.vertical === "artfund" && input.provenanceDisputed) {
    reasons.push("provenance_disputed");
  }
  return reasons.sort();
};

export const publishIndexPoint = (
  input: IndexPointInput,
  publishedAt: string,
): PublishedIndexPoint => {
  const checksum = checksumForIndexPoint(input);
  const blockReasons = evaluatePublication(input);
  const publicationId = `idxpub_${input.vertical}_${input.indexId}_${input.asOfDate}_${checksum.slice(0, 12)}`;
  return {
    ...input,
    publicationId,
    checksum,
    publishedAt,
    status: blockReasons.length === 0 ? "published" : "blocked",
    blockReasons,
  };
};

export const createRollbackEvent = (
  point: PublishedIndexPoint,
  reason: string,
  rolledBackAt: string,
): RollbackEvent => {
  if (point.status !== "published") {
    throw new Error("only_published_points_can_be_rolled_back");
  }
  const rollbackSeed = `${point.publicationId}|${reason}|${rolledBackAt}`;
  return {
    rollbackId: `idxrb_${createHash("sha256").update(rollbackSeed).digest("hex").slice(0, 16)}`,
    publicationId: point.publicationId,
    reason,
    rolledBackAt,
    previousChecksum: point.checksum,
  };
};

export const shouldRetryPublication = (
  reasons: readonly string[],
): boolean => reasons.every((reason) => [
  "missing_evidence",
  "missing_source_coverage",
  "data_not_current",
].includes(reason));
