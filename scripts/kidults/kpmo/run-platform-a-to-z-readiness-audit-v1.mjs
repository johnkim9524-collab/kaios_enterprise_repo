#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-platform-az-'));
const sourcePoolOutput = path.join(tempRoot, 'source-pool');
const e2eOutput = path.join(tempRoot, 'bmw-r90s');

function run(id, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    maxBuffer: 32 * 1024 * 1024
  });
  return {
    id,
    state: result.status === 0 ? 'VERIFIED_PASS' : 'VERIFIED_FAIL',
    exit_code: result.status,
    signal: result.signal,
    diagnostic: String(result.stderr || result.stdout || '').trim().split(/\r?\n/).slice(-8)
  };
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

const checks = [
  run('FULL_VALUE_CHAIN_REDTEAM', 'node', ['scripts/kidults/kpmo/run-full-value-chain-redteam-suite-v1.mjs']),
  run('CRITICAL_GATE_BINDINGS', 'node', ['scripts/kidults/kpmo/validate-full-value-chain-critical-gate-bindings-v1.mjs']),
  run('STAGE_MACHINE_COVERAGE', 'node', ['scripts/kidults/kpmo/validate-full-value-chain-stage-machine-coverage-v1.mjs']),
  run('OPERATING_PRINCIPLES_RESILIENCE', 'node', ['scripts/kidults/kpmo/validate-operating-principles-resilience-v1.mjs']),
  run('ESTATE_ACTION_PINNING', 'node', ['scripts/kidults/kpmo/validate-estate-action-pinning-v1.mjs']),
  run('DEPENDENCY_BOOTSTRAP_LOCK', 'node', ['scripts/kidults/kpmo/validate-dependency-bootstrap-lock-v1.mjs']),
  run('PROVIDER_RIGHTS_DECISION_GATE', 'node', ['scripts/kidults/market/validate-provider-rights-decision-gate-v1.mjs']),
  run('PORTAL_LAUNCH_ASSURANCE', 'node', ['scripts/kidults/portal/validate-portal-launch-assurance-v1.mjs']),
  run('SERVER_PROJECTION_CAPABILITY', 'node', ['scripts/kidults/portal/validate-server-projection-capability-v1.mjs']),
  run('DIGITALOCEAN_READONLY_TRUTH', 'node', ['scripts/kidults/kpmo/validate-digitalocean-readonly-audit-truth-v1.mjs']),
  run('CANONICAL_PRODUCT_VERTICAL_SLICE', 'node', ['scripts/kidults/e2e/validate-canonical-product-vertical-slice-contract-v1.mjs']),
  run('GLOBAL_STANDARD_PREPRODUCTION', 'node', ['scripts/kidults/governance/validate-global-standard-preproduction-gate-v1.mjs']),
  run('VALUE_CHAIN_COMPLETION_SCORECARD', 'node', ['scripts/kidults/governance/validate-value-chain-completion-scorecard-v1.mjs'])
];

checks.push(run('SOURCE_POOL_FOUNDATION_BUILD', 'node', [
  'scripts/kidults/source-intelligence/build-scope-source-pool-readiness-v1.mjs',
  '--write', '--output', sourcePoolOutput
]));
checks.push(run('SOURCE_POOL_FOUNDATION_VALIDATE', 'node', [
  'scripts/kidults/source-intelligence/validate-scope-source-pool-readiness-v1.mjs',
  sourcePoolOutput
]));
checks.push(run('SYNTHETIC_FAIL_CLOSED_E2E_BUILD', 'node', [
  'scripts/kidults/e2e/build-bmw-r90s-failclosed-vertical-slice-v1.mjs', e2eOutput
]));
checks.push(run('SYNTHETIC_FAIL_CLOSED_E2E_VALIDATE', 'node', [
  'scripts/kidults/e2e/validate-bmw-r90s-failclosed-vertical-slice-v1.mjs', e2eOutput
]));

const preproduction = readJson('coordination/kidults/kpmo/global-standard-preproduction-gate-v1.json');
const portal = readJson('coordination/kidults/portal/portal-launch-assurance-v1.json');
const digitalocean = readJson('coordination/kidults/runtime/digitalocean-staging-portal-receipt-contract-v1.json');
const unresolvedGates = preproduction.required_gates
  .filter((gate) => gate.status !== 'PASS')
  .map((gate) => ({ id: gate.id, state: gate.status }));
const internalFailures = checks.filter((check) => check.state === 'VERIFIED_FAIL');

const report = {
  agent_id: 'KIDULTS_PLATFORM_A_TO_Z_AUDITOR',
  as_of: new Date().toISOString(),
  scope: 'REPOSITORY_INTERNAL_CONTROL_PLANE_AND_DECLARED_EXTERNAL_READINESS_BOUNDARIES',
  state: internalFailures.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
  facts: {
    internal_checks: checks.length,
    internal_checks_passed: checks.length - internalFailures.length,
    internal_checks_failed: internalFailures.length,
    preproduction_required_gates: preproduction.required_gates.length,
    preproduction_unresolved_gates: unresolvedGates.length,
    strict_completion_score: preproduction.current_empirical_truth.strict_completion_score,
    github_environment_trusted_execution: portal.external_evidence.github_environment_trusted_execution,
    digitalocean_staging_health_rollback: portal.external_evidence.digitalocean_staging_health_rollback,
    digitalocean_receipt_state: digitalocean.status,
    production: preproduction.production,
    public: portal.public,
    g5: portal.g5
  },
  checks,
  evidence_refs: [
    'scripts/kidults/kpmo/run-full-value-chain-redteam-suite-v1.mjs',
    'coordination/kidults/kpmo/global-standard-preproduction-gate-v1.json',
    'coordination/kidults/portal/portal-launch-assurance-v1.json',
    'coordination/kidults/runtime/digitalocean-staging-portal-receipt-contract-v1.json'
  ],
  uncertainties: [
    'GitHub hosted runner image build identity cannot be pinned by runs-on and requires execution receipts',
    'This repository-local audit does not manufacture external provider, human-review, remote-staging, or empirical evidence'
  ],
  blockers: unresolvedGates,
  next_action: internalFailures.length
    ? 'FIX_INTERNAL_FAILURES_BEFORE_ANY_EXTERNAL_EXECUTION'
    : 'EXECUTE_AUTHORIZED_EXTERNAL_GATES_IN_DECLARED_ORDER_WITH_IMMUTABLE_RECEIPTS',
  authority_boundary: {
    external_provider_called: false,
    remote_deployment_performed: false,
    secret_material_read: false,
    production_promoted: false
  },
  autonomous_effect: 'POSITIVE_REPLAYABLE_SINGLE_COMMAND_A_TO_Z_DIAGNOSIS',
  global_effect: 'POSITIVE_GLOBAL_SOURCE_POOL_AND_VALUE_CHAIN_BOUNDARIES_INCLUDED',
  irreplaceable_value_effect: 'POSITIVE_SYNTHETIC_E2E_AND_PROJECTION_TRUTH_BOUNDARIES_REPLAYED',
  transparency_effect: 'POSITIVE_INTERNAL_PASS_AND_EXTERNAL_HOLD_REPORTED_SEPARATELY'
};

console.log(JSON.stringify(report, null, 2));
fs.rmSync(tempRoot, { recursive: true, force: true });
if (internalFailures.length) process.exit(1);
