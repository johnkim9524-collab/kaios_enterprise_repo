#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { planSafeRemediation } from './plan-safe-remediation-v1.mjs';

const root = process.cwd();
const workflowPath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const policyPath = 'coordination/kidults/kpmo/platform-continuous-assurance-v1.json';
const auditPath = 'scripts/kidults/kpmo/run-platform-a-to-z-readiness-audit-v1.mjs';
const plannerPath = 'scripts/kidults/kpmo/plan-safe-remediation-v1.mjs';
const errors = [];

function activeWorkflowText(text) {
  return text
    .split('\n')
    .map((line) => {
      let quote = '';
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (quote) {
          if (char === quote && line[index - 1] !== '\\') quote = '';
        } else if (char === "'" || char === '"') {
          quote = char;
        } else if (char === '#' && (index === 0 || /\s/.test(line[index - 1]))) {
          return line.slice(0, index);
        }
      }
      return line;
    })
    .join('\n');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function signReceipt(receipt) {
  const { observed_at: _observedAt, receipt_digest: _receiptDigest, ...payload } = receipt;
  return {
    ...payload,
    observed_at: '2026-08-25T00:00:00.000Z',
    receipt_digest: `sha256:${crypto.createHash('sha256').update(stableJson(payload)).digest('hex')}`
  };
}

for (const file of [workflowPath, policyPath, auditPath, plannerPath]) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`required file missing: ${file}`);
}

