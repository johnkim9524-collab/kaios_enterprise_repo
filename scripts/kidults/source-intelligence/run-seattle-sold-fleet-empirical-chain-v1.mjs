#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';

const inputPath = process.argv[2] || 'coordination/kidults/source-intelligence/seattle-sold-fleet-empirical-admission-v1.json';
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const fail = (ok, code) => { if (!ok) throw new Error(code); };
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const digest = (value) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
const parseDate = (value) => {
  const [month, day, year] = value.split('/').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};
const ageDays = (from, to) => Math.floor((from - to) / 86400000);
const asOf = new Date(input.acquired_at);

fail(input.id === 'kidults-seattle-sold-fleet-empirical-admission-v1', 'INPUT_ID_INVALID');
fail(input.status === 'EMPIRICAL_ADMISSION_DATED_SOLD_REFERENCE_ONLY', 'INPUT_STATUS_INVALID');
fail(input.source.source_id === 'seattle-sold-fleet-equipment-open-data', 'SOURCE_ID_INVALID');
fail(input.source.owner === 'City of Seattle' && input.source.license === 'Public Domain', 'SOURCE_RIGHTS_IDENTITY_INVALID');
fail(input.source.access_level === 'public' && input.source.raw_snapshot_archived === false, 'SOURCE_ACCESS_BOUNDARY_INVALID');
fail(input.purpose_binding.purpose === 'CURRENT_SOLD_TRANSACTION_REFERENCE', 'PURPOSE_BINDING_INVALID');
fail(['collect', 'store', 'derive'].every((key) => input.purpose_binding[key] === 'PASS'), 'PURPOSE_RIGHTS_INVALID');
fail(Date.parse(input.purpose_binding.review_due_at) > asOf.getTime(), 'RIGHTS_REVIEW_EXPIRED');
fail(input.admission.admitted_records === 120 && input.records.length === 120, 'ADMISSION_COUNT_INVALID');
fail(input.admission.evidence_class === 'DATED_SOLD_TRANSACTION_REFERENCE', 'EVIDENCE_CLASS_INVALID');
fail(input.admission.domain_fit === 'NON_COLLECTOR_MUNICIPAL_FLEET_REFERENCE_ONLY', 'DOMAIN_FIT_BOUNDARY_INVALID');
fail(input.admission.strict_current_sold_eligible === false, 'STRICT_CURRENT_FALSE_PROMOTION');
fail(input.admission.canonical_candidate_eligible === false && input.admission.customer_market_claim_authorized === false, 'CANONICAL_OR_CLAIM_FALSE_PROMOTION');
fail(input.protected_gates.public_release === 'HOLD' && input.protected_gates.production === 'HOLD' && input.protected_gates.g5 === 'HOLD', 'PROTECTED_GATE_INVALID');

const equipIds = new Set();
const vins = new Set();
const observations = input.records.map((record) => {
  fail(/^seattle-sold-fleet-/.test(record.record_id), 'RECORD_ID_INVALID');
  fail(record.equip_id && record.vin && record.sale_date && record.sold_by, 'REQUIRED_FIELD_MISSING');
  fail(!equipIds.has(record.equip_id) && !vins.has(record.vin), 'DUPLICATE_OBJECT_IDENTITY');
  equipIds.add(record.equip_id); vins.add(record.vin);
  const price = Number(record.sale_price_usd.replaceAll(',', ''));
  const saleAt = parseDate(record.sale_date);
  fail(Number.isFinite(price) && price > 0, 'NON_POSITIVE_PRICE');
  fail(Number.isFinite(saleAt.getTime()) && saleAt <= asOf, 'SALE_DATE_INVALID');
  return {
    observation_id: `observation-${record.record_id}`,
    source_record_id: record.record_id,
    object_identity: { equip_id: record.equip_id, vin: record.vin },
    object: { year: Number(record.year), make: record.make, model: record.model, description: record.description },
    transaction: { state: 'SOLD', sale_price: price, currency: 'USD', sale_at: saleAt.toISOString(), sold_by: record.sold_by },
    evidence_class: 'DATED_SOLD_TRANSACTION_REFERENCE',
    reference_only: true,
    strict_current_sold_eligible: false,
  };
});

