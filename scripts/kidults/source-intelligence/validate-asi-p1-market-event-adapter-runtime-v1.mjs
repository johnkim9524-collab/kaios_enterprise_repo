#!/usr/bin/env node
import fs from 'node:fs';

const files = {
  contract: 'coordination/kidults/source-intelligence/asi-p1-market-event-adapter-runtime-contract-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-p1-market-event-adapter-runtime-registry-v1.json',
  strictGate: 'coordination/kidults/source-intelligence/strict-current-market-admission-gate-v1.json',
  sourceFrontier: 'coordination/kidults/source-intelligence/targeted-high-authority-source-expansion-v1.psv',
  runtimeModule: 'services/kidults-autonomous-intelligence/src/asi/market-adapter.ts',
  runtimeTest: 'services/kidults-autonomous-intelligence/scripts/asi-market-adapter-runtime-test.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-p1-market-event-adapter-runtime-v1.mjs',
  workflow: '.github/workflows/kidults-asi-p1-market-event-adapter-runtime-v1.yml',
  doc: 'docs/kidults/asi/asi-p1-market-event-adapter-runtime-v1.md'
};
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
for (const [name, file] of Object.entries(files)) assert(fs.existsSync(file), `MISSING_${name.toUpperCase()}:${file}`);

const contract = json(files.contract);
const registry = json(files.registry);
const strictGate = json(files.strictGate);
const frontierText = read(files.sourceFrontier).trim();
const moduleSource = read(files.runtimeModule);
const testSource = read(files.runtimeTest);
const workflow = read(files.workflow);
const doc = read(files.doc);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const claims = ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE', 'LIQUIDITY_OR_TIME_TO_SALE'];

assert(contract.id === 'kidults-asi-p1-market-event-adapter-runtime-contract-v1', 'CONTRACT_ID');
assert(contract.version === '1.0.0', 'CONTRACT_VERSION');
assert(contract.status === 'ACTIVE_MANDATORY_FAIL_CLOSED_AFTER_MAIN_MERGE', 'CONTRACT_STATUS');
assert(contract.owner === 'KPMO' && contract.priority === 'P1', 'CONTRACT_AUTHORITY');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLES');
assert(JSON.stringify(Object.keys(contract.claim_targets)) === JSON.stringify(claims), 'CONTRACT_CLAIMS');
assert(contract.runtime_states?.length === 8 && new Set(contract.runtime_states).size === 8, 'CONTRACT_RUNTIME_STATES');
assert(contract.runtime_invariants?.length >= 12, 'CONTRACT_RUNTIME_INVARIANTS');
assert(contract.registered_source_profiles?.length === 16, 'CONTRACT_PROFILE_COUNT');
assert(JSON.stringify(contract.profile_tuple) === JSON.stringify(['priority_rank', 'source_id', 'verified_assignment_count', 'target_claims']), 'CONTRACT_PROFILE_TUPLE');
assert(contract.registered_profile_default_state === 'ADAPTER_NOT_IMPLEMENTED', 'CONTRACT_DEFAULT_STATE');
assert(contract.fixture_policy?.mode === 'SYNTHETIC_CONTROL_ONLY', 'CONTRACT_FIXTURE_MODE');
assert(contract.fixture_policy?.can_create_market_event_or_claim === false, 'CONTRACT_FIXTURE_PROMOTION');
assert(contract.claim_targets.DATED_OBSERVED_SOLD_TRANSACTION.required_fields.length === 13, 'DATED_SOLD_REQUIRED_FIELDS');
assert(contract.claim_targets.DATED_OBSERVED_SOLD_TRANSACTION.required_rights.length === 3, 'DATED_SOLD_RIGHTS');
assert(contract.claim_targets.DATED_OBSERVED_SOLD_TRANSACTION.listing_or_bid_ask_is_sold === false, 'LISTING_NOT_SOLD');
assert(contract.claim_targets.CURRENT_PRICE.requires_dated_sold_admission === true, 'CURRENT_PRICE_SOLD_DEPENDENCY');
assert(contract.claim_targets.CURRENT_PRICE.single_transaction_can_establish_current_price === false, 'CURRENT_PRICE_SINGLE_TRANSACTION');
assert(contract.claim_targets.LIQUIDITY_OR_TIME_TO_SALE.required_fields.length === 14, 'LIQUIDITY_REQUIRED_FIELDS');
assert(contract.claim_targets.LIQUIDITY_OR_TIME_TO_SALE.sold_count_without_exposure_denominator_is_liquidity === false, 'SOLD_COUNT_NOT_LIQUIDITY');

