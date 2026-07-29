export type ResolutionVertical = "kidults" | "artfund";

export type ResolutionDecision =
  | "create"
  | "match"
  | "review"
  | "reject";

export type AuditAction =
  | "alias_added"
  | "candidate_matched"
  | "entity_created"
  | "entity_merged"
  | "entity_split"
  | "duplicate_suppressed"
  | "manual_override";

export interface CanonicalEntityRef {
  entityId: string;
  vertical: ResolutionVertical;
  entityType: string;
  canonicalName: string;
  normalizedName: string;
  parentEntityId?: string;
  externalIds?: Record<string, string>;
  status: "active" | "merged" | "split" | "retired";
}

export interface AliasRecord {
  aliasId: string;
  entityId: string;
  alias: string;
  normalizedAlias: string;
  locale?: string;
  sourceId?: string;
  confidence: number;
  createdAt: string;
}

export interface ResolutionCandidate {
  candidateId: string;
  vertical: ResolutionVertical;
  entityType: string;
  name: string;
  parentEntityId?: string;
  externalIds?: Record<string, string>;
  sourceId: string;
  observedAt: string;
}

export interface ResolutionScore {
  candidateId: string;
  entityId: string;
  exactExternalId: boolean;
  normalizedNameScore: number;
  aliasScore: number;
  parentScore: number;
  totalScore: number;
  decision: ResolutionDecision;
  reasons: string[];
}

export interface MergeSplitAuditRecord {
  auditId: string;
  vertical: ResolutionVertical;
  action: AuditAction;
  subjectEntityId: string;
  relatedEntityIds: string[];
  actor: "system" | "operator" | "admin";
  reason: string;
  evidenceIds: string[];
  createdAt: string;
}

export interface ResolutionThresholds {
  autoMatch: number;
  manualReview: number;
  duplicateSuppression: number;
}

export const DEFAULT_THRESHOLDS: ResolutionThresholds = {
  autoMatch: 90,
  manualReview: 70,
  duplicateSuppression: 95,
};

