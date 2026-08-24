import {
  normalizeDatedSoldTransaction,
  normalizeLiquidityObservation,
  type AdapterDecision,
  type DatedSoldAdapterInput,
  type FieldPurposeRightsSnapshot,
  type LiquidityAdapterInput,
  type MarketAdapterProfile,
  type MarketClaimTarget,
  type MarketEvidenceKind,
  type NormalizedDatedSoldRecord,
  type NormalizedLiquidityRecord,
} from '../market-adapter.js';

export type GovernedMarketSurfaceFamily =
  | 'STRUCTURED_API_TRANSACTION'
  | 'AGGREGATE_PRICE_GUIDE_CONTEXT'
  | 'MARKETPLACE_EXPOSURE'
  | 'RELEASE_OR_LISTING_CONTEXT';

export type GovernedMarketSurfaceParserState =
  | 'TRANSACTION_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA'
  | 'EXPOSURE_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA'
  | 'CONTEXT_ONLY_NOT_TRANSACTION_OR_LIQUIDITY'
  | 'REJECTED_SNAPSHOT_INTEGRITY'
  | 'REJECTED_MARKET_SEMANTICS';

export interface GovernedMarketSurfaceProfile {
  source_id: string;
  canonical_host: string;
  allowed_hosts: string[];
  allowed_path_prefixes: string[];
  source_schema_version: string;
  source_owner_candidate_id: string;
  family: GovernedMarketSurfaceFamily;
  registered_claims: MarketClaimTarget[];
  implemented_claim_parsers: MarketClaimTarget[];
  transaction_fields?: {
    record_id: string;
    status: string;
    realized_price: string;
    currency: string;
    event_at: string;
  };
  exposure_fields?: {
    record_id: string;
    exposure_start_at: string;
    observation_end_at: string;
    outcome_state: string;
    censoring_state: string;
    failed_sale_handling: string;
    exposure_denominator_id: string;
  };
}

export interface GovernedMarketSurfaceSnapshot {
  source_url: string;
  observed_at: string;
  payload: string;
  input_snapshot_ref: string;
  source_payload_hash: string;
  canonical_object_id: string;
  condition_segment: string;
  evidence_kind: MarketEvidenceKind;
}

export interface GovernedTransactionCandidate {
  source_record_id: string;
  canonical_object_id: string;
  terminal_market_state: 'SOLD';
  realized_price: number;
  currency: string;
  event_at: string;
  observed_at: string;
  condition_segment: string;
  source_owner_candidate_id: string;
  source_owner_verified: false;
  factual_origin_candidate_id: string;
  factual_origin_verified: false;
  source_schema_version: string;
  source_payload_hash: string;
  input_snapshot_ref: string;
  provenance_refs: string[];
}

export interface GovernedExposureCandidate {
  source_record_id: string;
  canonical_object_id: string;
  exposure_start_at: string;
  observation_end_at: string;
  outcome_state: 'SOLD' | 'UNSOLD' | 'WITHDRAWN' | 'FAILED_SALE' | 'RIGHT_CENSORED';
  censoring_state: string;
  failed_sale_handling: string;
  exposure_denominator_id: string;
  source_owner_candidate_id: string;
  source_owner_verified: false;
  factual_origin_candidate_id: string;
  factual_origin_verified: false;
  source_schema_version: string;
  source_payload_hash: string;
  input_snapshot_ref: string;
  provenance_refs: string[];
}

export interface GovernedMarketSurfaceResult {
  parser_state: GovernedMarketSurfaceParserState;
  source_id: string;
  family: GovernedMarketSurfaceFamily;
  reason_codes: string[];
  transaction_candidate: GovernedTransactionCandidate | null;
  exposure_candidate: GovernedExposureCandidate | null;
  generic_runtime_decision:
    | AdapterDecision<NormalizedDatedSoldRecord>
    | AdapterDecision<NormalizedLiquidityRecord>
    | null;
  live_schema_verified: false;
  rights_pass_created: false;
  sold_semantics_empirically_verified: false;
  liquidity_semantics_empirically_verified: false;
  source_owner_verified: false;
  factual_origin_verified: false;
  adapter_activated: false;
  evidence_admitted: false;
  market_event_created: false;
  current_price_created: false;
  liquidity_measure_created: false;
  public_release: 'HOLD';
  production: 'HOLD';
}

