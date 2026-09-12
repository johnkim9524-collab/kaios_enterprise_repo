import crypto from 'node:crypto';

const SOLD = 'SOLD';
const ALLOW = 'ALLOW_PRIVATE_CURRENT_SOLD';
const RIGHTS_PURPOSE = 'PRIVATE_CURRENT_SOLD';
const CURRENT_MAX_AGE_DAYS = 30;
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const SOURCE_SHA_RE = /^[a-f0-9]{40}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$/;
const FEE_SEMANTICS = new Set(['HAMMER', 'ALL_IN', 'SOURCE_REPORTED_UNKNOWN_FEE_BASIS']);
const CORRECTION_STATES = new Set(['ORIGINAL', 'CORRECTED']);

function fail(code) {
  throw new Error(code);
}

function requiredString(name, value) {
  if (typeof value !== 'string' || value.length === 0) fail(`CURRENT_SOLD_MISSING_${name.toUpperCase()}`);
  if (value.trim() !== value) fail(`CURRENT_SOLD_INVALID_${name.toUpperCase()}`);
  return value;
}

function iso(value, name) {
  const raw = requiredString(name, value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) fail(`CURRENT_SOLD_INVALID_${name.toUpperCase()}`);
  return date.toISOString();
}

function positiveNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    fail(`CURRENT_SOLD_INVALID_${name.toUpperCase()}`);
  }
  return value;
}

function optionalPositiveNumber(value, name) {
  if (value === undefined || value === null) return null;
  return positiveNumber(value, name);
}

function currencyCode(value, name) {
  const raw = requiredString(name, value);
  if (!CURRENCY_RE.test(raw)) fail(`CURRENT_SOLD_INVALID_${name.toUpperCase()}`);
  return raw;
}

function optionalCurrencyCode(value, name) {
  if (value === undefined || value === null) return null;
  return currencyCode(value, name);
}

function httpsUrl(value) {
  const raw = requiredString('source_url', value);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail('CURRENT_SOLD_INVALID_SOURCE_URL');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    fail('CURRENT_SOLD_INVALID_SOURCE_URL');
  }
  return raw;
}

