#!/usr/bin/env node
import fs from 'node:fs';

const [testReceiptPath = '/tmp/kidults-asi-source-adapter-wave2-test-receipt-v1.json'] = process.argv.slice(2);
const files = {
  contract: 'coordination/kidults/source-intelligence/asi-source-adapter-wave2-contract-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-source-adapter-wave2-registry-v1.json',
  frontier: 'coordination/kidults/source-intelligence/targeted-high-authority-source-expansion-v1.psv',
  runtimeContract: 'coordination/kidults/source-intelligence/asi-p1-market-event-adapter-runtime-contract-v1.json',
  bonhamsContract: 'coordination/kidults/source-intelligence/asi-bonhams-cars-results-adapter-contract-v1.json',
  sharedCore: 'services/kidults-autonomous-intelligence/src/asi/source-adapters/public-auction-results.ts',
  barrettJackson: 'services/kidults-autonomous-intelligence/src/asi/source-adapters/barrett-jackson-results.ts',
  broadArrow: 'services/kidults-autonomous-intelligence/src/asi/source-adapters/broad-arrow-results.ts',
  collectingCars: 'services/kidults-autonomous-intelligence/src/asi/source-adapters/collecting-cars-sold.ts',
  iconicAuctioneers: 'services/kidults-autonomous-intelligence/src/asi/source-adapters/iconic-auctioneers-results.ts',
  test: 'services/kidults-autonomous-intelligence/scripts/asi-source-adapter-wave2-test.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-source-adapter-wave2-v1.mjs',
  workflow: '.github/workflows/kidults-asi-source-adapter-wave2-v1.yml',
  documentation: 'docs/kidults/asi/asi-source-adapter-wave2-v1.md',
};
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
for (const [key, file] of Object.entries(files)) assert(fs.existsSync(file), `MISSING_${key.toUpperCase()}:${file}`);
assert(fs.existsSync(testReceiptPath), `MISSING_TEST_RECEIPT:${testReceiptPath}`);

const contract = json(files.contract);
const registry = json(files.registry);
const runtime = json(files.runtimeContract);
const bonhams = json(files.bonhamsContract);
const receipt = json(testReceiptPath);
const workflow = read(files.workflow);
const doc = read(files.documentation);
const shared = read(files.sharedCore);
const test = read(files.test);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const expectedSources = [
  ['barrett-jackson-results', 18, files.barrettJackson, 'parseBarrettJacksonSoldSnapshot'],
  ['broad-arrow-results', 12, files.broadArrow, 'parseBroadArrowSoldSnapshot'],
  ['collecting-cars-sold', 6, files.collectingCars, 'parseCollectingCarsSoldSnapshot'],
  ['iconic-auctioneers-results', 6, files.iconicAuctioneers, 'parseIconicAuctioneersSoldSnapshot'],
];

assert(contract.id === 'kidults-asi-source-adapter-wave2-contract-v1' && contract.version === '1.0.0', 'CONTRACT_ID_VERSION');
assert(contract.status === 'IMPLEMENTED_FIXTURE_VERIFIED_NOT_RIGHTS_OR_LIVE_SCHEMA_VERIFIED', 'CONTRACT_STATUS');
assert(contract.owner === 'KPMO' && contract.priority === 'P1', 'CONTRACT_AUTHORITY');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLES');
assert(contract.source_adapters?.length === 4, 'CONTRACT_SOURCE_COUNT');
assert(contract.shared_parser_controls?.length >= 16, 'CONTRACT_CONTROL_COUNT');
assert(contract.required_mutation_families_per_source?.length === 10, 'CONTRACT_MUTATION_COUNT');
assert(contract.portfolio_state_after_wave?.registered_source_profiles === 16, 'CONTRACT_PROFILE_COUNT');
assert(contract.portfolio_state_after_wave?.source_specific_adapters_implemented === 5, 'CONTRACT_IMPLEMENTED_COUNT');
assert(contract.portfolio_state_after_wave?.source_specific_adapters_pending === 11, 'CONTRACT_PENDING_COUNT');
assert(contract.portfolio_state_after_wave?.source_specific_adapters_activated === 0, 'CONTRACT_ACTIVATION_BOUNDARY');
assert(contract.portfolio_state_after_wave?.empirical_market_events_admitted === 0, 'CONTRACT_EVENT_BOUNDARY');
assert(contract.first_evidence_admission_gate?.state === 'BLOCKED_PENDING_EMPIRICAL_RIGHTS_SCHEMA_SEMANTICS_OWNER_ORIGIN_AND_ACTIVATION', 'CONTRACT_ADMISSION_STATE');

