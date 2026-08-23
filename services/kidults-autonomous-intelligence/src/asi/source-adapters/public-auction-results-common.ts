import {
  normalizeDatedSoldTransaction,
  type AdapterDecision,
  type DatedSoldAdapterInput,
  type FieldPurposeRightsSnapshot,
  type MarketAdapterProfile,
  type MarketClaimTarget,
  type NormalizedDatedSoldRecord,
} from '../market-adapter.js';

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

export interface PublicAuctionAdapterConfig {
  source_id: string;
  canonical_host: string;
  allowed_hosts: readonly string[];
  source_schema_version: string;
  source_owner_candidate_id: string;
  source_record_prefix: string;
  target_claims: readonly MarketClaimTarget[];
  event_id_patterns: readonly RegExp[];
  lot_id_patterns: readonly RegExp[];
  event_at_patterns: readonly RegExp[];
  explicit_sold_price_patterns: ReadonlyArray<{ pattern: RegExp; currency: string }>;
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
  source_owner_verified: false;
  factual_origin_verified: false;
  evidence_admitted: false;
  market_event_created: false;
  public_release: 'HOLD';
  production: 'HOLD';
}

const sha256Pattern = /^sha256:[a-f0-9]{64}$/;
const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const allowedEvidenceKinds = new Set(['EMPIRICAL_SOURCE_OBSERVATION', 'SYNTHETIC_CONTROL_ONLY']);

function canonicalText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--?[\s\S]*?-->/g, ' ')
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

function firstCapture(patterns: readonly RegExp[], values: readonly string[]): string | null {
  for (const pattern of patterns) {
    for (const value of values) {
      const match = value.match(pattern);
      const captured = match?.[1]?.trim();
      if (captured) return captured;
    }
  }
  return null;
}

