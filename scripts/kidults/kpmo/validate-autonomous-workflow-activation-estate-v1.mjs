#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const workflowRoot = '.github/workflows';
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

const protectedManual = new Set([
  'digitalocean-staging-bootstrap-exec.yml',
  'digitalocean-staging-readonly-audit.yml',
  'kidults-agci-os-candidate-r2-preflight.yml',
  'kidults-atomic-governed-landing-v1.yml',
  'kidults-autonomous-event-broker-deploy-v1.yml',
  'kidults-autonomous-smithsonian-sample.yml',
  'kidults-cloudflare-pages-boundary-readonly-v1.yml',
  'kidults-cloudflare-pages-emergency-control-v1.yml',
  'kidults-cloudflare-pages-staging-deploy-v1.yml',
  'kidults-er-r7k-finalization-boundary.yml',
  'kidults-er-r7k-graded-population.yml',
  'kidults-graded-authority-probe-gate-v1.yml',
  'kidults-natural-clock-deploy-v1.yml',
  'kidults-pcgs-banknote-alias-probe-r1.yml',
  'kidults-pcgs-live-single-record-probe-r1.yml',
  'kidults-production-release-evidence-v1.yml',
  'kidults-runtime-remote-readonly-inventory.yml',
  'p0-postgres-target-time-restore-verification.yml',
  'p0-remote-postgres-persistence-pitr.yml',
]);

const autonomousRequired = new Map([
  ['kidults-asi-p0b-bounded-discovery-candidates-v1.yml', ['schedule']],
  ['kidults-asi-shadow-operating-evidence-v1.yml', ['schedule', 'push']],
  ['kidults-asi-p1-source-preflight-v1.yml', ['workflow_run']],
  ['kidults-autonomous-getty-sale-sample.yml', ['schedule']],
  ['kidults-autonomous-met-sample.yml', ['schedule']],
  ['kidults-autonomous-artic-sample.yml', ['schedule']],
  ['kidults-autonomous-vam-fashion-sample.yml', ['schedule']],
  ['kidults-autonomous-fashion-cross-source.yml', ['schedule']],
  ['kidults-asi-discovery-batch-1.yml', ['schedule']],
  ['kidults-asi-global-open-market-discovery-v1.yml', ['schedule', 'pull_request']],
]);

function triggers(source) {
  const block = source.match(/^on:\s*\n([\s\S]*?)(?=^[^ \n][^:\n]*:\s*$|^permissions:|^concurrency:|^jobs:)/m)?.[1] || '';
  return [...block.matchAll(/^  ([a-z_]+):/gm)].map((match) => match[1]);
}

const files = fs.readdirSync(workflowRoot).filter((file) => file.endsWith('.yml')).sort();
const pureManual = [];
for (const file of files) {
  const source = fs.readFileSync(path.join(workflowRoot, file), 'utf8');
  const observed = triggers(source);
  if (observed.length === 1 && observed[0] === 'workflow_dispatch') pureManual.push(file);
}

assert(JSON.stringify(pureManual) === JSON.stringify([...protectedManual].sort()), `UNCLASSIFIED_MANUAL_WORKFLOW:${JSON.stringify(pureManual)}`);
for (const [file, required] of autonomousRequired) {
  const source = fs.readFileSync(path.join(workflowRoot, file), 'utf8');
  const observed = new Set(triggers(source));
  assert(observed.has('workflow_dispatch'), `RECOVERY_TRIGGER_MISSING:${file}`);
  for (const trigger of required) assert(observed.has(trigger), `AUTONOMOUS_TRIGGER_MISSING:${file}:${trigger}`);
}

