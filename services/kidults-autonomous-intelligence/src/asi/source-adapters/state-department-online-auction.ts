export interface StateDepartmentAuctionObservation {
  id: string;
  version: string;
  state: string;
  as_of: string;
  platform_principles: string[];
  observation_method: {
    mode: string;
    capture_agent: string;
    network_requests: number;
    authenticated: boolean;
    account_created: boolean;
    credential_used: boolean;
    bid_or_purchase_executed: boolean;
    raw_html_archived_or_republished: boolean;
    images_or_graphics_archived_or_republished: boolean;
  };
  source: {
    source_id: string;
    source_owner_id: string;
    factual_origin_id: string;
    canonical_host: string;
    source_url: string;
    owner_and_origin_state: string;
  };
  rights: {
    decision: string;
    independent_legal_review_complete: boolean;
    legal_conclusion_asserted: boolean;
    collect: string;
    store: string;
    transform: string;
    display: string;
    redistribute: string;
    sell: string;
    allowed_material: string;
    evidence_refs: string[];
    review_due_at: string;
  };
  source_projection: Record<string, unknown>;
  projection_sha256: string;
  evidence_refs: Array<{
    ref_id: string;
    kind: string;
    locator: string;
    observed_at: string;
  }>;
  semantic_boundary: {
    admissible_evidence_class: string;
    event_state: string;
    price_role: string;
    verified_sold_event: boolean;
    hammer_price_confirmed: boolean;
    settlement_confirmed: boolean;
    buyer_premium_inclusion_known: boolean;
    current_price: boolean;
    liquidity_or_time_to_sale: boolean;
    collector_market_representativeness_verified: boolean;
  };
  excluded_capture: string[];
  public_release: string;
  production: string;
  g5: string;
}

export interface StateDepartmentAuctionReference {
  source_id: 'us-state-department-online-auction';
  source_record_id: string;
  source_event_id: string;
  source_lot_id: string;
  lot_number: string;
  canonical_entity_id: string;
  physical_object_id: string;
  scope_id: 'cameras_lenses';
  legacy_scope_id: 'scope-cameras-lenses';
  domain_id: 'technology_cameras';
  evidence_class: 'AUCTION_RESULT_REFERENCE';
  event_state: 'SOLD';
  price_type: 'BID';
  terminal_display_amount: number;
  currency: string;
  bid_count: number;
  event_at: string;
  observed_at: string;
  title: string;
  condition: string;
  object_identifiers: string[];
  camera_quantity: number;
  lot_quantity: 1;
  venue_id: 'us-state-department-online-auction::doha';
  region: 'QA';
  sale_mechanism: 'AUCTION';
  source_owner_id: 'us-department-of-state';
  factual_origin_id: 'us-department-of-state-online-auction';
  source_owner_verified: true;
  factual_origin_verified: true;
  field_purpose_rights_refs: string[];
  input_projection_ref: string;
  source_projection_hash: string;
  source_schema_version: 'state-department-online-auction-fact-projection-v1';
  provenance_refs: string[];
  price_role: 'TERMINAL_HIGHEST_BID_DISPLAY_AMOUNT_NOT_CONFIRMED_SETTLEMENT_OR_ALL_IN_REALIZED';
  verified_sold_event: false;
  current_price_eligible: false;
  liquidity_eligible: false;
  customer_claim_authorized: false;
}

export interface StateDepartmentAuctionAdapterResult {
  source_id: 'us-state-department-online-auction';
  adapter_state: 'EXACT_PROJECTION_REFERENCE_VALIDATOR_ACTIVE';
  activation_scope: 'EXACT_DIGEST_BOUND_AUCTION_RESULT_REFERENCE_ONLY';
  decision_state: 'NORMALIZED_REFERENCE_READY_FOR_ADMISSION_GATE' | 'REJECTED_FAIL_CLOSED';
  reason_codes: string[];
  normalized_reference: StateDepartmentAuctionReference | null;
  field_purpose_rights_preflight_pass: boolean;
  source_owner_verified: boolean;
  factual_origin_verified: boolean;
  bounded_primary_source_fact_projection_validated: boolean;
  raw_live_source_snapshot_verified: false;
  evidence_admitted: false;
  market_event_created: false;
  verified_sold_event_created: false;
  public_release: 'HOLD';
  production: 'HOLD';
  g5: 'HOLD';
}

