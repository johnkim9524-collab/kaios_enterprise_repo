import {
  normalizeDatedSoldTransaction,
  type AdapterDecision,
  type DatedSoldAdapterInput,
  type FieldPurposeRightsSnapshot,
  type MarketAdapterProfile,
  type MarketClaimTarget,
  type NormalizedDatedSoldRecord,
} from '../market-adapter.js';

export interface PublicAuctionAdapterProfile {
  source_id: string;
  canonical_host: string;
  allowed_hosts: string[];
  source_owner_candidate_id: string;
  source_schema_version: string;
  target_claims: MarketClaimTarget[];
  verified_assignment_count: number;
  implementation_family: 'PUBLIC_WEB_AUCTION_RESULTS' | 'PUBLIC_WEB_MARKETPLACE_RESULTS';
}

export interface PublicAuctionImmutableSnapshot {
  source_url: string;
  observed_at: string;
  html: string;
  input_snapshot_ref: string;
  source_payload_hash: string;
  canonical_object_id: string;
  condition_segment: string;
  evidence_kind: 'EMPIRICAL_SOURCE_OBSERVATION' | 'SYNTHETIC_CONTROL_ONLY';
}

export interface PublicAuctionParsedCandidate {
  source_id: string;
  source_record_id: string;
  event_id: string;
  lot_number: string;
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

export interface PublicAuctionAdapterResult {
  source_id: string;
  parser_state:
    | 'PARSED_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA'
    | 'REJECTED_SOLD_SEMANTICS'
    | 'REJECTED_SNAPSHOT_INTEGRITY';
  reason_codes: string[];
  parsed_candidate: PublicAuctionParsedCandidate | null;
  generic_runtime_decision: AdapterDecision<NormalizedDatedSoldRecord> | null;
  rights_pass_created: false;
  live_schema_verified: false;
  sold_semantics_empirically_verified: false;
  source_owner_verified: false;
  factual_origin_verified: false;
  adapter_activated: false;
  evidence_admitted: false;
  market_event_created: false;
  public_release: 'HOLD';
  production: 'HOLD';
}

const sha256Pattern = /^sha256:[a-f0-9]{64}$/;
const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const genericRequiredFields = [
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

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function canonicalVisibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
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

async function sha256Value(value: unknown): Promise<string> {
  const canonical = JSON.stringify(value, Object.keys(value as Record<string, unknown> || {}).sort());
  return sha256Bytes(canonical);
}

function normalizeIdentifier(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return identifierPattern.test(normalized) ? normalized : null;
}

function extractEventId(sourceUrl: URL, html: string, visibleText: string): string | null {
  const candidates = [
    html.match(/data-(?:event|auction|sale)-id=["']([^"']+)["']/i)?.[1] ?? null,
    html.match(/["'](?:eventId|auctionId|saleId)["']\s*:\s*["']([^"']+)["']/i)?.[1] ?? null,
    visibleText.match(/\b(?:Event|Auction|Sale)\s+(?:ID|No\.?|Number)\s*[:#]?\s*([A-Za-z0-9._:-]+)/i)?.[1] ?? null,
    sourceUrl.pathname.match(/\/(?:event|events|auction|auctions|sale|sales)\/([A-Za-z0-9._:-]+)(?:\/|$)/i)?.[1] ?? null,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeIdentifier(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function extractLotNumber(html: string, visibleText: string, sourceUrl: URL): string | null {
  const candidates = [
    html.match(/data-(?:lot-number|lot-id)=["']([^"']+)["']/i)?.[1] ?? null,
    html.match(/["'](?:lotNumber|lotId)["']\s*:\s*["']?([A-Za-z0-9._:-]+)["']?/i)?.[1] ?? null,
    visibleText.match(/\bLot\s+(?:No\.?|Number|#)?\s*([A-Za-z0-9._:-]+)\b/i)?.[1] ?? null,
    sourceUrl.pathname.match(/\/(?:lot|lots)\/([A-Za-z0-9._:-]+)(?:\/|$)/i)?.[1] ?? null,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeIdentifier(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function extractEventAt(html: string): string | null {
  const candidates = [
    html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1],
    html.match(/data-(?:event-at|sale-at|sold-at)=["']([^"']+)["']/i)?.[1],
    html.match(/["'](?:startDate|endDate|event_at|saleDate|soldAt)["']\s*:\s*["']([^"']+)["']/i)?.[1],
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function parsePositivePrice(raw: string): number | null {
  const normalized = raw.replace(/[\s,']/g, '');
  const price = Number(normalized);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function extractExplicitSoldPrice(visibleText: string): {
  state: 'MATCH' | 'AMBIGUOUS_DOLLAR' | 'SOLD_WITHOUT_PRICE' | 'NOT_SOLD';
  price: number | null;
  currency: string | null;
} {
  const patterns: Array<[RegExp, string]> = [
    [/\bSold(?:\s+for|\s+at)?\s+US\$\s*([\d,']+(?:\.\d+)?)\b/i, 'USD'],
    [/\bSold(?:\s+for|\s+at)?\s+USD\s*([\d,']+(?:\.\d+)?)\b/i, 'USD'],
    [/\bSold(?:\s+for|\s+at)?\s+HK\$\s*([\d,']+(?:\.\d+)?)\b/i, 'HKD'],
    [/\bSold(?:\s+for|\s+at)?\s+HKD\s*([\d,']+(?:\.\d+)?)\b/i, 'HKD'],
    [/\bSold(?:\s+for|\s+at)?\s+(?:AU\$|A\$)\s*([\d,']+(?:\.\d+)?)\b/i, 'AUD'],
    [/\bSold(?:\s+for|\s+at)?\s+AUD\s*([\d,']+(?:\.\d+)?)\b/i, 'AUD'],
    [/\bSold(?:\s+for|\s+at)?\s+C\$\s*([\d,']+(?:\.\d+)?)\b/i, 'CAD'],
    [/\bSold(?:\s+for|\s+at)?\s+CAD\s*([\d,']+(?:\.\d+)?)\b/i, 'CAD'],
    [/\bSold(?:\s+for|\s+at)?\s+£\s*([\d,']+(?:\.\d+)?)\b/i, 'GBP'],
    [/\bSold(?:\s+for|\s+at)?\s+GBP\s*([\d,']+(?:\.\d+)?)\b/i, 'GBP'],
    [/\bSold(?:\s+for|\s+at)?\s+€\s*([\d,']+(?:\.\d+)?)\b/i, 'EUR'],
    [/\bSold(?:\s+for|\s+at)?\s+EUR\s*([\d,']+(?:\.\d+)?)\b/i, 'EUR'],
    [/\bSold(?:\s+for|\s+at)?\s+CHF\s*([\d,']+(?:\.\d+)?)\b/i, 'CHF'],
    [/\bSold(?:\s+for|\s+at)?\s+(?:JPY|¥)\s*([\d,']+(?:\.\d+)?)\b/i, 'JPY'],
  ];
  for (const [pattern, currency] of patterns) {
    const match = visibleText.match(pattern);
    if (!match) continue;
    const price = parsePositivePrice(match[1]);
    if (price !== null) return { state: 'MATCH', price, currency };
  }
  if (/\bSold(?:\s+for|\s+at)?\s+\$\s*[\d,']+(?:\.\d+)?\b/i.test(visibleText)) {
    return { state: 'AMBIGUOUS_DOLLAR', price: null, currency: null };
  }
  if (/\bSold\b/i.test(visibleText)) {
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

function marketProfile(profile: PublicAuctionAdapterProfile): MarketAdapterProfile {
  return {
    source_id: profile.source_id,
    canonical_host: profile.canonical_host,
    adapter_state: 'IMPLEMENTED_NOT_RIGHTS_VERIFIED',
    source_schema_version: profile.source_schema_version,
    target_claims: [...profile.target_claims],
    required_schema_fields: [...genericRequiredFields],
    fixture_only: false,
    provider_direct_to_index_or_projection_allowed: false,
  };
}

function rejectionResult(
  profile: PublicAuctionAdapterProfile,
  reasonCodes: string[],
  integrity = false,
): PublicAuctionAdapterResult {
  return {
    source_id: profile.source_id,
    parser_state: integrity ? 'REJECTED_SNAPSHOT_INTEGRITY' : 'REJECTED_SOLD_SEMANTICS',
    reason_codes: uniqueSorted(reasonCodes),
    parsed_candidate: null,
    generic_runtime_decision: null,
    rights_pass_created: false,
    live_schema_verified: false,
    sold_semantics_empirically_verified: false,
    source_owner_verified: false,
    factual_origin_verified: false,
    adapter_activated: false,
    evidence_admitted: false,
    market_event_created: false,
    public_release: 'HOLD',
    production: 'HOLD',
  };
}

export function assertPublicAuctionAdapterProfile(profile: PublicAuctionAdapterProfile): void {
  if (!profile.source_id || !profile.canonical_host || !profile.source_owner_candidate_id || !profile.source_schema_version) {
    throw new Error('PUBLIC_AUCTION_PROFILE_REQUIRED_FIELD_MISSING');
  }
  if (!profile.allowed_hosts.includes(profile.canonical_host)) throw new Error('PUBLIC_AUCTION_PROFILE_CANONICAL_HOST_NOT_ALLOWED');
  if (new Set(profile.allowed_hosts).size !== profile.allowed_hosts.length) throw new Error('PUBLIC_AUCTION_PROFILE_DUPLICATE_HOST');
  if (!Number.isInteger(profile.verified_assignment_count) || profile.verified_assignment_count < 1) {
    throw new Error('PUBLIC_AUCTION_PROFILE_ASSIGNMENT_COUNT_INVALID');
  }
  if (!profile.target_claims.includes('DATED_OBSERVED_SOLD_TRANSACTION')) {
    throw new Error('PUBLIC_AUCTION_PROFILE_SOLD_CLAIM_REQUIRED');
  }
}

export async function parsePublicAuctionSoldSnapshot(
  profile: PublicAuctionAdapterProfile,
  snapshot: PublicAuctionImmutableSnapshot,
): Promise<PublicAuctionAdapterResult> {
  assertPublicAuctionAdapterProfile(profile);
  const integrityFailures: string[] = [];
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(snapshot.source_url);
  } catch {
    return rejectionResult(profile, ['SOURCE_URL_INVALID'], true);
  }
  const host = sourceUrl.hostname.toLowerCase().replace(/\.$/, '');
  if (sourceUrl.protocol !== 'https:') integrityFailures.push('SOURCE_SCHEME_NOT_HTTPS');
  if (!profile.allowed_hosts.includes(host)) integrityFailures.push('SOURCE_HOST_NOT_ALLOWED');
  if (!rfc3339.test(snapshot.observed_at) || !Number.isFinite(Date.parse(snapshot.observed_at))) {
    integrityFailures.push('OBSERVED_AT_INVALID');
  }
  if (!sha256Pattern.test(snapshot.input_snapshot_ref)) integrityFailures.push('INPUT_SNAPSHOT_REF_INVALID');
  if (!sha256Pattern.test(snapshot.source_payload_hash)) integrityFailures.push('SOURCE_PAYLOAD_HASH_INVALID');
  if (!snapshot.canonical_object_id || snapshot.canonical_object_id.trim().length === 0) {
    integrityFailures.push('CANONICAL_OBJECT_ID_MISSING');
  }
  if (!snapshot.condition_segment || snapshot.condition_segment.trim().length === 0) {
    integrityFailures.push('CONDITION_SEGMENT_MISSING');
  }
  const actualPayloadHash = await sha256Bytes(snapshot.html);
  if (actualPayloadHash !== snapshot.source_payload_hash) integrityFailures.push('SOURCE_PAYLOAD_HASH_MISMATCH');
  if (integrityFailures.length > 0) return rejectionResult(profile, integrityFailures, true);

  const visibleText = canonicalVisibleText(snapshot.html);
  const eventId = extractEventId(sourceUrl, snapshot.html, visibleText);
  const lotNumber = extractLotNumber(snapshot.html, visibleText, sourceUrl);
  const eventAt = extractEventAt(snapshot.html);
  const sold = extractExplicitSoldPrice(visibleText);
  const semanticFailures: string[] = [];
  if (!eventId) semanticFailures.push('EVENT_ID_MISSING');
  if (!lotNumber) semanticFailures.push('LOT_NUMBER_MISSING');
  if (!eventAt) semanticFailures.push('EVENT_AT_MISSING');
  if (sold.state === 'NOT_SOLD') semanticFailures.push('EXPLICIT_TERMINAL_SOLD_STATE_MISSING');
  if (sold.state === 'SOLD_WITHOUT_PRICE') semanticFailures.push('SOLD_WITHOUT_EXPLICIT_REALIZED_PRICE');
  if (sold.state === 'AMBIGUOUS_DOLLAR') semanticFailures.push('AMBIGUOUS_DOLLAR_CURRENCY');
  if (/\b(?:estimate|estimated|bid|asking|offer|reserve|listed|listing)\b/i.test(visibleText) && sold.state !== 'MATCH') {
    semanticFailures.push('LISTING_ESTIMATE_BID_OFFER_OR_RESERVE_IS_NOT_SOLD');
  }
  if (semanticFailures.length > 0 || !eventId || !lotNumber || !eventAt || sold.price === null || sold.currency === null) {
    return rejectionResult(profile, semanticFailures.length > 0 ? semanticFailures : ['SOLD_SEMANTICS_INCOMPLETE']);
  }

  const sourceRecordId = `${profile.source_id}::event:${eventId}::lot:${lotNumber}`;
  const factualOriginCandidateId = `${profile.source_id}::auction-lot:${eventId}:${lotNumber}`;
  const candidate: PublicAuctionParsedCandidate = {
    source_id: profile.source_id,
    source_record_id: sourceRecordId,
    event_id: eventId,
    lot_number: lotNumber,
    canonical_object_id: snapshot.canonical_object_id,
    terminal_market_state: 'SOLD',
    realized_price: sold.price,
    currency: sold.currency,
    event_at: eventAt,
    observed_at: new Date(snapshot.observed_at).toISOString(),
    condition_segment: snapshot.condition_segment,
    source_owner_candidate_id: profile.source_owner_candidate_id,
    source_owner_verified: false,
    factual_origin_candidate_id: factualOriginCandidateId,
    factual_origin_verified: false,
    source_schema_version: profile.source_schema_version,
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
  const genericRuntimeDecision = await normalizeDatedSoldTransaction(marketProfile(profile), genericInput);
  return {
    source_id: profile.source_id,
    parser_state: 'PARSED_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA',
    reason_codes: uniqueSorted([
      'SOURCE_SPECIFIC_PARSER_IMPLEMENTED',
      'SOLD_CANDIDATE_PARSED_FROM_IMMUTABLE_SNAPSHOT',
      'LIVE_SCHEMA_NOT_VERIFIED',
      'FIELD_PURPOSE_RIGHTS_NOT_VERIFIED',
      'SOLD_SEMANTICS_NOT_EMPIRICALLY_VERIFIED',
      'SOURCE_OWNER_NOT_VERIFIED',
      'FACTUAL_ORIGIN_NOT_VERIFIED',
      ...genericRuntimeDecision.reason_codes,
    ]),
    parsed_candidate: candidate,
    generic_runtime_decision: genericRuntimeDecision,
    rights_pass_created: false,
    live_schema_verified: false,
    sold_semantics_empirically_verified: false,
    source_owner_verified: false,
    factual_origin_verified: false,
    adapter_activated: false,
    evidence_admitted: false,
    market_event_created: false,
    public_release: 'HOLD',
    production: 'HOLD',
  };
}

export async function publicAuctionSnapshotDigest(snapshot: PublicAuctionImmutableSnapshot): Promise<string> {
  return sha256Value({
    source_url: snapshot.source_url,
    observed_at: snapshot.observed_at,
    source_payload_hash: snapshot.source_payload_hash,
    canonical_object_id: snapshot.canonical_object_id,
    condition_segment: snapshot.condition_segment,
    evidence_kind: snapshot.evidence_kind,
  });
}
