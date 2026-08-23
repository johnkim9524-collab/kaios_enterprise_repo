import fs from 'node:fs';

const TARGET = '.github/workflows/digitalocean-staging-portal-deploy.yml';
const RECEIPT_VALIDATOR = 'scripts/operations/validate_digitalocean_staging_portal_receipts_v1.py';
const fullShaAction = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([0-9a-f]{40})(?:\s+#\s*.+)?$/i;
const PINNED_RUNNER = 'ubuntu-24.04';

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

function findingsFor(text, receiptValidator = '') {
  const findings = [];
  for (const ref of externalActionRefs(text)) {
    if (!fullShaAction.test(ref)) findings.push(`MUTABLE_OR_NONFULL_ACTION_REF:${ref}`);
  }
  if (/\bpull_request\s*:/.test(text)) findings.push('SECRET_BEARING_STAGING_DEPLOY_MUST_NOT_RUN_ON_PULL_REQUEST');
  if (!/^permissions:\s*\n\s*contents:\s*read\s*$/mi.test(text)) findings.push('LEAST_PRIVILEGE_CONTENTS_READ_NOT_EXPLICIT');

  const runnerRefs = [...text.matchAll(/^\s*runs-on:\s*([^\s#]+).*$/gmi)].map(match => match[1]);
  if (runnerRefs.length !== 2) findings.push(`RUNNER_COUNT_EXPECTED_2_GOT_${runnerRefs.length}`);
  for (const runner of runnerRefs) {
    if (runner !== PINNED_RUNNER) findings.push(`UNPINNED_OR_UNEXPECTED_RUNNER:${runner}`);
  }
  if (/runs-on:\s*[^\n]*-latest\b/i.test(text)) findings.push('MOVING_LATEST_RUNNER_ALIAS_FORBIDDEN');
  if (count(text, /Record STAGING (?:validation|deploy) runner identity/g) !== 2) findings.push('RUNNER_IDENTITY_RECORDING_EXPECTED_2');
  if (count(text, /image_version=\$\{ImageVersion:-UNKNOWN\}/g) !== 2) findings.push('HOSTED_IMAGE_VERSION_RECORDING_EXPECTED_2');

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
  const receiptValidatorInvocation = /python scripts\/operations\/validate_digitalocean_staging_portal_receipts_v1\.py/.test(text);
  const remoteReceiptBinding = /--expected-evidence-class REMOTE_STAGING/.test(text);
  const exactReceiptBindings = [
    '--expected-deployment-id',
    '--expected-source-sha',
    '--expected-run-id',
    '--expected-run-attempt',
    '--require-rollback-target'
  ].every(marker => text.includes(marker));
  if (!receiptValidatorInvocation) findings.push('RECEIPT_VALIDATOR_INVOCATION_MISSING');
  if (!remoteReceiptBinding) findings.push('REMOTE_STAGING_RECEIPT_BINDING_MISSING');
  if (!exactReceiptBindings) findings.push('EXACT_RECEIPT_BINDINGS_MISSING');

  const noProjectionAssertion = /data-state=\\?\"NO_PROJECTION\\?\"/.test(text)
    || (receiptValidatorInvocation && /data-state=\\?\"NO_PROJECTION\\?\"/.test(receiptValidator));
  const publicBindAssertion = /public_bind[^\n]*False|public_bind'\]\s+is\s+False/.test(text)
    || (receiptValidatorInvocation && /public_bind[^\n]*False|public_bind\"\]\s+is\s+False/.test(receiptValidator));
  const productionTouchAssertion = /production_touch[^\n]*False|production_touch'\]\s+is\s+False/.test(text)
    || (receiptValidatorInvocation && /production_touch[^\n]*False|production_touch\"\]\s+is\s+False/.test(receiptValidator));
  if (!noProjectionAssertion) findings.push('NO_PROJECTION_HEALTH_ASSERTION_MISSING');
  if (!publicBindAssertion) findings.push('PUBLIC_BIND_FALSE_ASSERTION_MISSING');
  if (!productionTouchAssertion) findings.push('PRODUCTION_TOUCH_FALSE_ASSERTION_MISSING');
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
  },
  {
    id: 'moving-runner-alias',
    source: `permissions:\n  contents: read\njobs:\n  validate:\n    runs-on: ubuntu-latest\n  deploy:\n    runs-on: ubuntu-24.04`,
    expected: 'UNPINNED_OR_UNEXPECTED_RUNNER:ubuntu-latest'
  }
];
for (const mutation of mutationCases) {
  const findings = findingsFor(mutation.source);
  if (!findings.some(item => item.includes(mutation.expected))) {
    throw new Error(`mutation self-test missed ${mutation.id}: ${findings.join(',')}`);
  }
}

if (!fs.existsSync(TARGET)) throw new Error(`missing workflow: ${TARGET}`);
if (!fs.existsSync(RECEIPT_VALIDATOR)) throw new Error(`missing receipt validator: ${RECEIPT_VALIDATOR}`);
const source = fs.readFileSync(TARGET, 'utf8');
const receiptValidatorSource = fs.readFileSync(RECEIPT_VALIDATOR, 'utf8');
const findings = findingsFor(source, receiptValidatorSource);

const detachedValidatorFindings = findingsFor(
  source.replace(
    'python scripts/operations/validate_digitalocean_staging_portal_receipts_v1.py',
    'python scripts/operations/untrusted_receipt_validator.py'
  ),
  receiptValidatorSource
);
if (!detachedValidatorFindings.includes('RECEIPT_VALIDATOR_INVOCATION_MISSING')) {
  throw new Error(`receipt validator invocation mutation escaped: ${detachedValidatorFindings.join(',')}`);
}

const weakenedValidatorFindings = findingsFor(
  source,
  receiptValidatorSource
    .replace('data-state="NO_PROJECTION"', 'data-state="PROJECTED"')
    .replace('receipt["production_touch"] is False', 'receipt["production_touch"] is True')
);
for (const expected of ['NO_PROJECTION_HEALTH_ASSERTION_MISSING', 'PRODUCTION_TOUCH_FALSE_ASSERTION_MISSING']) {
  if (!weakenedValidatorFindings.includes(expected)) {
    throw new Error(`receipt validator assertion mutation escaped (${expected}): ${weakenedValidatorFindings.join(',')}`);
  }
}

console.log(JSON.stringify({
  suite: 'KIDULTS_STAGING_PORTAL_WORKFLOW_PROVENANCE_V1',
  target: TARGET,
  receipt_validator: RECEIPT_VALIDATOR,
  receipt_validator_bound_to_remote_exact_execution: true,
  external_action_refs: externalActionRefs(source),
  immutable_external_actions_required: true,
  exact_source_sha_required: true,
  checkout_credentials_persisted: false,
  pinned_runner: PINNED_RUNNER,
  moving_latest_runner_alias_forbidden: true,
  hosted_image_identity_recorded: true,
  remote_scope: 'DIGITALOCEAN_STAGING_LOCALHOST_ONLY',
  secret_execution_ref_policy: 'EXTERNAL_APPROVAL_REQUIRED_UNDER_ISSUE_974',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
  findings,
  result: findings.length === 0 ? 'PASS' : 'FAIL'
}, null, 2));

if (findings.length) process.exit(1);
