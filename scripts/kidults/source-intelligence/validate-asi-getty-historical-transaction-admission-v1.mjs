#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  canonicalizeMarketEvent,
  computeMarketSignals,
  deduplicateMarketEvents,
  marketAdmissionErrors,
} from '../intelligence/provider-independent-layers-v1.mjs';

const [outputDir, observationPath, contractPath, top16PreflightPath, adapterTestReceiptPath] = process.argv.slice(2);
if (![outputDir, observationPath, contractPath, top16PreflightPath, adapterTestReceiptPath].every(Boolean)) {
  throw new Error('GETTY_HISTORICAL_TRANSACTION_VALIDATION_ARGUMENTS_REQUIRED');
}
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const digestText = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const digestValue = (value) => digestText(JSON.stringify(stable(value)));
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const output = (name) => json(path.join(outputDir, name));

const observation = json(observationPath);
const contract = json(contractPath);
const top16Preflight = json(top16PreflightPath);
const testReceipt = json(adapterTestReceiptPath);
const evidence = output('getty-historical-transaction-evidence-ledger-v1.json');
const events = output('getty-historical-transaction-event-ledger-v1.json');
const admission = output('getty-historical-transaction-admission-receipt-v1.json');
const blockers = output('top16-empirical-activation-blocker-ledger-v1.json');
const manifest = output('getty-historical-transaction-manifest-v1.json');

assert(contract.id === 'kidults-asi-getty-historical-transaction-admission-contract-v1' &&
  contract.status === 'EXECUTION_CONTRACT_ACTIVE', 'CONTRACT_STATE');
assert(observation.id === 'kidults-getty-provenance-historical-transaction-observation-v1' &&
  observation.state === 'VERIFIED_PASS', 'OBSERVATION_STATE');
assert(testReceipt.id === 'kidults-getty-provenance-index-adapter-test-receipt-v1' &&
  testReceipt.state === 'VERIFIED_PASS' && testReceipt.negative_mutations_rejected === 15, 'ADAPTER_TEST_STATE');
assert(testReceipt.adapter_result?.decision_state === 'NORMALIZED_HISTORICAL_TRANSACTION_READY_FOR_ADMISSION' &&
  testReceipt.adapter_result?.immutable_live_snapshots_verified === 2 &&
  testReceipt.adapter_result?.purpose_specific_rights_verified === true, 'ADAPTER_RESULT_STATE');

const saleRaw = fs.readFileSync(observation.snapshots.sale.path);
const objectRaw = fs.readFileSync(observation.snapshots.object.path);
assert(digestText(saleRaw) === observation.snapshots.sale.sha256, 'SALE_RAW_DIGEST');
assert(digestText(objectRaw) === observation.snapshots.object.sha256, 'OBJECT_RAW_DIGEST');
assert(JSON.parse(saleRaw).id === observation.source.sale_record_url, 'SALE_RECORD_ID');
assert(JSON.parse(objectRaw).id === observation.source.object_record_url, 'OBJECT_RECORD_ID');

assert(evidence.id === 'kidults-getty-historical-transaction-evidence-ledger-v1' &&
  evidence.status === 'VERIFIED_PASS' && evidence.historical_transaction_evidence_admitted === 1 &&
  evidence.current_market_evidence_admitted === 0 && evidence.records?.length === 1, 'EVIDENCE_LEDGER_STATE');
const record = evidence.records[0];
assert(record.admission_state === 'ADMITTED_BOUNDED_HISTORICAL_TRANSACTION_PROVENANCE' &&
  record.evidence_class === 'HISTORICAL_TRANSACTION_PROVENANCE' && record.source_id === 'getty-provenance-index' &&
  record.source_owner_id === 'j-paul-getty-trust' && record.factual_origin_id === 'knoedler-stock-book-a1983', 'EVIDENCE_IDENTITY');
assert(record.transaction_state === 'DOCUMENTED_TITLE_TRANSFER' && record.event_date_label === '1938-09-00' &&
  record.event_window_start_at === '1938-09-01T00:00:00Z' && record.event_window_end_at === '1938-10-01T23:59:59Z' &&
  record.event_time_precision === 'MONTH', 'EVIDENCE_TIME_PRECISION');
assert(record.documented_transaction_amount === 1471.13 && record.currency === 'GBP' &&
  record.amount_semantics === 'DOCUMENTED_TRANSACTION_AMOUNT_NOT_HAMMER_OR_CURRENT_PRICE', 'EVIDENCE_AMOUNT_SEMANTICS');
