import fs from 'node:fs';

const TARGET = '.github/workflows/digitalocean-staging-portal-deploy.yml';
const fullShaAction = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([0-9a-f]{40})(?:\s+#\s*.+)?$/i;

function externalActionRefs(text) {
  return text.split(/\r?\n/)
    .map(line => line.trim())
    .map(line => line.match(/^-?\s*uses:\s*(.+)$/i)?.[1]?.trim() || null)
    .filter(Boolean)
    .filter(ref => !ref.startsWith('./') && !ref.startsWith('docker://'));
}

function count(text, re) {
  return [...text.matchAll(re)].length;
}

function findingsFor(text) {
  const findings = [];
  for (const ref of externalActionRefs(text)) {
    if (!fullShaAction.test(ref)) findings.push(`MUTABLE_OR_NONFULL_ACTION_REF:${ref}`);
  }
  if (/\bpull_request\s*:/.test(text)) findings.push('SECRET_BEARING_STAGING_DEPLOY_MUST_NOT_RUN_ON_PULL_REQUEST');
  if (!/^permissions:\s*\n\s*contents:\s*read\s*$/mi.test(text)) findings.push('LEAST_PRIVILEGE_CONTENTS_READ_NOT_EXPLICIT');

  const checkoutCount = count(text, /uses:\s*actions\/checkout@[0-9a-f]{40}/gi);
  const exactRefCount = count(text, /ref:\s*\$\{\{\s*github\.sha\s*\}\}/g);
  const noPersistCount = count(text, /persist-credentials:\s*false/gi);
  const verifyStepCount = count(text, /name:\s*Verify exact source SHA/gi);
  const expectedShaCount = count(text, /EXPECTED_SHA:\s*\$\{\{\s*github\.sha\s*\}\}/g);
  const actualShaCount = count(text, /git rev-parse HEAD/g);

  if (checkoutCount !== 2) findings.push(`CHECKOUT_COUNT_EXPECTED_2_GOT_${checkoutCount}`);
  if (exactRefCount !== checkoutCount) findings.push(`EXACT_REF_COUNT_${exactRefCount}_CHECKOUT_COUNT_${checkoutCount}`);
  if (noPersistCount !== checkoutCount) findings.push(`PERSIST_CREDENTIALS_FALSE_COUNT_${noPersistCount}_CHECKOUT_COUNT_${checkoutCount}`);
  if (verifyStepCount !== checkoutCount) findings.push(`VERIFY_STEP_COUNT_${verifyStepCount}_CHECKOUT_COUNT_${checkoutCount}`);
  if (expectedShaCount !== checkoutCount) findings.push(`EXPECTED_SHA_COUNT_${expectedShaCount}_CHECKOUT_COUNT_${checkoutCount}`);
  if (actualShaCount < checkoutCount) findings.push(`ACTUAL_SHA_ASSERTION_COUNT_${actualShaCount}_CHECKOUT_COUNT_${checkoutCount}`);

  if (!/HOST:\s*\$\{\{\s*vars\.KIDULTS_STAGING_PUBLIC_IP\s*\}\}/.test(text)) findings.push('STAGING_HOST_BINDING_MISSING');
  if (!/SSH_PRIVATE_KEY_B64:\s*\$\{\{\s*secrets\.KIDULTS_STAGING_SSH_PRIVATE_KEY_B64\s*\}\}/.test(text)) findings.push('STAGING_SECRET_BINDING_MISSING');
  if (!/test \"\$HOST\" = \"165\.232\.175\.45\"/.test(text)) findings.push('STAGING_EXACT_PUBLIC_IP_ASSERTION_MISSING');
  if (!/test \"\$PRIVATE_IP\" = \"10\.104\.0\.3\"/.test(text)) findings.push('STAGING_EXACT_PRIVATE_IP_ASSERTION_MISSING');
  if (!/StrictHostKeyChecking=yes/.test(text)) findings.push('STRICT_HOST_KEY_CHECKING_MISSING');
  if (!/data-state=\\?\"NO_PROJECTION\\?\"/.test(text)) findings.push('NO_PROJECTION_HEALTH_ASSERTION_MISSING');
  if (!/public_bind[^\n]*False|public_bind'\]\s+is\s+False/.test(text)) findings.push('PUBLIC_BIND_FALSE_ASSERTION_MISSING');
  if (!/production_touch[^\n]*False|production_touch'\]\s+is\s+False/.test(text)) findings.push('PRODUCTION_TOUCH_FALSE_ASSERTION_MISSING');
  if (!/g5[^\n]*HOLD/i.test(text)) findings.push('G5_HOLD_ASSERTION_MISSING');
  return findings;
}

const mutationCases = [
  {
    id: 'mutable-action',
    source: `permissions:\n  contents: read\nsteps:\n- uses: actions/checkout@v4`,
    expected: 'MUTABLE_OR_NONFULL_ACTION_REF'
  },
  {
    id: 'pr-trigger',
    source: `on:\n  pull_request:\npermissions:\n  contents: read`,
    expected: 'SECRET_BEARING_STAGING_DEPLOY_MUST_NOT_RUN_ON_PULL_REQUEST'
  },
  {
    id: 'missing-exact-checkout',
    source: `permissions:\n  contents: read\nsteps:\n- uses: actions/checkout@${'a'.repeat(40)}\n- uses: actions/checkout@${'b'.repeat(40)}`,
    expected: 'EXACT_REF_COUNT_0_CHECKOUT_COUNT_2'
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
  suite: 'KIDULTS_STAGING_PORTAL_WORKFLOW_PROVENANCE_V1',
  target: TARGET,
  external_action_refs: externalActionRefs(source),
  immutable_external_actions_required: true,
  exact_source_sha_required: true,
  checkout_credentials_persisted: false,
  remote_scope: 'DIGITALOCEAN_STAGING_LOCALHOST_ONLY',
  secret_execution_ref_policy: 'EXTERNAL_APPROVAL_REQUIRED_UNDER_ISSUE_974',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
  findings,
  result: findings.length === 0 ? 'PASS' : 'FAIL'
}, null, 2));

if (findings.length) process.exit(1);
