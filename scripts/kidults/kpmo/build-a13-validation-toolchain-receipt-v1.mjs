import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const LOCK_PATH = 'services/kidults-autonomous-intelligence/package-lock.json';
const INSTALLED_LOCK_PATH = 'services/kidults-autonomous-intelligence/node_modules/.package-lock.json';
const REPORT_DIR = 'services/kidults-autonomous-intelligence/reports/scale';
const OUTPUT_PATH = process.argv[2] || null;

function fail(message) {
  throw new Error(message);
}

const sourceSha = process.env.SOURCE_SHA || '';
if (!/^[0-9a-f]{40}$/.test(sourceSha)) fail('SOURCE_SHA_MUST_BE_FULL_COMMIT_SHA');

const actualSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (actualSha !== sourceSha) fail(`SOURCE_SHA_MISMATCH:${actualSha}:${sourceSha}`);

const lockBytes = fs.readFileSync(LOCK_PATH);
const lock = JSON.parse(lockBytes.toString('utf8'));
const packageRecords = Object.entries(lock.packages || {}).filter(([name]) => name !== '');
const registryRecords = packageRecords.filter(([, record]) => !record.link);
const integrityBoundRecords = registryRecords.filter(([, record]) =>
  /^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/.test(record.integrity || '')
);
if (integrityBoundRecords.length !== registryRecords.length) fail('LOCK_INTEGRITY_COVERAGE_INCOMPLETE');

if (!fs.existsSync(INSTALLED_LOCK_PATH)) fail('NPM_CI_INSTALLED_TREE_LOCK_MISSING');
const installedLockBytes = fs.readFileSync(INSTALLED_LOCK_PATH);
const installedLock = JSON.parse(installedLockBytes.toString('utf8'));
const installedRecords = Object.entries(installedLock.packages || {}).filter(([name]) => name !== '');
if (!installedRecords.length) fail('NPM_CI_INSTALLED_TREE_EMPTY');
for (const [name, installed] of installedRecords) {
  const expected = lock.packages?.[name];
  if (!expected) fail(`INSTALLED_PACKAGE_NOT_IN_COMMITTED_LOCK:${name}`);
  if (installed.version !== expected.version) fail(`INSTALLED_PACKAGE_VERSION_DRIFT:${name}`);
  if (installed.integrity !== expected.integrity) fail(`INSTALLED_PACKAGE_INTEGRITY_DRIFT:${name}`);
}
for (const directName of Object.keys(lock.packages?.['']?.devDependencies || {})) {
  if (!installedLock.packages?.[`node_modules/${directName}`]) fail(`INSTALLED_DIRECT_DEPENDENCY_MISSING:${directName}`);
}

const reports = ['smoke', 'baseline'].map((profile) => {
  const matches = fs.readdirSync(REPORT_DIR)
    .filter((name) => new RegExp(`^a13-${profile}-[0-9]+\\.json$`).test(name));
  if (matches.length !== 1) fail(`A13_REPORT_COUNT_${profile.toUpperCase()}:${matches.length}`);
  const reportPath = path.join(REPORT_DIR, matches[0]);
  const reportBytes = fs.readFileSync(reportPath);
  const report = JSON.parse(reportBytes.toString('utf8'));
  if (report.profile !== profile || report.status !== 'PASS') fail(`A13_REPORT_NOT_PASS:${profile}`);
  if (report.configuration?.synthetic !== true || report.configuration?.productionEligible !== false) {
    fail(`A13_REPORT_TRUTH_BOUNDARY:${profile}`);
  }
  if (report.gates?.unauthorizedPublicationZero !== true || report.gates?.syntheticDataNonProduction !== true) {
    fail(`A13_REPORT_RELEASE_BOUNDARY:${profile}`);
  }
  return {
    profile,
    report_path: reportPath,
    report_sha256: `sha256:${crypto.createHash('sha256').update(reportBytes).digest('hex')}`,
    providers: report.configuration.providers,
    events: report.configuration.events,
    status: report.status,
    synthetic: true,
    production_eligible: false
  };
});

const receipt = {
  agent_id: 'codex/p1_supply_chain',
  as_of: `git:${sourceSha}`,
  suite: 'KIDULTS_A13_VALIDATION_TOOLCHAIN_RECEIPT_V1',
  issues: [933, 935, 976],
  scope: 'A13_SYNTHETIC_NON_PRODUCTION_VALIDATION',
  state: 'VERIFIED_PASS',
  source_sha: sourceSha,
  checked_out_sha: actualSha,
  runner_os: process.env.RUNNER_OS || 'UNKNOWN',
  runner_arch: process.env.RUNNER_ARCH || 'UNKNOWN',
  node_version: process.version,
  npm_version: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
  lock_path: LOCK_PATH,
  lock_sha256: `sha256:${crypto.createHash('sha256').update(lockBytes).digest('hex')}`,
  lockfile_version: lock.lockfileVersion,
  locked_package_records: registryRecords.length,
  integrity_bound_package_records: integrityBoundRecords.length,
  installed_tree_lock_path: INSTALLED_LOCK_PATH,
  installed_tree_lock_sha256: `sha256:${crypto.createHash('sha256').update(installedLockBytes).digest('hex')}`,
  installed_package_records: installedRecords.length,
  installed_tree_matches_committed_lock: true,
  install_mode: 'NPM_CI_COMMITTED_LOCK',
  dependency_update_mode: 'REVIEWED_REPOSITORY_CHANGE_REQUIRED',
  reports,
  facts: [
    'The exact checked-out source ran the A13 smoke and baseline synthetic certifications.',
    'The workflow mandates npm ci; the resulting installed-tree lock matches the committed versions and integrity metadata.'
  ],
  evidence_refs: reports.map((report) => `${report.report_path}@${report.report_sha256}`),
  uncertainties: [
    'This receipt does not prove the remaining GitHub Actions or dependency estate is remediated.',
    'Registry availability and upstream package availability are not proven by this repository-only receipt.'
  ],
  blockers: [
    'Production, Public, provider, credential, spend, and G5 authority remain outside this validation scope.'
  ],
  next_action: 'Review the Draft PR and exact-head CI; continue bounded current-main estate remediation.',
  authority_boundary: 'SYNTHETIC_VALIDATION_ONLY_NO_EXTERNAL_RUNTIME_MUTATION',
  autonomous_effect: 'A13 validation replays automatically from an exact source SHA and committed dependency graph.',
  global_effect: 'Neutral: provider shapes are synthetic and do not establish global empirical coverage.',
  irreplaceable_value_effect: 'KIDULTS retains source, lock, toolchain, and report digests for deterministic validation replay.',
  transparency_effect: 'The receipt exposes source, runner, Node, npm, lock integrity coverage, and both report digests.',
  evidence_effect: 'NONE',
  empirical_gate_effect: 'NONE',
  external_provider_contact: false,
  external_runtime_mutation: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
};

const rendered = `${JSON.stringify(receipt, null, 2)}\n`;
if (OUTPUT_PATH) {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, rendered);
}
process.stdout.write(rendered);
