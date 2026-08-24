#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(serviceRoot, '../..');
const compiledRoot = mkdtempSync(resolve(tmpdir(), 'kidults-source-adapter-wave2-'));
const sourceRoot = resolve(serviceRoot, 'src/asi/source-adapters');
mkdirSync(resolve(compiledRoot, 'source-adapters'), { recursive: true });
writeFileSync(resolve(compiledRoot, 'package.json'), JSON.stringify({ type: 'module' }));

function transpile(sourcePath, outputPath) {
  const result = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
    fileName: sourcePath,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });
  const errors = (result.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) throw new Error(`TRANSPILE_FAILED:${sourcePath}:${errors.map((error) => error.messageText).join('|')}`);
  writeFileSync(outputPath, result.outputText, 'utf8');
}

transpile(resolve(serviceRoot, 'src/asi/market-adapter.ts'), resolve(compiledRoot, 'market-adapter.js'));
transpile(resolve(sourceRoot, 'public-auction-results.ts'), resolve(compiledRoot, 'source-adapters/public-auction-results.js'));
for (const file of [
  'barrett-jackson-results',
  'broad-arrow-results',
  'collecting-cars-sold',
  'iconic-auctioneers-results',
]) transpile(resolve(sourceRoot, `${file}.ts`), resolve(compiledRoot, `source-adapters/${file}.js`));

const contract = JSON.parse(readFileSync(resolve(repositoryRoot, 'coordination/kidults/source-intelligence/asi-source-adapter-wave2-contract-v1.json'), 'utf8'));
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const snapshotRef = `sha256:${'1'.repeat(64)}`;

const definitions = [
  {
    source_id: 'barrett-jackson-results',
    module: 'barrett-jackson-results',
    parse: 'parseBarrettJacksonSoldSnapshot',
    profile: 'getBarrettJacksonAdapterProfile',
    source_url: 'https://www.barrett-jackson.com/Archive/Event/Results/scottsdale-2025',
    html: '<article data-event-id="scottsdale-2025" data-lot-number="1234" data-result-state="SOLD" data-realized-price="275000" data-currency="USD"><time datetime="2025-01-26T18:00:00Z"></time><p>Sold Price USD 275,000</p></article>',
    expected_record_id: 'barrett-jackson::event:scottsdale-2025::lot:1234',
    expected_price: 275000,
    expected_currency: 'USD',
  },
  {
    source_id: 'broad-arrow-results',
    module: 'broad-arrow-results',
    parse: 'parseBroadArrowSoldSnapshot',
    profile: 'getBroadArrowAdapterProfile',
    source_url: 'https://www.broadarrowauctions.com/auction-results/monterey-2025/lot/42',
    html: '<article data-event-id="monterey-2025" data-lot-number="42"><time datetime="2025-08-15T20:00:00Z"></time><p>Sold for USD 425,000</p></article>',
    expected_record_id: 'broad-arrow::event:monterey-2025::lot:42',
    expected_price: 425000,
    expected_currency: 'USD',
  },
  {
    source_id: 'collecting-cars-sold',
    module: 'collecting-cars-sold',
    parse: 'parseCollectingCarsSoldSnapshot',
    profile: 'getCollectingCarsAdapterProfile',
    source_url: 'https://collectingcars.com/sold/2021-porsche-911-gt3',
    html: '<article data-event-id="2021-porsche-911-gt3" data-lot-number="cc-7788"><time datetime="2025-04-18T12:00:00Z"></time><p>Sold at GBP 123,456</p></article>',
    expected_record_id: 'collecting-cars::event:2021-porsche-911-gt3::lot:cc-7788',
    expected_price: 123456,
    expected_currency: 'GBP',
  },
  {
    source_id: 'iconic-auctioneers-results',
    module: 'iconic-auctioneers-results',
    parse: 'parseIconicAuctioneersSoldSnapshot',
    profile: 'getIconicAuctioneersAdapterProfile',
    source_url: 'https://www.iconicauctioneers.com/auction-results/nec-2025/lot/88',
    html: '<article data-event-id="nec-2025" data-lot-number="88"><time datetime="2025-11-09T16:00:00Z"></time><p>Sale Price EUR 98,000</p></article>',
    expected_record_id: 'iconic-auctioneers::event:nec-2025::lot:88',
    expected_price: 98000,
    expected_currency: 'EUR',
  },
];

