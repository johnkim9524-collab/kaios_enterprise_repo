#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const policyPath = 'coordination/kidults/kpmo/platform-continuous-assurance-v1.json';
const canonicalIdentityContractPath = 'coordination/kidults/kpmo/continuous-assurance-canonical-identity-v1.json';
const workflowPath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-platform-az-'));
const sourcePoolOutput = path.join(tempRoot, 'source-pool');
const e2eOutput = path.join(tempRoot, 'bmw-r90s');
const auditDeadline = Date.now() + 35 * 60_000;

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

function repositoryStateDigest() {
  const result = spawnSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
    cwd: root, encoding: 'buffer', timeout: 10_000
  });
  return result.status === 0 ? sha256(result.stdout) : 'UNAVAILABLE';
}

function sourceIdentity() {
  const expected = /^[0-9a-f]{40}$/i.test(process.env.KPMO_SOURCE_SHA || '')
    ? process.env.KPMO_SOURCE_SHA.toLowerCase()
    : 'UNAVAILABLE';
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  const actual = result.status === 0 && /^[0-9a-f]{40}$/i.test(result.stdout.trim())
    ? result.stdout.trim().toLowerCase()
    : 'UNAVAILABLE';
  return { expected, actual, match: expected !== 'UNAVAILABLE' && expected === actual };
}

function safeChildEnv() {
  const allowed = ['PATH', 'TMPDIR', 'LANG', 'LC_ALL'];
  const env = Object.fromEntries(allowed.filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  return {
    ...env,
    HOME: tempRoot,
    CI: 'true',
    NODE_ENV: 'test',
    KPMO_AUDIT_NETWORK_MODE: 'UNPRIVILEGED'
  };
}

function staticCheck(id, pass, detail) {
  return {
    id,
    required: true,
    state: pass ? 'VERIFIED_PASS' : 'VERIFIED_FAIL',
    exit_code: pass ? 0 : 1,
    signal: null,
    diagnostic_digest: sha256(detail),
    diagnostic_persisted: false
  };
}

function run(id, command, args, timeoutMs = 90_000) {
  const remainingMs = auditDeadline - Date.now();
  if (remainingMs <= 1_000) {
    return staticCheck(id, false, 'GLOBAL_AUDIT_DEADLINE_EXHAUSTED');
  }
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: safeChildEnv(),
    timeout: Math.min(timeoutMs, remainingMs),
    maxBuffer: 32 * 1024 * 1024
  });
  const diagnostic = String(result.error?.message || result.stderr || result.stdout || '')
    .replace(/(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}|(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*|(?:api[_-]?key|password|token|secret)\s*[=:]\s*[^\s]+)/gi, '[REDACTED]')
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
  ['CONTINUOUS_ASSURANCE_CANONICAL_IDENTITY', 'node', ['scripts/kidults/kpmo/validate-continuous-assurance-canonical-identity-v1.mjs']],
  ['CONTINUOUS_ASSURANCE_EPHEMERAL_GUARD', 'node', ['scripts/kidults/kpmo/validate-continuous-assurance-ephemeral-guard-v1.mjs']],
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

const deepEphemeralChecks = [
  ['SOURCE_POOL_FOUNDATION_BUILD', 'node', [
    'scripts/kidults/source-intelligence/build-scope-source-pool-readiness-v1.mjs',
    '--write', '--output', sourcePoolOutput
  ]],
  ['SOURCE_POOL_FOUNDATION_VALIDATE', 'node', [
    'scripts/kidults/source-intelligence/validate-scope-source-pool-readiness-v1.mjs', sourcePoolOutput
  ]],
  ['SYNTHETIC_FAIL_CLOSED_E2E_BUILD', 'node', [
    'scripts/kidults/e2e/build-bmw-r90s-failclosed-vertical-slice-v1.mjs', e2eOutput
  ]],
  ['SYNTHETIC_FAIL_CLOSED_E2E_VALIDATE', 'node', [
    'scripts/kidults/e2e/validate-bmw-r90s-failclosed-vertical-slice-v1.mjs', e2eOutput
  ]]
];