function sha256Digest(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function assertDigest(value, name) {
  const raw = requiredString(name, value);
  if (!SHA256_RE.test(raw)) fail(`CURRENT_SOLD_INVALID_${name.toUpperCase()}`);
  return raw;
}

function assertSourceSha(value) {
  const raw = requiredString('source_sha', value);
  if (!SOURCE_SHA_RE.test(raw)) fail('CURRENT_SOLD_INVALID_SOURCE_SHA');
  return raw;
}

function assertCanonicalRunId(value) {
  const raw = requiredString('canonical_run_id', value);
  if (!RUN_ID_RE.test(raw)) fail('CURRENT_SOLD_INVALID_CANONICAL_RUN_ID');
  return raw;
}

function receiptCollection(registry, kind) {
  if (!registry || typeof registry !== 'object') fail('CURRENT_SOLD_RECEIPT_REGISTRY_REQUIRED');
  const value = registry[kind];
  if (!value) fail(`CURRENT_SOLD_${kind.toUpperCase()}_REGISTRY_REQUIRED`);
  return value;
}

function findReceipt(registry, kind, receiptId) {
  const collection = receiptCollection(registry, kind);
  if (collection instanceof Map) return collection.get(receiptId) ?? null;
  if (Array.isArray(collection)) return collection.find(row => row?.receipt_id === receiptId) ?? null;
  if (typeof collection === 'object') return collection[receiptId] ?? null;
  fail(`CURRENT_SOLD_INVALID_${kind.toUpperCase()}_REGISTRY`);
}

function exactBinding(receipt, field, expected, errorCode) {
  if (receipt?.[field] !== expected) fail(errorCode);
}

function normalizePrices(input) {
  const realized = positiveNumber(input.realized_consideration, 'realized_consideration');
  const currency = currencyCode(input.currency, 'currency');
  const hammer = optionalPositiveNumber(input.hammer_price, 'hammer_price');
  const allIn = optionalPositiveNumber(input.all_in_price, 'all_in_price');
  const normalized = optionalPositiveNumber(input.normalized_price, 'normalized_price');
  const normalizedCurrency = optionalCurrencyCode(input.normalized_currency, 'normalized_currency');
  const fee = requiredString('fee_semantics', input.fee_semantics);

  if (!FEE_SEMANTICS.has(fee)) fail('CURRENT_SOLD_INVALID_FEE_SEMANTICS');
  if ((normalized === null) !== (normalizedCurrency === null)) fail('CURRENT_SOLD_NORMALIZED_PRICE_CURRENCY_PAIR_REQUIRED');
  if (hammer !== null && allIn !== null && allIn < hammer) fail('CURRENT_SOLD_ALL_IN_BELOW_HAMMER');
  if (fee === 'HAMMER' && (hammer === null || hammer !== realized)) fail('CURRENT_SOLD_HAMMER_SEMANTICS_MISMATCH');
  if (fee === 'ALL_IN' && (allIn === null || allIn !== realized)) fail('CURRENT_SOLD_ALL_IN_SEMANTICS_MISMATCH');

  return {
    realized_consideration: realized,
    currency,
    hammer_price: hammer,
    all_in_price: allIn,
    normalized_price: normalized,
    normalized_currency: normalizedCurrency,
    fee_semantics: fee
  };
}

function normalizeCorrection(input, eventId) {
  const state = input.correction_state ?? 'ORIGINAL';
  if (!CORRECTION_STATES.has(state)) fail('CURRENT_SOLD_INVALID_CORRECTION_STATE');
  const supersedesEventId = input.supersedes_event_id ?? null;
  const supersedesContentDigest = input.supersedes_content_digest ?? null;

  if (state === 'ORIGINAL') {
    if (supersedesEventId !== null || supersedesContentDigest !== null) {
      fail('CURRENT_SOLD_ORIGINAL_CANNOT_SUPERSEDE');
    }
  } else {
    if (supersedesEventId !== eventId) fail('CURRENT_SOLD_CORRECTION_EVENT_ID_MISMATCH');
    if (!SHA256_RE.test(supersedesContentDigest ?? '')) fail('CURRENT_SOLD_CORRECTION_DIGEST_REQUIRED');
  }

  return {
    correction_state: state,
    supersedes_event_id: supersedesEventId,
    supersedes_content_digest: supersedesContentDigest
  };
}

function normalizeCore(input, { now = new Date() } = {}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) fail('CURRENT_SOLD_INVALID_NOW');
  const canonicalObjectId = requiredString('canonical_object_id', input.canonical_object_id);
  const sourceId = requiredString('source_id', input.source_id);
  const sourceEventId = requiredString('source_event_id', input.source_event_id);
  const sourceUrl = httpsUrl(input.source_url);
  const sourceOwner = requiredString('source_owner', input.source_owner);
  const venue = requiredString('venue', input.venue);
  if (input.transaction_status !== SOLD) fail('CURRENT_SOLD_NOT_TERMINAL_SOLD');

  const soldAt = iso(input.sold_at, 'sold_at');
  const observedAt = iso(input.observed_at ?? now.toISOString(), 'observed_at');
  const soldMs = new Date(soldAt).getTime();
  const observedMs = new Date(observedAt).getTime();
  if (observedMs < soldMs) fail('CURRENT_SOLD_OBSERVED_BEFORE_SALE');
  const ageDays = (now.getTime() - soldMs) / 86400000;
  if (ageDays < -1 / 24) fail('CURRENT_SOLD_SALE_IN_FUTURE');
  if (ageDays > CURRENT_MAX_AGE_DAYS) fail('CURRENT_SOLD_NOT_CURRENT');

  const eventId = canonicalEventId({ source_id: sourceId, source_event_id: sourceEventId });
  const price = normalizePrices(input);
  const provenanceDigest = assertDigest(input.provenance_digest, 'provenance_digest');
  const sourceSha = assertSourceSha(input.source_sha);
  const canonicalRunId = assertCanonicalRunId(input.canonical_run_id);
  const correction = normalizeCorrection(input, eventId);
  const confidence = input.confidence ?? 1;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    fail('CURRENT_SOLD_INVALID_CONFIDENCE');
  }

  return {
    event_id: eventId,
    canonical_object_id: canonicalObjectId,
    source_id: sourceId,
    source_event_id: sourceEventId,
    source_url: sourceUrl,
    source_owner: sourceOwner,
    venue,
    transaction_status: SOLD,
    sold_at: soldAt,
    observed_at: observedAt,
    ...price,
    lot_or_listing_id: input.lot_or_listing_id ?? null,
    provenance_digest: provenanceDigest,
    acquisition_receipt_id: requiredString('acquisition_receipt_id', input.acquisition_receipt_id),
    rights_receipt_id: requiredString('rights_receipt_id', input.rights_receipt_id),
    rights_decision: input.rights_decision,
    confidence,
    ...correction,
    source_sha: sourceSha,
    canonical_run_id: canonicalRunId
  };
}

