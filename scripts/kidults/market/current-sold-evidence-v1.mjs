import crypto from 'node:crypto';
import { verifyCanonicalCurrentSoldEvent } from './current-sold-engine-v1.mjs';

const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const EVENT_ID_RE = /^cs_[a-f0-9]{24}$/;
const SOURCE_SHA_RE = /^[a-f0-9]{40}$/;
const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$/;

function fail(code) {
  throw new Error(code);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')}`;
}

function requirePattern(value, pattern, code) {
  if (typeof value !== 'string' || !pattern.test(value)) fail(code);
  return value;
}

function requireString(value, code) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) fail(code);
  return value;
}

export function canonicalCurrentSoldFactId(event) {
  requirePattern(event?.event_id, EVENT_ID_RE, 'CURRENT_SOLD_EVIDENCE_INVALID_EVENT_ID');
  requirePattern(event?.content_digest, SHA256_RE, 'CURRENT_SOLD_EVIDENCE_INVALID_CONTENT_DIGEST');
  return `evf_cs_${digest({
    evidence_type: 'SOLD_TRANSACTION_PRICE',
    event_id: event.event_id,
    content_digest: event.content_digest
  }).slice(7, 31)}`;
}

export function canonicalCurrentSoldEvidenceId(event) {
  const factId = canonicalCurrentSoldFactId(event);
  requirePattern(event?.source_sha, SOURCE_SHA_RE, 'CURRENT_SOLD_EVIDENCE_INVALID_SOURCE_SHA');
  requirePattern(event?.canonical_run_id, RUN_ID_RE, 'CURRENT_SOLD_EVIDENCE_INVALID_CANONICAL_RUN_ID');
  requireString(event?.acquisition_receipt_id, 'CURRENT_SOLD_EVIDENCE_ACQUISITION_RECEIPT_REQUIRED');
  requireString(event?.rights_receipt_id, 'CURRENT_SOLD_EVIDENCE_RIGHTS_RECEIPT_REQUIRED');
  return `ev_cs_${digest({
    fact_id: factId,
    source_sha: event.source_sha,
    canonical_run_id: event.canonical_run_id,
    acquisition_receipt_id: event.acquisition_receipt_id,
    rights_receipt_id: event.rights_receipt_id
  }).slice(7, 31)}`;
}

export function currentSoldEventToEvidence(input) {
  let event;
  try {
    event = verifyCanonicalCurrentSoldEvent(input);
  } catch (error) {
    fail(`CURRENT_SOLD_EVIDENCE_${error.message.replace(/^CURRENT_SOLD_/, '')}`);
  }
  requirePattern(event.source_sha, SOURCE_SHA_RE, 'CURRENT_SOLD_EVIDENCE_INVALID_SOURCE_SHA');
  requirePattern(event.canonical_run_id, RUN_ID_RE, 'CURRENT_SOLD_EVIDENCE_INVALID_CANONICAL_RUN_ID');
  requireString(event.acquisition_receipt_id, 'CURRENT_SOLD_EVIDENCE_ACQUISITION_RECEIPT_REQUIRED');
  requireString(event.rights_receipt_id, 'CURRENT_SOLD_EVIDENCE_RIGHTS_RECEIPT_REQUIRED');
  requirePattern(event.provenance_digest, SHA256_RE, 'CURRENT_SOLD_EVIDENCE_INVALID_PROVENANCE_DIGEST');

  return {
    schema_version: 'current-sold-evidence-v1',
    evidence_id: canonicalCurrentSoldEvidenceId(event),
    fact_id: canonicalCurrentSoldFactId(event),
    evidence_type: 'SOLD_TRANSACTION_PRICE',
    canonical_object_id: event.canonical_object_id,
    assertion: {
      predicate: 'REALIZED_SALE',
      transaction_status: 'SOLD',
      sold_at: event.sold_at,
      observed_at: event.observed_at,
      realized_consideration: event.realized_consideration,
      currency: event.currency,
      hammer_price: event.hammer_price,
      all_in_price: event.all_in_price,
      normalized_price: event.normalized_price,
      normalized_currency: event.normalized_currency,
      fee_semantics: event.fee_semantics,
      venue: event.venue
    },
    lineage: {
      current_sold_event_id: event.event_id,
      current_sold_content_digest: event.content_digest,
      source_id: event.source_id,
      source_event_id: event.source_event_id,
      source_url: event.source_url,
      source_owner: event.source_owner,
      lot_or_listing_id: event.lot_or_listing_id,
      provenance_digest: event.provenance_digest,
      acquisition_receipt_id: event.acquisition_receipt_id,
      rights_receipt_id: event.rights_receipt_id,
      source_sha: event.source_sha,
      canonical_run_id: event.canonical_run_id
    },
    correction: {
      state: event.correction_state,
      supersedes_event_id: event.supersedes_event_id,
      supersedes_content_digest: event.supersedes_content_digest
    },
    admission: {
      state: 'ADMITTED',
      confidence: event.confidence,
      claim_ceiling: 'PRIVATE_INTERNAL_CURRENT_SOLD',
      public: 'HOLD',
      production: 'HOLD',
      g5: 'HOLD'
    }
  };
}

export function transformCurrentSoldEventsToEvidence(events) {
  if (!Array.isArray(events)) fail('CURRENT_SOLD_EVIDENCE_BATCH_NOT_ARRAY');
  const byId = new Map();
  for (const event of events) {
    const evidence = currentSoldEventToEvidence(event);
    const prior = byId.get(evidence.evidence_id);
    if (prior && digest(prior) !== digest(evidence)) fail('CURRENT_SOLD_EVIDENCE_ID_COLLISION');
    byId.set(evidence.evidence_id, evidence);
  }
  return [...byId.values()].sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
}

export function currentSoldEvidenceDigest(evidence) {
  if (!Array.isArray(evidence)) fail('CURRENT_SOLD_EVIDENCE_BATCH_NOT_ARRAY');
  return digest([...evidence].sort((a, b) => a.evidence_id.localeCompare(b.evidence_id)));
}
