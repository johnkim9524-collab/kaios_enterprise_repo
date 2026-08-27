#!/usr/bin/env node
import fs from 'node:fs';

const [testReceiptPath = '/tmp/kidults-asi-source-adapter-wave3-test-receipt-v1.json'] = process.argv.slice(2);
const files = {
  contract: 'coordination/kidults/source-intelligence/asi-source-adapter-wave3-contract-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-source-adapter-wave3-registry-v1.json',
  frontier: 'coordination/kidults/source-intelligence/targeted-high-authority-source-expansion-v1.psv',
  runtimeContract: 'coordination/kidults/source-intelligence/asi-p1-market-event-adapter-runtime-contract-v1.json',
  wave2Registry: 'coordination/kidults/source-intelligence/asi-source-adapter-wave2-registry-v1.json',
  sharedCore: 'services/kidults-autonomous-intelligence/src/asi/source-adapters/public-auction-results.ts',
  bonhamsWatches: 'services/kidults-autonomous-intelligence/src/asi/source-adapters/bonhams-watches-results.ts',
  christiesWatches: 'services/kidults-autonomous-intelligence/src/asi/source-adapters/christies-watches-results.ts',
  sothebysWatches: 'services/kidults-autonomous-intelligence/src/asi/source-adapters/sothebys-watches-results.ts',
  christiesHandbags: 'services/kidults-autonomous-intelligence/src/asi/source-adapters/christies-handbags-results.ts',
  test: 'services/kidults-autonomous-intelligence/scripts/asi-source-adapter-wave3-test.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-source-adapter-wave3-v1.mjs',
  workflow: '.github/workflows/kidults-asi-source-adapter-wave3-v1.yml',
  documentation: 'docs/kidults/asi/asi-source-adapter-wave3-v1.md'
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
const wave2 = json(files.wave2Registry);
const receipt = json(testReceiptPath);
const workflow = read(files.workflow);
const doc = read(files.documentation);
const shared = read(files.sharedCore);
const test = read(files.test);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const expectedSources = [
  ['bonhams-watches-results', 18, files.bonhamsWatches, 'parseBonhamsWatchesSoldSnapshot'],
  ['christies-watches-results', 12, files.christiesWatches, 'parseChristiesWatchesSoldSnapshot'],
  ['sothebys-watches-results', 12, files.sothebysWatches, 'parseSothebysWatchesSoldSnapshot'],
  ['christies-handbags-results', 6, files.christiesHandbags, 'parseChristiesHandbagsSoldSnapshot']
];

assert(contract.id === 'kidults-asi-source-adapter-wave3-contract-v1' && contract.version === '1.0.0', 'CONTRACT_ID_VERSION');
assert(contract.status === 'IMPLEMENTED_FIXTURE_VERIFIED_NOT_RIGHTS_OR_LIVE_SCHEMA_VERIFIED', 'CONTRACT_STATUS');
assert(contract.owner === 'KPMO' && contract.priority === 'P1', 'CONTRACT_AUTHORITY');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLES');
assert(contract.source_adapters?.length === 4, 'CONTRACT_SOURCE_COUNT');
assert(contract.shared_parser_controls?.length >= 16, 'CONTRACT_CONTROL_COUNT');
assert(contract.required_mutation_families_per_source?.length === 10, 'CONTRACT_MUTATION_COUNT');
assert(contract.portfolio_state_after_wave?.registered_source_profiles === 16, 'CONTRACT_PROFILE_COUNT');
assert(contract.portfolio_state_after_wave?.source_specific_adapters_implemented === 9, 'CONTRACT_IMPLEMENTED_COUNT');
assert(contract.portfolio_state_after_wave?.source_specific_adapters_pending === 7, 'CONTRACT_PENDING_COUNT');
assert(contract.portfolio_state_after_wave?.source_specific_adapters_activated === 0, 'CONTRACT_ACTIVATION_BOUNDARY');
assert(contract.portfolio_state_after_wave?.empirical_market_events_admitted === 0, 'CONTRACT_EVENT_BOUNDARY');
assert(contract.first_evidence_admission_gate?.state === 'BLOCKED_PENDING_EMPIRICAL_RIGHTS_SCHEMA_SEMANTICS_OWNER_ORIGIN_AND_ACTIVATION', 'CONTRACT_ADMISSION_STATE');

assert(registry.id === 'kidults-asi-source-adapter-wave3-registry-v1' && registry.version === '1.0.0', 'REGISTRY_ID_VERSION');
assert(registry.status === 'FOUR_ADAPTERS_IMPLEMENTED_FIXTURE_VERIFIED_NOT_EMPIRICALLY_ACTIVATED', 'REGISTRY_STATUS');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(principles), 'REGISTRY_PRINCIPLES');
for (const [key, expected] of Object.entries({
  contract: files.contract,
  shared_parser_core: files.sharedCore,
  bonhams_watches_adapter: files.bonhamsWatches,
  christies_watches_adapter: files.christiesWatches,
  sothebys_watches_adapter: files.sothebysWatches,
  christies_handbags_adapter: files.christiesHandbags,
  test: files.test,
  validator: files.validator,
  workflow: files.workflow,
  documentation: files.documentation
})) assert(registry.registered_assets?.[key] === expected, `REGISTRY_ASSET:${key}`);
assert(registry.implementation_state?.wave_source_specific_adapters_implemented === 4, 'REGISTRY_WAVE_IMPLEMENTED');
assert(registry.implementation_state?.portfolio_source_specific_adapters_implemented === 9, 'REGISTRY_PORTFOLIO_IMPLEMENTED');
assert(registry.implementation_state?.portfolio_source_specific_adapters_pending === 7, 'REGISTRY_PENDING');
assert(registry.implementation_state?.deterministic_fixture_suites_implemented === 4, 'REGISTRY_FIXTURE_COUNT');
assert(registry.implementation_state?.generic_runtime_bindings_implemented === 4, 'REGISTRY_RUNTIME_BINDINGS');
assert(registry.implementation_state?.source_specific_adapters_activated === 0, 'REGISTRY_ACTIVATION_BOUNDARY');
assert(registry.implementation_state?.empirical_market_events_admitted === 0, 'REGISTRY_EVENT_BOUNDARY');
assert(registry.implemented_source_ids?.length === 9 && new Set(registry.implemented_source_ids).size === 9, 'REGISTRY_IMPLEMENTED_IDS');
assert(registry.next_source_adapter_backlog?.length === 7, 'REGISTRY_NEXT_BACKLOG');
assert(registry.automatic_activation?.main_push === true, 'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule === '27 */3 * * *', 'REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.upstream_workflows?.includes('KIDULTS ASI Source Adapter Wave 2 v1'), 'REGISTRY_UPSTREAM_WAVE2');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');