function contentMaterial(event) {
  return {
    canonical_object_id: event.canonical_object_id,
    source_id: event.source_id,
    source_event_id: event.source_event_id,
    venue: event.venue,
    transaction_status: event.transaction_status,
    sold_at: event.sold_at,
    realized_consideration: event.realized_consideration,
    currency: event.currency,
    hammer_price: event.hammer_price,
    all_in_price: event.all_in_price,
    normalized_price: event.normalized_price,
    normalized_currency: event.normalized_currency,
    fee_semantics: event.fee_semantics,
    lot_or_listing_id: event.lot_or_listing_id,
    correction_state: event.correction_state,
    supersedes_event_id: event.supersedes_event_id,
    supersedes_content_digest: event.supersedes_content_digest
  };
}

function validateReceipts(event, contentDigest, receiptRegistry) {
  const acquisition = findReceipt(receiptRegistry, 'acquisitions', event.acquisition_receipt_id);
  if (!acquisition) fail('CURRENT_SOLD_ACQUISITION_RECEIPT_NOT_REGISTERED');
  if (acquisition.receipt_type !== 'ACQUISITION' || acquisition.status !== 'PASS') {
    fail('CURRENT_SOLD_ACQUISITION_RECEIPT_NOT_PASS');
  }
  exactBinding(acquisition, 'source_id', event.source_id, 'CURRENT_SOLD_ACQUISITION_SOURCE_BINDING_MISMATCH');
  exactBinding(acquisition, 'source_event_id', event.source_event_id, 'CURRENT_SOLD_ACQUISITION_EVENT_BINDING_MISMATCH');
  exactBinding(acquisition, 'source_url', event.source_url, 'CURRENT_SOLD_ACQUISITION_URL_BINDING_MISMATCH');
  exactBinding(acquisition, 'provenance_digest', event.provenance_digest, 'CURRENT_SOLD_ACQUISITION_PROVENANCE_BINDING_MISMATCH');
  exactBinding(acquisition, 'content_digest', contentDigest, 'CURRENT_SOLD_ACQUISITION_CONTENT_BINDING_MISMATCH');
  exactBinding(acquisition, 'source_sha', event.source_sha, 'CURRENT_SOLD_ACQUISITION_SOURCE_SHA_MISMATCH');
  exactBinding(acquisition, 'canonical_run_id', event.canonical_run_id, 'CURRENT_SOLD_ACQUISITION_RUN_BINDING_MISMATCH');

  const rights = findReceipt(receiptRegistry, 'rights', event.rights_receipt_id);
  if (!rights) fail('CURRENT_SOLD_RIGHTS_RECEIPT_NOT_REGISTERED');
  if (rights.receipt_type !== 'RIGHTS' || rights.status !== 'PASS') fail('CURRENT_SOLD_RIGHTS_RECEIPT_NOT_PASS');
  exactBinding(rights, 'source_id', event.source_id, 'CURRENT_SOLD_RIGHTS_SOURCE_BINDING_MISMATCH');
  exactBinding(rights, 'decision', ALLOW, 'CURRENT_SOLD_RIGHTS_NOT_ALLOWED');
  exactBinding(rights, 'purpose', RIGHTS_PURPOSE, 'CURRENT_SOLD_RIGHTS_PURPOSE_MISMATCH');
  exactBinding(rights, 'source_sha', event.source_sha, 'CURRENT_SOLD_RIGHTS_SOURCE_SHA_MISMATCH');
  exactBinding(rights, 'canonical_run_id', event.canonical_run_id, 'CURRENT_SOLD_RIGHTS_RUN_BINDING_MISMATCH');

  const rightsEvaluationTime = new Date(event.observed_at);
  if (rights.valid_from && rightsEvaluationTime < new Date(iso(rights.valid_from, 'rights_valid_from'))) {
    fail('CURRENT_SOLD_RIGHTS_NOT_YET_VALID');
  }
  if (rights.valid_until && rightsEvaluationTime > new Date(iso(rights.valid_until, 'rights_valid_until'))) {
    fail('CURRENT_SOLD_RIGHTS_EXPIRED');
  }
}

