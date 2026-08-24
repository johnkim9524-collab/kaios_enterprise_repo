import {
  normalizeDatedSoldTransaction,
  type AdapterDecision,
  type DatedSoldAdapterInput,
  type FieldPurposeRightsSnapshot,
  type MarketAdapterProfile,
  type NormalizedDatedSoldRecord,
} from '../market-adapter.js';

export interface PriceChartingImmutableSnapshot {
  source_url: string;
  observed_at: string;
  payload_json: string;
  input_snapshot_ref: string;
  source_payload_hash: string;
  canonical_object_id: string;
  condition_segment: string;
  evidence_kind: 'EMPIRICAL_SOURCE_OBSERVATION' | 'SYNTHETIC_CONTROL_ONLY';
}

export interface PriceChartingParsedCandidate {
  source_record_id: string;
  canonical_object_id: string;
  terminal_market_state: 'SOLD';
  realized_price: number;
  currency: string;
  event_at: string;
  observed_at: string;
  condition_segment: string;
  source_owner_candidate_id: 'pricecharting';
  source_owner_verified: false;
  factual_origin_candidate_id: string;
  factual_origin_verified: false;
  source_schema_version: 'pricecharting-transaction-snapshot-v1';
  source_payload_hash: string;
  input_snapshot_ref: string;
  provenance_refs: string[];
}

export interface PriceChartingAdapterResult {
  parser_state:
    | 'PARSED_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA'
    | 'REJECTED_TRANSACTION_SEMANTICS'
    | 'REJECTED_SNAPSHOT_INTEGRITY';
  reason_codes: string[];
  parsed_candidate: PriceChartingParsedCandidate | null;
  generic_runtime_decision: AdapterDecision<NormalizedDatedSoldRecord> | null;
  rights_pass_created: false;
  live_schema_verified: false;
  source_owner_verified: false;
  factual_origin_verified: false;
  evidence_admitted: false;
  market_event_created: false;
  public_release: 'HOLD';
  production: 'HOLD';
}

const allowedHosts = new Set(['www.pricecharting.com', 'pricecharting.com']);
const sha256Pattern = /^sha256:[a-f0-9]{64}$/;
const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const currencyPattern = /^[A-Z]{3}$/;
const evidenceKinds = new Set(['EMPIRICAL_SOURCE_OBSERVATION', 'SYNTHETIC_CONTROL_ONLY']);

const profile: MarketAdapterProfile = {
  source_id: 'pricecharting-api',
  canonical_host: 'www.pricecharting.com',
  adapter_state: 'IMPLEMENTED_NOT_RIGHTS_VERIFIED',
  source_schema_version: 'pricecharting-transaction-snapshot-v1',
  target_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE'],
  required_schema_fields: [
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
  ],
  fixture_only: false,
  provider_direct_to_index_or_projection_allowed: false,
};

