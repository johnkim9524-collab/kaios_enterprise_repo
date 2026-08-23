#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compiledRoot = mkdtempSync(resolve(tmpdir(), 'kidults-public-auction-adapters-'));
mkdirSync(resolve(compiledRoot, 'src/asi/source-adapters'), { recursive: true });
writeFileSync(resolve(compiledRoot, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');

const sources = [
  ['src/asi/market-adapter.ts', 'src/asi/market-adapter.js'],
  ['src/asi/source-adapters/public-auction-result-adapter.ts', 'src/asi/source-adapters/public-auction-result-adapter.js'],
  ['src/asi/source-adapters/registered-public-auction-results.ts', 'src/asi/source-adapters/registered-public-auction-results.js'],
];
for (const [inputRelative, outputRelative] of sources) {
  const source = readFileSync(resolve(serviceRoot, inputRelative), 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: inputRelative,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });
  const errors = (transpiled.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    throw new Error(`PUBLIC_AUCTION_ADAPTER_TRANSPILE_FAILED:${inputRelative}:${errors.map((error) => String(error.messageText)).join('|')}`);
  }
  writeFileSync(resolve(compiledRoot, outputRelative), transpiled.outputText, 'utf8');
}

const runtime = await import(pathToFileURL(resolve(compiledRoot, 'src/asi/source-adapters/registered-public-auction-results.js')).href);
const shared = await import(pathToFileURL(resolve(compiledRoot, 'src/asi/source-adapters/public-auction-result-adapter.js')).href);

const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const snapshotRef = `sha256:${'a'.repeat(64)}`;

const cases = [
  {
    sourceId: 'barrett-jackson-results',
    host: 'www.barrett-jackson.com',
    eventId: 'scottsdale-2026',
    lot: '1234',
    soldText: 'Sold for US$ 125,000',
    expectedPrice: 125000,
    expectedCurrency: 'USD',
  },
  {
    sourceId: 'broad-arrow-results',
    host: 'www.broadarrowauctions.com',
    eventId: 'monterey-2026',
    lot: '88',
    soldText: 'Sold for USD 840,000',
    expectedPrice: 840000,
    expectedCurrency: 'USD',
  },
  {
    sourceId: 'collecting-cars-sold',
    host: 'collectingcars.com',
    eventId: 'uk-2026-collection',
    lot: 'cc-991',
    soldText: 'Sold for £ 72,500',
    expectedPrice: 72500,
    expectedCurrency: 'GBP',
  },
  {
    sourceId: 'iconic-auctioneers-results',
    host: 'www.iconicauctioneers.com',
    eventId: 'silverstone-2026',
    lot: '501',
    soldText: 'Sold for GBP 215,000',
    expectedPrice: 215000,
    expectedCurrency: 'GBP',
  },
];

function htmlFixture(testCase, soldText = testCase.soldText, options = {}) {
  const lotAttribute = options.omitLot ? '' : ` data-lot-number="${testCase.lot}"`;
  const visible = options.scriptOnly ? '<div>Result pending</div>' : `<div class="result">${soldText}</div>`;
  const script = options.scriptOnly ? `<script>window.__result = "${soldText}";</script>` : '';
  return `<html><body><article data-event-id="${testCase.eventId}"${lotAttribute}><time datetime="2026-02-01T12:00:00Z"></time>${visible}${script}</article></body></html>`;
}

function snapshot(testCase, overrides = {}) {
  const html = overrides.html ?? htmlFixture(testCase);
  return {
    source_url: overrides.source_url ?? `https://${testCase.host}/results/record`,
    observed_at: overrides.observed_at ?? '2026-02-02T12:00:00Z',
    html,
    input_snapshot_ref: overrides.input_snapshot_ref ?? snapshotRef,
    source_payload_hash: overrides.source_payload_hash ?? sha256(html),
    canonical_object_id: overrides.canonical_object_id ?? `object:${testCase.sourceId}:${testCase.lot}`,
    condition_segment: overrides.condition_segment ?? 'AS_PRESENTED',
    evidence_kind: overrides.evidence_kind ?? 'SYNTHETIC_CONTROL_ONLY',
  };
}

const profileIds = Object.keys(runtime.registeredPublicAuctionAdapterProfiles).sort();
assert.deepEqual(profileIds, cases.map((item) => item.sourceId).sort());
assert.equal(new Set(profileIds).size, 4);

let positiveCandidatesParsed = 0;
let deterministicReplayPasses = 0;
let negativeMutationsRejected = 0;
const sourceReceipts = [];

for (const testCase of cases) {
  const profile = runtime.getRegisteredPublicAuctionAdapterProfile(testCase.sourceId);
  shared.assertPublicAuctionAdapterProfile(profile);
  assert.equal(profile.source_id, testCase.sourceId);
  assert.ok(profile.allowed_hosts.includes(testCase.host));
  assert.ok(profile.target_claims.includes('DATED_OBSERVED_SOLD_TRANSACTION'));

  const input = snapshot(testCase);
  const first = await runtime.parseRegisteredPublicAuctionSoldSnapshot(testCase.sourceId, input);
  const second = await runtime.parseRegisteredPublicAuctionSoldSnapshot(testCase.sourceId, input);
  assert.deepEqual(second, first, `${testCase.sourceId}:deterministic-replay`);
  deterministicReplayPasses += 1;
  assert.equal(first.parser_state, 'PARSED_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA');
  assert.equal(first.parsed_candidate?.source_id, testCase.sourceId);
  assert.equal(first.parsed_candidate?.realized_price, testCase.expectedPrice);
  assert.equal(first.parsed_candidate?.currency, testCase.expectedCurrency);
  assert.equal(first.parsed_candidate?.event_id, testCase.eventId);
  assert.equal(first.parsed_candidate?.lot_number, testCase.lot);
  assert.equal(first.generic_runtime_decision?.state, 'HOLD');
  assert.equal(first.generic_runtime_decision?.normalized_record, null);
  assert.ok(first.generic_runtime_decision?.reason_codes.includes('FIELD_PURPOSE_RIGHTS_NOT_ALLOW'));
  assert.ok(first.generic_runtime_decision?.reason_codes.includes('ADAPTER_STATE_IMPLEMENTED_NOT_RIGHTS_VERIFIED'));
  assert.equal(first.rights_pass_created, false);
  assert.equal(first.live_schema_verified, false);
  assert.equal(first.sold_semantics_empirically_verified, false);
  assert.equal(first.source_owner_verified, false);
  assert.equal(first.factual_origin_verified, false);
  assert.equal(first.adapter_activated, false);
  assert.equal(first.evidence_admitted, false);
  assert.equal(first.market_event_created, false);
  positiveCandidatesParsed += 1;

  const negativeCases = [
    {
      name: 'estimate-or-listing-is-not-sold',
      input: snapshot(testCase, { html: htmlFixture(testCase, 'Estimate USD 125,000') }),
      expectedState: 'REJECTED_SOLD_SEMANTICS',
      expectedCode: 'LISTING_ESTIMATE_BID_OFFER_OR_RESERVE_IS_NOT_SOLD',
    },
    {
      name: 'ambiguous-dollar-rejected',
      input: snapshot(testCase, { html: htmlFixture(testCase, 'Sold for $ 125,000') }),
      expectedState: 'REJECTED_SOLD_SEMANTICS',
      expectedCode: 'AMBIGUOUS_DOLLAR_CURRENCY',
    },
    {
      name: 'sold-without-price-rejected',
      input: snapshot(testCase, { html: htmlFixture(testCase, 'Sold') }),
      expectedState: 'REJECTED_SOLD_SEMANTICS',
      expectedCode: 'SOLD_WITHOUT_EXPLICIT_REALIZED_PRICE',
    },
    {
      name: 'script-only-sold-rejected',
      input: snapshot(testCase, { html: htmlFixture(testCase, testCase.soldText, { scriptOnly: true }) }),
      expectedState: 'REJECTED_SOLD_SEMANTICS',
      expectedCode: 'EXPLICIT_TERMINAL_SOLD_STATE_MISSING',
    },
    {
      name: 'missing-lot-rejected',
      input: snapshot(testCase, { html: htmlFixture(testCase, testCase.soldText, { omitLot: true }) }),
      expectedState: 'REJECTED_SOLD_SEMANTICS',
      expectedCode: 'LOT_NUMBER_MISSING',
    },
    {
      name: 'payload-hash-mismatch-rejected',
      input: snapshot(testCase, { source_payload_hash: `sha256:${'b'.repeat(64)}` }),
      expectedState: 'REJECTED_SNAPSHOT_INTEGRITY',
      expectedCode: 'SOURCE_PAYLOAD_HASH_MISMATCH',
    },
    {
      name: 'wrong-host-rejected',
      input: snapshot(testCase, { source_url: 'https://unapproved.example.net/results/record' }),
      expectedState: 'REJECTED_SNAPSHOT_INTEGRITY',
      expectedCode: 'SOURCE_HOST_NOT_ALLOWED',
    },
    {
      name: 'non-https-rejected',
      input: snapshot(testCase, { source_url: `http://${testCase.host}/results/record` }),
      expectedState: 'REJECTED_SNAPSHOT_INTEGRITY',
      expectedCode: 'SOURCE_SCHEME_NOT_HTTPS',
    },
  ];

  for (const negative of negativeCases) {
    negative.input.source_payload_hash = negative.name === 'payload-hash-mismatch-rejected'
      ? negative.input.source_payload_hash
      : sha256(negative.input.html);
    const result = await runtime.parseRegisteredPublicAuctionSoldSnapshot(testCase.sourceId, negative.input);
    assert.equal(result.parser_state, negative.expectedState, `${testCase.sourceId}:${negative.name}:state`);
    assert.ok(result.reason_codes.includes(negative.expectedCode), `${testCase.sourceId}:${negative.name}:reason`);
    assert.equal(result.parsed_candidate, null);
    assert.equal(result.generic_runtime_decision, null);
    assert.equal(result.evidence_admitted, false);
    assert.equal(result.market_event_created, false);
    negativeMutationsRejected += 1;
  }

  sourceReceipts.push({
    source_id: testCase.sourceId,
    positive_fixture_parsed: true,
    deterministic_replay: 'PASS',
    negative_mutations_rejected: negativeCases.length,
    live_source_snapshots_verified: 0,
    rights_verified: false,
    adapter_activated: false,
    evidence_admitted: 0,
  });
}

assert.equal(positiveCandidatesParsed, 4);
assert.equal(deterministicReplayPasses, 4);
assert.equal(negativeMutationsRejected, 32);

console.log(JSON.stringify({
  id: 'kidults-asi-public-auction-results-adapter-wave-test-receipt-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  source_specific_adapters_implemented_in_wave: 4,
  total_source_specific_adapters_implemented_after_wave: 5,
  positive_synthetic_control_candidates_parsed: positiveCandidatesParsed,
  deterministic_replay_passes: deterministicReplayPasses,
  negative_fixture_mutations_rejected: negativeMutationsRejected,
  source_receipts: sourceReceipts,
  live_source_snapshots_verified: 0,
  field_purpose_rights_verified_sources: 0,
  adapters_activated: 0,
  evidence_admitted: 0,
  market_events_created: 0,
  public_release: 'HOLD',
  production: 'HOLD',
}, null, 2));
