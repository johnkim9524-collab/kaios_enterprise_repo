export type MarketAdapterState =
  | 'ADAPTER_NOT_IMPLEMENTED'
  | 'PREFLIGHT_ONLY'
  | 'IMPLEMENTED_NOT_RIGHTS_VERIFIED'
  | 'IMPLEMENTED_NOT_SEMANTICS_VERIFIED'
  | 'ACTIVATED_EVIDENCE_BOUND'
  | 'SUSPENDED_SCHEMA_DRIFT'
  | 'SUSPENDED_RIGHTS_CHANGE'
  | 'RETIRED';

export type MarketClaimTarget =
  | 'DATED_OBSERVED_SOLD_TRANSACTION'
  | 'CURRENT_PRICE'
  | 'LIQUIDITY_OR_TIME_TO_SALE';

export type MarketEvidenceKind = 'EMPIRICAL_SOURCE_OBSERVATION' | 'SYNTHETIC_CONTROL_ONLY';
export type RightsDecision = 'ALLOW' | 'DENY' | 'UNKNOWN';
export type AdapterDecisionState = 'HOLD' | 'REJECT' | 'NORMALIZED_READY_FOR_GATE' | 'NORMALIZED_FIXTURE_NON_PROMOTABLE';

export interface MarketAdapterProfile {
  source_id: string;
  canonical_host: string;
  adapter_state: MarketAdapterState;
  source_schema_version: string;
  target_claims: MarketClaimTarget[];
  required_schema_fields: string[];
  fixture_only: boolean;
  provider_direct_to_index_or_projection_allowed: false;
}

export interface FieldPurposeRightsSnapshot {
  decision: RightsDecision;
  rights: string[];
  effective_at: string;
  evidence_refs: string[];
}

export interface DatedSoldAdapterInput {
  evidence_kind: MarketEvidenceKind;
  source_id: string;
  source_record_id: string;
  canonical_object_id: string;
  terminal_market_state: string;
  realized_price: number | null;
  currency: string | null;
  event_at: string;
  observed_at: string;
  condition_segment: string;
  source_owner_id: string;
  factual_origin_id: string;
  field_purpose_rights: FieldPurposeRightsSnapshot;
  provenance_refs: string[];
  input_snapshot_ref: string;
  source_schema_version: string;
  source_payload_hash: string;
}

export interface LiquidityAdapterInput {
  evidence_kind: MarketEvidenceKind;
  source_id: string;
  source_record_id: string;
  canonical_object_id: string;
  exposure_start_at: string;
  observation_end_at: string;
  outcome_state: string;
  censoring_state: string;
  failed_sale_handling: string;
  exposure_denominator_id: string;
  source_owner_id: string;
  factual_origin_id: string;
  field_purpose_rights: FieldPurposeRightsSnapshot;
  provenance_refs: string[];
  input_snapshot_ref: string;
  source_schema_version: string;
  source_payload_hash: string;
}

export interface NormalizedDatedSoldRecord {
  normalized_record_id: string;
  record_type: 'DATED_OBSERVED_SOLD_TRANSACTION';
  evidence_kind: MarketEvidenceKind;
  source_id: string;
  source_record_id: string;
  canonical_object_id: string;
  terminal_market_state: 'SOLD';
  realized_price: number;
  currency: string;
  event_at: string;
  observed_at: string;
  condition_segment: string;
  source_owner_id: string;
  factual_origin_id: string;
  field_purpose_rights_refs: string[];
  provenance_refs: string[];
  input_snapshot_ref: string;
  source_schema_version: string;
  source_payload_hash: string;
  duplicate_grain: string;
  market_event_admitted: false;
  current_price_eligible: false;
  public_projection_authorized: false;
  production_authorized: false;
}

