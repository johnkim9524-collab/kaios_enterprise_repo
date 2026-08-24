#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const typescriptModule = process.env.KIDULTS_TYPESCRIPT_MODULE;
const ts = (await import(typescriptModule
  ? pathToFileURL(resolve(typescriptModule)).href
  : 'typescript')).default;

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(serviceRoot, 'src/asi');
const compiledRoot = mkdtempSync(resolve(tmpdir(), 'kidults-asi-source-adapter-wave4-'));
mkdirSync(resolve(compiledRoot, 'source-adapters'), { recursive: true });
writeFileSync(resolve(compiledRoot, 'package.json'), JSON.stringify({ type: 'module' }));

const files = [
  ['market-adapter.ts', 'market-adapter.js'],
  ['source-adapters/governed-market-surface.ts', 'source-adapters/governed-market-surface.js'],
  ['source-adapters/source-adapter-wave4.ts', 'source-adapters/source-adapter-wave4.js'],
];
for (const [sourceName, outputName] of files) {
  const input = readFileSync(resolve(sourceRoot, sourceName), 'utf8');
  const transpiled = ts.transpileModule(input, {
    fileName: sourceName,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });
  const errors = (transpiled.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) throw new Error(`WAVE4_TRANSPILE_FAILED:${sourceName}:${errors.map((error) => error.messageText).join('|')}`);
  writeFileSync(resolve(compiledRoot, outputName), transpiled.outputText, 'utf8');
}
const runtime = await import(pathToFileURL(resolve(compiledRoot, 'source-adapters/source-adapter-wave4.js')).href);

const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const observedAt = '2026-08-15T12:00:00.000Z';
function snapshot(sourceUrl, payloadObject, overrides = {}) {
  const payload = typeof payloadObject === 'string' ? payloadObject : JSON.stringify(payloadObject);
  return {
    source_url: sourceUrl,
    observed_at: observedAt,
    payload,
    input_snapshot_ref: sha256(`snapshot::${sourceUrl}::${payload}`),
    source_payload_hash: sha256(payload),
    canonical_object_id: 'kidults-object::fixture-wave4',
    condition_segment: 'USED_GOOD',
    evidence_kind: 'SYNTHETIC_CONTROL_ONLY',
    ...overrides,
  };
}
function withPayload(base, value) {
  const payload = typeof value === 'string' ? value : JSON.stringify(value);
  return { ...base, payload, source_payload_hash: sha256(payload), input_snapshot_ref: sha256(`snapshot::${base.source_url}::${payload}`) };
}

