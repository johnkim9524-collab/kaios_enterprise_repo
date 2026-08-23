import {
  normalizeDatedSoldTransaction,
  type AdapterDecision,
  type DatedSoldAdapterInput,
  type FieldPurposeRightsSnapshot,
  type MarketAdapterProfile,
  type NormalizedDatedSoldRecord,
} from '../market-adapter.js';

export interface BonhamsCarsImmutableSnapshot {
  source_url: string;
  observed_at: string;
  html: string;
  input_snapshot_ref: string;
  source_payload_hash: string;
  canonical_object_id: string;
  condition_segment: string;
  evidence_kind: 'EMPIRICAL_SOURCE_OBSERVATION' | 'SYNTHETIC_CONTROL_ONLY';
}

export interface BonhamsCarsParsedCandidate {
  source_record_id: string;
  auction_id: string;
  lot_number: string;
  canonical_object_id: string;
  terminal_market_state: 'SOLD';
  realized_price: number;
  currency: string;
  event_at: string;
  observed_at: string;
  condition_segment: string;
  source_owner_candidate_id: 'bonhams';
  source_owner_verified: false;
  factual_origin_candidate_id: string;
  factual_origin_verified: false;
  source_schema_version: 'bonhams-cars-result-snapshot-v1';
  source_payload_hash: string;
  input_snapshot_ref: string;
  provenance_refs: string[];
}