export interface NormalizedLiquidityRecord {
  normalized_record_id: string;
  record_type: 'LIQUIDITY_OR_TIME_TO_SALE';
  evidence_kind: MarketEvidenceKind;
  source_id: string;
  source_record_id: string;
  canonical_object_id: string;
  exposure_start_at: string;
  observation_end_at: string;
  outcome_state: 'SOLD' | 'UNSOLD' | 'WITHDRAWN' | 'FAILED_SALE' | 'RIGHT_CENSORED';
  censoring_state: string;
  failed_sale_handling: string;
  exposure_denominator_id: string;
  source_owner_id: string;
  factual_origin_id: string;
  field_purpose_rights_refs: string[];
  provenance_refs: string[];
  input_snapshot_ref: string;
  source_schema_version: string;
  source_payload_hash: string;
  exposure_duration_seconds: number;
  duplicate_grain: string;
  market_event_admitted: false;
  liquidity_eligible: false;
  public_projection_authorized: false;
  production_authorized: false;
}

export interface AdapterDecision<T> {
  decision_id: string;
  state: AdapterDecisionState;
  claim_target: MarketClaimTarget;
  source_id: string;
  reason_codes: string[];
  missing_requirements: string[];
  normalized_record: T | null;
  market_event_admitted: false;
  customer_claim_authorized: false;
  public_release: 'HOLD';
  production: 'HOLD';
}

export interface OutlierDuplicateControlReceipt {
  receipt_id: string;
  method_id: 'kidults-outlier-duplicate-control-v1';
  method_version: '1.0.0';
  decision: 'VERIFIED_PASS' | 'HOLD';
  evaluated_at: string;
  normalized_record_ids: string[];
  record_set_digest: string;
  duplicate_count: number;
  outlier_count: number;
  receipt_digest: string;
}

