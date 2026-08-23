#!/usr/bin/env node
import fs from 'node:fs';

const files = {
  contract: 'coordination/kidults/source-intelligence/asi-mission-directed-discovery-contract-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-mission-directed-discovery-registry-v1.json',
  missionConsumptionRegistry: 'coordination/kidults/source-intelligence/asi-mission-consumption-registry-v1.json',
  strictGate: 'coordination/kidults/source-intelligence/strict-current-market-admission-gate-v1.json',
  discoveryRunner: 'scripts/kidults/source-intelligence/asi-mission-directed-public-metadata-discovery-v1.mjs',
  discoveryFallbackRunner: 'scripts/kidults/source-intelligence/asi-mission-directed-github-fallback-discovery-v1.mjs',
  discoveryValidator: 'scripts/kidults/source-intelligence/validate-asi-mission-directed-discovery-v1.mjs',
  readinessBuilder: 'scripts/kidults/source-intelligence/build-asi-mission-claim-admission-readiness-v1.mjs',
  readinessValidator: 'scripts/kidults/source-intelligence/validate-asi-mission-claim-admission-readiness-v1.mjs',
  gate1Builder: 'scripts/kidults/source-intelligence/build-asi-gate1-safe-candidate-pool-v1.mjs',
  gate1Validator: 'scripts/kidults/source-intelligence/validate-asi-gate1-safe-candidate-pool-v1.mjs',
  gate2Builder: 'scripts/kidults/source-intelligence/build-asi-gate2-independent-reverification-v1.mjs',
  gate2Validator: 'scripts/kidults/source-intelligence/validate-asi-gate2-independent-reverification-v1.mjs',
  gate3Builder: 'scripts/kidults/source-intelligence/build-asi-gate3-admission-runtime-v1.mjs',
  gate3Validator: 'scripts/kidults/source-intelligence/validate-asi-gate3-admission-runtime-v1.mjs',
  workflow: '.github/workflows/kidults-asi-mission-directed-discovery-v1.yml',
  doc: 'docs/kidults/asi/asi-mission-directed-discovery-v1.md'
};
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
for (const [key, file] of Object.entries(files)) assert(fs.existsSync(file), `MISSING_${key.toUpperCase()}:${file}`);

const contract = json(files.contract);
const registry = json(files.registry);
const missionConsumptionRegistry = json(files.missionConsumptionRegistry);
const strictGate = json(files.strictGate);
const runner = read(files.discoveryRunner);
const fallbackRunner = read(files.discoveryFallbackRunner);
const discoveryValidator = read(files.discoveryValidator);
const readinessBuilder = read(files.readinessBuilder);
const readinessValidator = read(files.readinessValidator);
const workflow = read(files.workflow);
const doc = read(files.doc);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const providerLanes = ['WIKIDATA_OFFICIAL_WEBSITE_GRAPH', 'GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA', 'DATACITE_OPEN_RESEARCH_METADATA'];

