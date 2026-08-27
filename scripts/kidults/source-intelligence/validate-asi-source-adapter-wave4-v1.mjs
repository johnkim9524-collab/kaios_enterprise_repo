#!/usr/bin/env node
import fs from 'node:fs';

const [testReceiptPath = '/tmp/kidults-asi-source-adapter-wave4-test-receipt-v1.json'] = process.argv.slice(2);
const files = {
  contract: 'coordination/kidults/source-intelligence/asi-source-adapter-wave4-contract-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-source-adapter-wave4-registry-v1.json',
  wave3Registry: 'coordination/kidults/source-intelligence/asi-source-adapter-wave3-registry-v1.json',
  runtimeContract: 'coordination/kidults/source-intelligence/asi-p1-market-event-adapter-runtime-contract-v1.json',
  frontier: 'coordination/kidults/source-intelligence/targeted-high-authority-source-expansion-v1.psv',
  sharedCore: 'services/kidults-autonomous-intelligence/src/asi/source-adapters/governed-market-surface.ts',
  adapterModule: 'services/kidults-autonomous-intelligence/src/asi/source-adapters/source-adapter-wave4.ts',
  test: 'services/kidults-autonomous-intelligence/scripts/asi-source-adapter-wave4-test.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-source-adapter-wave4-v1.mjs',
  workflow: '.github/workflows/kidults-asi-source-adapter-wave4-v1.yml',
  documentation: 'docs/kidults/asi/asi-source-adapter-wave4-v1.md',
};
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
for (const [key, file] of Object.entries(files)) assert(fs.existsSync(file), `MISSING_${key.toUpperCase()}:${file}`);
assert(fs.existsSync(testReceiptPath), `MISSING_TEST_RECEIPT:${testReceiptPath}`);

