#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  stableJson,
  validateCanonicalIdentityContract,
} from './classify-continuous-assurance-canonical-identity-v1.mjs';

const DEFAULT_CONTRACT = 'coordination/kidults/kpmo/continuous-assurance-canonical-identity-v1.json';
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const MAX_CANONICAL_ARTIFACT_BYTES = 4 * 1024 * 1024;
const CONSUMER_WORKFLOW_NAME = 'KIDULTS Platform Continuous Assurance V1';
const CONSUMER_WORKFLOW_PATH = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function required(value, code) {
  if (value === undefined || value === null || String(value).trim() === '') fail(code);
  return String(value).trim();
}

function positiveInteger(value, code) {
  const text = required(value, code);
  if (!POSITIVE_INTEGER_PATTERN.test(text)) fail(code, text);
  return Number(text);
}

function exactBoolean(value, code) {
  if (value !== true && value !== false) fail(code);
  return value;
}

function receiptDigestWithoutObservation(receipt) {
  const stable = structuredClone(receipt);
  delete stable.observed_at;
  delete stable.receipt_digest;
  return sha256(stableJson(stable));
}

function withReceiptDigest(stableReceipt, observedAt) {
  return {
    ...stableReceipt,
    observed_at: observedAt,
    receipt_digest: sha256(stableJson(stableReceipt)),
  };
}

function validateCurrent(raw, contract) {
  const current = {
    repository: required(raw.repository, 'CURRENT_REPOSITORY_REQUIRED'),
    source_sha: required(raw.source_sha, 'CURRENT_SOURCE_SHA_REQUIRED'),
    source_kind: required(raw.source_kind, 'CURRENT_SOURCE_KIND_REQUIRED'),
    trigger_event: required(raw.trigger_event, 'CURRENT_TRIGGER_EVENT_REQUIRED'),
    run_id: positiveInteger(raw.run_id, 'CURRENT_RUN_ID_REQUIRED'),
    run_attempt: positiveInteger(raw.run_attempt, 'CURRENT_RUN_ATTEMPT_REQUIRED'),
    canonical_key: required(raw.canonical_key, 'CURRENT_CANONICAL_KEY_REQUIRED'),
    canonical_input_digest: required(raw.canonical_input_digest, 'CURRENT_CANONICAL_INPUT_DIGEST_REQUIRED'),
    upstream_class: required(raw.upstream_class, 'CURRENT_UPSTREAM_CLASS_REQUIRED'),
    generation_discriminator: required(raw.generation_discriminator, 'CURRENT_GENERATION_REQUIRED'),
    classifier_contract_digest: required(raw.classifier_contract_digest, 'CURRENT_CONTRACT_DIGEST_REQUIRED'),
    classification_receipt_digest: required(raw.classification_receipt_digest, 'CURRENT_CLASSIFICATION_DIGEST_REQUIRED'),
    dedupe_eligible: exactBoolean(raw.dedupe_eligible, 'CURRENT_DEDUPE_ELIGIBLE_REQUIRED'),
    terminal_observation_non_dedupable: exactBoolean(raw.terminal_observation_non_dedupable, 'CURRENT_TERMINAL_OBSERVATION_REQUIRED'),
    special_exact_artifact_class: exactBoolean(raw.special_exact_artifact_class, 'CURRENT_SPECIAL_CLASS_REQUIRED'),
    ephemeral_actions_alias_eligible: exactBoolean(raw.ephemeral_actions_alias_eligible, 'CURRENT_EPHEMERAL_ELIGIBLE_REQUIRED'),
    upstream: raw.upstream || null,
  };
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(current.repository)) fail('CURRENT_REPOSITORY_INVALID');
  if (!SHA_PATTERN.test(current.source_sha)) fail('CURRENT_SOURCE_SHA_INVALID');
  for (const [name, value] of [
    ['CURRENT_CANONICAL_KEY_INVALID', current.canonical_key],
    ['CURRENT_CANONICAL_INPUT_DIGEST_INVALID', current.canonical_input_digest],
    ['CURRENT_CONTRACT_DIGEST_INVALID', current.classifier_contract_digest],
    ['CURRENT_CLASSIFICATION_DIGEST_INVALID', current.classification_receipt_digest],
  ]) if (!DIGEST_PATTERN.test(value)) fail(name);
  const eligibleClasses = contract.ephemeral_actions_alias_eligible_classes;
  const eligibilityExpected = current.trigger_event === 'workflow_run' &&
    current.run_attempt === 1 && current.dedupe_eligible &&
    !current.terminal_observation_non_dedupable && !current.special_exact_artifact_class &&
    eligibleClasses.includes(current.upstream_class) && current.upstream?.conclusion === 'success' &&
    current.upstream?.workflow_event !== 'workflow_dispatch' && Number(current.upstream?.workflow_run_attempt || 1) === 1;
  if (current.ephemeral_actions_alias_eligible !== eligibilityExpected) fail('CURRENT_EPHEMERAL_ELIGIBILITY_DIVERGENCE');
  current.canonical_artifact_name = contract.runtime_dedupe.ephemeral_actions_guard.canonical_leader_artifact_name_template
    .replace('{canonical_key_hex}', current.canonical_key.slice('sha256:'.length));
  return current;
}

