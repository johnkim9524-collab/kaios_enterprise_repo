export interface GettyProvenanceObservation {
  id: string;
  version: string;
  state: string;
  as_of: string;
  source: {
    source_id: string;
    source_owner_id: string;
    factual_origin_id: string;
    canonical_host: string;
    sale_record_url: string;
    object_record_url: string;
    registered_top_16_source_profile: boolean;
  };
  capture: {
    mode: string;
    authenticated: boolean;
    credential_used: boolean;
    paid_access: boolean;
    network_requests: number;
    machine_proven_acquisition_receipts: number;
    acquisition_time_http_receipt: null;
  };
  rights: {
    decision: string;
    basis: string;
    collect: string;
    store: string;
    transform: string;
    display_internal: string;
    display_public: string;
    evidence_refs: string[];
    authoritative_pool_ref: string;
  };
  snapshots: {
    sale: SnapshotBinding;
    object: SnapshotBinding;
  };
  semantic_boundary: {
    evidence_class: string;
    amount_semantics: string;
    event_time_precision: string;
    historical_transaction: boolean;
    committed_reference_replay: boolean;
    verified_current_sold_event: boolean;
    current_price: boolean;
    liquidity: boolean;
    demand: boolean;
    generic_market_event: boolean;
  };
  public_release: string;
  production: string;
  g5: string;
}

interface SnapshotBinding {
  path: string;
  source_url: string;
  sha256: string;
  etag: string | null;
  etag_state: 'VERIFIED' | 'NOT_RETAINED';
  last_modified_at: string;
  content_type: string;
}

export interface GettyHistoricalTransactionRecord {
  schema_version: 'historical-transaction-provenance-v1';
  evidence_class: 'HISTORICAL_TRANSACTION_PROVENANCE';
  source_id: 'getty-provenance-index';
  source_owner_id: 'j-paul-getty-trust';
  factual_origin_id: 'knoedler-stock-book-a1983';
  source_record_id: string;
  source_record_url: string;
  canonical_entity_id: string;
  object_record_url: string;
  object_label: 'James Christie';
  object_type: 'PAINTING';
  object_identifiers: string[];
  activity_label: string;
  activity_classification_ids: string[];
  transaction_state: 'DOCUMENTED_TITLE_TRANSFER';
  event_date_label: '1938-09-00';
  event_window_start_at: '1938-09-01T00:00:00Z';
  event_window_end_at: '1938-10-01T23:59:59Z';
  event_time_precision: 'MONTH';
  documented_transaction_amount: 1471.13;
  currency: 'GBP';
  currency_authority_id: 'http://vocab.getty.edu/aat/300411998';
  amount_semantics: 'DOCUMENTED_TRANSACTION_AMOUNT_NOT_HAMMER_OR_CURRENT_PRICE';
  transferred_title_from_ids: string[];
  transferred_title_to_ids: string[];
  raw_sale_snapshot_sha256: string;
  raw_object_snapshot_sha256: string;
  rights_basis: 'CC0';
  rights_evidence_refs: string[];
  provenance_refs: string[];
  current_market_signal_eligible: false;
  current_price_eligible: false;
  liquidity_eligible: false;
  demand_eligible: false;
  generic_market_event_eligible: false;
  public_release: 'HOLD';
  production: 'HOLD';
  g5: 'HOLD';
}

export interface GettyAdapterResult {
  source_id: 'getty-provenance-index';
  adapter_state: 'REFERENCE_REPLAY_CONTROL_ONLY';
  decision_state: 'NORMALIZED_REFERENCE_REPLAY_NOT_ADMISSIBLE' | 'REJECTED_FAIL_CLOSED';
  reason_codes: string[];
  normalized_record: GettyHistoricalTransactionRecord | null;
  committed_reference_snapshots_verified: number;
  immutable_live_snapshots_verified: number;
  machine_proven_acquisition_receipts: number;
  purpose_specific_rights_verified: boolean;
  historical_transaction_evidence_ready: boolean;
  promotable: false;
  generic_market_event_created: false;
  verified_current_sold_event_created: false;
  current_price_created: false;
  liquidity_created: false;
  public_release: 'HOLD';
  production: 'HOLD';
  g5: 'HOLD';
}

type JsonObject = Record<string, unknown>;

