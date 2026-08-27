#!/usr/bin/env node
import fs from 'node:fs';

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (path) => fs.readFileSync(path, 'utf8');

const files = {
  requirement: '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',
  snapshot: '.github/workflows/kidults-asi-snapshot-readiness-factory-v2.yml',
  steering: '.github/workflows/kidults-asi-autobalance-steering-overlay-live-v1.yml',
  autonomousResolution: '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml',
  ownedGraph: '.github/workflows/kidults-asi-owned-source-intelligence-graph-v2.yml',
  p1: '.github/workflows/kidults-asi-p1-source-preflight-v1.yml',
};

for (const path of Object.values(files)) assert(fs.existsSync(path), `WORKFLOW_MISSING:${path}`);

const requirement = read(files.requirement);
const snapshot = read(files.snapshot);
const steering = read(files.steering);
const autonomousResolution = read(files.autonomousResolution);
const ownedGraph = read(files.ownedGraph);
const p1 = read(files.p1);

const independentTrigger = /^\s{2}(schedule|push):/m;
const globalArtifactListing = '/actions/artifacts?per_page=';

assert(!independentTrigger.test(requirement), 'REQUIREMENT_INDEPENDENT_TRIGGER_FORBIDDEN');
assert(!/^\s{2}schedule:/m.test(steering), 'STEERING_SCHEDULE_TRIGGER_FORBIDDEN');
assert(!independentTrigger.test(ownedGraph), 'OWNED_GRAPH_INDEPENDENT_TRIGGER_FORBIDDEN');
assert(requirement.includes("'KIDULTS ASI Autonomous Resolution Layer v1'"), 'REQUIREMENT_UPSTREAM_TRIGGER_MISSING');
assert(snapshot.includes("'KIDULTS ASI Owned Source Intelligence Graph v2'"), 'SNAPSHOT_UPSTREAM_TRIGGER_MISSING');
assert(steering.includes("'KIDULTS ASI Throughput Coverage Autobalance Live v1'"), 'STEERING_UPSTREAM_TRIGGER_MISSING');
assert(ownedGraph.includes("'KIDULTS ASI P1 Source Preflight v1'"), 'OWNED_GRAPH_UPSTREAM_TRIGGER_MISSING');

for (const [name, workflow] of Object.entries({ requirement, steering })) {
  assert(!workflow.includes(globalArtifactListing), `${name.toUpperCase()}_GLOBAL_ARTIFACT_LISTING_FORBIDDEN`);
  assert(workflow.includes('/actions/runs/${'), `${name.toUpperCase()}_EXACT_RUN_ARTIFACT_QUERY_MISSING`);
}
assert(requirement.includes('git merge-base --is-ancestor'), 'REQUIREMENT_ANCESTOR_BINDING_MISSING');
assert(steering.includes('test "$AUTOBALANCE_SOURCE_SHA" = "$EXPECTED_GENERATION_SHA"'), 'STEERING_EXACT_GENERATION_BINDING_MISSING');
assert(!steering.includes('git merge-base --is-ancestor "$AUTOBALANCE_SOURCE_SHA"'), 'STEERING_ANCESTOR_FALLBACK_FORBIDDEN');
assert(!ownedGraph.includes(globalArtifactListing), 'OWNEDGRAPH_GLOBAL_ARTIFACT_LISTING_FORBIDDEN');
assert(ownedGraph.includes('/actions/runs/${P1_RUN_ID}/artifacts'), 'OWNEDGRAPH_EXACT_RUN_ARTIFACT_QUERY_MISSING');
assert(ownedGraph.includes('P1_SOURCE_SHA="$CURRENT_SHA"') && ownedGraph.includes('test "$P1_SOURCE_SHA" = "$CURRENT_SHA"'), 'OWNEDGRAPH_EXACT_GENERATION_BINDING_MISSING');
assert(!ownedGraph.includes('git merge-base --is-ancestor "$P1_SOURCE_SHA" "$CURRENT_SHA"'), 'OWNEDGRAPH_ANCESTOR_GENERATION_FALLBACK_FORBIDDEN');
const ownedGraphConcurrencyContract = "group: kidults-asi-owned-source-intelligence-graph-v2-${{ github.event_name }}-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.run_id }}";
assert(ownedGraph.includes(ownedGraphConcurrencyContract), 'OWNEDGRAPH_EVENT_SCOPED_CONCURRENCY_MISSING');
const requirementConcurrencyContract = "group: kidults-asi-requirement-adapter-coverage-v1-${{ github.event_name }}-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.run_id }}";
assert(requirement.includes(requirementConcurrencyContract), 'REQUIREMENT_EVENT_SCOPED_CONCURRENCY_MISSING');
assert(requirement.includes('cancel-in-progress: true'), 'REQUIREMENT_CONCURRENCY_FAIL_CLOSED_MISSING');
const requirementProducerEventGuard = "github.event.workflow_run.event != 'push'";
const requirementExactTriggerLine = '\n            RUN_ID="$EVENT_ARL_RUN_ID"\n';
assert(requirement.includes(requirementProducerEventGuard), 'REQUIREMENT_VALIDATION_ONLY_PUSH_GUARD_MISSING');
assert(requirement.includes('EVENT_ARL_RUN_ID') && requirement.includes(requirementExactTriggerLine), 'REQUIREMENT_EXACT_TRIGGER_RUN_BINDING_MISSING');
assert(requirement.includes("run.event!=='push'") && requirement.includes("artifactProducingEvents.has(run.event)"), 'REQUIREMENT_FALLBACK_ARTIFACT_EVENT_FILTER_MISSING');
assert(requirement.includes('AUTONOMOUS_RESOLUTION_ARTIFACT_NOT_AVAILABLE:${RUN_ID}'), 'REQUIREMENT_ARTIFACT_EVENTUAL_CONSISTENCY_FAIL_CLOSE_MISSING');
const snapshotConcurrencyContract = "group: kidults-asi-snapshot-readiness-factory-v2-${{ github.event_name }}-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.run_id }}";
assert(snapshot.includes(snapshotConcurrencyContract), 'SNAPSHOT_EVENT_SCOPED_CONCURRENCY_MISSING');
assert(snapshot.includes('cancel-in-progress: true'), 'SNAPSHOT_CONCURRENCY_FAIL_CLOSED_MISSING');
assert(!snapshot.includes(globalArtifactListing), 'SNAPSHOT_GLOBAL_ARTIFACT_LISTING_FORBIDDEN');
assert(snapshot.includes('/actions/runs/${P2_RUN_ID}/artifacts'), 'SNAPSHOT_EXACT_RUN_ARTIFACT_QUERY_MISSING');
assert(snapshot.includes('main.commit?.sha!==run.head_sha') && snapshot.includes('main.commit.sha!==process.env.GITHUB_SHA'), 'SNAPSHOT_CURRENT_MAIN_BINDING_MISSING');
assert(snapshot.includes('age>24*60*60*1000'), 'SNAPSHOT_FRESHNESS_BINDING_MISSING');

