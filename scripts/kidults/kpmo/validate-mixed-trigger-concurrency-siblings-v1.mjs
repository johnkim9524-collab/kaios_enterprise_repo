#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const targets = [
  {
    path: '.github/workflows/kidults-global-source-mesh-v1.yml',
    prefix: 'kidults-global-source-mesh-v1-'
  },
  {
    path: '.github/workflows/kidults-asi-p1-market-event-adapter-runtime-v1.yml',
    prefix: 'kidults-asi-p1-market-event-adapter-runtime-v1-'
  },
  {
    path: '.github/workflows/kidults-asi-autobalance-steering-overlay-live-v1.yml',
    prefix: 'kidults-asi-autobalance-steering-overlay-live-'
  }
];

const fail = message => {
  throw new Error(message);
};

function hasUpstreamSuccessGuard(text) {
  const ifLines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('if:'));
  return ifLines.some(line =>
    line.includes("github.event_name != 'workflow_run'") &&
    line.includes("github.event.workflow_run.conclusion == 'success'")
  );
}

function validateText(text, label, prefix) {
  const requiredGroup =
    `group: ${prefix}\${{ github.event_name }}-\${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}`;
  if (!text.includes('workflow_run:')) fail(`${label}: workflow_run trigger missing`);
  if (!text.includes('types: [completed]')) fail(`${label}: workflow_run must remain completed-event based`);
  if (!text.includes(requiredGroup)) fail(`${label}: exact event/run-id concurrency group missing`);
  if (!text.includes('cancel-in-progress: true')) fail(`${label}: cancellation policy missing`);
  if (!hasUpstreamSuccessGuard(text)) fail(`${label}: upstream success guard missing or weakened`);
  if (text.includes(`group: ${prefix}\${{ github.ref }}`)) fail(`${label}: historical ref-only concurrency returned`);
  return true;
}

function runSelfTests() {
  const prefix = 'test-';
  const pristine = [
    'workflow_run:',
    '  types: [completed]',
    'concurrency:',
    `  group: ${prefix}\${{ github.event_name }}-\${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}`,
    '  cancel-in-progress: true',
    'jobs:',
    '  test:',
    "    if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'"
  ].join('\n');
  validateText(pristine, 'self/pristine', prefix);

  const strongerConjunction = pristine.replace(
    "if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'",
    "if: needs.classify.outputs.classification != 'EXPECTED_NONAUTHORITATIVE_SKIP' && (github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success')"
  );
  validateText(strongerConjunction, 'self/stronger-conjunction', prefix);

  const mutations = [
    ['ref-only', pristine.replace(
      `group: ${prefix}\${{ github.event_name }}-\${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}`,
      `group: ${prefix}\${{ github.ref }}`
    )],
    ['remove-run-id', pristine.replace('github.event.workflow_run.id', 'github.ref')],
    ['remove-event-namespace', pristine.replace('${{ github.event_name }}-', '')],
    ['weaken-success-guard', pristine.replace(
      "if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'",
      'if: always()'
    )],
    ['remove-success-conclusion', pristine.replace(
      "github.event.workflow_run.conclusion == 'success'",
      "github.event.workflow_run.conclusion != 'cancelled'"
    )]
  ];
  for (const [name, mutated] of mutations) {
    let rejected = false;
    try {
      validateText(mutated, `self/${name}`, prefix);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test mutation was not rejected: ${name}`);
  }
  return mutations.length;
}

const mutationCount = runSelfTests();
const results = [];
for (const target of targets) {
  const full = path.join(root, target.path);
  const text = fs.readFileSync(full, 'utf8');
  validateText(text, target.path, target.prefix);
  results.push({ path: target.path, state: 'PASS' });
}
console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  control: 'mixed-trigger-workflow-run-concurrency-isolation',
  targets: results,
  stronger_conjunctive_success_guard_accepted: true,
  mutation_rejections: mutationCount,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