function validateLeaderCandidate(candidate, current, observedAt) {
  const errors = [];
  const run = candidate?.run;
  const artifact = candidate?.artifact;
  const receipt = candidate?.receipt;
  const runId = Number(run?.id);
  const runAttempt = Number(run?.run_attempt);
  const artifactRunId = Number(artifact?.workflow_run?.id);
  const canonical = receipt?.execution?.canonical_identity;
  const push = (condition, code) => { if (!condition) errors.push(code); };
  push(Number.isSafeInteger(runId) && runId > 0, 'RUN_ID_INVALID');
  push(Number.isSafeInteger(runAttempt) && runAttempt > 0, 'RUN_ATTEMPT_INVALID');
  push(runId !== current.run_id, 'CURRENT_RUN_CANNOT_BE_LEADER');
  push(run?.name === CONSUMER_WORKFLOW_NAME, 'RUN_NAME_MISMATCH');
  push(run?.path === CONSUMER_WORKFLOW_PATH, 'RUN_PATH_MISMATCH');
  push(run?.repository?.full_name === current.repository, 'RUN_REPOSITORY_MISMATCH');
  push(run?.head_branch === 'main', 'RUN_BRANCH_MISMATCH');
  push(run?.event === 'workflow_run', 'RUN_EVENT_MISMATCH');
  push(run?.status === 'completed', 'RUN_STATUS_MISMATCH');
  push(run?.conclusion === 'success', 'RUN_CONCLUSION_MISMATCH');
  push(artifact?.name === current.canonical_artifact_name, 'ARTIFACT_NAME_MISMATCH');
  push(artifact?.expired === false, 'ARTIFACT_EXPIRED');
  push(Number.isSafeInteger(Number(artifact?.id)) && Number(artifact.id) > 0, 'ARTIFACT_ID_INVALID');
  push(Number.isSafeInteger(Number(artifact?.size_in_bytes)) && Number(artifact.size_in_bytes) > 0 &&
    Number(artifact.size_in_bytes) <= MAX_CANONICAL_ARTIFACT_BYTES, 'ARTIFACT_SIZE_INVALID');
  push(DIGEST_PATTERN.test(artifact?.digest || ''), 'ARTIFACT_DIGEST_INVALID');
  push(Number.isFinite(Date.parse(artifact?.expires_at || '')) && Date.parse(artifact.expires_at) > Date.parse(observedAt), 'ARTIFACT_EXPIRY_INVALID');
  push(artifactRunId === runId, 'ARTIFACT_RUN_ID_MISMATCH');
  push(artifact?.workflow_run?.head_sha === run?.head_sha, 'ARTIFACT_RUN_SHA_MISMATCH');
  push(receipt?.receipt_type === 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE', 'RECEIPT_TYPE_INVALID');
  push(DIGEST_PATTERN.test(receipt?.receipt_digest || ''), 'RECEIPT_DIGEST_FORMAT');
  push(receipt?.receipt_digest === receiptDigestWithoutObservation(receipt || {}), 'RECEIPT_DIGEST_MISMATCH');
  push(receipt?.source?.sha === current.source_sha && receipt?.source?.expected_sha === current.source_sha &&
    receipt?.source?.actual_sha === current.source_sha && receipt?.source?.match === true, 'RECEIPT_SOURCE_MISMATCH');
  push(String(receipt?.execution?.workflow_run_id) === String(runId), 'RECEIPT_RUN_ID_MISMATCH');
  push(String(receipt?.execution?.workflow_run_attempt) === String(runAttempt), 'RECEIPT_RUN_ATTEMPT_MISMATCH');
  push(receipt?.execution?.trigger === 'workflow_run', 'RECEIPT_TRIGGER_MISMATCH');
  push(receipt?.states?.internal_control_state === 'VERIFIED_PASS' &&
    receipt?.states?.promotion_eligible === false && receipt?.states?.release_state === 'HOLD', 'RECEIPT_CONTROL_STATE_INVALID');
  push(canonical?.canonical_key === current.canonical_key, 'CANONICAL_KEY_MISMATCH');
  push(canonical?.canonical_input_digest === current.canonical_input_digest, 'CANONICAL_INPUT_DIGEST_MISMATCH');
  push(canonical?.source_sha === current.source_sha, 'CANONICAL_SOURCE_MISMATCH');
  push(canonical?.upstream_class === current.upstream_class, 'CANONICAL_CLASS_MISMATCH');
  push(canonical?.generation_discriminator === current.generation_discriminator, 'CANONICAL_GENERATION_MISMATCH');
  push(canonical?.classifier_contract_digest === current.classifier_contract_digest, 'CANONICAL_CONTRACT_DIGEST_MISMATCH');
  push(canonical?.runtime_dedupe_state === 'REMOTE_LEDGER_ACTIVATION_HOLD', 'REMOTE_LEDGER_HOLD_MISSING');
  push(canonical?.canonical_execution_claimed === false, 'DURABLE_CLAIM_MUST_REMAIN_FALSE');
  push(canonical?.ephemeral_actions_leader === true, 'EPHEMERAL_LEADER_MISSING');
  push(canonical?.claim_scope === 'EPHEMERAL_ACTIONS_ARTIFACT_90_DAY', 'EPHEMERAL_CLAIM_SCOPE_MISMATCH');
  push(canonical?.alias === false, 'ALIAS_CANNOT_BE_LEADER');
  push(String(canonical?.canonical_run_id) === String(runId), 'CANONICAL_RUN_ID_MISMATCH');
  push(String(canonical?.canonical_run_attempt) === String(runAttempt), 'CANONICAL_RUN_ATTEMPT_MISMATCH');
  push(DIGEST_PATTERN.test(canonical?.classification_receipt_digest || ''), 'LEADER_CLASSIFICATION_DIGEST_INVALID');
  push(DIGEST_PATTERN.test(canonical?.ephemeral_guard_receipt_digest || ''), 'LEADER_GUARD_DIGEST_INVALID');
  return {
    valid: errors.length === 0,
    errors,
    summary: {
      run_id: Number.isSafeInteger(runId) ? runId : null,
      run_attempt: Number.isSafeInteger(runAttempt) ? runAttempt : null,
      artifact_id: Number.isSafeInteger(Number(artifact?.id)) ? Number(artifact.id) : null,
      artifact_digest: artifact?.digest || null,
      receipt_digest: receipt?.receipt_digest || null,
    },
  };
}

function baseGuard(current, readback, state, disposition, detail) {
  return {
    id: 'kidults-continuous-assurance-ephemeral-guard-receipt-v1',
    version: '1.0.0',
    state,
    repository: current.repository,
    source_sha: current.source_sha,
    canonical_key: current.canonical_key,
    canonical_input_digest: current.canonical_input_digest,
    upstream_class: current.upstream_class,
    generation_discriminator: current.generation_discriminator,
    classifier_contract_digest: current.classifier_contract_digest,
    classification_receipt_digest: current.classification_receipt_digest,
    alias_run_id: current.run_id,
    alias_run_attempt: current.run_attempt,
    canonical_artifact_name: current.canonical_artifact_name,
    readback,
    audit_execution_disposition: disposition,
    detail,
    runtime_dedupe_state: 'REMOTE_LEDGER_ACTIVATION_HOLD',
    canonical_execution_claimed: false,
    claim_scope: 'EPHEMERAL_ACTIONS_ARTIFACT_90_DAY',
    artifact_retention_days: 90,
    every_noncanonical_trigger_alias_receipt_guaranteed: false,
    pending_replacement_caveat: 'GITHUB_CONCURRENCY_ONE_RUNNING_ONE_PENDING_ADDITIONAL_PENDING_MAY_BE_REPLACED',
    durable_claim_created: false,
    detector_authority: 'READ_ONLY',
    repository_mutation_performed: false,
    external_mutation_performed: false,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'EXPLICIT_APPROVAL_REQUIRED',
  };
}

function aliasAuditReceipt(current, leader, observedAt) {
  const canonicalReceipt = leader.receipt;
  const canonicalRun = leader.run;
  const canonicalArtifact = leader.artifact;
  const stableReceipt = {
    schema_version: '1.0.0',
    receipt_type: 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE_ALIAS',
    source: {
      sha: current.source_sha,
      expected_sha: current.source_sha,
      actual_sha: current.source_sha,
      match: true,
      kind: current.source_kind,
      workflow_path: CONSUMER_WORKFLOW_PATH,
    },
    execution: {
      profile: 'CANONICAL_ALIAS_NO_AUDIT_EXECUTION',
      trigger: current.trigger_event,
      workflow_run_id: String(current.run_id),
      workflow_run_attempt: String(current.run_attempt),
      upstream: current.upstream,
      canonical_identity: {
        canonical_key: current.canonical_key,
        canonical_input_digest: current.canonical_input_digest,
        source_sha: current.source_sha,
        upstream_class: current.upstream_class,
        generation_discriminator: current.generation_discriminator,
        classifier_contract_digest: current.classifier_contract_digest,
        classification_receipt_digest: current.classification_receipt_digest,
        runtime_dedupe_state: 'REMOTE_LEDGER_ACTIVATION_HOLD',
        canonical_execution_claimed: false,
        ephemeral_actions_leader: false,
        alias: true,
        alias_run_id: current.run_id,
        alias_run_attempt: current.run_attempt,
        canonical_run_id: Number(canonicalRun.id),
        canonical_run_attempt: Number(canonicalRun.run_attempt),
        canonical_receipt_digest: canonicalReceipt.receipt_digest,
        canonical_artifact_id: Number(canonicalArtifact.id),
        canonical_artifact_name: canonicalArtifact.name,
        canonical_artifact_digest: canonicalArtifact.digest,
        canonical_artifact_expires_at: canonicalArtifact.expires_at,
        canonical_classification_receipt_digest: canonicalReceipt.execution.canonical_identity.classification_receipt_digest,
        claim_scope: 'EPHEMERAL_ACTIONS_ARTIFACT_90_DAY',
        durable_claim_created: false,
        audit_execution_disposition: 'DEDUPED_ALIAS_NO_FULL_AUDIT',
      },
    },
    states: {
      internal_control_state: 'VERIFIED_PASS',
      external_empirical_state: 'HOLD',
      release_state: 'HOLD',
      overall_state: 'HOLD',
      promotion_eligible: false,
    },
    checks: [{ id: 'EXACT_CANONICAL_RECEIPT_ALIAS', required: true, state: 'VERIFIED_PASS' }],
    unresolved_gates: [],
    evidence: [{
      kind: 'EPHEMERAL_ACTIONS_CANONICAL_ARTIFACT',
      artifact_id: Number(canonicalArtifact.id),
      artifact_name: canonicalArtifact.name,
      artifact_digest: canonicalArtifact.digest,
      canonical_receipt_digest: canonicalReceipt.receipt_digest,
      expires_at: canonicalArtifact.expires_at,
    }],
    empirical_truth_effect: {
      graded_delta: 0,
      human_review_delta: 0,
      dated_sold_delta: 0,
      candidate_or_evidence_created: false,
      track_b_started: false,
      projection_approved: false,
    },
    authority_boundary: {
      detector_authority: 'READ_ONLY',
      repository_mutation_performed: false,
      credentialed_external_mutation_performed: false,
      secret_material_read: false,
      production_or_g5_promoted: false,
    },
  };
  return withReceiptDigest(stableReceipt, observedAt);
}

function aliasRemediationPlan(aliasReceipt) {
  return {
    schema_version: '1.0.0',
    plan_type: 'KIDULTS_SAFE_REMEDIATION_PACKET',
    source_sha: aliasReceipt.source.sha,
    source_receipt_digest: aliasReceipt.receipt_digest,
    disposition: 'DEDUPED_ALIAS_NO_ACTION',
    failed_check_ids: [],
    integrity_findings: [],
    activation: { eligible: false, state: 'HOLD' },
    activation_eligible: false,
    direct_main_write: false,
    auto_merge: false,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'EXPLICIT_APPROVAL_REQUIRED',
  };
}

export function resolveEphemeralGuard(input, contract) {
  validateCanonicalIdentityContract(contract);
  const current = validateCurrent(input.current, contract);
  const observedAt = required(input.observed_at, 'OBSERVED_AT_REQUIRED');
  if (!Number.isFinite(Date.parse(observedAt))) fail('OBSERVED_AT_INVALID');
  const rawReadback = input.readback || {};
  const readback = {
    state: required(rawReadback.state, 'READBACK_STATE_REQUIRED'),
    total_count: Number(rawReadback.total_count || 0),
    returned_count: Number(rawReadback.returned_count || 0),
    reason_codes: Array.isArray(rawReadback.reason_codes) ? rawReadback.reason_codes.map(String).sort() : [],
  };
  const candidates = Array.isArray(input.candidates) ? input.candidates : fail('CANDIDATES_ARRAY_REQUIRED');

  if (!current.ephemeral_actions_alias_eligible) {
    const guard = withReceiptDigest(baseGuard(
      current, readback, 'FULL_AUDIT_BYPASS_NON_ALIASABLE',
      'EXECUTE_FULL_AUDIT_NON_DEDUPABLE_MANUAL_DIRECT_RERUN_OR_EXACT_BINDING',
      { candidate_count: candidates.length },
    ), observedAt);
    return { state: guard.state, execute_full_audit: true, ephemeral_actions_leader: false, fail_closed: false, guard };
  }

  if (readback.state !== 'COMPLETE' || readback.total_count !== readback.returned_count || readback.total_count !== candidates.length) {
    const guard = withReceiptDigest(baseGuard(
      current, readback, 'INPUT_DIVERGENCE_HOLD', 'FAIL_CLOSED_NO_ALIAS',
      { reason: 'CANONICAL_ARTIFACT_READBACK_INCOMPLETE', candidate_count: candidates.length },
    ), observedAt);
    return { state: guard.state, execute_full_audit: false, ephemeral_actions_leader: false, fail_closed: true, guard };
  }

  const activeCandidates = candidates.filter((candidate) => candidate?.artifact?.expired !== true);
  const validations = activeCandidates.map((candidate) => ({ candidate, validation: validateLeaderCandidate(candidate, current, observedAt) }));
  const invalid = validations.filter(({ validation }) => !validation.valid);
  if (invalid.length) {
    const guard = withReceiptDigest(baseGuard(
      current, readback, 'INPUT_DIVERGENCE_HOLD', 'FAIL_CLOSED_NO_ALIAS',
      { invalid_candidates: invalid.map(({ validation }) => ({ ...validation.summary, errors: validation.errors })) },
    ), observedAt);
    return { state: guard.state, execute_full_audit: false, ephemeral_actions_leader: false, fail_closed: true, guard };
  }

  if (validations.length > 1) {
    const guard = withReceiptDigest(baseGuard(
      current, readback, 'INPUT_DIVERGENCE_HOLD', 'FAIL_CLOSED_NO_ALIAS',
      { reason: 'MULTIPLE_VALID_CANONICAL_LEADERS', leaders: validations.map(({ validation }) => validation.summary) },
    ), observedAt);
    return { state: guard.state, execute_full_audit: false, ephemeral_actions_leader: false, fail_closed: true, guard };
  }

  if (validations.length === 0) {
    const guard = withReceiptDigest({
      ...baseGuard(current, readback, 'EPHEMERAL_CANONICAL_LEADER_SELECTED', 'EXECUTE_EPHEMERAL_CANONICAL_AUDIT', { candidate_count: 0 }),
      ephemeral_actions_leader: true,
      canonical_run_id: current.run_id,
      canonical_run_attempt: current.run_attempt,
    }, observedAt);
    return { state: guard.state, execute_full_audit: true, ephemeral_actions_leader: true, fail_closed: false, guard };
  }

  const leader = validations[0].candidate;
  const aliasReceipt = aliasAuditReceipt(current, leader, observedAt);
  const guard = withReceiptDigest({
    ...baseGuard(current, readback, 'DEDUPED_ALIAS', 'DEDUPED_ALIAS_NO_FULL_AUDIT', {
      canonical_run_id: Number(leader.run.id),
      canonical_run_attempt: Number(leader.run.run_attempt),
      canonical_artifact_id: Number(leader.artifact.id),
      canonical_artifact_digest: leader.artifact.digest,
      canonical_receipt_digest: leader.receipt.receipt_digest,
      alias_receipt_digest: aliasReceipt.receipt_digest,
    }),
    ephemeral_actions_leader: false,
    alias: true,
    canonical_run_id: Number(leader.run.id),
    canonical_run_attempt: Number(leader.run.run_attempt),
    canonical_artifact_id: Number(leader.artifact.id),
    canonical_artifact_digest: leader.artifact.digest,
    canonical_receipt_digest: leader.receipt.receipt_digest,
    alias_receipt_digest: aliasReceipt.receipt_digest,
  }, observedAt);
  return {
    state: guard.state,
    execute_full_audit: false,
    ephemeral_actions_leader: false,
    fail_closed: false,
    guard,
    alias_receipt: aliasReceipt,
    remediation_plan: aliasRemediationPlan(aliasReceipt),
  };
}

function parseArgs(argv) {
  const args = { contract: DEFAULT_CONTRACT, input: '', output: '', auditOutput: '', remediationOutput: '' };
  const mapping = {
    '--contract': 'contract', '--input': 'input', '--output': 'output',
    '--audit-output': 'auditOutput', '--remediation-output': 'remediationOutput',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!mapping[key]) fail('UNKNOWN_ARGUMENT', key);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail('ARGUMENT_VALUE_REQUIRED', key);
    args[mapping[key]] = value;
    index += 1;
  }
  for (const key of ['input', 'output', 'auditOutput', 'remediationOutput']) if (!args[key]) fail('ARGUMENT_REQUIRED', key);
  return args;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function emitEnvironment(result) {
  if (!process.env.GITHUB_ENV) return;
  const values = {
    KPMO_EXECUTE_FULL_AUDIT: String(result.execute_full_audit),
    KPMO_EPHEMERAL_ACTIONS_LEADER: String(result.ephemeral_actions_leader),
    KPMO_AUDIT_EXECUTION_DISPOSITION: result.guard.audit_execution_disposition,
    KPMO_EPHEMERAL_GUARD_RECEIPT_DIGEST: result.guard.receipt_digest,
    KPMO_CANONICAL_ARTIFACT_NAME: result.guard.canonical_artifact_name,
    KPMO_CANONICAL_LEADER_RUN_ID: result.guard.canonical_run_id || '',
    KPMO_CANONICAL_LEADER_RUN_ATTEMPT: result.guard.canonical_run_attempt || '',
    KPMO_CANONICAL_LEADER_RECEIPT_DIGEST: result.guard.canonical_receipt_digest || '',
    KPMO_CANONICAL_LEADER_ARTIFACT_DIGEST: result.guard.canonical_artifact_digest || '',
  };
  fs.appendFileSync(process.env.GITHUB_ENV, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const contract = JSON.parse(fs.readFileSync(args.contract, 'utf8'));
  const input = JSON.parse(fs.readFileSync(args.input, 'utf8'));
  const result = resolveEphemeralGuard(input, contract);
  writeJson(args.output, result.guard);
  if (result.alias_receipt) {
    writeJson(args.auditOutput, result.alias_receipt);
    writeJson(args.remediationOutput, result.remediation_plan);
  }
  emitEnvironment(result);
  process.stdout.write(`${JSON.stringify({
    state: result.state,
    execute_full_audit: result.execute_full_audit,
    ephemeral_actions_leader: result.ephemeral_actions_leader,
    fail_closed: result.fail_closed,
    canonical_key: result.guard.canonical_key,
    guard_receipt_digest: result.guard.receipt_digest,
    runtime_dedupe_state: result.guard.runtime_dedupe_state,
    production: result.guard.production,
  }, null, 2)}\n`);
  if (result.fail_closed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

export { MAX_CANONICAL_ARTIFACT_BYTES, receiptDigestWithoutObservation, sha256 };