const saleRecordId = 'https://data.getty.edu/provenance/fbc91494-294c-30a6-b6dc-885f3ea074ed';
const objectRecordId = 'https://data.getty.edu/provenance/09539ab1-416d-3870-810b-8a6b3b604368';
const purchaseTypeId = 'http://vocab.getty.edu/aat/300417642';
const provenanceTypeId = 'http://vocab.getty.edu/aat/300055863';
const paintingTypeId = 'http://vocab.getty.edu/aat/300033618';
const stockNumberTypeId = 'http://vocab.getty.edu/aat/300412177';
const sterlingCurrencyId = 'http://vocab.getty.edu/aat/300411998';
const rightsDocsUrl = 'https://data.getty.edu/provenance/docs/';
const rightsPoolRef = 'coordination/kidults/source-intelligence/rights-admitted-transaction-source-pool-r1.json';
const expectedSaleSha = 'sha256:dd177b9189aea6f66d842a5c616a04c37aec16522196b667a6c5c8f219f2d74e';
const expectedObjectSha = 'sha256:8497c19fc1a9f07d1e4b1caec30e7d0cc11b0a17484c91a212d52a440c45f1c7';
const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const object = (value: unknown): JsonObject | null => value && typeof value === 'object' && !Array.isArray(value)
  ? value as JsonObject
  : null;
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const strings = (value: unknown): string[] => array(value).filter((item): item is string => typeof item === 'string');
const uniqueSorted = (value: string[]): string[] => [...new Set(value)].sort();