const contract = json(files.contract);
const registry = json(files.registry);
const wave3 = json(files.wave3Registry);
const runtime = json(files.runtimeContract);
const receipt = json(testReceiptPath);
const shared = read(files.sharedCore);
const adapters = read(files.adapterModule);
const test = read(files.test);
const workflow = read(files.workflow);
const doc = read(files.documentation);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const expectedSources = [
  { rank: 7, source_id: 'pricecharting-api', assignments: 12, family: 'AGGREGATE_PRICE_GUIDE_CONTEXT', claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE'], implemented: [] },
  { rank: 11, source_id: 'reverb-price-guide', assignments: 6, family: 'AGGREGATE_PRICE_GUIDE_CONTEXT', claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE'], implemented: [] },
  { rank: 12, source_id: 'hasbro-pulse-collections', assignments: 6, family: 'RELEASE_OR_LISTING_CONTEXT', claims: ['LIQUIDITY_OR_TIME_TO_SALE'], implemented: [] },
  { rank: 13, source_id: 'goat-sneaker-marketplace', assignments: 6, family: 'MARKETPLACE_EXPOSURE', claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE', 'LIQUIDITY_OR_TIME_TO_SALE'], implemented: ['LIQUIDITY_OR_TIME_TO_SALE'] },
  { rank: 14, source_id: 'comc-marketplace', assignments: 6, family: 'MARKETPLACE_EXPOSURE', claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE', 'LIQUIDITY_OR_TIME_TO_SALE'], implemented: ['LIQUIDITY_OR_TIME_TO_SALE'] },
  { rank: 15, source_id: 'bricklink-catalog-api', assignments: 3, family: 'MARKETPLACE_EXPOSURE', claims: ['LIQUIDITY_OR_TIME_TO_SALE'], implemented: ['LIQUIDITY_OR_TIME_TO_SALE'] },
  { rank: 16, source_id: 'nike-snkrs-launch-calendar', assignments: 3, family: 'RELEASE_OR_LISTING_CONTEXT', claims: ['LIQUIDITY_OR_TIME_TO_SALE'], implemented: [] },
];

assert(contract.id === 'kidults-asi-source-adapter-wave4-contract-v1' && contract.version === '1.0.0', 'CONTRACT_ID_VERSION');
assert(contract.status === 'SEVEN_SOURCE_ADAPTERS_IMPLEMENTED_FIXTURE_VERIFIED_NOT_EMPIRICALLY_ACTIVATED', 'CONTRACT_STATUS');
assert(contract.owner === 'KPMO' && contract.priority === 'P1', 'CONTRACT_AUTHORITY');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLES');
assert(contract.source_adapters?.length === 7, 'CONTRACT_SOURCE_COUNT');
assert(contract.shared_controls?.length >= 16, 'CONTRACT_CONTROL_COUNT');
assert(contract.required_mutation_families_per_source?.length === 7, 'CONTRACT_MUTATION_COUNT');
assert(contract.claim_partition?.strict_transaction_candidate_parsers === 0, 'CONTRACT_TRANSACTION_PARSER_COUNT');
assert(contract.claim_partition?.strict_exposure_candidate_parsers === 3, 'CONTRACT_EXPOSURE_PARSER_COUNT');
assert(contract.claim_partition?.context_only_non_promotable_classifiers === 4, 'CONTRACT_CONTEXT_COUNT');
assert(contract.claim_partition?.registered_claim_is_not_implemented_claim === true, 'CONTRACT_CLAIM_INHERITANCE');
assert(contract.portfolio_state_after_wave?.registered_source_profiles === 16, 'CONTRACT_PROFILE_COUNT');
assert(contract.portfolio_state_after_wave?.source_specific_adapters_implemented === 16, 'CONTRACT_IMPLEMENTED_COUNT');
assert(contract.portfolio_state_after_wave?.source_specific_adapters_pending === 0, 'CONTRACT_PENDING_COUNT');
assert(contract.portfolio_state_after_wave?.source_specific_adapters_activated === 0, 'CONTRACT_ACTIVATION_BOUNDARY');
assert(contract.portfolio_state_after_wave?.empirical_market_events_admitted === 0, 'CONTRACT_EVENT_BOUNDARY');
assert(contract.first_evidence_admission_gate?.state === 'BLOCKED_PENDING_EMPIRICAL_RIGHTS_SCHEMA_SEMANTICS_OWNER_ORIGIN_AND_ACTIVATION', 'CONTRACT_ADMISSION_STATE');
assert(contract.first_evidence_admission_gate?.software_adapter_coverage_complete === true, 'CONTRACT_SOFTWARE_COVERAGE');

assert(registry.id === 'kidults-asi-source-adapter-wave4-registry-v1' && registry.version === '1.0.0', 'REGISTRY_ID_VERSION');
assert(registry.status === 'ALL_16_SOURCE_ADAPTERS_IMPLEMENTED_FIXTURE_VERIFIED_NONE_EMPIRICALLY_ACTIVATED', 'REGISTRY_STATUS');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(principles), 'REGISTRY_PRINCIPLES');
for (const [key, expected] of Object.entries({
  contract: files.contract,
  wave3_registry: files.wave3Registry,
  runtime_contract: files.runtimeContract,
  source_frontier: files.frontier,
  shared_market_surface_core: files.sharedCore,
  source_adapter_module: files.adapterModule,
  test: files.test,
  validator: files.validator,
  workflow: files.workflow,
  documentation: files.documentation,
})) assert(registry.registered_assets?.[key] === expected, `REGISTRY_ASSET:${key}`);
assert(registry.implementation_state?.wave_source_specific_adapters_implemented === 7, 'REGISTRY_WAVE_IMPLEMENTED');
assert(registry.implementation_state?.portfolio_source_specific_adapters_implemented === 16, 'REGISTRY_PORTFOLIO_IMPLEMENTED');
assert(registry.implementation_state?.portfolio_source_specific_adapters_pending === 0, 'REGISTRY_PENDING');
assert(registry.implementation_state?.strict_transaction_candidate_parsers_in_wave === 0, 'REGISTRY_TRANSACTION_COUNT');
assert(registry.implementation_state?.strict_exposure_candidate_parsers_in_wave === 3, 'REGISTRY_EXPOSURE_COUNT');
assert(registry.implementation_state?.context_only_non_promotable_classifiers_in_wave === 4, 'REGISTRY_CONTEXT_COUNT');
assert(registry.implementation_state?.deterministic_fixture_suites_implemented === 7, 'REGISTRY_FIXTURE_COUNT');
assert(registry.implementation_state?.generic_runtime_bindings_verified === 3, 'REGISTRY_RUNTIME_BINDING_COUNT');
assert(registry.implementation_state?.source_specific_adapters_activated === 0, 'REGISTRY_ACTIVATION_BOUNDARY');
assert(registry.implementation_state?.empirical_market_events_admitted === 0, 'REGISTRY_EVENT_BOUNDARY');
assert(registry.implemented_source_ids?.length === 16 && new Set(registry.implemented_source_ids).size === 16, 'REGISTRY_IMPLEMENTED_IDS');
assert(Array.isArray(registry.remaining_source_adapter_backlog) && registry.remaining_source_adapter_backlog.length === 0, 'REGISTRY_REMAINING_BACKLOG');
assert(registry.empirical_activation_backlog?.length === 6, 'REGISTRY_EMPIRICAL_BACKLOG');
assert(registry.automatic_activation?.main_push === true, 'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule === '47 */3 * * *', 'REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.upstream_workflows?.includes('KIDULTS ASI Source Adapter Wave 3 v1'), 'REGISTRY_UPSTREAM_WAVE3');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');
assert(registry.next_execution?.software_adapter_coverage === 'COMPLETE_16_OF_16', 'REGISTRY_SOFTWARE_COVERAGE');
assert(registry.next_execution?.provider_contact_routing === 'TRACK_Z_TO_KPMO_TO_FOUNDER_REQUIRED', 'REGISTRY_PROVIDER_ROUTING');

assert(wave3.id === 'kidults-asi-source-adapter-wave3-registry-v1', 'WAVE3_REGISTRY_ID');
assert(wave3.implementation_state?.portfolio_source_specific_adapters_implemented === 9, 'WAVE3_BASELINE_IMPLEMENTED');
assert(wave3.implementation_state?.portfolio_source_specific_adapters_pending === 7, 'WAVE3_BASELINE_PENDING');
assert(runtime.id === 'kidults-asi-p1-market-event-adapter-runtime-contract-v1', 'RUNTIME_CONTRACT_ID');
assert(runtime.registered_source_profiles?.length === 16, 'RUNTIME_PROFILE_COUNT');
const runtimeProfiles = new Map(runtime.registered_source_profiles.map((tuple) => [tuple[1], { rank: tuple[0], assignments: tuple[2], claims: tuple[3] }]));

const frontierLines = read(files.frontier).trim().split(/\r?\n/);
const frontierHeader = frontierLines.shift().split('|');
const frontier = frontierLines.map((line) => {
  const values = line.split('|');
  return Object.fromEntries(frontierHeader.map((key, index) => [key, values[index] ?? '']));
});
const frontierById = new Map(frontier.map((record) => [record.source_id, record]));
const contractById = new Map(contract.source_adapters.map((record) => [record.source_id, record]));
for (const expected of expectedSources) {
  const entry = contractById.get(expected.source_id);
  assert(entry, `CONTRACT_SOURCE_MISSING:${expected.source_id}`);
  assert(entry.rank === expected.rank, `CONTRACT_RANK:${expected.source_id}`);
  assert(entry.verified_assignment_count === expected.assignments, `CONTRACT_ASSIGNMENTS:${expected.source_id}`);
  assert(entry.family === expected.family, `CONTRACT_FAMILY:${expected.source_id}`);
  assert(JSON.stringify(entry.registered_claims) === JSON.stringify(expected.claims), `CONTRACT_REGISTERED_CLAIMS:${expected.source_id}`);
  assert(JSON.stringify(entry.implemented_claim_parsers) === JSON.stringify(expected.implemented), `CONTRACT_IMPLEMENTED_CLAIMS:${expected.source_id}`);
  assert(frontierById.has(expected.source_id), `FRONTIER_SOURCE_MISSING:${expected.source_id}`);
  const runtimeProfile = runtimeProfiles.get(expected.source_id);
  assert(runtimeProfile, `RUNTIME_PROFILE_MISSING:${expected.source_id}`);
  assert(runtimeProfile.rank === expected.rank, `RUNTIME_RANK:${expected.source_id}`);
  assert(runtimeProfile.assignments === expected.assignments, `RUNTIME_ASSIGNMENTS:${expected.source_id}`);
  assert(JSON.stringify(runtimeProfile.claims) === JSON.stringify(expected.claims), `RUNTIME_CLAIMS:${expected.source_id}`);
  assert(adapters.includes(expected.source_id), `ADAPTER_SOURCE_MARKER:${expected.source_id}`);
}

for (const marker of [
  'parseStrictTransactionSurface',
  'parseStrictExposureSurface',
  'classifyContextOnlySurface',
  'LISTING_OR_QUOTE_MISREPRESENTED_AS_SOLD',
  'EXPOSURE_DENOMINATOR_ID_MISSING',
  'AGGREGATE_PRICE_GUIDE_IS_NOT_DATED_SOLD_TRANSACTION',
  'RELEASE_OR_LISTING_SURFACE_IS_NOT_LIQUIDITY',
  "adapter_state: 'IMPLEMENTED_NOT_RIGHTS_VERIFIED'",
  'provider_direct_to_index_or_projection_allowed: false',
  'rights_pass_created: false',
  'evidence_admitted: false',
  'market_event_created: false',
]) assert(shared.includes(marker), `SHARED_CORE_MARKER:${marker}`);
assert(!shared.includes('fetch(') && !shared.includes("from 'node:http'") && !shared.includes("from 'node:https'"), 'SHARED_CORE_NETWORK_FORBIDDEN');
for (const marker of [
  'classifyPriceChartingCurrentValueSnapshot',
  'classifyReverbPriceGuideSnapshot',
  'classifyHasbroPulseCollectionSnapshot',
  'parseGoatExposureSnapshot',
  'parseComcExposureSnapshot',
  'parseBrickLinkExposureSnapshot',
  'classifyNikeSnkrsLaunchSnapshot',
  'getWave4SourceAdapterProfiles',
]) assert(adapters.includes(marker), `ADAPTER_EXPORT_MARKER:${marker}`);

assert(receipt.id === 'kidults-asi-source-adapter-wave4-test-receipt-v1' && receipt.state === 'VERIFIED_PASS', 'TEST_RECEIPT_ID_STATE');
assert(receipt.source_specific_adapters_implemented === 7, 'TEST_RECEIPT_IMPLEMENTED');
assert(receipt.total_source_specific_adapters_implemented_in_portfolio === 16, 'TEST_RECEIPT_PORTFOLIO');
assert(receipt.remaining_source_specific_adapters === 0, 'TEST_RECEIPT_PENDING');
assert(receipt.deterministic_replays_verified === 7, 'TEST_RECEIPT_REPLAY');
assert(receipt.positive_fixture_candidates_parsed === 3, 'TEST_RECEIPT_POSITIVE');
assert(receipt.context_only_classifications_verified === 4, 'TEST_RECEIPT_CONTEXT');
assert(receipt.negative_fixture_mutations_rejected === 49, 'TEST_RECEIPT_NEGATIVE');
assert(receipt.generic_market_adapter_runtime_bindings_verified === 3, 'TEST_RECEIPT_RUNTIME');
assert(receipt.live_source_snapshots_verified === 0 && receipt.field_purpose_rights_verified_sources === 0, 'TEST_RECEIPT_EMPIRICAL_BOUNDARY');
assert(receipt.source_specific_adapters_activated === 0 && receipt.evidence_admitted === 0 && receipt.market_events_created === 0, 'TEST_RECEIPT_PROMOTION_BOUNDARY');
assert(receipt.source_results?.length === 7, 'TEST_RECEIPT_SOURCE_RESULTS');
for (const expected of expectedSources) assert(receipt.source_results.some((record) => record.source_id === expected.source_id), `TEST_RECEIPT_SOURCE:${expected.source_id}`);

for (const marker of [
  'REPLAY_NOT_DETERMINISTIC',
  'negative_fixture_mutations_rejected',
  'INTEGRITY_MUTATION_NOT_REJECTED',
  'SEMANTIC_MUTATION_NOT_REJECTED',
  'CONTEXT_PROMOTION',
  'source_specific_adapters_implemented: 7',
  'remaining_source_specific_adapters: 0',
]) assert(test.includes(marker), `TEST_MARKER:${marker}`);

for (const marker of [
  'workflow_dispatch:',
  'schedule:',
  "cron: '47 */3 * * *'",
  'push:',
  'pull_request:',
  'group: kidults-asi-source-adapter-wave4-v1-${{ github.event_name }}-${{ github.sha }}',
  'Typecheck final seven adapters and shared market-surface core',
  'Run final seven-adapter deterministic fixture and mutation proof',
  'Validate complete 16-source adapter implementation portfolio',
  'Reject context-to-Evidence promotion mutation',
  'Reject registered-claim inheritance mutation',
  'Reject false live activation and Evidence mutation',
  'Reject incomplete software coverage mutation',
  'Revalidate pristine Wave 4 state',
  'Emit KPMO Wave 4 receipt',
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(!workflow.includes('workflow_run:'), 'WORKFLOW_STATIC_VALIDATOR_MUST_NOT_CONSUME_UPSTREAM_ARTIFACT');
assert(workflow.includes('contents: read') && !workflow.includes('contents: write'), 'WORKFLOW_CONTENTS_BOUNDARY');
assert(workflow.includes('persist-credentials: false') && !workflow.includes('git push'), 'WORKFLOW_REPOSITORY_MUTATION_BOUNDARY');
assert(!workflow.includes('curl ') && !workflow.includes('wget '), 'WORKFLOW_UNDECLARED_NETWORK');

for (const marker of [
  '# KIDULTS ASI Source Adapter Wave 4 v1',
  '16 / 16 source-specific adapters implemented',
  'PriceCharting API',
  'Reverb Price Guide',
  'Hasbro Pulse Collections',
  'GOAT Sneaker Marketplace',
  'COMC Marketplace',
  'BrickLink Catalog API',
  'Nike SNKRS Launch Calendar',
  '49 / 49 negative fixture mutations rejected',
  'Evidence admitted: 0',
  'Software coverage complete ≠ Empirical activation complete',
]) assert(doc.includes(marker), `DOC_MARKER:${marker}`);

for (const [key, expected] of Object.entries({
  fixture_is_empirical_source_snapshot: false,
  implemented_adapter_is_activated_adapter: false,
  context_classifier_is_evidence_parser: false,
  registered_claim_is_implemented_claim: false,
  live_source_request_executed: false,
  rights_pass_created: false,
  factual_origin_verified: false,
  evidence_admitted: 0,
  market_events_created: 0,
  current_price_created: false,
  liquidity_measure_created: false,
  snapshot_candidate_created: false,
  public_release: 'HOLD',
  production: 'HOLD',
})) assert(contract.truth_boundary?.[key] === expected, `CONTRACT_BOUNDARY:${key}`);

console.log(JSON.stringify({
  id: 'kidults-asi-source-adapter-wave4-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  wave_source_specific_adapters_implemented: 7,
  portfolio_source_specific_adapters_implemented: 16,
  registered_source_profiles: 16,
  source_specific_adapters_pending: 0,
  deterministic_replays_verified: 7,
  positive_fixture_candidates_parsed: 3,
  context_only_classifications_verified: 4,
  negative_fixture_mutations_rejected: 49,
  live_source_snapshots_verified: 0,
  field_purpose_rights_verified_sources: 0,
  source_specific_adapters_activated: 0,
  evidence_admitted: 0,
  market_events_created: 0,
  first_evidence_admission_state: contract.first_evidence_admission_gate.state,
  software_adapter_coverage: 'COMPLETE_16_OF_16',
  public_release: 'HOLD',
  production: 'HOLD',
}, null, 2));
