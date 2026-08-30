#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const WORKFLOW_NAME = 'KIDULTS ASI Requirement-to-Adapter Coverage v1';
const WORKFLOW_PATH = '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml';
const UPSTREAM_CLASS = 'ASI_AUTONOMOUS_RESOLUTION';
const CLAIM_SCOPE = 'EPHEMERAL_ACTIONS_ARTIFACT_90_DAY';
const REMOTE_STATE = 'REMOTE_LEDGER_ACTIVATION_HOLD';
const MAX_LEADER_ARTIFACT_BYTES = 4 * 1024 * 1024;

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
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
  if (!POSITIVE_INTEGER.test(text)) fail(code, text);
  return Number(text);
}

function exactBoolean(value, code) {
  if (value !== true && value !== false) fail(code);
  return value;
}

function receiptDigest(receipt) {
  const unsigned = structuredClone(receipt);
  delete unsigned.observed_at;
  delete unsigned.receipt_digest;
  return sha256(stableJson(unsigned));
}

function signReceipt(stableReceipt, observedAt) {
  return { ...stableReceipt, observed_at: observedAt, receipt_digest: sha256(stableJson(stableReceipt)) };
}

function validateObservedAt(value) {
  const observedAt = required(value, 'OBSERVED_AT_REQUIRED');
  if (!Number.isFinite(Date.parse(observedAt))) fail('OBSERVED_AT_INVALID');
  return observedAt;
}

function validateCurrent(raw) {
  const current = {
    repository: required(raw.repository, 'CURRENT_REPOSITORY_REQUIRED'),
    trigger_event: required(raw.trigger_event, 'CURRENT_TRIGGER_EVENT_REQUIRED'),
    run_id: positiveInteger(raw.run_id, 'CURRENT_RUN_ID_REQUIRED'),
    run_attempt: positiveInteger(raw.run_attempt, 'CURRENT_RUN_ATTEMPT_REQUIRED'),
    source_sha: required(raw.source_sha, 'CURRENT_SOURCE_SHA_REQUIRED'),
    upstream_class: required(raw.upstream_class, 'CURRENT_UPSTREAM_CLASS_REQUIRED'),
    canonical_run_key: required(raw.canonical_run_key, 'CURRENT_CANONICAL_RUN_KEY_REQUIRED'),
    canonical_input_digest: required(raw.canonical_input_digest, 'CURRENT_CANONICAL_INPUT_DIGEST_REQUIRED'),
    semantic_input_receipt_digest: required(raw.semantic_input_receipt_digest, 'CURRENT_SEMANTIC_INPUT_RECEIPT_DIGEST_REQUIRED'),
    canonical_contract_digest: required(raw.canonical_contract_digest, 'CURRENT_CONTRACT_DIGEST_REQUIRED'),
    upstream_binding_digest: required(raw.upstream_binding_digest, 'CURRENT_UPSTREAM_BINDING_DIGEST_REQUIRED'),
    upstream_workflow_run_id: positiveInteger(raw.upstream_workflow_run_id, 'CURRENT_UPSTREAM_RUN_ID_REQUIRED'),
    upstream_artifact_id: positiveInteger(raw.upstream_artifact_id, 'CURRENT_UPSTREAM_ARTIFACT_ID_REQUIRED'),
    upstream_artifact_digest: required(raw.upstream_artifact_digest, 'CURRENT_UPSTREAM_ARTIFACT_DIGEST_REQUIRED'),
    coverage_consumer_sha: required(raw.coverage_consumer_sha, 'CURRENT_COVERAGE_CONSUMER_SHA_REQUIRED'),
    coverage_run_head_sha: required(raw.coverage_run_head_sha, 'CURRENT_COVERAGE_RUN_HEAD_SHA_REQUIRED'),
    coverage_run_display_title: required(raw.coverage_run_display_title, 'CURRENT_COVERAGE_RUN_DISPLAY_TITLE_REQUIRED'),
  };
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(current.repository)) fail('CURRENT_REPOSITORY_INVALID');
  if (!['workflow_run', 'workflow_dispatch'].includes(current.trigger_event)) fail('CURRENT_TRIGGER_EVENT_INVALID');
  if (!SHA.test(current.source_sha)) fail('CURRENT_SOURCE_SHA_INVALID');
  if (current.upstream_class !== UPSTREAM_CLASS) fail('CURRENT_UPSTREAM_CLASS_INVALID');
  if (current.canonical_run_key !== `${current.source_sha}:${UPSTREAM_CLASS}`) fail('CURRENT_CANONICAL_RUN_KEY_INVALID');
  for (const [code, value] of [
    ['CURRENT_CANONICAL_INPUT_DIGEST_INVALID', current.canonical_input_digest],
    ['CURRENT_SEMANTIC_INPUT_RECEIPT_DIGEST_INVALID', current.semantic_input_receipt_digest],
    ['CURRENT_CONTRACT_DIGEST_INVALID', current.canonical_contract_digest],
    ['CURRENT_UPSTREAM_BINDING_DIGEST_INVALID', current.upstream_binding_digest],
    ['CURRENT_UPSTREAM_ARTIFACT_DIGEST_INVALID', current.upstream_artifact_digest],
  ]) if (!DIGEST.test(value)) fail(code);
  if (!SHA.test(current.coverage_consumer_sha) || !SHA.test(current.coverage_run_head_sha) ||
      current.coverage_consumer_sha !== current.coverage_run_head_sha) fail('CURRENT_COVERAGE_RUN_SHA_INVALID');
  const expectedDisplayTitle = current.trigger_event === 'workflow_run'
    ? `KIDULTS Coverage / source-${current.source_sha}`
    : `KIDULTS Coverage / manual-${current.run_id}`;
  if (current.coverage_run_display_title !== expectedDisplayTitle) fail('CURRENT_COVERAGE_RUN_DISPLAY_TITLE_INVALID');
  current.canonical_artifact_name = `kidults-asi-requirement-adapter-coverage-canonical-${sha256(current.canonical_run_key).slice(7)}`;
  return current;
}