function rawSourceKey(raw) {
  if (typeof raw?.source_id !== 'string' || typeof raw?.source_event_id !== 'string') return null;
  if (!raw.source_id || !raw.source_event_id) return null;
  return `${raw.source_id}::${raw.source_event_id}`;
}

function publicError(raw, reason, disposition = 'REJECTED') {
  return {
    source_id: raw?.source_id ?? null,
    source_event_id: raw?.source_event_id ?? null,
    canonical_object_id: raw?.canonical_object_id ?? null,
    disposition,
    reason
  };
}

function correctionChain(events) {
  const originals = events.filter(row => row.correction_state === 'ORIGINAL');
  const corrections = events.filter(row => row.correction_state === 'CORRECTED');
  if (originals.length !== 1 || corrections.length === 0) return null;
  let current = originals[0];
  const remaining = new Map(corrections.map(row => [row.content_digest, row]));
  while (remaining.size) {
    const next = [...remaining.values()].filter(row => row.supersedes_content_digest === current.content_digest);
    if (next.length !== 1) return null;
    if (new Date(next[0].observed_at) <= new Date(current.observed_at)) return null;
    current = next[0];
    remaining.delete(current.content_digest);
  }
  return current;
}

export function canonicalEventId(input) {
  const sourceId = requiredString('source_id', input.source_id);
  const sourceEventId = requiredString('source_event_id', input.source_event_id);
  return `cs_${sha256Digest(stableStringify({ source_id: sourceId, source_event_id: sourceEventId })).slice(7, 31)}`;
}

export function canonicalContentDigest(input, options = {}) {
  const derivedNow = options.now ?? (typeof input?.observed_at === 'string' ? new Date(input.observed_at) : new Date());
  const normalized = normalizeCore(input, { ...options, now: derivedNow });
  return sha256Digest(stableStringify(contentMaterial(normalized)));
}

export function verifyCanonicalCurrentSoldEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) fail('CURRENT_SOLD_EVENT_NOT_OBJECT');
  const observedAt = iso(event.observed_at, 'observed_at');
  const normalized = normalizeCore(event, { now: new Date(observedAt) });
  if (event.rights_decision !== ALLOW) fail('CURRENT_SOLD_RIGHTS_NOT_ALLOWED');
  if (event.event_id !== normalized.event_id) fail('CURRENT_SOLD_EVENT_ID_MISMATCH');
  const contentDigest = sha256Digest(stableStringify(contentMaterial(normalized)));
  if (event.content_digest !== contentDigest) fail('CURRENT_SOLD_CONTENT_DIGEST_MISMATCH');
  return { ...normalized, content_digest: contentDigest, rights_decision: ALLOW };
}

