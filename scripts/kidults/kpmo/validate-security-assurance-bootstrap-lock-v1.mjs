import crypto from 'node:crypto';
import fs from 'node:fs';

const LOCK_PATH = 'requirements-security-assurance-pip-audit.lock.txt';
const WORKFLOW_PATH = '.github/workflows/kidults-security-assurance-empirical-r1.yml';
const EXPECTED_AUDITOR_VERSION = '2.10.1';
const EXPECTED_REQUIREMENT_COUNT = 29;

function fail(message) {
  throw new Error(message);
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

function validateLock(text) {
  const records = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
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

  if (packages.size !== EXPECTED_REQUIREMENT_COUNT) {
    fail(`LOCK_REQUIREMENT_COUNT:${packages.size}`);
  }
  if (packages.get('pip-audit')?.version !== EXPECTED_AUDITOR_VERSION) {
    fail('LOCK_PIP_AUDIT_VERSION_DRIFT');
  }
  if (!packages.has('pip')) fail('LOCK_PIP_BOOTSTRAP_MISSING');
  return packages;
}

function validateWorkflow(text) {
  const required = [
    'runs-on: ubuntu-24.04',
    "python-version: '3.11'",
    `PIP_AUDIT_LOCK: ${LOCK_PATH}`,
    `EXPECTED_PIP_AUDIT_VERSION: '${EXPECTED_AUDITOR_VERSION}'`,
    'node scripts/kidults/kpmo/validate-security-assurance-bootstrap-lock-v1.mjs',
    'python -m pip install --disable-pip-version-check --require-hashes --only-binary=:all: -r "$PIP_AUDIT_LOCK"',
    'python -m pip_audit --version',
    'python -m pip --version',
    'python -m pip_audit -r "$req"',
    'pip-audit-bootstrap.json',
    "pip_audit_bootstrap:read('pip-audit-bootstrap.json')",
  ];
  for (const marker of required) {
    if (!text.includes(marker)) fail(`WORKFLOW_BINDING_MISSING:${marker}`);
  }
  if (/pip\s+install[^\n]*\bpip-audit(?:\s|$)/i.test(text)) {
    fail('WORKFLOW_MUTABLE_DIRECT_PIP_AUDIT_INSTALL');
  }
  if (/^\s+pip-audit\s+-r\s/m.test(text)) {
    fail('WORKFLOW_UNBOUND_PIP_AUDIT_ENTRYPOINT');
  }
}

function expectRejected(label, operation) {
  try {
    operation();
  } catch {
    return;
  }
  fail(`MUTATION_NOT_REJECTED:${label}`);
}

const lock = fs.readFileSync(LOCK_PATH, 'utf8');
const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
const packages = validateLock(lock);
validateWorkflow(workflow);

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
  ['missing-receipt-binding', () => validateWorkflow(workflow.replace("pip_audit_bootstrap:read('pip-audit-bootstrap.json')", "pip_audit_bootstrap:null"))],
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
  mutation_cases_rejected: mutations.length,
  live_requests: 0,
  secret_material_read: false,
  autonomous_effect: 'The non-Production security auditor resolves from a deterministic bootstrap lock without an operator choosing tool versions.',
  global_effect: 'The lock target is explicit: ubuntu-24.04 x86_64 with CPython 3.11.',
  irreplaceable_value_effect: 'Repeatable dependency findings preserve the integrity of the governed assurance history.',
  transparency_effect: 'The lock digest, tool version, package count, and install mode are bound into the assurance receipt.',
  evidence_effect: 'NONE',
  empirical_gate_effect: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
};
console.log(JSON.stringify(result, null, 2));
