export type ReportVertical = "kidults" | "artfund";
export type ReportState = "draft" | "blocked" | "ready" | "published" | "archived";
export type ClaimState = "supported" | "insufficient_evidence" | "rights_blocked" | "methodology_blocked" | "low_confidence";

export interface ReportEvidence {
  evidenceId: string;
  sourceId: string;
  rightsStatus: "approved" | "unknown" | "restricted" | "expired" | "disputed";
  confidenceScore: number;
  observedAt: string;
  contentHash: string;
}

export interface ReportMethodology {
  methodologyId: string;
  version: string;
  checksum: string;
  status: "approved" | "active" | "draft" | "deprecated";
}

export interface NarrativeClaimInput {
  claimId: string;
  text: string;
  evidenceIds: string[];
  methodologyId?: string;
  minimumEvidenceCount?: number;
  minimumConfidence?: number;
}

export interface NarrativeClaimResult {
  claimId: string;
  text: string;
  state: ClaimState;
  reasons: string[];
  evidenceIds: string[];
}

export interface ReportSectionInput {
  sectionId: string;
  title: string;
  claims: NarrativeClaimInput[];
}

export interface ReportInput {
  reportId: string;
  vertical: ReportVertical;
  title: string;
  edition: string;
  asOf: string;
  generatedAt: string;
  evidence: ReportEvidence[];
  methodologies: ReportMethodology[];
  sections: ReportSectionInput[];
}

export interface ReportResult {
  reportId: string;
  vertical: ReportVertical;
  title: string;
  edition: string;
  asOf: string;
  generatedAt: string;
  state: ReportState;
  supportedClaimCount: number;
  blockedClaimCount: number;
  claims: NarrativeClaimResult[];
  evidenceManifest: string[];
  methodologyManifest: string[];
  checksum: string;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(input: string): string {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return `fnv1a-${(value >>> 0).toString(16).padStart(8, "0")}`;
}

export function evaluateClaim(
  claim: NarrativeClaimInput,
  evidenceById: ReadonlyMap<string, ReportEvidence>,
  methodologyById: ReadonlyMap<string, ReportMethodology>,
): NarrativeClaimResult {
  const reasons: string[] = [];
  const evidence = claim.evidenceIds
    .map((id) => evidenceById.get(id))
    .filter((item): item is ReportEvidence => Boolean(item));
  const minimumEvidenceCount = claim.minimumEvidenceCount ?? 1;
  const minimumConfidence = claim.minimumConfidence ?? 70;

  if (evidence.length < minimumEvidenceCount) reasons.push("insufficient_evidence");
  if (evidence.some((item) => item.rightsStatus !== "approved")) reasons.push("rights_blocked");
  if (evidence.length > 0 && evidence.some((item) => item.confidenceScore < minimumConfidence)) reasons.push("low_confidence");

  if (claim.methodologyId) {
    const methodology = methodologyById.get(claim.methodologyId);
    if (!methodology || !["approved", "active"].includes(methodology.status)) reasons.push("methodology_blocked");
  }

  const state: ClaimState = reasons.includes("rights_blocked")
    ? "rights_blocked"
    : reasons.includes("methodology_blocked")
      ? "methodology_blocked"
      : reasons.includes("low_confidence")
        ? "low_confidence"
        : reasons.includes("insufficient_evidence")
          ? "insufficient_evidence"
          : "supported";

  return {
    claimId: claim.claimId,
    text: claim.text,
    state,
    reasons,
    evidenceIds: [...claim.evidenceIds].sort(),
  };
}

export function generateReport(input: ReportInput): ReportResult {
  const evidenceById = new Map(input.evidence.map((item) => [item.evidenceId, item]));
  const methodologyById = new Map(input.methodologies.map((item) => [item.methodologyId, item]));
  const claims = input.sections
    .flatMap((section) => section.claims)
    .map((claim) => evaluateClaim(claim, evidenceById, methodologyById))
    .sort((a, b) => a.claimId.localeCompare(b.claimId));
  const supportedClaimCount = claims.filter((claim) => claim.state === "supported").length;
  const blockedClaimCount = claims.length - supportedClaimCount;
  const evidenceManifest = [...new Set(claims.flatMap((claim) => claim.evidenceIds))].sort();
  const methodologyManifest = [...new Set(input.methodologies.map((item) => `${item.methodologyId}@${item.version}:${item.checksum}`))].sort();
  const state: ReportState = claims.length > 0 && blockedClaimCount === 0 ? "ready" : "blocked";
  const checksum = hash(stableStringify({
    reportId: input.reportId,
    vertical: input.vertical,
    edition: input.edition,
    asOf: input.asOf,
    claims,
    evidenceManifest,
    methodologyManifest,
  }));

  return {
    reportId: input.reportId,
    vertical: input.vertical,
    title: input.title,
    edition: input.edition,
    asOf: input.asOf,
    generatedAt: input.generatedAt,
    state,
    supportedClaimCount,
    blockedClaimCount,
    claims,
    evidenceManifest,
    methodologyManifest,
    checksum,
  };
}

export function archiveKey(report: Pick<ReportResult, "vertical" | "edition" | "reportId" | "checksum">): string {
  return `${report.vertical}/${report.edition}/${report.reportId}-${report.checksum}.json`;
}