function extractEventAt(patterns: readonly RegExp[], html: string): string | null {
  const commonPatterns = [
    /<time\b[^>]*datetime=["']([^"']+)["']/i,
    /["'](?:startDate|endDate|event_at|saleDate|auctionDate)["']\s*:\s*["']([^"']+)["']/i,
    /data-(?:event|sale|auction)-at=["']([^"']+)["']/i,
  ];
  for (const pattern of [...patterns, ...commonPatterns]) {
    const value = html.match(pattern)?.[1];
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function extractExplicitSoldPrice(
  config: PublicAuctionAdapterConfig,
  text: string,
): { state: 'MATCH' | 'AMBIGUOUS_DOLLAR' | 'SOLD_WITHOUT_PRICE' | 'NOT_SOLD'; price: number | null; currency: string | null } {
  for (const { pattern, currency } of config.explicit_sold_price_patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const price = Number(match[1].replace(/[\s,]/g, ''));
    if (Number.isFinite(price) && price > 0) return { state: 'MATCH', price, currency };
  }
  if (/\bSold(?:\s+Price)?(?:\s+for)?\s*[:\-]?\s*\$\s*[\d,]+(?:\.\d+)?\b/i.test(text)) {
    return { state: 'AMBIGUOUS_DOLLAR', price: null, currency: null };
  }
  if (/\bSold(?:\s+Price)?(?:\s+for)?\b/i.test(text)) {
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

function rejectionResult(
  config: PublicAuctionAdapterConfig,
  reasonCodes: string[],
  integrity = false,
): PublicAuctionAdapterResult {
  return {
    source_id: config.source_id,
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

export function buildPublicAuctionAdapterProfile(config: PublicAuctionAdapterConfig): MarketAdapterProfile {
  return {
    source_id: config.source_id,
    canonical_host: config.canonical_host,
    adapter_state: 'IMPLEMENTED_NOT_RIGHTS_VERIFIED',
    source_schema_version: config.source_schema_version,
    target_claims: [...config.target_claims],
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
}

export async function parsePublicAuctionSoldSnapshot(
  config: PublicAuctionAdapterConfig,
  snapshot: PublicAuctionImmutableSnapshot,
): Promise<PublicAuctionAdapterResult> {
  const integrityFailures: string[] = [];
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(snapshot.source_url);
  } catch {
    return rejectionResult(config, ['SOURCE_URL_INVALID'], true);
  }
  const host = sourceUrl.hostname.toLowerCase().replace(/\.$/, '');
  if (sourceUrl.protocol !== 'https:') integrityFailures.push('SOURCE_SCHEME_NOT_HTTPS');
  if (!new Set(config.allowed_hosts).has(host)) integrityFailures.push('SOURCE_HOST_NOT_ALLOWED');
  if (!rfc3339.test(snapshot.observed_at) || !Number.isFinite(Date.parse(snapshot.observed_at))) integrityFailures.push('OBSERVED_AT_INVALID');
  if (!sha256Pattern.test(snapshot.input_snapshot_ref)) integrityFailures.push('INPUT_SNAPSHOT_REF_INVALID');
  if (!sha256Pattern.test(snapshot.source_payload_hash)) integrityFailures.push('SOURCE_PAYLOAD_HASH_INVALID');
  if (!allowedEvidenceKinds.has(snapshot.evidence_kind)) integrityFailures.push('EVIDENCE_KIND_INVALID');
  if (snapshot.canonical_object_id.trim().length === 0) integrityFailures.push('CANONICAL_OBJECT_ID_MISSING');
  if (snapshot.condition_segment.trim().length === 0) integrityFailures.push('CONDITION_SEGMENT_MISSING');
  const actualPayloadHash = await sha256Bytes(snapshot.html);
  if (actualPayloadHash !== snapshot.source_payload_hash) integrityFailures.push('SOURCE_PAYLOAD_HASH_MISMATCH');
  if (integrityFailures.length > 0) return rejectionResult(config, integrityFailures, true);

  const text = canonicalText(snapshot.html);
  const eventId = firstCapture(config.event_id_patterns, [sourceUrl.pathname, sourceUrl.toString(), snapshot.html, text]);
  const lotNumber = firstCapture(config.lot_id_patterns, [sourceUrl.pathname, sourceUrl.toString(), snapshot.html, text]);
  const eventAt = extractEventAt(config.event_at_patterns, snapshot.html);
  const sold = extractExplicitSoldPrice(config, text);
  const semanticFailures: string[] = [];
  if (!eventId) semanticFailures.push('EVENT_ID_MISSING');
  if (!lotNumber) semanticFailures.push('LOT_NUMBER_MISSING');
  if (!eventAt) semanticFailures.push('EVENT_AT_MISSING');
  if (sold.state === 'NOT_SOLD') semanticFailures.push('EXPLICIT_TERMINAL_SOLD_STATE_MISSING');
  if (sold.state === 'SOLD_WITHOUT_PRICE') semanticFailures.push('SOLD_WITHOUT_EXPLICIT_REALIZED_PRICE');
  if (sold.state === 'AMBIGUOUS_DOLLAR') semanticFailures.push('AMBIGUOUS_DOLLAR_CURRENCY');
  if (/\b(?:estimate|estimated|bid|asking|offer|reserve|guide)\b/i.test(text) && sold.state !== 'MATCH') {
    semanticFailures.push('LISTING_ESTIMATE_BID_OFFER_RESERVE_OR_GUIDE_IS_NOT_SOLD');
  }
  if (semanticFailures.length > 0 || !eventId || !lotNumber || !eventAt || sold.price === null || sold.currency === null) {
    return rejectionResult(config, semanticFailures.length > 0 ? semanticFailures : ['SOLD_SEMANTICS_INCOMPLETE']);
  }

  const normalizedObservedAt = new Date(snapshot.observed_at).toISOString();
  const sourceRecordId = `${config.source_record_prefix}::event:${eventId}::lot:${lotNumber}`;
  const factualOriginCandidateId = `${config.source_id}::auction-lot:${eventId}:${lotNumber}`;
  const candidate: PublicAuctionParsedCandidate = {
    source_id: config.source_id,
    source_record_id: sourceRecordId,
    event_id: eventId,
    lot_number: lotNumber,
    canonical_object_id: snapshot.canonical_object_id,
    terminal_market_state: 'SOLD',
    realized_price: sold.price,
    currency: sold.currency,
    event_at: eventAt,
    observed_at: normalizedObservedAt,
    condition_segment: snapshot.condition_segment,
    source_owner_candidate_id: config.source_owner_candidate_id,
    source_owner_verified: false,
    factual_origin_candidate_id: factualOriginCandidateId,
    factual_origin_verified: false,
    source_schema_version: config.source_schema_version,
    source_payload_hash: snapshot.source_payload_hash,
    input_snapshot_ref: snapshot.input_snapshot_ref,
    provenance_refs: [snapshot.source_url, snapshot.input_snapshot_ref, snapshot.source_payload_hash],
  };

  const profile = buildPublicAuctionAdapterProfile(config);
  const genericInput: DatedSoldAdapterInput = {
    evidence_kind: snapshot.evidence_kind,
    source_id: config.source_id,
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
    source_id: config.source_id,
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
