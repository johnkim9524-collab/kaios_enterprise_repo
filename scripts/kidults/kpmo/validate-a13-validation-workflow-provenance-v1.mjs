import crypto from 'node:crypto';
import fs from 'node:fs';

const WORKFLOW_PATH = '.github/workflows/kidults-a13-provider-concurrency.yml';
const PACKAGE_PATH = 'services/kidults-autonomous-intelligence/package.json';
const LOCK_PATH = 'services/kidults-autonomous-intelligence/package-lock.json';
const RECEIPT_BUILDER = 'scripts/kidults/kpmo/build-a13-validation-toolchain-receipt-v1.mjs';
const SELF = 'scripts/kidults/kpmo/validate-a13-validation-workflow-provenance-v1.mjs';
const CHECKOUT_SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';
const SETUP_NODE_SHA = '820762786026740c76f36085b0efc47a31fe5020';
const UPLOAD_ARTIFACT_SHA = 'b7c566a772e6b6bfb58ed0dc250532a479d7789f';
const EXACT_SOURCE = '${{ github.event.pull_request.head.sha || github.sha }}';
const FULL_SHA_ACTION = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}(?:\s+#\s*.+)?$/i;

function externalActionRefs(text) {
  return text.split(/\r?\n/)
    .map((line) => line.trim().match(/^-?\s*uses:\s*(.+)$/i)?.[1]?.trim() || null)
    .filter(Boolean)
    .filter((ref) => !ref.startsWith('./') && !ref.startsWith('docker://'));
}

function count(text, pattern) {
  return (text.match(pattern) || []).length;
}

function activeRunLines(text) {
  return text.split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, '').trim())
    .filter((line) => line && !line.startsWith('#'));
}

