import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const LOCK_PATH = 'tooling/kidults-portal-r001-browser-qa/package-lock.json';
const INSTALLED_LOCK_PATH = '/tmp/kidults-r001-qa/node_modules/.package-lock.json';
const REPORT_PATH = '/tmp/kidults-portal-r001-release-qa-v1.json';
const FIXTURE_BUILDER_PATH = 'scripts/kidults/portal/proof-product-test-fixtures-v1.mjs';
const OUTPUT_PATH = process.argv[2] || null;
const REPORT_FAILURE = 'BROWSER_QA_REPORT_NOT_PASS';

function fail(message) { throw new Error(message); }
function sha256(bytes) { return bytes ? `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}` : null; }
function failureClass(error) {
  const raw = String(error?.message || error || 'TOOLCHAIN_RECEIPT_BUILD_FAILED').toUpperCase();
  return raw.replace(/[^A-Z0-9_:.-]+/g, '_').slice(0, 180) || 'TOOLCHAIN_RECEIPT_BUILD_FAILED';
}

const sourceSha = process.env.SOURCE_SHA || '';
let actualSha = null;
let lockBytes = null;
let installedLockBytes = null;
let reportBytes = null;
let fixtureBuilderBytes = null;
let lock = null;
let installedLock = null;
let report = null;
let registryRecords = [];
let integrityBoundRecords = [];
let installedRecords = [];
let npmVersion = null;
let failure = null;

try {
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) fail('SOURCE_SHA_MUST_BE_FULL_COMMIT_SHA');
  actualSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (actualSha !== sourceSha) fail(`SOURCE_SHA_MISMATCH:${actualSha}:${sourceSha}`);

  lockBytes = fs.readFileSync(LOCK_PATH);
  lock = JSON.parse(lockBytes.toString('utf8'));
  registryRecords = Object.entries(lock.packages || {}).filter(([name, record]) => name !== '' && !record.link);
  integrityBoundRecords = registryRecords.filter(([, record]) => /^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/.test(record.integrity || ''));
  if (integrityBoundRecords.length !== registryRecords.length) fail('LOCK_INTEGRITY_COVERAGE_INCOMPLETE');

  if (!fs.existsSync(INSTALLED_LOCK_PATH)) fail('NPM_CI_INSTALLED_TREE_LOCK_MISSING');
  installedLockBytes = fs.readFileSync(INSTALLED_LOCK_PATH);
  installedLock = JSON.parse(installedLockBytes.toString('utf8'));
  installedRecords = Object.entries(installedLock.packages || {}).filter(([name]) => name !== '');
  if (!installedRecords.length) fail('NPM_CI_INSTALLED_TREE_EMPTY');
  for (const [name, installed] of installedRecords) {
    const expected = lock.packages?.[name];
    if (!expected) fail(`INSTALLED_PACKAGE_NOT_IN_COMMITTED_LOCK:${name}`);
    if (installed.version !== expected.version) fail(`INSTALLED_PACKAGE_VERSION_DRIFT:${name}`);
    if (installed.integrity !== expected.integrity) fail(`INSTALLED_PACKAGE_INTEGRITY_DRIFT:${name}`);
  }

  reportBytes = fs.readFileSync(REPORT_PATH);
  fixtureBuilderBytes = fs.readFileSync(FIXTURE_BUILDER_PATH);
  report = JSON.parse(reportBytes.toString('utf8'));
  if (!['PASS', 'FAIL'].includes(report.result)) fail('BROWSER_QA_REPORT_RESULT_INVALID');
  if (report.truth_boundary?.empirical_gate_effect !== 'NONE') fail('BROWSER_QA_REPORT_TRUTH_BOUNDARY');
  if (report.result !== 'PASS') failure = REPORT_FAILURE;
  npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
} catch (error) {
  failure = failure || failureClass(error);
}

const receipt = {
  agent_id: 'codex/p1_supply_chain',
  as_of: /^[0-9a-f]{40}$/.test(sourceSha) ? `git:${sourceSha}` : null,
  suite: 'KIDULTS_PORTAL_R001_BROWSER_QA_TOOLCHAIN_RECEIPT_V1',
  issues: [895, 933, 935, 976, 1493, 1494, 1496, 1497],
  scope: 'PORTAL_R001_BROWSER_QA_NON_PRODUCTION',
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
  lockfile_version: lock?.lockfileVersion ?? null,
  locked_package_records: registryRecords.length,
  integrity_bound_package_records: integrityBoundRecords.length,
  installed_tree_lock_path: INSTALLED_LOCK_PATH,
  installed_tree_lock_sha256: sha256(installedLockBytes),
  installed_package_records: installedRecords.length,
  installed_tree_matches_committed_lock: failure ? null : true,
  install_mode: 'NPM_CI_COMMITTED_LOCK',
  browser_qa_report_path: REPORT_PATH,
  browser_qa_report_sha256: sha256(reportBytes),
  fixture_builder_path: FIXTURE_BUILDER_PATH,
  fixture_builder_sha256: sha256(fixtureBuilderBytes),
  browser_qa_result: report?.result || 'UNKNOWN',
  empirical_gate_effect: 'NONE',
  external_runtime_mutation: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
  limitations: [
    'This receipt covers only the Portal Release-001 browser QA workflow and its committed npm dependency graph.',
    'A VERIFIED_FAIL receipt is diagnostic control evidence only and is never promotable release or empirical evidence.',
    'It does not prove estate-wide GitHub Action, Node, npm, Python, browser, or release bootstrap remediation.'
  ]
};

const output = `${JSON.stringify(receipt, null, 2)}\n`;
if (OUTPUT_PATH) fs.writeFileSync(OUTPUT_PATH, output);
process.stdout.write(output);
if (failure) process.exitCode = 1;