assert(wave2.id === 'kidults-asi-source-adapter-wave2-registry-v1', 'WAVE2_REGISTRY_ID');
assert(wave2.implementation_state?.portfolio_source_specific_adapters_implemented === 5, 'WAVE2_BASELINE_IMPLEMENTED');
assert(wave2.implementation_state?.portfolio_source_specific_adapters_pending === 11, 'WAVE2_BASELINE_PENDING');
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
for (const [sourceId, assignments, modulePath, functionMarker] of expectedSources) {
  const entry = contractById.get(sourceId);
  assert(entry, `CONTRACT_SOURCE_MISSING:${sourceId}`);
  assert(entry.module === modulePath, `CONTRACT_MODULE:${sourceId}`);
  assert(entry.verified_assignment_count === assignments, `CONTRACT_ASSIGNMENTS:${sourceId}`);
  assert(entry.implementation_state === 'IMPLEMENTED_FIXTURE_VERIFIED_NOT_EMPIRICALLY_ACTIVATED', `CONTRACT_IMPLEMENTATION_STATE:${sourceId}`);
  assert(JSON.stringify(entry.implemented_claim_parsers) === JSON.stringify(['DATED_OBSERVED_SOLD_TRANSACTION']), `CONTRACT_IMPLEMENTED_CLAIMS:${sourceId}`);
  assert(JSON.stringify(entry.template_only_claims) === JSON.stringify(['CURRENT_PRICE']), `CONTRACT_TEMPLATE_CLAIMS:${sourceId}`);
  assert(frontierById.has(sourceId), `FRONTIER_SOURCE_MISSING:${sourceId}`);
  assert(String(frontierById.get(sourceId).source_roles).split(';').includes('SOLD_TRANSACTION'), `FRONTIER_SOLD_ROLE:${sourceId}`);
  const runtimeProfile = runtimeProfiles.get(sourceId);
  assert(runtimeProfile, `RUNTIME_PROFILE_MISSING:${sourceId}`);
  assert(runtimeProfile.assignments === assignments, `RUNTIME_ASSIGNMENTS:${sourceId}`);
  assert(JSON.stringify(runtimeProfile.claims) === JSON.stringify(['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE']), `RUNTIME_CLAIMS:${sourceId}`);
  const moduleSource = read(modulePath);
  assert(moduleSource.includes(functionMarker), `MODULE_PARSE_EXPORT:${sourceId}`);
  assert(moduleSource.includes(sourceId), `MODULE_SOURCE_ID:${sourceId}`);
  assert(moduleSource.includes('parsePublicAuctionSoldSnapshot'), `MODULE_SHARED_BINDING:${sourceId}`);
  assert(moduleSource.includes("target_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE']"), `MODULE_CLAIM_BOUNDARY:${sourceId}`);
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
  'sold_semantics_empirically_verified: false',
  'evidence_admitted: false',
  'market_event_created: false',
  'provider_direct_to_index_or_projection_allowed: false'
]) assert(shared.includes(marker), `SHARED_CORE_MARKER:${marker}`);
assert(!shared.includes('fetch(') && !shared.includes("from 'node:http'") && !shared.includes("from 'node:https'"), 'SHARED_CORE_NETWORK_FORBIDDEN');

