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
  throw new Error('GETTY_REFERENCE_REPLAY_VALIDATION_ARGUMENTS_REQUIRED');
}
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const digestText = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const digestValue = (value) => digestText(JSON.stringify(stable(value)));
const assert = (condition, code) => { if (!condition) throw new Error(code); };
// #1819: terminal source_sha must bind the exact candidate; event_sha is diagnostic only.
const workflowPath = '.github/workflows/kidults-asi-getty-historical-transaction-admission-v1.yml';
const workflowText = fs.readFileSync(workflowPath, 'utf8');
for (const marker of [
  "const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));",
  'const sourceSha=event.pull_request?.head?.sha || process.env.GITHUB_SHA;',
  'source_sha:sourceSha',
  'event_sha:process.env.GITHUB_SHA',
  'commit/${sourceSha}',
]) assert(workflowText.includes(marker), `GETTY_SOURCE_LINEAGE_MARKER_MISSING_${marker}`);
assert(!/^\s*sha:process\.env\.GITHUB_SHA,/m.test(workflowText), 'GETTY_AMBIGUOUS_EVENT_SHA_REINTRODUCED');
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
  contract.status === 'CONTROL_REPLAY_CONTRACT_ACTIVE', 'CONTRACT_STATE');
assert(observation.id === 'kidults-getty-provenance-historical-transaction-observation-v1' &&
  observation.state === 'COMMITTED_REFERENCE_SNAPSHOT_REPLAY', 'OBSERVATION_STATE');
assert(observation.capture?.mode === 'COMMITTED_SNAPSHOT_REPLAY_NO_ACQUISITION_RECEIPT' &&
  observation.capture?.network_requests === 0 &&
  observation.capture?.machine_proven_acquisition_receipts === 0 &&
  observation.capture?.acquisition_time_http_receipt === null, 'ACQUISITION_NOT_PROVEN_BOUNDARY');
assert(testReceipt.id === 'kidults-getty-provenance-index-adapter-test-receipt-v1' &&
  testReceipt.state === 'VERIFIED_PASS' && testReceipt.negative_mutations_rejected === 17, 'ADAPTER_TEST_STATE');
assert(testReceipt.committed_reference_snapshots_verified === 2 &&
  testReceipt.immutable_live_snapshots_verified === 0 &&
  testReceipt.machine_proven_acquisition_receipts === 0 &&
  testReceipt.positive_reference_records_parsed === 1 &&
  testReceipt.positive_historical_transactions_parsed === 0, 'ADAPTER_CONTROL_COUNTS');
assert(testReceipt.adapter_result?.decision_state === 'NORMALIZED_REFERENCE_REPLAY_NOT_ADMISSIBLE' &&
  testReceipt.adapter_result?.adapter_state === 'REFERENCE_REPLAY_CONTROL_ONLY' &&
  testReceipt.adapter_result?.historical_transaction_evidence_ready === false &&
  testReceipt.adapter_result?.promotable === false, 'ADAPTER_CONTROL_STATE');

const saleRaw = fs.readFileSync(observation.snapshots.sale.path);
const objectRaw = fs.readFileSync(observation.snapshots.object.path);
assert(digestText(saleRaw) === observation.snapshots.sale.sha256, 'SALE_RAW_DIGEST');
assert(digestText(objectRaw) === observation.snapshots.object.sha256, 'OBJECT_RAW_DIGEST');
assert(JSON.parse(saleRaw).id === observation.source.sale_record_url, 'SALE_RECORD_ID');
assert(JSON.parse(objectRaw).id === observation.source.object_record_url, 'OBJECT_RECORD_ID');

assert(evidence.id === 'kidults-getty-historical-transaction-evidence-ledger-v1' &&
  evidence.status === 'CONTROL_ONLY_HOLD' &&
  evidence.committed_reference_records_parsed === 1 &&
  evidence.historical_transaction_evidence_admitted === 0 &&
  evidence.current_market_evidence_admitted === 0 &&
  evidence.records?.length === 1, 'EVIDENCE_CONTROL_STATE');
const record = evidence.records[0];
assert(record.admission_state === 'CONTROL_ONLY_COMMITTED_REFERENCE_REPLAY' &&
  record.evidence_class === 'HISTORICAL_TRANSACTION_PROVENANCE' &&
  record.machine_proven_acquisition_receipt === false &&
  record.promotable === false, 'REFERENCE_RECORD_BOUNDARY');
for (const field of ['generic_market_event_eligible', 'verified_current_sold_event', 'current_price_eligible',
  'current_market_signal_eligible', 'liquidity_eligible', 'demand_eligible', 'index_or_projection_eligible',
  'registered_top_16_source_profile', 'customer_claim_authorized']) {
  assert(record[field] === false, `REFERENCE_FALSE_PROMOTION_${field}`);
}
assert(record.public_release === 'HOLD' && record.production === 'HOLD' && record.g5 === 'HOLD', 'REFERENCE_PROTECTED_GATES');

