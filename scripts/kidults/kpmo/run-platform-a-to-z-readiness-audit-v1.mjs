#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const policyPath = 'coordination/kidults/kpmo/platform-continuous-assurance-v1.json';
const workflowPath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-platform-az-'));
const sourcePoolOutput = path.join(tempRoot, 'source-pool');
const e2eOutput = path.join(tempRoot, 'bmw-r90s');

function parseArgs(argv) {
  const config = { profile: 'deep', output: path.join(tempRoot, 'audit-receipt.json') };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--profile') config.profile = argv[++i];
    else if (argv[i] === '--output') config.output = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!['sentinel', 'deep'].includes(config.profile)) throw new Error(`Unsupported profile: ${config.profile}`);
  return config;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function fileDigest(relativePath) {
  return sha256(fs.readFileSync(path.join(root, relativePath)));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function sourceSha() {
  if (/^[0-9a-f]{40}$/i.test(process.env.KPMO_SOURCE_SHA || '')) return process.env.KPMO_SOURCE_SHA.toLowerCase();
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  return result.status === 0 ? result.stdout.trim() : 'UNAVAILABLE';
}

function safeChildEnv() {
  const allowed = ['PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'NODE_OPTIONS', 'PYTHON'];
  const env = Object.fromEntries(allowed.filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  return {
    ...env,
    HOME: tempRoot,
    CI: 'true',
    NODE_ENV: 'test',
    KPMO_AUDIT_NETWORK_MODE: 'UNPRIVILEGED'
  };
}

function run(id, command, args, timeoutMs = 600_000) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: safeChildEnv(),
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024
  });
  const diagnostic = String(result.error?.message || result.stderr || result.stdout || '')
    .replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._~+\/-]+=*)/gi, '[REDACTED]')
    .trim()
    .split(/\r?\n/)
    .slice(-12)
    .join('\n');
  const timedOut = result.error?.code === 'ETIMEDOUT';
  return {
    id,
    required: true,
    state: timedOut ? 'VERIFIED_FAIL_TIMEOUT' : result.status === 0 ? 'VERIFIED_PASS' : 'VERIFIED_FAIL',
    exit_code: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal || null,
    diagnostic_digest: sha256(diagnostic),
    diagnostic_persisted: false
  };
}

const sentinelChecks = [
  ['CONTINUOUS_ASSURANCE_CONTRACT', 'node', ['scripts/kidults/kpmo/validate-platform-continuous-assurance-v1.mjs']],
  ['WORKFLOW_REPOSITORY_MUTATION_BOUNDARY', 'node', ['scripts/kidults/kpmo/validate-workflow-repository-mutation-boundary-v1.mjs']],
  ['UNIFIED_AUDIT_CONTROL_PLANE', 'node', ['scripts/kidults/audit/validate-unified-audit-control-plane-v1.mjs']],
  ['CRITICAL_GATE_BINDINGS', 'node', ['scripts/kidults/kpmo/validate-full-value-chain-critical-gate-bindings-v1.mjs']],
  ['TRUSTED_CONTROL_DEPENDENCY_CLOSURE', 'node', ['scripts/kidults/kpmo/validate-trusted-control-dependency-closure-v1.mjs']],
  ['PROVIDER_RIGHTS_DECISION_GATE', 'node', ['scripts/kidults/market/validate-provider-rights-decision-gate-v1.mjs']]
];

const deepChecks = [
  ['FULL_VALUE_CHAIN_REDTEAM', 'node', ['scripts/kidults/kpmo/run-full-value-chain-redteam-suite-v1.mjs']],
  ['STAGE_MACHINE_COVERAGE', 'node', ['scripts/kidults/kpmo/validate-full-value-chain-stage-machine-coverage-v1.mjs']],
  ['OPERATING_PRINCIPLES_RESILIENCE', 'node', ['scripts/kidults/kpmo/validate-operating-principles-resilience-v1.mjs']],
  ['ESTATE_ACTION_PINNING', 'node', ['scripts/kidults/kpmo/validate-estate-action-pinning-v1.mjs']],
  ['DEPENDENCY_BOOTSTRAP_LOCK', 'node', ['scripts/kidults/kpmo/validate-dependency-bootstrap-lock-v1.mjs']],
  ['PORTAL_LAUNCH_ASSURANCE', 'node', ['scripts/kidults/portal/validate-portal-launch-assurance-v1.mjs']],
  ['SERVER_PROJECTION_CAPABILITY', 'node', ['scripts/kidults/portal/validate-server-projection-capability-v1.mjs']],
  ['DIGITALOCEAN_READONLY_TRUTH', 'node', ['scripts/kidults/kpmo/validate-digitalocean-readonly-audit-truth-v1.mjs']],
  ['CANONICAL_PRODUCT_VERTICAL_SLICE', 'node', ['scripts/kidults/e2e/validate-canonical-product-vertical-slice-contract-v1.mjs']],
  ['GLOBAL_STANDARD_PREPRODUCTION', 'node', ['scripts/kidults/governance/validate-global-standard-preproduction-gate-v1.mjs']],
  ['VALUE_CHAIN_COMPLETION_SCORECARD', 'node', ['scripts/kidults/governance/validate-value-chain-completion-scorecard-v1.mjs']]
];

const evidencePaths = [
  policyPath,
  'coordination/kidults/kpmo/global-standard-preproduction-gate-v1.json',
  'coordination/kidults/portal/portal-launch-assurance-v1.json',
  'coordination/kidults/runtime/digitalocean-staging-portal-receipt-contract-v1.json',
  'coordination/kidults/audit/unified-audit-control-plane-v1.json'
];