export function normalizeCurrentSoldObservation(input, { now = new Date(), receiptRegistry } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('CURRENT_SOLD_OBSERVATION_NOT_OBJECT');
  const event = normalizeCore(input, { now });
  if (event.rights_decision !== ALLOW) fail('CURRENT_SOLD_RIGHTS_NOT_ALLOWED');
  const contentDigest = canonicalContentDigest(event, { now });
  const suppliedDigest = assertDigest(input.content_digest, 'content_digest');
  if (suppliedDigest !== contentDigest) fail('CURRENT_SOLD_CONTENT_DIGEST_MISMATCH');
  if (event.correction_state === 'CORRECTED' && event.supersedes_content_digest === contentDigest) {
    fail('CURRENT_SOLD_CORRECTION_SELF_REFERENCE');
  }
  validateReceipts(event, contentDigest, receiptRegistry);
  return { ...event, content_digest: contentDigest, rights_decision: ALLOW };
}

export function admitCurrentSoldBatch(observations, options = {}) {
  if (!Array.isArray(observations)) fail('CURRENT_SOLD_BATCH_NOT_ARRAY');
  const groups = new Map();
  const rejected = [];
  const quarantined = [];
  const superseded = [];

  for (const raw of observations) {
    const key = rawSourceKey(raw);
    if (!key) {
      try {
        normalizeCurrentSoldObservation(raw, options);
      } catch (error) {
        rejected.push(publicError(raw, error.message));
      }
      continue;
    }
    const rows = groups.get(key) ?? [];
    rows.push(raw);
    groups.set(key, rows);
  }

  const admitted = [];
  for (const rows of groups.values()) {
    const rawObjectIds = new Set(rows.map(row => row?.canonical_object_id).filter(value => typeof value === 'string' && value));
    if (rawObjectIds.size > 1) {
      for (const row of rows) quarantined.push(publicError(row, 'CURRENT_SOLD_OBJECT_IDENTITY_CONFLICT', 'QUARANTINED'));
      continue;
    }

    const normalized = [];
    for (const row of rows) {
      try {
        normalized.push(normalizeCurrentSoldObservation(row, options));
      } catch (error) {
        rejected.push(publicError(row, error.message));
      }
    }
    if (normalized.length === 0) continue;

    const normalizedObjectIds = new Set(normalized.map(row => row.canonical_object_id));
    if (normalizedObjectIds.size > 1) {
      for (const row of rows) quarantined.push(publicError(row, 'CURRENT_SOLD_OBJECT_IDENTITY_CONFLICT', 'QUARANTINED'));
      for (let i = rejected.length - 1; i >= 0; i -= 1) {
        if (rows.some(row => row?.source_id === rejected[i].source_id && row?.source_event_id === rejected[i].source_event_id)) rejected.splice(i, 1);
      }
      continue;
    }

    const byDigest = new Map();
    for (const event of normalized) byDigest.set(event.content_digest, event);
    const versions = [...byDigest.values()];
    if (versions.length === 1) {
      admitted.push(versions[0]);
      continue;
    }

    const latest = correctionChain(versions);
    if (!latest) {
      for (const row of rows) quarantined.push(publicError(row, 'CURRENT_SOLD_CONTENT_IDENTITY_CONFLICT', 'QUARANTINED'));
      for (let i = rejected.length - 1; i >= 0; i -= 1) {
        if (rows.some(row => row?.source_id === rejected[i].source_id && row?.source_event_id === rejected[i].source_event_id)) rejected.splice(i, 1);
      }
      continue;
    }
    admitted.push(latest);
    for (const event of versions) {
      if (event.content_digest !== latest.content_digest) superseded.push(event);
    }
  }

  admitted.sort((a, b) => a.event_id.localeCompare(b.event_id));
  const issueCount = rejected.length + quarantined.length;
  const status = issueCount === 0 ? 'PASS' : admitted.length === 0 ? 'FAIL_CLOSED' : 'PARTIAL_FAIL_CLOSED';
  return {
    engine: 'KIDULTS_CURRENT_SOLD_ENGINE_V1',
    status,
    admitted_count: admitted.length,
    rejected_count: rejected.length,
    quarantined_count: quarantined.length,
    superseded_count: superseded.length,
    admitted,
    rejected,
    quarantined,
    superseded,
    claim_boundary: {
      owned_intelligence_product: true,
      external_sources_are_replaceable_evidence_layers: true,
      batch_admitted_current_sold_count: admitted.length,
      public: 'HOLD',
      production: 'HOLD',
      g5: 'HOLD'
    }
  };
}