assert(snapshot.includes('EVENT_P2_RUN_ID') && snapshot.includes('/actions/runs/${P2_RUN_ID}/artifacts'), 'SNAPSHOT_EVENT_RUN_BINDING_MISSING');
assert(steering.includes('AUTOBALANCE_RUN_ID') && steering.includes('/actions/runs/${AUTOBALANCE_RUN_ID}/artifacts'), 'STEERING_EVENT_RUN_BINDING_MISSING');
assert(ownedGraph.includes('P1_EVENT_RUN_ID') && ownedGraph.includes('/actions/runs/${P1_RUN_ID}/artifacts'), 'OWNED_GRAPH_EVENT_RUN_BINDING_MISSING');
assert(ownedGraph.includes('SAME_SUCCESSFUL_P1_WORKFLOW_RUN'), 'OWNED_GRAPH_TRANSACTIONAL_PAIR_BINDING_MISSING');
assert(ownedGraph.includes('.path==".github/workflows/kidults-asi-p1-source-preflight-v1.yml"') && ownedGraph.includes('.conclusion=="success"'), 'OWNED_GRAPH_P1_RUN_IDENTITY_BINDING_MISSING');
assert(!p1.includes(globalArtifactListing), 'P1_GLOBAL_ARTIFACT_LISTING_FORBIDDEN');
assert(p1.includes("if: github.event_name == 'pull_request'") && p1.includes("if: github.event_name != 'pull_request'"), 'P1_PR_AND_LIVE_DISCOVERY_SEPARATION_MISSING');
assert(p1.includes('/actions/workflows/kidults-asi-p0b-bounded-discovery-candidates-v1.yml/runs') && p1.includes('/actions/runs/${P0B_ORIGIN_RUN_ID}/artifacts'), 'P1_EXACT_ANCESTOR_P0B_RESTORE_MISSING');
assert(p1.includes('git merge-base --is-ancestor') && p1.includes('.path==".github/workflows/kidults-asi-p0b-bounded-discovery-candidates-v1.yml"'), 'P1_P0B_PROVENANCE_BINDING_MISSING');
const p1ConcurrencyContract = "group: kidults-asi-p1-source-preflight-v1-${{ github.event_name }}-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}";
assert(p1.includes(p1ConcurrencyContract), 'P1_EVENT_SCOPED_CONCURRENCY_MISSING');
assert(p1.includes('cancel-in-progress: true'), 'P1_CONCURRENCY_FAIL_CLOSED_MISSING');
assert(autonomousResolution.includes("'scripts/kidults/source-intelligence/*requirement-adapter-coverage*.mjs'"), 'REQUIREMENT_PRODUCER_PATH_COVERAGE_MISSING');
assert(read('.github/workflows/kidults-asi-p1-source-preflight-v1.yml').includes("'scripts/kidults/source-intelligence/*asi-owned-source-intelligence-graph*.mjs'"), 'OWNED_GRAPH_PRODUCER_PATH_COVERAGE_MISSING');
assert(read('.github/workflows/kidults-asi-p1-source-preflight-v1.yml').includes('/tmp/kidults-asi-p0b-bounded-discovery-candidates-v1'), 'OWNED_GRAPH_P0B_BUNDLE_PRODUCTION_MISSING');