function writeReceipt(file, receipt) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

let exitCode = 1;
try {
  const config = parseArgs(process.argv.slice(2));
  const policy = readJson(policyPath);
  const preproduction = readJson('coordination/kidults/kpmo/global-standard-preproduction-gate-v1.json');
  const portal = readJson('coordination/kidults/portal/portal-launch-assurance-v1.json');
  const digitalocean = readJson('coordination/kidults/runtime/digitalocean-staging-portal-receipt-contract-v1.json');
  const checks = [...sentinelChecks, ...(config.profile === 'deep' ? deepChecks : [])]
    .map(([id, command, args]) => run(id, command, args));

  if (config.profile === 'deep') {
    checks.push(run('SOURCE_POOL_FOUNDATION_BUILD', 'node', [
      'scripts/kidults/source-intelligence/build-scope-source-pool-readiness-v1.mjs',
      '--write', '--output', sourcePoolOutput
    ]));
    checks.push(run('SOURCE_POOL_FOUNDATION_VALIDATE', 'node', [
      'scripts/kidults/source-intelligence/validate-scope-source-pool-readiness-v1.mjs', sourcePoolOutput
    ]));
    checks.push(run('SYNTHETIC_FAIL_CLOSED_E2E_BUILD', 'node', [
      'scripts/kidults/e2e/build-bmw-r90s-failclosed-vertical-slice-v1.mjs', e2eOutput
    ]));
    checks.push(run('SYNTHETIC_FAIL_CLOSED_E2E_VALIDATE', 'node', [
      'scripts/kidults/e2e/validate-bmw-r90s-failclosed-vertical-slice-v1.mjs', e2eOutput
    ]));
  }

  const failed = checks.filter((check) => check.state !== 'VERIFIED_PASS');
  const unresolvedGates = (preproduction.required_gates || [])
    .filter((gate) => gate.status !== 'PASS')
    .map((gate) => ({ id: gate.id, state: gate.status || 'UNKNOWN' }));
  const source = sourceSha();
  const incidentMaterial = stableJson({
    policy_version: policy.version,
    source_sha: source,
    failed_check_ids: failed.map((check) => check.id).sort(),
    unresolved_gate_ids: unresolvedGates.map((gate) => gate.id).sort()
  });
  const stableReceipt = {
    schema_version: '1.0.0',
    receipt_type: 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE',
    source: {
      sha: source,
      ref: process.env.GITHUB_REF || 'LOCAL',
      workflow_path: workflowPath,
      workflow_file_digest: fs.existsSync(workflowPath) ? fileDigest(workflowPath) : 'UNAVAILABLE'
    },
    execution: {
      profile: config.profile,
      trigger: process.env.GITHUB_EVENT_NAME || 'LOCAL',
      workflow_run_id: process.env.GITHUB_RUN_ID || 'LOCAL',
      workflow_run_attempt: process.env.GITHUB_RUN_ATTEMPT || '1'
    },
    states: {
      internal_control_state: failed.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
      external_empirical_state: unresolvedGates.length ? 'HOLD' : 'UNKNOWN_NOT_LIVE_VERIFIED',
      release_state: 'HOLD',
      overall_state: failed.length ? 'RED' : 'HOLD',
      promotion_eligible: false
    },
    checks,
    unresolved_gates: unresolvedGates,
    declared_external_boundaries: {
      github_environment_trusted_execution: portal.external_evidence?.github_environment_trusted_execution ?? 'UNKNOWN',
      digitalocean_staging_health_rollback: portal.external_evidence?.digitalocean_staging_health_rollback ?? 'UNKNOWN',
      digitalocean_receipt_state: digitalocean.status ?? 'UNKNOWN',
      production: 'HOLD',
      public: 'HOLD',
      g5: 'EXPLICIT_APPROVAL_REQUIRED'
    },
    empirical_truth_effect: {
      graded_delta: 0,
      human_review_delta: 0,
      dated_sold_delta: 0,
      candidate_or_evidence_created: false,
      track_b_started: false,
      projection_approved: false
    },
    evidence: evidencePaths.map((evidencePath) => ({ path: evidencePath, digest: fileDigest(evidencePath) })),
    incident_id: sha256(incidentMaterial),
    authority_boundary: {
      detector_authority: 'READ_ONLY',
      repository_mutation_performed: false,
      provider_or_remote_call_performed: false,
      secret_material_read: false,
      production_or_g5_promoted: false
    }
  };
  const receipt = {
    ...stableReceipt,
    observed_at: new Date().toISOString(),
    receipt_digest: sha256(stableJson(stableReceipt))
  };
  writeReceipt(config.output, receipt);
  console.log(JSON.stringify(receipt, null, 2));
  exitCode = failed.length ? 1 : 0;
} catch (error) {
  const config = (() => {
    try { return parseArgs(process.argv.slice(2)); } catch { return { output: path.join(tempRoot, 'audit-receipt.json') }; }
  })();
  const failure = {
    schema_version: '1.0.0',
    receipt_type: 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE',
    observed_at: new Date().toISOString(),
    states: {
      internal_control_state: 'VERIFIED_FAIL',
      external_empirical_state: 'HOLD',
      release_state: 'HOLD',
      overall_state: 'RED',
      promotion_eligible: false
    },
    fatal_error_digest: sha256(String(error?.message || error)),
    diagnostic_persisted: false,
    empirical_truth_effect: 'NONE',
    production: 'HOLD',
    public: 'HOLD',
    g5: 'EXPLICIT_APPROVAL_REQUIRED'
  };
  writeReceipt(config.output, failure);
  console.log(JSON.stringify(failure, null, 2));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

process.exit(exitCode);
