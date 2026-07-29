export type PortalVertical = "kidults" | "artfund";
export type PortalRole = "viewer" | "operator" | "admin";
export type PortalState =
  | "loading"
  | "ready"
  | "empty"
  | "partial"
  | "degraded"
  | "unauthorized"
  | "rights_restricted"
  | "provenance_disputed"
  | "error";

export interface PortalAuthContext {
  authenticated: boolean;
  role?: PortalRole;
}

export interface ScoreSnapshot {
  scoreId: string;
  vertical: PortalVertical;
  metric: string;
  subjectId: string;
  value: number;
  confidence: number;
  evidenceCount: number;
  sourceCoverage: number;
  methodologyId: string;
  methodologyVersion: string;
  methodologyStatus: "draft" | "approved" | "active" | "deprecated" | "retired";
  rightsStatus: "unknown" | "restricted" | "approved" | "expired" | "disputed";
  freshness: "current" | "stale" | "expired";
  provenanceDisputed?: boolean;
  asOf: string;
  updatedAt: string;
}

export interface IndexSnapshot {
  indexId: string;
  vertical: PortalVertical;
  indexName: string;
  value: number;
  change1d?: number;
  change7d?: number;
  confidence: number;
  evidenceCount: number;
  sourceCoverage: number;
  methodologyId: string;
  methodologyVersion: string;
  methodologyStatus: "draft" | "approved" | "active" | "deprecated" | "retired";
  rightsStatus: "unknown" | "restricted" | "approved" | "expired" | "disputed";
  freshness: "current" | "stale" | "expired";
  provenanceDisputed?: boolean;
  asOf: string;
  updatedAt: string;
}

export interface PortalRepository {
  listScores(vertical: PortalVertical): Promise<ScoreSnapshot[]>;
  listIndices(vertical: PortalVertical): Promise<IndexSnapshot[]>;
}

export interface PortalTrustSurface {
  confidence: number;
  evidenceCount: number;
  sourceCoverage: number;
  methodologyId: string;
  methodologyVersion: string;
  rightsStatus: ScoreSnapshot["rightsStatus"];
  freshness: ScoreSnapshot["freshness"];
  provenanceDisputed: boolean;
  updatedAt: string;
}

