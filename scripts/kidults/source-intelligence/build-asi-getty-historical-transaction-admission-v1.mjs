#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [observationPath, contractPath, top16PreflightPath, adapterTestReceiptPath, outputDir] = process.argv.slice(2);
if (![observationPath, contractPath, top16PreflightPath, adapterTestReceiptPath, outputDir].every(Boolean)) {
  throw new Error('GETTY_HISTORICAL_TRANSACTION_BUILD_ARGUMENTS_REQUIRED');
}
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const stableJson = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const digestText = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const digestValue = (value) => digestText(JSON.stringify(stable(value)));
const id = (prefix, value) => `${prefix}::${digestValue(value).slice(7)}`;
const assert = (condition, code) => { if (!condition) throw new Error(code); };

const [observation, contract, top16Preflight, testReceipt] = await Promise.all([
  readJson(observationPath), readJson(contractPath), readJson(top16PreflightPath), readJson(adapterTestReceiptPath),
]);
const [rightsPool, sourceMesh, top16Registry] = await Promise.all([
  readJson(contract.authoritative_inputs.rights_admitted_source_pool),
  readJson(contract.authoritative_inputs.source_mesh),
  readJson(contract.authoritative_inputs.top16_registry),
]);
const expectedOutputs = [
  'getty-historical-transaction-evidence-ledger-v1.json',
  'getty-historical-transaction-event-ledger-v1.json',
  'getty-historical-transaction-admission-receipt-v1.json',
  'top16-empirical-activation-blocker-ledger-v1.json',
  'getty-historical-transaction-manifest-v1.json',
];
assert(contract.id === 'kidults-asi-getty-historical-transaction-admission-contract-v1' && contract.version === '1.0.0', 'CONTRACT_ID_VERSION');
assert(contract.status === 'EXECUTION_CONTRACT_ACTIVE', 'CONTRACT_STATUS');
assert(JSON.stringify(contract.required_outputs) === JSON.stringify(expectedOutputs), 'CONTRACT_OUTPUTS');
assert(observation.id === 'kidults-getty-provenance-historical-transaction-observation-v1' && observation.state === 'VERIFIED_PASS', 'OBSERVATION_STATE');
assert(top16Preflight.id === 'kidults-top16-empirical-activation-preflight-v1' && top16Preflight.status === 'VERIFIED_FAIL_CLOSED', 'TOP16_PREFLIGHT_STATE');
assert(top16Preflight.rows.length === 16 && new Set(top16Preflight.rows.map((row) => row.source_id)).size === 16, 'TOP16_PREFLIGHT_ROWS');
assert(rightsPool.sources?.some((source) => source.source_id === 'getty-provenance-index' && source.admission_state === 'ADMITTED' && source.rights_basis === 'CC0'), 'GETTY_RIGHTS_POOL_ADMISSION');
assert(sourceMesh.evidence_classes?.includes('HISTORICAL_TRANSACTION_PROVENANCE'), 'SOURCE_MESH_HISTORICAL_CLASS');
assert(top16Registry.implementation_state?.portfolio_source_specific_adapters_implemented === 16 &&
  top16Registry.implementation_state?.source_specific_adapters_activated === 0, 'TOP16_REGISTRY_BOUNDARY');
assert(testReceipt.id === 'kidults-getty-provenance-index-adapter-test-receipt-v1' && testReceipt.state === 'VERIFIED_PASS', 'ADAPTER_TEST_RECEIPT');
assert(testReceipt.immutable_live_snapshots_verified === 2 && testReceipt.purpose_specific_rights_verified === 1 &&
  testReceipt.positive_historical_transactions_parsed === 1 && testReceipt.negative_mutations_rejected === 15, 'ADAPTER_TEST_COUNTS');
const adapter = testReceipt.adapter_result;
assert(adapter?.decision_state === 'NORMALIZED_HISTORICAL_TRANSACTION_READY_FOR_ADMISSION' &&
  adapter?.adapter_state === 'ACTIVATED_EVIDENCE_BOUND_HISTORICAL_ONLY' &&
  adapter?.historical_transaction_evidence_ready === true && adapter?.generic_market_event_created === false, 'ADAPTER_READY_STATE');
const normalized = adapter.normalized_record;
assert(normalized?.evidence_class === 'HISTORICAL_TRANSACTION_PROVENANCE' &&
  normalized?.amount_semantics === 'DOCUMENTED_TRANSACTION_AMOUNT_NOT_HAMMER_OR_CURRENT_PRICE' &&
  normalized?.event_time_precision === 'MONTH' && normalized?.current_market_signal_eligible === false, 'NORMALIZED_CLAIM_CEILING');

