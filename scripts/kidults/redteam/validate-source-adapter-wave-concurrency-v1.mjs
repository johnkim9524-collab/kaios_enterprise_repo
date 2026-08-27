import fs from 'node:fs';

const targets = [
  ['.github/workflows/kidults-asi-source-adapter-wave2-v1.yml', 'kidults-asi-source-adapter-wave2-v1'],
  ['.github/workflows/kidults-asi-source-adapter-wave3-v1.yml', 'kidults-asi-source-adapter-wave3-v1'],
  ['.github/workflows/kidults-asi-source-adapter-wave4-v1.yml', 'kidults-asi-source-adapter-wave4-v1'],
];

function fail(message) {
  throw new Error(message);
}

function validateWorkflow(path, prefix, text) {
  if (text.includes('workflow_run:')) fail(`${path}: static validator must not fan out from workflow_run`);
  if (text.includes('github.event.workflow_run')) fail(`${path}: stale workflow_run expression remains`);
  if (!text.includes('cancel-in-progress: true')) fail(`${path}: exact-generation coalescing must remain enabled`);
  const expected = `group: ${prefix}-${'${{ github.event_name }}'}-${'${{ github.sha }}'}`;
  if (!text.includes(expected)) {
    fail(`${path}: concurrency must coalesce by event and exact source generation`);
  }
  const unsafe = `group: ${prefix}-${'${{ github.ref }}'}`;
  if (text.includes(unsafe)) fail(`${path}: unsafe ref-only concurrency group remains`);
  return expected;
}

const validated = [];
for (const [path, prefix] of targets) {
  const text = fs.readFileSync(path, 'utf8');
  const expected = validateWorkflow(path, prefix, text);

  // Regression proof: both the historical ref-only namespace and redundant workflow_run
  // trigger must be rejected.
  const mutated = text.replace(expected, `group: ${prefix}-${'${{ github.ref }}'}`);
  let rejected = false;
  try {
    validateWorkflow(`${path}#historical-ref-only-mutation`, prefix, mutated);
  } catch {
    rejected = true;
  }
  if (!rejected) fail(`${path}: regression self-test accepted ref-only concurrency`);

  const workflowRunMutation = text.replace(
    '\npermissions:',
    "\n  workflow_run:\n    workflows: ['KIDULTS ASI P1 Market-Event Adapter Runtime v1']\n    types: [completed]\n\npermissions:",
  );
  rejected = false;
  try {
    validateWorkflow(`${path}#redundant-workflow-run-mutation`, prefix, workflowRunMutation);
  } catch {
    rejected = true;
  }
  if (!rejected) fail(`${path}: regression self-test accepted redundant workflow_run fan-out`);
  validated.push(path);
}

process.stdout.write(`${JSON.stringify({
  id: 'kidults-source-adapter-wave-concurrency-guard-v1',
  state: 'VERIFIED_PASS',
  invariant: 'STATIC_VALIDATORS_HAVE_NO_WORKFLOW_RUN_AND_COALESCE_BY_EXACT_GENERATION',
  workflows_validated: validated,
  historical_ref_only_mutations_rejected: validated.length,
  redundant_workflow_run_mutations_rejected: validated.length,
  production: 'HOLD',
  public_release: 'HOLD',
}, null, 2)}\n`);
