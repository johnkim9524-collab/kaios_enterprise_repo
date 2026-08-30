#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_CONTRACT = 'coordination/kidults/kpmo/continuous-assurance-canonical-identity-v1.json';
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const CLASS_PATTERN = /^[A-Z][A-Z0-9_]{2,95}$/;
const DIRECT_EVENTS = new Set(['push', 'pull_request', 'schedule', 'workflow_dispatch']);
const UPSTREAM_EVENTS = new Set(['push', 'pull_request', 'workflow_run', 'schedule', 'workflow_dispatch']);

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
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

function optionalPositiveInteger(value, fallback = 1) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const text = String(value).trim();
  if (!POSITIVE_INTEGER_PATTERN.test(text)) fail('RUN_ATTEMPT_INVALID', text);
  return Number(text);
}

function logicalSlot(rawTimestamp, slotMinutes, code) {
  const timestamp = required(rawTimestamp, code);
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) fail(code, timestamp);
  const width = slotMinutes * 60 * 1000;
  return new Date(Math.floor(milliseconds / width) * width).toISOString();
}

export function validateCanonicalIdentityContract(contract) {
  if (contract?.id !== 'kidults-continuous-assurance-canonical-identity-v1' || contract?.version !== '1.0.0') {
    fail('CANONICAL_IDENTITY_CONTRACT_ID_VERSION');
  }
  if (contract.state !== 'IMPLEMENTED_EPHEMERAL_ACTIONS_GUARD_REMOTE_LEDGER_ACTIVATION_HOLD') fail('CANONICAL_IDENTITY_CONTRACT_STATE');
  if (contract.identity_namespace !== 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE_V1') fail('CANONICAL_IDENTITY_NAMESPACE');
  const expectedKey = ['repository', 'consumer_workflow_id', 'source_sha', 'upstream_class', 'generation_discriminator', 'classifier_contract_digest'];
  if (stableJson(contract.canonical_key_components) !== stableJson(expectedKey)) fail('CANONICAL_KEY_COMPONENTS');
  if (!Number.isInteger(contract.logical_schedule_slot_minutes) || contract.logical_schedule_slot_minutes < 1 || contract.logical_schedule_slot_minutes > 60) {
    fail('LOGICAL_SCHEDULE_SLOT_INVALID');
  }
  const conclusions = new Set(contract.terminal_conclusions || []);
  for (const conclusion of ['success', 'failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped', 'stale']) {
    if (!conclusions.has(conclusion)) fail('TERMINAL_CONCLUSION_MISSING', conclusion);
  }
  if (contract.non_success_policy?.dedupe_eligible !== false || contract.non_success_policy?.generation_discriminator !== 'UPSTREAM_RUN_ID_ATTEMPT_CONCLUSION') {
    fail('NON_SUCCESS_POLICY_INVALID');
  }
  const allowlist = contract.workflow_run_class_allowlist;
  if (!Array.isArray(allowlist) || allowlist.length !== 19) fail('WORKFLOW_CLASS_ALLOWLIST_COUNT');
  const names = new Set();
  const pairs = new Set();
  for (const entry of allowlist) {
    if (!entry?.workflow_name || !entry?.workflow_path || !CLASS_PATTERN.test(entry?.upstream_class || '')) fail('WORKFLOW_CLASS_ALLOWLIST_ENTRY');
    if (!entry.workflow_path.startsWith('.github/workflows/') || !entry.workflow_path.endsWith('.yml')) fail('WORKFLOW_CLASS_PATH', entry.workflow_path);
    if (names.has(entry.workflow_name)) fail('WORKFLOW_CLASS_NAME_DUPLICATE', entry.workflow_name);
    const pair = `${entry.workflow_name}\u0000${entry.workflow_path}`;
    if (pairs.has(pair)) fail('WORKFLOW_CLASS_PAIR_DUPLICATE', entry.workflow_name);
    names.add(entry.workflow_name);
    pairs.add(pair);
  }
  const special = contract.special_exact_artifact_classes || [];
  if (stableJson([...special].sort()) !== stableJson([
    'ASI_REQUIREMENT_COVERAGE',
    'ASI_SHADOW_OPERATING_EVIDENCE',
    'ASI_SHARDED_SOURCE_RESERVE',
  ])) fail('SPECIAL_EXACT_ARTIFACT_CLASSES');
  const ephemeralEligible = contract.ephemeral_actions_alias_eligible_classes || [];
  if (stableJson([...ephemeralEligible].sort()) !== stableJson([
    'ASI_ADAPTER_EVIDENCE_CASCADE',
    'ASI_SOURCE_ACQUISITION_CASCADE',
    'KPMO_CONTROL_PLANE_VALIDATORS',
  ])) fail('EPHEMERAL_ACTIONS_ALIAS_ELIGIBLE_CLASSES');
  if (ephemeralEligible.some((className) => special.includes(className))) fail('SPECIAL_CLASS_EPHEMERAL_ALIAS_FORBIDDEN');
  if (contract.runtime_dedupe?.state !== 'REMOTE_LEDGER_ACTIVATION_HOLD' ||
      contract.runtime_dedupe?.leader_election_authority !== 'REMOTE_POSTGRES_ATOMIC_CLAIM_LEDGER' ||
      contract.runtime_dedupe?.github_actions_artifact_readback_is_sufficient_leader_election !== false ||
      contract.runtime_dedupe?.github_actions_artifact_readback_is_sufficient_for_bounded_ephemeral_success_alias !== true ||
      contract.runtime_dedupe?.github_actions_concurrency_is_serialization_not_leader_proof !== true ||
      contract.runtime_dedupe?.job_level_concurrency_required !== true ||
      contract.runtime_dedupe?.cancel_in_progress !== false ||
      contract.runtime_dedupe?.canonical_execution_claimed_default !== false ||
      contract.runtime_dedupe?.alias_emission_allowed_before_remote_claim_verification !== false ||
      contract.runtime_dedupe?.bounded_ephemeral_alias_after_serialized_exact_receipt_readback_allowed !== true) {
    fail('RUNTIME_DEDUPE_HOLD_INVALID');
  }
  const ephemeralGuard = contract.runtime_dedupe?.ephemeral_actions_guard;
  if (ephemeralGuard?.state !== 'ACTIVE_BOUNDED_90_DAY_NON_DURABLE' ||
      ephemeralGuard?.artifact_retention_days !== 90 ||
      ephemeralGuard?.canonical_leader_artifact_name_template !== 'kidults-continuous-assurance-canonical-{canonical_key_hex}' ||
      ephemeralGuard?.canonical_leader_artifact_publish_condition !== 'SUCCESS_AFTER_AUDIT_PLANNER_PACKET_VERIFICATION' ||
      ephemeralGuard?.success_only !== true ||
      ephemeralGuard?.workflow_run_only !== true ||
      ephemeralGuard?.terminal_non_success_bypass_required !== true ||
      ephemeralGuard?.manual_recovery_bypass_required !== true ||
      ephemeralGuard?.special_exact_artifact_class_bypass_required !== true ||
      ephemeralGuard?.candidate_readback_must_complete_before_alias !== true ||
      ephemeralGuard?.candidate_lookup_exact_name_required !== true ||
      ephemeralGuard?.blind_source_sha_lookup_forbidden !== true ||
      ephemeralGuard?.canonical_receipt_digest_recomputation_required !== true ||
      ephemeralGuard?.claim_scope !== 'EPHEMERAL_ACTIONS_ARTIFACT_90_DAY' ||
      ephemeralGuard?.github_concurrency_running_capacity !== 1 ||
      ephemeralGuard?.github_concurrency_pending_capacity !== 1 ||
      ephemeralGuard?.additional_pending_runs_may_be_replaced !== true ||
      ephemeralGuard?.every_noncanonical_trigger_alias_receipt_guaranteed !== false ||
      ephemeralGuard?.durable_claim_created !== false ||
      ephemeralGuard?.postgres_activation_state !== 'REMOTE_LEDGER_ACTIVATION_HOLD') {
    fail('EPHEMERAL_ACTIONS_GUARD_INVALID');
  }
  if (contract.truth_boundary?.runtime_dedupe_active !== false || contract.truth_boundary?.detector_authority !== 'READ_ONLY' ||
      contract.truth_boundary?.ephemeral_actions_alias_guard_active !== true ||
      contract.truth_boundary?.durable_runtime_dedupe_active !== false ||
      contract.truth_boundary?.public !== 'HOLD' || contract.truth_boundary?.production !== 'HOLD' ||
      contract.truth_boundary?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') fail('CANONICAL_IDENTITY_TRUTH_BOUNDARY');
  return true;
}

function workflowClass(contract, workflowName, workflowPath) {
  const entry = contract.workflow_run_class_allowlist.find((candidate) => candidate.workflow_name === workflowName);
  if (!entry) fail('UPSTREAM_WORKFLOW_NOT_ALLOWLISTED', workflowName);
  if (entry.workflow_path !== workflowPath) fail('UPSTREAM_WORKFLOW_PATH_MISMATCH', `${workflowName}:${workflowPath}`);
  return entry;
}

export function classifyCanonicalIdentity(input, contract, contractText = `${JSON.stringify(contract, null, 2)}\n`) {
  validateCanonicalIdentityContract(contract);
  const eventName = required(input.event_name, 'EVENT_NAME_REQUIRED');
  if (eventName !== 'workflow_run' && !DIRECT_EVENTS.has(eventName)) fail('EVENT_NAME_INVALID', eventName);
  const repository = required(input.repository, 'REPOSITORY_REQUIRED');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) fail('REPOSITORY_INVALID', repository);
  const sourceSha = required(input.source_sha, 'SOURCE_SHA_REQUIRED');
  if (!SHA_PATTERN.test(sourceSha)) fail('SOURCE_SHA_INVALID', sourceSha);
  const consumerWorkflowId = 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE_V1';
  const classifierContractDigest = digest(contractText);
  const runId = positiveInteger(input.run_id, 'RUN_ID_REQUIRED');
  const runAttempt = optionalPositiveInteger(input.run_attempt, 1);
  let upstreamClass;
  let generationKind;
  let generationDiscriminator;
  let dedupeEligible;
  let terminalObservation;
  let upstream = null;
  let logicalSlotValue = null;
  let specialExactArtifactClass = false;
  let ephemeralActionsAliasEligible = false;

  if (eventName === 'workflow_run') {
    const workflowName = required(input.upstream_workflow_name, 'UPSTREAM_WORKFLOW_NAME_REQUIRED');
    const workflowPath = required(input.upstream_workflow_path, 'UPSTREAM_WORKFLOW_PATH_REQUIRED');
    const entry = workflowClass(contract, workflowName, workflowPath);
    const upstreamEvent = required(input.upstream_event, 'UPSTREAM_EVENT_REQUIRED');
    if (!UPSTREAM_EVENTS.has(upstreamEvent)) fail('UPSTREAM_EVENT_INVALID', upstreamEvent);
    const upstreamRunId = positiveInteger(input.upstream_run_id, 'UPSTREAM_RUN_ID_REQUIRED');
    const upstreamRunAttempt = optionalPositiveInteger(input.upstream_run_attempt, 1);
    const conclusion = required(input.upstream_conclusion, 'UPSTREAM_CONCLUSION_REQUIRED');
    if (!contract.terminal_conclusions.includes(conclusion)) fail('UPSTREAM_CONCLUSION_INVALID', conclusion);
    upstreamClass = entry.upstream_class;
    specialExactArtifactClass = contract.special_exact_artifact_classes.includes(upstreamClass);
    terminalObservation = conclusion !== 'success';
    dedupeEligible = !terminalObservation;
    if (terminalObservation) {
      generationKind = 'NON_SUCCESS_TERMINAL_OBSERVATION';
      generationDiscriminator = `upstream:${upstreamRunId}:attempt:${upstreamRunAttempt}:conclusion:${conclusion}`;
    } else if (upstreamRunAttempt > 1) {
      generationKind = 'UPSTREAM_MANUAL_RECOVERY_ATTEMPT';
      generationDiscriminator = `upstream-recovery-run:${upstreamRunId}:attempt:${upstreamRunAttempt}`;
      dedupeEligible = false;
    } else if (upstreamEvent === 'schedule') {
      generationKind = contract.workflow_run_success_generation_rules.schedule;
      logicalSlotValue = logicalSlot(input.upstream_created_at, contract.logical_schedule_slot_minutes, 'UPSTREAM_CREATED_AT_REQUIRED');
      generationDiscriminator = `upstream-schedule-slot:${logicalSlotValue}`;
    } else if (upstreamEvent === 'workflow_dispatch') {
      generationKind = contract.workflow_run_success_generation_rules.workflow_dispatch;
      generationDiscriminator = `upstream-manual-run:${upstreamRunId}:attempt:${upstreamRunAttempt}`;
      dedupeEligible = false;
    } else {
      generationKind = contract.workflow_run_success_generation_rules[upstreamEvent];
      if (generationKind !== 'SOURCE_GENERATION') fail('UPSTREAM_GENERATION_RULE_INVALID', upstreamEvent);
      generationDiscriminator = 'source-generation';
    }
    upstream = {
      workflow_name: workflowName,
      workflow_path: workflowPath,
      workflow_event: upstreamEvent,
      workflow_run_id: upstreamRunId,
      workflow_run_attempt: upstreamRunAttempt,
      conclusion,
      created_at: input.upstream_created_at || null,
    };
    ephemeralActionsAliasEligible = dedupeEligible &&
      contract.ephemeral_actions_alias_eligible_classes.includes(upstreamClass) &&
      !specialExactArtifactClass && upstreamEvent !== 'workflow_dispatch' && runAttempt === 1;
  } else if (eventName === 'schedule') {
    upstreamClass = 'ASSURANCE_WATCHDOG';
    generationKind = contract.direct_event_generation_rules.schedule;
    logicalSlotValue = logicalSlot(input.observed_at, contract.logical_schedule_slot_minutes, 'OBSERVED_AT_REQUIRED');
    generationDiscriminator = `assurance-schedule:${required(input.schedule_expression, 'SCHEDULE_EXPRESSION_REQUIRED')}:slot:${logicalSlotValue}`;
    dedupeEligible = true;
    terminalObservation = false;
  } else if (eventName === 'workflow_dispatch') {
    upstreamClass = 'ASSURANCE_MANUAL_RECOVERY';
    generationKind = contract.direct_event_generation_rules.workflow_dispatch;
    generationDiscriminator = `assurance-manual-run:${runId}:attempt:${runAttempt}`;
    dedupeEligible = false;
    terminalObservation = false;
  } else if (eventName === 'pull_request') {
    upstreamClass = 'ASSURANCE_CONTROL_PR';
    generationKind = contract.direct_event_generation_rules.pull_request;
    const prNumber = positiveInteger(input.pull_request_number, 'PULL_REQUEST_NUMBER_REQUIRED');
    const prHeadSha = required(input.pull_request_head_sha, 'PULL_REQUEST_HEAD_SHA_REQUIRED');
    if (!SHA_PATTERN.test(prHeadSha)) fail('PULL_REQUEST_HEAD_SHA_INVALID', prHeadSha);
    generationDiscriminator = `pull-request:${prNumber}:head:${prHeadSha}`;
    dedupeEligible = true;
    terminalObservation = false;
  } else {
    upstreamClass = 'ASSURANCE_MAIN_PUSH';
    generationKind = contract.direct_event_generation_rules.push;
    generationDiscriminator = 'source-generation';
    dedupeEligible = true;
    terminalObservation = false;
  }

  if (!CLASS_PATTERN.test(upstreamClass)) fail('UPSTREAM_CLASS_INVALID', upstreamClass);
  const keyMaterial = {
    repository,
    consumer_workflow_id: consumerWorkflowId,
    source_sha: sourceSha,
    upstream_class: upstreamClass,
    generation_discriminator: generationDiscriminator,
    classifier_contract_digest: classifierContractDigest,
  };
  const canonicalKey = digest(stableJson(keyMaterial));
  const canonicalInputMaterial = {
    domain: 'KIDULTS_CONTINUOUS_ASSURANCE_CANONICAL_INPUT_V1',
    ...keyMaterial,
    ...(specialExactArtifactClass ? {
      exact_upstream_observation: {
        workflow_path: upstream.workflow_path,
        workflow_run_id: upstream.workflow_run_id,
        workflow_run_attempt: upstream.workflow_run_attempt,
        workflow_event: upstream.workflow_event,
        conclusion: upstream.conclusion,
      },
    } : {}),
  };
  const canonicalInputDigest = digest(stableJson(canonicalInputMaterial));
  const observedAt = required(input.observed_at, 'OBSERVED_AT_REQUIRED');
  if (!Number.isFinite(Date.parse(observedAt))) fail('OBSERVED_AT_INVALID', observedAt);
  const base = {
    id: 'kidults-continuous-assurance-canonical-identity-receipt-v1',
    version: contract.version,
    state: terminalObservation ? 'TERMINAL_OBSERVATION_NON_DEDUPABLE' : 'CLASSIFIED_EPHEMERAL_GUARD_REMOTE_LEDGER_HOLD',
    observed_at: observedAt,
    repository,
    consumer_workflow_id: consumerWorkflowId,
    trigger_event: eventName,
    workflow_run_id: runId,
    workflow_run_attempt: runAttempt,
    source_sha: sourceSha,
    upstream_class: upstreamClass,
    generation_kind: generationKind,
    generation_discriminator: generationDiscriminator,
    logical_schedule_slot: logicalSlotValue,
    classifier_contract_digest: classifierContractDigest,
    canonical_input_digest: canonicalInputDigest,
    canonical_input_digest_state: specialExactArtifactClass
      ? 'UPSTREAM_OBSERVATION_BOUND_EXACT_ARTIFACT_VERIFICATION_REQUIRED'
      : 'VERIFIED_GROUPED_SEMANTIC_INPUT',
    canonical_key: canonicalKey,
    concurrency_group: `kidults-continuous-assurance-${canonicalKey.slice('sha256:'.length)}`,
    dedupe_eligible: dedupeEligible,
    terminal_observation_non_dedupable: terminalObservation,
    special_exact_artifact_class: specialExactArtifactClass,
    ephemeral_actions_alias_eligible: ephemeralActionsAliasEligible,
    upstream,
    runtime_dedupe_state: contract.runtime_dedupe.state,
    leader_election_authority: contract.runtime_dedupe.leader_election_authority,
    ephemeral_actions_guard_state: contract.runtime_dedupe.ephemeral_actions_guard.state,
    github_actions_concurrency_role: 'SERIALIZED_BOUNDED_EPHEMERAL_GUARD_NOT_DURABLE_LEADER_ELECTION',
    canonical_execution_claimed: false,
    canonical_run_id: null,
    canonical_receipt_digest: null,
    alias: false,
    alias_receipt_emitted: false,
    audit_execution_disposition: ephemeralActionsAliasEligible
      ? 'RESOLVE_EPHEMERAL_ACTIONS_LEADER_OR_ALIAS'
      : 'EXECUTE_FULL_AUDIT_NON_DEDUPABLE_OR_EXACT_BINDING',
    detector_authority: 'READ_ONLY',
    repository_mutation_performed: false,
    external_mutation_performed: false,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'EXPLICIT_APPROVAL_REQUIRED',
  };
  return { ...base, receipt_digest: digest(stableJson(base)) };
}

function parseArgs(argv) {
  const result = { contract: DEFAULT_CONTRACT, output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!['--contract', '--output'].includes(key)) fail('UNKNOWN_ARGUMENT', key);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail('ARGUMENT_VALUE_REQUIRED', key);
    result[key.slice(2)] = value;
    index += 1;
  }
  if (!result.output) fail('OUTPUT_REQUIRED');
  return result;
}