export interface PortalApiResponse<T> {
  ok: boolean;
  status: number;
  state: PortalState;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface PortalSnapshot {
  vertical: PortalVertical;
  indices: IndexSnapshot[];
  scores: ScoreSnapshot[];
  trust: PortalTrustSurface;
  generatedAt: string;
  exportReady: boolean;
}

function canRead(role: PortalRole | undefined): boolean {
  return role === "viewer" || role === "operator" || role === "admin";
}

function isMethodologyReady(status: ScoreSnapshot["methodologyStatus"]): boolean {
  return status === "approved" || status === "active";
}

function isCommerciallyVisible(record: ScoreSnapshot | IndexSnapshot): boolean {
  if (record.rightsStatus !== "approved") return false;
  if (!isMethodologyReady(record.methodologyStatus)) return false;
  if (record.confidence < 70) return false;
  if (record.evidenceCount < 1) return false;
  if (record.freshness === "expired") return false;
  if (record.vertical === "artfund" && record.provenanceDisputed === true) return false;
  return true;
}

function deriveState(
  vertical: PortalVertical,
  scores: ScoreSnapshot[],
  indices: IndexSnapshot[],
): PortalState {
  const all = [...scores, ...indices];
  if (all.length === 0) return "empty";
  if (vertical === "artfund" && all.some((item) => item.provenanceDisputed === true)) {
    return "provenance_disputed";
  }
  if (all.some((item) => item.rightsStatus === "unknown" || item.rightsStatus === "restricted")) {
    return "rights_restricted";
  }
  const visible = all.filter(isCommerciallyVisible);
  if (visible.length === 0) return "partial";
  if (visible.length < all.length) return "partial";
  if (all.some((item) => item.freshness === "stale")) return "degraded";
  return "ready";
}

function buildTrustSurface(
  vertical: PortalVertical,
  scores: ScoreSnapshot[],
  indices: IndexSnapshot[],
): PortalTrustSurface {
  const all = [...scores, ...indices];
  if (all.length === 0) {
    return {
      confidence: 0,
      evidenceCount: 0,
      sourceCoverage: 0,
      methodologyId: "unavailable",
      methodologyVersion: "0",
      rightsStatus: "unknown",
      freshness: "expired",
      provenanceDisputed: false,
      updatedAt: new Date(0).toISOString(),
    };
  }

  const primary = all[0];
  return {
    confidence: Math.round(all.reduce((sum, item) => sum + item.confidence, 0) / all.length),
    evidenceCount: all.reduce((sum, item) => sum + item.evidenceCount, 0),
    sourceCoverage: Math.round(all.reduce((sum, item) => sum + item.sourceCoverage, 0) / all.length),
    methodologyId: primary.methodologyId,
    methodologyVersion: primary.methodologyVersion,
    rightsStatus: all.every((item) => item.rightsStatus === "approved") ? "approved" : primary.rightsStatus,
    freshness: all.some((item) => item.freshness === "expired")
      ? "expired"
      : all.some((item) => item.freshness === "stale")
        ? "stale"
        : "current",
    provenanceDisputed:
      vertical === "artfund" && all.some((item) => item.provenanceDisputed === true),
    updatedAt: all.map((item) => item.updatedAt).sort().at(-1) ?? primary.updatedAt,
  };
}

export async function getPortalSnapshot(
  auth: PortalAuthContext,
  vertical: PortalVertical,
  repository: PortalRepository,
  now = new Date(),
): Promise<PortalApiResponse<PortalSnapshot>> {
  if (!auth.authenticated || !canRead(auth.role)) {
    return {
      ok: false,
      status: 401,
      state: "unauthorized",
      error: {
        code: "PORTAL_UNAUTHORIZED",
        message: "Authentication with a read-capable role is required.",
        retryable: false,
      },
    };
  }

  try {
    const [scores, indices] = await Promise.all([
      repository.listScores(vertical),
      repository.listIndices(vertical),
    ]);
    const state = deriveState(vertical, scores, indices);
    const trust = buildTrustSurface(vertical, scores, indices);
    const visibleScores = scores.filter(isCommerciallyVisible);
    const visibleIndices = indices.filter(isCommerciallyVisible);
    const exportReady =
      (auth.role === "operator" || auth.role === "admin") &&
      state === "ready" &&
      trust.rightsStatus === "approved";

    return {
      ok: true,
      status: 200,
      state,
      data: {
        vertical,
        scores: visibleScores,
        indices: visibleIndices,
        trust,
        generatedAt: now.toISOString(),
        exportReady,
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      state: "error",
      error: {
        code: "PORTAL_REPOSITORY_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Portal repository is unavailable.",
        retryable: true,
      },
    };
  }
}

export interface PortalExportManifest {
  vertical: PortalVertical;
  generatedAt: string;
  format: "csv" | "json" | "pdf";
  methodologyIds: string[];
  rightsStatus: "approved";
  evidenceCount: number;
  sourceCoverage: number;
  checksum: string;
}

export function buildExportManifest(
  snapshot: PortalSnapshot,
  format: PortalExportManifest["format"],
  checksum: string,
): PortalExportManifest {
  if (!snapshot.exportReady || snapshot.trust.rightsStatus !== "approved") {
    throw new Error("Snapshot is not export eligible.");
  }
  return {
    vertical: snapshot.vertical,
    generatedAt: snapshot.generatedAt,
    format,
    methodologyIds: Array.from(
      new Set([
        ...snapshot.scores.map((score) => score.methodologyId),
        ...snapshot.indices.map((index) => index.methodologyId),
      ]),
    ).sort(),
    rightsStatus: "approved",
    evidenceCount: snapshot.trust.evidenceCount,
    sourceCoverage: snapshot.trust.sourceCoverage,
    checksum,
  };
}