assert(record.rights?.decision === 'ALLOW' && record.rights?.basis === 'CC0' && record.rights?.collect === 'ALLOW' &&
  record.rights?.store === 'ALLOW' && record.rights?.transform === 'ALLOW', 'EVIDENCE_RIGHTS');
assert(record.immutable_source_snapshots?.length === 2 &&
  record.immutable_source_snapshots[0].sha256 === observation.snapshots.sale.sha256 &&
  record.immutable_source_snapshots[1].sha256 === observation.snapshots.object.sha256, 'EVIDENCE_SNAPSHOT_BINDING');
for (const field of ['generic_market_event_eligible', 'verified_current_sold_event', 'current_price_eligible',
  'current_market_signal_eligible', 'liquidity_eligible', 'demand_eligible', 'index_or_projection_eligible',
  'registered_top_16_source_profile', 'customer_claim_authorized']) {
  assert(record[field] === false, `EVIDENCE_FALSE_PROMOTION_${field}`);
}
assert(record.public_release === 'HOLD' && record.production === 'HOLD' && record.g5 === 'HOLD', 'EVIDENCE_PROTECTED_GATES');

assert(events.id === 'kidults-getty-historical-transaction-event-ledger-v1' &&
  events.status === 'VERIFIED_PASS_HISTORICAL_ONLY' && events.historical_transaction_events_created === 1 &&
  events.generic_market_events_admitted === 0 && events.verified_current_sold_events_created === 0 &&
  events.current_prices_created === 0 && events.liquidity_measures_created === 0 &&
  events.demand_measures_created === 0 && events.events?.length === 1, 'EVENT_LEDGER_STATE');
const historicalEvent = events.events[0];
assert(historicalEvent.event_class === 'HISTORICAL_TRANSACTION_EVENT' && historicalEvent.evidence_id === record.evidence_id &&
  historicalEvent.event_time_precision === 'MONTH' && historicalEvent.amount_semantics === record.amount_semantics, 'HISTORICAL_EVENT_BINDING');
for (const field of ['generic_market_event_admitted', 'verified_current_sold_event', 'current_signal_eligible',
  'current_price_eligible', 'liquidity_eligible', 'demand_eligible', 'index_or_projection_eligible']) {
  assert(historicalEvent[field] === false, `HISTORICAL_EVENT_FALSE_PROMOTION_${field}`);
}
assert(historicalEvent.public_release === 'HOLD' && historicalEvent.production === 'HOLD' && historicalEvent.g5 === 'HOLD', 'HISTORICAL_EVENT_PROTECTED_GATES');

assert(admission.state === 'VERIFIED_PASS_ADMITTED_BOUNDED_HISTORICAL_ONLY' &&
  admission.evidence_id === record.evidence_id && admission.historical_transaction_event_id === historicalEvent.historical_transaction_event_id &&
  admission.gates?.immutable_live_snapshot_gate?.state === 'PASS' &&
  admission.gates?.purpose_specific_rights_gate?.state === 'PASS' &&
  admission.gates?.transaction_semantics_gate?.state === 'PASS_HISTORICAL_ONLY' &&
  admission.gates?.amount_semantics_gate?.state === 'PASS_DOCUMENTED_AMOUNT_ONLY' &&
  admission.gates?.time_precision_gate?.exact_day_claim_allowed === false &&
  admission.gates?.generic_market_event_gate?.state === 'REJECT_NOT_A_CURRENT_MARKET_EVENT' &&
  admission.gates?.top16_inheritance_gate?.state === 'REJECT_SOURCE_OUTSIDE_TOP16', 'ADMISSION_GATES');
assert(same(admission.forbidden_promotions, contract.claim_ceiling.forbidden), 'ADMISSION_FORBIDDEN_PROMOTIONS');
assert(admission.public_release === 'HOLD' && admission.production === 'HOLD' && admission.g5 === 'HOLD', 'ADMISSION_PROTECTED_GATES');

assert(top16Preflight.rows.length === 16 && blockers.rows?.length === 16 && same(blockers.rows, top16Preflight.rows), 'TOP16_ROWS');
assert(blockers.registered_source_profiles === 16 && blockers.software_adapters_implemented_fixture_verified === 16 &&
  blockers.preflighted_sources === 5 && blockers.empirically_activated === 0 && blockers.evidence_admitted === 0 &&
  blockers.verified_current_sold_events === 0, 'TOP16_COUNTS');