const evidenceId = id('historical-evidence', {
  source_record_id: normalized.source_record_id,
  sale_snapshot: normalized.raw_sale_snapshot_sha256,
  object_snapshot: normalized.raw_object_snapshot_sha256,
  evidence_class: normalized.evidence_class,
});
const eventId = id('historical-transaction-event', {
  evidence_id: evidenceId,
  canonical_entity_id: normalized.canonical_entity_id,
  event_window_start_at: normalized.event_window_start_at,
  event_window_end_at: normalized.event_window_end_at,
  documented_transaction_amount: normalized.documented_transaction_amount,
  currency: normalized.currency,
});
const receiptId = id('historical-admission-receipt', {
  contract_id: contract.id,
  evidence_id: evidenceId,
  event_id: eventId,
  rights: contract.rights_policy,
  claim_ceiling: contract.claim_ceiling,
});

const evidenceRecord = {
  evidence_id: evidenceId,
  admission_receipt_id: receiptId,
  admission_state: 'ADMITTED_BOUNDED_HISTORICAL_TRANSACTION_PROVENANCE',
  evidence_class: normalized.evidence_class,
  source_id: normalized.source_id,
  source_owner_id: normalized.source_owner_id,
  factual_origin_id: normalized.factual_origin_id,
  source_record_id: normalized.source_record_id,
  source_record_url: normalized.source_record_url,
  canonical_entity_id: normalized.canonical_entity_id,
  object_record_url: normalized.object_record_url,
  object_label: normalized.object_label,
  object_type: normalized.object_type,
  object_identifiers: normalized.object_identifiers,
  transaction_state: normalized.transaction_state,
  event_date_label: normalized.event_date_label,
  event_window_start_at: normalized.event_window_start_at,
  event_window_end_at: normalized.event_window_end_at,
  event_time_precision: normalized.event_time_precision,
  documented_transaction_amount: normalized.documented_transaction_amount,
  currency: normalized.currency,
  currency_authority_id: normalized.currency_authority_id,
  amount_semantics: normalized.amount_semantics,
  transferred_title_from_ids: normalized.transferred_title_from_ids,
  transferred_title_to_ids: normalized.transferred_title_to_ids,
  rights: {
    decision: 'ALLOW',
    basis: normalized.rights_basis,
    collect: 'ALLOW',
    store: 'ALLOW',
    transform: 'ALLOW',
    evidence_refs: normalized.rights_evidence_refs,
  },
  immutable_source_snapshots: [
    { role: 'SALE_ACTIVITY', ref: observation.snapshots.sale.path, sha256: normalized.raw_sale_snapshot_sha256 },
    { role: 'OBJECT_IDENTITY', ref: observation.snapshots.object.path, sha256: normalized.raw_object_snapshot_sha256 },
  ],
  provenance_refs: normalized.provenance_refs,
  source_updated_at: observation.snapshots.sale.last_modified_at,
  observed_at: observation.as_of,
  historical_only: true,
  generic_market_event_eligible: false,
  verified_current_sold_event: false,
  current_price_eligible: false,
  current_market_signal_eligible: false,
  liquidity_eligible: false,
  demand_eligible: false,
  index_or_projection_eligible: false,
  registered_top_16_source_profile: false,
  customer_claim_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};