function validateLeaderCandidate(candidate, current, observedAt) {
  const errors = [];
  const push = (condition, code) => { if (!condition) errors.push(code); };
  const artifact = candidate?.artifact;
  const run = candidate?.run;
  const receipt = candidate?.receipt;
  const semantic = candidate?.semantic_input_receipt;
  const semanticFileDigest = candidate?.semantic_input_receipt_file_digest;
  let semanticMaterialDigest = null;
  try {
    if (semantic?.material !== undefined) semanticMaterialDigest = sha256(stableJson(semantic.material));
  } catch {
    semanticMaterialDigest = null;
  }
  const runId = Number(run?.id);
  const runAttempt = Number(run?.run_attempt);
  push(Number.isSafeInteger(runId) && runId > 0, 'RUN_ID_INVALID');
  push(Number.isSafeInteger(runAttempt) && runAttempt > 0, 'RUN_ATTEMPT_INVALID');
  push(runId !== current.run_id, 'CURRENT_RUN_CANNOT_BE_PRIOR_LEADER');
  push(run?.name === WORKFLOW_NAME, 'RUN_NAME_MISMATCH');
  push(run?.path === WORKFLOW_PATH, 'RUN_PATH_MISMATCH');
  push(run?.repository?.full_name === current.repository, 'RUN_REPOSITORY_MISMATCH');
  push(run?.head_branch === 'main', 'RUN_BRANCH_MISMATCH');
  push(SHA.test(run?.head_sha || ''), 'RUN_HEAD_SHA_INVALID');
  push(run?.display_title === `KIDULTS Coverage / source-${current.source_sha}`, 'RUN_DISPLAY_TITLE_MISMATCH');
  push(run?.event === 'workflow_run', 'RUN_EVENT_MISMATCH');
  push(run?.status === 'completed' && run?.conclusion === 'success', 'RUN_NOT_SUCCESSFUL');
  push(artifact?.name === current.canonical_artifact_name, 'ARTIFACT_NAME_MISMATCH');
  push(artifact?.expired === false, 'ARTIFACT_EXPIRED');
  push(Number.isSafeInteger(Number(artifact?.id)) && Number(artifact.id) > 0, 'ARTIFACT_ID_INVALID');
  push(Number.isSafeInteger(Number(artifact?.size_in_bytes)) && Number(artifact.size_in_bytes) > 0 &&
    Number(artifact.size_in_bytes) <= MAX_LEADER_ARTIFACT_BYTES, 'ARTIFACT_SIZE_INVALID');
  push(DIGEST.test(artifact?.digest || ''), 'ARTIFACT_DIGEST_INVALID');
  push(Number.isFinite(Date.parse(artifact?.expires_at || '')) && Date.parse(artifact.expires_at) > Date.parse(observedAt), 'ARTIFACT_EXPIRY_INVALID');
  push(Number(artifact?.workflow_run?.id) === runId && artifact?.workflow_run?.head_sha === run?.head_sha, 'ARTIFACT_RUN_BINDING_MISMATCH');
  push(receipt?.id === 'kidults-asi-requirement-adapter-coverage-canonical-leader-receipt-v1', 'RECEIPT_ID_INVALID');
  push(receipt?.version === '1.0.0', 'RECEIPT_VERSION_INVALID');
  push(receipt?.state === 'VERIFIED_PASS_EPHEMERAL_CANONICAL_LEADER', 'RECEIPT_STATE_INVALID');
  push(DIGEST.test(receipt?.receipt_digest || '') && receipt?.receipt_digest === receiptDigest(receipt || {}), 'RECEIPT_DIGEST_INVALID');
  push(receipt?.repository === current.repository, 'RECEIPT_REPOSITORY_MISMATCH');
  push(receipt?.source_sha === current.source_sha && receipt?.upstream_class === UPSTREAM_CLASS, 'RECEIPT_SOURCE_CLASS_MISMATCH');
  push(receipt?.canonical_run_key === current.canonical_run_key, 'RECEIPT_CANONICAL_KEY_MISMATCH');
  push(receipt?.canonical_input_digest === current.canonical_input_digest, 'RECEIPT_CANONICAL_INPUT_DIVERGENCE');
  push(receipt?.semantic_input_receipt_digest === current.semantic_input_receipt_digest, 'RECEIPT_SEMANTIC_INPUT_RECEIPT_DIVERGENCE');
  push(DIGEST.test(semanticFileDigest || '') && semanticFileDigest === receipt?.semantic_input_receipt_digest &&
    semanticFileDigest === current.semantic_input_receipt_digest, 'SEMANTIC_INPUT_FILE_DIGEST_DIVERGENCE');
  push(semantic?.id === 'kidults-asi-requirement-adapter-coverage-semantic-input-receipt-v1' &&
    semantic?.version === '1.0.0' && semantic?.state === 'VERIFIED_PASS_SEMANTIC_INPUT_BOUND', 'SEMANTIC_INPUT_RECEIPT_INVALID');
  push(semantic?.canonical_input_digest === current.canonical_input_digest &&
    semantic?.canonical_input_digest === semanticMaterialDigest, 'SEMANTIC_INPUT_MATERIAL_DIGEST_INVALID');
  push(semantic?.exact_upstream_provenance_included_in_identity === false &&
    semantic?.exact_upstream_provenance_required_in_observation_receipt === true &&
    semantic?.runtime_dedupe_state === REMOTE_STATE && semantic?.canonical_execution_claimed === false &&
    semantic?.public === 'HOLD' && semantic?.production === 'HOLD' && semantic?.g5 === 'EXPLICIT_APPROVAL_REQUIRED',
  'SEMANTIC_INPUT_TRUTH_BOUNDARY_INVALID');
  push(receipt?.canonical_contract_digest === current.canonical_contract_digest, 'RECEIPT_CONTRACT_DIVERGENCE');
  push(String(receipt?.canonical_workflow_run_id) === String(runId) &&
    String(receipt?.canonical_workflow_run_attempt) === String(runAttempt), 'RECEIPT_RUN_BINDING_MISMATCH');
  push(receipt?.coverage_consumer_sha === run?.head_sha && receipt?.coverage_run_head_sha === run?.head_sha &&
    receipt?.coverage_run_display_title === run?.display_title, 'RECEIPT_COVERAGE_RUN_METADATA_MISMATCH');
  push(receipt?.trigger_event === 'workflow_run', 'RECEIPT_TRIGGER_INVALID');
  push(DIGEST.test(receipt?.upstream_binding_digest || ''), 'RECEIPT_UPSTREAM_BINDING_DIGEST_INVALID');
  push(DIGEST.test(receipt?.upstream_artifact_digest || ''), 'RECEIPT_UPSTREAM_ARTIFACT_DIGEST_INVALID');
  push(DIGEST.test(receipt?.coverage_manifest_digest || ''), 'RECEIPT_MANIFEST_DIGEST_INVALID');
  push(DIGEST.test(receipt?.coverage_kpmo_receipt_digest || ''), 'RECEIPT_KPMO_DIGEST_INVALID');
  push(DIGEST.test(receipt?.guard_receipt_digest || ''), 'RECEIPT_GUARD_DIGEST_INVALID');
  push(receipt?.runtime_dedupe_state === REMOTE_STATE && receipt?.canonical_execution_claimed === false &&
    receipt?.durable_claim_created === false && receipt?.claim_scope === CLAIM_SCOPE, 'RECEIPT_DURABILITY_BOUNDARY_INVALID');
  push(receipt?.public === 'HOLD' && receipt?.production === 'HOLD' && receipt?.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'RECEIPT_PROMOTION_BOUNDARY_INVALID');
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

function guardBase(current, readback, state, disposition, detail) {
  return {
    id: 'kidults-asi-requirement-adapter-coverage-canonical-guard-receipt-v1',
    version: '1.0.0',
    state,
    repository: current.repository,
    source_sha: current.source_sha,
    upstream_class: current.upstream_class,
    canonical_run_key: current.canonical_run_key,
    canonical_input_digest: current.canonical_input_digest,
    semantic_input_receipt_digest: current.semantic_input_receipt_digest,
    canonical_contract_digest: current.canonical_contract_digest,
    upstream_binding_digest: current.upstream_binding_digest,
    upstream_workflow_run_id: current.upstream_workflow_run_id,
    upstream_artifact_id: current.upstream_artifact_id,
    upstream_artifact_digest: current.upstream_artifact_digest,
    coverage_consumer_sha: current.coverage_consumer_sha,
    coverage_run_head_sha: current.coverage_run_head_sha,
    coverage_run_display_title: current.coverage_run_display_title,
    current_workflow_run_id: current.run_id,
    current_workflow_run_attempt: current.run_attempt,
    current_trigger_event: current.trigger_event,
    trigger_event: current.trigger_event,
    canonical_artifact_name: current.canonical_artifact_name,
    readback,
    coverage_execution_disposition: disposition,
    detail,
    runtime_dedupe_state: REMOTE_STATE,
    canonical_execution_claimed: false,
    durable_claim_created: false,
    claim_scope: CLAIM_SCOPE,
    artifact_retention_days: 90,
    every_noncanonical_trigger_alias_receipt_guaranteed: false,
    pending_replacement_caveat: 'GITHUB_CONCURRENCY_ONE_RUNNING_ONE_PENDING_ADDITIONAL_PENDING_MAY_BE_REPLACED',
    public: 'HOLD',
    production: 'HOLD',
    g5: 'EXPLICIT_APPROVAL_REQUIRED',
  };
}

function aliasReceipt(current, leader, observedAt) {
  return signReceipt({
    id: 'kidults-asi-requirement-adapter-coverage-canonical-alias-receipt-v1',
    version: '1.0.0',
    state: 'VERIFIED_PASS_EPHEMERAL_ALIAS_NO_FULL_COVERAGE',
    repository: current.repository,
    source_sha: current.source_sha,
    upstream_class: current.upstream_class,
    canonical_run_key: current.canonical_run_key,
    canonical_input_digest: current.canonical_input_digest,
    semantic_input_receipt_digest: current.semantic_input_receipt_digest,
    canonical_contract_digest: current.canonical_contract_digest,
    current_workflow_run_id: current.run_id,
    current_workflow_run_attempt: current.run_attempt,
    current_trigger_event: current.trigger_event,
    current_upstream_binding_digest: current.upstream_binding_digest,
    current_upstream_workflow_run_id: current.upstream_workflow_run_id,
    current_upstream_artifact_id: current.upstream_artifact_id,
    current_upstream_artifact_digest: current.upstream_artifact_digest,
    current_coverage_consumer_sha: current.coverage_consumer_sha,
    current_coverage_run_head_sha: current.coverage_run_head_sha,
    current_coverage_run_display_title: current.coverage_run_display_title,
    canonical_workflow_run_id: Number(leader.run.id),
    canonical_workflow_run_attempt: Number(leader.run.run_attempt),
    canonical_upstream_binding_digest: leader.receipt.upstream_binding_digest,
    canonical_upstream_workflow_run_id: leader.receipt.upstream_workflow_run_id,
    canonical_upstream_artifact_id: leader.receipt.upstream_artifact_id,
    canonical_upstream_artifact_digest: leader.receipt.upstream_artifact_digest,
    canonical_artifact_id: Number(leader.artifact.id),
    canonical_artifact_name: leader.artifact.name,
    canonical_artifact_digest: leader.artifact.digest,
    canonical_artifact_expires_at: leader.artifact.expires_at,
    canonical_receipt_digest: leader.receipt.receipt_digest,
    canonical_coverage_consumer_sha: leader.receipt.coverage_consumer_sha,
    canonical_coverage_run_head_sha: leader.receipt.coverage_run_head_sha,
    canonical_coverage_run_display_title: leader.receipt.coverage_run_display_title,
    coverage_execution_disposition: 'DEDUPED_ALIAS_NO_FULL_COVERAGE',
    exact_current_observation_retained: true,
    runtime_dedupe_state: REMOTE_STATE,
    canonical_execution_claimed: false,
    durable_claim_created: false,
    claim_scope: CLAIM_SCOPE,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'EXPLICIT_APPROVAL_REQUIRED',
  }, observedAt);
}

export function resolveCoverageCanonicalGuard(input) {
  const observedAt = validateObservedAt(input.observed_at);
  const current = validateCurrent(input.current || {});
  const readback = {
    state: required(input.readback?.state, 'READBACK_STATE_REQUIRED'),
    total_count: Number(input.readback?.total_count || 0),
    returned_count: Number(input.readback?.returned_count || 0),
    prior_success_count: Number(input.readback?.prior_success_count || 0),
    reason_codes: Array.isArray(input.readback?.reason_codes) ? input.readback.reason_codes.map(String).sort() : [],
  };
  const candidates = Array.isArray(input.candidates) ? input.candidates : fail('CANDIDATES_ARRAY_REQUIRED');

  if (current.trigger_event === 'workflow_dispatch') {
    if (readback.state !== 'BYPASS' || candidates.length !== 0) fail('MANUAL_RECOVERY_CANNOT_IMPERSONATE_CANONICAL');
    const guard = signReceipt(guardBase(current, readback,
      'MANUAL_RECOVERY_FULL_VALIDATION_NON_LEADER', 'EXECUTE_FULL_COVERAGE_NON_CANONICAL_RECOVERY',
      { manual_recovery_alias_allowed: false, candidate_count: 0 }), observedAt);
    return { execute_full_coverage: true, ephemeral_actions_leader: false, fail_closed: false, guard };
  }

  if (readback.state !== 'COMPLETE' || readback.total_count !== readback.returned_count || readback.total_count !== candidates.length) {
    const guard = signReceipt(guardBase(current, readback, 'INPUT_DIVERGENCE_HOLD', 'FAIL_CLOSED_NO_COVERAGE_OR_ALIAS',
      { reason: 'CANONICAL_ARTIFACT_READBACK_INCOMPLETE', candidate_count: candidates.length }), observedAt);
    return { execute_full_coverage: false, ephemeral_actions_leader: false, fail_closed: true, guard };
  }
  const active = candidates.filter((candidate) => candidate?.artifact?.expired !== true);
  if (!Number.isSafeInteger(readback.prior_success_count) || readback.prior_success_count < 0) fail('PRIOR_SUCCESS_COUNT_INVALID');
  if (active.length === 0 && readback.prior_success_count > 0) {
    const guard = signReceipt(guardBase(current, readback, 'ARTIFACT_VISIBILITY_OR_RETENTION_HOLD', 'FAIL_CLOSED_NO_COVERAGE_OR_ALIAS',
      { reason: 'PRIOR_SUCCESS_EXISTS_WITHOUT_ACTIVE_CANONICAL_ARTIFACT', prior_success_count: readback.prior_success_count }), observedAt);
    return { execute_full_coverage: false, ephemeral_actions_leader: false, fail_closed: true, guard };
  }
  const validations = active.map((candidate) => ({ candidate, validation: validateLeaderCandidate(candidate, current, observedAt) }));
  const invalid = validations.filter(({ validation }) => !validation.valid);
  if (invalid.length) {
    const guard = signReceipt(guardBase(current, readback, 'INPUT_DIVERGENCE_HOLD', 'FAIL_CLOSED_NO_COVERAGE_OR_ALIAS',
      { invalid_candidates: invalid.map(({ validation }) => ({ ...validation.summary, errors: validation.errors })) }), observedAt);
    return { execute_full_coverage: false, ephemeral_actions_leader: false, fail_closed: true, guard };
  }
  if (validations.length > 1) {
    const guard = signReceipt(guardBase(current, readback, 'MULTIPLE_CANONICAL_LEADERS_HOLD', 'FAIL_CLOSED_NO_COVERAGE_OR_ALIAS',
      { leaders: validations.map(({ validation }) => validation.summary) }), observedAt);
    return { execute_full_coverage: false, ephemeral_actions_leader: false, fail_closed: true, guard };
  }
  if (validations.length === 0) {
    const guard = signReceipt({
      ...guardBase(current, readback, 'EPHEMERAL_CANONICAL_LEADER_SELECTED', 'EXECUTE_FULL_COVERAGE_EPHEMERAL_LEADER', { candidate_count: 0 }),
      ephemeral_actions_leader: true,
      canonical_workflow_run_id: current.run_id,
      canonical_workflow_run_attempt: current.run_attempt,
    }, observedAt);
    return { execute_full_coverage: true, ephemeral_actions_leader: true, fail_closed: false, guard };
  }

  const leader = validations[0].candidate;
  const alias = aliasReceipt(current, leader, observedAt);
  const guard = signReceipt({
    ...guardBase(current, readback, 'DEDUPED_ALIAS', 'DEDUPED_ALIAS_NO_FULL_COVERAGE', {
      canonical_workflow_run_id: Number(leader.run.id),
      canonical_artifact_id: Number(leader.artifact.id),
      canonical_artifact_digest: leader.artifact.digest,
      canonical_receipt_digest: leader.receipt.receipt_digest,
      alias_receipt_digest: alias.receipt_digest,
    }),
    ephemeral_actions_leader: false,
    alias: true,
    canonical_workflow_run_id: Number(leader.run.id),
    canonical_workflow_run_attempt: Number(leader.run.run_attempt),
    canonical_artifact_id: Number(leader.artifact.id),
    canonical_artifact_digest: leader.artifact.digest,
    canonical_receipt_digest: leader.receipt.receipt_digest,
    alias_receipt_digest: alias.receipt_digest,
  }, observedAt);
  return { execute_full_coverage: false, ephemeral_actions_leader: false, fail_closed: false, guard, alias_receipt: alias };
}

export function finalizeCoverageCanonicalLeader(input) {
  const observedAt = validateObservedAt(input.observed_at);
  const current = validateCurrent(input);
  if (current.trigger_event !== 'workflow_run') fail('CANONICAL_LEADER_MUST_BE_WORKFLOW_RUN');
  const coverageManifestDigest = required(input.coverage_manifest_digest, 'COVERAGE_MANIFEST_DIGEST_REQUIRED');
  const coverageKpmoReceiptDigest = required(input.coverage_kpmo_receipt_digest, 'COVERAGE_KPMO_RECEIPT_DIGEST_REQUIRED');
  const archiveValidationReceiptDigest = required(input.archive_validation_receipt_digest, 'ARCHIVE_VALIDATION_DIGEST_REQUIRED');
  const guardReceiptDigest = required(input.guard_receipt_digest, 'GUARD_RECEIPT_DIGEST_REQUIRED');
  for (const [code, value] of [
    ['COVERAGE_MANIFEST_DIGEST_INVALID', coverageManifestDigest],
    ['COVERAGE_KPMO_RECEIPT_DIGEST_INVALID', coverageKpmoReceiptDigest],
    ['ARCHIVE_VALIDATION_DIGEST_INVALID', archiveValidationReceiptDigest],
    ['GUARD_RECEIPT_DIGEST_INVALID', guardReceiptDigest],
  ]) if (!DIGEST.test(value)) fail(code);
  return signReceipt({
    id: 'kidults-asi-requirement-adapter-coverage-canonical-leader-receipt-v1',
    version: '1.0.0',
    state: 'VERIFIED_PASS_EPHEMERAL_CANONICAL_LEADER',
    repository: current.repository,
    source_sha: current.source_sha,
    upstream_class: current.upstream_class,
    canonical_run_key: current.canonical_run_key,
    canonical_input_digest: current.canonical_input_digest,
    semantic_input_receipt_digest: current.semantic_input_receipt_digest,
    canonical_contract_digest: current.canonical_contract_digest,
    canonical_workflow_run_id: current.run_id,
    canonical_workflow_run_attempt: current.run_attempt,
    trigger_event: current.trigger_event,
    coverage_consumer_sha: current.coverage_consumer_sha,
    coverage_run_head_sha: current.coverage_run_head_sha,
    coverage_run_display_title: current.coverage_run_display_title,
    coverage_workflow_name: WORKFLOW_NAME,
    coverage_workflow_path: WORKFLOW_PATH,
    coverage_repository: current.repository,
    upstream_binding_digest: current.upstream_binding_digest,
    upstream_workflow_run_id: current.upstream_workflow_run_id,
    upstream_artifact_id: current.upstream_artifact_id,
    upstream_artifact_digest: current.upstream_artifact_digest,
    archive_validation_receipt_digest: archiveValidationReceiptDigest,
    coverage_manifest_digest: coverageManifestDigest,
    coverage_kpmo_receipt_digest: coverageKpmoReceiptDigest,
    guard_receipt_digest: guardReceiptDigest,
    validations_complete: true,
    negative_tests_complete: true,
    final_revalidation_complete: true,
    runtime_dedupe_state: REMOTE_STATE,
    canonical_execution_claimed: false,
    durable_claim_created: false,
    claim_scope: CLAIM_SCOPE,
    artifact_retention_days: 90,
    every_noncanonical_trigger_alias_receipt_guaranteed: false,
    pending_replacement_caveat: 'GITHUB_CONCURRENCY_ONE_RUNNING_ONE_PENDING_ADDITIONAL_PENDING_MAY_BE_REPLACED',
    public: 'HOLD',
    production: 'HOLD',
    g5: 'EXPLICIT_APPROVAL_REQUIRED',
  }, observedAt);
}

function parseArgs(argv) {
  const args = { mode: 'resolve', input: '', output: '', aliasOutput: '' };
  const mapping = { '--mode': 'mode', '--input': 'input', '--output': 'output', '--alias-output': 'aliasOutput' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!mapping[key]) fail('UNKNOWN_ARGUMENT', key);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail('ARGUMENT_VALUE_REQUIRED', key);
    args[mapping[key]] = value;
    index += 1;
  }
  if (!['resolve', 'finalize'].includes(args.mode)) fail('MODE_INVALID');
  if (!args.input || !args.output) fail('ARGUMENT_REQUIRED');
  return args;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function emitEnvironment(result) {
  if (!process.env.GITHUB_ENV) return;
  const values = {
    KIDULTS_COVERAGE_EXECUTE_FULL: String(result.execute_full_coverage),
    KIDULTS_COVERAGE_EPHEMERAL_LEADER: String(result.ephemeral_actions_leader),
    KIDULTS_COVERAGE_GUARD_RECEIPT_DIGEST: result.guard.receipt_digest,
    KIDULTS_COVERAGE_CANONICAL_ARTIFACT_NAME: result.guard.canonical_artifact_name,
    KIDULTS_COVERAGE_ALIAS: String(Boolean(result.alias_receipt)),
  };
  fs.appendFileSync(process.env.GITHUB_ENV, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = JSON.parse(fs.readFileSync(args.input, 'utf8'));
  if (args.mode === 'finalize') {
    const receipt = finalizeCoverageCanonicalLeader(input);
    writeJson(args.output, receipt);
    process.stdout.write(`${JSON.stringify({ state: receipt.state, receipt_digest: receipt.receipt_digest, production: receipt.production }, null, 2)}\n`);
    return;
  }
  const result = resolveCoverageCanonicalGuard(input);
  writeJson(args.output, result.guard);
  if (result.alias_receipt) {
    if (!args.aliasOutput) fail('ALIAS_OUTPUT_REQUIRED');
    writeJson(args.aliasOutput, result.alias_receipt);
  }
  emitEnvironment(result);
  process.stdout.write(`${JSON.stringify({
    state: result.guard.state,
    execute_full_coverage: result.execute_full_coverage,
    ephemeral_actions_leader: result.ephemeral_actions_leader,
    fail_closed: result.fail_closed,
    guard_receipt_digest: result.guard.receipt_digest,
    runtime_dedupe_state: result.guard.runtime_dedupe_state,
    production: result.guard.production,
  }, null, 2)}\n`);
  if (result.fail_closed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

export { MAX_LEADER_ARTIFACT_BYTES, receiptDigest };