const mutations = [
  ['requirement schedule', requirement.replace('  workflow_dispatch:', "  schedule:\n    - cron: '12 * * * *'\n  workflow_dispatch:"), independentTrigger],
  ['steering schedule', steering.replace('  workflow_dispatch:', "  schedule:\n    - cron: '7 * * * *'\n  workflow_dispatch:"), /^\s{2}schedule:/m],
  ['owned graph schedule', ownedGraph.replace('  workflow_dispatch:', "  schedule:\n    - cron: '52 * * * *'\n  workflow_dispatch:"), independentTrigger],
];
for (const [name, mutated, detector] of mutations) assert(detector.test(mutated), `MUTATION_NOT_DETECTED:${name}`);
assert((requirement + globalArtifactListing).includes(globalArtifactListing), 'GLOBAL_LISTING_MUTATION_NOT_DETECTED');
assert((ownedGraph + globalArtifactListing).includes(globalArtifactListing), 'OWNED_GRAPH_GLOBAL_LISTING_MUTATION_NOT_DETECTED');
const ownedGraphGenerationMutation = ownedGraph.replace('test "$P1_SOURCE_SHA" = "$CURRENT_SHA"', 'git merge-base --is-ancestor "$P1_SOURCE_SHA" "$CURRENT_SHA"');
assert(ownedGraphGenerationMutation !== ownedGraph && !ownedGraphGenerationMutation.includes('test "$P1_SOURCE_SHA" = "$CURRENT_SHA"'), 'OWNED_GRAPH_GENERATION_MUTATION_NOT_DETECTED');
const ownedGraphConcurrencyMutation = ownedGraph.replace('github.event.workflow_run.id', 'github.ref');
assert(ownedGraphConcurrencyMutation !== ownedGraph && !ownedGraphConcurrencyMutation.includes(ownedGraphConcurrencyContract), 'OWNED_GRAPH_CONCURRENCY_MUTATION_NOT_DETECTED');
const requirementConcurrencyMutation = requirement.replace('github.event.workflow_run.id', 'github.ref');
assert(requirementConcurrencyMutation !== requirement && !requirementConcurrencyMutation.includes(requirementConcurrencyContract), 'REQUIREMENT_CONCURRENCY_NAMESPACE_MUTATION_NOT_DETECTED');
const requirementProducerEventMutation = requirement.replace(requirementProducerEventGuard, 'true');
assert(requirementProducerEventMutation !== requirement && !requirementProducerEventMutation.includes(requirementProducerEventGuard), 'REQUIREMENT_VALIDATION_ONLY_PUSH_MUTATION_NOT_DETECTED');
const requirementExactTriggerMutation = requirement.replace(requirementExactTriggerLine, '\n            RUN_ID=""\n');
assert(requirementExactTriggerMutation !== requirement && !requirementExactTriggerMutation.includes(requirementExactTriggerLine), 'REQUIREMENT_EXACT_TRIGGER_RUN_MUTATION_NOT_DETECTED');
const snapshotConcurrencyMutation = snapshot.replace('github.event.workflow_run.id', 'github.ref');
assert(snapshotConcurrencyMutation !== snapshot && !snapshotConcurrencyMutation.includes(snapshotConcurrencyContract), 'SNAPSHOT_CONCURRENCY_NAMESPACE_MUTATION_NOT_DETECTED');
const snapshotCurrentMainMutation = snapshot.replace('||main.commit?.sha!==run.head_sha', '');
assert(snapshotCurrentMainMutation !== snapshot && !snapshotCurrentMainMutation.includes('main.commit?.sha!==run.head_sha'), 'SNAPSHOT_CURRENT_MAIN_MUTATION_NOT_DETECTED');
const p1PrSeparationMutation = p1.replace("if: github.event_name != 'pull_request'", "if: github.event_name == 'pull_request'");
assert(p1PrSeparationMutation !== p1 && !p1PrSeparationMutation.includes("if: github.event_name != 'pull_request'"), 'P1_LIVE_DISCOVERY_SEPARATION_MUTATION_NOT_DETECTED');
assert((p1 + globalArtifactListing).includes(globalArtifactListing), 'P1_GLOBAL_LISTING_MUTATION_NOT_DETECTED');
const p1ConcurrencyMutation = p1.replace('github.event_name', 'github.ref');
assert(p1ConcurrencyMutation !== p1 && !p1ConcurrencyMutation.includes(p1ConcurrencyContract), 'P1_CONCURRENCY_NAMESPACE_MUTATION_NOT_DETECTED');

console.log(JSON.stringify({
  id: 'kidults-artifact-consumer-orchestration-validation-v1',
  state: 'VERIFIED_PASS',
  consumers_bound_to_successful_upstream: 4,
  unbounded_independent_triggers: 0,
  current_main_bound_liveness_schedules: 1,
  repository_global_artifact_queries: 0,
  adversarial_mutations_rejected: 15,
  production: 'HOLD',
  public_release: 'HOLD',
  g5: 'HOLD',
}, null, 2));
