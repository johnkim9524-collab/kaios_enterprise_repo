#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const typescriptModule = process.env.KIDULTS_TYPESCRIPT_MODULE;
const ts = (await import(typescriptModule
  ? pathToFileURL(resolve(typescriptModule)).href
  : 'typescript')).default;
const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serviceRoot, '../..');
const sourcePath = resolve(serviceRoot, 'src/asi/source-adapters/getty-provenance-index.ts');
const observationPath = process.argv[2] || resolve(repoRoot, 'coordination/kidults/source-intelligence/getty-provenance-historical-transaction-observation-v1.json');
const salePath = process.argv[3] || resolve(repoRoot, 'coordination/kidults/source-intelligence/evidence/getty-provenance-sale-fbc91494-v1.json');
const objectPath = process.argv[4] || resolve(repoRoot, 'coordination/kidults/source-intelligence/evidence/getty-provenance-object-09539ab1-v1.json');

const compiledRoot = mkdtempSync(resolve(tmpdir(), 'kidults-getty-provenance-adapter-'));
mkdirSync(compiledRoot, { recursive: true });
writeFileSync(resolve(compiledRoot, 'package.json'), JSON.stringify({ type: 'module' }));
const transpiled = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
  fileName: 'getty-provenance-index.ts',
  reportDiagnostics: true,
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
});
const transpileErrors = (transpiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
if (transpileErrors.length) throw new Error(`GETTY_ADAPTER_TRANSPILE_FAILED:${transpileErrors.map((item) => item.messageText).join('|')}`);
writeFileSync(resolve(compiledRoot, 'getty-provenance-index.js'), transpiled.outputText, 'utf8');
const { parseGettyHistoricalTransaction } = await import(pathToFileURL(resolve(compiledRoot, 'getty-provenance-index.js')).href);

const observation = JSON.parse(readFileSync(observationPath, 'utf8'));
const saleRaw = readFileSync(salePath, 'utf8');
const objectRaw = readFileSync(objectPath, 'utf8');
const positive = await parseGettyHistoricalTransaction(observation, saleRaw, objectRaw);
const replay = await parseGettyHistoricalTransaction(observation, saleRaw, objectRaw);
assert.deepEqual(replay, positive);
assert.equal(positive.decision_state, 'NORMALIZED_REFERENCE_REPLAY_NOT_ADMISSIBLE', JSON.stringify(positive));
assert.equal(positive.adapter_state, 'REFERENCE_REPLAY_CONTROL_ONLY');
assert.equal(positive.committed_reference_snapshots_verified, 2);
assert.equal(positive.immutable_live_snapshots_verified, 0);
assert.equal(positive.machine_proven_acquisition_receipts, 0);
assert.equal(positive.purpose_specific_rights_verified, true);
assert.equal(positive.historical_transaction_evidence_ready, false);
assert.equal(positive.promotable, false);
assert.equal(positive.generic_market_event_created, false);
assert.equal(positive.verified_current_sold_event_created, false);
assert.ok(positive.normalized_record);
assert.equal(positive.normalized_record.evidence_class, 'HISTORICAL_TRANSACTION_PROVENANCE');
assert.equal(positive.normalized_record.object_label, 'James Christie');
assert.equal(positive.normalized_record.transaction_state, 'DOCUMENTED_TITLE_TRANSFER');
assert.equal(positive.normalized_record.event_time_precision, 'MONTH');
assert.equal(positive.normalized_record.documented_transaction_amount, 1471.13);
assert.equal(positive.normalized_record.currency, 'GBP');
assert.equal(positive.normalized_record.amount_semantics, 'DOCUMENTED_TRANSACTION_AMOUNT_NOT_HAMMER_OR_CURRENT_PRICE');
assert.equal(positive.normalized_record.current_market_signal_eligible, false);
assert.equal(positive.normalized_record.generic_market_event_eligible, false);

const mutatedObservation = (mutator) => {
  const next = structuredClone(observation);
  mutator(next);
  return next;
};
const mutatedJson = (raw, mutator) => {
  const next = JSON.parse(raw);
  mutator(next);
  return JSON.stringify(next);
};
const cases = [
  ['live-acquisition-false-promotion', mutatedObservation((next) => { next.capture.network_requests = 4; }), saleRaw, objectRaw, 'CAPTURE_BOUNDARY_INVALID'],
  ['receipt-false-promotion', mutatedObservation((next) => { next.capture.machine_proven_acquisition_receipts = 1; }), saleRaw, objectRaw, 'CAPTURE_BOUNDARY_INVALID'],
  ['sale-payload-mutated', observation, mutatedJson(saleRaw, (next) => { next._label = 'Mutated'; }), objectRaw, 'SALE_SNAPSHOT_BINDING_INVALID'],
  ['object-payload-mutated', observation, saleRaw, mutatedJson(objectRaw, (next) => { next._label = 'Mutated'; }), 'OBJECT_SNAPSHOT_BINDING_INVALID'],
  ['rights-removed', mutatedObservation((next) => { next.rights.transform = 'UNKNOWN'; }), saleRaw, objectRaw, 'PURPOSE_SPECIFIC_RIGHTS_INVALID'],
  ['rights-ref-substituted', mutatedObservation((next) => { next.rights.evidence_refs = ['https://example.com/']; }), saleRaw, objectRaw, 'PURPOSE_SPECIFIC_RIGHTS_INVALID'],
  ['source-host-substituted', mutatedObservation((next) => { next.source.canonical_host = 'example.com'; }), saleRaw, objectRaw, 'SOURCE_IDENTITY_OR_SCOPE_INVALID'],
  ['top16-false-promotion', mutatedObservation((next) => { next.source.registered_top_16_source_profile = true; }), saleRaw, objectRaw, 'SOURCE_IDENTITY_OR_SCOPE_INVALID'],
  ['current-sold-promotion', mutatedObservation((next) => { next.semantic_boundary.verified_current_sold_event = true; }), saleRaw, objectRaw, 'SEMANTIC_CLAIM_CEILING_INVALID'],
  ['current-price-promotion', mutatedObservation((next) => { next.semantic_boundary.current_price = true; }), saleRaw, objectRaw, 'SEMANTIC_CLAIM_CEILING_INVALID'],
  ['liquidity-promotion', mutatedObservation((next) => { next.semantic_boundary.liquidity = true; }), saleRaw, objectRaw, 'SEMANTIC_CLAIM_CEILING_INVALID'],
  ['generic-event-promotion', mutatedObservation((next) => { next.semantic_boundary.generic_market_event = true; }), saleRaw, objectRaw, 'SEMANTIC_CLAIM_CEILING_INVALID'],
  ['day-precision-promotion', mutatedObservation((next) => { next.semantic_boundary.event_time_precision = 'DAY'; }), saleRaw, objectRaw, 'SEMANTIC_CLAIM_CEILING_INVALID'],
  ['paid-access-promotion', mutatedObservation((next) => { next.capture.paid_access = true; }), saleRaw, objectRaw, 'CAPTURE_BOUNDARY_INVALID'],
  ['sale-etag-substituted', mutatedObservation((next) => { next.snapshots.sale.etag = '"mutated"'; }), saleRaw, objectRaw, 'SALE_SNAPSHOT_BINDING_INVALID'],
  ['object-etag-invented', mutatedObservation((next) => { next.snapshots.object.etag = '"invented"'; next.snapshots.object.etag_state = 'VERIFIED'; }), saleRaw, objectRaw, 'OBJECT_SNAPSHOT_BINDING_INVALID'],
  ['public-release-promotion', mutatedObservation((next) => { next.public_release = 'ALLOW'; }), saleRaw, objectRaw, 'PROTECTED_RELEASE_BOUNDARY_INVALID'],
];
const mutationResults = [];
for (const [name, candidateObservation, candidateSale, candidateObject, expected] of cases) {
  const result = await parseGettyHistoricalTransaction(candidateObservation, candidateSale, candidateObject);
  assert.equal(result.decision_state, 'REJECTED_FAIL_CLOSED', name);
  assert.equal(result.normalized_record, null, name);
  assert.ok(result.reason_codes.includes(expected), `${name}:${result.reason_codes.join(',')}`);
  mutationResults.push({ name, state: result.decision_state, expected_reason: expected });
}

console.log(JSON.stringify({
  id: 'kidults-getty-provenance-index-adapter-test-receipt-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  source_id: 'getty-provenance-index',
  deterministic_replays_verified: 1,
  committed_reference_snapshots_verified: 2,
  immutable_live_snapshots_verified: 0,
  machine_proven_acquisition_receipts: 0,
  purpose_specific_rights_verified: 1,
  positive_reference_records_parsed: 1,
  positive_historical_transactions_parsed: 0,
  negative_mutations_rejected: mutationResults.length,
  mutation_results: mutationResults,
  adapter_result: positive,
  network_requests_executed_by_test: 0,
  evidence_admitted_by_parser: 0,
  historical_transaction_events_created_by_parser: 0,
  generic_market_events_created: 0,
  verified_current_sold_events_created: 0,
  current_prices_created: 0,
  liquidity_measures_created: 0,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
