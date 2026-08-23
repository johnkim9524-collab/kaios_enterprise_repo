import crypto from 'node:crypto';
import fs from 'node:fs';

const WORKFLOW_PATH = '.github/workflows/kidults-portal-r001-release-qa.yml';
const PACKAGE_PATH = 'tooling/kidults-portal-r001-browser-qa/package.json';
const LOCK_PATH = 'tooling/kidults-portal-r001-browser-qa/package-lock.json';
const RECEIPT_BUILDER = 'scripts/kidults/kpmo/build-portal-r001-browser-qa-toolchain-receipt-v1.mjs';
const SELF = 'scripts/kidults/kpmo/validate-portal-r001-browser-qa-supply-chain-v1.mjs';
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
  require(refs.includes(`actions/checkout@${CHECKOUT_SHA} # v7.0.1`), 'CHECKOUT_SHA_OR_VERSION_COMMENT_DRIFT');
  require(refs.includes(`actions/setup-node@${SETUP_NODE_SHA} # v7`), 'SETUP_NODE_SHA_OR_VERSION_COMMENT_DRIFT');
  require(refs.includes(`actions/upload-artifact@${UPLOAD_ARTIFACT_SHA} # v6.0.0`), 'UPLOAD_ARTIFACT_SHA_OR_VERSION_COMMENT_DRIFT');
  require(/^\s*permissions:\s*\n\s*contents:\s*read\s*$/m.test(text), 'LEAST_PRIVILEGE_CONTENTS_READ_MISSING');
  require(/runs-on:\s*ubuntu-24\.04/.test(text), 'RUNNER_NOT_PINNED_UBUNTU_24_04');
  require(!/runs-on:\s*ubuntu-latest/.test(text), 'MOVING_RUNNER_ALIAS_FORBIDDEN');
  require(text.includes(`ref: ${EXACT_SOURCE}`), 'EXACT_SOURCE_REF_MISSING');
  require(/fetch-depth:\s*1/.test(text), 'BOUNDED_CHECKOUT_DEPTH_MISSING');
  require(/persist-credentials:\s*false/.test(text), 'CHECKOUT_CREDENTIAL_PERSISTENCE_NOT_DISABLED');
  require(text.includes(`EXPECTED_SHA: ${EXACT_SOURCE}`), 'EXPECTED_SHA_BINDING_MISSING');
  require(/ACTUAL_SHA="\$\(git rev-parse HEAD\)"/.test(text), 'ACTUAL_SHA_READBACK_MISSING');
  require(/test "\$\{ACTUAL_SHA\}" = "\$\{EXPECTED_SHA\}"/.test(text), 'SOURCE_SHA_EQUALITY_ASSERTION_MISSING');
  require(/node-version:\s*['"]24['"]/.test(text), 'NODE_24_REQUIRED');
  require(/package-manager-cache:\s*false/.test(text), 'PACKAGE_MANAGER_CACHE_POLICY_MISSING');
  require(text.includes(`node ${SELF}`), 'SELF_PROVENANCE_VALIDATION_MISSING');
  require(text.includes('npm ci --prefix /tmp/kidults-r001-qa'), 'NPM_CI_COMMITTED_LOCK_MISSING');
  require(text.includes('node /tmp/kidults-r001-qa/node_modules/playwright/cli.js install --with-deps chromium'), 'LOCKED_PLAYWRIGHT_CLI_MISSING');
  require(!activeRunLines(text).some((line) => /^(?:run:\s*)?npm\s+install\b/i.test(line)), 'MUTABLE_NPM_INSTALL_FORBIDDEN');
  require(!activeRunLines(text).some((line) => /^(?:run:\s*)?npx\b/i.test(line)), 'NPX_RUNTIME_RESOLUTION_FORBIDDEN');
  require(text.includes(`node ${RECEIPT_BUILDER} /tmp/kidults-r001-qa/toolchain-receipt.json`), 'TOOLCHAIN_RECEIPT_BUILDER_MISSING');
  require(text.includes('/tmp/kidults-r001-qa/toolchain-receipt.json'), 'TOOLCHAIN_RECEIPT_ARTIFACT_BINDING_MISSING');
  require(!/pull_request_target\s*:/.test(text), 'PULL_REQUEST_TARGET_FORBIDDEN');
  require(!/continue-on-error\s*:\s*true/.test(text), 'CONTINUE_ON_ERROR_FORBIDDEN');
  require(!/\bsecrets\s*\.|\bsecrets\s*\[|secrets\s*:\s*inherit/.test(text), 'SECRET_CONTEXT_FORBIDDEN');
  return [...new Set(findings)];
}

function dependencyMap(record) {
  return { ...(record.dependencies || {}), ...(record.devDependencies || {}), ...(record.optionalDependencies || {}) };
}

function stable(record) {
  return Object.fromEntries(Object.entries(dependencyMap(record)).sort(([a], [b]) => a.localeCompare(b)));
}

function lockFindings(pkg, lock) {
  const findings = [];
  const require = (condition, id) => { if (!condition) findings.push(id); };
  require(lock.lockfileVersion === 3, 'LOCKFILE_VERSION_NOT_3');
  require(lock.requires === true, 'LOCK_REQUIRES_NOT_TRUE');
  require(Boolean(lock.packages?.['']), 'LOCK_ROOT_RECORD_MISSING');
  require(JSON.stringify(stable(lock.packages?.[''] || {})) === JSON.stringify(stable(pkg)), 'PACKAGE_AND_LOCK_ROOT_DEPENDENCIES_DRIFT');
  require(pkg.dependencies?.playwright === '1.62.1', 'PLAYWRIGHT_NOT_EXACT');
  require(pkg.dependencies?.['@axe-core/playwright'] === '4.13.0', 'AXE_PLAYWRIGHT_NOT_EXACT');
  for (const [name, record] of Object.entries(lock.packages || {})) {
    if (name === '' || record.link) continue;
    require(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(record.version || ''), `LOCK_RECORD_VERSION_NOT_EXACT:${name}`);
    require(/^https:\/\/registry\.npmjs\.org\//.test(record.resolved || ''), `LOCK_RECORD_RESOLUTION_NOT_REGISTRY_TARBALL:${name}`);
    require(/^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/.test(record.integrity || ''), `LOCK_RECORD_INTEGRITY_MISSING:${name}`);
  }
  return [...new Set(findings)];
}

function receiptFindings(text) {
  const markers = [
    'SOURCE_SHA_MISMATCH', 'NPM_CI_INSTALLED_TREE_LOCK_MISSING', 'INSTALLED_PACKAGE_VERSION_DRIFT',
    'INSTALLED_PACKAGE_INTEGRITY_DRIFT', 'BROWSER_QA_REPORT_NOT_PASS', 'browser_qa_report_sha256',
    "production: 'HOLD'", "public: 'HOLD'", "g5: 'EXPLICIT_APPROVAL_REQUIRED'"
  ];
  return markers.filter((marker) => !text.includes(marker)).map((marker) => `RECEIPT_MARKER_MISSING:${marker}`);
}

function expectMutation(id, source, expected) {
  const findings = workflowFindings(source);
  if (!findings.some((finding) => finding.includes(expected))) throw new Error(`MUTATION_NOT_REJECTED:${id}:${expected}`);
}

const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
const pkgBytes = fs.readFileSync(PACKAGE_PATH);
const lockBytes = fs.readFileSync(LOCK_PATH);
const receiptBuilder = fs.readFileSync(RECEIPT_BUILDER, 'utf8');
const pkg = JSON.parse(pkgBytes.toString('utf8'));
const lock = JSON.parse(lockBytes.toString('utf8'));

const findings = [...workflowFindings(workflow), ...lockFindings(pkg, lock), ...receiptFindings(receiptBuilder)];
if (findings.length) throw new Error(`PORTAL_BROWSER_QA_SUPPLY_CHAIN_INVALID:${findings.join(',')}`);

expectMutation('MUTABLE_CHECKOUT', workflow.replace(`actions/checkout@${CHECKOUT_SHA} # v7.0.1`, 'actions/checkout@v7'), 'MUTABLE_OR_NONFULL_ACTION_REF');
expectMutation('NODE_DOWNGRADE', workflow.replace("node-version: '24'", 'node-version: 22'), 'NODE_24_REQUIRED');
expectMutation('NPM_INSTALL', workflow.replace('npm ci --prefix /tmp/kidults-r001-qa', 'npm install --prefix /tmp/kidults-r001-qa'), 'MUTABLE_NPM_INSTALL_FORBIDDEN');
expectMutation('NPX', workflow.replace('node /tmp/kidults-r001-qa/node_modules/playwright/cli.js', 'npx playwright'), 'NPX_RUNTIME_RESOLUTION_FORBIDDEN');
expectMutation('CREDENTIAL_PERSIST', workflow.replace('persist-credentials: false', 'persist-credentials: true'), 'CHECKOUT_CREDENTIAL_PERSISTENCE_NOT_DISABLED');

const lockNoIntegrity = structuredClone(lock);
const record = Object.entries(lockNoIntegrity.packages).find(([name, value]) => name && !value.link)?.[1];
delete record.integrity;
if (!lockFindings(pkg, lockNoIntegrity).some((finding) => finding.includes('LOCK_RECORD_INTEGRITY_MISSING'))) throw new Error('MUTATION_NOT_REJECTED:LOCK_INTEGRITY');
const pkgDrift = structuredClone(pkg);
pkgDrift.dependencies.playwright = '1.62.0';
if (!lockFindings(pkgDrift, lock).some((finding) => finding.includes('PACKAGE_AND_LOCK_ROOT_DEPENDENCIES_DRIFT'))) throw new Error('MUTATION_NOT_REJECTED:PACKAGE_LOCK_DRIFT');

const registryRecords = Object.entries(lock.packages).filter(([name, value]) => name && !value.link);
const receipt = {
  agent_id: 'codex/p1_supply_chain',
  suite: 'KIDULTS_PORTAL_R001_BROWSER_QA_SUPPLY_CHAIN_VALIDATOR_V1',
  result: 'PASS',
  issues: [895, 933, 935, 976],
  workflow: WORKFLOW_PATH,
  workflow_sha256: `sha256:${crypto.createHash('sha256').update(workflow).digest('hex')}`,
  package_sha256: `sha256:${crypto.createHash('sha256').update(pkgBytes).digest('hex')}`,
  lock_sha256: `sha256:${crypto.createHash('sha256').update(lockBytes).digest('hex')}`,
  locked_package_records: registryRecords.length,
  integrity_bound_package_records: registryRecords.filter(([, value]) => value.integrity).length,
  mutations_rejected: 7,
  scope: 'PORTAL_R001_BROWSER_QA_ONLY',
  empirical_gate_effect: 'NONE',
  external_runtime_mutation: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
};
console.log(JSON.stringify(receipt, null, 2));