export function normalizeEntityName(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenSimilarity(left: string, right: string): number {
  const a = new Set(normalizeEntityName(left).split(" ").filter(Boolean));
  const b = new Set(normalizeEntityName(right).split(" ").filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return Math.round((intersection / union) * 100);
}

function hasExternalIdMatch(
  candidate: ResolutionCandidate,
  entity: CanonicalEntityRef,
): boolean {
  if (!candidate.externalIds || !entity.externalIds) return false;
  return Object.entries(candidate.externalIds).some(
    ([namespace, value]) => entity.externalIds?.[namespace] === value,
  );
}

export function scoreResolutionCandidate(input: {
  candidate: ResolutionCandidate;
  entity: CanonicalEntityRef;
  aliases?: AliasRecord[];
  thresholds?: ResolutionThresholds;
}): ResolutionScore {
  const { candidate, entity } = input;
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS;
  const exactExternalId = hasExternalIdMatch(candidate, entity);
  const normalizedNameScore = tokenSimilarity(candidate.name, entity.canonicalName);
  const aliasScore = Math.max(
    0,
    ...(input.aliases ?? [])
      .filter((alias) => alias.entityId === entity.entityId)
      .map((alias) => tokenSimilarity(candidate.name, alias.alias)),
  );
  const parentScore = candidate.parentEntityId
    ? candidate.parentEntityId === entity.parentEntityId
      ? 100
      : 0
    : 50;

  const totalScore = exactExternalId
    ? 100
    : Math.round(
        normalizedNameScore * 0.55 + aliasScore * 0.25 + parentScore * 0.2,
      );

  const decision: ResolutionDecision = exactExternalId || totalScore >= thresholds.autoMatch
    ? "match"
    : totalScore >= thresholds.manualReview
      ? "review"
      : normalizedNameScore < 20 && aliasScore < 20
        ? "create"
        : "reject";

  const reasons = [
    exactExternalId ? "external_id_match" : "no_external_id_match",
    `name_score:${normalizedNameScore}`,
    `alias_score:${aliasScore}`,
    `parent_score:${parentScore}`,
  ];

  return {
    candidateId: candidate.candidateId,
    entityId: entity.entityId,
    exactExternalId,
    normalizedNameScore,
    aliasScore,
    parentScore,
    totalScore,
    decision,
    reasons,
  };
}

export function resolveBestCandidate(input: {
  candidate: ResolutionCandidate;
  entities: CanonicalEntityRef[];
  aliases?: AliasRecord[];
  thresholds?: ResolutionThresholds;
}): ResolutionScore | null {
  const compatible = input.entities.filter(
    (entity) =>
      entity.vertical === input.candidate.vertical &&
      entity.entityType === input.candidate.entityType &&
      entity.status === "active",
  );
  if (compatible.length === 0) return null;

  return compatible
    .map((entity) =>
      scoreResolutionCandidate({
        candidate: input.candidate,
        entity,
        aliases: input.aliases,
        thresholds: input.thresholds,
      }),
    )
    .sort(
      (left, right) =>
        right.totalScore - left.totalScore ||
        left.entityId.localeCompare(right.entityId),
    )[0] ?? null;
}

export function suppressDuplicateCandidates(input: {
  candidates: ResolutionCandidate[];
  threshold?: number;
}): {
  accepted: ResolutionCandidate[];
  suppressed: Array<{ candidateId: string; duplicateOf: string; score: number }>;
} {
  const threshold = input.threshold ?? DEFAULT_THRESHOLDS.duplicateSuppression;
  const accepted: ResolutionCandidate[] = [];
  const suppressed: Array<{ candidateId: string; duplicateOf: string; score: number }> = [];

  for (const candidate of [...input.candidates].sort((a, b) =>
    a.candidateId.localeCompare(b.candidateId),
  )) {
    const duplicate = accepted.find((existing) => {
      if (
        existing.vertical !== candidate.vertical ||
        existing.entityType !== candidate.entityType ||
        existing.parentEntityId !== candidate.parentEntityId
      ) return false;
      return tokenSimilarity(existing.name, candidate.name) >= threshold;
    });

    if (duplicate) {
      suppressed.push({
        candidateId: candidate.candidateId,
        duplicateOf: duplicate.candidateId,
        score: tokenSimilarity(duplicate.name, candidate.name),
      });
    } else {
      accepted.push(candidate);
    }
  }

  return { accepted, suppressed };
}

export function createMergeAudit(input: {
  auditId: string;
  vertical: ResolutionVertical;
  survivorEntityId: string;
  mergedEntityIds: string[];
  actor: MergeSplitAuditRecord["actor"];
  reason: string;
  evidenceIds?: string[];
  createdAt: string;
}): MergeSplitAuditRecord {
  if (input.mergedEntityIds.length === 0) {
    throw new Error("entity_merge_requires_related_entity");
  }
  return {
    auditId: input.auditId,
    vertical: input.vertical,
    action: "entity_merged",
    subjectEntityId: input.survivorEntityId,
    relatedEntityIds: [...new Set(input.mergedEntityIds)].sort(),
    actor: input.actor,
    reason: input.reason,
    evidenceIds: [...new Set(input.evidenceIds ?? [])].sort(),
    createdAt: input.createdAt,
  };
}

export function createSplitAudit(input: {
  auditId: string;
  vertical: ResolutionVertical;
  originalEntityId: string;
  resultingEntityIds: string[];
  actor: MergeSplitAuditRecord["actor"];
  reason: string;
  evidenceIds?: string[];
  createdAt: string;
}): MergeSplitAuditRecord {
  if (input.resultingEntityIds.length < 2) {
    throw new Error("entity_split_requires_two_or_more_entities");
  }
  return {
    auditId: input.auditId,
    vertical: input.vertical,
    action: "entity_split",
    subjectEntityId: input.originalEntityId,
    relatedEntityIds: [...new Set(input.resultingEntityIds)].sort(),
    actor: input.actor,
    reason: input.reason,
    evidenceIds: [...new Set(input.evidenceIds ?? [])].sort(),
    createdAt: input.createdAt,
  };
}
