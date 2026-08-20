import assert from 'node:assert/strict';
import {
  canonicalizeGradingEvidence,
  reconcileGradingEvidence,
  canonicalizeMarketEvent,
  deduplicateMarketEvents,
  computeMarketSignals,
  normalizeNumericGrade
} from './provider-independent-layers-v1.mjs';

const allowRights = {
  collect: 'ALLOW', store: 'ALLOW', transform: 'ALLOW', internal_display: 'ALLOW',
  redistribute: 'DENY', retention_days: 90, terms_ref: 'contract:test'
};

function grading(provider, populationTotal) {
  return canonicalizeGradingEvidence({
    grading_evidence_id: `ge-${provider}`,
    provider_id: provider,
    canonical_entity_id: 'card:1999:set:7:subject:variant-a',
    provider_item_id: `${provider}-cert-1`,
    certification_number: `${provider}-001`,
    identity: {year: 1999, set: 'SET', card_number: '7', subject: 'SUBJECT', variant: 'A', language: 'EN'},
    grade: {raw_grade: '9', scale_id: 'TEN_POINT', scale: {min: 0, max: 10, higherIsBetter: true}},
    population: {at_grade: 10, higher: 2, total: populationTotal, scope: 'PROVIDER_CENSUS', as_of: '2026-08-21T00:00:00Z'},
    observed_at: '2026-08-21T00:00:00Z',
    rights: allowRights,
    lineage: {source_owner: provider, source_record_ref: `${provider}:1`, adapter_version: 'test-v1'},
    admission: {confidence: 0.95}
  });
}

assert.equal(normalizeNumericGrade('9', {min: 0, max: 10}), 0.9);
const graderA = grading('GRADER_A', 100);
const graderB = grading('GRADER_B', 200);
assert.equal(graderA.admission.state, 'ADMITTED');
assert.equal(graderB.admission.state, 'ADMITTED');

const reconciled = reconcileGradingEvidence([graderA, graderB]);
assert.equal(reconciled.length, 1);
assert.equal(reconciled[0].provider_censuses.length, 2);
assert.equal(reconciled[0].global_population, null);
assert.equal(reconciled[0].global_population_reason, 'PROVIDER_CENSUSES_ARE_NOT_SUMMED');

const blocked = canonicalizeGradingEvidence({
  ...grading('GRADER_C', 50),
  schema_version: undefined,
  rights: {...allowRights, collect: 'UNKNOWN'},
  lineage: {source_owner: 'GRADER_C', source_record_ref: 'GRADER_C:1', adapter_version: 'test-v1'}
});
assert.equal(blocked.admission.state, 'HOLD');
assert.ok(blocked.admission.reason_codes.includes('RIGHTS_COLLECT_NOT_ALLOWED'));

function soldEvent(sourceFamily, eventId) {
  return {
    schema_version: 'market-event-v1',
    market_event_id: eventId,
    evidence_class: 'VERIFIED_SOLD_EVENT',
    event_state: 'SOLD',
    source_event_id: eventId,
    canonical_entity_id: 'vehicle:vin:TESTVIN1',
    physical_object_id: 'vehicle:vin:TESTVIN1',
    venue_id: 'venue:test-auction',
    event_at: '2026-08-01T12:00:00Z',
    price: {price_type: 'HAMMER', amount: 100000, currency: 'USD'},
    rights: {collect: 'ALLOW', store: 'ALLOW', transform: 'ALLOW'},
    lineage: {evidence_id: `${sourceFamily}:${eventId}`, source_family_id: sourceFamily}
  };
}

const marketA = canonicalizeMarketEvent(soldEvent('SOURCE_OWNER_A', 'a-1'));
const marketB = canonicalizeMarketEvent(soldEvent('SOURCE_OWNER_B', 'b-1'));
assert.equal(marketA.admitted, true);
assert.equal(marketB.admitted, true);
const deduped = deduplicateMarketEvents([marketA, marketB]);
assert.equal(deduped.length, 1);
assert.equal(deduped[0].observation_count, 2);
assert.deepEqual(deduped[0].corroborating_source_owners, ['SOURCE_OWNER_A', 'SOURCE_OWNER_B']);

const signals = computeMarketSignals([marketA, marketB]);
assert.equal(signals.unique_event_count, 1);
assert.equal(signals.sold_event_count, 1);
assert.equal(signals.source_owner_count, 2);
assert.equal(signals.median_sold_price_unconverted, 100000);
assert.equal(signals.liquidity_state, 'NOT_VERIFIED_INSUFFICIENT_EVENTS');

const deniedMarket = canonicalizeMarketEvent({
  ...soldEvent('SOURCE_OWNER_C', 'c-1'),
  rights: {collect: 'ALLOW', store: 'UNKNOWN', transform: 'ALLOW'}
});
assert.equal(deniedMarket.admitted, false);
assert.ok(deniedMarket.admission_errors.includes('RIGHTS_STORE_NOT_ALLOWED'));

console.log(JSON.stringify({
  status: 'PASS',
  grading: {
    provider_independent_normalization: 'PASS',
    censuses_preserved_not_summed: 'PASS',
    unknown_rights_fail_closed: 'PASS'
  },
  market: {
    source_neutral_canonicalization: 'PASS',
    duplicate_republished_event_counts_once: 'PASS',
    corroborating_source_independence_preserved: 'PASS',
    unknown_rights_fail_closed: 'PASS',
    insufficient_liquidity_evidence_not_promoted: 'PASS'
  }
}, null, 2));