assert(contract.id === 'kidults-asi-mission-directed-discovery-contract-v1', 'CONTRACT_ID');
assert(registry.id === 'kidults-asi-mission-directed-discovery-registry-v1', 'REGISTRY_ID');
assert(registry.version === contract.version && registry.owner === 'KPMO' && registry.priority === 'P0_TO_P1_BRIDGE', 'REGISTRY_METADATA');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(principles), 'REGISTRY_PRINCIPLE_ORDER');
assert(missionConsumptionRegistry.id === 'kidults-asi-mission-consumption-registry-v1', 'MISSION_CONSUMPTION_BINDING');
assert(strictGate.id === 'kidults-strict-current-market-admission-gate-v1', 'STRICT_GATE_BINDING');
assert(JSON.stringify(registry.provider_lanes) === JSON.stringify(providerLanes), 'REGISTRY_PROVIDER_LANES');
assert(registry.fail_soft_discovery?.primary_zero_candidate_or_runtime_failure_behavior === 'RUN_BOUNDED_GITHUB_METADATA_FALLBACK', 'REGISTRY_FAIL_SOFT_BEHAVIOR');
assert(registry.fail_soft_discovery?.fallback_provider_lane === 'GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA', 'REGISTRY_FAIL_SOFT_LANE');
assert(registry.fail_soft_discovery?.primary_failure_must_remain_visible === true, 'REGISTRY_PRIMARY_FAILURE_VISIBILITY');
assert(registry.fail_soft_discovery?.fallback_usage_must_remain_visible === true, 'REGISTRY_FALLBACK_VISIBILITY');
assert(registry.fail_soft_discovery?.fallback_candidate_claim_ceiling === 'DISCOVERY_METADATA_ONLY', 'REGISTRY_FALLBACK_CLAIM_CEILING');
assert(registry.fail_soft_discovery?.fallback_can_create_rights_admission_or_claim === false, 'REGISTRY_FALLBACK_PERMISSION');
assert(registry.rolling_state?.batch_size === 24 && registry.rolling_state?.intent_count_at_activation === 426 && registry.rolling_state?.estimated_cycles_per_full_rotation === 18, 'REGISTRY_ROLLING_STATE');
assert(registry.downstream_p1_state?.metadata_gate_chain_implemented === true, 'REGISTRY_METADATA_GATES');
assert(registry.downstream_p1_state?.claim_specific_readiness_compiler_implemented === true, 'REGISTRY_READINESS_COMPILER');
assert(registry.downstream_p1_state?.source_specific_adapter_requirement_compiler_implemented === true, 'REGISTRY_ADAPTER_COMPILER');
assert(registry.downstream_p1_state?.source_specific_market_event_adapters_implemented === false, 'REGISTRY_ADAPTER_OVERCLAIM');
assert(registry.downstream_p1_state?.field_purpose_rights_verified === false, 'REGISTRY_RIGHTS_OVERCLAIM');
assert(registry.downstream_p1_state?.strict_current_price_eligible_sources === 0 && registry.downstream_p1_state?.strict_liquidity_eligible_sources === 0, 'REGISTRY_CLAIM_OVERCLAIM');

for (const [key, expected] of Object.entries({
  contract: files.contract,
  mission_consumption_registry: files.missionConsumptionRegistry,
  strict_current_market_gate: files.strictGate,
  discovery_runner: files.discoveryRunner,
  discovery_fallback_runner: files.discoveryFallbackRunner,
  discovery_validator: files.discoveryValidator,
  readiness_builder: files.readinessBuilder,
  readiness_validator: files.readinessValidator,
  gate1_builder: files.gate1Builder,
  gate1_validator: files.gate1Validator,
  gate2_builder: files.gate2Builder,
  gate2_validator: files.gate2Validator,
  gate3_builder: files.gate3Builder,
  gate3_validator: files.gate3Validator,
  workflow: files.workflow,
  human_readme: files.doc
})) assert(registry.registered_assets?.[key] === expected, `REGISTRY_PATH:${key}`);

assert(registry.automatic_activation?.main_push === true, 'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule === '37 * * * *', 'REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.upstream_workflows?.includes('KIDULTS ASI Mission Consumption v1'), 'REGISTRY_UPSTREAM');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');