function writeOutput(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function emitGithubOutputs(receipt) {
  if (!process.env.GITHUB_OUTPUT) return;
  const outputs = {
    canonical_key: receipt.canonical_key,
    concurrency_group: receipt.concurrency_group,
    upstream_class: receipt.upstream_class,
    generation_discriminator: receipt.generation_discriminator,
    classifier_contract_digest: receipt.classifier_contract_digest,
    classification_receipt_digest: receipt.receipt_digest,
    canonical_input_digest: receipt.canonical_input_digest,
    dedupe_eligible: String(receipt.dedupe_eligible),
    terminal_observation_non_dedupable: String(receipt.terminal_observation_non_dedupable),
    special_exact_artifact_class: String(receipt.special_exact_artifact_class),
    ephemeral_actions_alias_eligible: String(receipt.ephemeral_actions_alias_eligible),
    runtime_dedupe_state: receipt.runtime_dedupe_state,
  };
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let receipt;
  try {
    const contractText = fs.readFileSync(args.contract, 'utf8');
    const contract = JSON.parse(contractText);
    receipt = classifyCanonicalIdentity({
      event_name: process.env.KPMO_EVENT_NAME || process.env.GITHUB_EVENT_NAME,
      repository: process.env.GITHUB_REPOSITORY,
      source_sha: process.env.KPMO_SOURCE_SHA,
      run_id: process.env.GITHUB_RUN_ID,
      run_attempt: process.env.GITHUB_RUN_ATTEMPT,
      observed_at: process.env.KPMO_OBSERVED_AT || new Date().toISOString(),
      schedule_expression: process.env.KPMO_SCHEDULE_EXPRESSION,
      pull_request_number: process.env.KPMO_PR_NUMBER,
      pull_request_head_sha: process.env.KPMO_PR_HEAD_SHA,
      upstream_workflow_name: process.env.KPMO_UPSTREAM_WORKFLOW_NAME,
      upstream_workflow_path: process.env.KPMO_UPSTREAM_WORKFLOW_PATH,
      upstream_event: process.env.KPMO_UPSTREAM_EVENT,
      upstream_run_id: process.env.KPMO_UPSTREAM_RUN_ID,
      upstream_run_attempt: process.env.KPMO_UPSTREAM_RUN_ATTEMPT,
      upstream_conclusion: process.env.KPMO_UPSTREAM_CONCLUSION,
      upstream_created_at: process.env.KPMO_UPSTREAM_CREATED_AT,
    }, contract, contractText);
    writeOutput(args.output, receipt);
    emitGithubOutputs(receipt);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    const observedAt = process.env.KPMO_OBSERVED_AT || new Date().toISOString();
    const base = {
      id: 'kidults-continuous-assurance-canonical-identity-receipt-v1',
      version: '1.0.0',
      state: 'VERIFIED_FAIL',
      observed_at: observedAt,
      repository: process.env.GITHUB_REPOSITORY || 'UNKNOWN',
      trigger_event: process.env.KPMO_EVENT_NAME || process.env.GITHUB_EVENT_NAME || 'UNKNOWN',
      workflow_run_id: process.env.GITHUB_RUN_ID || 'UNKNOWN',
      source_sha: process.env.KPMO_SOURCE_SHA || 'UNKNOWN',
      runtime_dedupe_state: 'REMOTE_LEDGER_ACTIVATION_HOLD',
      canonical_execution_claimed: false,
      ephemeral_actions_alias_eligible: false,
      alias: false,
      error_code: String(error?.message || error).slice(0, 300),
      detector_authority: 'READ_ONLY',
      public: 'HOLD',
      production: 'HOLD',
      g5: 'EXPLICIT_APPROVAL_REQUIRED',
    };
    receipt = { ...base, receipt_digest: digest(stableJson(base)) };
    writeOutput(args.output, receipt);
    process.stderr.write(`${JSON.stringify(receipt, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

export { DIGEST_PATTERN, stableJson };