const cases = [
  {
    source_id: 'pricecharting-api',
    run: runtime.classifyPriceChartingCurrentValueSnapshot,
    positive: snapshot('https://www.pricecharting.com/api/product', {
      id: 'pc-product-1', product_name: 'Fixture Product', loose_price: 12550,
    }),
    expected_state: 'CONTEXT_ONLY_NOT_TRANSACTION_OR_LIQUIDITY',
    positive_kind: 'CONTEXT',
    semanticMutations: (base) => [
      withPayload(base, { sale_id: 'pc-sale-1', status: 'SOLD', sold_price: 125.50, currency: 'USD', sold_at: '2026-08-01T00:00:00.000Z' }),
      withPayload(base, { id: 'pc-product-1', product_name: 'Fixture Product', current_price: 125.50, currency: 'USD' }),
      withPayload(base, { id: 'pc-product-1', sale_count: 100, liquidity: 'HIGH' }),
    ],
  },
  {
    source_id: 'reverb-price-guide',
    run: runtime.classifyReverbPriceGuideSnapshot,
    positive: snapshot('https://reverb.com/price-guide/model-1', { guide_id: 'model-1', median_price: 1200, currency: 'USD' }),
    expected_state: 'CONTEXT_ONLY_NOT_TRANSACTION_OR_LIQUIDITY',
    positive_kind: 'CONTEXT',
    semanticMutations: (base) => [
      withPayload(base, { guide_id: 'model-1', status: 'SOLD', sold_price: 1200, currency: 'USD', sold_at: '2026-08-01T00:00:00.000Z' }),
      withPayload(base, { guide_id: 'model-1', exposure_denominator_id: 'guide-1', outcome_state: 'SOLD' }),
      withPayload(base, { text: 'Sold for USD 1200' }),
    ],
  },
  {
    source_id: 'hasbro-pulse-collections',
    run: runtime.classifyHasbroPulseCollectionSnapshot,
    positive: snapshot('https://www.hasbropulse.com/collections/transformers', { product_id: 'hp-1', availability: 'AVAILABLE', release_at: '2026-09-01T00:00:00.000Z' }),
    expected_state: 'CONTEXT_ONLY_NOT_TRANSACTION_OR_LIQUIDITY',
    positive_kind: 'CONTEXT',
    semanticMutations: (base) => [
      withPayload(base, { product_id: 'hp-1', status: 'SOLD', sold_price: 100, currency: 'USD' }),
      withPayload(base, { product_id: 'hp-1', outcome_state: 'SOLD', exposure_denominator_id: 'hp-1' }),
      withPayload(base, { product_id: 'hp-1', sold_out: true }),
    ],
  },
  {
    source_id: 'goat-sneaker-marketplace',
    run: runtime.parseGoatExposureSnapshot,
    positive: snapshot('https://www.goat.com/sneakers/fixture-model', {
      listing_id: 'goat-1', listed_at: '2026-07-01T00:00:00.000Z', observed_at: '2026-08-01T00:00:00.000Z',
      outcome_state: 'RIGHT_CENSORED', censoring_state: 'RIGHT_CENSORED_AT_OBSERVATION',
      failed_sale_handling: 'NOT_APPLICABLE', exposure_denominator_id: 'goat-listing-goat-1',
    }),
    expected_state: 'EXPOSURE_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA',
    positive_kind: 'EXPOSURE',
    semanticMutations: exposureMutations,
  },
  {
    source_id: 'comc-marketplace',
    run: runtime.parseComcExposureSnapshot,
    positive: snapshot('https://www.comc.com/Cards/item/comc-1', {
      item_id: 'comc-1', listed_at: '2026-07-01T00:00:00.000Z', observed_at: '2026-08-01T00:00:00.000Z',
      outcome_state: 'SOLD', censoring_state: 'TERMINAL_OBSERVED', failed_sale_handling: 'NOT_APPLICABLE',
      exposure_denominator_id: 'comc-item-comc-1',
    }),
    expected_state: 'EXPOSURE_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA',
    positive_kind: 'EXPOSURE',
    semanticMutations: exposureMutations,
  },
  {
    source_id: 'bricklink-catalog-api',
    run: runtime.parseBrickLinkExposureSnapshot,
    positive: snapshot('https://www.bricklink.com/api/store/v1/inventory/bl-1', {
      inventory_id: 'bl-1', listed_at: '2026-07-01T00:00:00.000Z', observed_at: '2026-08-01T00:00:00.000Z',
      outcome_state: 'UNSOLD', censoring_state: 'TERMINAL_OBSERVED', failed_sale_handling: 'COUNT_AS_UNSOLD',
      exposure_denominator_id: 'bricklink-inventory-bl-1',
    }),
    expected_state: 'EXPOSURE_CANDIDATE_HOLD_RIGHTS_AND_LIVE_SCHEMA',
    positive_kind: 'EXPOSURE',
    semanticMutations: exposureMutations,
  },
  {
    source_id: 'nike-snkrs-launch-calendar',
    run: runtime.classifyNikeSnkrsLaunchSnapshot,
    positive: snapshot('https://www.nike.com/launch/t/fixture-shoe', { style_code: 'NK-1', release_at: '2026-09-01T00:00:00.000Z', availability: 'UPCOMING' }),
    expected_state: 'CONTEXT_ONLY_NOT_TRANSACTION_OR_LIQUIDITY',
    positive_kind: 'CONTEXT',
    semanticMutations: (base) => [
      withPayload(base, { style_code: 'NK-1', status: 'SOLD', sold_price: 180, currency: 'USD' }),
      withPayload(base, { style_code: 'NK-1', outcome_state: 'SOLD', exposure_denominator_id: 'nk-1' }),
      withPayload(base, { style_code: 'NK-1', sold_out: true }),
    ],
  },
];

function exposureMutations(base) {
  const parsed = JSON.parse(base.payload);
  return [
    withPayload(base, { ...parsed, exposure_denominator_id: '' }),
    withPayload(base, { ...parsed, outcome_state: 'ACTIVE' }),
    withPayload(base, { ...parsed, listed_at: '2026-08-02T00:00:00.000Z', observed_at: '2026-08-01T00:00:00.000Z' }),
  ];
}

