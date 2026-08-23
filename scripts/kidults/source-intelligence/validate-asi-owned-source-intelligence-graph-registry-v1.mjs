#!/usr/bin/env node
import fs from 'node:fs';

const files = {
  contract: 'coordination/kidults/source-intelligence/asi-owned-source-intelligence-graph-contract-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-owned-source-intelligence-graph-registry-v1.json',
  builder: 'scripts/kidults/source-intelligence/build-asi-owned-source-intelligence-graph-v1.1.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-owned-source-intelligence-graph-v1.mjs',
  workflow: '.github/workflows/kidults-asi-owned-source-intelligence-graph-v1.yml',
  doc: 'docs/kidults/asi/asi-owned-source-intelligence-graph-v1.md'
};
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
for (const [key, file] of Object.entries(files)) assert(fs.existsSync(file), `MISSING_${key.toUpperCase()}:${file}`);

const contract = json(files.contract);
const registry = json(files.registry);
const builder = read(files.builder);
const validator = read(files.validator);
const workflow = read(files.workflow);
const doc = read(files.doc);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

assert(contract.id === 'kidults-asi-owned-source-intelligence-graph-contract-v1', 'CONTRACT_ID');
assert(registry.id === 'kidults-asi-owned-source-intelligence-graph-registry-v1', 'REGISTRY_ID');
assert(registry.version === '1.0.0' && registry.owner === 'KPMO' && registry.priority === 'P2', 'REGISTRY_METADATA');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(principles), 'REGISTRY_PRINCIPLE_ORDER');
assert(JSON.stringify(registry.registered_node_types) === JSON.stringify(contract.graph_model.node_types), 'REGISTRY_NODE_TYPES');
assert(JSON.stringify(registry.registered_edge_types) === JSON.stringify(contract.graph_model.edge_types), 'REGISTRY_EDGE_TYPES');
assert(JSON.stringify(registry.registered_outputs) === JSON.stringify(contract.required_outputs), 'REGISTRY_OUTPUTS');
for (const [key, expected] of Object.entries({
  contract: files.contract,
  canonical_builder: files.builder,
  validator: files.validator,
  workflow: files.workflow,
  human_readme: files.doc
})) assert(registry.registered_assets?.[key] === expected, `REGISTRY_PATH:${key}`);
assert(registry.registered_assets?.superseded_draft_builder === 'scripts/kidults/source-intelligence/build-asi-owned-source-intelligence-graph-v1.mjs', 'REGISTRY_SUPERSEDED_BUILDER');
assert(registry.automatic_activation?.main_push === true, 'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule === '52 * * * *', 'REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.upstream_workflow === 'KIDULTS ASI Candidate Preflight Wave v1', 'REGISTRY_UPSTREAM');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');
for (const [key, expected] of Object.entries({
  restore_latest_main_p0_artifact: true,
  restore_latest_main_p1_artifact: true,
  deterministic_two_run_replay: true,
  canonical_node_and_edge_sort: true,
  duplicate_node_and_edge_rejection: true,
  orphan_mission_and_candidate_rejection: true,
  merged_lineage_refs_for_canonical_edges: true,
  immutable_input_and_output_digests: true,
  no_direct_repository_mutation_from_workflow: true
})) assert(registry.execution_guarantees?.[key] === expected, `REGISTRY_GUARANTEE:${key}`);

for (const marker of [
  'workflow_dispatch:',
  'schedule:',
  "cron: '52 * * * *'",
  'push:',
  'workflow_run:',
  "'KIDULTS ASI Candidate Preflight Wave v1'",
  'Restore latest main P0 and P1 artifacts',
  'Build owned source-intelligence graph twice',
  'Validate P2 owned source-intelligence graph',
  'Reject source-candidate-as-evidence mutation',
  'Reject market-event node mutation',
  'Reject orphan mission mutation',
  'Reject graph digest mutation',
  'Emit KPMO P2 owned-value receipt'
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(workflow.includes('contents: read') && !workflow.includes('contents: write'), 'WORKFLOW_CONTENT_PERMISSION');
assert(workflow.includes('persist-credentials: false') && !workflow.includes('git push'), 'WORKFLOW_REPOSITORY_MUTATION');

for (const marker of [
  'MERGED_SOURCE_REFERENCE_LINEAGE',
  'KIDULTS_OWNED_SOURCE_INTELLIGENCE_GRAPH_BUILT',
  'MISSION_HAS_SOURCE_CANDIDATE',
  'CANDIDATE_HAS_FACTUAL_ORIGIN_CANDIDATE',
  'CANDIDATE_ASSIGNED_PREFLIGHT',
  'CANDIDATE_HAS_ADMISSION_READINESS',
  'market_evidence_nodes: 0',
  'snapshot_candidates_created: 0'
]) assert(builder.includes(marker), `BUILDER_MARKER:${marker}`);
for (const marker of [
  'GRAPH_NODE_CARDINALITY',
  'GRAPH_EDGE_CARDINALITY',
  'GRAPH_ORPHAN_MISSION',
  'GRAPH_ORPHAN_CANDIDATE',
  'LINEAGE_GRAPH_DIGEST',
  'QUALITY_FORBIDDEN_TYPES',
  'MANIFEST_OUTPUT_DIGEST'
]) assert(validator.includes(marker), `VALIDATOR_MARKER:${marker}`);
for (const marker of [
  '# KIDULTS ASI Owned Source Intelligence Graph v1',
  'P2',
  'Mission → Source Candidate',
  'Canonical Host',
  'Factual-Origin Candidate',
  'Host Preflight',
  'Admission Readiness',
  'Source Intelligence Graph ≠ Market Evidence Graph'
]) assert(doc.includes(marker), `DOC_MARKER:${marker}`);

for (const [key, expected] of Object.entries({
  source_intelligence_graph_is_market_evidence_graph: false,
  source_candidate_is_evidence: false,
  preflight_is_admission: false,
  factual_origin_candidate_is_verified_origin: false,
  admission_readiness_is_admission: false,
  market_event_created: false,
  transaction_created: false,
  price_observation_created: false,
  liquidity_measure_created: false,
  evidence_admitted: false,
  snapshot_candidate_created: false,
  market_claim_created: false,
  public_release: 'HOLD',
  production: 'HOLD'
})) assert(registry.truth_boundary?.[key] === expected, `REGISTRY_TRUTH_BOUNDARY:${key}`);

console.log(JSON.stringify({
  id: 'kidults-asi-owned-source-intelligence-graph-registry-validation-v1',
  state: 'VERIFIED_PASS',
  principles,
  node_types: registry.registered_node_types.length,
  edge_types: registry.registered_edge_types.length,
  outputs: registry.registered_outputs.length,
  automatic_main_push: true,
  automatic_schedule: registry.automatic_activation.schedule,
  automatic_upstream_workflow: registry.automatic_activation.upstream_workflow,
  direct_repository_mutation_from_workflow: false,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
