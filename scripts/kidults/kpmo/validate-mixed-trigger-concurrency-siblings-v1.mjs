#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const targets = [
  {
    path: '.github/workflows/kidults-global-source-mesh-v1.yml',
    prefix: 'kidults-global-source-mesh-v1-',
    successGuard: "if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'"
  },
  {
    path: '.github/workflows/kidults-asi-p1-market-event-adapter-runtime-v1.yml',
    prefix: 'kidults-asi-p1-market-event-adapter-runtime-v1-',
    successGuard: "if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'"
  },
  {
    path: '.github/workflows/kidults-asi-autobalance-steering-overlay-live-v1.yml',
    prefix: 'kidults-asi-autobalance-steering-overlay-live-',
    successGuard: "if: github.event_name != 'workflow_run' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event != 'pull_request')",
    rejectPullRequestProducer: true
  }
];

const fail = message => { throw new Error(message); };

function validateText(text, label, prefix, policy = {}) {
  const requiredGroup =
    `group: ${prefix}\${{ github.event_name }}-\${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}`;
  if (!text.includes('workflow_run:')) fail(`${label}: workflow_run trigger missing`);
  if (!text.includes('types: [completed]')) fail(`${label}: workflow_run must remain completed-event based`);
  if (!text.includes(requiredGroup)) fail(`${label}: exact event/run-id concurrency group missing`);
  if (!text.includes('cancel-in-progress: true')) fail(`${label}: cancellation policy missing`);
  const successGuard = policy.successGuard ||
    "if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'";
  if (!text.includes(successGuard)) fail(`${label}: upstream success/event guard missing or weakened`);
  if (policy.rejectPullRequestProducer === true && !successGuard.includes("github.event.workflow_run.event != 'pull_request'")) {
    fail(`${label}: pull_request producer authority rejection missing`);
  }
  if (text.includes(`group: ${prefix}\${{ github.ref }}`)) fail(`${label}: historical ref-only concurrency returned`);
  return true;
}

function runSelfTests() {
  const prefix = 'test-';
  const standardGuard = "if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'";
  const strictGuard = "if: github.event_name != 'workflow_run' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event != 'pull_request')";
  const makePristine = guard => [
    'workflow_run:',
    '  types: [completed]',
    'concurrency:',
    `  group: ${prefix}\${{ github.event_name }}-\${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}`,
    '  cancel-in-progress: true',
    'jobs:',
    '  test:',
    `    ${guard}`
  ].join('\n');
  const pristine = makePristine(standardGuard);
  validateText(pristine, 'self/pristine', prefix, {successGuard: standardGuard});
  const strict = makePristine(strictGuard);
  validateText(strict, 'self/strict', prefix, {successGuard: strictGuard, rejectPullRequestProducer: true});
  const mutations = [
    ['ref-only', pristine.replace(
      `group: ${prefix}\${{ github.event_name }}-\${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}`,
      `group: ${prefix}\${{ github.ref }}`
    ), {successGuard: standardGuard}],
    ['remove-run-id', pristine.replace('github.event.workflow_run.id', 'github.ref'), {successGuard: standardGuard}],
    ['remove-event-namespace', pristine.replace('${{ github.event_name }}-', ''), {successGuard: standardGuard}],
    ['weaken-success-guard', pristine.replace(standardGuard, 'if: always()'), {successGuard: standardGuard}],
    ['remove-pr-producer-rejection', strict.replace(strictGuard, standardGuard), {successGuard: strictGuard, rejectPullRequestProducer: true}]
  ];
  for (const [name, mutated, policy] of mutations) {
    let rejected = false;
    try { validateText(mutated, `self/${name}`, prefix, policy); } catch { rejected = true; }
    if (!rejected) fail(`self-test mutation was not rejected: ${name}`);
  }
  return mutations.length;
}

const mutationCount = runSelfTests();
const results = [];
for (const target of targets) {
  const full = path.join(root, target.path);
  const text = fs.readFileSync(full, 'utf8');
  validateText(text, target.path, target.prefix, target);
  results.push({ path: target.path, state: 'PASS', pull_request_producer_authority: target.rejectPullRequestProducer ? false : null });
}
console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  control: 'mixed-trigger-workflow-run-concurrency-and-event-authority-isolation',
  targets: results,
  mutation_rejections: mutationCount,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