const sha256Pattern = /^sha256:[a-f0-9]{64}$/;
const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const requiredPrinciples = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const observationKeys = [
  'id', 'version', 'state', 'as_of', 'platform_principles', 'observation_method', 'source', 'rights',
  'source_projection', 'projection_sha256', 'evidence_refs', 'semantic_boundary', 'excluded_capture',
  'public_release', 'production', 'g5',
].sort();
const observationMethodKeys = [
  'mode', 'capture_agent', 'network_requests', 'authenticated', 'account_created', 'credential_used',
  'bid_or_purchase_executed', 'raw_html_archived_or_republished', 'images_or_graphics_archived_or_republished',
].sort();
const sourceKeys = [
  'source_id', 'source_owner_id', 'factual_origin_id', 'canonical_host', 'source_url', 'owner_and_origin_state',
].sort();
const rightsKeys = [
  'decision', 'independent_legal_review_complete', 'legal_conclusion_asserted', 'collect', 'store', 'transform',
  'display', 'redistribute', 'sell', 'allowed_material', 'evidence_refs', 'review_due_at',
].sort();
const semanticBoundaryKeys = [
  'admissible_evidence_class', 'event_state', 'price_role', 'verified_sold_event', 'hammer_price_confirmed',
  'settlement_confirmed', 'buyer_premium_inclusion_known', 'current_price', 'liquidity_or_time_to_sale',
  'collector_market_representativeness_verified',
].sort();
const evidenceReferenceKeys = ['ref_id', 'kind', 'locator', 'observed_at'].sort();
const projectionKeys = [
  'auction_post', 'auction_id', 'lot_uuid', 'lot_number', 'auction_close_at', 'title', 'condition',
  'object_identifiers', 'camera_quantity', 'terminal_page_state', 'bid_count', 'terminal_display_amount',
  'lot_quantity',
  'currency', 'amount_page_label', 'sale_mechanism', 'description_sale_rule', 'scope_id', 'domain_id',
  'condition_source_asserted', 'source_url', 'observed_at', 'source_schema_version', 'legacy_scope_id',
].sort();
const requiredExcludedCapture = [
  'PHOTOS', 'GRAPHICS', 'STATE_DEPARTMENT_SEAL_OR_INSIGNIA', 'RAW_HTML', 'FULL_DESCRIPTION_REPRODUCTION',
  'BIDDER_IDENTITY', 'ACCOUNT_DATA', 'PAYMENT_DATA', 'BIDDER_BID_HISTORY',
].sort();
const requiredRightsEvidenceRefs = [
  'https://www.state.gov/copyright-information',
  'https://ceac.state.gov/ceacstattracker/Common/Copyright.aspx',
  'https://travel.state.gov/content/travel/en/copyright-disclaimer.html',
].sort();
const officialAuctionId = '13251474-ac4c-49d5-b3dc-9c9b0cb181e3';
const officialLotUuid = 'fdc79e90-95ac-452e-8f9b-ac91aede6e3d';
const officialLotUrl = `https://online-auction.state.gov/en-US/Auction/Lot/${officialLotUuid}?auctionId=${officialAuctionId}`;
const officialAuctionCloseAt = '2024-06-29T12:00:00Z';
const officialTerminalDisplayAmount = 2110;
const officialCurrency = 'QAR';
const officialBidCount = 101;
const maximumRightsReviewIntervalMs = 30 * 24 * 60 * 60 * 1000;
const maximumObservationFutureSkewMs = 5 * 60 * 1000;
const requiredObservationEvidenceRefs = [
  ['official-lot-page', officialLotUrl],
  ['department-copyright-policy', 'https://www.state.gov/copyright-information'],
  ['department-copyright-policy-corroboration', 'https://ceac.state.gov/ceacstattracker/Common/Copyright.aspx'],
];

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort().map((key) => [key, canonicalValue(object[key])]));
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalValue(value)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function validTime(value: unknown): value is string {
  return typeof value === 'string' && rfc3339.test(value) && Number.isFinite(Date.parse(value));
}

