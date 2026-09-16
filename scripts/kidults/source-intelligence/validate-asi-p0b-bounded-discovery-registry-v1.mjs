#!/usr/bin/env node
import fs from 'node:fs';

const files = {
  contract: 'coordination/kidults/source-intelligence/asi-p0b-bounded-discovery-candidate-contract-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-p0b-bounded-discovery-candidate-registry-v1.json',
  p0Contract: 'coordination/kidults/source-intelligence/asi-p0-mission-consumption-contract-v1.json',
  p0Registry: 'coordination/kidults/source-intelligence/asi-p0-mission-consumption-registry-v1.json',
  builder: 'scripts/kidults/source-intelligence/build-asi-p0b-bounded-discovery-candidates-v1.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-p0b-bounded-discovery-candidates-v1.mjs',
  workflow: '.github/workflows/kidults-asi-p0b-bounded-discovery-candidates-v1.yml',
  doc: 'docs/kidults/asi/asi-p0b-bounded-discovery-candidates-v1.md'
};
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (p) => fs.readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));
for (const [key, value] of Object.entries(files)) assert(fs.existsSync(value), `MISSING_${key.toUpperCase()}:${value}`);
const contract = json(files.contract);
const registry = json(files.registry);
const workflow = read(files.workflow);
const builder = read(files.builder);
const validator = read(files.validator);
const doc = read(files.doc);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

assert(contract.id === 'kidults-asi-p0b-bounded-discovery-candidate-contract-v1', 'CONTRACT_ID');
assert(registry.id === 'kidults-asi-p0b-bounded-discovery-candidate-registry-v1', 'REGISTRY_ID');
assert(registry.version === '1.1.0' && registry.owner === 'KPMO' && registry.priority === 'P0', 'REGISTRY_METADATA');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLE_ORDER');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(principles), 'REGISTRY_PRINCIPLE_ORDER');
for (const [key, expected] of Object.entries({
  contract: files.contract,
  p0_contract: files.p0Contract,
  p0_registry: files.p0Registry,
  builder: files.builder,
  validator: files.validator,
  workflow: files.workflow,
  human_readme: files.doc
})) assert(registry.registered_assets?.[key] === expected, `REGISTRY_PATH:${key}`);
assert(registry.registered_outputs?.length === 5, 'REGISTRY_OUTPUT_COUNT');
assert(registry.execution_chain?.length === 8, 'REGISTRY_EXECUTION_CHAIN');
assert(registry.automatic_activation?.main_push === true, 'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule === '37 * * * *', 'REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.upstream_workflow === 'KIDULTS ASI P0 Mission Consumption v1', 'REGISTRY_UPSTREAM');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');
assert(registry.next_stage?.id === 'P1_SOURCE_CLASSIFICATION_AND_EVIDENCE_ADMISSION_PREFLIGHT', 'REGISTRY_NEXT_STAGE');

for (const marker of [
  'workflow_dispatch:', 'schedule:', "cron: '37 * * * *'", 'push:', 'workflow_run:',
  "'KIDULTS ASI P0 Mission Consumption v1'", 'Restore exact-main shared Source Fabric provider state', 'Enforce shared provider-budget regression invariant',
  'Build P0B source candidate increment', 'Reject source-candidate-as-evidence mutation',
  'Reject region-hint-as-coverage mutation', 'Reject host-as-factual-origin mutation',
  'Reject target-content acquisition mutation', 'Emit fail-closed KPMO P0B discovery receipt'
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(workflow.includes('contents: read') && !workflow.includes('contents: write'), 'WORKFLOW_CONTENTS_BOUNDARY');
assert(workflow.includes('persist-credentials: false') && !workflow.includes('git push'), 'WORKFLOW_MUTATION_BOUNDARY');

for (const marker of [
  'P0B_SOURCE_FABRIC_NO_CANDIDATES', 'P0B_NO_SUCCESSFUL_LIVE_DISCOVERY_LANE_OBSERVATION',
  'OBSERVED_PUBLIC_METADATA_DISCOVERY_CANDIDATE', 'REGION_HINT_UNVERIFIED',
  'CANDIDATE_ASSIGNED_ORIGIN_INDEPENDENCE_UNVERIFIED', 'target_site_bodies_crawled: 0'
]) assert(builder.includes(marker), `BUILDER_MARKER:${marker}`);
for (const marker of [
  'CANDIDATE_CANONICAL_COUNT', 'BINDING_NO_MISSION_CANDIDATE_INCREMENT',
  'BINDING_REGION_NOT_EXACT', 'DIVERSITY_HOST_ORIGIN_BOUNDARY',
  'MANIFEST_PROMOTION_BOUNDARY'
]) assert(validator.includes(marker), `VALIDATOR_MARKER:${marker}`);
for (const marker of [
  '# KIDULTS ASI P0B Bounded Discovery Candidates v1',
  'Source Fabric Scale PI1', 'P0B issues zero provider requests',
  'Source Candidate ≠ Evidence', 'Distinct Host ≠ Distinct Factual Origin'
]) assert(doc.includes(marker), `DOC_MARKER:${marker}`);

for (const [key, expected] of Object.entries({
  public_metadata_network_discovery_is_executed: false,
  exact_main_shared_source_fabric_is_consumed: true,
  provider_requests_issued_by_p0b: 0,
  source_candidates_are_observed: true,
  target_site_body_collection_is_executed: false,
  target_content_is_acquired: false,
  source_candidates_are_evidence: false,
  regional_coverage_is_proven: false,
  factual_origin_independence_is_proven: false,
  collection_right_is_created: false,
  evidence_is_admitted: false,
  market_claim_is_created: false,
  public_release: 'HOLD',
  production: 'HOLD'
})) assert(registry.truth_boundary?.[key] === expected, `REGISTRY_TRUTH_BOUNDARY:${key}`);

console.log(JSON.stringify({
  id: 'kidults-asi-p0b-bounded-discovery-registry-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  automatic_main_push: true,
  automatic_schedule: registry.automatic_activation.schedule,
  automatic_upstream_workflow: registry.automatic_activation.upstream_workflow,
  p0b_provider_requests: contract.truth_boundary.provider_requests_issued_by_p0b,
  upstream_bounded_live_lanes: contract.upstream_bounded_live_lanes.length,
  upstream_scope_rotations: contract.upstream_scope_rotation_count,
  next_stage: registry.next_stage.id,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
