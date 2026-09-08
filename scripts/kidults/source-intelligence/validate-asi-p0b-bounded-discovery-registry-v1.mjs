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
  providerBoundary: 'scripts/kidults/source-intelligence/validate-asi-p0b-provider-hard-disable-v1.mjs',
  sourceFabricWorkflow: '.github/workflows/kidults-asi-source-fabric-scale-pi1.yml',
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
  source_fabric_workflow: files.sourceFabricWorkflow,
  source_fabric_artifact: 'kidults-asi-source-fabric-scale-pi1',
  source_fabric_payload: 'asi-public-metadata-source-fabric-v1.json',
  human_readme: files.doc
})) assert(registry.registered_assets?.[key] === expected, `REGISTRY_PATH:${key}`);
assert(registry.registered_outputs?.length === 5, 'REGISTRY_OUTPUT_COUNT');
assert(registry.execution_chain?.length === 7, 'REGISTRY_EXECUTION_CHAIN');
assert(registry.provider_budget_authority?.authority === 'KIDULTS_ASI_SOURCE_FABRIC_SCALE_PI1_ONLY', 'REGISTRY_PROVIDER_AUTHORITY');
assert(registry.provider_budget_authority?.p0b_direct_provider_execution === false, 'REGISTRY_P0B_PROVIDER_EXECUTION_FALSE');
assert(registry.provider_budget_authority?.p0b_provider_requests === 0, 'REGISTRY_P0B_PROVIDER_REQUEST_ZERO');
assert(registry.provider_budget_authority?.exact_artifact_consumption_required === true, 'REGISTRY_EXACT_ARTIFACT_REQUIRED');
assert(JSON.stringify(registry.provider_budget_authority?.runtime_authoritative_events) === JSON.stringify(['schedule','workflow_dispatch','push']), 'REGISTRY_RUNTIME_EVENTS');
assert(registry.automatic_activation?.main_push === false, 'REGISTRY_MAIN_PUSH_FORBIDDEN');
assert(registry.automatic_activation?.schedule === null, 'REGISTRY_SCHEDULE_FORBIDDEN');
assert(registry.automatic_activation?.upstream_workflow === 'KIDULTS ASI Source Fabric Scale PI1', 'REGISTRY_UPSTREAM');
assert(registry.automatic_activation?.upstream_trigger_class === 'workflow_run', 'REGISTRY_UPSTREAM_CLASS');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_EXACT_CURRENT_MAIN_ARTIFACT_ONLY', 'REGISTRY_MANUAL_ROLE');
assert(registry.next_stage?.id === 'P1_SOURCE_CLASSIFICATION_AND_EVIDENCE_ADMISSION_PREFLIGHT', 'REGISTRY_NEXT_STAGE');

for (const marker of [
  'workflow_dispatch:', 'workflow_run:', "'KIDULTS ASI Source Fabric Scale PI1'",
  'Restore exact Source Fabric input', 'Build P0B source candidate increment from Source Fabric',
  'Reject source-candidate-as-evidence mutation', 'Reject region-hint-as-coverage mutation',
  'Reject host-as-factual-origin mutation', 'Reject target-content acquisition mutation',
  'Emit fail-closed KPMO P0B consumer receipt'
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
const triggerHeader = workflow.slice(0, workflow.indexOf('\npermissions:'));
assert(!/^\s{2}schedule:/m.test(triggerHeader), 'WORKFLOW_DIRECT_SCHEDULE_FORBIDDEN');
assert(!/^\s{2}push:/m.test(triggerHeader), 'WORKFLOW_DIRECT_PUSH_FORBIDDEN');
assert(!workflow.includes('ASI_SCOPE_ROTATION='), 'WORKFLOW_DIRECT_PROVIDER_ROTATION_FORBIDDEN');
assert(!workflow.includes('node scripts/kidults/source-intelligence/asi-openalex-gdelt-public-metadata-discovery-v1.mjs'), 'WORKFLOW_DIRECT_PROVIDER_EXECUTION_FORBIDDEN');
assert(workflow.includes('contents: read') && workflow.includes('actions: read') && !workflow.includes('contents: write'), 'WORKFLOW_READ_ONLY_BOUNDARY');
assert(workflow.includes('persist-credentials: false') && !workflow.includes('git push'), 'WORKFLOW_MUTATION_BOUNDARY');
assert(workflow.includes('/actions/runs/${EVENT_RUN_ID}/artifacts?per_page=100'), 'WORKFLOW_EXACT_TRIGGER_ARTIFACT_MISSING');
assert(workflow.includes('--expected-digest "$SOURCE_FABRIC_ARTIFACT_DIGEST"') && workflow.indexOf('--expected-digest "$SOURCE_FABRIC_ARTIFACT_DIGEST"') < workflow.indexOf('unzip -q -o /tmp/p0b-source-fabric.zip'), 'WORKFLOW_SAFE_ZIP_ORDER');

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
  'Source Fabric', 'Source Candidate ≠ Evidence', 'Distinct Host ≠ Distinct Factual Origin'
]) assert(doc.includes(marker), `DOC_MARKER:${marker}`);

for (const [key, expected] of Object.entries({
  public_metadata_network_discovery_is_executed_by_p0b: false,
  source_fabric_discovery_artifact_is_consumed: true,
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
  production: 'HOLD',
  g5: 'HOLD'
})) assert(registry.truth_boundary?.[key] === expected, `REGISTRY_TRUTH_BOUNDARY:${key}`);

console.log(JSON.stringify({
  id: 'kidults-asi-p0b-bounded-discovery-registry-validation-v1',
  version: '1.1.0',
  state: 'VERIFIED_PASS',
  provider_budget_authority: registry.provider_budget_authority.authority,
  p0b_provider_requests: 0,
  p0b_direct_provider_execution: false,
  automatic_upstream_workflow: registry.automatic_activation.upstream_workflow,
  automatic_upstream_trigger_class: registry.automatic_activation.upstream_trigger_class,
  candidate_pipeline_liveness_preserved: true,
  next_stage: registry.next_stage.id,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
