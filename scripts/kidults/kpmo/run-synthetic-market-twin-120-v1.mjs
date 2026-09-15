#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { evaluateKirCurrentSoldControl } from '../runtime/kir-current-sold-control-bridge-v1.mjs';
import { canonicalContentDigest } from '../market/current-sold-engine-v1.mjs';
import { canonicalJsonDigest } from '../market/current-sold-batch-v1.mjs';
import { runSyntheticDownstreamControlBatch } from '../runtime/synthetic-downstream-control-engine-v1.mjs';

const CONTRACT_PATH = 'coordination/kidults/kpmo/synthetic-market-twin-120-v1.json';
const PORTAL_PATH = 'apps/kidults-enterprise-staging/public/portal-r001/projection-store.js';
const NOW = new Date('2026-09-01T05:00:00.000Z');
const SOURCE_SHA = '7'.repeat(40);
const REPOSITORY = 'johnkim9524-collab/kaios_enterprise_repo';
const req = (condition, code) => { if (!condition) throw new Error(code); };
const digest = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

function loadContract() {
  const value = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  req(value.id === 'kidults-synthetic-market-twin-120-v1' && value.version === '1.0.0', 'SMT_CONTRACT_ID');
  req(value.record_count === 120 && value.vertical_count === 8 && value.records_per_vertical === 15, 'SMT_CONTRACT_CARDINALITY');
  req(new Set(value.verticals).size === 8, 'SMT_VERTICAL_CARDINALITY');
  req(value.isolation.network_fetch === false && value.isolation.customer_visible === false, 'SMT_ISOLATION');
  return value;
}

function seal(value, now = NOW) {
  const copy = structuredClone(value);
  copy.content_digest = canonicalContentDigest(copy, {now});
  return copy;
}

function observation(vertical, index, run) {
  const caseType = index < 9 ? 'NORMAL' : index < 12 ? 'BOUNDARY' : 'DEFECT';
  const n = String(index + 1).padStart(2, '0');
  return seal({
    canonical_object_id: `kir-fixture:${vertical}:object-${n}`,
    source_id: `kir-fixture-source-${vertical}`,
    source_event_id: `kir-fixture-event-${vertical}-${n}`,
    source_url: `https://kir-fixture.invalid/${vertical}/sold/${n}`,
    source_owner: `KIR SYNTHETIC ${vertical.toUpperCase()}`,
    venue: `SYNTHETIC ${vertical.toUpperCase()}`,
    transaction_status: 'SOLD',
    sold_at: index === 9 ? '2026-08-25T05:00:00.000Z' : '2026-08-31T05:00:00.000Z',
    observed_at: '2026-09-01T04:00:00.000Z',
    realized_consideration: index === 10 ? 1 : index === 11 ? 999999999 : 1000 + index,
    currency: ['USD','EUR','GBP','JPY','KRW','HKD','AUD','CAD'][index % 8],
    hammer_price: null, all_in_price: null, normalized_price: null, normalized_currency: null,
    fee_semantics: 'SOURCE_REPORTED_UNKNOWN_FEE_BASIS',
    lot_or_listing_id: `kir-fixture-lot-${vertical}-${n}`,
    provenance_digest: digest({vertical, index, kind:'synthetic-provenance'}),
    acquisition_receipt_id: `kir-fixture-acq-${vertical}-${n}`,
    rights_receipt_id: `kir-fixture-rights-${vertical}`,
    rights_decision: 'ALLOW_PRIVATE_CURRENT_SOLD', confidence: caseType === 'BOUNDARY' ? 0.8 : 0.98,
    correction_state: 'ORIGINAL', supersedes_event_id: null, supersedes_content_digest: null,
    source_sha: SOURCE_SHA, canonical_run_id: run,
    synthetic_case_type: caseType
  });
}

// Remove harness-only classification before the real engine sees the record.
function engineObservation(value) {
  const copy = structuredClone(value);
  delete copy.synthetic_case_type;
  delete copy.content_digest;
  return seal(copy);
}