assert(registry.id === 'kidults-asi-source-adapter-wave2-registry-v1' && registry.version === '1.0.0', 'REGISTRY_ID_VERSION');
assert(registry.status === 'FOUR_ADAPTERS_IMPLEMENTED_FIXTURE_VERIFIED_NOT_EMPIRICALLY_ACTIVATED', 'REGISTRY_STATUS');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(principles), 'REGISTRY_PRINCIPLES');
for (const [key, expected] of Object.entries({
  contract: files.contract,
  shared_parser_core: files.sharedCore,
  barrett_jackson_adapter: files.barrettJackson,
  broad_arrow_adapter: files.broadArrow,
  collecting_cars_adapter: files.collectingCars,
  iconic_auctioneers_adapter: files.iconicAuctioneers,
  test: files.test,
  validator: files.validator,
  workflow: files.workflow,
  documentation: files.documentation,
})) assert(registry.registered_assets?.[key] === expected, `REGISTRY_ASSET:${key}`);
assert(registry.implementation_state?.wave_source_specific_adapters_implemented === 4, 'REGISTRY_WAVE_IMPLEMENTED');
assert(registry.implementation_state?.portfolio_source_specific_adapters_implemented === 5, 'REGISTRY_PORTFOLIO_IMPLEMENTED');
assert(registry.implementation_state?.portfolio_source_specific_adapters_pending === 11, 'REGISTRY_PENDING');
assert(registry.implementation_state?.deterministic_fixture_suites_implemented === 4, 'REGISTRY_FIXTURE_COUNT');
assert(registry.implementation_state?.generic_runtime_bindings_implemented === 4, 'REGISTRY_RUNTIME_BINDINGS');
assert(registry.implementation_state?.source_specific_adapters_activated === 0, 'REGISTRY_ACTIVATION_BOUNDARY');
assert(registry.implementation_state?.empirical_market_events_admitted === 0, 'REGISTRY_EVENT_BOUNDARY');
assert(registry.implemented_source_ids?.length === 5 && new Set(registry.implemented_source_ids).size === 5, 'REGISTRY_IMPLEMENTED_IDS');
assert(registry.implemented_source_ids[0] === 'bonhams-cars-results', 'REGISTRY_REFERENCE_FIRST');
assert(registry.automatic_activation?.main_push === true, 'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule === '17 */3 * * *', 'REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');

assert(runtime.id === 'kidults-asi-p1-market-event-adapter-runtime-contract-v1', 'RUNTIME_CONTRACT_ID');
assert(runtime.registered_source_profiles?.length === 16, 'RUNTIME_PROFILE_COUNT');
const runtimeProfiles = new Map(runtime.registered_source_profiles.map((tuple) => [tuple[1], { rank: tuple[0], assignments: tuple[2], claims: tuple[3] }]));
assert(bonhams.id === 'kidults-asi-bonhams-cars-results-adapter-contract-v1', 'BONHAMS_REFERENCE_ID');
assert(bonhams.implementation_truth?.source_specific_parser_implemented === true, 'BONHAMS_REFERENCE_IMPLEMENTED');
assert(bonhams.implementation_truth?.adapter_activated === false && bonhams.implementation_truth?.empirical_market_events_admitted === 0, 'BONHAMS_REFERENCE_BOUNDARY');

const frontierLines = read(files.frontier).trim().split(/\r?\n/);
const frontierHeader = frontierLines.shift().split('|');
const frontier = frontierLines.map((line) => {
  const values = line.split('|');
  return Object.fromEntries(frontierHeader.map((key, index) => [key, values[index] ?? '']));
});
const frontierById = new Map(frontier.map((record) => [record.source_id, record]));
const contractById = new Map(contract.source_adapters.map((record) => [record.source_id, record]));
for (const [sourceId, assignments, modulePath, functionMarker] of expectedSources) {
  const entry = contractById.get(sourceId);
  assert(entry, `CONTRACT_SOURCE_MISSING:${sourceId}`);
  assert(entry.module === modulePath, `CONTRACT_MODULE:${sourceId}`);
  assert(entry.verified_assignment_count === assignments, `CONTRACT_ASSIGNMENTS:${sourceId}`);
  assert(entry.implementation_state === 'IMPLEMENTED_FIXTURE_VERIFIED_NOT_EMPIRICALLY_ACTIVATED', `CONTRACT_IMPLEMENTATION_STATE:${sourceId}`);
  assert(JSON.stringify(entry.implemented_claim_parsers) === JSON.stringify(['DATED_OBSERVED_SOLD_TRANSACTION']), `CONTRACT_IMPLEMENTED_CLAIMS:${sourceId}`);
  assert(frontierById.has(sourceId), `FRONTIER_SOURCE_MISSING:${sourceId}`);
  assert(String(frontierById.get(sourceId).source_roles).split(';').includes('SOLD_TRANSACTION'), `FRONTIER_SOLD_ROLE:${sourceId}`);
  const runtimeProfile = runtimeProfiles.get(sourceId);
  assert(runtimeProfile, `RUNTIME_PROFILE_MISSING:${sourceId}`);
  assert(runtimeProfile.assignments === assignments, `RUNTIME_ASSIGNMENTS:${sourceId}`);
  assert(runtimeProfile.claims.includes('DATED_OBSERVED_SOLD_TRANSACTION'), `RUNTIME_SOLD_CLAIM:${sourceId}`);
  const moduleSource = read(modulePath);
  assert(moduleSource.includes(functionMarker), `MODULE_PARSE_EXPORT:${sourceId}`);
  assert(moduleSource.includes(sourceId), `MODULE_SOURCE_ID:${sourceId}`);
  assert(moduleSource.includes('parsePublicAuctionSoldSnapshot'), `MODULE_SHARED_BINDING:${sourceId}`);
}

for (const marker of [
  'parsePublicAuctionSoldSnapshot',
  'SOURCE_PATH_NOT_ALLOWED',
  'SOURCE_PAYLOAD_HASH_MISMATCH',
  'AMBIGUOUS_DOLLAR_CURRENCY',
  'TERMINAL_STATE_NOT_SOLD',
  'LISTING_ESTIMATE_BID_OFFER_OR_RESERVE_IS_NOT_SOLD',
  'IMPLEMENTED_NOT_RIGHTS_VERIFIED',
  'rights_pass_created: false',
  'evidence_admitted: false',
  'market_event_created: false',
  'provider_direct_to_index_or_projection_allowed: false',
]) assert(shared.includes(marker), `SHARED_CORE_MARKER:${marker}`);
assert(!shared.includes('fetch(') && !shared.includes("from 'node:http'") && !shared.includes("from 'node:https'"), 'SHARED_CORE_NETWORK_FORBIDDEN');

assert(receipt.id === 'kidults-asi-source-adapter-wave2-test-receipt-v1' && receipt.state === 'VERIFIED_PASS', 'TEST_RECEIPT_ID_STATE');
assert(receipt.source_specific_adapters_implemented === 4, 'TEST_RECEIPT_IMPLEMENTED');
assert(receipt.total_source_specific_adapters_implemented_in_portfolio === 5, 'TEST_RECEIPT_PORTFOLIO');
assert(receipt.deterministic_replays_verified === 4, 'TEST_RECEIPT_REPLAY');
assert(receipt.positive_fixture_candidates_parsed === 4, 'TEST_RECEIPT_POSITIVE');
assert(receipt.negative_fixture_mutations_rejected === 40, 'TEST_RECEIPT_NEGATIVE');
assert(receipt.generic_market_adapter_runtime_bound === true, 'TEST_RECEIPT_RUNTIME');
assert(receipt.live_source_snapshots_verified === 0 && receipt.field_purpose_rights_verified_sources === 0, 'TEST_RECEIPT_EMPIRICAL_BOUNDARY');
assert(receipt.source_specific_adapters_activated === 0 && receipt.evidence_admitted === 0 && receipt.market_events_created === 0, 'TEST_RECEIPT_PROMOTION_BOUNDARY');
for (const [sourceId] of expectedSources) assert(receipt.source_ids.includes(sourceId), `TEST_RECEIPT_SOURCE:${sourceId}`);

for (const marker of [
  'negative_fixture_mutations_rejected',
  'REPLAY_NOT_DETERMINISTIC',
  'estimate-not-sold',
  'ambiguous-dollar',
  'sold-without-price',
  'script-only-sold',
  'terminal-unsold',
  'bad-hash',
  'wrong-host',
  'non-https',
  'wrong-path',
]) assert(test.includes(marker), `TEST_MARKER:${marker}`);

for (const marker of [
  'workflow_dispatch:',
  'schedule:',
  "cron: '17 */3 * * *'",
  'push:',
  'workflow_run:',
  "'KIDULTS ASI Bonhams Cars Results Reference Adapter v1'",
  'Typecheck shared core and four source-specific adapters',
  'Run four-adapter deterministic fixture and mutation proof',
  'Validate Wave 2 implementation truth',
  'Reject ambiguous-dollar semantic weakening mutation',
  'Reject false adapter activation and Evidence mutation',
  'Reject implemented-adapter count inflation mutation',
  'Revalidate pristine Wave 2 state',
  'Emit KPMO Wave 2 receipt',
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(workflow.includes('contents: read') && !workflow.includes('contents: write'), 'WORKFLOW_CONTENTS_BOUNDARY');
assert(workflow.includes('persist-credentials: false') && !workflow.includes('git push'), 'WORKFLOW_REPOSITORY_MUTATION_BOUNDARY');
assert(!workflow.includes('curl ') && !workflow.includes('wget '), 'WORKFLOW_UNDECLARED_NETWORK');

for (const marker of [
  '# KIDULTS ASI Source Adapter Wave 2 v1',
  'Barrett-Jackson Results',
  'Broad Arrow Results',
  'Collecting Cars Sold',
  'Iconic Auctioneers Results',
  '5 source-specific adapters implemented',
  '11 source-specific adapters pending',
  '40/40 negative fixture mutations rejected',
  'Evidence admitted: 0',
  'Parser implementation is not Evidence admission',
]) assert(doc.includes(marker), `DOC_MARKER:${marker}`);

for (const [key, expected] of Object.entries({
  fixture_is_empirical_source_snapshot: false,
  implemented_parser_is_activated_adapter: false,
  profile_registration_is_rights_verification: false,
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
  id: 'kidults-asi-source-adapter-wave2-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  wave_source_specific_adapters_implemented: 4,
  portfolio_source_specific_adapters_implemented: 5,
  registered_source_profiles: 16,
  source_specific_adapters_pending: 11,
  deterministic_replays_verified: 4,
  positive_fixture_candidates_parsed: 4,
  negative_fixture_mutations_rejected: 40,
  live_source_snapshots_verified: 0,
  field_purpose_rights_verified_sources: 0,
  source_specific_adapters_activated: 0,
  evidence_admitted: 0,
  market_events_created: 0,
  first_evidence_admission_state: contract.first_evidence_admission_gate.state,
  public_release: 'HOLD',
  production: 'HOLD',
}, null, 2));