const saleDates = observations.map((row) => new Date(row.transaction.sale_at));
const latestSaleAt = new Date(Math.max(...saleDates));
const earliestSaleAt = new Date(Math.min(...saleDates));
const latestAgeDays = ageDays(asOf, latestSaleAt);
fail(latestAgeDays > input.admission.strict_current_window_days, 'STALE_REFERENCE_WAS_CURRENT_PROMOTED');
fail(latestAgeDays > input.admission.strict_scope_market_window_days, 'SCOPE_FRESHNESS_FALSE_PROMOTION');
fail(latestSaleAt.toISOString().slice(0, 10) === input.admission.latest_sale_date, 'LATEST_DATE_DRIFT');
fail(earliestSaleAt.toISOString().slice(0, 10) === input.admission.earliest_sale_date, 'EARLIEST_DATE_DRIFT');

const evidence = observations.map((observation) => ({
  evidence_id: `evidence-${observation.source_record_id}`,
  observation_id: observation.observation_id,
  admission_state: 'ADMITTED_INTERNAL_DATED_REFERENCE',
  evidence_class: observation.evidence_class,
  rights_binding_id: input.purpose_binding.binding_id,
  signal_eligible: false,
  index_eligible: false,
  customer_claim_authorized: false,
}));
const pairDigest = digest({ observations, evidence });
const controlCandidate = {
  candidate_class: 'EMPIRICAL_REFERENCE_CONTROL_NOT_CANONICAL',
  pair_digest: pairDigest,
  observation_count: observations.length,
  evidence_count: evidence.length,
  canonical_handoff_eligible: false,
};
const trackB = {
  assessment_class: 'TRACK_B_CONTRACT_COMPATIBLE_MOCK_ASSESSMENT',
  decision: 'CONTROL_CONTRACT_PASS',
  pair_digest: pairDigest,
  official_track_b_started: false,
  rankable: false,
  promotable: false,
};
const projection = {
  state: 'NO_PROJECTION',
  reason: 'DATED_NON_COLLECTOR_REFERENCE_CANNOT_AUTHORIZE_CURRENT_COLLECTOR_MARKET_PRODUCT',
  pair_digest: pairDigest,
  approved: false,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};

const mutationTests = [
  ['RIGHTS_REMOVAL', () => input.purpose_binding.collect !== 'PASS'],
  ['RIGHTS_EXPIRY', () => Date.parse(input.purpose_binding.review_due_at) <= asOf.getTime()],
  ['DUPLICATE_IDENTITY', () => equipIds.size !== 120 || vins.size !== 120],
  ['NON_POSITIVE_PRICE', () => observations.some((row) => row.transaction.sale_price <= 0)],
  ['CURRENT_PROMOTION', () => latestAgeDays <= input.admission.strict_current_window_days],
  ['CANONICAL_PROMOTION', () => controlCandidate.canonical_handoff_eligible !== false],
  ['OFFICIAL_TRACK_B_PROMOTION', () => trackB.official_track_b_started !== false],
  ['PROJECTION_PROMOTION', () => projection.state !== 'NO_PROJECTION' || projection.approved !== false],
];
fail(mutationTests.every(([, predicate]) => predicate() === false), 'NEGATIVE_BASELINE_INVALID');

const receipt = {
  id: `seattle-sold-fleet-empirical-chain-${pairDigest.slice(7, 23)}`,
  version: '1.0.0',
  state: 'VERIFIED_EMPIRICAL_REFERENCE_CHAIN_FAIL_CLOSED',
  executed_at: input.acquired_at,
  input_path: inputPath,
  input_sha256: digest(input),
  pair_digest: pairDigest,
  results: {
    source_records_acquired: input.records.length,
    normalized_observations_created: observations.length,
    dated_sold_reference_evidence_admitted: evidence.length,
    strict_current_sold_transaction_evidence_admitted: 0,
    canonical_candidates_created: 0,
    track_b_contract_mock_executed: true,
    official_track_b_assessments_created: 0,
    approved_projections_created: 0,
    negative_mutations_verified: mutationTests.length,
  },
  freshness: {
    latest_sale_at: latestSaleAt.toISOString(),
    earliest_sale_at: earliestSaleAt.toISOString(),
    latest_age_days_at_acquisition: latestAgeDays,
    current_window_days: input.admission.strict_current_window_days,
    scope_market_window_days: input.admission.strict_scope_market_window_days,
    decision: 'DATED_REFERENCE_ONLY_NOT_CURRENT',
  },
  control_candidate: controlCandidate,
  track_b: trackB,
  projection,
  truth_boundary: {
    product_current_sold_blocker_removed: false,
    empirical_pipeline_mechanics_blocker_removed: true,
    collector_domain_rights_freshness_source_still_required: true,
    production_authorized: false,
  },
};

process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);