assert(receipt.id === 'kidults-asi-source-adapter-wave3-test-receipt-v1' && receipt.state === 'VERIFIED_PASS', 'TEST_RECEIPT_ID_STATE');
assert(receipt.source_specific_adapters_implemented === 4, 'TEST_RECEIPT_IMPLEMENTED');
assert(receipt.total_source_specific_adapters_implemented_in_portfolio === 9, 'TEST_RECEIPT_PORTFOLIO');
assert(receipt.remaining_source_specific_adapters === 7, 'TEST_RECEIPT_PENDING');
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
  'wrong-path'
]) assert(test.includes(marker), `TEST_MARKER:${marker}`);

for (const marker of [
  'workflow_dispatch:',
  'schedule:',
  "cron: '27 */3 * * *'",
  'push:',
  'pull_request:',
  'group: kidults-asi-source-adapter-wave3-v1-${{ github.event_name }}-${{ github.sha }}',
  'Typecheck shared core and four Wave 3 adapters',
  'Run four-adapter Wave 3 deterministic fixture and mutation proof',
  'Validate Wave 3 implementation truth',
  'Reject ambiguous-dollar semantic weakening mutation',
  'Reject false adapter activation and Evidence mutation',
  'Reject implemented-adapter count inflation mutation',
  'Revalidate pristine Wave 3 state',
  'Emit KPMO Wave 3 receipt'
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(!workflow.includes('workflow_run:'), 'WORKFLOW_STATIC_VALIDATOR_MUST_NOT_CONSUME_UPSTREAM_ARTIFACT');
assert(workflow.includes('contents: read') && !workflow.includes('contents: write'), 'WORKFLOW_CONTENTS_BOUNDARY');
assert(workflow.includes('persist-credentials: false') && !workflow.includes('git push'), 'WORKFLOW_REPOSITORY_MUTATION_BOUNDARY');
assert(!workflow.includes('curl ') && !workflow.includes('wget '), 'WORKFLOW_UNDECLARED_NETWORK');

for (const marker of [
  '# KIDULTS ASI Source Adapter Wave 3 v1',
  'Bonhams Watches Results',
  "Christie's Watches Results",
  "Sotheby's Watches Results",
  "Christie's Handbags Results",
  '9 source-specific adapters implemented',
  '7 source-specific adapters pending',
  '40/40 negative fixture mutations rejected',
  'Evidence admitted: 0',
  'Parser implementation is not Evidence admission'
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
  snapshot_candidate_created: false,
  public_release: 'HOLD',
  production: 'HOLD'
})) assert(contract.truth_boundary?.[key] === expected, `CONTRACT_BOUNDARY:${key}`);

console.log(JSON.stringify({
  id: 'kidults-asi-source-adapter-wave3-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  wave_source_specific_adapters_implemented: 4,
  portfolio_source_specific_adapters_implemented: 9,
  registered_source_profiles: 16,
  source_specific_adapters_pending: 7,
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
  production: 'HOLD'
}, null, 2));
