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
const canonicalContractPath = 'coordination/kidults/kpmo/continuous-assurance-canonical-identity-v1.json';
const classifierPath = 'scripts/kidults/kpmo/classify-continuous-assurance-canonical-identity-v1.mjs';
const resolverPath = 'scripts/kidults/kpmo/resolve-continuous-assurance-ephemeral-guard-v1.mjs';
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

for (const file of [workflowPath, policyPath, auditPath, plannerPath, canonicalContractPath, classifierPath, resolverPath]) {
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
    'KPMO_SOURCE_SHA',
    'ref: ${{ env.KPMO_SOURCE_SHA }}',
    'classify-canonical-identity:',
    'Resolve bounded ephemeral canonical leader or alias',
    'kidults-continuous-assurance-canonical-${KPMO_CANONICAL_KEY#sha256:}',
    'KPMO_EXECUTE_FULL_AUDIT',
    'KPMO_EPHEMERAL_ACTIONS_LEADER',
    'KPMO_EPHEMERAL_GUARD_RECEIPT_DIGEST',
    '-f name="$CANONICAL_ARTIFACT_NAME"',
    'ACTUAL_ARCHIVE_DIGEST',
    'CANONICAL_ARTIFACT_DIGEST_MISMATCH',
    'CANONICAL_ARTIFACT_UNSAFE_ARCHIVE_ENTRY',
    'validate-safe-zip-archive-v1.py',
    '--max-total-uncompressed-bytes',
    'observe-continuous-assurance-coverage-alias-v1.mjs',
    'COVERAGE_CANONICAL_ARTIFACT_ACTIVE_CARDINALITY',
    'REQUIREMENT_UPSTREAM_RUN_ATTEMPT',
    '/actions/runs/${CANONICAL_WORKFLOW_RUN_ID}',
    'canonical_artifact_workflow_run_id',
    'canonical_artifact_workflow_run_head_sha',
    'audit_source_sha:$auditSource',
    'coverage_canonical_source_sha:$canonicalSource',
    'coverage-semantic-input-receipt-v1.json',
    'semantic_input_receipt_file_digest:$semanticFileDigest',
    'semantic_input_receipt:$semantic[0]',
    'KPMO_COVERAGE_ALIAS_OBSERVATION',
    'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE_COVERAGE_ALIAS_OBSERVER',
    'zipinfo -1',
    'cancel-in-progress: false'
  ];
  for (const marker of requiredWorkflowMarkers) if (!activeWorkflow.includes(marker)) errors.push(`workflow marker missing: ${marker}`);
  if (!/- name: Run audit and always retain receipt\n\s+if: always\(\) && env\.KPMO_EXECUTE_FULL_AUDIT == 'true'/.test(activeWorkflow)) errors.push('full audit receipt step must run under always() only when the guard selects full audit');
  if (!/audit:\n[\s\S]*?concurrency:\n\s+group: \$\{\{ needs\.classify-canonical-identity\.outputs\.concurrency_group \}\}\n\s+cancel-in-progress: false/.test(activeWorkflow)) errors.push('canonical audit job concurrency binding missing');
  for (const forbidden of ['pull_request_target:', 'contents: write', 'permissions: write-all', 'git push', 'gh pr merge', 'cancel-in-progress: true', '-f head_sha=', "workflow_run.conclusion != 'success'", 'KPMO Trusted Merge Result Monotonicity V1', "github.event_name == 'workflow_run' && 'main'"]) {
    if (activeWorkflow.includes(forbidden)) errors.push(`workflow forbidden marker: ${forbidden}`);
  }
  if (activeWorkflow.includes('path: artifacts/kpmo/continuous-assurance/')) errors.push('bootstrap packet must not live in checkout-cleaned workspace');
  if (activeWorkflow.includes('set +e') || activeWorkflow.includes('exit 0')) errors.push('audit or planner failure must not be swallowed');
  for (const marker of ['plan.source_receipt_digest === receipt.receipt_digest', 'plan.integrity_findings?.length', 'plan.activation?.eligible === false']) {
    if (!activeWorkflow.includes(marker)) errors.push(`final fail-closed binding missing: ${marker}`);
  }
  const verifierIndex = activeWorkflow.indexOf('Preserve control result without promoting overall HOLD');
  const leaderUploadIndex = activeWorkflow.indexOf('Publish successful bounded canonical leader artifact');
  if (verifierIndex < 0 || leaderUploadIndex <= verifierIndex) errors.push('canonical leader artifact must publish only after final packet verification');
  if (/Publish successful bounded canonical leader artifact\n\s+if: always\(\)/.test(activeWorkflow)) errors.push('canonical leader artifact must never upload under always()');

  for (const marker of ['auditDeadline', 'finally', 'diagnostic_digest', 'diagnostic_persisted: false', 'overall_state', 'promotion_eligible: false', 'receipt_digest', 'safeChildEnv', 'SOURCE_SHA_BINDING', 'UPSTREAM_WORKFLOW_CONCLUSION', 'AUDIT_INPUT_TREE_IMMUTABILITY', 'AUDIT_EXECUTION_INPUT_IMMUTABILITY', 'finding_fingerprint', 'observation_id', 'runEphemeralPair', 'EPHEMERAL_REBUILD_EXHAUSTED', 'canonical_identity', 'canonical_key', 'canonical_input_digest', 'classifier_contract_digest', 'classification_receipt_digest', 'ephemeral_guard_receipt_digest', 'workflow_path', 'workflow_event', 'run_attempt', 'exact_binding_digest']) {
    if (!audit.includes(marker)) errors.push(`audit hardening marker missing: ${marker}`);
  }
  if (audit.includes('env: { ...process.env')) errors.push('audit must not inherit complete process.env');
  if (/const allowed = \[[^\]]*['"]HOME['"]/.test(audit)) errors.push('audit child must not inherit caller HOME');
  if (/const allowed = \[[^\]]*['"]NODE_OPTIONS['"]/.test(audit)) errors.push('audit child must not inherit caller NODE_OPTIONS');
  if (/from ['"]node:child_process['"]/.test(planner)) errors.push('planner must never execute subprocesses');
  for (const marker of ['source_receipt_digest', 'computed_receipt_digest', 'RECEIPT_DIGEST_INVALID', 'EMPIRICAL_TRUTH_TAMPER', 'PROMOTION_BOUNDARY_TAMPER', 'AUTHORITY_BOUNDARY_TAMPER', 'FATAL_AUDIT_EXECUTION']) {
    if (!planner.includes(marker)) errors.push(`planner integrity marker missing: ${marker}`);
  }

  if (policy.activation_state !== 'ACTIVE_WHEN_ON_PROTECTED_MAIN') errors.push('activation contract must remain conditional on protected-main presence');
  if (policy.detector?.authority !== 'READ_ONLY') errors.push('detector must remain read-only');
  if (policy.immediate_improvement?.direct_main_write !== false) errors.push('direct main write must be false');
  if (policy.immediate_improvement?.auto_merge !== false) errors.push('auto merge must be false');
  if (policy.immediate_improvement?.attempt_ledger_authority !== 'KPMO_EXTERNAL_INCIDENT_LEDGER') errors.push('circuit-breaker ledger authority drift');
  if (policy.state_model?.generic_top_level_pass_forbidden !== true) errors.push('generic top-level PASS must be forbidden');
  if (!policy.hard_denies?.includes('PUBLIC_PRODUCTION_OR_G5_PROMOTION')) errors.push('release hard deny missing');
  const expectedCoverageAliasBindings = [
    'exact_coverage_workflow_run',
    'exact_coverage_workflow_run_attempt_event_head_and_display_title',
    'exact_coverage_artifact_digest',
    'coverage_alias_receipt_digest',
    'canonical_input_digest',
    'coverage_canonical_source_sha_separate_from_audit_source_sha',
    'single_active_canonical_artifact',
    'canonical_artifact_digest',
    'canonical_artifact_workflow_run_id_and_head_sha',
    'canonical_workflow_run_id_attempt_name_path_repository_status_conclusion_head_and_display_title',
    'canonical_leader_receipt_digest',
    'canonical_semantic_receipt_exact_file_digest',
    'canonical_semantic_material_digest_recomputation',
  ];
  const coverageAliasBindingsExact = stableJson([...(policy.dedupe_control?.verified_coverage_upstream_alias_required_bindings || [])].sort()) === stableJson([...expectedCoverageAliasBindings].sort());
  if (policy.dedupe_control?.durable_runtime_state !== 'REMOTE_LEDGER_ACTIVATION_HOLD' ||
      policy.dedupe_control?.ephemeral_actions_guard_state !== 'ACTIVE_BOUNDED_90_DAY_NON_DURABLE' ||
      policy.dedupe_control?.success_only !== true ||
      policy.dedupe_control?.special_exact_artifact_classes_always_execute !== true ||
      policy.dedupe_control?.special_exact_artifact_classes_always_execute_exact_observer !== true ||
      policy.dedupe_control?.special_exact_artifact_classes_full_audit_default !== true ||
      policy.dedupe_control?.verified_coverage_upstream_alias_no_full_audit !== true ||
      !coverageAliasBindingsExact ||
      policy.dedupe_control?.manual_direct_rerun_and_non_success_always_execute !== true ||
      policy.dedupe_control?.canonical_execution_claimed_default !== false ||
      policy.dedupe_control?.concurrency_cancel_in_progress !== false ||
      policy.dedupe_control?.concurrency_pending_capacity !== 1 ||
      policy.dedupe_control?.additional_pending_runs_may_be_replaced !== true ||
      policy.dedupe_control?.every_noncanonical_trigger_alias_receipt_guaranteed !== false ||
      policy.dedupe_control?.fixed_leader_artifact_retention_days !== 90) errors.push('bounded dedupe control policy drift');

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
  activation_contract: 'ACTIVE_WHEN_ON_PROTECTED_MAIN',
  detector_authority: 'READ_ONLY',
  cadence: 'EVENT_DRIVEN_PLUS_30_MINUTE_WATCHDOG',
  same_head_cancellation: 'FORBIDDEN',
  exact_sha_checkout: 'REQUIRED_FOR_ALL_EVENTS',
  ephemeral_self_healing: 'ALLOWLIST_ONLY',
  persistent_fix: 'KPMO_ISOLATED_DRAFT_PR_ONLY',
  direct_main_write: false,
  auto_merge: false,
  empirical_gate_effect: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