assert(blockers.rows.every((row) => row.activation_state.startsWith('HOLD_')), 'TOP16_FAIL_CLOSED');
assert(blockers.authority_boundary?.external_account_creation === 'HOLD' &&
  blockers.authority_boundary?.paid_subscription_or_api_purchase === 'HOLD' &&
  blockers.authority_boundary?.written_permission_request_or_legal_commitment === 'HOLD', 'TOP16_AUTHORITY_BOUNDARY');

assert(manifest.id === 'kidults-getty-historical-transaction-manifest-v1' && manifest.status === 'VERIFIED_PASS', 'MANIFEST_STATE');
const expectedArtifactNames = contract.required_outputs.slice(0, 4);
assert(same(manifest.artifacts.map((item) => item.file), expectedArtifactNames), 'MANIFEST_ARTIFACT_NAMES');
for (const artifact of manifest.artifacts) {
  const text = fs.readFileSync(path.join(outputDir, artifact.file), 'utf8');
  assert(digestText(text) === artifact.sha256 && Buffer.byteLength(text) === artifact.bytes, `MANIFEST_DIGEST_${artifact.file}`);
}
assert(manifest.package_digest === digestValue(manifest.artifacts), 'MANIFEST_PACKAGE_DIGEST');
assert(manifest.counts?.immutable_live_source_snapshots_verified === 2 &&
  manifest.counts?.purpose_specific_rights_verified_sources === 1 &&
  manifest.counts?.historical_transaction_evidence_admitted === 1 &&
  manifest.counts?.historical_transaction_events_created === 1 &&
  manifest.counts?.generic_market_events_admitted === 0 &&
  manifest.counts?.verified_current_sold_events_created === 0 &&
  manifest.counts?.top16_source_adapters_activated === 0 &&
  manifest.counts?.top16_evidence_admitted === 0 && manifest.counts?.current_prices_created === 0 &&
  manifest.counts?.liquidity_measures_created === 0 && manifest.counts?.snapshot_candidates_created === 0 &&
  manifest.counts?.track_b_input_pairs_created === 0, 'MANIFEST_COUNTS');
assert(manifest.public_release === 'HOLD' && manifest.production === 'HOLD' && manifest.g5 === 'HOLD', 'MANIFEST_PROTECTED_GATES');

const attemptedGenericEvent = {
  schema_version: 'market-event-v1',
  market_event_id: historicalEvent.historical_transaction_event_id,
  evidence_class: 'HISTORICAL_TRANSACTION_PROVENANCE',
  event_state: 'SOLD',
  source_event_id: historicalEvent.historical_transaction_event_id,
  canonical_entity_id: record.canonical_entity_id,
  physical_object_id: record.canonical_entity_id,
  venue_id: 'getty-provenance-index',
  event_at: record.event_window_start_at,
  price: { price_type: 'DOCUMENTED_TRANSACTION_AMOUNT', amount: record.documented_transaction_amount, currency: record.currency },
  rights: { collect: 'ALLOW', store: 'ALLOW', transform: 'ALLOW' },
  lineage: { evidence_id: record.evidence_id, source_family_id: record.source_owner_id },
};
const genericErrors = marketAdmissionErrors(attemptedGenericEvent);
const canonicalAttempt = canonicalizeMarketEvent(attemptedGenericEvent);
const signals = computeMarketSignals([canonicalAttempt]);
const forgedWrapper = { ...canonicalAttempt, admitted: true, admission_errors: [] };
assert(genericErrors.includes('GENERIC_MARKET_EVENT_EVIDENCE_CLASS_UNSUPPORTED') && canonicalAttempt.admitted === false &&
  signals.unique_event_count === 0 && deduplicateMarketEvents([forgedWrapper]).length === 0 &&
  computeMarketSignals([forgedWrapper]).unique_event_count === 0, 'GENERIC_MARKET_ROUTER_ISOLATION');

console.log(JSON.stringify({
  status: 'PASS',
  evidence_id: record.evidence_id,
  historical_transaction_event_id: historicalEvent.historical_transaction_event_id,
  historical_transaction_evidence_admitted: 1,
  historical_transaction_events_created: 1,
  immutable_live_source_snapshots_verified: 2,
  purpose_specific_rights_verified_sources: 1,
  adapter_mutations_rejected: testReceipt.negative_mutations_rejected,
  generic_market_router_isolation: 'PASS',
  top16_source_adapters_activated: 0,
  top16_evidence_admitted: 0,
  current_prices_created: 0,
  liquidity_measures_created: 0,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