assert(events.id === 'kidults-getty-historical-transaction-event-ledger-v1' &&
  events.status === 'CONTROL_ONLY_NO_EMPIRICAL_EVENT' &&
  events.historical_transaction_events_created === 0 &&
  events.generic_market_events_admitted === 0 &&
  events.verified_current_sold_events_created === 0 &&
  events.current_prices_created === 0 && events.liquidity_measures_created === 0 &&
  events.demand_measures_created === 0 && events.events?.length === 0, 'EVENT_ZERO_BOUNDARY');

assert(admission.state === 'VERIFIED_CONTROL_REPLAY_ACQUISITION_NOT_PROVEN' &&
  admission.evidence_id === null && admission.historical_transaction_event_id === null &&
  admission.reference_record_id === record.evidence_id &&
  admission.gates?.committed_reference_snapshot_gate?.state === 'PASS_CONTROL_ONLY' &&
  admission.gates?.immutable_live_snapshot_gate?.state === 'HOLD_ACQUISITION_RECEIPT_MISSING' &&
  admission.gates?.immutable_live_snapshot_gate?.verified_snapshots === 0 &&
  admission.gates?.acquisition_receipt_gate?.machine_proven_receipts === 0, 'ADMISSION_HOLD_BOUNDARY');
assert(same(admission.forbidden_promotions, contract.claim_ceiling.forbidden), 'ADMISSION_FORBIDDEN_PROMOTIONS');
assert(admission.public_release === 'HOLD' && admission.production === 'HOLD' && admission.g5 === 'HOLD', 'ADMISSION_PROTECTED_GATES');

assert(top16Preflight.rows.length === 16 && blockers.rows?.length === 16 && same(blockers.rows, top16Preflight.rows), 'TOP16_ROWS');
assert(blockers.empirically_activated === 0 && blockers.evidence_admitted === 0 &&
  blockers.verified_current_sold_events === 0, 'TOP16_COUNTS');

assert(manifest.id === 'kidults-getty-historical-transaction-manifest-v1' &&
  manifest.status === 'CONTROL_ONLY_HOLD' && manifest.promotable === false, 'MANIFEST_STATE');
const expectedArtifactNames = contract.required_outputs.slice(0, 4);
assert(same(manifest.artifacts.map((item) => item.file), expectedArtifactNames), 'MANIFEST_ARTIFACT_NAMES');
for (const artifact of manifest.artifacts) {
  const text = fs.readFileSync(path.join(outputDir, artifact.file), 'utf8');
  assert(digestText(text) === artifact.sha256 && Buffer.byteLength(text) === artifact.bytes, `MANIFEST_DIGEST_${artifact.file}`);
}
assert(manifest.package_digest === digestValue(manifest.artifacts), 'MANIFEST_PACKAGE_DIGEST');
assert(manifest.counts?.committed_reference_snapshots_verified === 2 &&
  manifest.counts?.immutable_live_source_snapshots_verified === 0 &&
  manifest.counts?.machine_proven_acquisition_receipts === 0 &&
  manifest.counts?.purpose_specific_rights_verified_sources === 1 &&
  manifest.counts?.historical_transaction_evidence_admitted === 0 &&
  manifest.counts?.historical_transaction_events_created === 0 &&
  manifest.counts?.generic_market_events_admitted === 0 &&
  manifest.counts?.verified_current_sold_events_created === 0 &&
  manifest.counts?.top16_source_adapters_activated === 0 &&
  manifest.counts?.top16_evidence_admitted === 0 &&
  manifest.counts?.current_prices_created === 0 &&
  manifest.counts?.liquidity_measures_created === 0 &&
  manifest.counts?.snapshot_candidates_created === 0 &&
  manifest.counts?.track_b_input_pairs_created === 0, 'MANIFEST_COUNTS');
assert(manifest.public_release === 'HOLD' && manifest.production === 'HOLD' && manifest.g5 === 'HOLD', 'MANIFEST_PROTECTED_GATES');

const attemptedGenericEvent = {
  schema_version: 'market-event-v1',
  market_event_id: `control-replay::${record.evidence_id}`,
  evidence_class: 'HISTORICAL_TRANSACTION_PROVENANCE',
  event_state: 'SOLD',
  source_event_id: record.evidence_id,
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
const forgedWrapper = { ...canonicalAttempt, admitted: true, admission_errors: [] };
assert(genericErrors.includes('GENERIC_MARKET_EVENT_EVIDENCE_CLASS_UNSUPPORTED') &&
  canonicalAttempt.admitted === false && computeMarketSignals([canonicalAttempt]).unique_event_count === 0 &&
  deduplicateMarketEvents([forgedWrapper]).length === 0 &&
  computeMarketSignals([forgedWrapper]).unique_event_count === 0, 'GENERIC_MARKET_ROUTER_ISOLATION');

console.log(JSON.stringify({
  status: 'CONTROL_ONLY_PASS',
  committed_reference_snapshots_verified: 2,
  immutable_live_source_snapshots_verified: 0,
  machine_proven_acquisition_receipts: 0,
  historical_transaction_evidence_admitted: 0,
  historical_transaction_events_created: 0,
  generic_market_router_isolation: 'PASS',
  top16_source_adapters_activated: 0,
  current_prices_created: 0,
  liquidity_measures_created: 0,
  promotable: false,
  public_release: 'HOLD', production: 'HOLD', g5: 'HOLD',
}, null, 2));