const evidenceLedger = {
  id: 'kidults-getty-historical-transaction-evidence-ledger-v1',
  version: '1.0.0',
  status: 'VERIFIED_PASS',
  as_of: observation.as_of,
  historical_transaction_evidence_admitted: 1,
  current_market_evidence_admitted: 0,
  records: [evidenceRecord],
  public_release: 'HOLD', production: 'HOLD', g5: 'HOLD',
};
const historicalEvent = {
  historical_transaction_event_id: eventId,
  schema_version: 'historical-transaction-event-v1',
  event_class: 'HISTORICAL_TRANSACTION_EVENT',
  evidence_id: evidenceId,
  source_id: normalized.source_id,
  source_owner_id: normalized.source_owner_id,
  factual_origin_id: normalized.factual_origin_id,
  canonical_entity_id: normalized.canonical_entity_id,
  transaction_state: normalized.transaction_state,
  event_date_label: normalized.event_date_label,
  event_window_start_at: normalized.event_window_start_at,
  event_window_end_at: normalized.event_window_end_at,
  event_time_precision: normalized.event_time_precision,
  documented_transaction_amount: normalized.documented_transaction_amount,
  currency: normalized.currency,
  amount_semantics: normalized.amount_semantics,
  evidence_admission_state: evidenceRecord.admission_state,
  generic_market_event_admitted: false,
  verified_current_sold_event: false,
  current_signal_eligible: false,
  current_price_eligible: false,
  liquidity_eligible: false,
  demand_eligible: false,
  index_or_projection_eligible: false,
  public_release: 'HOLD', production: 'HOLD', g5: 'HOLD',
};
const eventLedger = {
  id: 'kidults-getty-historical-transaction-event-ledger-v1',
  version: '1.0.0',
  status: 'VERIFIED_PASS_HISTORICAL_ONLY',
  as_of: observation.as_of,
  historical_transaction_events_created: 1,
  generic_market_events_admitted: 0,
  verified_current_sold_events_created: 0,
  current_prices_created: 0,
  liquidity_measures_created: 0,
  demand_measures_created: 0,
  events: [historicalEvent],
  public_release: 'HOLD', production: 'HOLD', g5: 'HOLD',
};
const admissionReceipt = {
  id: receiptId,
  version: '1.0.0',
  state: 'VERIFIED_PASS_ADMITTED_BOUNDED_HISTORICAL_ONLY',
  as_of: observation.as_of,
  source_id: normalized.source_id,
  evidence_id: evidenceId,
  historical_transaction_event_id: eventId,
  gates: {
    immutable_live_snapshot_gate: { state: 'PASS', verified_snapshots: 2 },
    purpose_specific_rights_gate: { state: 'PASS', basis: 'CC0' },
    source_schema_gate: { state: 'PASS', schema: 'LINKED_ART_JSON_LD_EXACT_DIGEST_BOUND' },
    transaction_semantics_gate: { state: 'PASS_HISTORICAL_ONLY', transaction_state: normalized.transaction_state },
    amount_semantics_gate: { state: 'PASS_DOCUMENTED_AMOUNT_ONLY', amount_semantics: normalized.amount_semantics },
    time_precision_gate: { state: 'PASS_MONTH_PRECISION', exact_day_claim_allowed: false },
    owner_origin_gate: { state: 'PASS_BOUNDED', source_owner_id: normalized.source_owner_id, factual_origin_id: normalized.factual_origin_id },
    generic_market_event_gate: { state: 'REJECT_NOT_A_CURRENT_MARKET_EVENT' },
    top16_inheritance_gate: { state: 'REJECT_SOURCE_OUTSIDE_TOP16' },
    public_production_g5_gate: { public_release: 'HOLD', production: 'HOLD', g5: 'HOLD' },
  },
  decision: 'ADMIT_ONE_HISTORICAL_TRANSACTION_PROVENANCE_RECORD_AND_ONE_HISTORICAL_EVENT_ONLY',
  forbidden_promotions: contract.claim_ceiling.forbidden,
  public_release: 'HOLD', production: 'HOLD', g5: 'HOLD',
};
const blockerLedger = {
  id: 'kidults-top16-empirical-activation-blocker-ledger-v1',
  version: '1.0.0',
  status: 'VERIFIED_FAIL_CLOSED',
  as_of: top16Preflight.as_of,
  registered_source_profiles: 16,
  software_adapters_implemented_fixture_verified: 16,
  preflighted_sources: top16Preflight.preflighted_sources,
  empirically_activated: 0,
  evidence_admitted: 0,
  verified_current_sold_events: 0,
  rows: top16Preflight.rows,
  authority_boundary: top16Preflight.authority_boundary,
  next_action: top16Preflight.next_action,
  public_release: 'HOLD', production: 'HOLD', g5: 'HOLD',
};

const payloads = new Map([
  [expectedOutputs[0], evidenceLedger],
  [expectedOutputs[1], eventLedger],
  [expectedOutputs[2], admissionReceipt],
  [expectedOutputs[3], blockerLedger],
]);
await fs.mkdir(outputDir, { recursive: true });
const artifacts = [];
for (const [file, value] of payloads) {
  const text = stableJson(value);
  await fs.writeFile(path.join(outputDir, file), text, 'utf8');
  artifacts.push({ file, sha256: digestText(text), bytes: Buffer.byteLength(text) });
}
const manifest = {
  id: 'kidults-getty-historical-transaction-manifest-v1',
  version: '1.0.0',
  status: 'VERIFIED_PASS',
  as_of: observation.as_of,
  contract_id: contract.id,
  artifacts,
  counts: {
    immutable_live_source_snapshots_verified: 2,
    purpose_specific_rights_verified_sources: 1,
    historical_transaction_evidence_admitted: 1,
    historical_transaction_events_created: 1,
    generic_market_events_admitted: 0,
    verified_current_sold_events_created: 0,
    top16_source_adapters_activated: 0,
    top16_evidence_admitted: 0,
    current_prices_created: 0,
    liquidity_measures_created: 0,
    snapshot_candidates_created: 0,
    track_b_input_pairs_created: 0,
  },
  package_digest: digestValue(artifacts),
  public_release: 'HOLD', production: 'HOLD', g5: 'HOLD',
};
await fs.writeFile(path.join(outputDir, expectedOutputs[4]), stableJson(manifest), 'utf8');
console.log(JSON.stringify({
  status: 'PASS',
  output_dir: outputDir,
  artifact_count: expectedOutputs.length,
  package_digest: manifest.package_digest,
  counts: manifest.counts,
}, null, 2));
