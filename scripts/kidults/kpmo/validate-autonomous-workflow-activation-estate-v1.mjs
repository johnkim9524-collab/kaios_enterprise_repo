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
  'kidults-pcgs-banknote-alias-probe-r1.yml',
  'kidults-pcgs-live-single-record-probe-r1.yml',
  'kidults-production-release-evidence-v1.yml',
  'kidults-runtime-remote-readonly-inventory.yml',
  'p0-postgres-target-time-restore-verification.yml',
  'p0-remote-postgres-persistence-pitr.yml',
]);

const autonomousRequired = new Map([
  ['kidults-asi-p0b-bounded-discovery-candidates-v1.yml', ['schedule', 'workflow_run']],
  ['kidults-asi-p1-source-preflight-v1.yml', ['schedule', 'workflow_run']],
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

const p0b = fs.readFileSync(path.join(workflowRoot, 'kidults-asi-p0b-bounded-discovery-candidates-v1.yml'), 'utf8');
const p1 = fs.readFileSync(path.join(workflowRoot, 'kidults-asi-p1-source-preflight-v1.yml'), 'utf8');
assert(p0b.includes("github.event.workflow_run.conclusion == 'success'"), 'P0B_UPSTREAM_SUCCESS_GUARD_MISSING');
assert(p1.includes("github.event.workflow_run.conclusion == 'success'"), 'P1_UPSTREAM_SUCCESS_GUARD_MISSING');

const p0bMutation = p0b.replace("  schedule:\n    - cron: '37 * * * *'\n", '');
assert(!triggers(p0bMutation).includes('schedule'), 'P0B_MANUAL_ONLY_MUTATION_NOT_DETECTED');
const p1Mutation = p1.replace('  workflow_run:', '  x-workflow-run:');
assert(!triggers(p1Mutation).includes('workflow_run'), 'P1_UPSTREAM_MUTATION_NOT_DETECTED');

console.log(JSON.stringify({
  suite: 'KIDULTS_AUTONOMOUS_WORKFLOW_ACTIVATION_ESTATE_V1',
  result: 'VERIFIED_PASS',
  workflow_count: files.length,
  autonomous_required_count: autonomousRequired.size,
  protected_manual_count: protectedManual.size,
  unclassified_manual_count: 0,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD',
}, null, 2));