function workflowFindings(text) {
  const findings = [];
  const require = (condition, id) => { if (!condition) findings.push(id); };
  const refs = externalActionRefs(text);

  for (const ref of refs) require(FULL_SHA_ACTION.test(ref), `MUTABLE_OR_NONFULL_ACTION_REF:${ref}`);
  require(refs.filter((ref) => ref.startsWith('actions/checkout@')).length === 1, 'CHECKOUT_COUNT_NOT_EXACTLY_ONE');
  require(refs.includes(`actions/checkout@${CHECKOUT_SHA} # v7.0.1`), 'CHECKOUT_SHA_OR_VERSION_COMMENT_DRIFT');
  require(refs.includes(`actions/setup-node@${SETUP_NODE_SHA} # v7`), 'SETUP_NODE_SHA_OR_VERSION_COMMENT_DRIFT');
  require(refs.includes(`actions/upload-artifact@${UPLOAD_ARTIFACT_SHA} # v6.0.0`), 'UPLOAD_ARTIFACT_SHA_OR_VERSION_COMMENT_DRIFT');
  require(/^permissions:\s*\n\s*contents:\s*read\s*$/m.test(text), 'LEAST_PRIVILEGE_CONTENTS_READ_MISSING');
  require(/runs-on:\s*ubuntu-24\.04/.test(text), 'RUNNER_NOT_PINNED_UBUNTU_24_04');
  require(!/runs-on:\s*ubuntu-latest/.test(text), 'MOVING_RUNNER_ALIAS_FORBIDDEN');
  require(text.includes(`ref: ${EXACT_SOURCE}`), 'EXACT_SOURCE_REF_MISSING');
  require(/fetch-depth:\s*1/.test(text), 'BOUNDED_CHECKOUT_DEPTH_MISSING');
  require(/persist-credentials:\s*false/.test(text), 'CHECKOUT_CREDENTIAL_PERSISTENCE_NOT_DISABLED');
  require(text.includes(`EXPECTED_SHA: ${EXACT_SOURCE}`), 'EXPECTED_SHA_BINDING_MISSING');
  require(/ACTUAL_SHA="\$\(git rev-parse HEAD\)"/.test(text), 'ACTUAL_SHA_READBACK_MISSING');
  require(/test "\$\{ACTUAL_SHA\}" = "\$\{EXPECTED_SHA\}"/.test(text), 'SOURCE_SHA_EQUALITY_ASSERTION_MISSING');
  require(/node-version:\s*['"]24\.19\.0['"]/.test(text), 'NODE_24_19_0_REQUIRED');
  require(/package-manager-cache:\s*false/.test(text), 'PACKAGE_MANAGER_CACHE_POLICY_MISSING');
  require(text.includes(`node ${SELF}`), 'SELF_PROVENANCE_VALIDATION_MISSING');
  require(text.includes(`node ${RECEIPT_BUILDER} /tmp/kidults-a13-validation-toolchain-receipt-v1.json`), 'TOOLCHAIN_RECEIPT_BUILDER_MISSING');
  require(text.includes(`SOURCE_SHA: ${EXACT_SOURCE}`), 'TOOLCHAIN_RECEIPT_SOURCE_BINDING_MISSING');
  require(text.includes('/tmp/kidults-a13-validation-toolchain-receipt-v1.json'), 'TOOLCHAIN_RECEIPT_ARTIFACT_BINDING_MISSING');
  require(count(text, /^\s*run:\s*npm ci --ignore-scripts --no-audit --no-fund\s*$/gm) === 1, 'NPM_CI_COUNT_NOT_EXACTLY_ONE');
  require(!activeRunLines(text).some((line) => /^(?:run:\s*)?npm\s+install\b/i.test(line)), 'MUTABLE_NPM_INSTALL_FORBIDDEN');
  require(/run:\s*npm run typecheck/.test(text), 'TYPECHECK_MISSING');
  require(/run:\s*npm run a13:smoke/.test(text), 'A13_SMOKE_MISSING');
  require(/run:\s*npm run a13:baseline/.test(text), 'A13_BASELINE_MISSING');
  require(!/pull_request_target\s*:/.test(text), 'PULL_REQUEST_TARGET_FORBIDDEN');
  require(!/continue-on-error\s*:\s*true/.test(text), 'CONTINUE_ON_ERROR_FORBIDDEN');
  require(!/\bsecrets\s*\.|\bsecrets\s*\[|secrets\s*:\s*inherit/.test(text), 'SECRET_CONTEXT_FORBIDDEN');
  require(!/\b(remote:d1|wrangler\s+deploy|--remote)\b/.test(text), 'REMOTE_RUNTIME_COMMAND_FORBIDDEN');
  return [...new Set(findings)];
}

function dependencyMap(record) {
  return {
    ...(record.dependencies || {}),
    ...(record.devDependencies || {}),
    ...(record.optionalDependencies || {})
  };
}

function stableDependencyMap(record) {
  return Object.fromEntries(Object.entries(dependencyMap(record)).sort(([a], [b]) => a.localeCompare(b)));
}

function lockFindings(pkg, lock) {
  const findings = [];
  const require = (condition, id) => { if (!condition) findings.push(id); };
  require(lock.lockfileVersion === 3, 'LOCKFILE_VERSION_NOT_3');
  require(lock.requires === true, 'LOCK_REQUIRES_NOT_TRUE');
  require(lock.packages && typeof lock.packages === 'object', 'LOCK_PACKAGES_MISSING');
  const root = lock.packages?.[''];
  require(Boolean(root), 'LOCK_ROOT_RECORD_MISSING');
  require(JSON.stringify(stableDependencyMap(root || {})) === JSON.stringify(stableDependencyMap(pkg)), 'PACKAGE_AND_LOCK_ROOT_DEPENDENCIES_DRIFT');

  for (const [name, record] of Object.entries(lock.packages || {})) {
    if (name === '' || record.link) continue;
    require(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(record.version || ''), `LOCK_RECORD_VERSION_NOT_EXACT:${name}`);
    require(/^https:\/\/registry\.npmjs\.org\//.test(record.resolved || ''), `LOCK_RECORD_RESOLUTION_NOT_REGISTRY_TARBALL:${name}`);
    require(/^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/.test(record.integrity || ''), `LOCK_RECORD_INTEGRITY_MISSING:${name}`);
  }
  return [...new Set(findings)];
}

function receiptBuilderFindings(text) {
  const findings = [];
  const required = [
    ['SOURCE_SHA_MISMATCH', 'RECEIPT_SOURCE_SHA_ASSERTION_MISSING'],
    ['NPM_CI_INSTALLED_TREE_LOCK_MISSING', 'INSTALLED_TREE_RECEIPT_MISSING'],
    ['INSTALLED_PACKAGE_VERSION_DRIFT', 'INSTALLED_VERSION_BINDING_MISSING'],
    ['INSTALLED_PACKAGE_INTEGRITY_DRIFT', 'INSTALLED_INTEGRITY_BINDING_MISSING'],
    ['A13_REPORT_NOT_PASS', 'A13_REPORT_PASS_BINDING_MISSING'],
    ['report_sha256', 'A13_REPORT_DIGEST_BINDING_MISSING'],
    ["production: 'HOLD'", 'PRODUCTION_HOLD_MISSING'],
    ["public: 'HOLD'", 'PUBLIC_HOLD_MISSING'],
    ["g5: 'EXPLICIT_APPROVAL_REQUIRED'", 'G5_BOUNDARY_MISSING']
  ];
  for (const [marker, finding] of required) {
    if (!text.includes(marker)) findings.push(finding);
  }
  return findings;
}

function expectWorkflowMutationRejected(id, source, expected) {
  const findings = workflowFindings(source);
  if (!findings.some((finding) => finding.includes(expected))) {
    throw new Error(`MUTATION_NOT_REJECTED:${id}:${expected}:${findings.join(',')}`);
  }
}

function expectLockMutationRejected(id, pkg, lock, expected) {
  const findings = lockFindings(pkg, lock);
  if (!findings.some((finding) => finding.includes(expected))) {
    throw new Error(`LOCK_MUTATION_NOT_REJECTED:${id}:${expected}:${findings.join(',')}`);
  }
}

const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
const pkgBytes = fs.readFileSync(PACKAGE_PATH);
const lockBytes = fs.readFileSync(LOCK_PATH);
const receiptBuilder = fs.readFileSync(RECEIPT_BUILDER, 'utf8');
const pkg = JSON.parse(pkgBytes.toString('utf8'));
const lock = JSON.parse(lockBytes.toString('utf8'));

const workflowMutations = [
  ['mutable-checkout-tag', workflow.replace(`actions/checkout@${CHECKOUT_SHA}`, 'actions/checkout@v7'), 'MUTABLE_OR_NONFULL_ACTION_REF'],
  ['short-checkout-sha', workflow.replace(CHECKOUT_SHA, CHECKOUT_SHA.slice(0, 12)), 'MUTABLE_OR_NONFULL_ACTION_REF'],
  ['mutable-setup-node-tag', workflow.replace(`actions/setup-node@${SETUP_NODE_SHA}`, 'actions/setup-node@v7'), 'MUTABLE_OR_NONFULL_ACTION_REF'],
  ['mutable-upload-artifact-tag', workflow.replace(`actions/upload-artifact@${UPLOAD_ARTIFACT_SHA}`, 'actions/upload-artifact@v6'), 'MUTABLE_OR_NONFULL_ACTION_REF'],
  ['moving-runner', workflow.replace('runs-on: ubuntu-24.04', 'runs-on: ubuntu-latest'), 'RUNNER_NOT_PINNED_UBUNTU_24_04'],
  ['wrong-source-ref', workflow.replace(`ref: ${EXACT_SOURCE}`, 'ref: main'), 'EXACT_SOURCE_REF_MISSING'],
  ['credential-persistence-default', workflow.replace(/\n\s*persist-credentials:\s*false/, ''), 'CHECKOUT_CREDENTIAL_PERSISTENCE_NOT_DISABLED'],
  ['sha-readback-removed', workflow.replace('ACTUAL_SHA="$(git rev-parse HEAD)"', 'ACTUAL_SHA="${EXPECTED_SHA}"'), 'ACTUAL_SHA_READBACK_MISSING'],
  ['node-downgrade', workflow.replace("node-version: '24.19.0'", "node-version: '24'"), 'NODE_24_19_0_REQUIRED'],
  ['cache-policy-removed', workflow.replace(/\n\s*package-manager-cache:\s*false/, ''), 'PACKAGE_MANAGER_CACHE_POLICY_MISSING'],
  ['mutable-install', workflow.replace('run: npm ci --ignore-scripts --no-audit --no-fund', 'run: npm install'), 'NPM_CI_COUNT_NOT_EXACTLY_ONE'],
  ['receipt-unbound', workflow.replace('/tmp/kidults-a13-validation-toolchain-receipt-v1.json', '/tmp/unbound.json'), 'TOOLCHAIN_RECEIPT_BUILDER_MISSING'],
  ['secret-injection', `${workflow}\nenv:\n  TOKEN: \${{ secrets.BAD }}\n`, 'SECRET_CONTEXT_FORBIDDEN'],
  ['remote-command', workflow.replace('run: npm run a13:smoke', 'run: npm run remote:d1:preflight'), 'REMOTE_RUNTIME_COMMAND_FORBIDDEN']
];
for (const [id, source, expected] of workflowMutations) expectWorkflowMutationRejected(id, source, expected);

const packageMutation = structuredClone(pkg);
packageMutation.devDependencies.typescript = '^99.0.0';
const integrityMutation = structuredClone(lock);
const firstRegistryKey = Object.keys(integrityMutation.packages).find((name) => name && !integrityMutation.packages[name].link);
delete integrityMutation.packages[firstRegistryKey].integrity;
const versionMutation = structuredClone(lock);
versionMutation.packages[firstRegistryKey].version = '^1.0.0';
expectLockMutationRejected('package-lock-drift', packageMutation, lock, 'PACKAGE_AND_LOCK_ROOT_DEPENDENCIES_DRIFT');
expectLockMutationRejected('integrity-removed', pkg, integrityMutation, 'LOCK_RECORD_INTEGRITY_MISSING');
expectLockMutationRejected('nonexact-version', pkg, versionMutation, 'LOCK_RECORD_VERSION_NOT_EXACT');

const receiptBuilderMutations = [
  ['source-sha-unbound', 'SOURCE_SHA_MISMATCH', 'RECEIPT_SOURCE_SHA_ASSERTION_MISSING'],
  ['installed-tree-unbound', 'NPM_CI_INSTALLED_TREE_LOCK_MISSING', 'INSTALLED_TREE_RECEIPT_MISSING'],
  ['installed-version-unbound', 'INSTALLED_PACKAGE_VERSION_DRIFT', 'INSTALLED_VERSION_BINDING_MISSING'],
  ['installed-integrity-unbound', 'INSTALLED_PACKAGE_INTEGRITY_DRIFT', 'INSTALLED_INTEGRITY_BINDING_MISSING'],
  ['report-pass-unbound', 'A13_REPORT_NOT_PASS', 'A13_REPORT_PASS_BINDING_MISSING'],
  ['report-digest-unbound', 'report_sha256', 'A13_REPORT_DIGEST_BINDING_MISSING']
];
for (const [id, marker, expected] of receiptBuilderMutations) {
  const findings = receiptBuilderFindings(receiptBuilder.replaceAll(marker, `REMOVED_${id}`));
  if (!findings.includes(expected)) throw new Error(`RECEIPT_MUTATION_NOT_REJECTED:${id}:${findings.join(',')}`);
}

const findings = [...workflowFindings(workflow), ...lockFindings(pkg, lock), ...receiptBuilderFindings(receiptBuilder)];
const packageRecords = Object.entries(lock.packages || {}).filter(([name, record]) => name && !record.link);
const result = {
  suite: 'KIDULTS_A13_VALIDATION_WORKFLOW_PROVENANCE_V1',
  issues: [933, 935, 976],
  target: WORKFLOW_PATH,
  scope: 'SYNTHETIC_NON_PRODUCTION_VALIDATION_ONLY',
  runner: 'ubuntu-24.04',
  node: '24.19.0',
  immutable_action_refs: externalActionRefs(workflow).length,
  exact_source_sha_required: true,
  checkout_credentials_persisted: false,
  install_mode: 'NPM_CI_COMMITTED_LOCK',
  lock_path: LOCK_PATH,
  lock_sha256: `sha256:${crypto.createHash('sha256').update(lockBytes).digest('hex')}`,
  locked_package_records: packageRecords.length,
  integrity_bound_package_records: packageRecords.filter(([, record]) => Boolean(record.integrity)).length,
  workflow_mutation_cases_fail_closed: workflowMutations.length,
  lock_mutation_cases_fail_closed: 3,
  receipt_builder_mutation_cases_fail_closed: receiptBuilderMutations.length,
  live_requests: 0,
  secret_material_read: false,
  external_provider_contact: false,
  external_runtime_mutation: false,
  autonomous_effect: 'A13 validation is automatically provenance-checked and replays from npm ci with the committed lock.',
  global_effect: 'Neutral: this synthetic provider-shape certification does not establish global empirical coverage.',
  irreplaceable_value_effect: 'The KIDULTS-owned validator binds source, immutable Actions, lock digest, and integrity coverage.',
  transparency_effect: 'Machine output reports exact Action, runner, Node, install, lock, and mutation-test boundaries.',
  evidence_effect: 'NONE',
  empirical_gate_effect: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
  findings,
  result: findings.length === 0 ? 'PASS' : 'FAIL'
};
console.log(JSON.stringify(result, null, 2));
if (findings.length) process.exit(1);
