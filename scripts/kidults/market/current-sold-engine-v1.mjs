import crypto from 'node:crypto';

const SOLD = 'SOLD';
const ALLOW = 'ALLOW_PRIVATE_CURRENT_SOLD';
const CURRENT_MAX_AGE_DAYS = 30;

function required(name, value) {
  if (value === undefined || value === null || value === '') throw new Error(`CURRENT_SOLD_MISSING_${name.toUpperCase()}`);
  return value;
}

function iso(value, name) {
  const v = required(name, value);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`CURRENT_SOLD_INVALID_${name.toUpperCase()}`);
  return d.toISOString();
}

function positiveNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`CURRENT_SOLD_INVALID_${name.toUpperCase()}`);
  return value;
}

function sourceDigest(input) {
  const material = JSON.stringify({
    source_id: input.source_id,
    source_event_id: input.source_event_id,
    source_url: input.source_url,
    transaction_status: input.transaction_status,
    sold_at: input.sold_at,
    realized_consideration: input.realized_consideration,
    currency: input.currency,
    provenance_digest: input.provenance_digest
  });
  return crypto.createHash('sha256').update(material).digest('hex');
}

export function canonicalEventId(input) {
  return `cs_${sourceDigest(input).slice(0, 24)}`;
}

export function normalizeCurrentSoldObservation(input, { now = new Date() } = {}) {
  required('canonical_object_id', input.canonical_object_id);
  required('source_id', input.source_id);
  required('source_event_id', input.source_event_id);
  const sourceUrl = required('source_url', input.source_url);
  if (!sourceUrl.startsWith('https://')) throw new Error('CURRENT_SOLD_SOURCE_URL_NOT_HTTPS');
  required('source_owner', input.source_owner);
  required('venue', input.venue);
  if (input.transaction_status !== SOLD) throw new Error('CURRENT_SOLD_NOT_TERMINAL_SOLD');
  const soldAt = iso(input.sold_at, 'sold_at');
  const observedAt = iso(input.observed_at ?? now.toISOString(), 'observed_at');
  const soldMs = new Date(soldAt).getTime();
  const observedMs = new Date(observedAt).getTime();
  if (observedMs < soldMs) throw new Error('CURRENT_SOLD_OBSERVED_BEFORE_SALE');
  const ageDays = (now.getTime() - soldMs) / 86400000;
  if (ageDays < -1 / 24) throw new Error('CURRENT_SOLD_SALE_IN_FUTURE');
  if (ageDays > CURRENT_MAX_AGE_DAYS) throw new Error('CURRENT_SOLD_NOT_CURRENT');
  const realized = positiveNumber(input.realized_consideration, 'realized_consideration');
  const currency = required('currency', input.currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('CURRENT_SOLD_INVALID_CURRENCY');
  if (!['HAMMER', 'ALL_IN', 'SOURCE_REPORTED_UNKNOWN_FEE_BASIS'].includes(input.fee_semantics)) throw new Error('CURRENT_SOLD_INVALID_FEE_SEMANTICS');
  if (!/^sha256:[a-f0-9]{64}$/.test(required('provenance_digest', input.provenance_digest))) throw new Error('CURRENT_SOLD_INVALID_PROVENANCE_DIGEST');
  required('acquisition_receipt_id', input.acquisition_receipt_id);
  required('rights_receipt_id', input.rights_receipt_id);
  if (input.rights_decision !== ALLOW) throw new Error('CURRENT_SOLD_RIGHTS_NOT_ALLOWED');
  const confidence = input.confidence ?? 1;
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) throw new Error('CURRENT_SOLD_INVALID_CONFIDENCE');
  return {
    event_id: canonicalEventId(input),
    canonical_object_id: input.canonical_object_id,
    source_id: input.source_id,
    source_event_id: input.source_event_id,
    source_url: sourceUrl,
    source_owner: input.source_owner,
    venue: input.venue,
    transaction_status: SOLD,
    sold_at: soldAt,
    observed_at: observedAt,
    realized_consideration: realized,
    currency,
    hammer_price: input.hammer_price ?? null,
    all_in_price: input.all_in_price ?? null,
    normalized_price: input.normalized_price ?? null,
    normalized_currency: input.normalized_currency ?? null,
    fee_semantics: input.fee_semantics,
    lot_or_listing_id: input.lot_or_listing_id ?? null,
    provenance_digest: input.provenance_digest,
    acquisition_receipt_id: input.acquisition_receipt_id,
    rights_receipt_id: input.rights_receipt_id,
    rights_decision: ALLOW,
    confidence,
    correction_state: input.correction_state ?? 'ORIGINAL',
    supersedes_event_id: input.supersedes_event_id ?? null,
    source_sha: input.source_sha ?? null,
    canonical_run_id: input.canonical_run_id ?? null
  };
}

export function admitCurrentSoldBatch(observations, options = {}) {
  if (!Array.isArray(observations)) throw new Error('CURRENT_SOLD_BATCH_NOT_ARRAY');
  const byEvent = new Map();
  const bySourceIdentity = new Map();
  const rejected = [];
  for (const raw of observations) {
    try {
      const event = normalizeCurrentSoldObservation(raw, options);
      const sourceKey = `${event.source_id}::${event.source_event_id}`;
      const priorForSource = bySourceIdentity.get(sourceKey);
      if (priorForSource && priorForSource.provenance_digest !== event.provenance_digest) {
        throw new Error('CURRENT_SOLD_SOURCE_IDENTITY_CONFLICT');
      }
      bySourceIdentity.set(sourceKey, event);
      byEvent.set(event.event_id, event);
    } catch (error) {
      rejected.push({ source_id: raw?.source_id ?? null, source_event_id: raw?.source_event_id ?? null, reason: error.message });
    }
  }
  const admitted = [...byEvent.values()].sort((a, b) => a.event_id.localeCompare(b.event_id));
  return {
    engine: 'KIDULTS_CURRENT_SOLD_ENGINE_V1',
    status: rejected.length ? 'PARTIAL_FAIL_CLOSED' : 'PASS',
    admitted_count: admitted.length,
    rejected_count: rejected.length,
    admitted,
    rejected,
    claim_boundary: {
      owned_intelligence_product: true,
      external_sources_are_replaceable_evidence_layers: true,
      public: 'HOLD',
      production: 'HOLD',
      g5: 'HOLD'
    }
  };
}
