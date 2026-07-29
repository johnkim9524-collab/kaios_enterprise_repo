export type Vertical = "kidults" | "artfund";
export type ProductKind = "report" | "alert" | "index";
export type ProductState = "published" | "retry_scheduled" | "blocked" | "rolled_back";

export interface ProductCertificationInput {
  vertical: Vertical;
  productKind: ProductKind;
  productId: string;
  productQualityScore: number;
  dataTrustScore: number;
  luxuryBrandFit: number;
  confidenceScore: number;
  evidenceCount: number;
  sourceCoverage: number;
  rightsApproved: boolean;
  methodologyPublishable: boolean;
  freshnessCurrent: boolean;
  checksumPresent: boolean;
  provenanceDisputed?: boolean;
  selfHealingVerified: boolean;
  rollbackVerified: boolean;
  immutableHistoryVerified: boolean;
  failureIsolationVerified: boolean;
}

export interface ProductCertificationResult {
  vertical: Vertical;
  productKind: ProductKind;
  productId: string;
  passed: boolean;
  state: ProductState;
  reasons: string[];
  certifiedAt: string;
}

const MIN_PRODUCT_QUALITY = 90;
const MIN_DATA_TRUST = 90;
const MIN_LUXURY_FIT = 95;
const MIN_CONFIDENCE = 70;

export function certifyAutonomousProduct(
  input: ProductCertificationInput,
  certifiedAt: string,
): ProductCertificationResult {
  const reasons: string[] = [];

  if (input.productQualityScore < MIN_PRODUCT_QUALITY) reasons.push("product_quality_below_90");
  if (input.dataTrustScore < MIN_DATA_TRUST) reasons.push("data_trust_below_90");
  if (input.luxuryBrandFit < MIN_LUXURY_FIT) reasons.push("luxury_brand_fit_below_95");
  if (input.confidenceScore < MIN_CONFIDENCE) reasons.push("confidence_below_70");
  if (input.evidenceCount <= 0) reasons.push("missing_evidence");
  if (input.sourceCoverage <= 0) reasons.push("missing_source_coverage");
  if (!input.rightsApproved) reasons.push("rights_not_approved");
  if (!input.methodologyPublishable) reasons.push("methodology_not_publishable");
  if (!input.freshnessCurrent) reasons.push("freshness_not_current");
  if (!input.checksumPresent) reasons.push("missing_checksum");
  if (input.vertical === "artfund" && input.provenanceDisputed) reasons.push("provenance_disputed");
  if (!input.selfHealingVerified) reasons.push("self_healing_not_verified");
  if (!input.rollbackVerified) reasons.push("rollback_not_verified");
  if (!input.immutableHistoryVerified) reasons.push("immutable_history_not_verified");
  if (!input.failureIsolationVerified) reasons.push("failure_isolation_not_verified");

  const retryable = reasons.length > 0 && reasons.every((reason) =>
    ["missing_evidence", "missing_source_coverage", "freshness_not_current"].includes(reason),
  );
  const passed = reasons.length === 0;

  return {
    vertical: input.vertical,
    productKind: input.productKind,
    productId: input.productId,
    passed,
    state: passed ? "published" : retryable ? "retry_scheduled" : "blocked",
    reasons: [...reasons].sort(),
    certifiedAt,
  };
}

export interface Week5CertificationInput {
  products: ProductCertificationInput[];
  certifiedAt: string;
}

export interface Week5CertificationResult {
  passed: boolean;
  authorizedNextStage: "week_6_release_candidate" | "none";
  results: ProductCertificationResult[];
  failures: string[];
}

export function certifyWeek5(input: Week5CertificationInput): Week5CertificationResult {
  const results = input.products
    .map((product) => certifyAutonomousProduct(product, input.certifiedAt))
    .sort((a, b) => `${a.vertical}:${a.productKind}:${a.productId}`.localeCompare(`${b.vertical}:${b.productKind}:${b.productId}`));
  const failures = results
    .filter((result) => !result.passed)
    .map((result) => `${result.vertical}:${result.productKind}:${result.productId}:${result.reasons.join(",")}`);
  return {
    passed: failures.length === 0,
    authorizedNextStage: failures.length === 0 ? "week_6_release_candidate" : "none",
    results,
    failures,
  };
}