assert.equal(contract.id, 'kidults-asi-source-adapter-wave2-contract-v1');
assert.deepEqual(contract.platform_principles, ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT']);
assert.equal(contract.source_adapters.length, 4);
assert.equal(contract.truth_boundary.evidence_admitted, 0);

let replayPass = 0;
let positiveParsed = 0;
let negativeRejected = 0;
for (const definition of definitions) {
  const runtime = await import(pathToFileURL(resolve(compiledRoot, `source-adapters/${definition.module}.js`)).href);
  const parse = runtime[definition.parse];
  const profile = runtime[definition.profile]();
  assert.equal(profile.source_id, definition.source_id);
  assert.equal(profile.adapter_state, 'IMPLEMENTED_NOT_RIGHTS_VERIFIED');
  assert.equal(profile.provider_direct_to_index_or_projection_allowed, false);
  assert.ok(profile.target_claims.includes('DATED_OBSERVED_SOLD_TRANSACTION'));

  const validSnapshot = {
    source_url: definition.source_url,
    observed_at: '2026-08-23T18:00:00Z',
    html: definition.html,
    input_snapshot_ref: snapshotRef,
    source_payload_hash: sha256(definition.html),
    canonical_object_id: `vehicle::fixture::${definition.source_id}`,
    condition_segment: 'COLLECTOR_CAR_AUCTION_CONDITION_UNVERIFIED',
    evidence_kind: 'SYNTHETIC_CONTROL_ONLY',
  };
  const first = await parse(validSnapshot);
  const replay = await parse(structuredClone(validSnapshot));
  assert.deepEqual(replay, first, `REPLAY_NOT_DETERMINISTIC:${definition.source_id}`);
  replayPass += 1;
  assert.equal(first.parser_state, 'PARSED_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA');
  assert.equal(first.parsed_candidate.source_record_id, definition.expected_record_id);
  assert.equal(first.parsed_candidate.realized_price, definition.expected_price);
  assert.equal(first.parsed_candidate.currency, definition.expected_currency);
  assert.equal(first.generic_runtime_decision.state, 'HOLD');
  assert.ok(first.generic_runtime_decision.reason_codes.includes('ADAPTER_STATE_IMPLEMENTED_NOT_RIGHTS_VERIFIED'));
  assert.ok(first.generic_runtime_decision.reason_codes.includes('FIELD_PURPOSE_RIGHTS_NOT_ALLOW'));
  assert.equal(first.generic_runtime_decision.normalized_record, null);
  assert.equal(first.rights_pass_created, false);
  assert.equal(first.live_schema_verified, false);
  assert.equal(first.evidence_admitted, false);
  assert.equal(first.market_event_created, false);
  positiveParsed += 1;

  const semanticCases = [
    ['estimate-not-sold', '<article data-event-id="e1" data-lot-number="l1"><time datetime="2025-01-01T00:00:00Z"></time>Estimate USD 100,000</article>', 'LISTING_ESTIMATE_BID_OFFER_OR_RESERVE_IS_NOT_SOLD'],
    ['ambiguous-dollar', '<article data-event-id="e1" data-lot-number="l1"><time datetime="2025-01-01T00:00:00Z"></time>Sold for $100,000</article>', 'AMBIGUOUS_DOLLAR_CURRENCY'],
    ['sold-without-price', '<article data-event-id="e1" data-lot-number="l1"><time datetime="2025-01-01T00:00:00Z"></time>Sold</article>', 'SOLD_WITHOUT_EXPLICIT_REALIZED_PRICE'],
    ['script-only-sold', '<script>const x="Sold for USD 100,000"</script><article data-event-id="e1" data-lot-number="l1"><time datetime="2025-01-01T00:00:00Z"></time>Estimate USD 100,000</article>', 'EXPLICIT_TERMINAL_SOLD_STATE_MISSING'],
    ['missing-lot', '<article data-event-id="e1"><time datetime="2025-01-01T00:00:00Z"></time>Sold for USD 100,000</article>', 'LOT_NUMBER_MISSING'],
    ['terminal-unsold', '<article data-event-id="e1" data-lot-number="l1" data-result-state="UNSOLD"><time datetime="2025-01-01T00:00:00Z"></time></article>', 'TERMINAL_STATE_NOT_SOLD'],
  ];
  for (const [caseId, html, reason] of semanticCases) {
    const snapshot = { ...validSnapshot, html, source_payload_hash: sha256(html) };
    const result = await parse(snapshot);
    assert.equal(result.parser_state, 'REJECTED_SOLD_SEMANTICS', `${definition.source_id}:${caseId}`);
    assert.ok(result.reason_codes.includes(reason), `${definition.source_id}:${caseId}:${result.reason_codes.join(',')}`);
    assert.equal(result.evidence_admitted, false);
    negativeRejected += 1;
  }

  const integrityCases = [
    ['bad-hash', { source_payload_hash: `sha256:${'0'.repeat(64)}` }, 'SOURCE_PAYLOAD_HASH_MISMATCH'],
    ['wrong-host', { source_url: 'https://example.invalid/auction-results/e1' }, 'SOURCE_HOST_NOT_ALLOWED'],
    ['non-https', { source_url: definition.source_url.replace('https:', 'http:') }, 'SOURCE_SCHEME_NOT_HTTPS'],
    ['wrong-path', { source_url: new URL('/about', definition.source_url).toString() }, 'SOURCE_PATH_NOT_ALLOWED'],
  ];
  for (const [caseId, mutation, reason] of integrityCases) {
    const result = await parse({ ...validSnapshot, ...mutation });
    assert.equal(result.parser_state, 'REJECTED_SNAPSHOT_INTEGRITY', `${definition.source_id}:${caseId}`);
    assert.ok(result.reason_codes.includes(reason), `${definition.source_id}:${caseId}:${result.reason_codes.join(',')}`);
    assert.equal(result.evidence_admitted, false);
    negativeRejected += 1;
  }
}

assert.equal(positiveParsed, 4);
assert.equal(replayPass, 4);
assert.equal(negativeRejected, 40);

const receipt = {
  id: 'kidults-asi-source-adapter-wave2-test-receipt-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  source_ids: definitions.map((definition) => definition.source_id),
  source_specific_adapters_implemented: 4,
  total_source_specific_adapters_implemented_in_portfolio: 5,
  deterministic_replays_verified: replayPass,
  positive_fixture_candidates_parsed: positiveParsed,
  negative_fixture_mutations_rejected: negativeRejected,
  generic_market_adapter_runtime_bound: true,
  live_source_snapshots_verified: 0,
  field_purpose_rights_verified_sources: 0,
  source_specific_adapters_activated: 0,
  evidence_admitted: 0,
  market_events_created: 0,
  public_release: 'HOLD',
  production: 'HOLD',
};
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
