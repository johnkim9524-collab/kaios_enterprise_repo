import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const LOCK_PATH = 'tooling/kidults-mobile-portal-browser-qa/package-lock.json';
const PACKAGE_PATH = 'tooling/kidults-mobile-portal-browser-qa/package.json';
const INSTALLED_LOCK_PATH = '/tmp/kidults-mobile-qa/node_modules/.package-lock.json';
const REPORT_PATH = process.env.KIDULTS_PORTAL_QA_REPORT || '/tmp/kidults-mobile-public-qa-v1/mobile-portal-report-v1.json';
const RUNNER_PATH = 'scripts/kidults/portal/capture-mobile-portal-v1.mjs';
const WORKFLOW_PATH = '.github/workflows/kidults-mobile-portal-release-qa-v1.yml';
const BUILDER_PATH = 'scripts/kidults/kpmo/build-mobile-portal-browser-qa-toolchain-receipt-v1.mjs';
const SUPPLY_VALIDATOR_PATH = 'scripts/kidults/kpmo/validate-mobile-portal-browser-qa-supply-chain-v1.mjs';
const OUTPUT_PATH = process.argv[2] || null;

function fail(message) { throw new Error(message); }
function sha256(bytes) { return bytes ? `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}` : null; }
function failureClass(error) {
  return String(error?.message || error || 'TOOLCHAIN_RECEIPT_BUILD_FAILED')
    .toUpperCase().replace(/[^A-Z0-9_:.-]+/g, '_').slice(0, 180);
}

const sourceSha = process.env.SOURCE_SHA || '';
let actualSha = null;
let lockBytes = null;
let packageBytes = null;
let installedLockBytes = null;
let reportBytes = null;
let runnerBytes = null;
let workflowBytes = null;
let builderBytes = null;
let supplyValidatorBytes = null;
let lock = null;
let report = null;
let registryRecords = [];
let installedRecords = [];
let npmVersion = null;
let failure = null;

try {
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) fail('SOURCE_SHA_MUST_BE_FULL_COMMIT_SHA');
  actualSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (actualSha !== sourceSha) fail(`SOURCE_SHA_MISMATCH:${actualSha}:${sourceSha}`);
  lockBytes = fs.readFileSync(LOCK_PATH);
  packageBytes = fs.readFileSync(PACKAGE_PATH);
  workflowBytes = fs.readFileSync(WORKFLOW_PATH);
  builderBytes = fs.readFileSync(BUILDER_PATH);
  supplyValidatorBytes = fs.readFileSync(SUPPLY_VALIDATOR_PATH);
  lock = JSON.parse(lockBytes.toString('utf8'));
  registryRecords = Object.entries(lock.packages || {}).filter(([name, record]) => name && !record.link);
  if (!registryRecords.length) fail('LOCK_PACKAGE_GRAPH_EMPTY');
  if (registryRecords.some(([, record]) => !/^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/.test(record.integrity || ''))) {
    fail('LOCK_INTEGRITY_COVERAGE_INCOMPLETE');
  }
  if (!fs.existsSync(INSTALLED_LOCK_PATH)) fail('NPM_CI_INSTALLED_TREE_LOCK_MISSING');
  installedLockBytes = fs.readFileSync(INSTALLED_LOCK_PATH);
  const installedLock = JSON.parse(installedLockBytes.toString('utf8'));
  installedRecords = Object.entries(installedLock.packages || {}).filter(([name]) => name);
  if (!installedRecords.length) fail('NPM_CI_INSTALLED_TREE_EMPTY');
  for (const [name, installed] of installedRecords) {
    const expected = lock.packages?.[name];
    if (!expected) fail(`INSTALLED_PACKAGE_NOT_IN_COMMITTED_LOCK:${name}`);
    if (installed.version !== expected.version) fail(`INSTALLED_PACKAGE_VERSION_DRIFT:${name}`);
    if (installed.integrity !== expected.integrity) fail(`INSTALLED_PACKAGE_INTEGRITY_DRIFT:${name}`);
  }
  reportBytes = fs.readFileSync(REPORT_PATH);
  runnerBytes = fs.readFileSync(RUNNER_PATH);
  report = JSON.parse(reportBytes.toString('utf8'));
  if (report.id !== 'kidults-independent-mobile-portal-browser-qa-v1') fail('BROWSER_QA_REPORT_ID_INVALID');
  if (report.source_sha !== sourceSha) fail('BROWSER_QA_SOURCE_SHA_MISMATCH');
  if (report.result !== 'PASS' || report.failures?.length !== 0) fail('BROWSER_QA_REPORT_NOT_PASS');
  if (report.cases?.length !== 13) fail('BROWSER_QA_EXACT_13_CASES_REQUIRED');
  const live = report.cases.find(item => item.projectionMode === 'live');
  if (live?.revalidation?.atomicObservation?.state !== 'LIVE_APPROVED') fail('LIVE_REVALIDATION_ATOMIC_CANARY_MISSING');
  if (live?.revalidation?.timeoutObservation?.state !== 'INVALID') fail('LIVE_REVALIDATION_TIMEOUT_CANARY_MISSING');
  if (report.truth_boundary?.empirical_gate_effect !== 'NONE') fail('BROWSER_QA_TRUTH_BOUNDARY_INVALID');
  npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
} catch (error) {
  failure = failureClass(error);
}