const ephemeralPairs = [
  {
    id: 'SOURCE_POOL_FOUNDATION', output: sourcePoolOutput,
    build: deepEphemeralChecks[0], validate: deepEphemeralChecks[1]
  },
  {
    id: 'SYNTHETIC_FAIL_CLOSED_E2E', output: e2eOutput,
    build: deepEphemeralChecks[2], validate: deepEphemeralChecks[3]
  }
];

function runEphemeralPair(pair) {
  const execute = (attempt) => {
    const build = run(...pair.build);
    const validate = build.state === 'VERIFIED_PASS'
      ? run(...pair.validate)
      : {
          ...staticCheck(pair.validate[0], false, `${pair.id}:BUILD_FAILED_BEFORE_VALIDATE`),
          failure_class: 'EPHEMERAL_BUILD_PREREQUISITE_FAILED'
        };
    return {
      attempt,
      checks: [
        { ...build, remediation_attempt: attempt },
        { ...validate, remediation_attempt: attempt }
      ]
    };
  };
  const first = execute(1);
  if (first.checks.every((check) => check.state === 'VERIFIED_PASS')) {
    return { checks: first.checks, record: { id: pair.id, attempts: 1, recovered: false, persistent_effect: 'NONE' } };
  }
  fs.rmSync(pair.output, { recursive: true, force: true });
  const second = execute(2);
  const recovered = second.checks.every((check) => check.state === 'VERIFIED_PASS');
  const finalChecks = second.checks.map((check) => recovered ? check : {
    ...check,
    failure_class: 'EPHEMERAL_REBUILD_EXHAUSTED'
  });
  return {
    checks: finalChecks,
    record: {
      id: pair.id,
      attempts: 2,
      recovered,
      initial_state: first.checks.map((check) => ({ id: check.id, state: check.state })),
      persistent_effect: 'NONE'
    }
  };
}