const sha256Pattern = /^sha256:[a-f0-9]{64}$/;
const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const currencyPattern = /^[A-Z]{3}$/;
const allowedEvidenceKinds = new Set<MarketEvidenceKind>([
  'EMPIRICAL_SOURCE_OBSERVATION',
  'SYNTHETIC_CONTROL_ONLY',
]);
const allowedExposureOutcomes = new Set<GovernedExposureCandidate['outcome_state']>([
  'SOLD',
  'UNSOLD',
  'WITHDRAWN',
  'FAILED_SALE',
  'RIGHT_CENSORED',
]);
const soldLookalikes = new Set(['LISTED', 'ACTIVE', 'BID', 'ASK', 'OFFER', 'RESERVE', 'PENDING', 'UNKNOWN']);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const uniqueSorted = (values: string[]) => [...new Set(values)].sort();

async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function normalizedTime(value: unknown): string | null {
  if (!nonEmpty(value) || !rfc3339.test(value) || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function readString(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function readPositiveNumber(record: Record<string, unknown>, field: string): number | null {
  const value = record[field];
  const numberValue = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.replace(/,/g, '').trim())
      : Number.NaN;
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function parsePayload(payload: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(payload) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function unknownRightsSnapshot(observedAt: string, sourceUrl: string): FieldPurposeRightsSnapshot {
  return {
    decision: 'UNKNOWN',
    rights: [],
    effective_at: observedAt,
    evidence_refs: [`rights-review-required:${sourceUrl}`],
  };
}

function marketProfile(profile: GovernedMarketSurfaceProfile, target: MarketClaimTarget): MarketAdapterProfile {
  const soldFields = [
    'source_record_id',
    'canonical_object_id',
    'terminal_market_state',
    'realized_price',
    'currency',
    'event_at',
    'condition_segment',
    'source_owner_id',
    'factual_origin_id',
    'field_purpose_rights_refs',
    'provenance_refs',
    'input_snapshot_ref',
    'source_schema_version',
  ];
  const liquidityFields = [
    'source_record_id',
    'canonical_object_id',
    'exposure_start_at',
    'observation_end_at',
    'outcome_state',
    'censoring_state',
    'failed_sale_handling',
    'exposure_denominator_id',
    'source_owner_id',
    'factual_origin_id',
    'field_purpose_rights_refs',
    'provenance_refs',
    'input_snapshot_ref',
    'source_schema_version',
  ];
  return {
    source_id: profile.source_id,
    canonical_host: profile.canonical_host,
    adapter_state: 'IMPLEMENTED_NOT_RIGHTS_VERIFIED',
    source_schema_version: profile.source_schema_version,
    target_claims: [...profile.registered_claims],
    required_schema_fields: target === 'LIQUIDITY_OR_TIME_TO_SALE' ? liquidityFields : soldFields,
    fixture_only: false,
    provider_direct_to_index_or_projection_allowed: false,
  };
}

function baseResult(
  profile: GovernedMarketSurfaceProfile,
  state: GovernedMarketSurfaceParserState,
  reasons: string[],
): GovernedMarketSurfaceResult {
  return {
    parser_state: state,
    source_id: profile.source_id,
    family: profile.family,
    reason_codes: uniqueSorted(reasons),
    transaction_candidate: null,
    exposure_candidate: null,
    generic_runtime_decision: null,
    live_schema_verified: false,
    rights_pass_created: false,
    sold_semantics_empirically_verified: false,
    liquidity_semantics_empirically_verified: false,
    source_owner_verified: false,
    factual_origin_verified: false,
    adapter_activated: false,
    evidence_admitted: false,
    market_event_created: false,
    current_price_created: false,
    liquidity_measure_created: false,
    public_release: 'HOLD',
    production: 'HOLD',
  };
}

async function validateSnapshot(
  snapshot: GovernedMarketSurfaceSnapshot,
  profile: GovernedMarketSurfaceProfile,
): Promise<{ failures: string[]; sourceUrl: URL | null; record: Record<string, unknown> | null }> {
  const failures: string[] = [];
  let sourceUrl: URL | null = null;
  try {
    sourceUrl = new URL(snapshot.source_url);
  } catch {
    failures.push('SOURCE_URL_INVALID');
  }
  if (sourceUrl) {
    const host = sourceUrl.hostname.toLowerCase().replace(/\.$/, '');
    if (sourceUrl.protocol !== 'https:') failures.push('SOURCE_SCHEME_NOT_HTTPS');
    if (!profile.allowed_hosts.includes(host)) failures.push('SOURCE_HOST_NOT_ALLOWED');
    if (!profile.allowed_path_prefixes.some((prefix) => sourceUrl?.pathname.startsWith(prefix))) {
      failures.push('SOURCE_PATH_NOT_ALLOWED');
    }
  }
  if (!normalizedTime(snapshot.observed_at)) failures.push('OBSERVED_AT_INVALID');
  if (!sha256Pattern.test(snapshot.input_snapshot_ref)) failures.push('INPUT_SNAPSHOT_REF_INVALID');
  if (!sha256Pattern.test(snapshot.source_payload_hash)) failures.push('SOURCE_PAYLOAD_HASH_INVALID');
  if (!nonEmpty(snapshot.canonical_object_id)) failures.push('CANONICAL_OBJECT_ID_MISSING');
  if (!nonEmpty(snapshot.condition_segment)) failures.push('CONDITION_SEGMENT_MISSING');
  if (!allowedEvidenceKinds.has(snapshot.evidence_kind)) failures.push('EVIDENCE_KIND_INVALID');
  const actualHash = await sha256Text(snapshot.payload);
  if (actualHash !== snapshot.source_payload_hash) failures.push('SOURCE_PAYLOAD_HASH_MISMATCH');
  const record = parsePayload(snapshot.payload);
  if (!record) failures.push('SOURCE_PAYLOAD_NOT_OBJECT_JSON');
  return { failures: uniqueSorted(failures), sourceUrl, record };
}

export async function parseStrictTransactionSurface(
  snapshot: GovernedMarketSurfaceSnapshot,
  profile: GovernedMarketSurfaceProfile,
): Promise<GovernedMarketSurfaceResult> {
  if (profile.family !== 'STRUCTURED_API_TRANSACTION' || !profile.transaction_fields ||
      !profile.implemented_claim_parsers.includes('DATED_OBSERVED_SOLD_TRANSACTION')) {
    return baseResult(profile, 'REJECTED_MARKET_SEMANTICS', ['DATED_SOLD_PARSER_NOT_IMPLEMENTED_FOR_SOURCE_PROFILE']);
  }
  const validation = await validateSnapshot(snapshot, profile);
  if (validation.failures.length > 0 || !validation.record || !validation.sourceUrl) {
    return baseResult(profile, 'REJECTED_SNAPSHOT_INTEGRITY', validation.failures);
  }
  const fields = profile.transaction_fields;
  const recordId = readString(validation.record, fields.record_id);
  const status = (readString(validation.record, fields.status) || '').toUpperCase();
  const price = readPositiveNumber(validation.record, fields.realized_price);
  const currency = (readString(validation.record, fields.currency) || '').toUpperCase();
  const eventAt = normalizedTime(readString(validation.record, fields.event_at));
  const failures: string[] = [];
  if (!recordId) failures.push('SOURCE_RECORD_ID_MISSING');
  if (soldLookalikes.has(status)) failures.push('LISTING_OR_QUOTE_MISREPRESENTED_AS_SOLD');
  else if (status !== 'SOLD') failures.push('TERMINAL_STATE_NOT_SOLD');
  if (price === null) failures.push('REALIZED_PRICE_INVALID');
  if (!currencyPattern.test(currency)) failures.push('CURRENCY_INVALID_OR_AMBIGUOUS');
  if (!eventAt) failures.push('EVENT_AT_INVALID');
  if (failures.length > 0 || !recordId || price === null || !eventAt || !currencyPattern.test(currency)) {
    return baseResult(profile, 'REJECTED_MARKET_SEMANTICS', failures);
  }
  const observedAt = new Date(snapshot.observed_at).toISOString();
  const provenanceRefs = [snapshot.source_url, snapshot.input_snapshot_ref, snapshot.source_payload_hash];
  const candidate: GovernedTransactionCandidate = {
    source_record_id: recordId,
    canonical_object_id: snapshot.canonical_object_id,
    terminal_market_state: 'SOLD',
    realized_price: price,
    currency,
    event_at: eventAt,
    observed_at: observedAt,
    condition_segment: snapshot.condition_segment,
    source_owner_candidate_id: profile.source_owner_candidate_id,
    source_owner_verified: false,
    factual_origin_candidate_id: `${profile.source_id}::record:${recordId}`,
    factual_origin_verified: false,
    source_schema_version: profile.source_schema_version,
    source_payload_hash: snapshot.source_payload_hash,
    input_snapshot_ref: snapshot.input_snapshot_ref,
    provenance_refs: provenanceRefs,
  };
  const genericInput: DatedSoldAdapterInput = {
    evidence_kind: snapshot.evidence_kind,
    source_id: profile.source_id,
    source_record_id: candidate.source_record_id,
    canonical_object_id: candidate.canonical_object_id,
    terminal_market_state: candidate.terminal_market_state,
    realized_price: candidate.realized_price,
    currency: candidate.currency,
    event_at: candidate.event_at,
    observed_at: candidate.observed_at,
    condition_segment: candidate.condition_segment,
    source_owner_id: candidate.source_owner_candidate_id,
    factual_origin_id: candidate.factual_origin_candidate_id,
    field_purpose_rights: unknownRightsSnapshot(observedAt, snapshot.source_url),
    provenance_refs: candidate.provenance_refs,
    input_snapshot_ref: candidate.input_snapshot_ref,
    source_schema_version: candidate.source_schema_version,
    source_payload_hash: candidate.source_payload_hash,
  };
  const decision = await normalizeDatedSoldTransaction(
    marketProfile(profile, 'DATED_OBSERVED_SOLD_TRANSACTION'),
    genericInput,
  );
  return {
    ...baseResult(profile, 'TRANSACTION_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA', [
      'SOURCE_SPECIFIC_TRANSACTION_PARSER_IMPLEMENTED',
      'IMMUTABLE_TRANSACTION_CANDIDATE_PARSED',
      'LIVE_SCHEMA_NOT_VERIFIED',
      'FIELD_PURPOSE_RIGHTS_NOT_VERIFIED',
      'SOURCE_OWNER_NOT_VERIFIED',
      'FACTUAL_ORIGIN_NOT_VERIFIED',
      ...decision.reason_codes,
    ]),
    transaction_candidate: candidate,
    generic_runtime_decision: decision,
  };
}

export async function parseStrictExposureSurface(
  snapshot: GovernedMarketSurfaceSnapshot,
  profile: GovernedMarketSurfaceProfile,
): Promise<GovernedMarketSurfaceResult> {
  if (profile.family !== 'MARKETPLACE_EXPOSURE' || !profile.exposure_fields ||
      !profile.implemented_claim_parsers.includes('LIQUIDITY_OR_TIME_TO_SALE')) {
    return baseResult(profile, 'REJECTED_MARKET_SEMANTICS', ['LIQUIDITY_EXPOSURE_PARSER_NOT_IMPLEMENTED_FOR_SOURCE_PROFILE']);
  }
  const validation = await validateSnapshot(snapshot, profile);
  if (validation.failures.length > 0 || !validation.record || !validation.sourceUrl) {
    return baseResult(profile, 'REJECTED_SNAPSHOT_INTEGRITY', validation.failures);
  }
  const fields = profile.exposure_fields;
  const recordId = readString(validation.record, fields.record_id);
  const startAt = normalizedTime(readString(validation.record, fields.exposure_start_at));
  const endAt = normalizedTime(readString(validation.record, fields.observation_end_at));
  const outcome = (readString(validation.record, fields.outcome_state) || '').toUpperCase() as GovernedExposureCandidate['outcome_state'];
  const censoring = readString(validation.record, fields.censoring_state);
  const failedSale = readString(validation.record, fields.failed_sale_handling);
  const denominator = readString(validation.record, fields.exposure_denominator_id);
  const failures: string[] = [];
  if (!recordId) failures.push('SOURCE_RECORD_ID_MISSING');
  if (!startAt) failures.push('EXPOSURE_START_INVALID');
  if (!endAt) failures.push('OBSERVATION_END_INVALID');
  if (startAt && endAt && Date.parse(endAt) < Date.parse(startAt)) failures.push('EXPOSURE_END_BEFORE_START');
  if (!allowedExposureOutcomes.has(outcome)) failures.push('OUTCOME_STATE_INVALID');
  if (!censoring) failures.push('CENSORING_STATE_MISSING');
  if (!failedSale) failures.push('FAILED_SALE_HANDLING_MISSING');
  if (!denominator) failures.push('EXPOSURE_DENOMINATOR_ID_MISSING');
  if (failures.length > 0 || !recordId || !startAt || !endAt || !censoring || !failedSale || !denominator ||
      !allowedExposureOutcomes.has(outcome)) {
    return baseResult(profile, 'REJECTED_MARKET_SEMANTICS', failures);
  }
  const provenanceRefs = [snapshot.source_url, snapshot.input_snapshot_ref, snapshot.source_payload_hash];
  const candidate: GovernedExposureCandidate = {
    source_record_id: recordId,
    canonical_object_id: snapshot.canonical_object_id,
    exposure_start_at: startAt,
    observation_end_at: endAt,
    outcome_state: outcome,
    censoring_state: censoring,
    failed_sale_handling: failedSale,
    exposure_denominator_id: denominator,
    source_owner_candidate_id: profile.source_owner_candidate_id,
    source_owner_verified: false,
    factual_origin_candidate_id: `${profile.source_id}::exposure:${recordId}`,
    factual_origin_verified: false,
    source_schema_version: profile.source_schema_version,
    source_payload_hash: snapshot.source_payload_hash,
    input_snapshot_ref: snapshot.input_snapshot_ref,
    provenance_refs: provenanceRefs,
  };
  const genericInput: LiquidityAdapterInput = {
    evidence_kind: snapshot.evidence_kind,
    source_id: profile.source_id,
    source_record_id: candidate.source_record_id,
    canonical_object_id: candidate.canonical_object_id,
    exposure_start_at: candidate.exposure_start_at,
    observation_end_at: candidate.observation_end_at,
    outcome_state: candidate.outcome_state,
    censoring_state: candidate.censoring_state,
    failed_sale_handling: candidate.failed_sale_handling,
    exposure_denominator_id: candidate.exposure_denominator_id,
    source_owner_id: candidate.source_owner_candidate_id,
    factual_origin_id: candidate.factual_origin_candidate_id,
    field_purpose_rights: unknownRightsSnapshot(candidate.observation_end_at, snapshot.source_url),
    provenance_refs: candidate.provenance_refs,
    input_snapshot_ref: candidate.input_snapshot_ref,
    source_schema_version: candidate.source_schema_version,
    source_payload_hash: candidate.source_payload_hash,
  };
  const decision = await normalizeLiquidityObservation(
    marketProfile(profile, 'LIQUIDITY_OR_TIME_TO_SALE'),
    genericInput,
  );
  return {
    ...baseResult(profile, 'EXPOSURE_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA', [
      'SOURCE_SPECIFIC_EXPOSURE_PARSER_IMPLEMENTED',
      'IMMUTABLE_EXPOSURE_CANDIDATE_PARSED',
      'LIVE_SCHEMA_NOT_VERIFIED',
      'FIELD_PURPOSE_RIGHTS_NOT_VERIFIED',
      'SOURCE_OWNER_NOT_VERIFIED',
      'FACTUAL_ORIGIN_NOT_VERIFIED',
      ...decision.reason_codes,
    ]),
    exposure_candidate: candidate,
    generic_runtime_decision: decision,
  };
}

export async function classifyContextOnlySurface(
  snapshot: GovernedMarketSurfaceSnapshot,
  profile: GovernedMarketSurfaceProfile,
): Promise<GovernedMarketSurfaceResult> {
  if (!['AGGREGATE_PRICE_GUIDE_CONTEXT', 'RELEASE_OR_LISTING_CONTEXT'].includes(profile.family)) {
    return baseResult(profile, 'REJECTED_MARKET_SEMANTICS', ['CONTEXT_ONLY_CLASSIFIER_NOT_CONFIGURED_FOR_SOURCE_PROFILE']);
  }
  const validation = await validateSnapshot(snapshot, profile);
  if (validation.failures.length > 0 || !validation.record || !validation.sourceUrl) {
    return baseResult(profile, 'REJECTED_SNAPSHOT_INTEGRITY', validation.failures);
  }
  const reasons = profile.family === 'AGGREGATE_PRICE_GUIDE_CONTEXT'
    ? [
      'AGGREGATE_PRICE_GUIDE_IS_NOT_DATED_SOLD_TRANSACTION',
      'AGGREGATE_PRICE_GUIDE_IS_NOT_CURRENT_PRICE_WITHOUT_SEPARATE_GATE',
      'NO_TRANSACTION_GRAIN_OR_FACTUAL_ORIGIN',
    ]
    : [
      'RELEASE_OR_LISTING_SURFACE_IS_NOT_LIQUIDITY',
      'NO_EXPOSURE_DENOMINATOR',
      'NO_TERMINAL_OUTCOME_OR_CENSORING',
    ];
  return baseResult(profile, 'CONTEXT_ONLY_NOT_TRANSACTION_OR_LIQUIDITY', [
    'SOURCE_SPECIFIC_CONTEXT_CLASSIFIER_IMPLEMENTED',
    'CONTEXT_RETAINED_WITH_NON_PROMOTABLE_CLAIM_CEILING',
    ...reasons,
  ]);
}

export function cloneGovernedMarketSurfaceProfile(
  profile: GovernedMarketSurfaceProfile,
): GovernedMarketSurfaceProfile {
  return {
    ...profile,
    allowed_hosts: [...profile.allowed_hosts],
    allowed_path_prefixes: [...profile.allowed_path_prefixes],
    registered_claims: [...profile.registered_claims],
    implemented_claim_parsers: [...profile.implemented_claim_parsers],
    transaction_fields: profile.transaction_fields ? { ...profile.transaction_fields } : undefined,
    exposure_fields: profile.exposure_fields ? { ...profile.exposure_fields } : undefined,
  };
}