const receipt = {
  agent_id: 'AI-018 / GLOBAL_SCALE_STEWARDSHIP',
  as_of: /^[0-9a-f]{40}$/.test(sourceSha) ? `git:${sourceSha}` : null,
  suite: 'KIDULTS_INDEPENDENT_MOBILE_PORTAL_BROWSER_QA_TOOLCHAIN_RECEIPT_V1',
  scope: 'INDEPENDENT_MOBILE_PORTAL_NON_PRODUCTION',
  state: failure ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
  failure_class: failure,
  source_sha: sourceSha || null,
  checked_out_sha: actualSha,
  runner_os: process.env.RUNNER_OS || 'UNKNOWN',
  runner_arch: process.env.RUNNER_ARCH || 'UNKNOWN',
  node_version: process.version,
  npm_version: npmVersion,
  lock_path: LOCK_PATH,
  lock_sha256: sha256(lockBytes),
  package_path: PACKAGE_PATH,
  package_sha256: sha256(packageBytes),
  locked_package_records: registryRecords.length,
  installed_tree_lock_path: INSTALLED_LOCK_PATH,
  installed_tree_lock_sha256: sha256(installedLockBytes),
  installed_package_records: installedRecords.length,
  browser_qa_report_path: REPORT_PATH,
  browser_qa_report_sha256: sha256(reportBytes),
  browser_qa_result: report?.result || 'UNKNOWN',
  browser_qa_cases: report?.cases?.length || 0,
  runner_path: RUNNER_PATH,
  runner_sha256: sha256(runnerBytes),
  workflow_path: WORKFLOW_PATH,
  workflow_sha256: sha256(workflowBytes),
  builder_path: BUILDER_PATH,
  builder_sha256: sha256(builderBytes),
  supply_validator_path: SUPPLY_VALIDATOR_PATH,
  supply_validator_sha256: sha256(supplyValidatorBytes),
  empirical_gate_effect: 'NONE',
  external_runtime_mutation: false,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
  autonomous_effect: 'Exact-head CI executes automatically on mobile surface changes.',
  global_effect: 'Chromium and WebKit cover 320, 375, 390, and 430 pixel mobile viewports.',
  irreplaceable_value_effect: 'The mobile QA and dependency graph are KIDULTS-owned and provider-independent.',
  transparency_effect: 'The receipt binds source, lock, installed tree, runner, report, cases, and failure class.'
};

const output = `${JSON.stringify(receipt, null, 2)}\n`;
if (OUTPUT_PATH) fs.writeFileSync(OUTPUT_PATH, output);
process.stdout.write(output);
if (failure) process.exitCode = 1;
