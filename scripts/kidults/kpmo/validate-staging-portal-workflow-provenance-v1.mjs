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

function namedSteps(text, name) {
  const lines = text.split(/\r?\n/);
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)-\s+name:\s*(.*?)\s*$/);
    if (!match || match[2] !== name) continue;
    const indent = match[1].length;
    let end = index + 1;
    while (end < lines.length) {
      const line = lines[end];
      const leading = line.match(/^\s*/)?.[0].length ?? 0;
      if (line.trim() && leading <= indent) break;
      end += 1;
    }
    matches.push({ start: index, end, indent, block: lines.slice(index, end) });
  }
  return matches;
}

function normalizedRunLines(step) {
  const runIndex = step.block.findIndex(line => /^\s*run:\s*\|\s*$/.test(line));
  if (runIndex < 0) return null;
  return step.block.slice(runIndex + 1).filter(line => line.trim()).map(line => line.trim());
}

function sameLines(actual, expected) {
  return actual !== null
    && actual.length === expected.length
    && actual.every((line, index) => line === expected[index]);
}

function mutateOnce(text, before, after, id) {
  const first = text.indexOf(before);
  if (first < 0 || text.indexOf(before, first + before.length) >= 0) {
    throw new Error(`mutation ${id} expected exactly one source marker`);
  }
  return `${text.slice(0, first)}${after}${text.slice(first + before.length)}`;
}

function mutateNamedStepOnce(text, stepName, before, after, id) {
  const steps = namedSteps(text, stepName);
  if (steps.length !== 1) throw new Error(`mutation ${id} expected one named step`);
  const step = steps[0];
  const block = step.block.join('\n');
  const mutatedBlock = mutateOnce(block, before, after, id);
  const lines = text.split(/\r?\n/);
  lines.splice(step.start, step.end - step.start, ...mutatedBlock.split('\n'));
  return lines.join('\n');
}

const EXPECTED_VALIDATOR_RUN = [
  'set -uo pipefail',
  'OUTCOME=DEPLOYED',
  'EXTRA_ARGS=(--require-rollback-target)',
  'if [[ "${{ steps.remote_deploy.outputs.exit_code }}" -ne 0 ]]; then',
  'OUTCOME=ROLLED_BACK',
  'EXTRA_ARGS=()',
  'fi',
  'VALIDATOR_EXIT_CODE=0',
  'python scripts/operations/validate_digitalocean_staging_portal_receipts_v1.py \\',
  '--artifact-dir artifacts/digitalocean-staging-portal \\',
  '--expected-outcome "$OUTCOME" \\',
  '--expected-deployment-id "${{ steps.remote_deploy.outputs.release_id }}" \\',
  '--expected-source-sha "$GITHUB_SHA" \\',
  '--expected-run-id "$GITHUB_RUN_ID" \\',
  '--expected-run-attempt "$GITHUB_RUN_ATTEMPT" \\',
  '--expected-evidence-class REMOTE_STAGING \\',
  '"${EXTRA_ARGS[@]}" \\',
  '--output artifacts/digitalocean-staging-portal/receipt-validation.json \\',
  '|| VALIDATOR_EXIT_CODE=$?',
  'echo "exit_code=$VALIDATOR_EXIT_CODE" >> "$GITHUB_OUTPUT"'
];

