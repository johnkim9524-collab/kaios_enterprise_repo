export type Vertical = "kidults" | "artfund";

export type ScoreName =
  | "brand_momentum"
  | "canon_strength"
  | "liquidity_grade"
  | "artist_momentum"
  | "auction_liquidity"
  | "provenance_strength";

export interface MethodologyRef {
  methodologyId: string;
  version: string;
  checksum: string;
  status: "approved" | "active";
}

export interface WeightedInput {
  name: string;
  value: number;
  weight: number;
  confidence: number;
  evidenceCount: number;
}

export interface ScoreRequest {
  vertical: Vertical;
  scoreName: ScoreName;
  subjectId: string;
  asOf: string;
  methodology: MethodologyRef;
  inputs: WeightedInput[];
}

export interface ScoreResult {
  vertical: Vertical;
  scoreName: ScoreName;
  subjectId: string;
  asOf: string;
  value: number;
  confidence: number;
  evidenceCount: number;
  methodologyId: string;
  methodologyVersion: string;
  methodologyChecksum: string;
  inputFingerprint: string;
}

export interface IndexConstituent {
  constituentId: string;
  normalizedValue: number;
  weight: number;
  eligible: boolean;
  confidence: number;
}

export interface IndexRequest {
  indexId: string;
  vertical: Vertical;
  asOf: string;
  baseValue: number;
  methodology: MethodologyRef;
  constituents: IndexConstituent[];
}

export interface IndexResult {
  indexId: string;
  vertical: Vertical;
  asOf: string;
  level: number;
  eligibleConstituentCount: number;
  aggregateConfidence: number;
  methodologyId: string;
  methodologyVersion: string;
  methodologyChecksum: string;
  inputFingerprint: string;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function stableFingerprint(parts: string[]): string {
  const text = parts.join("|");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function validateMethodology(methodology: MethodologyRef): void {
  if (!methodology.methodologyId || !methodology.version || !methodology.checksum) {
    throw new Error("methodology_reference_incomplete");
  }
  if (methodology.status !== "approved" && methodology.status !== "active") {
    throw new Error("methodology_not_approved");
  }
}

export function calculateScore(request: ScoreRequest): ScoreResult {
  validateMethodology(request.methodology);
  if (request.inputs.length === 0) throw new Error("score_inputs_required");

  const ordered = [...request.inputs].sort((a, b) => a.name.localeCompare(b.name));
  const totalWeight = ordered.reduce((sum, input) => sum + input.weight, 0);
  if (totalWeight <= 0) throw new Error("positive_total_weight_required");

  for (const input of ordered) {
    if (input.weight < 0) throw new Error("negative_weight_prohibited");
    if (input.confidence < 0 || input.confidence > 100) throw new Error("invalid_confidence");
    if (!Number.isFinite(input.value)) throw new Error("invalid_input_value");
  }

  const value = ordered.reduce(
    (sum, input) => sum + clamp(input.value) * (input.weight / totalWeight),
    0,
  );
  const confidence = ordered.reduce(
    (sum, input) => sum + clamp(input.confidence) * (input.weight / totalWeight),
    0,
  );
  const evidenceCount = ordered.reduce((sum, input) => sum + Math.max(0, input.evidenceCount), 0);

  const fingerprint = stableFingerprint([
    request.vertical,
    request.scoreName,
    request.subjectId,
    request.asOf,
    request.methodology.methodologyId,
    request.methodology.version,
    request.methodology.checksum,
    ...ordered.flatMap((input) => [input.name, String(input.value), String(input.weight), String(input.confidence), String(input.evidenceCount)]),
  ]);

  return {
    vertical: request.vertical,
    scoreName: request.scoreName,
    subjectId: request.subjectId,
    asOf: request.asOf,
    value: round(value, 2),
    confidence: round(confidence, 2),
    evidenceCount,
    methodologyId: request.methodology.methodologyId,
    methodologyVersion: request.methodology.version,
    methodologyChecksum: request.methodology.checksum,
    inputFingerprint: fingerprint,
  };
}

export function calculateDailyIndex(request: IndexRequest): IndexResult {
  validateMethodology(request.methodology);
  if (!Number.isFinite(request.baseValue) || request.baseValue <= 0) {
    throw new Error("positive_base_value_required");
  }

  const eligible = request.constituents
    .filter((item) => item.eligible && item.confidence >= 70)
    .sort((a, b) => a.constituentId.localeCompare(b.constituentId));
  if (eligible.length === 0) throw new Error("eligible_constituents_required");

  const totalWeight = eligible.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) throw new Error("positive_total_weight_required");

  const weightedLevel = eligible.reduce(
    (sum, item) => sum + item.normalizedValue * (item.weight / totalWeight),
    0,
  );
  const aggregateConfidence = eligible.reduce(
    (sum, item) => sum + clamp(item.confidence) * (item.weight / totalWeight),
    0,
  );

  const fingerprint = stableFingerprint([
    request.indexId,
    request.vertical,
    request.asOf,
    String(request.baseValue),
    request.methodology.methodologyId,
    request.methodology.version,
    request.methodology.checksum,
    ...eligible.flatMap((item) => [item.constituentId, String(item.normalizedValue), String(item.weight), String(item.confidence)]),
  ]);

  return {
    indexId: request.indexId,
    vertical: request.vertical,
    asOf: request.asOf,
    level: round(request.baseValue * weightedLevel, 4),
    eligibleConstituentCount: eligible.length,
    aggregateConfidence: round(aggregateConfidence, 2),
    methodologyId: request.methodology.methodologyId,
    methodologyVersion: request.methodology.version,
    methodologyChecksum: request.methodology.checksum,
    inputFingerprint: fingerprint,
  };
}