async function hashRaw(raw: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
  return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function rejected(reasonCodes: string[]): GettyAdapterResult {
  return {
    source_id: 'getty-provenance-index',
    adapter_state: 'REFERENCE_REPLAY_CONTROL_ONLY',
    decision_state: 'REJECTED_FAIL_CLOSED',
    reason_codes: uniqueSorted(reasonCodes),
    normalized_record: null,
    committed_reference_snapshots_verified: 0,
    immutable_live_snapshots_verified: 0,
    machine_proven_acquisition_receipts: 0,
    purpose_specific_rights_verified: false,
    historical_transaction_evidence_ready: false,
    promotable: false,
    generic_market_event_created: false,
    verified_current_sold_event_created: false,
    current_price_created: false,
    liquidity_created: false,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}

export async function parseGettyHistoricalTransaction(
  observation: GettyProvenanceObservation,
  saleRaw: string,
  objectRaw: string,
): Promise<GettyAdapterResult> {
  const failures: string[] = [];
  if (observation?.id !== 'kidults-getty-provenance-historical-transaction-observation-v1' ||
      observation?.version !== '1.0.0' || observation?.state !== 'COMMITTED_REFERENCE_SNAPSHOT_REPLAY' ||
      !rfc3339.test(observation?.as_of ?? '')) failures.push('OBSERVATION_ID_VERSION_STATE_OR_TIME_INVALID');

  const source = observation?.source;
  if (source?.source_id !== 'getty-provenance-index' || source?.source_owner_id !== 'j-paul-getty-trust' ||
      source?.factual_origin_id !== 'knoedler-stock-book-a1983' || source?.canonical_host !== 'data.getty.edu' ||
      source?.sale_record_url !== saleRecordId || source?.object_record_url !== objectRecordId ||
      source?.registered_top_16_source_profile !== false) failures.push('SOURCE_IDENTITY_OR_SCOPE_INVALID');

  const capture = observation?.capture;
  if (capture?.mode !== 'COMMITTED_SNAPSHOT_REPLAY_NO_ACQUISITION_RECEIPT' || capture?.authenticated !== false ||
      capture?.credential_used !== false || capture?.paid_access !== false || capture?.network_requests !== 0 ||
      capture?.machine_proven_acquisition_receipts !== 0 || capture?.acquisition_time_http_receipt !== null) {
    failures.push('CAPTURE_BOUNDARY_INVALID');
  }

  const rights = observation?.rights;
  if (rights?.decision !== 'ALLOW' || rights?.basis !== 'CC0' || rights?.collect !== 'ALLOW' ||
      rights?.store !== 'ALLOW' || rights?.transform !== 'ALLOW' || rights?.display_internal !== 'ALLOW' ||
      rights?.display_public !== 'ALLOW_WITH_SOURCE_ACKNOWLEDGEMENT_PREFERRED' ||
      rights?.authoritative_pool_ref !== rightsPoolRef ||
      !Array.isArray(rights?.evidence_refs) || !rights.evidence_refs.includes(rightsDocsUrl)) {
    failures.push('PURPOSE_SPECIFIC_RIGHTS_INVALID');
  }

  const boundary = observation?.semantic_boundary;
  if (boundary?.evidence_class !== 'HISTORICAL_TRANSACTION_PROVENANCE' ||
      boundary?.amount_semantics !== 'DOCUMENTED_TRANSACTION_AMOUNT_NOT_HAMMER_OR_CURRENT_PRICE' ||
      boundary?.event_time_precision !== 'MONTH' || boundary?.historical_transaction !== false ||
      boundary?.committed_reference_replay !== true || boundary?.verified_current_sold_event !== false || boundary?.current_price !== false ||
      boundary?.liquidity !== false || boundary?.demand !== false || boundary?.generic_market_event !== false) {
    failures.push('SEMANTIC_CLAIM_CEILING_INVALID');
  }
  if (observation?.public_release !== 'HOLD' || observation?.production !== 'HOLD' || observation?.g5 !== 'HOLD') {
    failures.push('PROTECTED_RELEASE_BOUNDARY_INVALID');
  }

  const saleHash = await hashRaw(saleRaw);
  const objectHash = await hashRaw(objectRaw);
  const saleBinding = observation?.snapshots?.sale;
  const objectBinding = observation?.snapshots?.object;
  if (saleBinding?.source_url !== saleRecordId || saleBinding?.sha256 !== expectedSaleSha || saleHash !== expectedSaleSha ||
      saleBinding?.content_type !== 'application/ld+json' || !rfc3339.test(saleBinding?.last_modified_at ?? '') ||
      saleBinding?.etag_state !== 'VERIFIED' ||
      saleBinding?.etag !== '"18b268d4f1c500f823c488accd14dc6fce662f9a1063530ed9dc1f8365565e53"') {
    failures.push('SALE_SNAPSHOT_BINDING_INVALID');
  }
  if (objectBinding?.source_url !== objectRecordId || objectBinding?.sha256 !== expectedObjectSha || objectHash !== expectedObjectSha ||
      objectBinding?.content_type !== 'application/ld+json' || !rfc3339.test(objectBinding?.last_modified_at ?? '') ||
      objectBinding?.etag_state !== 'NOT_RETAINED' || objectBinding?.etag !== null) failures.push('OBJECT_SNAPSHOT_BINDING_INVALID');

  let sale: JsonObject | null = null;
  let artwork: JsonObject | null = null;
  try { sale = object(JSON.parse(saleRaw)); } catch { failures.push('SALE_JSON_INVALID'); }
  try { artwork = object(JSON.parse(objectRaw)); } catch { failures.push('OBJECT_JSON_INVALID'); }
  if (!sale || !artwork) return rejected(failures);

  const saleClassIds = array(sale.classified_as).map(object).filter((item): item is JsonObject => Boolean(item))
    .map((item) => String(item.id ?? ''));
  if (sale.id !== saleRecordId || sale.type !== 'Activity' || sale._label !== 'Knoedler Sale of Stock Number A1983 (1938-09-01)' ||
      !saleClassIds.includes(purchaseTypeId) || !saleClassIds.includes(provenanceTypeId)) failures.push('SALE_ACTIVITY_SEMANTICS_INVALID');

  const timespan = object(sale.timespan);
  if (timespan?._label !== '1938-09-00' || timespan?.begin_of_the_begin !== '1938-09-01T00:00:00Z' ||
      timespan?.end_of_the_end !== '1938-10-01T23:59:59Z') failures.push('MONTH_PRECISION_TIMESPAN_INVALID');

  const parts = array(sale.part).map(object).filter((item): item is JsonObject => Boolean(item));
  const assignment = parts.find((item) => item.type === 'AttributeAssignment');
  const assigned = array(assignment?.assigned).map(object).filter((item): item is JsonObject => Boolean(item));
  const money = assigned.find((item) => item.type === 'MonetaryAmount');
  const currency = object(money?.currency);
  if (money?.value !== 1471.13 || currency?.id !== sterlingCurrencyId || currency?.type !== 'Currency') {
    failures.push('DOCUMENTED_TRANSACTION_AMOUNT_INVALID');
  }

  const acquisition = parts.find((item) => item.type === 'Acquisition');
  const titleObjects = array(acquisition?.transferred_title_of).map(object).filter((item): item is JsonObject => Boolean(item));
  const transferredFrom = array(acquisition?.transferred_title_from).map(object).filter((item): item is JsonObject => Boolean(item))
    .map((item) => String(item.id ?? '')).filter(Boolean);
  const transferredTo = array(acquisition?.transferred_title_to).map(object).filter((item): item is JsonObject => Boolean(item))
    .map((item) => String(item.id ?? '')).filter(Boolean);
  if (!titleObjects.some((item) => item.id === objectRecordId && item.type === 'HumanMadeObject') ||
      transferredFrom.length === 0 || transferredTo.length === 0) failures.push('TITLE_TRANSFER_LINEAGE_INVALID');

  const objectClassIds = array(artwork.classified_as).map(object).filter((item): item is JsonObject => Boolean(item))
    .map((item) => String(item.id ?? ''));
  const identifiers = array(artwork.identified_by).map(object).filter((item): item is JsonObject => Boolean(item));
  const stockIdentifier = identifiers.find((item) => item.content === 'A1983' && array(item.classified_as).map(object)
    .filter((type): type is JsonObject => Boolean(type)).some((type) => type.id === stockNumberTypeId));
  if (artwork.id !== objectRecordId || artwork.type !== 'HumanMadeObject' || artwork._label !== 'James Christie' ||
      !objectClassIds.includes(paintingTypeId) || stockIdentifier?.content !== 'A1983') failures.push('OBJECT_IDENTITY_INVALID');

  if (failures.length > 0) return rejected(failures);
  const objectIdentifiers = uniqueSorted(identifiers.map((item) => String(item.content ?? '')).filter(Boolean));
  const normalized: GettyHistoricalTransactionRecord = {
    schema_version: 'historical-transaction-provenance-v1',
    evidence_class: 'HISTORICAL_TRANSACTION_PROVENANCE',
    source_id: 'getty-provenance-index',
    source_owner_id: 'j-paul-getty-trust',
    factual_origin_id: 'knoedler-stock-book-a1983',
    source_record_id: saleRecordId.split('/').at(-1)!,
    source_record_url: saleRecordId,
    canonical_entity_id: `human-made-object:${objectRecordId.split('/').at(-1)}`,
    object_record_url: objectRecordId,
    object_label: 'James Christie',
    object_type: 'PAINTING',
    object_identifiers: objectIdentifiers,
    activity_label: String(sale._label),
    activity_classification_ids: uniqueSorted(saleClassIds),
    transaction_state: 'DOCUMENTED_TITLE_TRANSFER',
    event_date_label: '1938-09-00',
    event_window_start_at: '1938-09-01T00:00:00Z',
    event_window_end_at: '1938-10-01T23:59:59Z',
    event_time_precision: 'MONTH',
    documented_transaction_amount: 1471.13,
    currency: 'GBP',
    currency_authority_id: sterlingCurrencyId,
    amount_semantics: 'DOCUMENTED_TRANSACTION_AMOUNT_NOT_HAMMER_OR_CURRENT_PRICE',
    transferred_title_from_ids: uniqueSorted(transferredFrom),
    transferred_title_to_ids: uniqueSorted(transferredTo),
    raw_sale_snapshot_sha256: saleHash,
    raw_object_snapshot_sha256: objectHash,
    rights_basis: 'CC0',
    rights_evidence_refs: uniqueSorted(rights.evidence_refs),
    provenance_refs: uniqueSorted([saleRecordId, objectRecordId, saleBinding.path, objectBinding.path]),
    current_market_signal_eligible: false,
    current_price_eligible: false,
    liquidity_eligible: false,
    demand_eligible: false,
    generic_market_event_eligible: false,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
  return {
    source_id: 'getty-provenance-index',
    adapter_state: 'REFERENCE_REPLAY_CONTROL_ONLY',
    decision_state: 'NORMALIZED_REFERENCE_REPLAY_NOT_ADMISSIBLE',
    reason_codes: [],
    normalized_record: normalized,
    committed_reference_snapshots_verified: 2,
    immutable_live_snapshots_verified: 0,
    machine_proven_acquisition_receipts: 0,
    purpose_specific_rights_verified: true,
    historical_transaction_evidence_ready: false,
    promotable: false,
    generic_market_event_created: false,
    verified_current_sold_event_created: false,
    current_price_created: false,
    liquidity_created: false,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}
