#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(serviceRoot, '../..');
const sourcePath = resolve(serviceRoot, 'src/asi/market-adapter.ts');
const contractPath = resolve(repositoryRoot, 'coordination/kidults/source-intelligence/asi-p1-market-event-adapter-runtime-contract-v1.json');
const frontierPath = resolve(repositoryRoot, 'coordination/kidults/source-intelligence/targeted-high-authority-source-expansion-v1.psv');
const compiledRoot = mkdtempSync(resolve(tmpdir(), 'kidults-asi-market-adapter-'));

const input = readFileSync(sourcePath, 'utf8');
const transpiled = ts.transpileModule(input, {
  fileName: 'market-adapter.ts',
  reportDiagnostics: true,
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
});
const errors = (transpiled.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
if (errors.length > 0) throw new Error(`ASI_MARKET_ADAPTER_TRANSPILE_FAILED:${errors.map((error) => error.messageText).join('|')}`);
writeFileSync(resolve(compiledRoot, 'market-adapter.mjs'), transpiled.outputText, 'utf8');
const runtime = await import(pathToFileURL(resolve(compiledRoot, 'market-adapter.mjs')).href);

const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const frontierText = readFileSync(frontierPath, 'utf8').trim();
const lines = frontierText.split(/\r?\n/);
const header = lines.shift().split('|');
const frontier = lines.map((line) => {
  const values = line.split('|');
  return Object.fromEntries(header.map((key, index) => [key, String(values[index] || '').trim()]));
});
const frontierById = new Map(frontier.map((record) => [record.source_id, record]));

assert.equal(contract.id, 'kidults-asi-p1-market-event-adapter-runtime-contract-v1');
assert.equal(contract.version, '1.0.0');
assert.deepEqual(contract.platform_principles, ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT']);
assert.equal(contract.registered_source_profiles.length, 16);
assert.equal(contract.implementation_truth.registered_source_adapter_implemented_count, 0);
assert.equal(contract.implementation_truth.registered_source_adapter_activated_count, 0);
assert.equal(contract.implementation_truth.empirical_market_event_emitted_count, 0);

const registeredProfiles = [];
const sourceIds = new Set();
for (const tuple of contract.registered_source_profiles) {
  const [priorityRank, sourceId, assignmentCount, targetClaims] = tuple;
  assert.ok(Number.isInteger(priorityRank) && priorityRank >= 1 && priorityRank <= 16);
  assert.ok(!sourceIds.has(sourceId), `DUPLICATE_SOURCE_PROFILE:${sourceId}`);
  sourceIds.add(sourceId);
  const source = frontierById.get(sourceId);
  assert.ok(source, `REGISTERED_SOURCE_NOT_IN_FRONTIER:${sourceId}`);
  const host = new URL(source.official_endpoint).hostname.toLowerCase().replace(/^www\./, '');
  const profile = {
    source_id: sourceId,
    canonical_host: host,
    adapter_state: contract.registered_profile_default_state,
    source_schema_version: 'unverified-0',
    target_claims: targetClaims,
    required_schema_fields: contract.claim_targets[targetClaims[0]].required_fields || contract.claim_targets.DATED_OBSERVED_SOLD_TRANSACTION.required_fields,
    fixture_only: false,
    provider_direct_to_index_or_projection_allowed: false,
  };
  runtime.assertMarketAdapterProfile(profile);
  assert.equal(profile.adapter_state, 'ADAPTER_NOT_IMPLEMENTED');
  assert.ok(Number.isInteger(assignmentCount) && assignmentCount > 0);
  registeredProfiles.push(profile);
}
assert.equal(sourceIds.size, 16);

const snapshotRef = `sha256:${'1'.repeat(64)}`;
const payloadHash = `sha256:${'2'.repeat(64)}`;
const rights = {
  decision: 'ALLOW',
  rights: ['COLLECT_RIGHT', 'BOUNDED_STORE_RIGHT', 'INTERNAL_DERIVE_RIGHT'],
  effective_at: '2026-08-23T00:00:00.000Z',
  evidence_refs: ['fixture:rights:collect', 'fixture:rights:store', 'fixture:rights:derive'],
};
const fixtureProfile = {
  source_id: 'fixture-market-source',
  canonical_host: 'fixture.example',
  adapter_state: 'ACTIVATED_EVIDENCE_BOUND',
  source_schema_version: 'fixture-v1',
  target_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE', 'LIQUIDITY_OR_TIME_TO_SALE'],
  required_schema_fields: contract.claim_targets.DATED_OBSERVED_SOLD_TRANSACTION.required_fields,
  fixture_only: true,
  provider_direct_to_index_or_projection_allowed: false,
};
runtime.assertMarketAdapterProfile(fixtureProfile);

const soldInput = {
  evidence_kind: 'SYNTHETIC_CONTROL_ONLY',
  source_id: fixtureProfile.source_id,
  source_record_id: 'fixture-sold-001',
  canonical_object_id: 'object-fixture-001',
  terminal_market_state: 'SOLD',
  realized_price: 12500,
  currency: 'USD',
  event_at: '2026-08-22T10:00:00.000Z',
  observed_at: '2026-08-22T10:05:00.000Z',
  condition_segment: 'GRADE_A',
  source_owner_id: 'source-owner-fixture-a',
  factual_origin_id: 'factual-origin-fixture-a',
  field_purpose_rights: rights,
  provenance_refs: ['fixture:provenance:sold-001'],
  input_snapshot_ref: snapshotRef,
  source_schema_version: fixtureProfile.source_schema_version,
  source_payload_hash: payloadHash,
};
const soldA = await runtime.normalizeDatedSoldTransaction(fixtureProfile, soldInput);
const soldB = await runtime.normalizeDatedSoldTransaction(fixtureProfile, soldInput);
assert.deepEqual(soldA, soldB, 'SOLD_REPLAY_NOT_DETERMINISTIC');
assert.equal(soldA.state, 'NORMALIZED_FIXTURE_NON_PROMOTABLE');
assert.equal(soldA.normalized_record.record_type, 'DATED_OBSERVED_SOLD_TRANSACTION');
assert.equal(soldA.normalized_record.terminal_market_state, 'SOLD');
assert.equal(soldA.normalized_record.market_event_admitted, false);
assert.equal(soldA.normalized_record.current_price_eligible, false);
assert.equal(soldA.customer_claim_authorized, false);
assert.equal(soldA.public_release, 'HOLD');
assert.equal(soldA.production, 'HOLD');

const listing = await runtime.normalizeDatedSoldTransaction(fixtureProfile, {
  ...soldInput,
  source_record_id: 'fixture-listing-001',
  terminal_market_state: 'LISTED',
});
assert.equal(listing.state, 'REJECT');
assert.ok(listing.reason_codes.includes('LISTING_OR_QUOTE_MISREPRESENTED_AS_SOLD'));
assert.equal(listing.normalized_record, null);

const unknownRights = await runtime.normalizeDatedSoldTransaction({ ...fixtureProfile, fixture_only: false }, {
  ...soldInput,
  evidence_kind: 'EMPIRICAL_SOURCE_OBSERVATION',
  field_purpose_rights: { decision: 'UNKNOWN', rights: [], effective_at: rights.effective_at, evidence_refs: [] },
});
assert.equal(unknownRights.state, 'HOLD');
assert.ok(unknownRights.reason_codes.includes('FIELD_PURPOSE_RIGHTS_NOT_ALLOW'));
assert.ok(unknownRights.reason_codes.includes('MISSING_COLLECT_RIGHT'));
assert.equal(unknownRights.normalized_record, null);

const preflightProfile = { ...fixtureProfile, fixture_only: false, adapter_state: 'PREFLIGHT_ONLY' };
const preflight = await runtime.normalizeDatedSoldTransaction(preflightProfile, {
  ...soldInput,
  evidence_kind: 'EMPIRICAL_SOURCE_OBSERVATION',
});
assert.equal(preflight.state, 'HOLD');
assert.ok(preflight.reason_codes.includes('ADAPTER_STATE_PREFLIGHT_ONLY'));
assert.equal(preflight.normalized_record, null);

const empiricalCandidate = await runtime.normalizeDatedSoldTransaction({ ...fixtureProfile, fixture_only: false }, {
  ...soldInput,
  evidence_kind: 'EMPIRICAL_SOURCE_OBSERVATION',
});
assert.equal(empiricalCandidate.state, 'NORMALIZED_READY_FOR_GATE');
assert.equal(empiricalCandidate.market_event_admitted, false);
assert.equal(empiricalCandidate.customer_claim_authorized, false);
assert.equal(empiricalCandidate.normalized_record.market_event_admitted, false);
assert.equal(empiricalCandidate.normalized_record.current_price_eligible, false);

const liquidityInput = {
  evidence_kind: 'SYNTHETIC_CONTROL_ONLY',
  source_id: fixtureProfile.source_id,
  source_record_id: 'fixture-exposure-001',
  canonical_object_id: 'object-fixture-001',
  exposure_start_at: '2026-08-01T00:00:00.000Z',
  observation_end_at: '2026-08-22T10:00:00.000Z',
  outcome_state: 'SOLD',
  censoring_state: 'EVENT_OBSERVED',
  failed_sale_handling: 'NOT_APPLICABLE_TERMINAL_SALE',
  exposure_denominator_id: 'fixture-market-cell-001',
  source_owner_id: 'source-owner-fixture-a',
  factual_origin_id: 'factual-origin-fixture-a',
  field_purpose_rights: rights,
  provenance_refs: ['fixture:provenance:exposure-001'],
  input_snapshot_ref: snapshotRef,
  source_schema_version: fixtureProfile.source_schema_version,
  source_payload_hash: payloadHash,
};
const liquidityA = await runtime.normalizeLiquidityObservation(fixtureProfile, liquidityInput);
const liquidityB = await runtime.normalizeLiquidityObservation(fixtureProfile, liquidityInput);
assert.deepEqual(liquidityA, liquidityB, 'LIQUIDITY_REPLAY_NOT_DETERMINISTIC');
assert.equal(liquidityA.state, 'NORMALIZED_FIXTURE_NON_PROMOTABLE');
assert.equal(liquidityA.normalized_record.market_event_admitted, false);
assert.equal(liquidityA.normalized_record.liquidity_eligible, false);
assert.ok(liquidityA.normalized_record.exposure_duration_seconds > 0);

const noDenominator = await runtime.normalizeLiquidityObservation(fixtureProfile, {
  ...liquidityInput,
  source_record_id: 'fixture-exposure-no-denominator',
  exposure_denominator_id: '',
});
assert.equal(noDenominator.state, 'HOLD');
assert.ok(noDenominator.reason_codes.includes('EXPOSURE_DENOMINATOR_ID_MISSING'));
assert.equal(noDenominator.normalized_record, null);

const invalidOutcome = await runtime.normalizeLiquidityObservation(fixtureProfile, {
  ...liquidityInput,
  source_record_id: 'fixture-exposure-invalid-outcome',
  outcome_state: 'ACTIVE_LISTING',
});
assert.equal(invalidOutcome.state, 'HOLD');
assert.ok(invalidOutcome.reason_codes.includes('OUTCOME_STATE_INVALID'));

const currentPrice = runtime.assessCurrentPriceReadiness([
  soldA.normalized_record,
  { ...soldA.normalized_record, normalized_record_id: `sha256:${'3'.repeat(64)}`, source_record_id: 'fixture-sold-002', source_owner_id: 'source-owner-fixture-b', factual_origin_id: 'factual-origin-fixture-b' },
  { ...soldA.normalized_record, normalized_record_id: `sha256:${'4'.repeat(64)}`, source_record_id: 'fixture-sold-003', source_owner_id: 'source-owner-fixture-c', factual_origin_id: 'factual-origin-fixture-c' },
], '2026-08-23T00:00:00.000Z', 3);
assert.equal(currentPrice.state, 'HOLD');
assert.ok(currentPrice.reason_codes.includes('SYNTHETIC_OR_CONTROL_RECORD_PRESENT'));
assert.ok(currentPrice.reason_codes.includes('OUTLIER_AND_DUPLICATE_CONTROL_NOT_VERIFIED'));
assert.equal(currentPrice.current_price_eligible, false);

const schemaMatch = runtime.evaluateMarketAdapterSchema(fixtureProfile, fixtureProfile.required_schema_fields);
assert.equal(schemaMatch.state, 'MATCH');
assert.deepEqual(schemaMatch.missing_fields, []);
const schemaDrift = runtime.evaluateMarketAdapterSchema(fixtureProfile, fixtureProfile.required_schema_fields.slice(1));
assert.equal(schemaDrift.state, 'DRIFT_HOLD');
assert.equal(schemaDrift.missing_fields.length, 1);

assert.throws(() => runtime.assertMarketAdapterProfile({
  ...fixtureProfile,
  provider_direct_to_index_or_projection_allowed: true,
}), /ASI_MARKET_ADAPTER_PROVIDER_DIRECT_PATH_FORBIDDEN/);

const report = {
  id: 'kidults-asi-market-adapter-runtime-test-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  registered_source_profiles_validated: registeredProfiles.length,
  registered_source_adapters_implemented: 0,
  registered_source_adapters_activated: 0,
  fixture_sold_normalization: soldA.state,
  fixture_liquidity_normalization: liquidityA.state,
  deterministic_sold_replay: 'PASS',
  deterministic_liquidity_replay: 'PASS',
  listing_not_sold_rejection: 'PASS',
  unknown_rights_hold: 'PASS',
  preflight_adapter_hold: 'PASS',
  schema_drift_hold: 'PASS',
  provider_direct_path_rejection: 'PASS',
  synthetic_current_price_promotion_rejected: 'PASS',
  empirical_normalized_candidate_market_event_admitted: false,
  fixture_market_event_admitted: false,
  current_price_eligible: false,
  liquidity_eligible: false,
  public_release: 'HOLD',
  production: 'HOLD',
};
console.log(JSON.stringify(report, null, 2));
