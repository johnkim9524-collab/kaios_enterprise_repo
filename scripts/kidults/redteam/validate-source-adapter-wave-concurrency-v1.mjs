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
  if (!text.includes('workflow_run:')) fail(`${path}: workflow_run trigger missing`);
  if (!text.includes('cancel-in-progress: true')) fail(`${path}: cancel-in-progress must remain true inside an isolated producer namespace`);
  const expected = `group: ${prefix}-${'${{ github.event_name }}'}-${'${{ github.event_name == \'workflow_run\' && github.event.workflow_run.id || github.ref }}'}`;
  if (!text.includes(expected)) {
    fail(`${path}: concurrency must isolate each workflow_run by upstream run id and event type`);
  }
  const unsafe = `group: ${prefix}-${'${{ github.ref }}'}`;
  if (text.includes(unsafe)) fail(`${path}: unsafe ref-only concurrency group remains`);
  return expected;
}

const validated = [];
for (const [path, prefix] of targets) {
  const text = fs.readFileSync(path, 'utf8');
  const expected = validateWorkflow(path, prefix, text);

  // Regression proof: the historical ref-only namespace must be rejected.
  const mutated = text.replace(expected, `group: ${prefix}-${'${{ github.ref }}'}`);
  let rejected = false;
  try {
    validateWorkflow(`${path}#historical-ref-only-mutation`, prefix, mutated);
  } catch {
    rejected = true;
  }
  if (!rejected) fail(`${path}: regression self-test accepted ref-only concurrency`);
  validated.push(path);
}

process.stdout.write(`${JSON.stringify({
  id: 'kidults-source-adapter-wave-concurrency-guard-v1',
  state: 'VERIFIED_PASS',
  invariant: 'WORKFLOW_RUN_INSTANCES_ISOLATED_BY_UPSTREAM_RUN_ID',
  workflows_validated: validated,
  historical_ref_only_mutations_rejected: validated.length,
  production: 'HOLD',
  public_release: 'HOLD',
}, null, 2)}\n`);
