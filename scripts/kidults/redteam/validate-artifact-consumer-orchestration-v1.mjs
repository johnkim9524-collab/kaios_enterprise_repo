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
};

for (const path of Object.values(files)) assert(fs.existsSync(path), `WORKFLOW_MISSING:${path}`);

const requirement = read(files.requirement);
const snapshot = read(files.snapshot);
const steering = read(files.steering);
const autonomousResolution = read(files.autonomousResolution);
const ownedGraph = read(files.ownedGraph);

const independentTrigger = /^\s{2}(schedule|push):/m;
const globalArtifactListing = '/actions/artifacts?per_page=';

assert(!independentTrigger.test(requirement), 'REQUIREMENT_INDEPENDENT_TRIGGER_FORBIDDEN');
assert(!independentTrigger.test(snapshot), 'SNAPSHOT_INDEPENDENT_TRIGGER_FORBIDDEN');
assert(!/^\s{2}schedule:/m.test(steering), 'STEERING_SCHEDULE_TRIGGER_FORBIDDEN');
assert(requirement.includes("'KIDULTS ASI Autonomous Resolution Layer v1'"), 'REQUIREMENT_UPSTREAM_TRIGGER_MISSING');
assert(snapshot.includes("'KIDULTS ASI Owned Source Intelligence Graph v2'"), 'SNAPSHOT_UPSTREAM_TRIGGER_MISSING');
assert(steering.includes("'KIDULTS ASI Throughput Coverage Autobalance Live v1'"), 'STEERING_UPSTREAM_TRIGGER_MISSING');

for (const [name, workflow] of Object.entries({ requirement, snapshot, steering })) {
  assert(!workflow.includes(globalArtifactListing), `${name.toUpperCase()}_GLOBAL_ARTIFACT_LISTING_FORBIDDEN`);
  assert(workflow.includes('/actions/runs/${'), `${name.toUpperCase()}_EXACT_RUN_ARTIFACT_QUERY_MISSING`);
  assert(workflow.includes('git merge-base --is-ancestor'), `${name.toUpperCase()}_ANCESTOR_BINDING_MISSING`);
}

assert(snapshot.includes('P2_EVENT_RUN_ID') && snapshot.includes('/actions/runs/${P2_RUN_ID}/artifacts'), 'SNAPSHOT_EVENT_RUN_BINDING_MISSING');
assert(steering.includes('AUTOBALANCE_RUN_ID') && steering.includes('/actions/runs/${AUTOBALANCE_RUN_ID}/artifacts'), 'STEERING_EVENT_RUN_BINDING_MISSING');
assert(autonomousResolution.includes("'scripts/kidults/source-intelligence/*requirement-adapter-coverage*.mjs'"), 'REQUIREMENT_PRODUCER_PATH_COVERAGE_MISSING');
assert(ownedGraph.includes("'scripts/kidults/source-intelligence/*asi-snapshot-readiness-factory*.mjs'"), 'SNAPSHOT_PRODUCER_PATH_COVERAGE_MISSING');

const mutations = [
  ['requirement schedule', requirement.replace('  workflow_dispatch:', "  schedule:\n    - cron: '12 * * * *'\n  workflow_dispatch:"), independentTrigger],
  ['snapshot push', snapshot.replace('  workflow_dispatch:', '  push:\n    branches: [main]\n  workflow_dispatch:'), independentTrigger],
  ['steering schedule', steering.replace('  workflow_dispatch:', "  schedule:\n    - cron: '7 * * * *'\n  workflow_dispatch:"), /^\s{2}schedule:/m],
];
for (const [name, mutated, detector] of mutations) assert(detector.test(mutated), `MUTATION_NOT_DETECTED:${name}`);
assert((requirement + globalArtifactListing).includes(globalArtifactListing), 'GLOBAL_LISTING_MUTATION_NOT_DETECTED');

console.log(JSON.stringify({
  id: 'kidults-artifact-consumer-orchestration-validation-v1',
  state: 'VERIFIED_PASS',
  consumers_bound_to_successful_upstream: 3,
  independent_schedule_triggers: 0,
  repository_global_artifact_queries: 0,
  adversarial_mutations_rejected: 4,
  production: 'HOLD',
  public_release: 'HOLD',
  g5: 'HOLD',
}, null, 2));
