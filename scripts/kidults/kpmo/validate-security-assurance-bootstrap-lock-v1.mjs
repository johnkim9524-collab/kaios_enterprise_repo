import crypto from 'node:crypto';
import fs from 'node:fs';

const LOCK_PATH = 'requirements-security-assurance-pip-audit.lock.txt';
const WORKFLOW_PATH = '.github/workflows/kidults-security-assurance-empirical-r1.yml';
const NPM_RUNNER_PATH = 'scripts/kidults/kpmo/run-bounded-npm-audit-v1.mjs';
const EXPECTED_AUDITOR_VERSION = '2.10.1';
const EXPECTED_REQUIREMENT_COUNT = 29;

function fail(message) { throw new Error(message); }
function normalizeName(name) { return name.toLowerCase().replace(/[-_.]+/g, '-'); }

function validateLock(text) {
  const records = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const packages = new Map();
  const recordPattern = /^([A-Za-z0-9][A-Za-z0-9._-]*)==([A-Za-z0-9][A-Za-z0-9._+!-]*)\s+--hash=sha256:([a-f0-9]{64})$/;
  for (const record of records) {
    const match = record.match(recordPattern);
    if (!match) fail(`LOCK_RECORD_NOT_EXACT_OR_HASHED:${record}`);
    const [, rawName, version, digest] = match;
    const name = normalizeName(rawName);
    if (packages.has(name)) fail(`LOCK_DUPLICATE_PACKAGE:${name}`);
    packages.set(name, { version, digest });
  }
  if (packages.size !== EXPECTED_REQUIREMENT_COUNT) fail(`LOCK_REQUIREMENT_COUNT:${packages.size}`);
  if (packages.get('pip-audit')?.version !== EXPECTED_AUDITOR_VERSION) fail('LOCK_PIP_AUDIT_VERSION_DRIFT');
  if (!packages.has('pip')) fail('LOCK_PIP_BOOTSTRAP_MISSING');
  return packages;
}

function validateNpmRunner(text) {
  const required = [
    'const MAX_ATTEMPTS = 3;',
    'const ATTEMPT_TIMEOUT_MS = 45_000;',
    "npm_config_fetch_retries: '0'",
    "npm_config_fetch_timeout: '30000'",
    "spawnSync('npm', ['audit', '--audit-level=high', '--json']",
    "['package-lock.json', 'npm-shrinkwrap.json']",
    "base === 'npm-shrinkwrap.json'",
    "lock_precedence: 'NPM_SHRINKWRAP_OVER_PACKAGE_LOCK_PER_DIRECTORY'",
    "retry_policy: 'TRANSIENT_INVALID_ERROR_OR_TIMEOUT_ONLY'",
    'AUDIT_OUTPUT_NAME_COLLISION',
    'selectAuditTargets',
    'classifyAuditPayload',
    'payload?.message',
    'SELF_SHRINKWRAP_PRECEDENCE',
    'SELF_NETWORK_TIMEOUT_MESSAGE',
    'final_unavailable_fail_closed: true',
    'timeout_reason_preserved: true',
  ];
  for (const marker of required) if (!text.includes(marker)) fail(`NPM_RUNNER_BINDING_MISSING:${marker}`);
  if (/const MAX_ATTEMPTS\s*=\s*(?:0|1|[4-9]|[1-9][0-9]+)/.test(text)) fail('NPM_RUNNER_ATTEMPT_BOUND_DRIFT');
  if (/const ATTEMPT_TIMEOUT_MS\s*=\s*(?:[1-9][0-9]{5,}|0)\s*;/.test(text)) fail('NPM_RUNNER_TIMEOUT_UNBOUNDED');
  if (!text.includes('if (invalid || unavailable || high || critical || anomalousNonzero) process.exit(1);')) fail('NPM_RUNNER_FAIL_CLOSE_MISSING');
}