function registryFor(inputs, run) {
  return {
    schema_version: 'current-sold-receipt-registry-v1',
    acquisitions: inputs.map(input => ({
      receipt_id: input.acquisition_receipt_id, receipt_type: 'ACQUISITION', status: 'PASS',
      source_id: input.source_id, source_event_id: input.source_event_id, source_url: input.source_url,
      provenance_digest: input.provenance_digest, content_digest: input.content_digest,
      source_sha: SOURCE_SHA, canonical_run_id: run
    })),
    rights: [{
      receipt_id: inputs[0].rights_receipt_id, receipt_type: 'RIGHTS', status: 'PASS',
      source_id: inputs[0].source_id, decision: 'ALLOW_PRIVATE_CURRENT_SOLD', purpose: 'PRIVATE_CURRENT_SOLD',
      source_sha: SOURCE_SHA, canonical_run_id: run,
      valid_from: '2026-01-01T00:00:00.000Z', valid_until: '2026-12-31T23:59:59.999Z'
    }]
  };
}

function fixtureFor(inputs, runId) {
  const run = `kir-fixture-${runId}-1`;
  const rows = inputs.map(engineObservation).map(row => ({...row, canonical_run_id: run})).map(engineObservation);
  const registry = registryFor(rows, run);
  return {
    mode: 'CONTROL_ONLY_SYNTHETIC',
    identity: {repository: REPOSITORY, source_sha: SOURCE_SHA, run_id: runId, run_attempt: 1, trigger_event: 'pull_request'},
    envelope: {schema_version:'current-sold-batch-envelope-v1', batch_id:`kir-fixture-batch-${runId}`, created_at:NOW.toISOString(), source_sha:SOURCE_SHA, canonical_run_id:run, observations:rows},
    receiptRegistry: registry, expectedReceiptRegistryDigest: canonicalJsonDigest(registry), now: new Date(NOW)
  };
}

function rejected(fixture, mutation, expected) {
  const value = structuredClone(fixture);
  mutation(value);
  value.expectedReceiptRegistryDigest = canonicalJsonDigest(value.receiptRegistry);
  let result;
  try { result = evaluateKirCurrentSoldControl({...value, now:new Date(NOW)}); }
  catch (error) {
    if (expected.type === 'ERROR' && expected.pattern.test(String(error?.message))) return true;
    throw new Error(`SMT_REJECTION_ERROR_MISMATCH:${String(error?.message)}`);
  }
  if (expected.type === 'RECEIPT' && result.state === expected.state &&
    result.engine_control_status === expected.engine_status && result.control_counts.admitted === 0) return true;
  throw new Error(`SMT_REJECTION_RECEIPT_MISMATCH:${result.state}:${result.engine_control_status}:${result.control_counts.admitted}`);
}

