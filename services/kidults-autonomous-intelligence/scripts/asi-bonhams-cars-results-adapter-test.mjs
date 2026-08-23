#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(serviceRoot, '../..');
const marketAdapterPath = resolve(serviceRoot, 'src/asi/market-adapter.ts');
const sourceAdapterPath = resolve(serviceRoot, 'src/asi/source-adapters/bonhams-cars-results.ts');
const contractPath = resolve(repositoryRoot, 'coordination/kidults/source-intelligence/asi-bonhams-cars-results-adapter-contract-v1.json');
const compiledRoot = mkdtempSync(resolve(tmpdir(), 'kidults-bonhams-cars-adapter-'));
mkdirSync(resolve(compiledRoot, 'source-adapters'), { recursive: true });
writeFileSync(resolve(compiledRoot, 'package.json'), JSON.stringify({ type: 'module' }));

function transpile(sourcePath, outputPath) {
  const input = readFileSync(sourcePath, 'utf8');
  const result = ts.transpileModule(input, {
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

transpile(marketAdapterPath, resolve(compiledRoot, 'market-adapter.js'));
transpile(sourceAdapterPath, resolve(compiledRoot, 'source-adapters/bonhams-cars-results.js'));
const adapter = await import(pathToFileURL(resolve(compiledRoot, 'source-adapters/bonhams-cars-results.js')).href);
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const snapshotRef = `sha256:${'1'.repeat(64)}`;
const validHtml = `<!doctype html>
<html><head><script type="application/ld+json">{"@type":"Event","startDate":"2025-06-29T11:00:00Z"}</script></head>
<body><article data-auction-id="30599" data-lot-number="17"><h1>1964 Aston Martin DB5</h1><p>Sold for £1,250,000 inc. premium</p></article></body></html>`;
const validSnapshot = {
  source_url: 'https://cars.bonhams.com/auction/30599/the-goodwood-sale/lot/17/',
  observed_at: '2025-06-30T12:00:00Z',
  html: validHtml,
  input_snapshot_ref: snapshotRef,
  source_payload_hash: sha256(validHtml),
  canonical_object_id: 'vehicle::aston-martin::db5::1964::fixture-001',
  condition_segment: 'COLLECTOR_CAR_AUCTION_CONDITION_UNVERIFIED',
  evidence_kind: 'SYNTHETIC_CONTROL_ONLY',
};

assert.equal(contract.id, 'kidults-asi-bonhams-cars-results-adapter-contract-v1');
assert.equal(contract.version, '1.0.0');
assert.deepEqual(contract.platform_principles, ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT']);
assert.equal(contract.source_profile.adapter_state, 'IMPLEMENTED_NOT_RIGHTS_VERIFIED');
assert.equal(contract.fixture_policy.fixtures_can_create_market_event_or_claim, false);

const profile = adapter.getBonhamsCarsReferenceAdapterProfile();
assert.equal(profile.source_id, 'bonhams-cars-results');
assert.equal(profile.adapter_state, 'IMPLEMENTED_NOT_RIGHTS_VERIFIED');
assert.equal(profile.provider_direct_to_index_or_projection_allowed, false);
assert.ok(profile.target_claims.includes('DATED_OBSERVED_SOLD_TRANSACTION'));

const first = await adapter.parseBonhamsCarsSoldSnapshot(validSnapshot);
const replay = await adapter.parseBonhamsCarsSoldSnapshot(structuredClone(validSnapshot));
assert.deepEqual(replay, first, 'BONHAMS_REFERENCE_ADAPTER_REPLAY_NOT_DETERMINISTIC');
assert.equal(first.parser_state, 'PARSED_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA');
assert.equal(first.parsed_candidate.source_record_id, 'bonhams-cars::auction:30599::lot:17');
assert.equal(first.parsed_candidate.realized_price, 1250000);
assert.equal(first.parsed_candidate.currency, 'GBP');
assert.equal(first.parsed_candidate.event_at, '2025-06-29T11:00:00.000Z');
assert.equal(first.parsed_candidate.source_owner_verified, false);
assert.equal(first.parsed_candidate.factual_origin_verified, false);
assert.equal(first.generic_runtime_decision.state, 'HOLD');
assert.ok(first.generic_runtime_decision.reason_codes.includes('ADAPTER_STATE_IMPLEMENTED_NOT_RIGHTS_VERIFIED'));
assert.ok(first.generic_runtime_decision.reason_codes.includes('FIELD_PURPOSE_RIGHTS_NOT_ALLOW'));
assert.ok(first.generic_runtime_decision.reason_codes.includes('MISSING_COLLECT_RIGHT'));
assert.equal(first.generic_runtime_decision.normalized_record, null);
assert.equal(first.rights_pass_created, false);
assert.equal(first.evidence_admitted, false);
assert.equal(first.market_event_created, false);

const cases = [
  {
    id: 'estimate-is-not-sold',
    html: '<article data-auction-id="1" data-lot-number="2"><time datetime="2025-01-01T10:00:00Z"></time>Estimate £100,000 - £150,000</article>',
    expected: 'LISTING_ESTIMATE_BID_OFFER_OR_RESERVE_IS_NOT_SOLD',
  },
  {
    id: 'ambiguous-dollar-rejected',
    html: '<article data-auction-id="1" data-lot-number="2"><time datetime="2025-01-01T10:00:00Z"></time>Sold for $125,000</article>',
    expected: 'AMBIGUOUS_DOLLAR_CURRENCY',
  },
  {
    id: 'sold-without-price-rejected',
    html: '<article data-auction-id="1" data-lot-number="2"><time datetime="2025-01-01T10:00:00Z"></time>Sold</article>',
    expected: 'SOLD_WITHOUT_EXPLICIT_REALIZED_PRICE',
  },
  {
    id: 'script-only-sold-is-not-semantic-proof',
    html: '<script>const x="Sold for £125,000"</script><article data-auction-id="1" data-lot-number="2"><time datetime="2025-01-01T10:00:00Z"></time>Estimate £100,000</article>',
    expected: 'EXPLICIT_TERMINAL_SOLD_STATE_MISSING',
  },
  {
    id: 'missing-lot-number-rejected',
    html: '<article data-auction-id="1"><time datetime="2025-01-01T10:00:00Z"></time>Sold for £125,000</article>',
    expected: 'LOT_NUMBER_MISSING',
  },
];
for (const testCase of cases) {
  const snapshot = { ...validSnapshot, source_url: 'https://cars.bonhams.com/auction/1/test/', html: testCase.html, source_payload_hash: sha256(testCase.html) };
  const result = await adapter.parseBonhamsCarsSoldSnapshot(snapshot);
  assert.equal(result.parser_state, 'REJECTED_SOLD_SEMANTICS', testCase.id);
  assert.ok(result.reason_codes.includes(testCase.expected), `${testCase.id}:${result.reason_codes.join(',')}`);
  assert.equal(result.parsed_candidate, null);
  assert.equal(result.evidence_admitted, false);
}

const badHash = await adapter.parseBonhamsCarsSoldSnapshot({ ...validSnapshot, source_payload_hash: `sha256:${'0'.repeat(64)}` });
assert.equal(badHash.parser_state, 'REJECTED_SNAPSHOT_INTEGRITY');
assert.ok(badHash.reason_codes.includes('SOURCE_PAYLOAD_HASH_MISMATCH'));
const badHost = await adapter.parseBonhamsCarsSoldSnapshot({ ...validSnapshot, source_url: 'https://example.invalid/auction/30599/lot/17/' });
assert.equal(badHost.parser_state, 'REJECTED_SNAPSHOT_INTEGRITY');
assert.ok(badHost.reason_codes.includes('SOURCE_HOST_NOT_ALLOWED'));
const badScheme = await adapter.parseBonhamsCarsSoldSnapshot({ ...validSnapshot, source_url: 'http://cars.bonhams.com/auction/30599/lot/17/' });
assert.equal(badScheme.parser_state, 'REJECTED_SNAPSHOT_INTEGRITY');
assert.ok(badScheme.reason_codes.includes('SOURCE_SCHEME_NOT_HTTPS'));

const receipt = {
  id: 'kidults-asi-bonhams-cars-results-adapter-test-receipt-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  source_id: 'bonhams-cars-results',
  source_specific_parser_implemented: true,
  generic_market_adapter_runtime_bound: true,
  deterministic_replay_verified: true,
  positive_fixture_candidates_parsed: 1,
  negative_fixture_mutations_rejected: cases.length + 3,
  live_source_snapshots_verified: 0,
  field_purpose_rights_verified: false,
  source_schema_empirically_verified: false,
  sold_semantics_empirically_verified: false,
  adapter_activated: false,
  evidence_admitted: 0,
  market_events_created: 0,
  public_release: 'HOLD',
  production: 'HOLD',
};
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