let deterministicReplays = 0;
let positiveCandidates = 0;
let contextClassifications = 0;
let negativeMutationsRejected = 0;
const sourceResults = [];
for (const item of cases) {
  const first = await item.run(item.positive);
  const second = await item.run(item.positive);
  assert.deepEqual(second, first, `${item.source_id}:REPLAY_NOT_DETERMINISTIC`);
  deterministicReplays += 1;
  assert.equal(first.source_id, item.source_id);
  assert.equal(first.parser_state, item.expected_state, `${item.source_id}:POSITIVE_STATE`);
  assert.equal(first.evidence_admitted, false);
  assert.equal(first.market_event_created, false);
  assert.equal(first.adapter_activated, false);
  if (item.positive_kind === 'TRANSACTION') {
    assert.ok(first.transaction_candidate);
    assert.equal(first.exposure_candidate, null);
    assert.equal(first.generic_runtime_decision?.state, 'HOLD');
    positiveCandidates += 1;
  } else if (item.positive_kind === 'EXPOSURE') {
    assert.ok(first.exposure_candidate);
    assert.equal(first.transaction_candidate, null);
    assert.equal(first.generic_runtime_decision?.state, 'HOLD');
    positiveCandidates += 1;
  } else {
    assert.equal(first.transaction_candidate, null);
    assert.equal(first.exposure_candidate, null);
    assert.equal(first.generic_runtime_decision, null);
    contextClassifications += 1;
  }

  const integrityMutations = [
    { ...item.positive, source_url: item.positive.source_url.replace(new URL(item.positive.source_url).hostname, 'malicious.example.net') },
    { ...item.positive, source_url: item.positive.source_url.replace('https://', 'http://') },
    { ...item.positive, source_url: `https://${new URL(item.positive.source_url).hostname}/forbidden-wave4-path` },
    { ...item.positive, source_payload_hash: sha256('tampered') },
  ];
  for (const mutation of integrityMutations) {
    const result = await item.run(mutation);
    assert.equal(result.parser_state, 'REJECTED_SNAPSHOT_INTEGRITY', `${item.source_id}:INTEGRITY_MUTATION_NOT_REJECTED`);
    assert.equal(result.evidence_admitted, false);
    negativeMutationsRejected += 1;
  }
  for (const mutation of item.semanticMutations(item.positive)) {
    const result = await item.run(mutation);
    if (item.positive_kind === 'CONTEXT') {
      assert.equal(result.parser_state, 'CONTEXT_ONLY_NOT_TRANSACTION_OR_LIQUIDITY', `${item.source_id}:CONTEXT_PROMOTION`);
      assert.equal(result.transaction_candidate, null);
      assert.equal(result.exposure_candidate, null);
    } else {
      assert.equal(result.parser_state, 'REJECTED_MARKET_SEMANTICS', `${item.source_id}:SEMANTIC_MUTATION_NOT_REJECTED`);
    }
    assert.equal(result.evidence_admitted, false);
    assert.equal(result.market_event_created, false);
    negativeMutationsRejected += 1;
  }
  sourceResults.push({
    source_id: item.source_id,
    parser_state: first.parser_state,
    positive_kind: item.positive_kind,
    deterministic_replay: 'PASS',
    negative_mutations_rejected: 7,
    evidence_admitted: 0,
  });
}

const profiles = runtime.getWave4SourceAdapterProfiles();
assert.equal(profiles.length, 7);
assert.equal(new Set(profiles.map((profile) => profile.source_id)).size, 7);
assert.equal(deterministicReplays, 7);
assert.equal(positiveCandidates, 3);
assert.equal(contextClassifications, 4);
assert.equal(negativeMutationsRejected, 49);

console.log(JSON.stringify({
  id: 'kidults-asi-source-adapter-wave4-test-receipt-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  source_specific_adapters_implemented: 7,
  total_source_specific_adapters_implemented_in_portfolio: 16,
  remaining_source_specific_adapters: 0,
  deterministic_replays_verified: deterministicReplays,
  positive_fixture_candidates_parsed: positiveCandidates,
  context_only_classifications_verified: contextClassifications,
  negative_fixture_mutations_rejected: negativeMutationsRejected,
  generic_market_adapter_runtime_bindings_verified: 3,
  live_source_snapshots_verified: 0,
  field_purpose_rights_verified_sources: 0,
  source_specific_adapters_activated: 0,
  evidence_admitted: 0,
  market_events_created: 0,
  source_results: sourceResults,
  public_release: 'HOLD',
  production: 'HOLD',
}, null, 2));
