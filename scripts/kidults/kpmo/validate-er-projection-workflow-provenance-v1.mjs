import fs from 'node:fs';

const workflows = [
  '.github/workflows/kidults-er-human-review-gate-r1.yml',
  '.github/workflows/kidults-projection-dry-run.yml',
];

const expectedSource = '${{ github.event.pull_request.head.sha || github.sha }}';
const fullShaRef = /^\s*-?\s*uses:\s*([^\s@]+)@([0-9a-f]{40})(?:\s+#.*)?$/gm;

function evaluate(text) {
  const findings = [];
  const externalUses = [...text.matchAll(/^\s*-?\s*uses:\s*([^\s]+)\s*$/gm)]
    .map((m) => m[1])
    .filter((ref) => !ref.startsWith('./') && !ref.startsWith('docker://'));

  for (const ref of externalUses) {
    if (!/@[0-9a-f]{40}(?:\s|$|#)/.test(ref)) findings.push(`mutable_external_action:${ref}`);
  }
  if (!text.includes(`ref: ${expectedSource}`)) findings.push('missing_exact_source_checkout');
  if (!/persist-credentials:\s*false/.test(text)) findings.push('checkout_credentials_persist');
  if (!text.includes('git rev-parse HEAD')) findings.push('missing_actual_sha_probe');
  if (!text.includes(`EXPECTED_SHA: ${expectedSource}`)) findings.push('missing_expected_sha_binding');
  if (!/test\s+"\$\{ACTUAL_SHA\}"\s*=\s*"\$\{EXPECTED_SHA\}"/.test(text)) findings.push('missing_sha_equality_failclose');
  if (!/node-version:\s*['"]?24['"]?/.test(text)) findings.push('node24_not_enforced');
  return findings;
}

const mutationCases = [
  (s) => s.replace(/actions\/checkout@[0-9a-f]{40}/, 'actions/checkout@v7'),
  (s) => s.replace(/actions\/setup-node@[0-9a-f]{40}/, 'actions/setup-node@v7'),
  (s) => s.replace(`ref: ${expectedSource}`, 'ref: ${{ github.sha }}'),
  (s) => s.replace('persist-credentials: false', 'persist-credentials: true'),
  (s) => s.replace('git rev-parse HEAD', 'echo HEAD'),
  (s) => s.replace(`EXPECTED_SHA: ${expectedSource}`, 'EXPECTED_SHA: ${{ github.sha }}'),
  (s) => s.replace('test "${ACTUAL_SHA}" = "${EXPECTED_SHA}"', 'echo "${ACTUAL_SHA}" "${EXPECTED_SHA}"'),
  (s) => s.replace(/node-version:\s*['"]24['"]/, "node-version: '22'"),
];

const results = [];
for (const file of workflows) {
  if (!fs.existsSync(file)) throw new Error(`missing workflow: ${file}`);
  const text = fs.readFileSync(file, 'utf8');
  const findings = evaluate(text);
  if (findings.length) {
    console.error(JSON.stringify({ file, findings }, null, 2));
    process.exit(1);
  }

  for (let i = 0; i < mutationCases.length; i += 1) {
    const mutated = mutationCases[i](text);
    if (mutated === text) throw new Error(`mutation ${i} did not alter ${file}`);
    if (evaluate(mutated).length === 0) throw new Error(`mutation ${i} escaped provenance guard for ${file}`);
  }
  results.push({ file, mutation_cases: mutationCases.length, result: 'PASS' });
}

console.log(JSON.stringify({
  suite: 'KIDULTS_ER_PROJECTION_WORKFLOW_PROVENANCE_V1',
  result: 'PASS',
  workflows_checked: workflows.length,
  immutable_action_sha_required: true,
  exact_source_sha_required: true,
  checkout_credentials_persist: false,
  sha_equality_fail_closed: true,
  node24_required: true,
  mutation_cases_per_workflow: mutationCases.length,
  empirical_gate_effect: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
  details: results,
}, null, 2));