if (!errors.length) {
  const workflow = fs.readFileSync(path.join(root, workflowPath), 'utf8');
  const activeWorkflow = activeWorkflowText(workflow);
  const audit = fs.readFileSync(path.join(root, auditPath), 'utf8');
  const planner = fs.readFileSync(path.join(root, plannerPath), 'utf8');
  const policy = JSON.parse(fs.readFileSync(path.join(root, policyPath), 'utf8'));

  const requiredWorkflowMarkers = [
    "cron: '17,47 * * * *'",
    'workflow_run:',
    'workflow_dispatch:',
    'pull_request:',
    'branches: [main]',
    'contents: read',
    'actions: read',
    'persist-credentials: false',
    'KIDULTS Trusted Merge Control Monotonicity',
    'github.event.workflow_run.repository.full_name == github.repository',
    "github.event.workflow_run.head_branch == 'main'",
    'KPMO_UPSTREAM_CONCLUSION',
    'KPMO_SOURCE_KIND',
    'KPMO_PACKET_SUFFIX',
    '${{ runner.temp }}',
    'Initialize fail-closed assurance packet',
    "'coordination/kidults/**'",
    "'scripts/kidults/**'",
    '3d3c42e5aac5ba805825da76410c181273ba90b1',
    '820762786026740c76f36085b0efc47a31fe5020',
    'ea165f8d65b6e75b540449e92b4886f43607fa02',
    'retention-days: 90',
    'KPMO_SOURCE_SHA'
  ];
  for (const marker of requiredWorkflowMarkers) if (!activeWorkflow.includes(marker)) errors.push(`workflow marker missing: ${marker}`);
  for (const forbidden of ['pull_request_target:', 'contents: write', 'permissions: write-all', 'git push', 'gh pr merge', 'concurrency:', "workflow_run.conclusion != 'success'", 'KPMO Trusted Merge Result Monotonicity V1']) {
    if (activeWorkflow.includes(forbidden)) errors.push(`workflow forbidden marker: ${forbidden}`);
  }
  if (activeWorkflow.includes('path: artifacts/kpmo/continuous-assurance/')) errors.push('bootstrap packet must not live in checkout-cleaned workspace');
  if (activeWorkflow.includes('set +e') || activeWorkflow.includes('exit 0')) errors.push('audit or planner failure must not be swallowed');
  for (const marker of ['p.source_receipt_digest!==r.receipt_digest', 'p.integrity_findings?.length', "p.activation?.eligible!==false"]) {
    if (!activeWorkflow.includes(marker)) errors.push(`final fail-closed binding missing: ${marker}`);
  }

  for (const marker of ['auditDeadline', 'finally', 'diagnostic_digest', 'diagnostic_persisted: false', 'overall_state', 'promotion_eligible: false', 'receipt_digest', 'safeChildEnv', 'SOURCE_SHA_BINDING', 'UPSTREAM_WORKFLOW_CONCLUSION', 'AUDIT_INPUT_TREE_IMMUTABILITY', 'AUDIT_EXECUTION_INPUT_IMMUTABILITY', 'finding_fingerprint', 'observation_id', 'runEphemeralPair', 'EPHEMERAL_REBUILD_EXHAUSTED']) {
    if (!audit.includes(marker)) errors.push(`audit hardening marker missing: ${marker}`);
  }
  if (audit.includes('env: { ...process.env')) errors.push('audit must not inherit complete process.env');
  if (/const allowed = \[[^\]]*['"]HOME['"]/.test(audit)) errors.push('audit child must not inherit caller HOME');
  if (/const allowed = \[[^\]]*['"]NODE_OPTIONS['"]/.test(audit)) errors.push('audit child must not inherit caller NODE_OPTIONS');
  if (/from ['"]node:child_process['"]/.test(planner)) errors.push('planner must never execute subprocesses');
  for (const marker of ['source_receipt_digest', 'computed_receipt_digest', 'RECEIPT_DIGEST_INVALID', 'EMPIRICAL_TRUTH_TAMPER', 'PROMOTION_BOUNDARY_TAMPER', 'AUTHORITY_BOUNDARY_TAMPER', 'FATAL_AUDIT_EXECUTION']) {
    if (!planner.includes(marker)) errors.push(`planner integrity marker missing: ${marker}`);
  }

  if (policy.activation_state !== 'DRAFT_RED_CONTAINED_NOT_ACTIVE') errors.push('activation must remain truthfully inactive before governed landing');
  if (policy.detector?.authority !== 'READ_ONLY') errors.push('detector must remain read-only');
  if (policy.immediate_improvement?.direct_main_write !== false) errors.push('direct main write must be false');
  if (policy.immediate_improvement?.auto_merge !== false) errors.push('auto merge must be false');
  if (policy.immediate_improvement?.attempt_ledger_authority !== 'KPMO_EXTERNAL_INCIDENT_LEDGER') errors.push('circuit-breaker ledger authority drift');
  if (policy.state_model?.generic_top_level_pass_forbidden !== true) errors.push('generic top-level PASS must be forbidden');
  if (!policy.hard_denies?.includes('PUBLIC_PRODUCTION_OR_G5_PROMOTION')) errors.push('release hard deny missing');

  let baseReceipt = {
    source: {
      sha: 'a'.repeat(40), expected_sha: 'a'.repeat(40), actual_sha: 'a'.repeat(40), match: true,
      workflow_path: workflowPath, workflow_file_digest: 'sha256:test'
    },
    incident_id: 'sha256:test',
    checks: [{ id: 'CONTROL', required: true, state: 'VERIFIED_PASS' }],
    unresolved_gates: [{ id: 'G1', state: 'HOLD' }],
    states: {
      internal_control_state: 'VERIFIED_PASS',
      external_empirical_state: 'HOLD',
      release_state: 'HOLD',
      overall_state: 'HOLD', promotion_eligible: false
    },
    empirical_truth_effect: {
      graded_delta: 0, human_review_delta: 0, dated_sold_delta: 0,
      candidate_or_evidence_created: false, track_b_started: false, projection_approved: false
    },
    authority_boundary: {
      detector_authority: 'READ_ONLY', repository_mutation_performed: false,
      credentialed_external_mutation_performed: false, secret_material_read: false,
      production_or_g5_promoted: false
    }
  };
  baseReceipt = signReceipt(baseReceipt);
  const holdPlan = planSafeRemediation(baseReceipt, policy, { verifyFileEvidence: false });
  if (holdPlan.disposition !== 'AUTHORITY_HOLD_NO_AUTOMATIC_MUTATION') errors.push('internal PASS + external HOLD must remain authority HOLD');
  if (holdPlan.execution.workflow_repository_mutation_allowed !== false) errors.push('workflow repository mutation escaped');
  if (holdPlan.source_receipt_digest !== baseReceipt.receipt_digest) errors.push('plan must bind exact source receipt digest');

  const failReceipt = structuredClone(baseReceipt);
  failReceipt.checks = [{ id: 'UNKNOWN_P0', required: true, state: 'VERIFIED_FAIL' }];
  failReceipt.states.internal_control_state = 'VERIFIED_FAIL';
  failReceipt.states.overall_state = 'RED';
  const failPlan = planSafeRemediation(signReceipt(failReceipt), policy, { verifyFileEvidence: false });
  if (failPlan.disposition !== 'KPMO_ISOLATED_DRAFT_FIX_REQUIRED') errors.push('unknown internal failure must route to KPMO Draft fix');
  if (failPlan.execution.auto_merge !== false || failPlan.execution.direct_main_write !== false) errors.push('persistent fix authority escaped');
  if (failPlan.circuit_breaker.state !== 'ATTEMPT_LEDGER_REQUIRED_MANUAL_HOLD') errors.push('missing attempt ledger must fail closed');

  const mismatch = structuredClone(baseReceipt);
  mismatch.states.overall_state = 'VERIFIED_PASS';
  const mismatchPlan = planSafeRemediation(signReceipt(mismatch), policy, { verifyFileEvidence: false });
  if (!mismatchPlan.failed_check_ids.includes('STATE_DERIVATION_TAMPER')) errors.push('false-green receipt escaped state derivation');

  const digestTamper = structuredClone(baseReceipt);
  digestTamper.source.actual_sha = 'b'.repeat(40);
  const digestPlan = planSafeRemediation(digestTamper, policy, { verifyFileEvidence: false });
  if (!digestPlan.integrity_findings.includes('RECEIPT_DIGEST_INVALID') || !digestPlan.integrity_findings.includes('SOURCE_SHA_BINDING_INVALID')) errors.push('receipt/source digest tamper escaped');

  const empiricalTamper = structuredClone(baseReceipt);
  empiricalTamper.empirical_truth_effect.graded_delta = 1;
  const empiricalPlan = planSafeRemediation(signReceipt(empiricalTamper), policy, { verifyFileEvidence: false });
  if (!empiricalPlan.integrity_findings.includes('EMPIRICAL_TRUTH_TAMPER')) errors.push('empirical truth tamper escaped');

  const promotionTamper = structuredClone(baseReceipt);
  promotionTamper.states.promotion_eligible = true;
  const promotionPlan = planSafeRemediation(signReceipt(promotionTamper), policy, { verifyFileEvidence: false });
  if (!promotionPlan.integrity_findings.includes('PROMOTION_BOUNDARY_TAMPER')) errors.push('promotion tamper escaped');

  const fatalReceipt = structuredClone(baseReceipt);
  fatalReceipt.fatal_error_code = 'BOOTSTRAP_NOT_COMPLETED';
  fatalReceipt.states.internal_control_state = 'VERIFIED_FAIL';
  fatalReceipt.states.overall_state = 'RED';
  fatalReceipt.checks = [];
  const fatalPlan = planSafeRemediation(signReceipt(fatalReceipt), policy, { verifyFileEvidence: false });
  if (fatalPlan.disposition !== 'KPMO_ISOLATED_DRAFT_FIX_REQUIRED' || !fatalPlan.failed_check_ids.includes('FATAL_AUDIT_EXECUTION')) errors.push('fatal receipt escaped as no-action');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE_V1',
  result: 'PASS',
  detector_authority: 'READ_ONLY',
  cadence: 'EVENT_DRIVEN_PLUS_30_MINUTE_WATCHDOG',
  same_head_cancellation: 'FORBIDDEN',
  ephemeral_self_healing: 'ALLOWLIST_ONLY',
  persistent_fix: 'KPMO_ISOLATED_DRAFT_PR_ONLY',
  direct_main_write: false,
  auto_merge: false,
  empirical_gate_effect: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
