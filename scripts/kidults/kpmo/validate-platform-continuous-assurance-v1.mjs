#!/usr/bin/env node
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

for (const file of [workflowPath, policyPath, auditPath, plannerPath]) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`required file missing: ${file}`);
}

if (!errors.length) {
  const workflow = fs.readFileSync(path.join(root, workflowPath), 'utf8');
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
    'cancel-in-progress: false',
    '3d3c42e5aac5ba805825da76410c181273ba90b1',
    '820762786026740c76f36085b0efc47a31fe5020',
    'ea165f8d65b6e75b540449e92b4886f43607fa02',
    'retention-days: 90',
    'KPMO_SOURCE_SHA'
  ];
  for (const marker of requiredWorkflowMarkers) if (!workflow.includes(marker)) errors.push(`workflow marker missing: ${marker}`);
  for (const forbidden of ['pull_request_target:', 'contents: write', 'permissions: write-all', 'git push', 'gh pr merge', 'cancel-in-progress: true']) {
    if (workflow.includes(forbidden)) errors.push(`workflow forbidden marker: ${forbidden}`);
  }

  for (const marker of ['timeout:', 'finally', 'diagnostic_digest', 'diagnostic_persisted: false', 'overall_state', 'promotion_eligible: false', 'receipt_digest', 'safeChildEnv']) {
    if (!audit.includes(marker)) errors.push(`audit hardening marker missing: ${marker}`);
  }
  if (audit.includes('env: { ...process.env')) errors.push('audit must not inherit complete process.env');
  if (/from ['"]node:child_process['"]/.test(planner)) errors.push('planner must never execute subprocesses');

  if (policy.activation_state !== 'ACTIVATES_ON_PROTECTED_MAIN_LANDING') errors.push('activation must remain main-landing bound');
  if (policy.detector?.authority !== 'READ_ONLY') errors.push('detector must remain read-only');
  if (policy.immediate_improvement?.direct_main_write !== false) errors.push('direct main write must be false');
  if (policy.immediate_improvement?.auto_merge !== false) errors.push('auto merge must be false');
  if (policy.state_model?.generic_top_level_pass_forbidden !== true) errors.push('generic top-level PASS must be forbidden');
  if (!policy.hard_denies?.includes('PUBLIC_PRODUCTION_OR_G5_PROMOTION')) errors.push('release hard deny missing');

  const baseReceipt = {
    source: { sha: 'a'.repeat(40) },
    incident_id: 'sha256:test',
    checks: [{ id: 'CONTROL', required: true, state: 'VERIFIED_PASS' }],
    unresolved_gates: [{ id: 'G1', state: 'HOLD' }],
    states: {
      internal_control_state: 'VERIFIED_PASS',
      external_empirical_state: 'HOLD',
      release_state: 'HOLD',
      overall_state: 'HOLD'
    }
  };
  const holdPlan = planSafeRemediation(baseReceipt, policy);
  if (holdPlan.disposition !== 'AUTHORITY_HOLD_NO_AUTOMATIC_MUTATION') errors.push('internal PASS + external HOLD must remain authority HOLD');
  if (holdPlan.execution.workflow_repository_mutation_allowed !== false) errors.push('workflow repository mutation escaped');

  const failReceipt = structuredClone(baseReceipt);
  failReceipt.checks = [{ id: 'UNKNOWN_P0', required: true, state: 'VERIFIED_FAIL' }];
  failReceipt.states.internal_control_state = 'VERIFIED_FAIL';
  failReceipt.states.overall_state = 'RED';
  const failPlan = planSafeRemediation(failReceipt, policy);
  if (failPlan.disposition !== 'KPMO_ISOLATED_DRAFT_FIX_REQUIRED') errors.push('unknown internal failure must route to KPMO Draft fix');
  if (failPlan.execution.auto_merge !== false || failPlan.execution.direct_main_write !== false) errors.push('persistent fix authority escaped');

  const mismatch = structuredClone(baseReceipt);
  mismatch.states.overall_state = 'VERIFIED_PASS';
  try {
    planSafeRemediation(mismatch, policy);
    errors.push('false-green receipt escaped state derivation');
  } catch {}
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