const evidencePaths = [...new Set([
  policyPath,
  canonicalIdentityContractPath,
  'scripts/kidults/kpmo/classify-continuous-assurance-canonical-identity-v1.mjs',
  'scripts/kidults/kpmo/resolve-continuous-assurance-ephemeral-guard-v1.mjs',
  'scripts/kidults/kpmo/validate-continuous-assurance-canonical-identity-v1.mjs',
  'scripts/kidults/kpmo/validate-continuous-assurance-ephemeral-guard-v1.mjs',
  'scripts/kidults/kpmo/run-platform-a-to-z-readiness-audit-v1.mjs',
  'scripts/kidults/kpmo/plan-safe-remediation-v1.mjs',
  'scripts/kidults/kpmo/reconcile-continuous-assurance-inline-v1.mjs',
  'scripts/kidults/kpmo/reconcile-continuous-assurance-inline-v1.test.mjs',
  'scripts/kidults/kpmo/validate-platform-continuous-assurance-v1.mjs',
  ...[...sentinelChecks, ...deepChecks, ...deepEphemeralChecks].map((entry) => entry[2][0]),
  'coordination/kidults/kpmo/global-standard-preproduction-gate-v1.json',
  'coordination/kidults/portal/portal-launch-assurance-v1.json',
  'coordination/kidults/runtime/digitalocean-staging-portal-receipt-contract-v1.json',
  'coordination/kidults/audit/unified-audit-control-plane-v1.json'
])].sort();

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
  const identity = sourceIdentity();
  const inputEvidence = evidencePaths.map((evidencePath) => ({ path: evidencePath, digest: fileDigest(evidencePath) }));
  const inputWorkflowDigest = fs.existsSync(workflowPath) ? fileDigest(workflowPath) : 'UNAVAILABLE';
  const preAuditTreeDigest = repositoryStateDigest();
  const checks = [
    staticCheck('SOURCE_SHA_BINDING', identity.match, `${identity.expected}:${identity.actual}`)
  ];
  const ephemeralImprovements = [];
  if (process.env.KPMO_UPSTREAM_RUN_ID) {
    const upstreamIdentity = [
      process.env.KPMO_UPSTREAM_WORKFLOW_NAME || 'UNKNOWN',
      process.env.KPMO_UPSTREAM_RUN_ID,
      process.env.KPMO_UPSTREAM_REPOSITORY || 'UNKNOWN',
      process.env.KPMO_UPSTREAM_HEAD_BRANCH || 'UNKNOWN',
      process.env.KPMO_UPSTREAM_CONCLUSION || 'UNKNOWN'
    ].join(':');
    checks.push(staticCheck(
      'UPSTREAM_WORKFLOW_CONCLUSION',
      process.env.KPMO_UPSTREAM_CONCLUSION === 'success' &&
        process.env.KPMO_UPSTREAM_REPOSITORY === process.env.GITHUB_REPOSITORY &&
        process.env.KPMO_UPSTREAM_HEAD_BRANCH === 'main',
      upstreamIdentity
    ));
  }
  checks.push(...[...sentinelChecks, ...(config.profile === 'deep' ? deepChecks : [])]
    .map(([id, command, args]) => run(id, command, args)));

  if (config.profile === 'deep') {
    for (const pair of ephemeralPairs) {
      const result = runEphemeralPair(pair);
      checks.push(...result.checks);
      ephemeralImprovements.push(result.record);
    }
  }

  const postIdentity = sourceIdentity();
  checks.push(staticCheck(
    'POST_AUDIT_SOURCE_SHA_BINDING',
    postIdentity.match && postIdentity.actual === identity.actual,
    `${identity.actual}:${postIdentity.expected}:${postIdentity.actual}`
  ));
  const postAuditTreeDigest = repositoryStateDigest();
  checks.push(staticCheck(
    'AUDIT_INPUT_TREE_IMMUTABILITY',
    preAuditTreeDigest !== 'UNAVAILABLE' && preAuditTreeDigest === postAuditTreeDigest,
    `${preAuditTreeDigest}:${postAuditTreeDigest}`
  ));
  const postEvidence = evidencePaths.map((evidencePath) => ({ path: evidencePath, digest: fileDigest(evidencePath) }));
  checks.push(staticCheck(
    'AUDIT_EXECUTION_INPUT_IMMUTABILITY',
    stableJson(inputEvidence) === stableJson(postEvidence),
    `${sha256(stableJson(inputEvidence))}:${sha256(stableJson(postEvidence))}`
  ));

  const failed = checks.filter((check) => check.state !== 'VERIFIED_PASS');
  const unresolvedGates = (preproduction.required_gates || [])
    .filter((gate) => gate.status !== 'PASS')
    .map((gate) => ({ id: gate.id, state: gate.status || 'UNKNOWN' }));
  const findingMaterial = stableJson({
    policy_version: policy.version,
    failed_check_ids: failed.map((check) => check.id).sort(),
    unresolved_gate_ids: unresolvedGates.map((gate) => gate.id).sort()
  });
  const findingFingerprint = sha256(findingMaterial);
  const observationId = sha256(stableJson({
    finding_fingerprint: findingFingerprint,
    source_sha: identity.actual,
    workflow_run_id: process.env.GITHUB_RUN_ID || 'LOCAL',
    workflow_run_attempt: process.env.GITHUB_RUN_ATTEMPT || '1'
  }));
  const stableReceipt = {
    schema_version: '1.0.0',
    receipt_type: 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE',
    source: {
      sha: identity.actual,
      expected_sha: identity.expected,
      actual_sha: identity.actual,
      match: identity.match,
      kind: process.env.KPMO_SOURCE_KIND || 'UNKNOWN',
      pr_head_sha: process.env.KPMO_PR_HEAD_SHA || null,
      pr_base_sha: process.env.KPMO_PR_BASE_SHA || null,
      pr_merge_sha: process.env.KPMO_PR_MERGE_SHA || null,
      ref: process.env.GITHUB_REF || 'LOCAL',
      workflow_path: workflowPath,
      workflow_file_digest: inputWorkflowDigest
    },
    execution: {
      profile: config.profile,
      trigger: process.env.GITHUB_EVENT_NAME || 'LOCAL',
      workflow_run_id: process.env.GITHUB_RUN_ID || 'LOCAL',
      workflow_run_attempt: process.env.GITHUB_RUN_ATTEMPT || '1',
      upstream: process.env.KPMO_UPSTREAM_RUN_ID ? {
        run_id: process.env.KPMO_UPSTREAM_RUN_ID,
        run_attempt: process.env.KPMO_UPSTREAM_RUN_ATTEMPT || '1',
        workflow_name: process.env.KPMO_UPSTREAM_WORKFLOW_NAME || 'UNKNOWN',
        workflow_path: process.env.KPMO_UPSTREAM_WORKFLOW_PATH || 'UNKNOWN',
        workflow_event: process.env.KPMO_UPSTREAM_EVENT || 'UNKNOWN',
        conclusion: process.env.KPMO_UPSTREAM_CONCLUSION || 'UNKNOWN',
        repository: process.env.KPMO_UPSTREAM_REPOSITORY || 'UNKNOWN',
        head_branch: process.env.KPMO_UPSTREAM_HEAD_BRANCH || 'UNKNOWN',
        created_at: process.env.KPMO_UPSTREAM_CREATED_AT || null,
        exact_binding_digest: process.env.KPMO_UPSTREAM_BINDING_DIGEST || null,
        source_receipt_digest: process.env.KPMO_UPSTREAM_SOURCE_RECEIPT_DIGEST || null
      } : null,
      canonical_identity: {
        canonical_key: process.env.KPMO_CANONICAL_KEY || 'UNAVAILABLE',
        canonical_input_digest: process.env.KPMO_CANONICAL_INPUT_DIGEST || 'UNAVAILABLE',
        source_sha: identity.actual,
        upstream_class: process.env.KPMO_UPSTREAM_CLASS || 'UNAVAILABLE',
        generation_discriminator: process.env.KPMO_GENERATION_DISCRIMINATOR || 'UNAVAILABLE',
        classifier_contract_digest: process.env.KPMO_CLASSIFIER_CONTRACT_DIGEST || 'UNAVAILABLE',
        classification_receipt_digest: process.env.KPMO_CLASSIFICATION_RECEIPT_DIGEST || 'UNAVAILABLE',
        ephemeral_guard_receipt_digest: process.env.KPMO_EPHEMERAL_GUARD_RECEIPT_DIGEST || 'UNAVAILABLE',
        runtime_dedupe_state: 'REMOTE_LEDGER_ACTIVATION_HOLD',
        canonical_execution_claimed: false,
        ephemeral_actions_leader: process.env.KPMO_EPHEMERAL_ACTIONS_LEADER === 'true',
        alias: false,
        canonical_run_id: process.env.GITHUB_RUN_ID || 'LOCAL',
        canonical_run_attempt: process.env.GITHUB_RUN_ATTEMPT || '1',
        claim_scope: process.env.KPMO_EPHEMERAL_ACTIONS_LEADER === 'true'
          ? 'EPHEMERAL_ACTIONS_ARTIFACT_90_DAY'
          : 'NONE',
        durable_claim_created: false,
        audit_execution_disposition: process.env.KPMO_AUDIT_EXECUTION_DISPOSITION || 'EXECUTE_FULL_AUDIT'
      }
    },
    states: {
      internal_control_state: failed.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
      external_empirical_state: unresolvedGates.length ? 'HOLD' : 'UNKNOWN_NOT_LIVE_VERIFIED',
      release_state: 'HOLD',
      overall_state: failed.length ? 'RED' : 'HOLD',
      promotion_eligible: false
    },
    checks,
    ephemeral_improvements: ephemeralImprovements,
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
    evidence: inputEvidence,
    incident_id: findingFingerprint,
    finding_fingerprint: findingFingerprint,
    observation_id: observationId,
    authority_boundary: {
      detector_authority: 'READ_ONLY',
      repository_mutation_performed: false,
      credentialed_external_mutation_performed: false,
      external_network_isolation: 'NOT_ENFORCED_UNKNOWN_READS',
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
  const identity = sourceIdentity();
  const stableFailure = {
    schema_version: '1.0.0',
    receipt_type: 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE',
    source: {
      sha: identity.actual,
      expected_sha: identity.expected,
      actual_sha: identity.actual,
      match: identity.match,
      kind: process.env.KPMO_SOURCE_KIND || 'UNKNOWN'
    },
    execution: {
      trigger: process.env.GITHUB_EVENT_NAME || 'LOCAL',
      workflow_run_id: process.env.GITHUB_RUN_ID || 'LOCAL',
      workflow_run_attempt: process.env.GITHUB_RUN_ATTEMPT || '1',
      upstream: process.env.KPMO_UPSTREAM_RUN_ID ? {
        run_id: process.env.KPMO_UPSTREAM_RUN_ID,
        run_attempt: process.env.KPMO_UPSTREAM_RUN_ATTEMPT || '1',
        workflow_name: process.env.KPMO_UPSTREAM_WORKFLOW_NAME || 'UNKNOWN',
        workflow_path: process.env.KPMO_UPSTREAM_WORKFLOW_PATH || 'UNKNOWN',
        workflow_event: process.env.KPMO_UPSTREAM_EVENT || 'UNKNOWN',
        conclusion: process.env.KPMO_UPSTREAM_CONCLUSION || 'UNKNOWN',
        created_at: process.env.KPMO_UPSTREAM_CREATED_AT || null,
        exact_binding_digest: process.env.KPMO_UPSTREAM_BINDING_DIGEST || null,
        source_receipt_digest: process.env.KPMO_UPSTREAM_SOURCE_RECEIPT_DIGEST || null
      } : null,
      canonical_identity: {
        canonical_key: process.env.KPMO_CANONICAL_KEY || 'UNAVAILABLE',
        canonical_input_digest: process.env.KPMO_CANONICAL_INPUT_DIGEST || 'UNAVAILABLE',
        source_sha: identity.actual,
        upstream_class: process.env.KPMO_UPSTREAM_CLASS || 'UNAVAILABLE',
        generation_discriminator: process.env.KPMO_GENERATION_DISCRIMINATOR || 'UNAVAILABLE',
        classifier_contract_digest: process.env.KPMO_CLASSIFIER_CONTRACT_DIGEST || 'UNAVAILABLE',
        classification_receipt_digest: process.env.KPMO_CLASSIFICATION_RECEIPT_DIGEST || 'UNAVAILABLE',
        ephemeral_guard_receipt_digest: process.env.KPMO_EPHEMERAL_GUARD_RECEIPT_DIGEST || 'UNAVAILABLE',
        runtime_dedupe_state: 'REMOTE_LEDGER_ACTIVATION_HOLD',
        canonical_execution_claimed: false,
        ephemeral_actions_leader: false,
        alias: false,
        canonical_run_id: process.env.GITHUB_RUN_ID || 'LOCAL',
        canonical_run_attempt: process.env.GITHUB_RUN_ATTEMPT || '1',
        claim_scope: 'NONE',
        durable_claim_created: false,
        audit_execution_disposition: process.env.KPMO_AUDIT_EXECUTION_DISPOSITION || 'EXECUTE_FULL_AUDIT_FAILED'
      }
    },
    states: {
      internal_control_state: 'VERIFIED_FAIL',
      external_empirical_state: 'HOLD',
      release_state: 'HOLD',
      overall_state: 'RED',
      promotion_eligible: false
    },
    checks: [{ id: 'FATAL_AUDIT_EXECUTION', required: true, state: 'VERIFIED_FAIL' }],
    unresolved_gates: [],
    evidence: [],
    fatal_error_digest: sha256(String(error?.message || error)),
    diagnostic_persisted: false,
    empirical_truth_effect: {
      graded_delta: 0,
      human_review_delta: 0,
      dated_sold_delta: 0,
      candidate_or_evidence_created: false,
      track_b_started: false,
      projection_approved: false
    },
    authority_boundary: {
      detector_authority: 'READ_ONLY',
      repository_mutation_performed: false,
      credentialed_external_mutation_performed: false,
      secret_material_read: false,
      production_or_g5_promoted: false
    },
    production: 'HOLD', public: 'HOLD', g5: 'EXPLICIT_APPROVAL_REQUIRED'
  };
  const failure = {
    ...stableFailure,
    observed_at: new Date().toISOString(),
    receipt_digest: sha256(stableJson(stableFailure))
  };
  writeReceipt(config.output, failure);
  console.log(JSON.stringify(failure, null, 2));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

process.exit(exitCode);
