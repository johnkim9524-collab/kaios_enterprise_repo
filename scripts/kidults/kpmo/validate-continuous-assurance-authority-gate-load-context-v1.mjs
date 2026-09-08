#!/usr/bin/env node
import fs from 'node:fs';

const workflows = [
  {
    path: '.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml',
    directory: 'kpmo-success-assurance-authority-gate',
  },
  {
    path: '.github/workflows/kpmo-continuous-assurance-scheduled-authority-gate-v1.yml',
    directory: 'kpmo-scheduled-assurance-authority-gate',
  },
];

const fail = (code) => { throw new Error(code); };

export function validateWorkflow(source, directory) {
  const init = 'GATE_DIR="$RUNNER_TEMP/' + directory + '"';
  const persist = 'echo "GATE_DIR=$GATE_DIR" >> "$GITHUB_ENV"';
  const mkdir = 'mkdir -p "$GATE_DIR"';
  if (/^\s{6}GATE_DIR:\s*\$\{\{\s*runner\.temp\s*\}\}/m.test(source)) {
    fail('AUTHORITY_GATE_JOB_ENV_RUNNER_CONTEXT_FORBIDDEN');
  }
  if (!source.includes(init)) fail('AUTHORITY_GATE_STEP_DIRECTORY_INITIALIZATION_MISSING');
  if (!source.includes(persist)) fail('AUTHORITY_GATE_ENV_PERSISTENCE_MISSING');
  if (source.indexOf(init) > source.indexOf(mkdir) || source.indexOf(persist) > source.indexOf(mkdir)) {
    fail('AUTHORITY_GATE_DIRECTORY_INITIALIZATION_ORDER_INVALID');
  }
}

function expectRejected(source, directory, code) {
  try {
    validateWorkflow(source, directory);
  } catch {
    return;
  }
  fail('AUTHORITY_GATE_LOAD_CONTEXT_MUTATION_ESCAPED:' + code);
}

for (const workflow of workflows) {
  const source = fs.readFileSync(workflow.path, 'utf8');
  validateWorkflow(source, workflow.directory);

  const jobEnvMutation = source.replace(
    '      UPSTREAM_CONCLUSION:',
    '      GATE_DIR: $' + '{{ runner.temp }}/' + workflow.directory + '\n      UPSTREAM_CONCLUSION:',
  );
  if (jobEnvMutation === source) fail('AUTHORITY_GATE_JOB_ENV_MUTATION_SETUP');
  expectRejected(jobEnvMutation, workflow.directory, 'JOB_ENV_RUNNER_CONTEXT');

  const initLine = '          GATE_DIR="$RUNNER_TEMP/' + workflow.directory + '"\n';
  const missingInitMutation = source.replace(initLine, '');
  if (missingInitMutation === source) fail('AUTHORITY_GATE_MISSING_INIT_MUTATION_SETUP');
  expectRejected(missingInitMutation, workflow.directory, 'MISSING_INIT');

  const lateInitMutation = source
    .replace(initLine, '')
    .replace('          mkdir -p "$GATE_DIR"', '          mkdir -p "$GATE_DIR"\n' + initLine.trimEnd());
  if (lateInitMutation === source) fail('AUTHORITY_GATE_LATE_INIT_MUTATION_SETUP');
  expectRejected(lateInitMutation, workflow.directory, 'LATE_INIT');
}

console.log(JSON.stringify({
  suite: 'KPMO_CONTINUOUS_ASSURANCE_AUTHORITY_GATE_LOAD_CONTEXT_V1',
  state: 'VERIFIED_PASS',
  workflows: workflows.length,
  negative_mutations: workflows.length * 3,
}));