const EXPECTED_ENFORCEMENT_RUN = [
  'set -euo pipefail',
  'test "${{ steps.remote_deploy.outputs.exit_code }}" = "0"',
  'test "${{ steps.validate_receipts.outputs.exit_code }}" = "0"'
];

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
  if (!/^concurrency:\s*\n\s*group:\s*kidults-digitalocean-staging-portal\s*\n\s*cancel-in-progress:\s*false\s*$/mi.test(text)) {
    findings.push('SERIAL_DEPLOYMENT_CONCURRENCY_MISSING');
  }
  if (!/RELEASE_ID="portal-r001-\$\{GITHUB_SHA:0:12\}-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/.test(text)) {
    findings.push('RUN_ATTEMPT_SCOPED_RELEASE_ID_MISSING');
  }

  const validatorSteps = namedSteps(text, 'Validate exact remote receipt bundle');
  const validatorStep = validatorSteps.length === 1 ? validatorSteps[0] : null;
  if (validatorSteps.length !== 1) findings.push(`RECEIPT_VALIDATOR_STEP_COUNT_EXPECTED_1_GOT_${validatorSteps.length}`);
  const validatorBlock = validatorStep?.block.join('\n') || '';
  const validatorRun = validatorStep ? normalizedRunLines(validatorStep) : null;
  const receiptValidatorInvocation = validatorRun?.includes(
    'python scripts/operations/validate_digitalocean_staging_portal_receipts_v1.py \\'
  ) || false;
  if (!/^\s*id:\s*validate_receipts\s*$/m.test(validatorBlock)) findings.push('RECEIPT_VALIDATOR_STEP_ID_MISSING');
  if (!/^\s*if:\s*always\(\)\s*&&\s*steps\.remote_deploy\.outputs\.release_id\s*!=\s*''\s*$/m.test(validatorBlock)) {
    findings.push('RECEIPT_VALIDATOR_ALWAYS_RELEASE_GUARD_MISSING');
  }
  if (!/^\s*shell:\s*bash\s*$/m.test(validatorBlock)) findings.push('RECEIPT_VALIDATOR_BASH_SHELL_MISSING');
  if (/continue-on-error\s*:\s*true/i.test(validatorBlock)) findings.push('RECEIPT_VALIDATOR_CONTINUE_ON_ERROR_FORBIDDEN');
  if (!receiptValidatorInvocation) findings.push('RECEIPT_VALIDATOR_INVOCATION_MISSING');
  if (!sameLines(validatorRun, EXPECTED_VALIDATOR_RUN)) findings.push('RECEIPT_VALIDATOR_EXACT_RUN_CONTRACT_MISSING');

  const enforcementSteps = namedSteps(text, 'Enforce successful deploy and receipt validation');
  const enforcementStep = enforcementSteps.length === 1 ? enforcementSteps[0] : null;
  if (enforcementSteps.length !== 1) findings.push(`FINAL_ENFORCEMENT_STEP_COUNT_EXPECTED_1_GOT_${enforcementSteps.length}`);
  const enforcementBlock = enforcementStep?.block.join('\n') || '';
  const enforcementRun = enforcementStep ? normalizedRunLines(enforcementStep) : null;
  if (!/^\s*if:\s*always\(\)\s*$/m.test(enforcementBlock)) findings.push('FINAL_ENFORCEMENT_ALWAYS_GUARD_MISSING');
  if (!/^\s*shell:\s*bash\s*$/m.test(enforcementBlock)) findings.push('FINAL_ENFORCEMENT_BASH_SHELL_MISSING');
  if (/continue-on-error\s*:\s*true/i.test(enforcementBlock)) findings.push('FINAL_ENFORCEMENT_CONTINUE_ON_ERROR_FORBIDDEN');
  if (!enforcementRun?.includes('test "${{ steps.remote_deploy.outputs.exit_code }}" = "0"')) {
    findings.push('FINAL_REMOTE_DEPLOY_EXIT_GATE_MISSING');
  }
  if (!enforcementRun?.includes('test "${{ steps.validate_receipts.outputs.exit_code }}" = "0"')) {
    findings.push('FINAL_RECEIPT_VALIDATOR_EXIT_GATE_MISSING');
  }
  if (!sameLines(enforcementRun, EXPECTED_ENFORCEMENT_RUN)) findings.push('FINAL_ENFORCEMENT_EXACT_RUN_CONTRACT_MISSING');
  if (enforcementStep) {
    const lines = text.split(/\r?\n/);
    const laterSibling = lines.slice(enforcementStep.end).some(line => {
      const leading = line.match(/^\s*/)?.[0].length ?? 0;
      return leading === enforcementStep.indent && /^\s*-\s+/.test(line);
    });
    if (laterSibling) findings.push('FINAL_ENFORCEMENT_NOT_LAST_STEP');
  }

  const noProjectionAssertion = receiptValidatorInvocation
    && /data-state=\\?\"NO_PROJECTION\\?\"/.test(receiptValidator);
  const publicBindAssertion = receiptValidatorInvocation
    && /public_bind[^\n]*False|public_bind\"\]\s+is\s+False/.test(receiptValidator);
  const productionTouchAssertion = receiptValidatorInvocation
    && /production_touch[^\n]*False|production_touch\"\]\s+is\s+False/.test(receiptValidator);
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