for (const marker of [
  'workflow_dispatch:',
  'schedule:',
  "cron: '37 * * * *'",
  'push:',
  'workflow_run:',
  "'KIDULTS ASI Mission Consumption v1'",
  'Restore prior rolling discovery cursor',
  'Execute bounded live mission-directed discovery',
  'Primary discovery failed or produced no candidates; executing bounded fail-soft fallback.',
  'asi-mission-directed-github-fallback-discovery-v1.mjs',
  'Run Gate 1 source safety classification',
  'Run Gate 2 independent reverification',
  'Run Gate 3 metadata admission',
  'Compile strict current-market admission gaps and adapters',
  'Reject metadata-to-market-claim mutation',
  'Reject hidden partial-failure mutation',
  'Emit KPMO mission-directed discovery receipt'
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(workflow.includes('contents: read'), 'WORKFLOW_CONTENTS_READ');
assert(!workflow.includes('contents: write'), 'WORKFLOW_CONTENTS_WRITE_FORBIDDEN');
assert(workflow.includes('persist-credentials: false'), 'WORKFLOW_CREDENTIALS');
assert(!workflow.includes('git push'), 'WORKFLOW_DIRECT_PUSH_FORBIDDEN');

for (const marker of [
  'WIKIDATA_OFFICIAL_WEBSITE_GRAPH',
  'GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA',
  'DATACITE_OPEN_RESEARCH_METADATA',
  'MISSION_DISCOVERY_BATCH_SIZE',
  'ACTIVE_ROLLING_CURSOR',
  'PARTIAL_PROVIDER_FAILURE_VISIBLE',
  'target_site_body_crawled: false',
  'collection_right_created: false'
]) assert(runner.includes(marker), `RUNNER_MARKER:${marker}`);
for (const marker of [
  'FALLBACK_NO_LIVE_CANDIDATE',
  'primary_discovery_fallback_used: true',
  'primary_discovery_failure',
  'GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA',
  'broad_query_fallback_used',
  'target_site_body_crawled: false',
  'collection_right_created: false'
]) assert(fallbackRunner.includes(marker), `FALLBACK_RUNNER_MARKER:${marker}`);
for (const marker of [
  'DISCOVERY_PARTIAL_FAILURE_STATE',
  'DISCOVERY_CANDIDATE_SOLD_ASSERTION',
  'DISCOVERY_CANDIDATE_STATE',
  'STATE_MANUAL_ORCHESTRATION'
]) assert(discoveryValidator.includes(marker), `DISCOVERY_VALIDATOR_MARKER:${marker}`);
for (const marker of [
  'HOLD_DISCOVERY_METADATA_ONLY_ALL_CLAIM_ASSERTIONS_UNSATISFIED',
  'SOURCE_SPECIFIC_CLAIM_ADAPTER_NOT_IMPLEMENTED',
  'metadata_index_admission_is_claim_admission: false',
  'current_price_eligible: false',
  'liquidity_eligible: false'
]) assert(readinessBuilder.includes(marker), `READINESS_BUILDER_MARKER:${marker}`);
for (const marker of [
  'READINESS_ELIGIBILITY_OVERCLAIM',
  'READINESS_METADATA_PROMOTION',
  'ADAPTER_RUNTIME_OVERCLAIM',
  'MANIFEST_CLAIM_OVERCLAIM'
]) assert(readinessValidator.includes(marker), `READINESS_VALIDATOR_MARKER:${marker}`);

for (const marker of [
  '# KIDULTS ASI Mission-Directed Discovery v1',
  '426 Unfilled or Ambiguous Source-Lane Intents',
  'Rolling Cursor and 24-Intent Batch',
  'Fail-soft metadata fallback',
  'Gate 3 Metadata Admission ≠ Market-Event Admission',
  'Source-Specific Adapter Requirements',
  'Dated Sold ≠ Current Price',
  'Sold Count ≠ Liquidity without Exposure Denominator'
]) assert(doc.includes(marker), `DOC_MARKER:${marker}`);

for (const [key, expected] of Object.entries({
  live_public_metadata_discovery_is_market_evidence: false,
  gate3_metadata_admission_is_claim_admission: false,
  source_family_classification_is_terminal_sold_assertion: false,
  registered_or_discovered_endpoint_is_rights_admitted: false,
  adapter_requirement_is_implemented_adapter: false,
  fallback_candidate_is_market_evidence: false,
  public_release: 'HOLD',
  production: 'HOLD'
})) assert(registry.truth_boundary?.[key] === expected, `REGISTRY_TRUTH_BOUNDARY:${key}`);

console.log(JSON.stringify({
  id: 'kidults-asi-mission-directed-discovery-registry-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  platform_principles: principles,
  provider_lanes: providerLanes.length,
  fail_soft_fallback_registered: true,
  rolling_batch_size: registry.rolling_state.batch_size,
  intent_count_at_activation: registry.rolling_state.intent_count_at_activation,
  automatic_main_push: true,
  automatic_schedule: registry.automatic_activation.schedule,
  automatic_upstream_workflows: registry.automatic_activation.upstream_workflows.length,
  metadata_gate_chain_implemented: true,
  claim_readiness_compiler_implemented: true,
  source_adapter_requirement_compiler_implemented: true,
  source_market_event_adapters_implemented: false,
  current_price_eligible_sources: 0,
  liquidity_eligible_sources: 0,
  direct_repository_mutation_from_workflow: false,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
