#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compiledRoot = mkdtempSync(resolve(tmpdir(), 'kidults-asi-auction-wave2-'));
mkdirSync(resolve(compiledRoot, 'source-adapters'), { recursive: true });
writeFileSync(resolve(compiledRoot, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');

function compile(relativeSource, relativeOutput) {
  const sourcePath = resolve(serviceRoot, relativeSource);
  const input = readFileSync(sourcePath, 'utf8');
  const transpiled = ts.transpileModule(input, {
    fileName: sourcePath,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });
  const errors = (transpiled.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    throw new Error(`ASI_AUCTION_WAVE2_TRANSPILE_FAILED:${relativeSource}:${errors.map((error) => error.messageText).join('|')}`);
  }
  const outputPath = resolve(compiledRoot, relativeOutput);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, transpiled.outputText, 'utf8');
}

compile('src/asi/market-adapter.ts', 'market-adapter.js');
compile('src/asi/source-adapters/public-auction-results-common.ts', 'source-adapters/public-auction-results-common.js');
compile('src/asi/source-adapters/barrett-jackson-results.ts', 'source-adapters/barrett-jackson-results.js');
compile('src/asi/source-adapters/broad-arrow-results.ts', 'source-adapters/broad-arrow-results.js');
compile('src/asi/source-adapters/collecting-cars-sold.ts', 'source-adapters/collecting-cars-sold.js');
compile('src/asi/source-adapters/iconic-auctioneers-results.ts', 'source-adapters/iconic-auctioneers-results.js');

const modules = {
  'barrett-jackson-results': await import(pathToFileURL(resolve(compiledRoot, 'source-adapters/barrett-jackson-results.js')).href),
  'broad-arrow-results': await import(pathToFileURL(resolve(compiledRoot, 'source-adapters/broad-arrow-results.js')).href),
  'collecting-cars-sold': await import(pathToFileURL(resolve(compiledRoot, 'source-adapters/collecting-cars-sold.js')).href),
  'iconic-auctioneers-results': await import(pathToFileURL(resolve(compiledRoot, 'source-adapters/iconic-auctioneers-results.js')).href),
};

const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const snapshotRef = (sourceId) => sha256(`immutable-snapshot-control:${sourceId}`);
const observedAt = '2026-08-23T18:00:00.000Z';
const eventAt = '2026-08-20T18:00:00.000Z';

const cases = [
  {
    source_id: 'barrett-jackson-results',
    parse: modules['barrett-jackson-results'].parseBarrettJacksonSoldSnapshot,
    profile: modules['barrett-jackson-results'].getBarrettJacksonAdapterProfile,
    source_url: 'https://www.barrett-jackson.com/Archive/Event/Results/scottsdale-2026',
    event_id: 'scottsdale-2026',
    lot_number: 'BJ-101',
    sold_text: 'Sold Price: US$ 165,000',
    expected_currency: 'USD',
    expected_price: 165000,
  },
  {
    source_id: 'broad-arrow-results',
    parse: modules['broad-arrow-results'].parseBroadArrowSoldSnapshot,
    profile: modules['broad-arrow-results'].getBroadArrowAdapterProfile,
    source_url: 'https://www.broadarrowauctions.com/results/monterey-2026',
    event_id: 'monterey-2026',
    lot_number: 'BA-202',
    sold_text: 'Sold for USD 245,000',
    expected_currency: 'USD',
    expected_price: 245000,
  },
  {
    source_id: 'collecting-cars-sold',
    parse: modules['collecting-cars-sold'].parseCollectingCarsSoldSnapshot,
    profile: modules['collecting-cars-sold'].getCollectingCarsAdapterProfile,
    source_url: 'https://collectingcars.com/sold/heritage-2026',
    event_id: 'heritage-2026',
    lot_number: 'CC-303',
    sold_text: 'Sold for £85,500',
    expected_currency: 'GBP',
    expected_price: 85500,
  },
  {
    source_id: 'iconic-auctioneers-results',
    parse: modules['iconic-auctioneers-results'].parseIconicAuctioneersSoldSnapshot,
    profile: modules['iconic-auctioneers-results'].getIconicAuctioneersAdapterProfile,
    source_url: 'https://www.iconicauctioneers.com/auction-results/classic-sale-2026',
    event_id: 'classic-sale-2026',
    lot_number: 'IA-404',
    sold_text: 'Sold for GBP 62,000',
    expected_currency: 'GBP',
    expected_price: 62000,
  },
];

function htmlFor(testCase, { soldText = testCase.sold_text, includeLot = true, scriptOnly = false } = {}) {
  const visibleSold = scriptOnly ? '' : `<div class="result">${soldText}</div>`;
  const scriptSold = scriptOnly ? `<script>window.result = ${JSON.stringify(soldText)};</script>` : '';
  return `<article data-event-id="${testCase.event_id}"${includeLot ? ` data-lot-number="${testCase.lot_number}"` : ''}>
    <time datetime="${eventAt}">${eventAt}</time>
    <h1>Collector Vehicle Result</h1>
    ${visibleSold}
    ${scriptSold}
  </article>`;
}

function makeSnapshot(testCase, overrides = {}) {
  const html = overrides.html ?? htmlFor(testCase);
  return {
    source_url: overrides.source_url ?? testCase.source_url,
    observed_at: overrides.observed_at ?? observedAt,
    html,
    input_snapshot_ref: overrides.input_snapshot_ref ?? snapshotRef(testCase.source_id),
    source_payload_hash: overrides.source_payload_hash ?? sha256(html),
    canonical_object_id: overrides.canonical_object_id ?? `object:${testCase.source_id}:control-1`,
    condition_segment: overrides.condition_segment ?? 'COMPLETE_RUNNING_DRIVER_QUALITY',
    evidence_kind: overrides.evidence_kind ?? 'SYNTHETIC_CONTROL_ONLY',
  };
}

let positiveParsed = 0;
let replayVerified = 0;
let negativeRejected = 0;
let runtimeBindingsVerified = 0;
const negativeFamilies = [
  'ESTIMATE_IS_NOT_SOLD',
  'AMBIGUOUS_DOLLAR_CURRENCY',
  'SOLD_WITHOUT_EXPLICIT_PRICE',
  'SCRIPT_ONLY_SOLD_SIGNAL',
  'MISSING_LOT_IDENTIFIER',
  'PAYLOAD_HASH_MISMATCH',
  'SOURCE_HOST_NOT_ALLOWED',
  'NON_HTTPS_SOURCE',
];

for (const testCase of cases) {
  const profile = testCase.profile();
  assert.equal(profile.source_id, testCase.source_id, `${testCase.source_id}:profile-source`);
  assert.equal(profile.adapter_state, 'IMPLEMENTED_NOT_RIGHTS_VERIFIED', `${testCase.source_id}:profile-state`);
  assert.equal(profile.provider_direct_to_index_or_projection_allowed, false, `${testCase.source_id}:direct-path`);

  const positive = makeSnapshot(testCase);
  const first = await testCase.parse(positive);
  const second = await testCase.parse(positive);
  assert.deepEqual(second, first, `${testCase.source_id}:deterministic-replay`);
  replayVerified += 1;
  assert.equal(first.parser_state, 'PARSED_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA', `${testCase.source_id}:positive-state`);
  assert.equal(first.parsed_candidate?.source_id, testCase.source_id, `${testCase.source_id}:candidate-source`);
  assert.equal(first.parsed_candidate?.event_id, testCase.event_id, `${testCase.source_id}:event-id`);
  assert.equal(first.parsed_candidate?.lot_number, testCase.lot_number, `${testCase.source_id}:lot-id`);
  assert.equal(first.parsed_candidate?.currency, testCase.expected_currency, `${testCase.source_id}:currency`);
  assert.equal(first.parsed_candidate?.realized_price, testCase.expected_price, `${testCase.source_id}:price`);
  assert.equal(first.generic_runtime_decision?.state, 'HOLD', `${testCase.source_id}:runtime-hold`);
  assert.ok(first.generic_runtime_decision?.reason_codes.includes('FIELD_PURPOSE_RIGHTS_NOT_ALLOW'), `${testCase.source_id}:rights-hold`);
  assert.ok(first.generic_runtime_decision?.reason_codes.includes('ADAPTER_STATE_IMPLEMENTED_NOT_RIGHTS_VERIFIED'), `${testCase.source_id}:activation-hold`);
  assert.equal(first.evidence_admitted, false, `${testCase.source_id}:no-admission`);
  assert.equal(first.market_event_created, false, `${testCase.source_id}:no-market-event`);
  positiveParsed += 1;
  runtimeBindingsVerified += 1;

  const mutations = [
    {
      family: 'ESTIMATE_IS_NOT_SOLD',
      snapshot: makeSnapshot(testCase, { html: htmlFor(testCase, { soldText: 'Estimate USD 100,000 - 150,000' }) }),
      expected_state: 'REJECTED_SOLD_SEMANTICS',
    },
    {
      family: 'AMBIGUOUS_DOLLAR_CURRENCY',
      snapshot: makeSnapshot(testCase, { html: htmlFor(testCase, { soldText: 'Sold for $125,000' }) }),
      expected_state: 'REJECTED_SOLD_SEMANTICS',
    },
    {
      family: 'SOLD_WITHOUT_EXPLICIT_PRICE',
      snapshot: makeSnapshot(testCase, { html: htmlFor(testCase, { soldText: 'Sold' }) }),
      expected_state: 'REJECTED_SOLD_SEMANTICS',
    },
    {
      family: 'SCRIPT_ONLY_SOLD_SIGNAL',
      snapshot: makeSnapshot(testCase, { html: htmlFor(testCase, { scriptOnly: true }) }),
      expected_state: 'REJECTED_SOLD_SEMANTICS',
    },
    {
      family: 'MISSING_LOT_IDENTIFIER',
      snapshot: makeSnapshot(testCase, { html: htmlFor(testCase, { includeLot: false }) }),
      expected_state: 'REJECTED_SOLD_SEMANTICS',
    },
    {
      family: 'PAYLOAD_HASH_MISMATCH',
      snapshot: makeSnapshot(testCase, { source_payload_hash: `sha256:${'0'.repeat(64)}` }),
      expected_state: 'REJECTED_SNAPSHOT_INTEGRITY',
    },
    {
      family: 'SOURCE_HOST_NOT_ALLOWED',
      snapshot: makeSnapshot(testCase, { source_url: 'https://untrusted.example.org/results/control' }),
      expected_state: 'REJECTED_SNAPSHOT_INTEGRITY',
    },
    {
      family: 'NON_HTTPS_SOURCE',
      snapshot: makeSnapshot(testCase, { source_url: testCase.source_url.replace('https://', 'http://') }),
      expected_state: 'REJECTED_SNAPSHOT_INTEGRITY',
    },
  ];
  assert.deepEqual(mutations.map((mutation) => mutation.family), negativeFamilies, `${testCase.source_id}:negative-family-order`);
  for (const mutation of mutations) {
    const result = await testCase.parse(mutation.snapshot);
    assert.equal(result.parser_state, mutation.expected_state, `${testCase.source_id}:${mutation.family}`);
    assert.equal(result.parsed_candidate, null, `${testCase.source_id}:${mutation.family}:candidate-null`);
    assert.equal(result.evidence_admitted, false, `${testCase.source_id}:${mutation.family}:no-admission`);
    assert.equal(result.market_event_created, false, `${testCase.source_id}:${mutation.family}:no-market-event`);
    negativeRejected += 1;
  }
}

assert.equal(positiveParsed, 4);
assert.equal(replayVerified, 4);
assert.equal(runtimeBindingsVerified, 4);
assert.equal(negativeRejected, 32);

console.log(JSON.stringify({
  id: 'kidults-asi-auction-adapter-wave2-test-receipt-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  source_specific_adapters_implemented: cases.length,
  source_ids: cases.map((testCase) => testCase.source_id),
  generic_market_adapter_runtime_bindings_verified: runtimeBindingsVerified,
  deterministic_replays_verified: replayVerified,
  positive_synthetic_control_candidates_parsed: positiveParsed,
  negative_fixture_mutations_rejected: negativeRejected,
  negative_mutation_families_per_source: negativeFamilies.length,
  live_source_snapshots_verified: 0,
  field_purpose_rights_verified_sources: 0,
  source_specific_adapters_activated: 0,
  evidence_admitted: 0,
  market_events_created: 0,
  public_release: 'HOLD',
  production: 'HOLD',
}, null, 2));
