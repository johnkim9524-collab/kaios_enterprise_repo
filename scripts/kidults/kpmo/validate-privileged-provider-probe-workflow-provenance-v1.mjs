import fs from 'node:fs';

const APPROVED = {
  checkout: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  setupNode: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  uploadArtifact: 'actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f',
};

const workflows = [
  {
    path: '.github/workflows/kidults-pcgs-live-single-record-probe-r1.yml',
    requiresCheckout: true,
    requiresSetupNode: true,
  },
  {
    path: '.github/workflows/kidults-pcgs-banknote-alias-probe-r1.yml',
    requiresCheckout: true,
    requiresSetupNode: true,
  },
  {
    path: '.github/workflows/kidults-graded-authority-probe-gate-v1.yml',
    requiresCheckout: true,
    requiresSetupNode: true,
  },
  {
    path: '.github/workflows/kidults-psa-bounded-rights-schema-evaluation-v1.yml',
    requiresCheckout: true,
    requiresSetupNode: true,
    requiresUploadArtifact: true,
  },
  {
    path: '.github/workflows/kidults-psa-single-cert-probe.yml',
    requiresUploadArtifact: true,
  },
];

function externalUses(text) {
  return [...text.matchAll(/\buses:\s*([^\s#]+)/g)].map((match) => match[1]);
}

function violationsFor(text, spec = {}) {
  const findings = [];
  if (!/runs-on:\s*ubuntu-24\.04\b/.test(text)) findings.push('runner-not-pinned-ubuntu-24.04');

  for (const ref of externalUses(text)) {
    if (ref.startsWith('./') || ref.startsWith('docker://')) continue;
    const at = ref.lastIndexOf('@');
    const version = at >= 0 ? ref.slice(at + 1) : '';
    if (!/^[0-9a-f]{40}$/.test(version)) findings.push(`mutable-or-non-full-sha-action:${ref}`);
  }

  if (spec.requiresCheckout) {
    if (!text.includes(APPROVED.checkout)) findings.push('approved-checkout-sha-missing');
    if (!/ref:\s*\$\{\{\s*github\.sha\s*\}\}/.test(text)) findings.push('exact-dispatch-ref-missing');
    if (!/persist-credentials:\s*false\b/.test(text)) findings.push('checkout-credentials-persisted-or-unstated');
    if (!/EXPECTED_SHA:\s*\$\{\{\s*github\.sha\s*\}\}/.test(text)) findings.push('expected-sha-binding-missing');
    if (!/git rev-parse HEAD/.test(text)) findings.push('actual-sha-proof-missing');
  }

  if (spec.requiresSetupNode) {
    if (!text.includes(APPROVED.setupNode)) findings.push('approved-setup-node-sha-missing');
    if (!/node-version:\s*['"]24['"]/.test(text)) findings.push('node24-runtime-missing');
  }

  if (spec.requiresUploadArtifact && !text.includes(APPROVED.uploadArtifact)) {
    findings.push('approved-upload-artifact-sha-missing');
  }

  return [...new Set(findings)];
}

const mutationCases = [
  {
    text: "runs-on: ubuntu-24.04\n- uses: actions/checkout@v7\n",
    spec: {},
    expected: 'mutable-or-non-full-sha-action:actions/checkout@v7',
  },
  {
    text: `runs-on: ubuntu-24.04\n- uses: ${APPROVED.checkout}\n  with:\n    ref: \${{ github.sha }}\n- uses: ${APPROVED.setupNode}\n  with:\n    node-version: '24'\n`,
    spec: { requiresCheckout: true, requiresSetupNode: true },
    expected: 'checkout-credentials-persisted-or-unstated',
  },
  {
    text: `runs-on: ubuntu-24.04\n- uses: ${APPROVED.checkout}\n  with:\n    ref: \${{ github.sha }}\n    persist-credentials: false\n- uses: ${APPROVED.setupNode}\n  with:\n    node-version: '22'\nEXPECTED_SHA: \${{ github.sha }}\nrun: git rev-parse HEAD\n`,
    spec: { requiresCheckout: true, requiresSetupNode: true },
    expected: 'node24-runtime-missing',
  },
  {
    text: "runs-on: ubuntu-latest\n",
    spec: {},
    expected: 'runner-not-pinned-ubuntu-24.04',
  },
  {
    text: 'runs-on: ubuntu-24.04\n- uses: actions/upload-artifact@v6\n',
    spec: { requiresUploadArtifact: true },
    expected: 'mutable-or-non-full-sha-action:actions/upload-artifact@v6',
  },
];

for (const test of mutationCases) {
  const findings = violationsFor(test.text, test.spec);
  if (!findings.includes(test.expected)) {
    throw new Error(`provider probe provenance mutation self-test missed ${test.expected}: ${findings.join(', ')}`);
  }
}

const findings = [];
for (const spec of workflows) {
  if (!fs.existsSync(spec.path)) {
    findings.push({ workflow: spec.path, violations: ['workflow-missing'] });
    continue;
  }
  const text = fs.readFileSync(spec.path, 'utf8');
  const violations = violationsFor(text, spec);
  if (violations.length) findings.push({ workflow: spec.path, violations });
}

const result = {
  suite: 'KIDULTS_PRIVILEGED_PROVIDER_PROBE_WORKFLOW_PROVENANCE_V1',
  issue: 935,
  privileged_secret_boundary_issue: 974,
  workflows_checked: workflows.length,
  approved_action_refs: APPROVED,
  mutation_cases_detected: mutationCases.length,
  findings,
  result: findings.length === 0 ? 'PASS' : 'FAIL',
  secret_material_read: false,
  provider_contact_executed: false,
  empirical_gate_effect: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
  truth_boundary: 'This proves repository workflow provenance only. It does not prove GitHub Environment/protected-ref enforcement for workflow_dispatch secrets.',
};

console.log(JSON.stringify(result, null, 2));
if (findings.length) process.exit(1);
