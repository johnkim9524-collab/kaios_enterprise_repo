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

function namedJob(text, name) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => line === `  ${name}:`);
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !/^  [A-Za-z0-9_-]+:\s*$/.test(lines[end])) end += 1;
  return { start, end, block: lines.slice(start, end), text: lines.slice(start, end).join('\n') };
}

function firstStepHeader(job) {
  if (!job) return null;
  const stepsIndex = job.block.findIndex(line => /^\s{4}steps:\s*$/.test(line));
  if (stepsIndex < 0) return null;
  for (let index = stepsIndex + 1; index < job.block.length; index += 1) {
    const line = job.block[index];
    if (!line.trim()) continue;
    const match = line.match(/^\s{6}-\s+(name|uses):\s*(.*?)\s*$/);
    return match ? { kind: match[1], value: match[2] } : null;
  }
  return null;
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

function moveNamedStepBefore(text, movingStepName, targetStepName, id) {
  const moving = namedSteps(text, movingStepName);
  if (moving.length !== 1) throw new Error(`mutation ${id} expected one moving step`);
  const lines = text.split(/\r?\n/);
  const movingBlock = lines.splice(moving[0].start, moving[0].end - moving[0].start);
  const without = lines.join('\n');
  const target = namedSteps(without, targetStepName);
  if (target.length !== 1) throw new Error(`mutation ${id} expected one target step`);
  lines.splice(target[0].start, 0, ...movingBlock);
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
  '--expected-repository "$GITHUB_REPOSITORY" \\',
  '--expected-workflow-name "$GITHUB_WORKFLOW" \\',
  '--expected-workflow-ref "$GITHUB_WORKFLOW_REF" \\',
  '--expected-workflow-sha "$GITHUB_WORKFLOW_SHA" \\',
  '--expected-source-ref "$GITHUB_REF" \\',
  '--expected-event-name "$GITHUB_EVENT_NAME" \\',
  '--expected-job-name "$GITHUB_JOB" \\',
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

const EXPECTED_MAIN_GUARD_RUN = [
  'set -euo pipefail',
  'test "$GITHUB_REF" = "refs/heads/main"',
  'case "$GITHUB_EVENT_NAME" in',
  'push|workflow_dispatch) ;;',
  '*) exit 64 ;;',
  'esac'
];

const EXPECTED_DEPLOY_MAIN_GUARD_RUN = [
  'set -euo pipefail',
  'test "$GITHUB_REF" = "refs/heads/main"',
  'LIVE_MAIN_SHA="$(',
  'curl --fail-with-body --silent --show-error \\',
  '--connect-timeout 10 \\',
  '--max-time 30 \\',
  '--header "Authorization: Bearer $GITHUB_TOKEN" \\',
  '--header "Accept: application/vnd.github+json" \\',
  '--header "X-GitHub-Api-Version: 2022-11-28" \\',
  '"$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/branches/main" |',
  'python3 -c \'import json,re,sys; sha=str(json.load(sys.stdin).get("commit",{}).get("sha","")); print(sha) if re.fullmatch(r"[0-9a-f]{40}",sha) else sys.exit(65)\'',
  ')"',
  'test "$LIVE_MAIN_SHA" = "$GITHUB_SHA"'
];

const VALIDATE_MAIN_GUARD_STEP = 'Reject non-main source before privileged validation';
const DEPLOY_MAIN_GUARD_STEP = 'Verify live main before provider credential resolution';
const DEPLOY_JOB_MAIN_GUARD = "if: github.ref == 'refs/heads/main' && (github.event_name == 'workflow_dispatch' || github.event_name == 'push')";
const SSH_SECRET_BINDING = 'SSH_PRIVATE_KEY_B64: ${{ secrets.KIDULTS_STAGING_SSH_PRIVATE_KEY_B64 }}';
const HOST_KEY_SCAN_STEP = 'Scan and verify STAGING host key without SSH secret';
const SSH_MATERIALIZE_STEP = 'Materialize minimal SSH identity';
const SSH_CLEANUP_STEP = 'Remove SSH material before receipt validation or upload';

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

  const validateJob = namedJob(text, 'validate');
  const deployJob = namedJob(text, 'deploy');
  const validateFirstStep = firstStepHeader(validateJob);
  const deployFirstStep = firstStepHeader(deployJob);
  const validateGuardSteps = validateJob ? namedSteps(validateJob.text, VALIDATE_MAIN_GUARD_STEP) : [];
  const deployGuardSteps = deployJob ? namedSteps(deployJob.text, DEPLOY_MAIN_GUARD_STEP) : [];
  const validateGuardRun = validateGuardSteps.length === 1 ? normalizedRunLines(validateGuardSteps[0]) : null;
  const deployGuardRun = deployGuardSteps.length === 1 ? normalizedRunLines(deployGuardSteps[0]) : null;
  if (!validateJob) findings.push('VALIDATE_JOB_MISSING');
  if (!deployJob) findings.push('DEPLOY_JOB_MISSING');
  if (validateGuardSteps.length !== 1 || !sameLines(validateGuardRun, EXPECTED_MAIN_GUARD_RUN)) {
    findings.push('VALIDATE_PRE_PRIVILEGED_MAIN_GUARD_MISSING');
  }
  const deployGuardBlock = deployGuardSteps.length === 1 ? deployGuardSteps[0].block.join('\n') : '';
  if (deployGuardSteps.length !== 1
      || !sameLines(deployGuardRun, EXPECTED_DEPLOY_MAIN_GUARD_RUN)
      || !deployGuardBlock.includes('GITHUB_TOKEN: ${{ github.token }}')) {
    findings.push('DEPLOY_PRE_SECRET_MAIN_GUARD_MISSING');
  }
  if (validateFirstStep?.kind !== 'name' || validateFirstStep.value !== VALIDATE_MAIN_GUARD_STEP) {
    findings.push('VALIDATE_MAIN_GUARD_NOT_FIRST_STEP');
  }
  if (deployFirstStep?.kind !== 'name' || deployFirstStep.value !== DEPLOY_MAIN_GUARD_STEP) {
    findings.push('DEPLOY_MAIN_GUARD_NOT_FIRST_STEP');
  }
  if (!deployJob?.text.includes(DEPLOY_JOB_MAIN_GUARD)) findings.push('DEPLOY_JOB_EXACT_MAIN_GUARD_MISSING');

  const hostScanSteps = deployJob ? namedSteps(deployJob.text, HOST_KEY_SCAN_STEP) : [];
  const hostScanBlock = hostScanSteps.length === 1 ? hostScanSteps[0].block.join('\n') : '';
  const hostScanRun = hostScanSteps.length === 1 ? normalizedRunLines(hostScanSteps[0]) : null;
  if (hostScanSteps.length !== 1
      || /\$\{\{\s*secrets\./.test(hostScanBlock)
      || hostScanBlock.includes('SSH_PRIVATE_KEY_B64')
      || !hostScanRun?.includes('timeout 10 ssh-keyscan -t ed25519 "$HOST" > "$RUNNER_TEMP/ssh/known_hosts"')
      || !hostScanRun?.includes('test "$OBSERVED" = "$EXPECTED_FINGERPRINT"')) {
    findings.push('HOST_KEY_SCAN_STEP_MUST_BE_SECRET_FREE');
  }

  const materializeSteps = deployJob ? namedSteps(deployJob.text, SSH_MATERIALIZE_STEP) : [];
  const materializeBlock = materializeSteps.length === 1 ? materializeSteps[0].block.join('\n') : '';
  if (count(text, /SSH_PRIVATE_KEY_B64:\s*\$\{\{\s*secrets\.KIDULTS_STAGING_SSH_PRIVATE_KEY_B64\s*\}\}/g) !== 1
      || !materializeBlock.includes(SSH_SECRET_BINDING)) {
    findings.push('SSH_SECRET_NOT_STEP_SCOPED');
  }
  if (materializeSteps.length !== 1
      || materializeBlock.includes('ssh-keyscan')
      || !materializeBlock.includes('unset SSH_PRIVATE_KEY_B64')) {
    findings.push('HOST_SCAN_AND_KEY_MATERIALIZATION_NOT_SEPARATED');
  }
  if (deployJob && deployGuardSteps.length === 1) {
    const guardOffset = deployJob.text.indexOf(`- name: ${DEPLOY_MAIN_GUARD_STEP}`);
    for (const marker of [SSH_SECRET_BINDING, 'ssh-keyscan -t ed25519', 'scp "${SSH_OPTS[@]}"']) {
      const markerOffset = deployJob.text.indexOf(marker);
      if (markerOffset < 0 || markerOffset < guardOffset) findings.push(`REMOTE_ACCESS_BEFORE_DEPLOY_MAIN_GUARD:${marker}`);
    }
    if (hostScanSteps.length !== 1
        || materializeSteps.length !== 1
        || !(deployGuardSteps[0].start < hostScanSteps[0].start
          && hostScanSteps[0].start < materializeSteps[0].start)) {
      findings.push('HOST_SCAN_AND_KEY_MATERIALIZATION_ORDER_INVALID');
    }
  }

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

  const collectSteps = deployJob ? namedSteps(deployJob.text, 'Collect deployment-scoped remote receipts and localhost body') : [];
  const cleanupSteps = deployJob ? namedSteps(deployJob.text, SSH_CLEANUP_STEP) : [];
  const deployValidatorSteps = deployJob ? namedSteps(deployJob.text, 'Validate exact remote receipt bundle') : [];
  const cleanupBlock = cleanupSteps.length === 1 ? cleanupSteps[0].block.join('\n') : '';
  const cleanupRun = cleanupSteps.length === 1 ? normalizedRunLines(cleanupSteps[0]) : null;
  const expectedCleanupRun = [
    'rm -f \\',
    '"$RUNNER_TEMP/ssh/id_ed25519" \\',
    '"$RUNNER_TEMP/ssh/id_ed25519.normalized" \\',
    '"$RUNNER_TEMP/ssh/known_hosts"'
  ];
  if (cleanupSteps.length !== 1
      || !/^\s*if:\s*always\(\)\s*$/m.test(cleanupBlock)
      || !sameLines(cleanupRun, expectedCleanupRun)) {
    findings.push('SSH_KEY_CLEANUP_FAIL_CLOSED_CONTRACT_MISSING');
  }
  const uploadLine = deployJob?.block.findIndex((line) => /^\s{6}-\s+uses:\s*actions\/upload-artifact@/.test(line)) ?? -1;
  if (collectSteps.length !== 1
      || cleanupSteps.length !== 1
      || deployValidatorSteps.length !== 1
      || uploadLine < 0
      || collectSteps[0].end !== cleanupSteps[0].start
      || !(collectSteps[0].start < cleanupSteps[0].start
        && cleanupSteps[0].start < deployValidatorSteps[0].start
        && deployValidatorSteps[0].start < uploadLine)) {
    findings.push('SSH_CLEANUP_MUST_FOLLOW_REMOTE_RECEIPTS_AND_PRECEDE_ARTIFACT_UPLOAD');
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

  const runnerExecutionMarkers = [
    "'receipt_type':'GITHUB_RUNNER_EXECUTION'",
    "'state':'CAPTURED_NOT_ATTESTED'",
    "'repository':os.environ['GITHUB_REPOSITORY']",
    "'workflow_name':os.environ['GITHUB_WORKFLOW']",
    "'workflow_ref':os.environ['GITHUB_WORKFLOW_REF']",
    "'workflow_sha':os.environ['GITHUB_WORKFLOW_SHA']",
    "'source_ref':os.environ['GITHUB_REF']",
    "'event_name':os.environ['GITHUB_EVENT_NAME']",
    "'job_name':os.environ['GITHUB_JOB']",
    "'successful_workflow_attested':False"
  ];
  if (!runnerExecutionMarkers.every((marker) => text.includes(marker))) {
    findings.push('RUNNER_EXECUTION_WORKFLOW_IDENTITY_BINDING_MISSING');
  }
  if (!receiptValidator.includes('runner-execution.json')) findings.push('RUNNER_EXECUTION_RECEIPT_VALIDATION_MISSING');
  if (!receiptValidator.includes('CAPTURED_NOT_ATTESTED')) findings.push('RUNNER_EXECUTION_IN_RUN_ATTESTATION_BOUNDARY_MISSING');
  if (!receiptValidator.includes('REMOTE_EXIT_CANDIDATE')) findings.push('REMOTE_EXIT_CANDIDATE_STATE_MISSING');
  if (!receiptValidator.includes('"issue_921_remote_exit_eligible": False')) {
    findings.push('IN_RUN_FINAL_REMOTE_ELIGIBILITY_FORBIDDEN');
  }

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
  },
  {
    id: 'runner-workflow-sha-binding',
    step: 'Collect deployment-scoped remote receipts and localhost body',
    before: "'workflow_sha':os.environ['GITHUB_WORKFLOW_SHA']",
    after: "'workflow_sha':os.environ['GITHUB_SHA']",
    expected: 'RUNNER_EXECUTION_WORKFLOW_IDENTITY_BINDING_MISSING'
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

const mainGuardMutationCases = [
  {
    id: 'deploy-job-main-guard',
    mutate: value => mutateOnce(
      value,
      DEPLOY_JOB_MAIN_GUARD,
      "if: github.event_name == 'workflow_dispatch' || github.event_name == 'push'",
      'deploy-job-main-guard'
    ),
    expected: 'DEPLOY_JOB_EXACT_MAIN_GUARD_MISSING'
  },
  {
    id: 'validate-step-main-guard',
    mutate: value => mutateNamedStepOnce(
      value,
      VALIDATE_MAIN_GUARD_STEP,
      'test "$GITHUB_REF" = "refs/heads/main"',
      'test -n "$GITHUB_REF"',
      'validate-step-main-guard'
    ),
    expected: 'VALIDATE_PRE_PRIVILEGED_MAIN_GUARD_MISSING'
  },
  {
    id: 'deploy-step-main-guard',
    mutate: value => mutateNamedStepOnce(
      value,
      DEPLOY_MAIN_GUARD_STEP,
      'test "$GITHUB_REF" = "refs/heads/main"',
      'test -n "$GITHUB_REF"',
      'deploy-step-main-guard'
    ),
    expected: 'DEPLOY_PRE_SECRET_MAIN_GUARD_MISSING'
  },
  {
    id: 'deploy-step-live-main-api-unreadable',
    mutate: value => mutateNamedStepOnce(
      value,
      DEPLOY_MAIN_GUARD_STEP,
      'curl --fail-with-body --silent --show-error',
      'curl --silent --show-error',
      'deploy-step-live-main-api-unreadable'
    ),
    expected: 'DEPLOY_PRE_SECRET_MAIN_GUARD_MISSING'
  },
  {
    id: 'deploy-step-stale-main-sha',
    mutate: value => mutateNamedStepOnce(
      value,
      DEPLOY_MAIN_GUARD_STEP,
      'test "$LIVE_MAIN_SHA" = "$GITHUB_SHA"',
      'test -n "$LIVE_MAIN_SHA"',
      'deploy-step-stale-main-sha'
    ),
    expected: 'DEPLOY_PRE_SECRET_MAIN_GUARD_MISSING'
  },
  {
    id: 'deploy-guard-not-first',
    mutate: value => mutateOnce(
      value,
      `    steps:\n      - name: ${DEPLOY_MAIN_GUARD_STEP}`,
      `    steps:\n      - name: Unsafe remote access before main guard\n        run: scp payload target\n      - name: ${DEPLOY_MAIN_GUARD_STEP}`,
      'deploy-guard-not-first'
    ),
    expected: 'DEPLOY_MAIN_GUARD_NOT_FIRST_STEP'
  },
  {
    id: 'secret-job-scoped',
    mutate: value => {
      const withoutStepSecret = mutateOnce(
        value,
        `      - name: ${SSH_MATERIALIZE_STEP}\n        env:\n          ${SSH_SECRET_BINDING}`,
        `      - name: ${SSH_MATERIALIZE_STEP}`,
        'secret-job-scoped-remove'
      );
      return mutateOnce(
        withoutStepSecret,
        '      EXPECTED_FINGERPRINT: ${{ vars.KIDULTS_STAGING_HOST_FINGERPRINT }}\n    steps:',
        `      EXPECTED_FINGERPRINT: \${{ vars.KIDULTS_STAGING_HOST_FINGERPRINT }}\n      ${SSH_SECRET_BINDING}\n    steps:`,
        'secret-job-scoped-add'
      );
    },
    expected: 'SSH_SECRET_NOT_STEP_SCOPED'
  }
];
for (const mutation of mainGuardMutationCases) {
  if (findings.some(item => item.includes(mutation.expected))) {
    throw new Error(`baseline already contains main-guard mutation finding: ${mutation.expected}`);
  }
  const mutationFindings = findingsFor(mutation.mutate(source), receiptValidatorSource);
  if (!mutationFindings.some(item => item.includes(mutation.expected))) {
    throw new Error(`main-guard mutation escaped ${mutation.id}: ${mutationFindings.join(',')}`);
  }
}

const sshLifetimeMutationCases = [
  {
    id: 'host-scan-secret-injection',
    mutate: value => mutateNamedStepOnce(
      value,
      HOST_KEY_SCAN_STEP,
      '        shell: bash',
      `        env:\n          ${SSH_SECRET_BINDING}\n        shell: bash`,
      'host-scan-secret-injection'
    ),
    expected: 'HOST_KEY_SCAN_STEP_MUST_BE_SECRET_FREE'
  },
  {
    id: 'materialization-rescans-host',
    mutate: value => mutateNamedStepOnce(
      value,
      SSH_MATERIALIZE_STEP,
      '          test -n "$SSH_PRIVATE_KEY_B64"',
      '          ssh-keyscan -t ed25519 "$HOST" >/dev/null\n          test -n "$SSH_PRIVATE_KEY_B64"',
      'materialization-rescans-host'
    ),
    expected: 'HOST_SCAN_AND_KEY_MATERIALIZATION_NOT_SEPARATED'
  },
  {
    id: 'cleanup-not-always',
    mutate: value => mutateNamedStepOnce(
      value,
      SSH_CLEANUP_STEP,
      '        if: always()',
      '        if: success()',
      'cleanup-not-always'
    ),
    expected: 'SSH_KEY_CLEANUP_FAIL_CLOSED_CONTRACT_MISSING'
  },
  {
    id: 'cleanup-private-key-omitted',
    mutate: value => mutateNamedStepOnce(
      value,
      SSH_CLEANUP_STEP,
      '            "$RUNNER_TEMP/ssh/id_ed25519" \\',
      '            "$RUNNER_TEMP/ssh/not-the-private-key" \\',
      'cleanup-private-key-omitted'
    ),
    expected: 'SSH_KEY_CLEANUP_FAIL_CLOSED_CONTRACT_MISSING'
  },
  {
    id: 'cleanup-after-upload',
    mutate: value => moveNamedStepBefore(
      value,
      SSH_CLEANUP_STEP,
      'Enforce successful deploy and receipt validation',
      'cleanup-after-upload'
    ),
    expected: 'SSH_CLEANUP_MUST_FOLLOW_REMOTE_RECEIPTS_AND_PRECEDE_ARTIFACT_UPLOAD'
  }
];
for (const mutation of sshLifetimeMutationCases) {
  if (findings.includes(mutation.expected)) {
    throw new Error(`baseline already contains SSH lifetime mutation finding: ${mutation.expected}`);
  }
  const mutationFindings = findingsFor(mutation.mutate(source), receiptValidatorSource);
  if (!mutationFindings.includes(mutation.expected)) {
    throw new Error(`SSH lifetime mutation escaped ${mutation.id}: ${mutationFindings.join(',')}`);
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
    .replaceAll('"issue_921_remote_exit_eligible": False', '"issue_921_remote_exit_eligible": True')
);
for (const expected of [
  'NO_PROJECTION_HEALTH_ASSERTION_MISSING',
  'PUBLIC_BIND_FALSE_ASSERTION_MISSING',
  'PRODUCTION_TOUCH_FALSE_ASSERTION_MISSING',
  'IN_RUN_FINAL_REMOTE_ELIGIBILITY_FORBIDDEN'
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
  'RUNNER_EXECUTION_WORKFLOW_IDENTITY_BINDING_MISSING',
  'RUNNER_EXECUTION_RECEIPT_VALIDATION_MISSING',
  'RUNNER_EXECUTION_IN_RUN_ATTESTATION_BOUNDARY_MISSING',
  'REMOTE_EXIT_CANDIDATE_STATE_MISSING',
  'IN_RUN_FINAL_REMOTE_ELIGIBILITY_FORBIDDEN',
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
  receipt_validator_binding_mutation_cases: workflowMutationCases.length + 5,
  exact_main_pre_secret_guard_mutation_cases: mainGuardMutationCases.length,
  ssh_secret_lifetime_mutation_cases: sshLifetimeMutationCases.length,
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
