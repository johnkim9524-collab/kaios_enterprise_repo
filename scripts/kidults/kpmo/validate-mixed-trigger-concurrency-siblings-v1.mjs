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
    prefix: 'kidults-asi-autobalance-steering-overlay-live-',
    attempt_bound_terminalizer: true
  }
];

const fail = message => {
  throw new Error(message);
};

function validateText(text, label, prefix, options = {}) {
  const baseGroup =
    `group: ${prefix}\${{ github.event_name }}-\${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}`;
  const requiredGroup = options.attempt_bound_terminalizer
    ? `${baseGroup}-\${{ github.event_name == 'workflow_run' && github.event.workflow_run.run_attempt || github.run_attempt }}`
    : baseGroup;
  const requiredCancellation = options.attempt_bound_terminalizer
    ? "cancel-in-progress: \${{ github.event_name != 'workflow_run' }}"
    : 'cancel-in-progress: true';
  if (!text.includes('workflow_run:')) fail(`${label}: workflow_run trigger missing`);
  if (!text.includes('types: [completed]')) fail(`${label}: workflow_run must remain completed-event based`);
  if (!text.includes(requiredGroup)) fail(`${label}: exact event/run-id concurrency group missing`);
  if (!text.includes(requiredCancellation)) fail(`${label}: cancellation policy missing`);
  if (options.attempt_bound_terminalizer && text.includes('cancel-in-progress: true')) {
    fail(`${label}: terminal receipt attempts must not cancel one another`);
  }
  const successGuard =
    "if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'";
  if (!text.includes(successGuard)) fail(`${label}: upstream success guard missing or weakened`);
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
  const terminalPristine = pristine
    .replace(
      `group: ${prefix}\${{ github.event_name }}-\${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}`,
      `group: ${prefix}\${{ github.event_name }}-\${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}-\${{ github.event_name == 'workflow_run' && github.event.workflow_run.run_attempt || github.run_attempt }}`
    )
    .replace('cancel-in-progress: true', "cancel-in-progress: \${{ github.event_name != 'workflow_run' }}");
  validateText(terminalPristine, 'self/terminal-pristine', prefix, { attempt_bound_terminalizer: true });
  const terminalMutations = [
    ['remove-attempt-binding', terminalPristine.replace("-\${{ github.event_name == 'workflow_run' && github.event.workflow_run.run_attempt || github.run_attempt }}", '')],
    ['restore-unconditional-cancel', terminalPristine.replace("cancel-in-progress: \${{ github.event_name != 'workflow_run' }}", 'cancel-in-progress: true')]
  ];
  for (const [name, mutated] of terminalMutations) {
    let rejected = false;
    try {
      validateText(mutated, `self/${name}`, prefix, { attempt_bound_terminalizer: true });
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`terminal self-test mutation was not rejected: ${name}`);
  }
  return mutations.length + terminalMutations.length;
}

const mutationCount = runSelfTests();
const results = [];
for (const target of targets) {
  const full = path.join(root, target.path);
  const text = fs.readFileSync(full, 'utf8');
  validateText(text, target.path, target.prefix, {
    attempt_bound_terminalizer: target.attempt_bound_terminalizer === true
  });
  results.push({ path: target.path, state: 'PASS' });
}
console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  control: 'mixed-trigger-workflow-run-concurrency-isolation',
  targets: results,
  mutation_rejections: mutationCount,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