function sortedUniqueStrings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) return null;
  const normalized = [...new Set(value.map((item) => String(item).trim()))].sort();
  return normalized.length === value.length ? normalized : null;
}

function rejected(reasonCodes: string[]): StateDepartmentAuctionAdapterResult {
  return {
    source_id: 'us-state-department-online-auction',
    adapter_state: 'EXACT_PROJECTION_REFERENCE_VALIDATOR_ACTIVE',
    activation_scope: 'EXACT_DIGEST_BOUND_AUCTION_RESULT_REFERENCE_ONLY',
    decision_state: 'REJECTED_FAIL_CLOSED',
    reason_codes: [...new Set(reasonCodes)].sort(),
    normalized_reference: null,
    field_purpose_rights_preflight_pass: false,
    source_owner_verified: false,
    factual_origin_verified: false,
    bounded_primary_source_fact_projection_validated: false,
    raw_live_source_snapshot_verified: false,
    evidence_admitted: false,
    market_event_created: false,
    verified_sold_event_created: false,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}

export async function parseStateDepartmentAuctionObservation(
  observation: StateDepartmentAuctionObservation,
  expectedProjectionSha256: string,
): Promise<StateDepartmentAuctionAdapterResult> {
  const failures: string[] = [];
  if (!observation || JSON.stringify(Object.keys(observation).sort()) !== JSON.stringify(observationKeys)) {
    failures.push('OBSERVATION_FIELD_SET_INVALID');
  }
  if (observation?.id !== 'kidults-state-department-camera-auction-observation-v1' || observation?.version !== '1.0.0') {
    failures.push('OBSERVATION_ID_OR_VERSION_INVALID');
  }
  if (observation?.state !== 'VERIFIED_PASS') failures.push('OBSERVATION_STATE_INVALID');
  if (JSON.stringify(observation?.platform_principles) !== JSON.stringify(requiredPrinciples)) failures.push('PLATFORM_PRINCIPLES_INVALID');
  if (JSON.stringify(Object.keys(observation?.observation_method ?? {}).sort()) !== JSON.stringify(observationMethodKeys) ||
      observation?.observation_method?.mode !== 'BOUNDED_PUBLIC_PRIMARY_SOURCE_FACT_PROJECTION' ||
      observation?.observation_method?.capture_agent !== 'codex/root' ||
      observation?.observation_method?.network_requests !== 1 || observation?.observation_method?.authenticated !== false ||
      observation?.observation_method?.account_created !== false || observation?.observation_method?.credential_used !== false ||
      observation?.observation_method?.bid_or_purchase_executed !== false ||
      observation?.observation_method?.raw_html_archived_or_republished !== false ||
      observation?.observation_method?.images_or_graphics_archived_or_republished !== false) {
    failures.push('OBSERVATION_METHOD_BOUNDARY_INVALID');
  }

  const source = observation?.source;
  if (JSON.stringify(Object.keys(source ?? {}).sort()) !== JSON.stringify(sourceKeys) ||
      source?.source_id !== 'us-state-department-online-auction' || source?.canonical_host !== 'online-auction.state.gov') {
    failures.push('SOURCE_ID_OR_HOST_INVALID');
  }
  if (source?.source_owner_id !== 'us-department-of-state' ||
      source?.factual_origin_id !== 'us-department-of-state-online-auction' ||
      source?.owner_and_origin_state !== 'VERIFIED_OFFICIAL_GOVERNMENT_HOST_SAME_OWNER_AND_FACTUAL_ORIGIN') {
    failures.push('SOURCE_OWNER_OR_FACTUAL_ORIGIN_INVALID');
  }

  const projection = observation?.source_projection ?? {};
  if (JSON.stringify(Object.keys(projection).sort()) !== JSON.stringify(projectionKeys)) failures.push('PROJECTION_FIELD_SET_INVALID');
  const actualProjectionHash = await sha256(projection);
  if (!sha256Pattern.test(observation?.projection_sha256 || '') || observation?.projection_sha256 !== actualProjectionHash ||
      !sha256Pattern.test(expectedProjectionSha256 || '') || expectedProjectionSha256 !== actualProjectionHash) {
    failures.push('PROJECTION_HASH_MISMATCH');
  }

  let url: URL | null = null;
  try { url = new URL(String(source?.source_url)); } catch { failures.push('SOURCE_URL_INVALID'); }
  const auctionId = String(projection.auction_id ?? '');
  const lotUuid = String(projection.lot_uuid ?? '');
  if (!uuid.test(auctionId) || !uuid.test(lotUuid)) failures.push('AUCTION_OR_LOT_UUID_INVALID');
  if (url) {
    if (url.protocol !== 'https:' || url.hostname !== 'online-auction.state.gov' || url.port !== '' || url.username !== '' ||
        url.password !== '' || url.hash !== '' || url.pathname !== `/en-US/Auction/Lot/${lotUuid}` ||
        url.searchParams.size !== 1 || url.searchParams.get('auctionId') !== auctionId) {
      failures.push('SOURCE_URL_SCOPE_INVALID');
    }
  }
  if (projection.source_url !== source?.source_url) failures.push('PROJECTION_SOURCE_URL_MISMATCH');
  if (source?.source_url !== officialLotUrl || projection.source_url !== officialLotUrl ||
      auctionId !== officialAuctionId || lotUuid !== officialLotUuid) {
    failures.push('OFFICIAL_LOT_PROVENANCE_BINDING_INVALID');
  }

  if (!validTime(observation?.as_of) || !validTime(projection.observed_at) || observation?.as_of !== projection.observed_at) {
    failures.push('OBSERVED_AT_INVALID');
  }
  if (validTime(observation?.as_of) && Date.parse(observation.as_of) > Date.now() + maximumObservationFutureSkewMs) {
    failures.push('OBSERVATION_TIME_IN_FUTURE');
  }
  if (!validTime(projection.auction_close_at)) failures.push('AUCTION_CLOSE_AT_INVALID');
  if (validTime(projection.auction_close_at) && validTime(projection.observed_at) &&
      Date.parse(projection.auction_close_at) > Date.parse(projection.observed_at)) failures.push('AUCTION_CLOSE_AFTER_OBSERVATION');
  if (projection.source_schema_version !== 'state-department-online-auction-fact-projection-v1') failures.push('SOURCE_SCHEMA_VERSION_INVALID');
  if (projection.auction_post !== 'Doha (Qatar)' || projection.lot_number !== '158') failures.push('AUCTION_POST_OR_LOT_NUMBER_INVALID');
  if (projection.scope_id !== 'cameras_lenses' || projection.legacy_scope_id !== 'scope-cameras-lenses' ||
      projection.domain_id !== 'technology_cameras') failures.push('SCOPE_OR_DOMAIN_INVALID');
  if (projection.title !== 'NIKON CAMERA' || projection.condition !== 'Usable' || projection.condition_source_asserted !== true) {
    failures.push('OBJECT_IDENTITY_OR_CONDITION_INVALID');
  }
  const objectIdentifiers = sortedUniqueStrings(projection.object_identifiers);
  if (!objectIdentifiers || JSON.stringify(objectIdentifiers) !== JSON.stringify(['Nikon D5600', 'Nikon D90'].sort()) ||
      projection.camera_quantity !== 2 || projection.lot_quantity !== 1) failures.push('OBJECT_IDENTIFIERS_OR_QUANTITY_INVALID');
  if (projection.terminal_page_state !== 'SOLD_FOR' || projection.sale_mechanism !== 'AUCTION' ||
      projection.description_sale_rule !== 'Sale will go to the highest bidder.') failures.push('TERMINAL_SOLD_SEMANTICS_INVALID');
  if (!Number.isInteger(projection.bid_count) || Number(projection.bid_count) <= 0 ||
      !Number.isFinite(projection.terminal_display_amount) || Number(projection.terminal_display_amount) <= 0 ||
      !/^[A-Z]{3}$/.test(String(projection.currency)) || projection.amount_page_label !== 'Current price') {
    failures.push('TERMINAL_AMOUNT_CURRENCY_OR_BID_COUNT_INVALID');
  }
  if (projection.auction_close_at !== officialAuctionCloseAt ||
      projection.terminal_display_amount !== officialTerminalDisplayAmount ||
      projection.currency !== officialCurrency || projection.bid_count !== officialBidCount) {
    failures.push('EXACT_CLAIM_FACT_BINDING_INVALID');
  }

  const rights = observation?.rights;
  const rightsEvidenceRefs = sortedUniqueStrings(rights?.evidence_refs);
  if (JSON.stringify(Object.keys(rights ?? {}).sort()) !== JSON.stringify(rightsKeys) ||
      rights?.decision !== 'POLICY_AND_EVIDENCE_PREFLIGHT_PASS_ALLOW_FACTUAL_FIELDS_ONLY' ||
      rights?.collect !== 'ALLOW' || rights?.store !== 'ALLOW' || rights?.transform !== 'ALLOW' ||
      rights?.display !== 'UNKNOWN' || rights?.redistribute !== 'UNKNOWN' || rights?.sell !== 'UNKNOWN' ||
      rights?.allowed_material !== 'NORMALIZED_FACTUAL_FIELDS_ONLY' || rights?.legal_conclusion_asserted !== false ||
      rights?.independent_legal_review_complete !== false || !validTime(rights?.review_due_at) ||
      !rightsEvidenceRefs || JSON.stringify(rightsEvidenceRefs) !== JSON.stringify(requiredRightsEvidenceRefs)) {
    failures.push('FIELD_PURPOSE_RIGHTS_INVALID');
  }
  if (validTime(observation?.as_of) && validTime(rights?.review_due_at) && Date.parse(rights.review_due_at) <= Date.parse(observation.as_of)) {
    failures.push('RIGHTS_REVIEW_DUE_AT_INVALID');
  }
  if (validTime(observation?.as_of) && validTime(rights?.review_due_at) &&
      Date.parse(rights.review_due_at) - Date.parse(observation.as_of) > maximumRightsReviewIntervalMs) {
    failures.push('RIGHTS_REVIEW_INTERVAL_EXCEEDED');
  }
  if (validTime(rights?.review_due_at) && Date.parse(rights.review_due_at) <= Date.now()) failures.push('RIGHTS_REVIEW_EXPIRED');

  const observationEvidenceRefs = Array.isArray(observation?.evidence_refs) ? observation.evidence_refs : [];
  const evidenceRefsValid = observationEvidenceRefs.length === requiredObservationEvidenceRefs.length &&
    requiredObservationEvidenceRefs.every(([refId, locator]) => observationEvidenceRefs.some((reference) =>
      JSON.stringify(Object.keys(reference ?? {}).sort()) === JSON.stringify(evidenceReferenceKeys) &&
      reference?.ref_id === refId && reference?.kind === 'OTHER_AUTHORITATIVE_SOURCE' && reference?.locator === locator &&
      reference?.observed_at === observation?.as_of));
  if (!evidenceRefsValid) failures.push('OBSERVATION_EVIDENCE_REFS_INVALID');

  const semantic = observation?.semantic_boundary;
  if (JSON.stringify(Object.keys(semantic ?? {}).sort()) !== JSON.stringify(semanticBoundaryKeys)) {
    failures.push('SEMANTIC_FIELD_SET_INVALID');
  }
  if (semantic?.admissible_evidence_class !== 'AUCTION_RESULT_REFERENCE' || semantic?.event_state !== 'SOLD' ||
      semantic?.price_role !== 'TERMINAL_HIGHEST_BID_DISPLAY_AMOUNT_NOT_CONFIRMED_SETTLEMENT_OR_ALL_IN_REALIZED' ||
      semantic?.verified_sold_event !== false || semantic?.hammer_price_confirmed !== false ||
      semantic?.settlement_confirmed !== false || semantic?.buyer_premium_inclusion_known !== false ||
      semantic?.current_price !== false || semantic?.liquidity_or_time_to_sale !== false ||
      semantic?.collector_market_representativeness_verified !== false) failures.push('SEMANTIC_CLAIM_CEILING_INVALID');
  const excluded = sortedUniqueStrings(observation?.excluded_capture);
  if (!excluded || JSON.stringify(excluded) !== JSON.stringify(requiredExcludedCapture)) failures.push('EXCLUDED_CAPTURE_BOUNDARY_INVALID');
  if (observation?.public_release !== 'HOLD' || observation?.production !== 'HOLD' || observation?.g5 !== 'HOLD') {
    failures.push('PROTECTED_RELEASE_BOUNDARY_INVALID');
  }
  if (failures.length > 0 || !url || !objectIdentifiers || !validTime(projection.auction_close_at) || !validTime(projection.observed_at)) {
    return rejected(failures.length > 0 ? failures : ['OBSERVATION_INCOMPLETE']);
  }

  const sourceRecordId = `state-department-auction::auction:${auctionId}::lot:${lotUuid}`;
  const reference: StateDepartmentAuctionReference = {
    source_id: 'us-state-department-online-auction',
    source_record_id: sourceRecordId,
    source_event_id: auctionId,
    source_lot_id: lotUuid,
    lot_number: String(projection.lot_number),
    canonical_entity_id: `camera-lot::nikon-d5600-and-d90::${lotUuid}`,
    physical_object_id: `source-lot::${lotUuid}`,
    scope_id: 'cameras_lenses',
    legacy_scope_id: 'scope-cameras-lenses',
    domain_id: 'technology_cameras',
    evidence_class: 'AUCTION_RESULT_REFERENCE',
    event_state: 'SOLD',
    price_type: 'BID',
    terminal_display_amount: Number(projection.terminal_display_amount),
    currency: String(projection.currency),
    bid_count: Number(projection.bid_count),
    event_at: projection.auction_close_at,
    observed_at: projection.observed_at,
    title: String(projection.title),
    condition: String(projection.condition),
    object_identifiers: objectIdentifiers,
    camera_quantity: Number(projection.camera_quantity),
    lot_quantity: 1,
    venue_id: 'us-state-department-online-auction::doha',
    region: 'QA',
    sale_mechanism: 'AUCTION',
    source_owner_id: 'us-department-of-state',
    factual_origin_id: 'us-department-of-state-online-auction',
    source_owner_verified: true,
    factual_origin_verified: true,
    field_purpose_rights_refs: rightsEvidenceRefs!,
    input_projection_ref: actualProjectionHash,
    source_projection_hash: actualProjectionHash,
    source_schema_version: 'state-department-online-auction-fact-projection-v1',
    provenance_refs: [source.source_url, actualProjectionHash, ...rights.evidence_refs].sort(),
    price_role: 'TERMINAL_HIGHEST_BID_DISPLAY_AMOUNT_NOT_CONFIRMED_SETTLEMENT_OR_ALL_IN_REALIZED',
    verified_sold_event: false,
    current_price_eligible: false,
    liquidity_eligible: false,
    customer_claim_authorized: false,
  };
  return {
    source_id: 'us-state-department-online-auction',
    adapter_state: 'EXACT_PROJECTION_REFERENCE_VALIDATOR_ACTIVE',
    activation_scope: 'EXACT_DIGEST_BOUND_AUCTION_RESULT_REFERENCE_ONLY',
    decision_state: 'NORMALIZED_REFERENCE_READY_FOR_ADMISSION_GATE',
    reason_codes: [],
    normalized_reference: reference,
    field_purpose_rights_preflight_pass: true,
    source_owner_verified: true,
    factual_origin_verified: true,
    bounded_primary_source_fact_projection_validated: true,
    raw_live_source_snapshot_verified: false,
    evidence_admitted: false,
    market_event_created: false,
    verified_sold_event_created: false,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}