async function sha256Bytes(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function rejectionResult(reasonCodes: string[], integrity = false): PriceChartingAdapterResult {
  return {
    parser_state: integrity ? 'REJECTED_SNAPSHOT_INTEGRITY' : 'REJECTED_TRANSACTION_SEMANTICS',
    reason_codes: [...new Set(reasonCodes)].sort(),
    parsed_candidate: null,
    generic_runtime_decision: null,
    rights_pass_created: false,
    live_schema_verified: false,
    source_owner_verified: false,
    factual_origin_verified: false,
    evidence_admitted: false,
    market_event_created: false,
    public_release: 'HOLD',
    production: 'HOLD',
  };
}

function unknownRightsSnapshot(observedAt: string, sourceUrl: string): FieldPurposeRightsSnapshot {
  return {
    decision: 'UNKNOWN',
    rights: [],
    effective_at: observedAt,
    evidence_refs: [`rights-review-required:${sourceUrl}`],
  };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function parsePriceChartingTransactionSnapshot(
  snapshot: PriceChartingImmutableSnapshot,
): Promise<PriceChartingAdapterResult> {
  const integrityFailures: string[] = [];
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(snapshot.source_url);
  } catch {
    return rejectionResult(['SOURCE_URL_INVALID'], true);
  }
  const host = sourceUrl.hostname.toLowerCase().replace(/\.$/, '');
  if (sourceUrl.protocol !== 'https:') integrityFailures.push('SOURCE_SCHEME_NOT_HTTPS');
  if (!allowedHosts.has(host)) integrityFailures.push('SOURCE_HOST_NOT_ALLOWED');
  if (!rfc3339.test(snapshot.observed_at) || !Number.isFinite(Date.parse(snapshot.observed_at))) integrityFailures.push('OBSERVED_AT_INVALID');
  if (!sha256Pattern.test(snapshot.input_snapshot_ref)) integrityFailures.push('INPUT_SNAPSHOT_REF_INVALID');
  if (!sha256Pattern.test(snapshot.source_payload_hash)) integrityFailures.push('SOURCE_PAYLOAD_HASH_INVALID');
  if (!evidenceKinds.has(snapshot.evidence_kind)) integrityFailures.push('EVIDENCE_KIND_INVALID');
  if (snapshot.canonical_object_id.trim().length === 0) integrityFailures.push('CANONICAL_OBJECT_ID_MISSING');
  if (snapshot.condition_segment.trim().length === 0) integrityFailures.push('CONDITION_SEGMENT_MISSING');
  const actualPayloadHash = await sha256Bytes(snapshot.payload_json);
  if (actualPayloadHash !== snapshot.source_payload_hash) integrityFailures.push('SOURCE_PAYLOAD_HASH_MISMATCH');
  if (integrityFailures.length > 0) return rejectionResult(integrityFailures, true);

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(snapshot.payload_json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('OBJECT_REQUIRED');
    payload = parsed as Record<string, unknown>;
  } catch {
    return rejectionResult(['SOURCE_PAYLOAD_JSON_INVALID'], true);
  }

  const semanticFailures: string[] = [];
  const sourceRecordId = stringValue(payload.source_record_id ?? payload.transaction_id ?? payload.sale_id);
  if (!sourceRecordId) semanticFailures.push('SOURCE_RECORD_ID_MISSING');
  const terminalState = stringValue(payload.terminal_market_state ?? payload.transaction_state ?? payload.status).toUpperCase();
  if (terminalState !== 'SOLD') {
    if (['LISTED', 'ACTIVE', 'ASK', 'BID', 'OFFER', 'GUIDE', 'PRICE_GUIDE'].includes(terminalState)) {
      semanticFailures.push('LISTING_OR_GUIDE_IS_NOT_SOLD_TRANSACTION');
    } else {
      semanticFailures.push('EXPLICIT_TERMINAL_SOLD_STATE_MISSING');
    }
  }
  if ('guide_price' in payload || 'loose_price' in payload || 'cib_price' in payload || 'new_price' in payload) {
    if (terminalState !== 'SOLD') semanticFailures.push('AGGREGATED_PRICE_GUIDE_IS_NOT_DATED_TRANSACTION');
  }
  const rawPrice = payload.realized_price ?? payload.sold_price ?? payload.transaction_price;
  const realizedPrice = typeof rawPrice === 'number' ? rawPrice : Number(rawPrice);
  if (!Number.isFinite(realizedPrice) || realizedPrice <= 0) semanticFailures.push('REALIZED_PRICE_INVALID');
  const currency = stringValue(payload.currency).toUpperCase();
  if (!currencyPattern.test(currency)) semanticFailures.push('CURRENCY_INVALID_OR_AMBIGUOUS');
  const rawEventAt = stringValue(payload.event_at ?? payload.sold_at ?? payload.transaction_at);
  let eventAt = rawEventAt;
  if (!rfc3339.test(rawEventAt) || !Number.isFinite(Date.parse(rawEventAt))) {
    semanticFailures.push('EVENT_AT_INVALID_OR_MISSING');
  } else {
    eventAt = new Date(rawEventAt).toISOString();
    if (Date.parse(eventAt) > Date.parse(snapshot.observed_at)) semanticFailures.push('EVENT_AFTER_OBSERVATION');
  }
  if (semanticFailures.length > 0) return rejectionResult(semanticFailures);

  const normalizedObservedAt = new Date(snapshot.observed_at).toISOString();
  const candidate: PriceChartingParsedCandidate = {
    source_record_id: `pricecharting::transaction:${sourceRecordId}`,
    canonical_object_id: snapshot.canonical_object_id,
    terminal_market_state: 'SOLD',
    realized_price: realizedPrice,
    currency,
    event_at: eventAt,
    observed_at: normalizedObservedAt,
    condition_segment: snapshot.condition_segment,
    source_owner_candidate_id: 'pricecharting',
    source_owner_verified: false,
    factual_origin_candidate_id: `pricecharting-transaction::${sourceRecordId}`,
    factual_origin_verified: false,
    source_schema_version: 'pricecharting-transaction-snapshot-v1',
    source_payload_hash: snapshot.source_payload_hash,
    input_snapshot_ref: snapshot.input_snapshot_ref,
    provenance_refs: [snapshot.source_url, snapshot.input_snapshot_ref, snapshot.source_payload_hash],
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
    field_purpose_rights: unknownRightsSnapshot(candidate.observed_at, snapshot.source_url),
    provenance_refs: candidate.provenance_refs,
    input_snapshot_ref: candidate.input_snapshot_ref,
    source_schema_version: candidate.source_schema_version,
    source_payload_hash: candidate.source_payload_hash,
  };
  const genericRuntimeDecision = await normalizeDatedSoldTransaction(profile, genericInput);
  return {
    parser_state: 'PARSED_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA',
    reason_codes: [
      'SOURCE_SPECIFIC_PARSER_IMPLEMENTED',
      'TRANSACTION_CANDIDATE_PARSED_FROM_IMMUTABLE_JSON_SNAPSHOT',
      'LIVE_SCHEMA_NOT_VERIFIED',
      'FIELD_PURPOSE_RIGHTS_NOT_VERIFIED',
      'SOURCE_OWNER_NOT_VERIFIED',
      'FACTUAL_ORIGIN_NOT_VERIFIED',
      ...genericRuntimeDecision.reason_codes,
    ].filter((value, index, values) => values.indexOf(value) === index).sort(),
    parsed_candidate: candidate,
    generic_runtime_decision: genericRuntimeDecision,
    rights_pass_created: false,
    live_schema_verified: false,
    source_owner_verified: false,
    factual_origin_verified: false,
    evidence_admitted: false,
    market_event_created: false,
    public_release: 'HOLD',
    production: 'HOLD',
  };
}

export function getPriceChartingAdapterProfile(): MarketAdapterProfile {
  return { ...profile, target_claims: [...profile.target_claims], required_schema_fields: [...profile.required_schema_fields] };
}