// GitHub allows at most three successive workflow_run levels after a root event.
// P0B(schedule) -> P1 -> ARL -> Coverage uses the complete budget. A P0 Mission
// workflow_run before P0B would silently suppress Coverage, even with all jobs green.
function eventBlock(source, event) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const start = lines.indexOf('  ' + event + ':');
  if (start < 0) return '';
  const output = [];
  for (const line of lines.slice(start + 1)) {
    if (/^  [a-z_]+:/.test(line) || /^[^ #\s][^:]*:/.test(line)) break;
    output.push(line);
  }
  return output.join('\n');
}
function validateNaturalChain(source) {
  assert(triggers(source.p0b).includes('schedule'), 'P0B_NATURAL_SCHEDULE_ROOT_MISSING');
  assert(source.p0b.includes("cron: '7 * * * *'") && source.p0b.includes("cron: '37 * * * *'"), 'P0B_NATURAL_SCHEDULE_REDUNDANCY_MISSING');
  assert(!triggers(source.p1).includes('schedule'), 'P1_REDUNDANT_SCHEDULE_FORBIDDEN');
  const depth = ['p0b', 'p1', 'arl', 'coverage'].filter(key => triggers(source[key]).includes('workflow_run')).length;
  assert(depth <= 3, 'NATURAL_CHAIN_WORKFLOW_RUN_DEPTH_EXCEEDED');
  for (const [key, expected] of [
    ['p1', 'KIDULTS ASI P0B Bounded Discovery Candidates v1'],
    ['arl', 'KIDULTS ASI P1 Source Preflight v1'],
    ['coverage', 'KIDULTS ASI Autonomous Resolution Layer v1'],
  ]) {
    const block = eventBlock(source[key], 'workflow_run');
    const names = [...block.matchAll(/^      - '([^'\n]+)'\s*$/gm)].map(match => match[1]);
    assert(names.length === 1 && names[0] === expected, 'NATURAL_CHAIN_UPSTREAM_IDENTITY:' + key);
    assert(/^    branches: \[main\]\s*$/m.test(block) && /^    types: \[completed\]\s*$/m.test(block), 'NATURAL_CHAIN_UPSTREAM_BOUNDARY:' + key);
  }
  assert(source.p0b.includes("if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'"), 'P0B_PRODUCER_EVENT_GUARD_MISSING');
  assert(source.p1.includes("github.event.workflow_run.conclusion == 'success'"), 'P1_UPSTREAM_SUCCESS_GUARD_MISSING');
  const push = eventBlock(source.shadow, 'push');
  assert(/^    branches: \[main\]\s*$/m.test(push), 'SHADOW_EXACT_MAIN_PUSH_MISSING');
  assert(!/^    (?:paths|paths-ignore|branches-ignore|tags|tags-ignore):/m.test(push), 'SHADOW_EXACT_MAIN_PUSH_FILTER_FORBIDDEN');
  return depth;
}
const source = Object.fromEntries([
  ['p0b', 'kidults-asi-p0b-bounded-discovery-candidates-v1.yml'],
  ['p1', 'kidults-asi-p1-source-preflight-v1.yml'],
  ['arl', 'kidults-asi-autonomous-resolution-layer-v1.yml'],
  ['coverage', 'kidults-asi-requirement-adapter-coverage-v1.yml'],
  ['shadow', 'kidults-asi-shadow-operating-evidence-v1.yml'],
].map(([key, file]) => [key, fs.readFileSync(path.join(workflowRoot, file), 'utf8')]));
const naturalChainDepth = validateNaturalChain(source);
let naturalChainMutationsRejected = 0;
function rejectMutation(key, changed, expectedCode) {
  assert(changed !== source[key], 'NATURAL_CHAIN_MUTATION_NO_EFFECT:' + key);
  let failure = null;
  try { validateNaturalChain({...source, [key]: changed}); } catch (error) { failure = error.message; }
  assert(failure === expectedCode, 'NATURAL_CHAIN_MUTATION_NOT_REJECTED:' + expectedCode + ':' + failure);
  naturalChainMutationsRejected += 1;
}
rejectMutation('p0b', source.p0b.replace('  pull_request:', "  workflow_run:\n    workflows:\n      - 'KIDULTS ASI P0 Mission Consumption v1'\n    branches: [main]\n    types: [completed]\n  pull_request:"), 'NATURAL_CHAIN_WORKFLOW_RUN_DEPTH_EXCEEDED');
rejectMutation('p0b', source.p0b.replace('  schedule:\n', ''), 'P0B_NATURAL_SCHEDULE_ROOT_MISSING');
rejectMutation('p0b', source.p0b.replace("    - cron: '7 * * * *'\n", ''), 'P0B_NATURAL_SCHEDULE_REDUNDANCY_MISSING');
rejectMutation('p1', source.p1.replace('  workflow_dispatch:', "  schedule:\n    - cron: '41 * * * *'\n  workflow_dispatch:"), 'P1_REDUNDANT_SCHEDULE_FORBIDDEN');
rejectMutation('arl', source.arl.replace("      - 'KIDULTS ASI P1 Source Preflight v1'", "      - 'UNBOUND UPSTREAM'"), 'NATURAL_CHAIN_UPSTREAM_IDENTITY:arl');
rejectMutation('coverage', source.coverage.replace('    branches: [main]', '    branches: [untrusted]'), 'NATURAL_CHAIN_UPSTREAM_BOUNDARY:coverage');
rejectMutation('shadow', source.shadow.replace('  push:\n    branches: [main]', "  push:\n    branches: [main]\n    paths:\n      - 'unrelated-only/**'"), 'SHADOW_EXACT_MAIN_PUSH_FILTER_FORBIDDEN');

console.log(JSON.stringify({
  suite: 'KIDULTS_AUTONOMOUS_WORKFLOW_ACTIVATION_ESTATE_V1',
  result: 'VERIFIED_PASS',
  workflow_count: files.length,
  autonomous_required_count: autonomousRequired.size,
  protected_manual_count: protectedManual.size,
  unclassified_manual_count: 0,
  natural_chain_workflow_run_depth: naturalChainDepth,
  natural_chain_workflow_run_maximum: 3,
  natural_chain_adversarial_mutations_rejected: naturalChainMutationsRejected,
  shadow_every_protected_main_push_required: true,
  workflow_dispatch_is_natural_producer_evidence: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD',
}, null, 2));
