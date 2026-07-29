import type {
  CommercialEligibility,
  ConfidenceAssessment,
  MethodologyRegistryRecord,
  RightsRegistryRecord,
  SourceRegistryRecord,
} from "./index";

const ACTIVE_SOURCE_STATUSES = new Set(["approved", "active", "degraded"]);
const ACTIVE_METHODOLOGY_STATUSES = new Set(["approved", "active"]);

export function evaluateCommercialEligibility(input: {
  source: SourceRegistryRecord;
  rights: RightsRegistryRecord;
  confidence?: ConfidenceAssessment;
  methodology?: MethodologyRegistryRecord;
}): CommercialEligibility {
  const { source, rights, confidence, methodology } = input;
  const reasons: string[] = [];

  const sourceOperational = ACTIVE_SOURCE_STATUSES.has(source.status);
  if (!sourceOperational) reasons.push(`source_status:${source.status}`);

  const rightsApproved = rights.status === "approved";
  if (!rightsApproved) reasons.push(`rights_status:${rights.status}`);

  if (!rights.collectAllowed) reasons.push("collect_not_allowed");
  if (!rights.storeAllowed) reasons.push("store_not_allowed");
  if (!rights.transformAllowed) reasons.push("transform_not_allowed");
  if (!rights.displayAllowed) reasons.push("display_not_allowed");
  if (!rights.redistributeAllowed) reasons.push("redistribute_not_allowed");
  if (!rights.sellAllowed) reasons.push("sell_not_allowed");

  const confidenceEligible = Boolean(
    confidence && confidence.grade !== "U" && confidence.score >= 70,
  );
  if (!confidenceEligible) reasons.push("confidence_below_commercial_gate");

  const methodologyEligible = Boolean(
    methodology && ACTIVE_METHODOLOGY_STATUSES.has(methodology.status),
  );
  if (!methodologyEligible) reasons.push("methodology_not_approved");

  const base = sourceOperational && rightsApproved && rights.collectAllowed && rights.storeAllowed;
  const transform = base && rights.transformAllowed;
  const display = transform && rights.displayAllowed && confidenceEligible;
  const redistribute = display && rights.redistributeAllowed;
  const sell = redistribute && rights.sellAllowed;

  return {
    collect: sourceOperational && rightsApproved && rights.collectAllowed,
    store: base,
    transform,
    display,
    redistribute,
    sell,
    eligibleForPortal: display,
    eligibleForIndex: transform && confidenceEligible && methodologyEligible,
    eligibleForReport: display && methodologyEligible,
    eligibleForApi: redistribute && methodologyEligible,
    reasons,
  };
}

export function confidenceGradeFromScore(score: number): ConfidenceAssessment["grade"] {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new RangeError("confidence score must be between 0 and 100");
  }
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 50) return "D";
  return "U";
}
