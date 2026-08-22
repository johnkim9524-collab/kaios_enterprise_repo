import fs from 'node:fs';

const criticalWorkflows = [
  '.github/workflows/kidults-full-value-chain-redteam-orchestrator-v1.yml',
  '.github/workflows/ci-validation.yml',
  '.github/workflows/solo-owner-preflight.yml',
  '.github/workflows/kidults-unified-audit-control-plane.yml',
  '.github/workflows/kidults-portal-release-001.yml'
];

const exactRef = 'ref: ${{ github.event.pull_request.head.sha || github.sha }}';
const fullShaAction = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([0-9a-f]{40})(?:\s+#\s*.+)?$/i;

function externalActionRefs(text) {
  return text.split(/\r?\n/)
    .map(line => line.trim())
    .map(line => line.match(/^-?\s*uses:\s*(.+)$/i)?.[1]?.trim() || null)
    .filter(Boolean)
    .filter(ref => !ref.startsWith('./') && !ref.startsWith('docker://'));
}

function findingsFor(name, text) {
  const findings = [];
  const refs = externalActionRefs(text);
  for (const ref of refs) {
    if (!fullShaAction.test(ref)) findings.push(`${name}:MUTABLE_OR_NONFULL_ACTION_REF:${ref}`);
  }
  if (/\bpull_request\s*:/.test(text)) {
    if (!text.includes(exactRef)) findings.push(`${name}:MISSING_EXACT_PR_HEAD_REF`);
    if (!text.includes('Verify exact source SHA')) findings.push(`${name}:MISSING_EXACT_SHA_VERIFY_STEP`);
    if (!/git rev-parse HEAD/.test(text) || !/EXPECTED_SHA/.test(text)) findings.push(`${name}:INCOMPLETE_EXACT_SHA_ASSERTION`);
  }
  if (/uses:\s*actions\/checkout@/i.test(text) && !/persist-credentials:\s*false/i.test(text)) {
    findings.push(`${name}:CHECKOUT_CREDENTIAL_PERSISTENCE_NOT_DISABLED`);
  }
  if (/uses:\s*actions\/setup-node@/i.test(text)) {
    if (!/node-version:\s*['"]?24['"]?/i.test(text)) findings.push(`${name}:NODE_RUNTIME_NOT_24`);
    if (!/package-manager-cache:\s*false/i.test(text)) findings.push(`${name}:SETUP_NODE_CACHE_POLICY_NOT_EXPLICIT_FALSE`);
  }
  return findings;
}

const mutationCases = [
  {
    name: 'mutable-tag',
    text: `on:\n  pull_request:\nsteps:\n  - uses: actions/checkout@v7\n    with:\n      ${exactRef}\n      persist-credentials: false\n  - name: Verify exact source SHA\n    env:\n      EXPECTED_SHA: x\n    run: git rev-parse HEAD`,
    expected: 'MUTABLE_OR_NONFULL_ACTION_REF'
  },
  {
    name: 'short-sha',
    text: `on:\n  pull_request:\nsteps:\n  - uses: actions/checkout@3d3c42e5\n    with:\n      ${exactRef}\n      persist-credentials: false\n  - name: Verify exact source SHA\n    env:\n      EXPECTED_SHA: x\n    run: git rev-parse HEAD`,
    expected: 'MUTABLE_OR_NONFULL_ACTION_REF'
  },
  {
    name: 'missing-exact-ref',
    text: `on:\n  pull_request:\nsteps:\n  - uses: actions/checkout@${'a'.repeat(40)} # vX\n    with:\n      persist-credentials: false\n  - name: Verify exact source SHA\n    env:\n      EXPECTED_SHA: x\n    run: git rev-parse HEAD`,
    expected: 'MISSING_EXACT_PR_HEAD_REF'
  },
  {
    name: 'credential-persistence',
    text: `on:\n  pull_request:\nsteps:\n  - uses: actions/checkout@${'a'.repeat(40)} # vX\n    with:\n      ${exactRef}\n  - name: Verify exact source SHA\n    env:\n      EXPECTED_SHA: x\n    run: git rev-parse HEAD`,
    expected: 'CHECKOUT_CREDENTIAL_PERSISTENCE_NOT_DISABLED'
  },
  {
    name: 'node22',
    text: `on:\n  pull_request:\nsteps:\n  - uses: actions/checkout@${'a'.repeat(40)} # vX\n    with:\n      ${exactRef}\n      persist-credentials: false\n  - name: Verify exact source SHA\n    env:\n      EXPECTED_SHA: x\n    run: git rev-parse HEAD\n  - uses: actions/setup-node@${'b'.repeat(40)} # vX\n    with:\n      node-version: '22'\n      package-manager-cache: false`,
    expected: 'NODE_RUNTIME_NOT_24'
  }
];

for (const mutation of mutationCases) {
  const findings = findingsFor(`MUTATION_${mutation.name}`, mutation.text);
  if (!findings.some(f => f.includes(mutation.expected))) {
    throw new Error(`mutation self-test missed ${mutation.name}: expected ${mutation.expected}; got ${findings.join(',')}`);
  }
}

const findings = [];
for (const workflow of criticalWorkflows) {
  if (!fs.existsSync(workflow)) {
    findings.push(`${workflow}:MISSING_CRITICAL_WORKFLOW`);
    continue;
  }
  findings.push(...findingsFor(workflow, fs.readFileSync(workflow, 'utf8')));
}

const result = {
  suite: 'KIDULTS_CRITICAL_WORKFLOW_PROVENANCE_V1',
  critical_workflows: criticalWorkflows.length,
  mutation_cases: mutationCases.length,
  immutable_external_actions_required: true,
  exact_pr_head_required: true,
  checkout_credentials_persisted: false,
  node_runtime_required: 24,
  findings,
  result: findings.length ? 'FAIL' : 'PASS',
  empirical_gate_effect: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
};
console.log(JSON.stringify(result, null, 2));
if (findings.length) process.exit(1);