const requiredRights = ['COLLECT_RIGHT', 'BOUNDED_STORE_RIGHT', 'INTERNAL_DERIVE_RIGHT'] as const;
const allowedAdapterStates = new Set<MarketAdapterState>([
  'ADAPTER_NOT_IMPLEMENTED',
  'PREFLIGHT_ONLY',
  'IMPLEMENTED_NOT_RIGHTS_VERIFIED',
  'IMPLEMENTED_NOT_SEMANTICS_VERIFIED',
  'ACTIVATED_EVIDENCE_BOUND',
  'SUSPENDED_SCHEMA_DRIFT',
  'SUSPENDED_RIGHTS_CHANGE',
  'RETIRED',
]);
const allowedClaimTargets = new Set<MarketClaimTarget>([
  'DATED_OBSERVED_SOLD_TRANSACTION',
  'CURRENT_PRICE',
  'LIQUIDITY_OR_TIME_TO_SALE',
]);
const allowedLiquidityOutcomes = new Set<NormalizedLiquidityRecord['outcome_state']>([
  'SOLD', 'UNSOLD', 'WITHDRAWN', 'FAILED_SALE', 'RIGHT_CENSORED',
]);
const soldLookalikes = new Set(['LISTED', 'ACTIVE', 'BID', 'ASK', 'OFFER', 'RESERVE', 'PENDING', 'UNKNOWN']);
const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const sha256RefPattern = /^sha256:[a-f0-9]{64}$/;
const currencyPattern = /^[A-Z]{3}$/;
const hostPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const uniqueSorted = (values: string[]) => [...new Set(values)].sort();

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort()
      .map((key) => [key, canonicalValue((value as Record<string, unknown>)[key])]));
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalValue(value)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function normalizedTime(value: string, code: string): string {
  if (!rfc3339.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(code);
  return new Date(value).toISOString();
}

export function assertMarketAdapterProfile(profile: MarketAdapterProfile): void {
  if (!nonEmpty(profile.source_id)) throw new Error('ASI_MARKET_ADAPTER_SOURCE_ID_REQUIRED');
  if (!hostPattern.test(profile.canonical_host)) throw new Error('ASI_MARKET_ADAPTER_HOST_INVALID');
  if (!allowedAdapterStates.has(profile.adapter_state)) throw new Error('ASI_MARKET_ADAPTER_STATE_INVALID');
  if (!nonEmpty(profile.source_schema_version)) throw new Error('ASI_MARKET_ADAPTER_SCHEMA_VERSION_REQUIRED');
  if (!Array.isArray(profile.target_claims) || profile.target_claims.length === 0 ||
      profile.target_claims.some((target) => !allowedClaimTargets.has(target)) ||
      new Set(profile.target_claims).size !== profile.target_claims.length) {
    throw new Error('ASI_MARKET_ADAPTER_TARGET_CLAIMS_INVALID');
  }
  if (!Array.isArray(profile.required_schema_fields) || profile.required_schema_fields.length === 0 ||
      profile.required_schema_fields.some((field) => !nonEmpty(field)) ||
      new Set(profile.required_schema_fields).size !== profile.required_schema_fields.length) {
    throw new Error('ASI_MARKET_ADAPTER_REQUIRED_SCHEMA_FIELDS_INVALID');
  }
  if (profile.provider_direct_to_index_or_projection_allowed !== false) {
    throw new Error('ASI_MARKET_ADAPTER_PROVIDER_DIRECT_PATH_FORBIDDEN');
  }
}

export function evaluateMarketAdapterSchema(profile: MarketAdapterProfile, observedFields: string[]): {
  state: 'MATCH' | 'DRIFT_HOLD';
  missing_fields: string[];
  unexpected_fields: string[];
} {
  assertMarketAdapterProfile(profile);
  const observed = new Set(observedFields);
  const required = new Set(profile.required_schema_fields);
  const missing = profile.required_schema_fields.filter((field) => !observed.has(field)).sort();
  const unexpected = [...observed].filter((field) => !required.has(field)).sort();
  return { state: missing.length === 0 ? 'MATCH' : 'DRIFT_HOLD', missing_fields: missing, unexpected_fields: unexpected };
}

function rightsFailures(snapshot: FieldPurposeRightsSnapshot): string[] {
  const failures: string[] = [];
  if (!snapshot || snapshot.decision !== 'ALLOW') failures.push('FIELD_PURPOSE_RIGHTS_NOT_ALLOW');
  const rights = new Set(snapshot?.rights || []);
  for (const right of requiredRights) if (!rights.has(right)) failures.push(`MISSING_${right}`);
  if (!nonEmpty(snapshot?.effective_at) || !rfc3339.test(snapshot.effective_at) || !Number.isFinite(Date.parse(snapshot.effective_at))) {
    failures.push('RIGHTS_EFFECTIVE_AT_INVALID');
  }
  if (!Array.isArray(snapshot?.evidence_refs) || snapshot.evidence_refs.length === 0 || snapshot.evidence_refs.some((ref) => !nonEmpty(ref))) {
    failures.push('RIGHTS_EVIDENCE_REFS_MISSING');
  }
  return failures;
}

function profileFailures(profile: MarketAdapterProfile, sourceId: string, schemaVersion: string, target: MarketClaimTarget): string[] {
  const failures: string[] = [];
  if (sourceId !== profile.source_id) failures.push('SOURCE_PROFILE_MISMATCH');
  if (schemaVersion !== profile.source_schema_version) failures.push('SOURCE_SCHEMA_VERSION_MISMATCH');
  if (!profile.target_claims.includes(target)) failures.push('CLAIM_TARGET_NOT_REGISTERED');
  if (profile.adapter_state !== 'ACTIVATED_EVIDENCE_BOUND') failures.push(`ADAPTER_STATE_${profile.adapter_state}`);
  return failures;
}

function baseInputFailures(input: {
  source_record_id: string;
  canonical_object_id: string;
  source_owner_id: string;
  factual_origin_id: string;
  provenance_refs: string[];
  input_snapshot_ref: string;
  source_payload_hash: string;
}): string[] {
  const failures: string[] = [];
  if (!nonEmpty(input.source_record_id)) failures.push('SOURCE_RECORD_ID_MISSING');
  if (!nonEmpty(input.canonical_object_id)) failures.push('CANONICAL_OBJECT_ID_MISSING');
  if (!nonEmpty(input.source_owner_id)) failures.push('SOURCE_OWNER_ID_MISSING');
  if (!nonEmpty(input.factual_origin_id)) failures.push('FACTUAL_ORIGIN_ID_MISSING');
  if (!Array.isArray(input.provenance_refs) || input.provenance_refs.length === 0 || input.provenance_refs.some((ref) => !nonEmpty(ref))) {
    failures.push('PROVENANCE_REFS_MISSING');
  }
  if (!sha256RefPattern.test(input.input_snapshot_ref || '')) failures.push('INPUT_SNAPSHOT_REF_INVALID');
  if (!sha256RefPattern.test(input.source_payload_hash || '')) failures.push('SOURCE_PAYLOAD_HASH_INVALID');
  return failures;
}

function decisionState(profile: MarketAdapterProfile, evidenceKind: MarketEvidenceKind, failures: string[]): AdapterDecisionState {
  if (failures.some((code) => code === 'TERMINAL_STATE_NOT_SOLD' || code === 'LISTING_OR_QUOTE_MISREPRESENTED_AS_SOLD' || code === 'RIGHTS_DENY')) return 'REJECT';
  if (failures.length > 0) return 'HOLD';
  if (profile.fixture_only || evidenceKind === 'SYNTHETIC_CONTROL_ONLY') return 'NORMALIZED_FIXTURE_NON_PROMOTABLE';
  return 'NORMALIZED_READY_FOR_GATE';
}

export async function normalizeDatedSoldTransaction(
  profile: MarketAdapterProfile,
  input: DatedSoldAdapterInput,
): Promise<AdapterDecision<NormalizedDatedSoldRecord>> {
  assertMarketAdapterProfile(profile);
  const failures = [
    ...profileFailures(profile, input.source_id, input.source_schema_version, 'DATED_OBSERVED_SOLD_TRANSACTION'),
    ...baseInputFailures(input),
    ...rightsFailures(input.field_purpose_rights),
  ];
  const terminal = String(input.terminal_market_state || '').toUpperCase();
  if (soldLookalikes.has(terminal)) failures.push('LISTING_OR_QUOTE_MISREPRESENTED_AS_SOLD');
  else if (terminal !== 'SOLD') failures.push('TERMINAL_STATE_NOT_SOLD');
  if (!Number.isFinite(input.realized_price) || Number(input.realized_price) <= 0) failures.push('REALIZED_PRICE_INVALID');
  if (!currencyPattern.test(String(input.currency || ''))) failures.push('CURRENCY_INVALID');
  let eventAt = input.event_at;
  let observedAt = input.observed_at;
  try { eventAt = normalizedTime(input.event_at, 'EVENT_AT_INVALID'); } catch { failures.push('EVENT_AT_INVALID'); }
  try { observedAt = normalizedTime(input.observed_at, 'OBSERVED_AT_INVALID'); } catch { failures.push('OBSERVED_AT_INVALID'); }
  if (Number.isFinite(Date.parse(eventAt)) && Number.isFinite(Date.parse(observedAt)) && Date.parse(eventAt) > Date.parse(observedAt)) {
    failures.push('EVENT_AFTER_OBSERVATION');
  }
  if (!nonEmpty(input.condition_segment)) failures.push('CONDITION_SEGMENT_MISSING');
  if (input.field_purpose_rights?.decision === 'DENY') failures.push('RIGHTS_DENY');
  const reasonCodes = uniqueSorted(failures);
  const state = decisionState(profile, input.evidence_kind, reasonCodes);
  let normalizedRecord: NormalizedDatedSoldRecord | null = null;
  if (state === 'NORMALIZED_READY_FOR_GATE' || state === 'NORMALIZED_FIXTURE_NON_PROMOTABLE') {
    const grain = {
      source_id: input.source_id,
      source_record_id: input.source_record_id,
      factual_origin_id: input.factual_origin_id,
      canonical_object_id: input.canonical_object_id,
    };
    normalizedRecord = {
      normalized_record_id: await sha256({ type: 'dated-sold', grain, input_snapshot_ref: input.input_snapshot_ref }),
      record_type: 'DATED_OBSERVED_SOLD_TRANSACTION',
      evidence_kind: input.evidence_kind,
      source_id: input.source_id,
      source_record_id: input.source_record_id,
      canonical_object_id: input.canonical_object_id,
      terminal_market_state: 'SOLD',
      realized_price: Number(input.realized_price),
      currency: String(input.currency),
      event_at: eventAt,
      observed_at: observedAt,
      condition_segment: input.condition_segment,
      source_owner_id: input.source_owner_id,
      factual_origin_id: input.factual_origin_id,
      field_purpose_rights_refs: uniqueSorted(input.field_purpose_rights.evidence_refs),
      provenance_refs: uniqueSorted(input.provenance_refs),
      input_snapshot_ref: input.input_snapshot_ref,
      source_schema_version: input.source_schema_version,
      source_payload_hash: input.source_payload_hash,
      duplicate_grain: await sha256(grain),
      market_event_admitted: false,
      current_price_eligible: false,
      public_projection_authorized: false,
      production_authorized: false,
    };
  }
  return {
    decision_id: await sha256({ target: 'dated-sold', profile: profile.source_id, input, reason_codes: reasonCodes }),
    state,
    claim_target: 'DATED_OBSERVED_SOLD_TRANSACTION',
    source_id: input.source_id,
    reason_codes: reasonCodes,
    missing_requirements: reasonCodes,
    normalized_record: normalizedRecord,
    market_event_admitted: false,
    customer_claim_authorized: false,
    public_release: 'HOLD',
    production: 'HOLD',
  };
}

export async function normalizeLiquidityObservation(
  profile: MarketAdapterProfile,
  input: LiquidityAdapterInput,
): Promise<AdapterDecision<NormalizedLiquidityRecord>> {
  assertMarketAdapterProfile(profile);
  const failures = [
    ...profileFailures(profile, input.source_id, input.source_schema_version, 'LIQUIDITY_OR_TIME_TO_SALE'),
    ...baseInputFailures(input),
    ...rightsFailures(input.field_purpose_rights),
  ];
  let startAt = input.exposure_start_at;
  let endAt = input.observation_end_at;
  try { startAt = normalizedTime(input.exposure_start_at, 'EXPOSURE_START_INVALID'); } catch { failures.push('EXPOSURE_START_INVALID'); }
  try { endAt = normalizedTime(input.observation_end_at, 'OBSERVATION_END_INVALID'); } catch { failures.push('OBSERVATION_END_INVALID'); }
  if (Number.isFinite(Date.parse(startAt)) && Number.isFinite(Date.parse(endAt)) && Date.parse(endAt) < Date.parse(startAt)) {
    failures.push('EXPOSURE_END_BEFORE_START');
  }
  const outcome = String(input.outcome_state || '').toUpperCase() as NormalizedLiquidityRecord['outcome_state'];
  if (!allowedLiquidityOutcomes.has(outcome)) failures.push('OUTCOME_STATE_INVALID');
  if (!nonEmpty(input.censoring_state)) failures.push('CENSORING_STATE_MISSING');
  if (!nonEmpty(input.failed_sale_handling)) failures.push('FAILED_SALE_HANDLING_MISSING');
  if (!nonEmpty(input.exposure_denominator_id)) failures.push('EXPOSURE_DENOMINATOR_ID_MISSING');
  if (input.field_purpose_rights?.decision === 'DENY') failures.push('RIGHTS_DENY');
  const reasonCodes = uniqueSorted(failures);
  const state = decisionState(profile, input.evidence_kind, reasonCodes);
  let normalizedRecord: NormalizedLiquidityRecord | null = null;
  if (state === 'NORMALIZED_READY_FOR_GATE' || state === 'NORMALIZED_FIXTURE_NON_PROMOTABLE') {
    const grain = {
      source_id: input.source_id,
      source_record_id: input.source_record_id,
      factual_origin_id: input.factual_origin_id,
      canonical_object_id: input.canonical_object_id,
      exposure_denominator_id: input.exposure_denominator_id,
    };
    normalizedRecord = {
      normalized_record_id: await sha256({ type: 'liquidity', grain, input_snapshot_ref: input.input_snapshot_ref }),
      record_type: 'LIQUIDITY_OR_TIME_TO_SALE',
      evidence_kind: input.evidence_kind,
      source_id: input.source_id,
      source_record_id: input.source_record_id,
      canonical_object_id: input.canonical_object_id,
      exposure_start_at: startAt,
      observation_end_at: endAt,
      outcome_state: outcome,
      censoring_state: input.censoring_state,
      failed_sale_handling: input.failed_sale_handling,
      exposure_denominator_id: input.exposure_denominator_id,
      source_owner_id: input.source_owner_id,
      factual_origin_id: input.factual_origin_id,
      field_purpose_rights_refs: uniqueSorted(input.field_purpose_rights.evidence_refs),
      provenance_refs: uniqueSorted(input.provenance_refs),
      input_snapshot_ref: input.input_snapshot_ref,
      source_schema_version: input.source_schema_version,
      source_payload_hash: input.source_payload_hash,
      exposure_duration_seconds: Math.floor((Date.parse(endAt) - Date.parse(startAt)) / 1000),
      duplicate_grain: await sha256(grain),
      market_event_admitted: false,
      liquidity_eligible: false,
      public_projection_authorized: false,
      production_authorized: false,
    };
  }
  return {
    decision_id: await sha256({ target: 'liquidity', profile: profile.source_id, input, reason_codes: reasonCodes }),
    state,
    claim_target: 'LIQUIDITY_OR_TIME_TO_SALE',
    source_id: input.source_id,
    reason_codes: reasonCodes,
    missing_requirements: reasonCodes,
    normalized_record: normalizedRecord,
    market_event_admitted: false,
    customer_claim_authorized: false,
    public_release: 'HOLD',
    production: 'HOLD',
  };
}

function currentPriceControlRecordSet(records: NormalizedDatedSoldRecord[]): NormalizedDatedSoldRecord[] {
  return [...records].sort((left, right) => left.normalized_record_id.localeCompare(right.normalized_record_id));
}

export async function digestCurrentPriceControlRecordSet(records: NormalizedDatedSoldRecord[]): Promise<string> {
  return sha256(currentPriceControlRecordSet(records));
}

export async function digestOutlierDuplicateControlReceipt(
  receipt: Omit<OutlierDuplicateControlReceipt, 'receipt_digest'>,
): Promise<string> {
  return sha256(receipt);
}

export async function assessCurrentPriceReadiness(
  records: NormalizedDatedSoldRecord[],
  asOf: string,
  minimumSample = 3,
  controlReceipt: OutlierDuplicateControlReceipt | null = null,
): Promise<{
  state: 'HOLD' | 'READY_FOR_SEPARATE_CURRENT_PRICE_GATE';
  reason_codes: string[];
  sample_count: number;
  source_owner_count: number;
  factual_origin_count: number;
  current_price_eligible: false;
}> {
  const reasons: string[] = [];
  let asOfMs = Number.NaN;
  try { asOfMs = Date.parse(normalizedTime(asOf, 'AS_OF_INVALID')); } catch { reasons.push('AS_OF_INVALID'); }
  if (!Number.isInteger(minimumSample) || minimumSample < 2) reasons.push('MINIMUM_SAMPLE_INVALID');
  if (records.length < minimumSample) reasons.push('MINIMUM_SAMPLE_NOT_MET');
  if (records.some((record) => record.evidence_kind !== 'EMPIRICAL_SOURCE_OBSERVATION')) reasons.push('SYNTHETIC_OR_CONTROL_RECORD_PRESENT');
  if (records.some((record) => record.market_event_admitted !== false)) reasons.push('UNEXPECTED_MARKET_EVENT_ADMISSION_STATE');
  if (records.some((record) => !Number.isFinite(Date.parse(record.event_at)) || asOfMs - Date.parse(record.event_at) > 30 * 86400_000 || Date.parse(record.event_at) > asOfMs)) {
    reasons.push('FRESHNESS_OR_TEMPORAL_COHERENCE_NOT_MET');
  }
  const objectIds = new Set(records.map((record) => record.canonical_object_id));
  const currencies = new Set(records.map((record) => record.currency));
  const conditions = new Set(records.map((record) => record.condition_segment));
  if (objectIds.size > 1) reasons.push('CANONICAL_OBJECT_GRAIN_MISMATCH');
  if (currencies.size > 1) reasons.push('CURRENCY_NORMALIZATION_REQUIRED');
  if (conditions.size > 1) reasons.push('CONDITION_SEGMENTATION_REQUIRED');
  const sourceOwners = new Set(records.map((record) => record.source_owner_id));
  const factualOrigins = new Set(records.map((record) => record.factual_origin_id));
  if (sourceOwners.size < 2) reasons.push('SOURCE_OWNER_INDEPENDENCE_NOT_MET');
  if (factualOrigins.size < 2) reasons.push('FACTUAL_ORIGIN_INDEPENDENCE_NOT_MET');
  if (!controlReceipt) {
    reasons.push('OUTLIER_AND_DUPLICATE_CONTROL_NOT_VERIFIED');
  } else {
    const expectedRecordIds = currentPriceControlRecordSet(records).map((record) => record.normalized_record_id);
    const suppliedRecordIds = controlReceipt.normalized_record_ids;
    if (controlReceipt.method_id !== 'kidults-outlier-duplicate-control-v1' || controlReceipt.method_version !== '1.0.0') {
      reasons.push('OUTLIER_AND_DUPLICATE_CONTROL_METHOD_INVALID');
    }
    if (controlReceipt.decision !== 'VERIFIED_PASS' || controlReceipt.duplicate_count !== 0 || controlReceipt.outlier_count !== 0) {
      reasons.push('OUTLIER_AND_DUPLICATE_CONTROL_NOT_PASS');
    }
    if (!Array.isArray(suppliedRecordIds) || suppliedRecordIds.length !== records.length ||
        new Set(suppliedRecordIds).size !== suppliedRecordIds.length ||
        JSON.stringify(suppliedRecordIds) !== JSON.stringify(expectedRecordIds)) {
      reasons.push('OUTLIER_AND_DUPLICATE_CONTROL_RECORD_IDS_MISMATCH');
    }
    if (!sha256RefPattern.test(controlReceipt.receipt_id || '') || !sha256RefPattern.test(controlReceipt.receipt_digest || '')) {
      reasons.push('OUTLIER_AND_DUPLICATE_CONTROL_RECEIPT_ID_OR_DIGEST_INVALID');
    }
    let evaluatedAt = Number.NaN;
    try { evaluatedAt = Date.parse(normalizedTime(controlReceipt.evaluated_at, 'CONTROL_EVALUATED_AT_INVALID')); } catch {
      reasons.push('OUTLIER_AND_DUPLICATE_CONTROL_EVALUATED_AT_INVALID');
    }
    if (Number.isFinite(evaluatedAt) && Number.isFinite(asOfMs) && evaluatedAt > asOfMs) {
      reasons.push('OUTLIER_AND_DUPLICATE_CONTROL_AFTER_AS_OF');
    }
    if (controlReceipt.record_set_digest !== await digestCurrentPriceControlRecordSet(records)) {
      reasons.push('OUTLIER_AND_DUPLICATE_CONTROL_RECORD_SET_DIGEST_MISMATCH');
    }
    const { receipt_digest: suppliedReceiptDigest, ...unsignedReceipt } = controlReceipt;
    if (suppliedReceiptDigest !== await digestOutlierDuplicateControlReceipt(unsignedReceipt)) {
      reasons.push('OUTLIER_AND_DUPLICATE_CONTROL_RECEIPT_DIGEST_MISMATCH');
    }
  }
  const sortedReasons = uniqueSorted(reasons);
  return {
    state: sortedReasons.length === 0 ? 'READY_FOR_SEPARATE_CURRENT_PRICE_GATE' : 'HOLD',
    reason_codes: sortedReasons,
    sample_count: records.length,
    source_owner_count: sourceOwners.size,
    factual_origin_count: factualOrigins.size,
    current_price_eligible: false,
  };
}
