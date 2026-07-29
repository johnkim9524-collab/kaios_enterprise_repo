export type Vertical = "kidults" | "artfund";
export type ExportFormat = "csv" | "json" | "pdf";
export type ExportRole = "viewer" | "operator" | "admin";

export interface ExportTrustSurface {
  confidenceScore: number;
  sourceCoverage: number;
  evidenceCount: number;
  methodologyIds: string[];
  rightsStatus: "approved" | "unknown" | "restricted" | "expired" | "disputed";
  freshnessStatus: "current" | "stale" | "expired";
  provenanceDisputed?: boolean;
  updatedAt: string;
}

export interface ExportRequest {
  vertical: Vertical;
  format: ExportFormat;
  role: ExportRole;
  generatedAt: string;
  records: ReadonlyArray<Record<string, unknown>>;
  trust: ExportTrustSurface;
}

export interface ExportAttachment {
  name: string;
  mediaType: string;
  checksum: string;
  required: boolean;
}

export interface ExportManifest {
  vertical: Vertical;
  format: ExportFormat;
  generatedAt: string;
  recordCount: number;
  methodologyIds: string[];
  evidenceCount: number;
  sourceCoverage: number;
  rightsStatus: ExportTrustSurface["rightsStatus"];
  checksum: string;
  attachments: ExportAttachment[];
}

export interface ExportDecision {
  allowed: boolean;
  reasons: string[];
}

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

export const checksum = (value: unknown): string => {
  const input = stable(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const decideExport = (request: ExportRequest): ExportDecision => {
  const reasons: string[] = [];
  if (request.role === "viewer") reasons.push("viewer_export_forbidden");
  if (request.records.length === 0) reasons.push("empty_export_blocked");
  if (request.trust.rightsStatus !== "approved") reasons.push("rights_not_approved");
  if (request.trust.confidenceScore < 70) reasons.push("confidence_below_70");
  if (request.trust.evidenceCount < 1) reasons.push("evidence_missing");
  if (request.trust.methodologyIds.length < 1) reasons.push("methodology_missing");
  if (request.trust.freshnessStatus !== "current") reasons.push("freshness_not_current");
  if (request.vertical === "artfund" && request.trust.provenanceDisputed) {
    reasons.push("provenance_disputed");
  }
  return { allowed: reasons.length === 0, reasons };
};

export const buildExportManifest = (request: ExportRequest): ExportManifest => {
  const decision = decideExport(request);
  if (!decision.allowed) throw new Error(`export_blocked:${decision.reasons.join(",")}`);

  const methodologyIds = [...request.trust.methodologyIds].sort();
  const attachments: ExportAttachment[] = [
    {
      name: "methodology.json",
      mediaType: "application/json",
      checksum: checksum(methodologyIds),
      required: true,
    },
    {
      name: "evidence-manifest.json",
      mediaType: "application/json",
      checksum: checksum({ evidenceCount: request.trust.evidenceCount }),
      required: true,
    },
    {
      name: "rights-manifest.json",
      mediaType: "application/json",
      checksum: checksum({ rightsStatus: request.trust.rightsStatus }),
      required: true,
    },
  ];

  return {
    vertical: request.vertical,
    format: request.format,
    generatedAt: request.generatedAt,
    recordCount: request.records.length,
    methodologyIds,
    evidenceCount: request.trust.evidenceCount,
    sourceCoverage: request.trust.sourceCoverage,
    rightsStatus: request.trust.rightsStatus,
    checksum: checksum({ records: request.records, trust: request.trust }),
    attachments,
  };
};

export const csvHeaders = (records: ReadonlyArray<Record<string, unknown>>): string[] =>
  [...new Set(records.flatMap((record) => Object.keys(record)))].sort();

const quoteCsv = (value: unknown): string => {
  const text = value == null ? "" : typeof value === "object" ? stable(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};

export const renderCsv = (records: ReadonlyArray<Record<string, unknown>>): string => {
  const headers = csvHeaders(records);
  const rows = records.map((record) => headers.map((header) => quoteCsv(record[header])).join(","));
  return [headers.map(quoteCsv).join(","), ...rows].join("\n");
};