const lines = frontierText.split(/\r?\n/);
const header = lines.shift().split('|');
assert(header.includes('source_id') && header.includes('official_endpoint') && header.includes('source_roles'), 'FRONTIER_HEADER');
const frontier = lines.map((line) => {
  const values = line.split('|');
  return Object.fromEntries(header.map((key, index) => [key, String(values[index] || '').trim()]));
});
const frontierById = new Map(frontier.map((record) => [record.source_id, record]));
const profileSourceIds = new Set();
let assignmentTotal = 0;
for (const tuple of contract.registered_source_profiles) {
  assert(Array.isArray(tuple) && tuple.length === 4, 'PROFILE_TUPLE_SHAPE');
  const [rank, sourceId, assignmentCount, targetClaims] = tuple;
  assert(Number.isInteger(rank) && rank >= 1 && rank <= 16, `PROFILE_RANK:${sourceId}`);
  assert(typeof sourceId === 'string' && sourceId.length > 0 && !profileSourceIds.has(sourceId), `PROFILE_SOURCE_ID:${sourceId}`);
  profileSourceIds.add(sourceId);
  assert(frontierById.has(sourceId), `PROFILE_SOURCE_NOT_IN_FRONTIER:${sourceId}`);
  assert(Number.isInteger(assignmentCount) && assignmentCount > 0, `PROFILE_ASSIGNMENT_COUNT:${sourceId}`);
  assignmentTotal += assignmentCount;
  assert(Array.isArray(targetClaims) && targetClaims.length > 0 && targetClaims.every((claim) => claims.includes(claim)), `PROFILE_TARGET_CLAIMS:${sourceId}`);
}
assert(profileSourceIds.size === 16, 'PROFILE_UNIQUE_COUNT');
assert(assignmentTotal === 156, 'PROFILE_ASSIGNMENT_TOTAL');

const requiredImplementationTruth = {
  generic_strict_adapter_runtime_implemented: true,
  generic_runtime_tested_with_non_promotable_fixtures: true,
  registered_source_profile_count: 16,
  registered_source_adapter_implemented_count: 0,
  registered_source_adapter_activated_count: 0,
  field_purpose_rights_verified_source_count: 0,
  sold_semantics_verified_source_count: 0,
  liquidity_semantics_verified_source_count: 0,
  empirical_market_event_emitted_count: 0,
  current_price_eligible_source_count: 0,
  liquidity_eligible_source_count: 0
};
for (const [key, expected] of Object.entries(requiredImplementationTruth)) {
  assert(contract.implementation_truth?.[key] === expected, `CONTRACT_IMPLEMENTATION_TRUTH:${key}`);
}

assert(strictGate.id === 'kidults-strict-current-market-admission-gate-v1', 'STRICT_GATE_ID');
for (const claim of claims) assert(strictGate.claim_classes?.[claim], `STRICT_GATE_CLAIM:${claim}`);
assert(strictGate.current_empirical_binding?.strict_current_price_eligible === false, 'STRICT_GATE_CURRENT_PRICE_OVERCLAIM');
assert(strictGate.current_empirical_binding?.liquidity_eligible === false, 'STRICT_GATE_LIQUIDITY_OVERCLAIM');
assert(strictGate.current_empirical_binding?.public_or_commercial_projection_eligible === false, 'STRICT_GATE_PROJECTION_OVERCLAIM');

assert(registry.id === 'kidults-asi-p1-market-event-adapter-runtime-registry-v1', 'REGISTRY_ID');
assert(registry.version === contract.version && registry.owner === 'KPMO' && registry.priority === 'P1', 'REGISTRY_METADATA');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(principles), 'REGISTRY_PRINCIPLES');
for (const [key, expected] of Object.entries({
  contract: files.contract,
  strict_current_market_gate: files.strictGate,
  registered_source_frontier: files.sourceFrontier,
  runtime_module: files.runtimeModule,
  runtime_test: files.runtimeTest,
  validator: files.validator,
  workflow: files.workflow,
  human_readme: files.doc
})) assert(registry.registered_assets?.[key] === expected, `REGISTRY_PATH:${key}`);
assert(registry.automatic_activation?.main_push === true, 'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule === '7 */6 * * *', 'REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.upstream_workflows?.includes('KIDULTS ASI Mission-Directed Discovery v1'), 'REGISTRY_UPSTREAM');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');
assert(registry.implementation_state?.generic_strict_runtime === 'IMPLEMENTED_NOT_SOURCE_ACTIVATION', 'REGISTRY_GENERIC_RUNTIME');
assert(registry.implementation_state?.runtime_fixture_tests === 'NON_PROMOTABLE_CONTROL_ONLY', 'REGISTRY_FIXTURE_TESTS');
assert(registry.implementation_state?.registered_source_profiles === 16, 'REGISTRY_PROFILE_COUNT');
assert(registry.implementation_state?.source_specific_adapters_implemented === 0 && registry.implementation_state?.source_specific_adapters_activated === 0, 'REGISTRY_SOURCE_ADAPTER_OVERCLAIM');
assert(registry.implementation_state?.empirical_market_events_admitted === 0 && registry.implementation_state?.current_price_eligible_sources === 0 && registry.implementation_state?.liquidity_eligible_sources === 0, 'REGISTRY_CLAIM_OVERCLAIM');
assert(registry.next_source_adapter_backlog?.length === 6, 'REGISTRY_BACKLOG_COUNT');
assert(registry.next_source_adapter_backlog[0].source_id === 'bonhams-cars-results' && registry.next_source_adapter_backlog[0].verified_assignment_count === 24, 'REGISTRY_BACKLOG_PRIORITY');