export interface BonhamsCarsAdapterResult {
  parser_state:
    | 'PARSED_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA'
    | 'REJECTED_SOLD_SEMANTICS'
    | 'REJECTED_SNAPSHOT_INTEGRITY';
  reason_codes: string[];
  parsed_candidate: BonhamsCarsParsedCandidate | null;
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

const allowedHosts = new Set(['cars.bonhams.com', 'www.bonhams.com']);
const sha256Pattern = /^sha256:[a-f0-9]{64}$/;
const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const bonhamsProfile: MarketAdapterProfile = {
  source_id: 'bonhams-cars-results',
  canonical_host: 'cars.bonhams.com',
  adapter_state: 'IMPLEMENTED_NOT_RIGHTS_VERIFIED',
  source_schema_version: 'bonhams-cars-result-snapshot-v1',
  target_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE', 'LIQUIDITY_OR_TIME_TO_SALE'],
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

function canonicalText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&pound;|&#163;/gi, '£')
    .replace(/&euro;|&#8364;/gi, '€')
    .replace(/&yen;|&#165;/gi, '¥')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function sha256Bytes(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function extractAuctionId(sourceUrl: URL, html: string): string | null {
  const path = sourceUrl.pathname.match(/\/(?:auction|auctions)\/(\d+)(?:\/|$)/i)?.[1];
  if (path) return path;
  return html.match(/data-auction-id=["']([A-Za-z0-9_-]+)["']/i)?.[1]
    ?? html.match(/["']auctionId["']\s*:\s*["']([A-Za-z0-9_-]+)["']/i)?.[1]
    ?? null;
}

function extractLotNumber(html: string, text: string): string | null {
  return html.match(/data-lot-number=["']([A-Za-z0-9_-]+)["']/i)?.[1]
    ?? html.match(/["']lotNumber["']\s*:\s*["']?([A-Za-z0-9_-]+)["']?/i)?.[1]
    ?? text.match(/\bLot\s+([A-Za-z0-9_-]+)\b/i)?.[1]
    ?? null;
}

function extractEventAt(html: string): string | null {
  const candidates = [
    html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1],
    html.match(/["'](?:startDate|endDate|event_at)["']\s*:\s*["']([^"']+)["']/i)?.[1],
    html.match(/data-event-at=["']([^"']+)["']/i)?.[1],
  ].filter((value): value is string => Boolean(value));
  for (const value of candidates) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function extractSoldPrice(text: string): {
  state: 'MATCH' | 'AMBIGUOUS_DOLLAR' | 'SOLD_WITHOUT_PRICE' | 'NOT_SOLD';
  price: number | null;
  currency: string | null;
} {
  const currencyMatchers: Array<[RegExp, string]> = [
    [/\bSold\s+for\s+US\$\s*([\d,]+(?:\.\d+)?)\b/i, 'USD'],
    [/\bSold\s+for\s+HK\$\s*([\d,]+(?:\.\d+)?)\b/i, 'HKD'],
    [/\bSold\s+for\s+(?:AU\$|A\$)\s*([\d,]+(?:\.\d+)?)\b/i, 'AUD'],
    [/\bSold\s+for\s+C\$\s*([\d,]+(?:\.\d+)?)\b/i, 'CAD'],
    [/\bSold\s+for\s+£\s*([\d,]+(?:\.\d+)?)\b/i, 'GBP'],
    [/\bSold\s+for\s+€\s*([\d,]+(?:\.\d+)?)\b/i, 'EUR'],
    [/\bSold\s+for\s+CHF\s*([\d,]+(?:\.\d+)?)\b/i, 'CHF'],
    [/\bSold\s+for\s+(?:JPY|¥)\s*([\d,]+(?:\.\d+)?)\b/i, 'JPY'],
  ];
  for (const [pattern, currency] of currencyMatchers) {
    const match = text.match(pattern);
    if (match) {
      const price = Number(match[1].replace(/,/g, ''));
      if (Number.isFinite(price) && price > 0) return { state: 'MATCH', price, currency };
    }
  }
  if (/\bSold\s+for\s+\$\s*[\d,]+(?:\.\d+)?\b/i.test(text)) {
    return { state: 'AMBIGUOUS_DOLLAR', price: null, currency: null };
  }
  if (/\bSold\s+for\b/i.test(text) || /\bSold\b/i.test(text)) {
    return { state: 'SOLD_WITHOUT_PRICE', price: null, currency: null };
  }
  return { state: 'NOT_SOLD', price: null, currency: null };
}

function unknownRightsSnapshot(observedAt: string, sourceUrl: string): FieldPurposeRightsSnapshot {
  return {
    decision: 'UNKNOWN',
    rights: [],
    effective_at: observedAt,
    evidence_refs: [`rights-review-required:${sourceUrl}`],
  };
}

function rejectionResult(reasonCodes: string[], integrity = false): BonhamsCarsAdapterResult {
  return {
    parser_state: integrity ? 'REJECTED_SNAPSHOT_INTEGRITY' : 'REJECTED_SOLD_SEMANTICS',
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

export async function parseBonhamsCarsSoldSnapshot(
  snapshot: BonhamsCarsImmutableSnapshot,
): Promise<BonhamsCarsAdapterResult> {
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
  if (!rfc3339.test(snapshot.observed_at) || !Number.isFinite(Date.parse(snapshot.observed_at))) {
    integrityFailures.push('OBSERVED_AT_INVALID');
  }
  if (!sha256Pattern.test(snapshot.input_snapshot_ref)) integrityFailures.push('INPUT_SNAPSHOT_REF_INVALID');
  if (!sha256Pattern.test(snapshot.source_payload_hash)) integrityFailures.push('SOURCE_PAYLOAD_HASH_INVALID');
  if (snapshot.canonical_object_id.trim().length === 0) integrityFailures.push('CANONICAL_OBJECT_ID_MISSING');
  if (snapshot.condition_segment.trim().length === 0) integrityFailures.push('CONDITION_SEGMENT_MISSING');
  const actualPayloadHash = await sha256Bytes(snapshot.html);
  if (actualPayloadHash !== snapshot.source_payload_hash) integrityFailures.push('SOURCE_PAYLOAD_HASH_MISMATCH');
  if (integrityFailures.length > 0) return rejectionResult(integrityFailures, true);

  const text = canonicalText(snapshot.html);
  const auctionId = extractAuctionId(sourceUrl, snapshot.html);
  const lotNumber = extractLotNumber(snapshot.html, text);
  const eventAt = extractEventAt(snapshot.html);
  const sold = extractSoldPrice(text);
  const semanticFailures: string[] = [];
  if (!auctionId) semanticFailures.push('AUCTION_ID_MISSING');
  if (!lotNumber) semanticFailures.push('LOT_NUMBER_MISSING');
  if (!eventAt) semanticFailures.push('EVENT_AT_MISSING');
  if (sold.state === 'NOT_SOLD') semanticFailures.push('EXPLICIT_TERMINAL_SOLD_STATE_MISSING');
  if (sold.state === 'SOLD_WITHOUT_PRICE') semanticFailures.push('SOLD_WITHOUT_EXPLICIT_REALIZED_PRICE');
  if (sold.state === 'AMBIGUOUS_DOLLAR') semanticFailures.push('AMBIGUOUS_DOLLAR_CURRENCY');
  if (/\b(?:estimate|estimated|bid|asking|offer|reserve)\b/i.test(text) && sold.state !== 'MATCH') {
    semanticFailures.push('LISTING_ESTIMATE_BID_OFFER_OR_RESERVE_IS_NOT_SOLD');
  }
  if (semanticFailures.length > 0 || !auctionId || !lotNumber || !eventAt || sold.price === null || sold.currency === null) {
    return rejectionResult(semanticFailures.length > 0 ? semanticFailures : ['SOLD_SEMANTICS_INCOMPLETE']);
  }

  const sourceRecordId = `bonhams-cars::auction:${auctionId}::lot:${lotNumber}`;
  const factualOriginCandidateId = `bonhams-auction-lot::${auctionId}::${lotNumber}`;
  const candidate: BonhamsCarsParsedCandidate = {
    source_record_id: sourceRecordId,
    auction_id: auctionId,
    lot_number: lotNumber,
    canonical_object_id: snapshot.canonical_object_id,
    terminal_market_state: 'SOLD',
    realized_price: sold.price,
    currency: sold.currency,
    event_at: eventAt,
    observed_at: new Date(snapshot.observed_at).toISOString(),
    condition_segment: snapshot.condition_segment,
    source_owner_candidate_id: 'bonhams',
    source_owner_verified: false,
    factual_origin_candidate_id: factualOriginCandidateId,
    factual_origin_verified: false,
    source_schema_version: 'bonhams-cars-result-snapshot-v1',
    source_payload_hash: snapshot.source_payload_hash,
    input_snapshot_ref: snapshot.input_snapshot_ref,
    provenance_refs: [snapshot.source_url, snapshot.input_snapshot_ref, snapshot.source_payload_hash],
  };

  const genericInput: DatedSoldAdapterInput = {
    evidence_kind: snapshot.evidence_kind,
    source_id: bonhamsProfile.source_id,
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
  const genericRuntimeDecision = await normalizeDatedSoldTransaction(bonhamsProfile, genericInput);
  return {
    parser_state: 'PARSED_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA',
    reason_codes: [
      'SOURCE_SPECIFIC_PARSER_IMPLEMENTED',
      'SOLD_CANDIDATE_PARSED_FROM_IMMUTABLE_SNAPSHOT',
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

export function getBonhamsCarsReferenceAdapterProfile(): MarketAdapterProfile {
  return { ...bonhamsProfile, target_claims: [...bonhamsProfile.target_claims], required_schema_fields: [...bonhamsProfile.required_schema_fields] };
}
