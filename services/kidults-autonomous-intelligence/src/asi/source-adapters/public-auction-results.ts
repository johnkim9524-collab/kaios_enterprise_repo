import {
  normalizeDatedSoldTransaction,
  type AdapterDecision,
  type DatedSoldAdapterInput,
  type FieldPurposeRightsSnapshot,
  type MarketAdapterProfile,
  type MarketClaimTarget,
  type NormalizedDatedSoldRecord,
} from '../market-adapter.js';

export type PublicAuctionTerminalPhrase = 'SOLD_FOR' | 'SOLD_AT' | 'SOLD_PRICE' | 'SALE_PRICE';

export interface PublicAuctionSourceAdapterProfile {
  source_id: string;
  canonical_host: string;
  allowed_hosts: string[];
  allowed_path_prefixes: string[];
  source_schema_version: string;
  source_owner_candidate_id: string;
  source_record_prefix: string;
  factual_origin_prefix: string;
  target_claims: MarketClaimTarget[];
  allowed_terminal_phrases: PublicAuctionTerminalPhrase[];
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
  evidence_admitted: false;
  market_event_created: false;
  public_release: 'HOLD';
  production: 'HOLD';
}

const sha256Pattern = /^sha256:[a-f0-9]{64}$/;
const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const currencyCodes = new Set(['USD', 'HKD', 'AUD', 'CAD', 'GBP', 'EUR', 'CHF', 'JPY']);
const requiredSchemaFields = [
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

function canonicalText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&pound;|&#163;/gi, '£')
    .replace(/&euro;|&#8364;/gi, '€')
    .replace(/&yen;|&#165;/gi, '¥')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function sha256Bytes(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function normalizeIdentifier(value: string): string {
  return value.trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 160);
}

function pathAllowed(pathname: string, prefixes: string[]): boolean {
  const normalized = pathname.toLowerCase();
  return prefixes.some((prefix) => normalized.startsWith(prefix.toLowerCase()));
}

function extractEventId(sourceUrl: URL, html: string): string | null {
  const candidates = [
    html.match(/data-(?:auction|event|sale)-id=["']([^"']+)["']/i)?.[1],
    html.match(/["'](?:auctionId|eventId|saleId)["']\s*:\s*["']([^"']+)["']/i)?.[1],
    sourceUrl.pathname.match(/\/archive\/event\/results\/([^/?#]+)/i)?.[1],
    sourceUrl.pathname.match(/\/(?:auction-results|results|auction|auctions|event|events|sale|sales|sold)\/([^/?#]+)/i)?.[1],
  ].filter((value): value is string => Boolean(value));
  for (const value of candidates) {
    const normalized = normalizeIdentifier(decodeURIComponent(value));
    if (normalized.length > 0) return normalized;
  }
  return null;
}

function extractLotNumber(html: string, text: string): string | null {
  const candidates = [
    html.match(/data-(?:lot-number|lot-id)=["']([^"']+)["']/i)?.[1],
    html.match(/["'](?:lotNumber|lotId)["']\s*:\s*["']?([A-Za-z0-9_-]+)["']?/i)?.[1],
    text.match(/\bLot\s+(?:No\.?\s*)?([A-Za-z0-9_-]+)\b/i)?.[1],
  ].filter((value): value is string => Boolean(value));
  for (const value of candidates) {
    const normalized = normalizeIdentifier(value);
    if (normalized.length > 0) return normalized;
  }
  return null;
}

function extractEventAt(html: string): string | null {
  const candidates = [
    html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1],
    html.match(/["'](?:startDate|endDate|datePublished|dateSold|event_at|saleDate)["']\s*:\s*["']([^"']+)["']/i)?.[1],
    html.match(/data-(?:event-at|sale-date|sold-at)=["']([^"']+)["']/i)?.[1],
  ].filter((value): value is string => Boolean(value));
  for (const value of candidates) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function currencyFromToken(token: string): string | null {
  const normalized = token.trim().toUpperCase().replace(/\s+/g, '');
  if (currencyCodes.has(normalized)) return normalized;
  if (['US$', 'USＤ', 'US\u0024'].includes(normalized)) return 'USD';
  if (normalized === 'HK$') return 'HKD';
  if (normalized === 'AU$' || normalized === 'A$') return 'AUD';
  if (normalized === 'C$') return 'CAD';
  if (normalized === '£') return 'GBP';
  if (normalized === '€') return 'EUR';
  if (normalized === '¥') return 'JPY';
  return null;
}

function phrasePattern(phrase: PublicAuctionTerminalPhrase): string {
  if (phrase === 'SOLD_FOR') return 'Sold\\s+for';
  if (phrase === 'SOLD_AT') return 'Sold\\s+at';
  if (phrase === 'SOLD_PRICE') return 'Sold\\s+Price';
  return 'Sale\\s+Price';
}

function extractSoldPrice(
  html: string,
  text: string,
  profile: PublicAuctionSourceAdapterProfile,
): {
  state: 'MATCH' | 'AMBIGUOUS_DOLLAR' | 'SOLD_WITHOUT_PRICE' | 'NOT_SOLD' | 'TERMINAL_NOT_SOLD';
  price: number | null;
  currency: string | null;
} {
  const structuredState = html.match(/data-(?:result-state|sale-status|status)=["']([^"']+)["']/i)?.[1]
    ?? html.match(/["'](?:resultState|saleStatus)["']\s*:\s*["']([^"']+)["']/i)?.[1]
    ?? null;
  if (structuredState && ['UNSOLD', 'WITHDRAWN', 'PASSED', 'NO SALE'].includes(structuredState.trim().toUpperCase())) {
    return { state: 'TERMINAL_NOT_SOLD', price: null, currency: null };
  }
  const structuredPrice = html.match(/data-(?:realized-price|realised-price|sale-price|sold-price)=["']([\d,]+(?:\.\d+)?)["']/i)?.[1]
    ?? html.match(/["'](?:realizedPrice|realisedPrice|salePrice|soldPrice)["']\s*:\s*["']?([\d,]+(?:\.\d+)?)["']?/i)?.[1]
    ?? null;
  const structuredCurrency = html.match(/data-currency=["']([A-Za-z$£€¥]+)["']/i)?.[1]
    ?? html.match(/["'](?:currency|priceCurrency)["']\s*:\s*["']([A-Za-z$£€¥]+)["']/i)?.[1]
    ?? null;
  if (structuredState?.trim().toUpperCase() === 'SOLD' && structuredPrice && structuredCurrency) {
    const price = Number(structuredPrice.replace(/,/g, ''));
    const currency = currencyFromToken(structuredCurrency);
    if (Number.isFinite(price) && price > 0 && currency) return { state: 'MATCH', price, currency };
    if (structuredCurrency.trim() === '$') return { state: 'AMBIGUOUS_DOLLAR', price: null, currency: null };
  }

  const currencyToken = '(US\\$|HK\\$|AU\\$|A\\$|C\\$|USD|HKD|AUD|CAD|GBP|EUR|CHF|JPY|£|€|¥)';
  for (const phrase of profile.allowed_terminal_phrases) {
    const pattern = new RegExp(`\\b${phrasePattern(phrase)}\\s*[:\\-]?\\s*${currencyToken}\\s*([\\d,]+(?:\\.\\d+)?)\\b`, 'i');
    const match = text.match(pattern);
    if (match) {
      const price = Number(match[2].replace(/,/g, ''));
      const currency = currencyFromToken(match[1]);
      if (Number.isFinite(price) && price > 0 && currency) return { state: 'MATCH', price, currency };
    }
    const ambiguous = new RegExp(`\\b${phrasePattern(phrase)}\\s*[:\\-]?\\s*\\$\\s*[\\d,]+(?:\\.\\d+)?\\b`, 'i');
    if (ambiguous.test(text)) return { state: 'AMBIGUOUS_DOLLAR', price: null, currency: null };
  }
  if (/\bSold\b/i.test(text) || structuredState?.trim().toUpperCase() === 'SOLD') {
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

function genericProfile(profile: PublicAuctionSourceAdapterProfile): MarketAdapterProfile {
  return {
    source_id: profile.source_id,
    canonical_host: profile.canonical_host,
    adapter_state: 'IMPLEMENTED_NOT_RIGHTS_VERIFIED',
    source_schema_version: profile.source_schema_version,
    target_claims: [...profile.target_claims],
    required_schema_fields: [...requiredSchemaFields],
    fixture_only: false,
    provider_direct_to_index_or_projection_allowed: false,
  };
}

function rejectionResult(
  profile: PublicAuctionSourceAdapterProfile,
  reasonCodes: string[],
  integrity = false,
): PublicAuctionAdapterResult {
  return {
    source_id: profile.source_id,
    parser_state: integrity ? 'REJECTED_SNAPSHOT_INTEGRITY' : 'REJECTED_SOLD_SEMANTICS',
    reason_codes: [...new Set(reasonCodes)].sort(),
    parsed_candidate: null,
    generic_runtime_decision: null,
    rights_pass_created: false,
    live_schema_verified: false,
    sold_semantics_empirically_verified: false,
    source_owner_verified: false,
    factual_origin_verified: false,
    evidence_admitted: false,
    market_event_created: false,
    public_release: 'HOLD',
    production: 'HOLD',
  };
}

export async function parsePublicAuctionSoldSnapshot(
  profile: PublicAuctionSourceAdapterProfile,
  snapshot: PublicAuctionImmutableSnapshot,
): Promise<PublicAuctionAdapterResult> {
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
  if (!pathAllowed(sourceUrl.pathname, profile.allowed_path_prefixes)) integrityFailures.push('SOURCE_PATH_NOT_ALLOWED');
  if (!rfc3339.test(snapshot.observed_at) || !Number.isFinite(Date.parse(snapshot.observed_at))) {
    integrityFailures.push('OBSERVED_AT_INVALID');
  }
  if (!sha256Pattern.test(snapshot.input_snapshot_ref)) integrityFailures.push('INPUT_SNAPSHOT_REF_INVALID');
  if (!sha256Pattern.test(snapshot.source_payload_hash)) integrityFailures.push('SOURCE_PAYLOAD_HASH_INVALID');
  if (!['EMPIRICAL_SOURCE_OBSERVATION', 'SYNTHETIC_CONTROL_ONLY'].includes(snapshot.evidence_kind)) {
    integrityFailures.push('EVIDENCE_KIND_INVALID');
  }
  if (snapshot.canonical_object_id.trim().length === 0) integrityFailures.push('CANONICAL_OBJECT_ID_MISSING');
  if (snapshot.condition_segment.trim().length === 0) integrityFailures.push('CONDITION_SEGMENT_MISSING');
  const actualPayloadHash = await sha256Bytes(snapshot.html);
  if (actualPayloadHash !== snapshot.source_payload_hash) integrityFailures.push('SOURCE_PAYLOAD_HASH_MISMATCH');
  if (integrityFailures.length > 0) return rejectionResult(profile, integrityFailures, true);

  const text = canonicalText(snapshot.html);
  const eventId = extractEventId(sourceUrl, snapshot.html);
  const lotNumber = extractLotNumber(snapshot.html, text);
  const eventAt = extractEventAt(snapshot.html);
  const sold = extractSoldPrice(snapshot.html, text, profile);
  const semanticFailures: string[] = [];
  if (!eventId) semanticFailures.push('EVENT_ID_MISSING');
  if (!lotNumber) semanticFailures.push('LOT_NUMBER_MISSING');
  if (!eventAt) semanticFailures.push('EVENT_AT_MISSING');
  if (sold.state === 'NOT_SOLD') semanticFailures.push('EXPLICIT_TERMINAL_SOLD_STATE_MISSING');
  if (sold.state === 'TERMINAL_NOT_SOLD') semanticFailures.push('TERMINAL_STATE_NOT_SOLD');
  if (sold.state === 'SOLD_WITHOUT_PRICE') semanticFailures.push('SOLD_WITHOUT_EXPLICIT_REALIZED_PRICE');
  if (sold.state === 'AMBIGUOUS_DOLLAR') semanticFailures.push('AMBIGUOUS_DOLLAR_CURRENCY');
  if (/\b(?:estimate|estimated|bid|asking|offer|reserve)\b/i.test(text) && sold.state !== 'MATCH') {
    semanticFailures.push('LISTING_ESTIMATE_BID_OFFER_OR_RESERVE_IS_NOT_SOLD');
  }
  if (semanticFailures.length > 0 || !eventId || !lotNumber || !eventAt || sold.price === null || sold.currency === null) {
    return rejectionResult(profile, semanticFailures.length > 0 ? semanticFailures : ['SOLD_SEMANTICS_INCOMPLETE']);
  }

  const sourceRecordId = `${profile.source_record_prefix}::event:${eventId}::lot:${lotNumber}`;
  const factualOriginCandidateId = `${profile.factual_origin_prefix}::${eventId}::${lotNumber}`;
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
  const runtimeDecision = await normalizeDatedSoldTransaction(genericProfile(profile), genericInput);
  return {
    source_id: profile.source_id,
    parser_state: 'PARSED_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA',
    reason_codes: [
      'SOURCE_SPECIFIC_PARSER_IMPLEMENTED',
      'SOLD_CANDIDATE_PARSED_FROM_IMMUTABLE_SNAPSHOT',
      'LIVE_SCHEMA_NOT_VERIFIED',
      'SOLD_SEMANTICS_NOT_EMPIRICALLY_VERIFIED',
      'FIELD_PURPOSE_RIGHTS_NOT_VERIFIED',
      'SOURCE_OWNER_NOT_VERIFIED',
      'FACTUAL_ORIGIN_NOT_VERIFIED',
      ...runtimeDecision.reason_codes,
    ].filter((value, index, values) => values.indexOf(value) === index).sort(),
    parsed_candidate: candidate,
    generic_runtime_decision: runtimeDecision,
    rights_pass_created: false,
    live_schema_verified: false,
    sold_semantics_empirically_verified: false,
    source_owner_verified: false,
    factual_origin_verified: false,
    evidence_admitted: false,
    market_event_created: false,
    public_release: 'HOLD',
    production: 'HOLD',
  };
}

export function getPublicAuctionMarketAdapterProfile(profile: PublicAuctionSourceAdapterProfile): MarketAdapterProfile {
  return genericProfile(profile);
}