function validateWorkflow(text) {
  const required = [
    'runs-on: ubuntu-24.04',
    'timeout-minutes: 20',
    "python-version: '3.11.16'",
    `PIP_AUDIT_LOCK: ${LOCK_PATH}`,
    `EXPECTED_PIP_AUDIT_VERSION: '${EXPECTED_AUDITOR_VERSION}'`,
    "PIP_DEFAULT_TIMEOUT: '30'",
    "PIP_RETRIES: '2'",
    'node scripts/kidults/kpmo/validate-security-assurance-bootstrap-lock-v1.mjs',
    `node --check ${NPM_RUNNER_PATH}`,
    `node ${NPM_RUNNER_PATH} --self-test`,
    `node ${NPM_RUNNER_PATH}`,
    '"**/package*.json"',
    '"npm-shrinkwrap.json"',
    '"**/npm-shrinkwrap.json"',
    'npm-shrinkwrap\\.json',
    'python -m pip install --disable-pip-version-check --require-hashes --only-binary=:all: -r "$PIP_AUDIT_LOCK"',
    'python -m pip_audit --version',
    'python -m pip --version',
    'python -m pip_audit -r "$req"',
    'pip-audit-bootstrap.json',
    "pip_audit_bootstrap:pipBootstrap",
    "name: High-confidence committed-secret scan\n        continue-on-error: true",
    "name: Node dependency vulnerability audit\n        continue-on-error: true",
    "name: Python dependency vulnerability audit\n        continue-on-error: true",
    'name: Validate vulnerability response ownership\n        if: always()',
    'vulnerability-response-ownership.json',
    'name: Build assurance result\n        if: always()',
    'component_pass:{secret:secretPass,npm:npmPass,pip:pipPass,ownership:ownerPass,integrity:Boolean(integ)}',
    'security-assurance-report.json',
    'if-no-files-found: error',
    'name: Enforce aggregate security assurance terminal\n        if: always()',
    "if(x.state!=='VERIFIED_PASS')",
    'SECURITY_ASSURANCE_AGGREGATE_RED',
  ];
  for (const marker of required) if (!text.includes(marker)) fail(`WORKFLOW_BINDING_MISSING:${marker}`);
  if (/pip\s+install[^\n]*\bpip-audit(?:\s|$)/i.test(text)) fail('WORKFLOW_MUTABLE_DIRECT_PIP_AUDIT_INSTALL');
  if (/^\s+pip-audit\s+-r\s/m.test(text)) fail('WORKFLOW_UNBOUND_PIP_AUDIT_ENTRYPOINT');
  if (/\bnpm\s+audit\b/.test(text)) fail('WORKFLOW_DIRECT_UNBOUNDED_NPM_AUDIT_FORBIDDEN');
  const uploadIndex=text.indexOf('uses: actions/upload-artifact@');
  const enforceIndex=text.indexOf('name: Enforce aggregate security assurance terminal');
  if(uploadIndex<0||enforceIndex<=uploadIndex) fail('WORKFLOW_ARTIFACT_MUST_PRECEDE_AGGREGATE_TERMINAL');
}

function expectRejected(label, operation) {
  try { operation(); } catch { return; }
  fail(`MUTATION_NOT_REJECTED:${label}`);
}

const lock = fs.readFileSync(LOCK_PATH, 'utf8');
const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
const npmRunner = fs.readFileSync(NPM_RUNNER_PATH, 'utf8');
const packages = validateLock(lock);
validateWorkflow(workflow);
validateNpmRunner(npmRunner);

const firstHash = lock.match(/\s--hash=sha256:[a-f0-9]{64}/)?.[0];
const pipAuditRecord = lock.split(/\r?\n/).find((line) => line.startsWith('pip-audit=='));
if (!firstHash || !pipAuditRecord) fail('SELF_TEST_FIXTURE_MISSING');

