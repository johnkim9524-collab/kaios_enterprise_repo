import { admitCurrentSoldBatch, canonicalContentDigest } from '../../../scripts/kidults/market/current-sold-engine-v1.mjs';

export const NOW = new Date('2026-09-01T05:00:00.000Z');
export const SOURCE_SHA = '1'.repeat(40);
export const RUN_ID = 'current-sold-run-20260901-001';
export const PROVENANCE = `sha256:${'a'.repeat(64)}`;

export function rawObservation(overrides = {}) {
  return {
    canonical_object_id: 'vehicle:ferrari:f40:1989:example',
    source_id: 'auction_house_a',
    source_event_id: 'lot-42',
    source_url: 'https://example.com/results/lot-42',
    source_owner: 'Auction House A',
    venue: 'Monterey',
    transaction_status: 'SOLD',
    sold_at: '2026-08-30T20:00:00.000Z',
    observed_at: '2026-08-31T00:00:00.000Z',
    realized_consideration: 1800000,
    currency: 'USD',
    hammer_price: null,
    all_in_price: null,
    normalized_price: null,
    normalized_currency: null,
    fee_semantics: 'SOURCE_REPORTED_UNKNOWN_FEE_BASIS',
    lot_or_listing_id: 'lot-42',
    provenance_digest: PROVENANCE,
    acquisition_receipt_id: 'acq-1',
    rights_receipt_id: 'rights-1',
    rights_decision: 'ALLOW_PRIVATE_CURRENT_SOLD',
    confidence: 0.98,
    correction_state: 'ORIGINAL',
    supersedes_event_id: null,
    supersedes_content_digest: null,
    source_sha: SOURCE_SHA,
    canonical_run_id: RUN_ID,
    ...overrides
  };
}

export function sealObservation(value) {
  const copy = structuredClone(value);
  copy.content_digest = canonicalContentDigest(copy, { now: NOW });
  return copy;
}

export function receiptRegistryFor(...inputs) {
  const acquisitions = [];
  const rightsById = new Map();
  for (const input of inputs) {
    acquisitions.push({
      receipt_id: input.acquisition_receipt_id,
      receipt_type: 'ACQUISITION',
      status: 'PASS',
      source_id: input.source_id,
      source_event_id: input.source_event_id,
      source_url: input.source_url,
      provenance_digest: input.provenance_digest,
      content_digest: input.content_digest,
      source_sha: input.source_sha,
      canonical_run_id: input.canonical_run_id
    });
    rightsById.set(input.rights_receipt_id, {
      receipt_id: input.rights_receipt_id,
      receipt_type: 'RIGHTS',
      status: 'PASS',
      source_id: input.source_id,
      decision: 'ALLOW_PRIVATE_CURRENT_SOLD',
      purpose: 'PRIVATE_CURRENT_SOLD',
      source_sha: input.source_sha,
      canonical_run_id: input.canonical_run_id,
      valid_from: '2026-01-01T00:00:00.000Z',
      valid_until: '2026-12-31T23:59:59.999Z'
    });
  }
  return {
    schema_version: 'current-sold-receipt-registry-v1',
    acquisitions,
    rights: [...rightsById.values()]
  };
}

export function admittedFixture(overrides = {}) {
  const input = sealObservation(rawObservation(overrides));
  const receiptRegistry = receiptRegistryFor(input);
  const admission = admitCurrentSoldBatch([input], { now: NOW, receiptRegistry });
  if (admission.status !== 'PASS' || admission.admitted_count !== 1) {
    throw new Error('CURRENT_SOLD_TEST_FIXTURE_ADMISSION_FAILED');
  }
  return { input, receiptRegistry, admission, event: admission.admitted[0] };
}

export function batchEnvelope(observations, overrides = {}) {
  return {
    schema_version: 'current-sold-batch-envelope-v1',
    batch_id: 'current-sold-batch-20260901-001',
    created_at: '2026-09-01T05:00:00.000Z',
    source_sha: SOURCE_SHA,
    canonical_run_id: RUN_ID,
    observations,
    ...overrides
  };
}
