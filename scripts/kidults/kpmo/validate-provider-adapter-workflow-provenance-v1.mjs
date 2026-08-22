import fs from 'node:fs';

const TARGET = '.github/workflows/provider-adapter-contract-v1.yml';
const fullShaAction = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([0-9a-f]{40})(?:\s+#\s*.+)?$/i;
const EXACT_SOURCE_EXPR = '${{ github.event.pull_request.head.sha || github.sha }}';

function externalActionRefs(text) {
  return text.split(/\r?\n/)
    .map(line => line.trim())
    .map(line => line.match(/^-?\s*uses:\s*(.+)$/i)?.[1]?.trim() || null)
    .filter(Boolean)
    .filter(ref => !ref.startsWith('./') && !ref.startsWith('docker://'));
}

function countLiteral(text, literal) {
  return text.split(literal).length - 1;
}

function findingsFor(text) {
  const findings = [];
  const refs = externalActionRefs(text);
  for (const ref of refs) {
    if (!fullShaAction.test(ref)) findings.push(`MUTABLE_OR_NONFULL_ACTION_REF:${ref}`);
  }

  if (/\bpull_request_target\s*:/.test(text)) findings.push('PULL_REQUEST_TARGET_FORBIDDEN');
  if (!/^permissions:\s*\n\s*contents:\s*read\s*$/mi.test(text)) findings.push('LEAST_PRIVILEGE_CONTENTS_READ_NOT_EXPLICIT');
  if (/\bsecrets\s*\.|\bsecrets\s*\[|secrets\s*:\s*inherit/i.test(text)) findings.push('PROVIDER_ADAPTER_VALIDATION_MUST_BE_SECRETLESS');

  const checkoutRefs = refs.filter(ref => /^actions\/checkout@/i.test(ref));
  if (checkoutRefs.length !== 1) findings.push(`CHECKOUT_COUNT_EXPECTED_1_GOT_${checkoutRefs.length}`);
  const setupNodeRefs = refs.filter(ref => /^actions\/setup-node@/i.test(ref));
  if (setupNodeRefs.length !== 1) findings.push(`SETUP_NODE_COUNT_EXPECTED_1_GOT_${setupNodeRefs.length}`);

  const exactRefCount = countLiteral(text, `ref: ${EXACT_SOURCE_EXPR}`);
  if (exactRefCount !== 1) findings.push(`EXACT_SOURCE_REF_COUNT_EXPECTED_1_GOT_${exactRefCount}`);
  const noPersistCount = (text.match(/persist-credentials:\s*false/gi) || []).length;
  if (noPersistCount !== 1) findings.push(`PERSIST_CREDENTIALS_FALSE_COUNT_EXPECTED_1_GOT_${noPersistCount}`);
  const verifyStepCount = (text.match(/name:\s*Verify exact source SHA/gi) || []).length;
  if (verifyStepCount !== 1) findings.push(`VERIFY_EXACT_SHA_STEP_COUNT_EXPECTED_1_GOT_${verifyStepCount}`);
  const expectedShaCount = countLiteral(text, `EXPECTED_SHA: ${EXACT_SOURCE_EXPR}`);
  if (expectedShaCount !== 1) findings.push(`EXPECTED_SHA_BINDING_COUNT_EXPECTED_1_GOT_${expectedShaCount}`);
  const actualShaCount = (text.match(/git rev-parse HEAD/g) || []).length;
  if (actualShaCount !== 1) findings.push(`ACTUAL_SHA_ASSERTION_COUNT_EXPECTED_1_GOT_${actualShaCount}`);
  if (!/test \"\$\{ACTUAL_SHA\}\" = \"\$\{EXPECTED_SHA\}\"/.test(text)) findings.push('EXACT_SHA_EQUALITY_ASSERTION_MISSING');
  if (!/node-version:\s*["']?24["']?/i.test(text)) findings.push('NODE_24_REQUIRED');
  if (!/node scripts\/kidults\/intelligence\/validate-provider-adapter-contract-v1\.mjs/.test(text)) findings.push('PROVIDER_ADAPTER_CONTRACT_VALIDATION_MISSING');
  if (!/node scripts\/kidults\/kpmo\/validate-provider-adapter-workflow-provenance-v1\.mjs/.test(text)) findings.push('SELF_PROVENANCE_VALIDATION_MISSING');
  return findings;
}

const mutationCases = [
  {
    id: 'mutable-action',
    source: `permissions:\n  contents: read\nsteps:\n  - uses: actions/checkout@v4`,
    expected: 'MUTABLE_OR_NONFULL_ACTION_REF'
  },
  {
    id: 'pull-request-target',
    source: `on:\n  pull_request_target:\npermissions:\n  contents: read`,
    expected: 'PULL_REQUEST_TARGET_FORBIDDEN'
  },
  {
    id: 'missing-exact-source-ref',
    source: `permissions:\n  contents: read\nsteps:\n  - uses: actions/checkout@${'a'.repeat(40)}\n    with:\n      persist-credentials: false`,
    expected: 'EXACT_SOURCE_REF_COUNT_EXPECTED_1_GOT_0'
  },
  {
    id: 'secret-bearing',
    source: `permissions:\n  contents: read\njobs:\n  x:\n    env:\n      TOKEN: \${{ secrets.PROVIDER_TOKEN }}`,
    expected: 'PROVIDER_ADAPTER_VALIDATION_MUST_BE_SECRETLESS'
  }
];
for (const mutation of mutationCases) {
  const findings = findingsFor(mutation.source);
  if (!findings.some(item => item.includes(mutation.expected))) {
    throw new Error(`mutation self-test missed ${mutation.id}: ${findings.join(',')}`);
  }
}

if (!fs.existsSync(TARGET)) throw new Error(`missing workflow: ${TARGET}`);
const source = fs.readFileSync(TARGET, 'utf8');
const findings = findingsFor(source);

console.log(JSON.stringify({
  suite: 'KIDULTS_PROVIDER_ADAPTER_WORKFLOW_PROVENANCE_V1',
  parent_issue: 935,
  pre_partner_gate: 881,
  target: TARGET,
  external_action_refs: externalActionRefs(source),
  immutable_external_actions_required: true,
  exact_source_sha_required: true,
  checkout_credentials_persisted: false,
  provider_adapter_validation_secretless: true,
  mutation_cases_fail_closed: mutationCases.length,
  empirical_gate_effect: 'NONE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
  findings,
  result: findings.length === 0 ? 'PASS' : 'FAIL'
}, null, 2));

if (findings.length) process.exit(1);