const mutations = [
  ['missing-hash', () => validateLock(lock.replace(firstHash, ''))],
  ['range-version', () => validateLock(lock.replace(pipAuditRecord, pipAuditRecord.replace('==', '>=')))],
  ['duplicate-package', () => validateLock(`${lock.trimEnd()}\n${pipAuditRecord}\n`)],
  ['missing-auditor', () => validateLock(lock.replace(`${pipAuditRecord}\n`, ''))],
  ['missing-require-hashes', () => validateWorkflow(workflow.replace('--require-hashes ', ''))],
  ['missing-wheel-only', () => validateWorkflow(workflow.replace('--only-binary=:all: ', ''))],
  ['mutable-direct-install', () => validateWorkflow(workflow.replace('-r "$PIP_AUDIT_LOCK"', 'pip-audit'))],
  ['missing-validator', () => validateWorkflow(workflow.replace('node scripts/kidults/kpmo/validate-security-assurance-bootstrap-lock-v1.mjs', 'echo validator-removed'))],
  ['unbound-entrypoint', () => validateWorkflow(workflow.replace('python -m pip_audit -r "$req"', 'pip-audit -r "$req"'))],
  ['missing-receipt-binding', () => validateWorkflow(workflow.replace("pip_audit_bootstrap:pipBootstrap", 'pip_audit_bootstrap:null'))],
  ['missing-npm-self-test', () => validateWorkflow(workflow.replace(`node ${NPM_RUNNER_PATH} --self-test`, 'echo npm-self-test-removed'))],
  ['missing-nested-package-trigger', () => validateWorkflow(workflow.replace('      - "**/package*.json"\n', ''))],
  ['missing-shrinkwrap-trigger', () => validateWorkflow(workflow.replace('      - "npm-shrinkwrap.json"\n', ''))],
  ['direct-npm-audit', () => validateWorkflow(workflow.replace(`node ${NPM_RUNNER_PATH}`, 'npm audit --audit-level=high --json'))],
  ['missing-job-timeout', () => validateWorkflow(workflow.replace('    timeout-minutes: 20\n', ''))],
  ['missing-pip-timeout', () => validateWorkflow(workflow.replace("      PIP_DEFAULT_TIMEOUT: '30'\n", ''))],
  ['missing-pip-retry-bound', () => validateWorkflow(workflow.replace("      PIP_RETRIES: '2'\n", ''))],
  ['secret-failfast-restored', () => validateWorkflow(workflow.replace('name: High-confidence committed-secret scan\n        continue-on-error: true', 'name: High-confidence committed-secret scan'))],
  ['npm-failfast-restored', () => validateWorkflow(workflow.replace('name: Node dependency vulnerability audit\n        continue-on-error: true', 'name: Node dependency vulnerability audit'))],
  ['pip-failfast-restored', () => validateWorkflow(workflow.replace('name: Python dependency vulnerability audit\n        continue-on-error: true', 'name: Python dependency vulnerability audit'))],
  ['ownership-always-removed', () => validateWorkflow(workflow.replace('name: Validate vulnerability response ownership\n        if: always()', 'name: Validate vulnerability response ownership'))],
  ['aggregate-terminal-removed', () => validateWorkflow(workflow.replace('name: Enforce aggregate security assurance terminal\n        if: always()', 'name: Aggregate removed'))],
  ['artifact-failclose-removed', () => validateWorkflow(workflow.replace('          if-no-files-found: error\n', ''))],
  ['npm-attempt-bound-drift', () => validateNpmRunner(npmRunner.replace('const MAX_ATTEMPTS = 3;', 'const MAX_ATTEMPTS = 30;'))],
  ['npm-timeout-bound-drift', () => validateNpmRunner(npmRunner.replace('const ATTEMPT_TIMEOUT_MS = 45_000;', 'const ATTEMPT_TIMEOUT_MS = 600_000;'))],
  ['npm-fetch-retry-drift', () => validateNpmRunner(npmRunner.replace("npm_config_fetch_retries: '0'", "npm_config_fetch_retries: '10'"))],
  ['npm-shrinkwrap-coverage-removed', () => validateNpmRunner(npmRunner.replace("['package-lock.json', 'npm-shrinkwrap.json']", "['package-lock.json']"))],
  ['npm-timeout-reason-removed', () => validateNpmRunner(npmRunner.replace('payload?.error?.summary || payload?.message ||', 'payload?.error?.summary ||'))],
  ['npm-fail-close-removed', () => validateNpmRunner(npmRunner.replace('if (invalid || unavailable || high || critical || anomalousNonzero) process.exit(1);', 'if (false) process.exit(1);'))],
];
for (const [label, operation] of mutations) expectRejected(label, operation);

const result = {
  suite: 'KIDULTS_SECURITY_ASSURANCE_BOOTSTRAP_LOCK_V1',
  issue: 976,
  result: 'VERIFIED_PASS',
  lock_path: LOCK_PATH,
  lock_sha256: crypto.createHash('sha256').update(lock).digest('hex'),
  locked_requirement_count: packages.size,
  pip_audit_version: packages.get('pip-audit').version,
  install_mode: 'HASH_VERIFIED_WHEELS_ONLY',
  npm_audit_mode: 'BOUNDED_TRANSIENT_RETRY_FAIL_CLOSED',
  npm_max_attempts: 3,
  npm_attempt_timeout_ms: 45000,
  npm_shrinkwrap_coverage: true,
  nested_npm_lock_trigger_coverage: true,
  complete_evidence_collection_before_terminal: true,
  security_job_timeout_minutes: 20,
  pip_network_timeout_seconds: 30,
  pip_retry_bound: 2,
  artifact_before_aggregate_terminal: true,
  mutation_cases_rejected: mutations.length,
  live_requests: 0,
  secret_material_read: false,
  autonomous_effect: 'The non-Production security auditor resolves from deterministic Python tooling and bounded fail-closed npm/pip controls without operator-selected versions or unbounded provider retries.',
  global_effect: 'Node, Python, secret and vulnerability-ownership evidence are collected independently before a single aggregate fail-closed terminal.',
  irreplaceable_value_effect: 'Complete component evidence is retained even when one external audit endpoint is unavailable.',
  transparency_effect: 'Lock digest, tool version, retry/timeout bounds, shrinkwrap coverage, component results and aggregate terminal state are machine-bound.',
  evidence_effect: 'NONE',
  empirical_gate_effect: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
};
console.log(JSON.stringify(result, null, 2));