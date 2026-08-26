#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();

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

function receiptPayload(receipt) {
  const { observed_at: _observedAt, receipt_digest: _receiptDigest, ...payload } = receipt;
  return payload;
}

function fileDigest(relativePath) {
  return sha256(fs.readFileSync(path.join(root, relativePath)));
}

function safeRepoFile(relativePath) {
  const normalized = path.posix.normalize(relativePath || '');
  if (!normalized || normalized.startsWith('../') || path.isAbsolute(normalized)) return null;
  const absolute = path.resolve(root, normalized);
  if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`)) return null;
  try {
    const stat = fs.lstatSync(absolute);
    return stat.isFile() && !stat.isSymbolicLink() ? normalized : null;
  } catch {
    return null;
  }
}

function integrityFindings(receipt, policy, { verifyFileEvidence = true } = {}) {
  const findings = [];
  const computedReceiptDigest = sha256(stableJson(receiptPayload(receipt)));
  if (receipt.receipt_digest !== computedReceiptDigest) findings.push('RECEIPT_DIGEST_INVALID');

  const source = receipt.source || {};
  if (!/^[0-9a-f]{40}$/.test(source.expected_sha || '') ||
      !/^[0-9a-f]{40}$/.test(source.actual_sha || '') ||
      source.expected_sha !== source.actual_sha || source.match !== true || source.sha !== source.actual_sha) {
    findings.push('SOURCE_SHA_BINDING_INVALID');
  }

  const truth = receipt.empirical_truth_effect || {};
  if (truth.graded_delta !== 0 || truth.human_review_delta !== 0 || truth.dated_sold_delta !== 0 ||
      truth.candidate_or_evidence_created !== false || truth.track_b_started !== false || truth.projection_approved !== false) {
    findings.push('EMPIRICAL_TRUTH_TAMPER');
  }

  const authority = receipt.authority_boundary || {};
  if (authority.detector_authority !== 'READ_ONLY' || authority.repository_mutation_performed !== false ||
      authority.credentialed_external_mutation_performed !== false || authority.secret_material_read !== false ||
      authority.production_or_g5_promoted !== false) {
    findings.push('AUTHORITY_BOUNDARY_TAMPER');
  }
  if (receipt.states?.promotion_eligible !== false) findings.push('PROMOTION_BOUNDARY_TAMPER');
  if (receipt.fatal_error_digest || receipt.fatal_error_code) findings.push('FATAL_AUDIT_EXECUTION');

  if (verifyFileEvidence) {
    if (!Array.isArray(receipt.evidence) || receipt.evidence.length === 0) {
      findings.push('EVIDENCE_SET_MISSING');
    } else {
      for (const item of receipt.evidence) {
        const normalized = safeRepoFile(item?.path);
        if (!normalized) {
          findings.push('EVIDENCE_PATH_INVALID');
        } else if (item.digest !== fileDigest(normalized)) {
          findings.push('EVIDENCE_DIGEST_INVALID');
        }
      }
    }
    const safeWorkflowPath = safeRepoFile(source.workflow_path);
    if (!safeWorkflowPath || source.workflow_file_digest !== fileDigest(safeWorkflowPath)) {
      findings.push('WORKFLOW_DIGEST_INVALID');
    }
  }
  if (policy.immediate_improvement?.direct_main_write !== false || policy.immediate_improvement?.auto_merge !== false) {
    findings.push('POLICY_AUTHORITY_TAMPER');
  }
  return [...new Set(findings)].sort();
}

function worstState(receipt, hasFailures) {
  const states = receipt.states || {};
  if (hasFailures || states.internal_control_state !== 'VERIFIED_PASS') return 'RED';
  if (states.external_empirical_state !== 'VERIFIED_PASS') return 'HOLD';
  if (states.release_state !== 'VERIFIED_PASS') return 'HOLD';
  return 'VERIFIED_PASS';
}

export function planSafeRemediation(receipt, policy, options = {}) {
  const checkFailures = (receipt.checks || [])
    .filter((check) => check.required !== false && check.state !== 'VERIFIED_PASS')
    .map((check) => check.id)
    .sort();
  const integrity = integrityFindings(receipt, policy, options);
  let failedIds = [...new Set([...checkFailures, ...integrity])].sort();
  const expectedOverall = worstState(receipt, failedIds.length > 0);
  if (receipt.states?.overall_state !== expectedOverall ||
      receipt.states?.internal_control_state !== (failedIds.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS')) {
    failedIds = [...new Set([...failedIds, 'STATE_DERIVATION_TAMPER'])].sort();
  }
  const ephemeralPolicy = {
    SOURCE_POOL_FOUNDATION_BUILD: 'EPHEMERAL_SOURCE_POOL_PREREQUISITE',
    SOURCE_POOL_FOUNDATION_VALIDATE: 'EPHEMERAL_SOURCE_POOL_PREREQUISITE',
    SYNTHETIC_FAIL_CLOSED_E2E_BUILD: 'EPHEMERAL_SYNTHETIC_E2E_PREREQUISITE',
    SYNTHETIC_FAIL_CLOSED_E2E_VALIDATE: 'EPHEMERAL_SYNTHETIC_E2E_PREREQUISITE'
  };
  const checkById = new Map((receipt.checks || []).map((check) => [check.id, check]));
  const safeEphemeral = failedIds.filter((id) =>
    checkById.get(id)?.failure_class === 'MISSING_EPHEMERAL_PREREQUISITE' &&
    Boolean(policy.automatic_fix_allowlist?.[ephemeralPolicy[id]])
  );
  const persistent = failedIds.filter((id) => !safeEphemeral.includes(id));
  const externalHolds = (receipt.unresolved_gates || []).map((gate) => gate.id).sort();
  const attemptValue = process.env.KPMO_REMEDIATION_ATTEMPT;
  const attemptKnown = /^\d+$/.test(attemptValue || '');
  const currentAttempt = attemptKnown ? Number(attemptValue) : null;
  const remediationNeeded = persistent.length > 0 || safeEphemeral.length > 0;
  const disposition = persistent.length
    ? 'KPMO_ISOLATED_DRAFT_FIX_REQUIRED'
    : safeEphemeral.length
      ? 'EPHEMERAL_REBUILD_AND_REVALIDATE_ONLY'
      : externalHolds.length
        ? 'AUTHORITY_HOLD_NO_AUTOMATIC_MUTATION'
        : 'NO_ACTION';

  const stablePlan = {
    schema_version: '1.0.0',
    plan_type: 'KIDULTS_SAFE_REMEDIATION_PACKET',
    policy_id: policy.id,
    policy_version: policy.version,
    input_policy_digest: sha256(stableJson(policy)),
    source_receipt_digest: receipt.receipt_digest || 'UNAVAILABLE',
    computed_receipt_digest: sha256(stableJson(receiptPayload(receipt))),
    source_sha: receipt.source?.sha || 'UNAVAILABLE',
    incident_id: receipt.incident_id || 'UNAVAILABLE',
    disposition,
    failed_check_ids: failedIds,
    integrity_findings: integrity,
    ephemeral_revalidation_ids: safeEphemeral,
    persistent_fix_ids: persistent,
    external_authority_holds: externalHolds,
    execution: {
      workflow_repository_mutation_allowed: false,
      persistent_executor: policy.immediate_improvement.persistent_fix_executor,
      persistent_mode: policy.immediate_improvement.persistent_fix_mode,
      direct_main_write: false,
      auto_merge: false,
      production_or_g5_effect: 'NONE'
    },
    activation: {
      state: 'NOT_ACTIVE',
      eligible: false,
      merge_result_success_required: policy.closure.merge_result_success_required,
      protected_main_consecutive_successes_required: policy.closure.protected_main_consecutive_successes_required,
      independent_review_required: policy.closure.independent_review_required,
      rollback_manifest_required: policy.closure.rollback_manifest_required
    },
    circuit_breaker: {
      attempt_ledger_authority: policy.immediate_improvement.attempt_ledger_authority,
      max_attempts: policy.immediate_improvement.max_attempts_per_incident,
      opens_after_failed_attempts: policy.immediate_improvement.circuit_breaker_after_attempts,
      current_attempt: currentAttempt,
      state: !remediationNeeded
        ? 'NOT_APPLICABLE'
        : !attemptKnown
          ? 'ATTEMPT_LEDGER_REQUIRED_MANUAL_HOLD'
          : currentAttempt >= policy.immediate_improvement.circuit_breaker_after_attempts
            ? 'CIRCUIT_OPEN_MANUAL_HOLD'
            : 'CLOSED'
    },
    empirical_truth_effect: 'NONE'
  };
  return { ...stablePlan, plan_digest: sha256(stableJson(stablePlan)) };
}

function parseArgs(argv) {
  const config = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--receipt') config.receipt = path.resolve(argv[++i]);
    else if (argv[i] === '--policy') config.policy = path.resolve(argv[++i]);
    else if (argv[i] === '--output') config.output = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!config.receipt || !config.policy || !config.output) throw new Error('Required: --receipt, --policy, --output');
  return config;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const receipt = JSON.parse(fs.readFileSync(config.receipt, 'utf8'));
  const policy = JSON.parse(fs.readFileSync(config.policy, 'utf8'));
  const plan = planSafeRemediation(receipt, policy);
  fs.mkdirSync(path.dirname(config.output), { recursive: true });
  fs.writeFileSync(config.output, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(plan, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
