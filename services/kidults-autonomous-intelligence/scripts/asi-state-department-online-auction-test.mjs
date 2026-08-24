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
const repoRoot = resolve(serviceRoot, '../..');
const sourcePath = resolve(serviceRoot, 'src/asi/source-adapters/state-department-online-auction.ts');
const observationPath = process.argv[2] || resolve(repoRoot, 'coordination/kidults/source-intelligence/state-department-camera-auction-observation-v1.json');
const contractPath = process.argv[3] || resolve(repoRoot, 'coordination/kidults/source-intelligence/asi-state-department-camera-evidence-contract-v1.json');

const compiledRoot = mkdtempSync(resolve(tmpdir(), 'kidults-state-department-auction-adapter-'));
mkdirSync(compiledRoot, { recursive: true });
writeFileSync(resolve(compiledRoot, 'package.json'), JSON.stringify({ type: 'module' }));
const transpiled = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
  fileName: 'state-department-online-auction.ts',
  reportDiagnostics: true,
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
});
const transpileErrors = (transpiled.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
if (transpileErrors.length > 0) throw new Error(`STATE_DEPARTMENT_ADAPTER_TRANSPILE_FAILED:${transpileErrors.map((error) => error.messageText).join('|')}`);
writeFileSync(resolve(compiledRoot, 'state-department-online-auction.js'), transpiled.outputText, 'utf8');
const { parseStateDepartmentAuctionObservation } = await import(pathToFileURL(resolve(compiledRoot, 'state-department-online-auction.js')).href);

const observation = JSON.parse(readFileSync(observationPath, 'utf8'));
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const projectionHash = (value) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const withMutation = (mutator, { rehash = true } = {}) => {
  const next = structuredClone(observation);
  mutator(next);
  if (rehash) next.projection_sha256 = projectionHash(next.source_projection);
  return next;
};

const positive = await parseStateDepartmentAuctionObservation(observation, contract.authoritative_inputs.observation_projection_sha256);
const replay = await parseStateDepartmentAuctionObservation(observation, contract.authoritative_inputs.observation_projection_sha256);
assert.deepEqual(replay, positive);
assert.equal(positive.decision_state, 'NORMALIZED_REFERENCE_READY_FOR_ADMISSION_GATE');
assert.equal(positive.adapter_state, 'EXACT_PROJECTION_REFERENCE_VALIDATOR_ACTIVE');
assert.equal(positive.activation_scope, 'EXACT_DIGEST_BOUND_AUCTION_RESULT_REFERENCE_ONLY');
assert.equal(positive.field_purpose_rights_preflight_pass, true);
assert.equal(positive.source_owner_verified, true);
assert.equal(positive.factual_origin_verified, true);
assert.equal(positive.bounded_primary_source_fact_projection_validated, true);
assert.equal(positive.raw_live_source_snapshot_verified, false);
assert.equal(positive.evidence_admitted, false);
assert.equal(positive.market_event_created, false);
assert.equal(positive.verified_sold_event_created, false);
assert.ok(positive.normalized_reference);
assert.equal(positive.normalized_reference.evidence_class, 'AUCTION_RESULT_REFERENCE');
assert.equal(positive.normalized_reference.event_state, 'SOLD');
assert.equal(positive.normalized_reference.price_type, 'BID');
assert.equal(positive.normalized_reference.terminal_display_amount, 2110);
assert.equal(positive.normalized_reference.currency, 'QAR');
assert.equal(positive.normalized_reference.bid_count, 101);
assert.equal(positive.normalized_reference.event_at, '2024-06-29T12:00:00Z');
assert.equal(positive.normalized_reference.camera_quantity, 2);
assert.equal(positive.normalized_reference.lot_quantity, 1);
assert.equal(positive.normalized_reference.scope_id, 'cameras_lenses');
assert.equal(positive.normalized_reference.legacy_scope_id, 'scope-cameras-lenses');
assert.equal(positive.normalized_reference.domain_id, 'technology_cameras');
assert.equal(positive.normalized_reference.verified_sold_event, false);
assert.equal(positive.normalized_reference.current_price_eligible, false);
assert.equal(positive.normalized_reference.liquidity_eligible, false);
assert.equal(positive.normalized_reference.input_projection_ref, observation.projection_sha256);
assert.equal(positive.normalized_reference.source_projection_hash, observation.projection_sha256);

const officialLotProvenanceSplit = withMutation((next) => {
  next.source_projection.auction_id = '00000000-0000-4000-8000-000000000001';
  next.source_projection.lot_uuid = '00000000-0000-4000-8000-000000000002';
  next.source.source_url = 'https://online-auction.state.gov/en-US/Auction/Lot/00000000-0000-4000-8000-000000000002?auctionId=00000000-0000-4000-8000-000000000001';
  next.source_projection.source_url = next.source.source_url;
});
const reboundMutation = (name, mutator, expected) => {
  const mutated = withMutation(mutator);
  return { name, observation: mutated, expectedProjectionSha256: mutated.projection_sha256, expected };
};

const mutations = [
  {
    name: 'projection-hash-mismatch',
    observation: withMutation((next) => { next.source_projection.title = 'MUTATED'; }, { rehash: false }),
    expected: 'PROJECTION_HASH_MISMATCH',
  },
  {
    name: 'capture-agent-substituted',
    observation: withMutation((next) => { next.observation_method.capture_agent = 'unbound-agent'; }),
    expected: 'OBSERVATION_METHOD_BOUNDARY_INVALID',
  },
  {
    name: 'unexpected-semantic-claim-field',
    observation: withMutation((next) => { next.semantic_boundary.settled_transaction = true; }),
    expected: 'SEMANTIC_FIELD_SET_INVALID',
  },
  {
    name: 'source-host-mismatch',
    observation: withMutation((next) => {
      next.source.source_url = next.source.source_url.replace('online-auction.state.gov', 'example.com');
      next.source_projection.source_url = next.source.source_url;
    }),
    expected: 'SOURCE_URL_SCOPE_INVALID',
  },
  {
    name: 'source-query-mismatch',
    observation: withMutation((next) => {
      next.source.source_url = next.source.source_url.replace(/auctionId=.*/, 'auctionId=00000000-0000-4000-8000-000000000000');
      next.source_projection.source_url = next.source.source_url;
    }),
    expected: 'SOURCE_URL_SCOPE_INVALID',
  },
  {
    name: 'official-lot-provenance-split',
    observation: officialLotProvenanceSplit,
    expectedProjectionSha256: officialLotProvenanceSplit.projection_sha256,
    expected: 'OFFICIAL_LOT_PROVENANCE_BINDING_INVALID',
  },
  {
    name: 'terminal-sold-missing',
    observation: withMutation((next) => { next.source_projection.terminal_page_state = 'ACTIVE'; }),
    expected: 'TERMINAL_SOLD_SEMANTICS_INVALID',
  },
  {
    name: 'terminal-amount-zero',
    observation: withMutation((next) => { next.source_projection.terminal_display_amount = 0; }),
    expected: 'TERMINAL_AMOUNT_CURRENCY_OR_BID_COUNT_INVALID',
  },
  {
    name: 'currency-ambiguous',
    observation: withMutation((next) => { next.source_projection.currency = '$'; }),
    expected: 'TERMINAL_AMOUNT_CURRENCY_OR_BID_COUNT_INVALID',
  },
  reboundMutation('auction-close-drift', (next) => {
    next.source_projection.auction_close_at = '2024-06-28T12:00:00Z';
  }, 'EXACT_CLAIM_FACT_BINDING_INVALID'),
  reboundMutation('terminal-amount-drift', (next) => {
    next.source_projection.terminal_display_amount = 2111;
  }, 'EXACT_CLAIM_FACT_BINDING_INVALID'),
  reboundMutation('currency-drift', (next) => {
    next.source_projection.currency = 'USD';
  }, 'EXACT_CLAIM_FACT_BINDING_INVALID'),
  reboundMutation('bid-count-drift', (next) => {
    next.source_projection.bid_count = 102;
  }, 'EXACT_CLAIM_FACT_BINDING_INVALID'),
  {
    name: 'lot-quantity-inflated',
    observation: withMutation((next) => { next.source_projection.lot_quantity = 2; }),
    expected: 'OBJECT_IDENTIFIERS_OR_QUANTITY_INVALID',
  },
  {
    name: 'owner-unverified',
    observation: withMutation((next) => { next.source.owner_and_origin_state = 'UNKNOWN'; }),
    expected: 'SOURCE_OWNER_OR_FACTUAL_ORIGIN_INVALID',
  },
  {
    name: 'rights-allow-removed',
    observation: withMutation((next) => { next.rights.transform = 'UNKNOWN'; }),
    expected: 'FIELD_PURPOSE_RIGHTS_INVALID',
  },
  {
    name: 'rights-evidence-ref-substituted',
    observation: withMutation((next) => { next.rights.evidence_refs[0] = 'https://example.com/not-authoritative'; }),
    expected: 'FIELD_PURPOSE_RIGHTS_INVALID',
  },
  {
    name: 'rights-review-expired',
    observation: withMutation((next) => { next.rights.review_due_at = '2026-08-24T00:31:00Z'; }),
    expected: 'RIGHTS_REVIEW_EXPIRED',
  },
  {
    name: 'rights-review-far-future',
    observation: withMutation((next) => { next.rights.review_due_at = '2099-01-01T00:00:00Z'; }),
    expected: 'RIGHTS_REVIEW_INTERVAL_EXCEEDED',
  },
  reboundMutation('observation-time-future', (next) => {
    next.as_of = '2098-01-01T00:00:00Z';
    next.source_projection.observed_at = next.as_of;
    next.rights.review_due_at = '2098-01-31T00:00:00Z';
    for (const reference of next.evidence_refs) reference.observed_at = next.as_of;
  }, 'OBSERVATION_TIME_IN_FUTURE'),
  {
    name: 'observation-evidence-ref-removed',
    observation: withMutation((next) => { next.evidence_refs.pop(); }),
    expected: 'OBSERVATION_EVIDENCE_REFS_INVALID',
  },
  {
    name: 'verified-sold-promotion',
    observation: withMutation((next) => {
      next.semantic_boundary.admissible_evidence_class = 'VERIFIED_SOLD_EVENT';
      next.semantic_boundary.verified_sold_event = true;
    }),
    expected: 'SEMANTIC_CLAIM_CEILING_INVALID',
  },
  {
    name: 'public-promotion',
    observation: withMutation((next) => { next.public_release = 'ALLOW'; }),
    expected: 'PROTECTED_RELEASE_BOUNDARY_INVALID',
  },
];

const mutationResults = [];
for (const mutation of mutations) {
  const result = await parseStateDepartmentAuctionObservation(
    mutation.observation,
    mutation.expectedProjectionSha256 ?? contract.authoritative_inputs.observation_projection_sha256,
  );
  assert.equal(result.decision_state, 'REJECTED_FAIL_CLOSED', mutation.name);
  assert.equal(result.normalized_reference, null, mutation.name);
  assert.ok(result.reason_codes.includes(mutation.expected), `${mutation.name}:${result.reason_codes.join(',')}`);
  mutationResults.push({ name: mutation.name, state: result.decision_state, expected_reason: mutation.expected });
}

console.log(JSON.stringify({
  id: 'kidults-state-department-online-auction-adapter-test-receipt-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  source_id: positive.source_id,
  source_projection_sha256: observation.projection_sha256,
  deterministic_replays_verified: 1,
  positive_primary_source_fact_projections_parsed: 1,
  negative_mutations_rejected: mutationResults.length,
  mutation_results: mutationResults,
  adapter_result: positive,
  network_requests_executed_by_test: 0,
  observation_network_requests_recorded: observation.observation_method.network_requests,
  bounded_primary_source_fact_projections_validated: 1,
  exact_projection_reference_validators_active: 1,
  generalized_live_adapters_activated: 0,
  evidence_admitted_by_parser: 0,
  market_events_created_by_parser: 0,
  verified_sold_events_created: 0,
  current_prices_created: 0,
  liquidity_measures_created: 0,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