for (const marker of [
  'export type MarketAdapterState',
  'assertMarketAdapterProfile',
  'evaluateMarketAdapterSchema',
  'normalizeDatedSoldTransaction',
  'normalizeLiquidityObservation',
  'assessCurrentPriceReadiness',
  'LISTING_OR_QUOTE_MISREPRESENTED_AS_SOLD',
  'EXPOSURE_DENOMINATOR_ID_MISSING',
  'ASI_MARKET_ADAPTER_PROVIDER_DIRECT_PATH_FORBIDDEN',
  'if (profile.provider_direct_to_index_or_projection_allowed !== false)',
  "market_event_admitted: false",
  "current_price_eligible: false",
  "liquidity_eligible: false"
]) assert(moduleSource.includes(marker), `MODULE_MARKER:${marker}`);
for (const marker of [
  'registered_source_profiles_validated',
  'SOLD_REPLAY_NOT_DETERMINISTIC',
  'LIQUIDITY_REPLAY_NOT_DETERMINISTIC',
  'LISTING_OR_QUOTE_MISREPRESENTED_AS_SOLD',
  'FIELD_PURPOSE_RIGHTS_NOT_ALLOW',
  'ADAPTER_STATE_PREFLIGHT_ONLY',
  'EXPOSURE_DENOMINATOR_ID_MISSING',
  'SYNTHETIC_OR_CONTROL_RECORD_PRESENT',
  'OUTLIER_AND_DUPLICATE_CONTROL_NOT_VERIFIED',
  'ASI_MARKET_ADAPTER_PROVIDER_DIRECT_PATH_FORBIDDEN'
]) assert(testSource.includes(marker), `TEST_MARKER:${marker}`);
for (const marker of [
  'workflow_dispatch:',
  'schedule:',
  "cron: '7 */6 * * *'",
  'push:',
  'workflow_run:',
  "'KIDULTS ASI Mission-Directed Discovery v1'",
  'Validate strict adapter contract and source profiles',
  'Exercise fail-closed market adapter runtime',
  'Reject registered-source activation mutation',
  'Reject fixture promotion mutation',
  'Reject source-adapter implementation overclaim mutation',
  'Emit KPMO market-adapter runtime receipt'
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(workflow.includes('contents: read') && !workflow.includes('contents: write'), 'WORKFLOW_CONTENTS_BOUNDARY');
assert(workflow.includes('persist-credentials: false') && !workflow.includes('git push'), 'WORKFLOW_MUTATION_BOUNDARY');
for (const marker of [
  '# KIDULTS ASI P1 Market-Event Adapter Runtime v1',
  'Generic Runtime ≠ Source-Specific Adapter',
  'Listing ≠ Sold',
  'Sold Count ≠ Liquidity',
  '16 registered source profiles',
  '0 source-specific adapters implemented',
  'Bonhams Cars Results'
]) assert(doc.includes(marker), `DOC_MARKER:${marker}`);

for (const [key, expected] of Object.entries({
  generic_runtime_is_source_specific_adapter: false,
  fixture_test_is_empirical_market_event: false,
  profile_registration_is_rights_verification: false,
  normalized_record_is_admitted_market_event: false,
  dated_sold_record_is_current_price: false,
  sold_record_count_is_liquidity: false,
  public_release: 'HOLD',
  production: 'HOLD'
})) assert(registry.truth_boundary?.[key] === expected, `REGISTRY_TRUTH_BOUNDARY:${key}`);

console.log(JSON.stringify({
  id: 'kidults-asi-p1-market-event-adapter-runtime-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  platform_principles: principles,
  registered_source_profiles: profileSourceIds.size,
  verified_assignment_total: assignmentTotal,
  generic_strict_runtime_implemented: true,
  generic_runtime_fixture_tested: true,
  registered_source_adapters_implemented: 0,
  registered_source_adapters_activated: 0,
  empirical_market_events_admitted: 0,
  current_price_eligible_sources: 0,
  liquidity_eligible_sources: 0,
  automatic_main_push: true,
  automatic_schedule: registry.automatic_activation.schedule,
  automatic_upstream_workflows: registry.automatic_activation.upstream_workflows.length,
  direct_repository_mutation_from_workflow: false,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