const workflowMutationCases = [
  {
    id: 'validator-skip-guard',
    step: 'Validate exact remote receipt bundle',
    before: "if: always() && steps.remote_deploy.outputs.release_id != ''",
    after: "if: success() && steps.remote_deploy.outputs.release_id != ''",
    expected: 'RECEIPT_VALIDATOR_ALWAYS_RELEASE_GUARD_MISSING'
  },
  {
    id: 'validator-final-gate',
    step: 'Enforce successful deploy and receipt validation',
    before: 'test "${{ steps.validate_receipts.outputs.exit_code }}" = "0"',
    after: 'true # receipt validator gate removed',
    expected: 'FINAL_RECEIPT_VALIDATOR_EXIT_GATE_MISSING'
  },
  {
    id: 'remote-deploy-final-gate',
    step: 'Enforce successful deploy and receipt validation',
    before: 'test "${{ steps.remote_deploy.outputs.exit_code }}" = "0"',
    after: 'true # remote deploy gate removed',
    expected: 'FINAL_REMOTE_DEPLOY_EXIT_GATE_MISSING'
  }
];
for (const mutation of workflowMutationCases) {
  if (findings.includes(mutation.expected)) {
    throw new Error(`baseline already contains workflow mutation finding: ${mutation.expected}`);
  }
  const mutated = mutateNamedStepOnce(source, mutation.step, mutation.before, mutation.after, mutation.id);
  const mutationFindings = findingsFor(mutated, receiptValidatorSource);
  if (!mutationFindings.includes(mutation.expected)) {
    throw new Error(`workflow mutation escaped ${mutation.id}: ${mutationFindings.join(',')}`);
  }
}

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
    .replace('receipt["public_bind"] is False', 'receipt["public_bind"] is True')
    .replace('receipt["production_touch"] is False', 'receipt["production_touch"] is True')
);
for (const expected of [
  'NO_PROJECTION_HEALTH_ASSERTION_MISSING',
  'PUBLIC_BIND_FALSE_ASSERTION_MISSING',
  'PRODUCTION_TOUCH_FALSE_ASSERTION_MISSING'
]) {
  if (!weakenedValidatorFindings.includes(expected)) {
    throw new Error(`receipt validator assertion mutation escaped (${expected}): ${weakenedValidatorFindings.join(',')}`);
  }
}

const receiptBindingFindings = new Set([
  'RECEIPT_VALIDATOR_STEP_ID_MISSING',
  'RECEIPT_VALIDATOR_ALWAYS_RELEASE_GUARD_MISSING',
  'RECEIPT_VALIDATOR_BASH_SHELL_MISSING',
  'RECEIPT_VALIDATOR_CONTINUE_ON_ERROR_FORBIDDEN',
  'RECEIPT_VALIDATOR_INVOCATION_MISSING',
  'RECEIPT_VALIDATOR_EXACT_RUN_CONTRACT_MISSING',
  'FINAL_ENFORCEMENT_ALWAYS_GUARD_MISSING',
  'FINAL_ENFORCEMENT_BASH_SHELL_MISSING',
  'FINAL_ENFORCEMENT_CONTINUE_ON_ERROR_FORBIDDEN',
  'FINAL_REMOTE_DEPLOY_EXIT_GATE_MISSING',
  'FINAL_RECEIPT_VALIDATOR_EXIT_GATE_MISSING',
  'FINAL_ENFORCEMENT_EXACT_RUN_CONTRACT_MISSING',
  'FINAL_ENFORCEMENT_NOT_LAST_STEP'
]);
const receiptValidatorBound = !findings.some(finding =>
  finding.startsWith('RECEIPT_VALIDATOR_STEP_COUNT_')
  || finding.startsWith('FINAL_ENFORCEMENT_STEP_COUNT_')
  || receiptBindingFindings.has(finding)
);

console.log(JSON.stringify({
  suite: 'KIDULTS_STAGING_PORTAL_WORKFLOW_PROVENANCE_V1',
  target: TARGET,
  receipt_validator: RECEIPT_VALIDATOR,
  receipt_validator_bound_to_remote_exact_execution: receiptValidatorBound,
  receipt_validator_binding_mutation_cases: workflowMutationCases.length + 4,
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
