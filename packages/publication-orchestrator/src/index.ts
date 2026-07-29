export type Vertical = "kidults" | "artfund";
export type ProductKind = "report" | "alert" | "index";
export type PublicationState =
  | "scheduled"
  | "evaluating"
  | "blocked"
  | "publishing"
  | "published"
  | "rolling_back"
  | "rolled_back"
  | "failed"
  | "retry_scheduled";

export interface ProductInput {
  vertical: Vertical;
  kind: ProductKind;
  productId: string;
  scheduledFor: string;
  methodologyStatus: "active" | "approved" | "draft" | "deprecated";
  rightsStatus: "approved" | "unknown" | "restricted" | "expired" | "disputed";
  confidence: number;
  evidenceCount: number;
  sourceCoverage: number;
  freshness: "current" | "stale" | "expired";
  provenanceDisputed?: boolean;
  checksum: string;
}

export interface PublicationDecision {
  state: PublicationState;
  eligible: boolean;
  reasons: string[];
  retryable: boolean;
}

export interface OrchestrationResult {
  runId: string;
  vertical: Vertical;
  startedAt: string;
  completedAt: string;
  decisions: Array<ProductInput & PublicationDecision>;
  publishedProductIds: string[];
  blockedProductIds: string[];
  incidentRequired: boolean;
}

const sortProducts = (items: readonly ProductInput[]): ProductInput[] =>
  [...items].sort((a, b) =>
    `${a.vertical}:${a.kind}:${a.productId}`.localeCompare(`${b.vertical}:${b.kind}:${b.productId}`),
  );

export function evaluatePublication(input: ProductInput): PublicationDecision {
  const reasons: string[] = [];

  if (!['active', 'approved'].includes(input.methodologyStatus)) reasons.push('methodology_not_publishable');
  if (input.rightsStatus !== 'approved') reasons.push('rights_not_approved');
  if (input.confidence < 70) reasons.push('confidence_below_70');
  if (input.evidenceCount < 1) reasons.push('missing_evidence');
  if (input.sourceCoverage <= 0) reasons.push('missing_source_coverage');
  if (input.freshness !== 'current') reasons.push(`freshness_${input.freshness}`);
  if (input.vertical === 'artfund' && input.provenanceDisputed) reasons.push('provenance_disputed');
  if (!input.checksum.trim()) reasons.push('missing_checksum');

  const retryableReasons = new Set(['missing_evidence', 'missing_source_coverage', 'freshness_stale']);
  const retryable = reasons.length > 0 && reasons.every((reason) => retryableReasons.has(reason));

  return {
    state: reasons.length === 0 ? 'publishing' : retryable ? 'retry_scheduled' : 'blocked',
    eligible: reasons.length === 0,
    reasons,
    retryable,
  };
}

export function orchestratePublication(
  runId: string,
  startedAt: string,
  completedAt: string,
  products: readonly ProductInput[],
): OrchestrationResult[] {
  const grouped: Record<Vertical, ProductInput[]> = { kidults: [], artfund: [] };
  for (const product of sortProducts(products)) grouped[product.vertical].push(product);

  return (Object.keys(grouped) as Vertical[]).map((vertical) => {
    const decisions = grouped[vertical].map((product) => ({ ...product, ...evaluatePublication(product) }));
    const publishedProductIds = decisions.filter((item) => item.eligible).map((item) => item.productId);
    const blockedProductIds = decisions.filter((item) => !item.eligible).map((item) => item.productId);
    const hardFailure = decisions.some((item) => !item.eligible && !item.retryable);

    return {
      runId: `${runId}:${vertical}`,
      vertical,
      startedAt,
      completedAt,
      decisions,
      publishedProductIds,
      blockedProductIds,
      incidentRequired: hardFailure,
    };
  });
}

export interface RollbackRequest {
  vertical: Vertical;
  productId: string;
  publicationId: string;
  originalChecksum: string;
  reason: string;
  requestedAt: string;
}

export interface RollbackEvent extends RollbackRequest {
  rollbackId: string;
  state: "rolled_back";
}

export function createRollbackEvent(request: RollbackRequest): RollbackEvent {
  if (!request.originalChecksum.trim()) throw new Error('original_checksum_required');
  if (!request.reason.trim()) throw new Error('rollback_reason_required');
  const stableKey = [request.vertical, request.productId, request.publicationId, request.originalChecksum, request.requestedAt].join('|');
  let hash = 2166136261;
  for (let i = 0; i < stableKey.length; i += 1) {
    hash ^= stableKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return {
    ...request,
    rollbackId: `rollback-${(hash >>> 0).toString(16).padStart(8, '0')}`,
    state: 'rolled_back',
  };
}