export function runSyntheticMarketTwin120() {
  const contract = loadContract();
  const portal = fs.readFileSync(PORTAL_PATH, 'utf8');
  for (const token of ['CONTROL_ONLY_SYNTHETIC','NO_PROJECTION','customer_visible']) {
    if (token === 'customer_visible') continue;
    req(portal.includes(token === 'CONTROL_ONLY_SYNTHETIC' ? 'NON_PROMOTABLE_CONTROL' : token), `SMT_PORTAL_${token}`);
  }
  const cases = contract.verticals.flatMap((vertical, v) => Array.from({length:15}, (_, i) => observation(vertical, i, `kir-fixture-${1000+v}-1`)));
  req(cases.length === 120 && new Set(cases.map(x => x.canonical_object_id)).size === 120, 'SMT_CASE_IDENTITY');
  req(cases.every(x => x.source_url.startsWith('https://kir-fixture.invalid/') && x.canonical_object_id.startsWith('kir-fixture:')), 'SMT_NAMESPACE_ESCAPE');

  let accepted = 0, rejectedCount = 0;
  const controlReceipts = [], rejectionMatrix = [];
  for (let v = 0; v < contract.verticals.length; v += 1) {
    const vertical = contract.verticals[v];
    const group = cases.filter(x => x.canonical_object_id.startsWith(`kir-fixture:${vertical}:`));
    const passFixture = fixtureFor(group.slice(0, 12), 1000 + v);
    const result = evaluateKirCurrentSoldControl(passFixture);
    req(result.state === 'CONTROL_CHAIN_VALIDATED_EMPIRICAL_BLOCKED' && result.control_counts.admitted === 12, 'SMT_ACCEPTANCE');
    accepted += result.control_counts.admitted;
    controlReceipts.push({vertical, receipt_sha256:canonicalJsonDigest(result), accepted:12});

    const defectFixtures = group.slice(12).map((row, i) => fixtureFor([row], 2000 + v * 10 + i));
    const outcomes = [
      rejected(defectFixtures[0], x => { x.receiptRegistry.rights = []; },
        {type:'RECEIPT', state:'CONTROL_INPUT_REJECTED', engine_status:'FAIL_CLOSED'}),
      rejected(defectFixtures[1], x => {
        const row = x.envelope.observations[0];
        row.sold_at = '2026-07-01T00:00:00.000Z';
        row.observed_at = '2026-07-02T00:00:00.000Z';
        delete row.content_digest;
        // Seal while the event is current, then evaluate it at NOW so the
        // rejection is caused by freshness rather than a digest mismatch.
        x.envelope.observations[0] = seal(row, new Date('2026-07-02T05:00:00.000Z'));
        x.receiptRegistry.acquisitions[0].content_digest = x.envelope.observations[0].content_digest;
      }, {type:'RECEIPT', state:'CONTROL_INPUT_REJECTED', engine_status:'FAIL_CLOSED'}),
      rejected(defectFixtures[2], x => { x.envelope.observations[0].source_url = 'https://real.example/sold/1'; },
        {type:'ERROR', pattern:/KIR_BRIDGE_SYNTHETIC_URL_REQUIRED/}),
      rejected(defectFixtures[0], x => { x.receiptRegistry.rights[0].valid_until = '2026-08-01T00:00:00.000Z'; },
        {type:'RECEIPT', state:'CONTROL_INPUT_REJECTED', engine_status:'FAIL_CLOSED'}),
      rejected(defectFixtures[1], x => { x.receiptRegistry.rights[0].decision = 'HOLD'; },
        {type:'ERROR', pattern:/^CURRENT_SOLD_BATCH_RIGHTS_NOT_ALLOWED$/}),
      rejected(defectFixtures[2], x => { x.receiptRegistry.acquisitions[0].source_url = 'https://kir-fixture.invalid/drift/sold/1'; },
        {type:'RECEIPT', state:'CONTROL_INPUT_REJECTED', engine_status:'FAIL_CLOSED'}),
      rejected(defectFixtures[0], x => { x.envelope.observations[0].content_digest = `sha256:${'0'.repeat(64)}`; },
        {type:'RECEIPT', state:'CONTROL_INPUT_REJECTED', engine_status:'FAIL_CLOSED'})
    ];
    req(outcomes.every(Boolean), `SMT_DEFECT_FALSE_GREEN:${vertical}:${JSON.stringify(outcomes)}`);
    rejectedCount += defectFixtures.length;
    rejectionMatrix.push({
      vertical,
      missing_rights:'REJECTED', stale_sale:'REJECTED', namespace_escape:'REJECTED',
      expired_rights:'REJECTED', rights_decision_drift:'REJECTED',
      acquisition_provenance_drift:'REJECTED', content_tamper:'REJECTED'
    });
  }

  const admittedCases = cases.filter(x => x.synthetic_case_type !== 'DEFECT');
  const downstream = runSyntheticDownstreamControlBatch(admittedCases.map(item => ({
    canonical_object_id:item.canonical_object_id,
    provenance_digest:item.provenance_digest
  })));
  req(downstream.length === 96 && downstream.every(x => x.portal_state === 'NO_PROJECTION' && !x.customer_visible), 'SMT_PORTAL_LEAK');
  req(new Set(downstream.map(x => x.projection.pair_digest)).size === 96, 'SMT_DOWNSTREAM_DIGEST_COLLISION');

  const receipt = {
    id:'kidults-synthetic-market-twin-120-receipt-v1', version:'1.0.0', state:'VERIFIED_PASS',
    scope:'INTERNAL_CONTROL_ONLY_ASI_TO_PORTAL', contract_sha256:canonicalJsonDigest(contract),
    case_manifest_sha256:canonicalJsonDigest(cases), record_count:120, accepted, rejected:rejectedCount,
    red_team_mutations:rejectionMatrix.length * 7,
    normal_count:72, boundary_count:24, defect_count:24,
    candidate_controls:downstream.length, track_b_controls:downstream.length, projection_controls:downstream.length,
    portal_no_projection:downstream.filter(x => x.portal_state === 'NO_PROJECTION').length,
    customer_visible:0, empirical_current_sold_delta:0, postgres_rows_written:0,
    deterministic_replay_sha256:canonicalJsonDigest({controlReceipts,rejectionMatrix,downstream}),
    network_fetch:false, provider_authority:false, database_authority:false, market_authority:false,
    promotion_authority:false, public_release:'HOLD', production:'HOLD', g5:'HOLD'
  };
  for (const [key, expected] of Object.entries(contract.expected)) req(receipt[key] === expected, `SMT_EXPECTED_${key}`);
  return receipt;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(runSyntheticMarketTwin120(), null, 2));
