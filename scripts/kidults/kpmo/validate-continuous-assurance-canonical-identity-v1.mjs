#!/usr/bin/env node
import fs from 'node:fs';
import {
  classifyCanonicalIdentity,
  validateCanonicalIdentityContract,
} from './classify-continuous-assurance-canonical-identity-v1.mjs';

const contractPath = 'coordination/kidults/kpmo/continuous-assurance-canonical-identity-v1.json';
const workflowPath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const contractText = fs.readFileSync(contractPath, 'utf8');
const contract = JSON.parse(contractText);
const workflow = fs.readFileSync(workflowPath, 'utf8');
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const shaA = 'a'.repeat(40);
const shaB = 'b'.repeat(40);

validateCanonicalIdentityContract(contract);

const workflowRunBlock = workflow.match(/^  workflow_run:\n([\s\S]*?)^    branches:/m)?.[1];
assert(typeof workflowRunBlock === 'string', 'WORKFLOW_RUN_BLOCK_NOT_FOUND');
const watched = [...workflowRunBlock.matchAll(/^      - '([^']+)'$/gm)].map((match) => match[1]);
for (const entry of contract.workflow_run_class_allowlist) {
  assert(watched.filter((name) => name === entry.workflow_name).length === 1, `WORKFLOW_WATCH_CARDINALITY:${entry.workflow_name}`);
  assert(fs.existsSync(entry.workflow_path), `ALLOWLIST_WORKFLOW_PATH_MISSING:${entry.workflow_path}`);
  const source = fs.readFileSync(entry.workflow_path, 'utf8');
  assert(source.match(/^name:\s*(.+)$/m)?.[1]?.trim() === entry.workflow_name, `ALLOWLIST_WORKFLOW_NAME_PATH_MISMATCH:${entry.workflow_name}`);
}
assert(watched.length === contract.workflow_run_class_allowlist.length, 'WORKFLOW_WATCH_ALLOWLIST_COUNT_MISMATCH');
assert(new Set(contract.workflow_run_class_allowlist.map((entry) => entry.workflow_path)).size === contract.workflow_run_class_allowlist.length, 'ALLOWLIST_WORKFLOW_PATH_DUPLICATE');
const expectedClassByWorkflow = new Map([
  ['KIDULTS ASI Snapshot Readiness Factory v2', 'ASI_SNAPSHOT_READINESS'],
  ['KIDULTS ASI Intelligence Preparation Wave v1', 'ASI_SOURCE_ACQUISITION_CASCADE'],
  ['KIDULTS Autonomous Met Open Access Sample', 'ASI_ADAPTER_EVIDENCE_CASCADE'],
  ['KIDULTS Autonomous V&A Fashion Sample', 'ASI_ADAPTER_EVIDENCE_CASCADE'],
  ['KIDULTS Full Value Chain Red-Team Orchestrator V1', 'KPMO_CONTROL_PLANE_VALIDATORS'],
  ['KIDULTS Unified Audit Control Plane', 'KPMO_CONTROL_PLANE_VALIDATORS'],
  ['KIDULTS Trusted Merge Control Monotonicity', 'KPMO_CONTROL_PLANE_VALIDATORS'],
  ['KIDULTS ASI Source Adapter Wave 2 v1', 'ASI_ADAPTER_EVIDENCE_CASCADE'],
  ['KIDULTS ASI Source Adapter Wave 3 v1', 'ASI_ADAPTER_EVIDENCE_CASCADE'],
  ['KIDULTS ASI Source Adapter Wave 4 v1', 'ASI_ADAPTER_EVIDENCE_CASCADE'],
  ['KIDULTS ASI State Department Camera Evidence v1', 'ASI_ADAPTER_EVIDENCE_CASCADE'],
  ['KIDULTS ASI Getty Historical Transaction Admission v1', 'ASI_ADAPTER_EVIDENCE_CASCADE'],
  ['KIDULTS ASI P0 Mission Consumption v1', 'ASI_SOURCE_ACQUISITION_CASCADE'],
  ['KIDULTS ASI P0B Bounded Discovery Candidates v1', 'ASI_SOURCE_ACQUISITION_CASCADE'],
  ['KIDULTS ASI Autonomous Resolution Layer v1', 'ASI_SOURCE_ACQUISITION_CASCADE'],
  ['KIDULTS ASI Requirement-to-Adapter Coverage v1', 'ASI_REQUIREMENT_COVERAGE'],
  ['KIDULTS ASI Sharded Source Reserve v1', 'ASI_SHARDED_SOURCE_RESERVE'],
  ['KIDULTS ASI SHADOW Operating Evidence v1', 'ASI_SHADOW_OPERATING_EVIDENCE'],
  ['KPMO Live Canonical Issue Truth V1', 'KPMO_LIVE_CANONICAL_ISSUE_TRUTH'],
]);
for (const entry of contract.workflow_run_class_allowlist) {
  assert(expectedClassByWorkflow.get(entry.workflow_name) === entry.upstream_class, `WORKFLOW_CLASS_REASSIGNMENT:${entry.workflow_name}`);
}
assert(contract.workflow_run_class_allowlist.filter((entry) => entry.upstream_class === 'ASI_SOURCE_ACQUISITION_CASCADE').length === 4, 'SOURCE_CLASS_CARDINALITY');
assert(contract.workflow_run_class_allowlist.filter((entry) => entry.upstream_class === 'ASI_ADAPTER_EVIDENCE_CASCADE').length === 7, 'ADAPTER_CLASS_CARDINALITY');
assert(contract.workflow_run_class_allowlist.filter((entry) => entry.upstream_class === 'KPMO_CONTROL_PLANE_VALIDATORS').length === 3, 'CONTROL_CLASS_CARDINALITY');

const base = {
  event_name: 'workflow_run',
  repository: 'johnkim9524-collab/kaios_enterprise_repo',
  source_sha: shaA,
  run_id: '9001',
  run_attempt: '1',
  observed_at: '2026-08-29T23:20:01.000Z',
  upstream_workflow_name: 'KIDULTS ASI P0 Mission Consumption v1',
  upstream_workflow_path: '.github/workflows/kidults-asi-p0-mission-consumption-v1.yml',
  upstream_event: 'push',
  upstream_run_id: '8001',
  upstream_run_attempt: '1',
  upstream_conclusion: 'success',
  upstream_created_at: '2026-08-29T23:19:00.000Z',
};

const first = classifyCanonicalIdentity(base, contract, contractText);
const sameClassDifferentRun = classifyCanonicalIdentity({
  ...base,
  run_id: '9002',
  upstream_workflow_name: 'KIDULTS ASI P0B Bounded Discovery Candidates v1',
  upstream_workflow_path: '.github/workflows/kidults-asi-p0b-bounded-discovery-candidates-v1.yml',
  upstream_run_id: '8002',
}, contract, contractText);
assert(first.upstream_class === 'ASI_SOURCE_ACQUISITION_CASCADE', 'SOURCE_ACQUISITION_CLASS');
assert(first.canonical_key === sameClassDifferentRun.canonical_key, 'SAME_SHA_GROUPED_CLASS_NOT_CANONICALIZED');
assert(first.concurrency_group === sameClassDifferentRun.concurrency_group, 'SAME_KEY_CONCURRENCY_GROUP_MISMATCH');
assert(first.dedupe_eligible === true && first.runtime_dedupe_state === 'REMOTE_LEDGER_ACTIVATION_HOLD', 'SUCCESS_HOLD_CLASSIFICATION');
assert(first.ephemeral_actions_alias_eligible === true, 'GROUPED_SUCCESS_EPHEMERAL_ALIAS_ELIGIBILITY');
assert(first.canonical_input_digest === sameClassDifferentRun.canonical_input_digest, 'GROUPED_SUCCESS_CANONICAL_INPUT_DIGEST_DRIFT');
assert(first.canonical_execution_claimed === false && first.alias === false, 'UNPROVEN_LEADER_OR_ALIAS_CLAIM');

const otherSha = classifyCanonicalIdentity({ ...base, source_sha: shaB, run_id: '9003', upstream_run_id: '8003' }, contract, contractText);
assert(otherSha.canonical_key !== first.canonical_key, 'DIFFERENT_SOURCE_SHA_COLLISION');
const otherClass = classifyCanonicalIdentity({
  ...base,
  run_id: '9004',
  upstream_workflow_name: 'KIDULTS ASI Snapshot Readiness Factory v2',
  upstream_workflow_path: '.github/workflows/kidults-asi-snapshot-readiness-factory-v2.yml',
  upstream_run_id: '8004',
}, contract, contractText);
assert(otherClass.upstream_class === 'ASI_SNAPSHOT_READINESS' && otherClass.canonical_key !== first.canonical_key, 'DIFFERENT_UPSTREAM_CLASS_COLLISION');

const exactClasses = [
  ['KIDULTS ASI Requirement-to-Adapter Coverage v1', '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml', 'ASI_REQUIREMENT_COVERAGE'],
  ['KIDULTS ASI Sharded Source Reserve v1', '.github/workflows/kidults-asi-sharded-source-reserve-v1.yml', 'ASI_SHARDED_SOURCE_RESERVE'],
  ['KIDULTS ASI SHADOW Operating Evidence v1', '.github/workflows/kidults-asi-shadow-operating-evidence-v1.yml', 'ASI_SHADOW_OPERATING_EVIDENCE'],
];
const exactKeys = new Set();
let exactBurstCases = 0;
for (const [name, sourcePath, expectedClass] of exactClasses) {
  const classIndex = exactKeys.size;
  const classified = classifyCanonicalIdentity({ ...base, run_id: String(9100 + classIndex), upstream_run_id: String(8100 + classIndex), upstream_workflow_name: name, upstream_workflow_path: sourcePath }, contract, contractText);
  assert(classified.upstream_class === expectedClass && classified.special_exact_artifact_class === true, `SPECIAL_CLASS_INVALID:${expectedClass}`);
  assert(classified.ephemeral_actions_alias_eligible === false, `SPECIAL_CLASS_ALIAS_FORBIDDEN:${expectedClass}`);
  assert(classified.dedupe_eligible === false, `SPECIAL_CLASS_DEDUPE_FORBIDDEN:${expectedClass}`);
  assert(classified.generation_discriminator === `exact-upstream-run:${8100 + classIndex}:attempt:1`, `SPECIAL_CLASS_EXACT_DISCRIMINATOR:${expectedClass}`);
  const burst = [0, 1, 2].map((offset) => classifyCanonicalIdentity({
    ...base,
    run_id: String(9600 + (classIndex * 10) + offset),
    upstream_run_id: String(8600 + (classIndex * 10) + offset),
    upstream_workflow_name: name,
    upstream_workflow_path: sourcePath,
  }, contract, contractText));
  assert(new Set(burst.map((entry) => entry.canonical_key)).size === 3, `SPECIAL_CLASS_THREE_WAY_KEY_COLLISION:${expectedClass}`);
  assert(new Set(burst.map((entry) => entry.concurrency_group)).size === 3, `SPECIAL_CLASS_THREE_WAY_CONCURRENCY_COLLISION:${expectedClass}`);
  assert(new Set(burst.map((entry) => entry.canonical_input_digest)).size === 3, `SPECIAL_CLASS_THREE_WAY_INPUT_COLLISION:${expectedClass}`);
  const duplicateConsumer = classifyCanonicalIdentity({
    ...base,
    run_id: String(9700 + classIndex),
    upstream_run_id: String(8600 + (classIndex * 10)),
    upstream_workflow_name: name,
    upstream_workflow_path: sourcePath,
  }, contract, contractText);
  assert(duplicateConsumer.canonical_key === burst[0].canonical_key && duplicateConsumer.concurrency_group === burst[0].concurrency_group,
    `SPECIAL_CLASS_SAME_UPSTREAM_NOT_SERIALIZED:${expectedClass}`);
  const upstreamAttemptTwo = classifyCanonicalIdentity({
    ...base,
    run_id: String(9800 + classIndex),
    upstream_run_id: String(8600 + (classIndex * 10)),
    upstream_run_attempt: '2',
    upstream_workflow_name: name,
    upstream_workflow_path: sourcePath,
  }, contract, contractText);
  assert(upstreamAttemptTwo.generation_discriminator === `exact-upstream-run:${8600 + (classIndex * 10)}:attempt:2`,
    `SPECIAL_CLASS_ATTEMPT_DISCRIMINATOR:${expectedClass}`);
  assert(upstreamAttemptTwo.canonical_key !== burst[0].canonical_key && upstreamAttemptTwo.concurrency_group !== burst[0].concurrency_group,
    `SPECIAL_CLASS_ATTEMPT_COLLISION:${expectedClass}`);
  exactBurstCases += 1;
  exactKeys.add(classified.canonical_key);
}
assert(exactKeys.size === exactClasses.length, 'SPECIAL_EXACT_CLASSES_NOT_DISTINCT');

const dynamicArl = classifyCanonicalIdentity({
  ...base,
  run_id: '9850',
  upstream_run_id: '8850',
  upstream_workflow_name: `KIDULTS ARL / recovery-${shaA}`,
  upstream_workflow_path: '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml',
}, contract, contractText);
assert(dynamicArl.upstream_class === 'ASI_SOURCE_ACQUISITION_CASCADE', 'ARL_DYNAMIC_RUN_NAME_NOT_PATH_BOUND');
const dynamicCoverage = classifyCanonicalIdentity({
  ...base,
  run_id: '9851',
  upstream_run_id: '8851',
  upstream_workflow_name: `KIDULTS Coverage / source-${shaA}`,
  upstream_workflow_path: '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',
  upstream_conclusion: 'skipped',
}, contract, contractText);
assert(dynamicCoverage.upstream_class === 'ASI_REQUIREMENT_COVERAGE' && dynamicCoverage.terminal_observation_non_dedupable === true, 'COVERAGE_DYNAMIC_RUN_NAME_NOT_PATH_BOUND');

for (const conclusion of ['failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped', 'stale']) {
  const terminal = classifyCanonicalIdentity({ ...base, run_id: '9201', upstream_run_id: '8201', upstream_conclusion: conclusion }, contract, contractText);
  const otherTerminal = classifyCanonicalIdentity({ ...base, run_id: '9202', upstream_run_id: '8202', upstream_conclusion: conclusion }, contract, contractText);
  assert(terminal.state === 'TERMINAL_OBSERVATION_NON_DEDUPABLE', `TERMINAL_STATE:${conclusion}`);
  assert(terminal.dedupe_eligible === false && terminal.terminal_observation_non_dedupable === true, `TERMINAL_DEDUPE_FORBIDDEN:${conclusion}`);
  assert(terminal.ephemeral_actions_alias_eligible === false, `TERMINAL_ALIAS_FORBIDDEN:${conclusion}`);
  assert(terminal.canonical_key !== otherTerminal.canonical_key, `TERMINAL_RUN_COLLISION:${conclusion}`);
}

const scheduledA = classifyCanonicalIdentity({ ...base, run_id: '9301', upstream_run_id: '8301', upstream_event: 'schedule', upstream_created_at: '2026-08-29T23:31:01.000Z' }, contract, contractText);
const scheduledSameSlot = classifyCanonicalIdentity({ ...base, run_id: '9302', upstream_run_id: '8302', upstream_event: 'schedule', upstream_created_at: '2026-08-29T23:49:59.000Z' }, contract, contractText);
const scheduledNextSlot = classifyCanonicalIdentity({ ...base, run_id: '9303', upstream_run_id: '8303', upstream_event: 'schedule', upstream_created_at: '2026-08-30T00:00:00.000Z' }, contract, contractText);
assert(scheduledA.canonical_key === scheduledSameSlot.canonical_key, 'SAME_LOGICAL_SCHEDULE_SLOT_NOT_DEDUPED');
assert(scheduledA.canonical_key !== scheduledNextSlot.canonical_key, 'NEXT_LOGICAL_SCHEDULE_SLOT_SUPPRESSED');

const directScheduleA = classifyCanonicalIdentity({
  event_name: 'schedule', repository: base.repository, source_sha: shaA, run_id: '9401', run_attempt: '1',
  observed_at: '2026-08-29T23:18:00.000Z', schedule_expression: '17,47 * * * *',
}, contract, contractText);
const directScheduleB = classifyCanonicalIdentity({
  event_name: 'schedule', repository: base.repository, source_sha: shaA, run_id: '9402', run_attempt: '1',
  observed_at: '2026-08-29T23:28:00.000Z', schedule_expression: '17,47 * * * *',
}, contract, contractText);
const directScheduleNext = classifyCanonicalIdentity({
  event_name: 'schedule', repository: base.repository, source_sha: shaA, run_id: '9403', run_attempt: '1',
  observed_at: '2026-08-29T23:47:00.000Z', schedule_expression: '17,47 * * * *',
}, contract, contractText);
assert(directScheduleA.canonical_key === directScheduleB.canonical_key && directScheduleA.canonical_key !== directScheduleNext.canonical_key, 'DIRECT_WATCHDOG_SLOT_SEMANTICS');

const manualA = classifyCanonicalIdentity({ event_name: 'workflow_dispatch', repository: base.repository, source_sha: shaA, run_id: '9501', run_attempt: '1', observed_at: base.observed_at }, contract, contractText);
const manualB = classifyCanonicalIdentity({ event_name: 'workflow_dispatch', repository: base.repository, source_sha: shaA, run_id: '9502', run_attempt: '1', observed_at: base.observed_at }, contract, contractText);
assert(manualA.dedupe_eligible === false && manualA.canonical_key !== manualB.canonical_key, 'MANUAL_REQUEST_IDENTITY_NOT_PRESERVED');
assert(manualA.ephemeral_actions_alias_eligible === false, 'MANUAL_ALIAS_FORBIDDEN');

const upstreamManual = classifyCanonicalIdentity({
  ...base,
  run_id: '9510',
  upstream_run_id: '8510',
  upstream_event: 'workflow_dispatch',
}, contract, contractText);
assert(upstreamManual.dedupe_eligible === false && upstreamManual.ephemeral_actions_alias_eligible === false, 'UPSTREAM_MANUAL_ALIAS_FORBIDDEN');
assert(upstreamManual.generation_discriminator === 'upstream-manual-run:8510:attempt:1', 'UPSTREAM_MANUAL_REQUEST_IDENTITY');

const upstreamRecovery = classifyCanonicalIdentity({
  ...base,
  run_id: '9511',
  upstream_run_id: '8511',
  upstream_run_attempt: '2',
}, contract, contractText);
assert(upstreamRecovery.dedupe_eligible === false && upstreamRecovery.ephemeral_actions_alias_eligible === false, 'UPSTREAM_RECOVERY_ALIAS_FORBIDDEN');
assert(upstreamRecovery.generation_discriminator === 'upstream-recovery-run:8511:attempt:2', 'UPSTREAM_RECOVERY_IDENTITY');

const consumerRerun = classifyCanonicalIdentity({ ...base, run_attempt: '2' }, contract, contractText);
assert(consumerRerun.ephemeral_actions_alias_eligible === false, 'CONSUMER_RERUN_ALIAS_FORBIDDEN');
assert(directScheduleA.ephemeral_actions_alias_eligible === false, 'DIRECT_SCHEDULE_ALIAS_FORBIDDEN');
assert(otherClass.ephemeral_actions_alias_eligible === false, 'SNAPSHOT_ALIAS_FORBIDDEN');

const negativeCases = [
  ['UNKNOWN_WORKFLOW', { ...base, upstream_workflow_name: 'UNKNOWN' }],
  ['WORKFLOW_PATH_MISMATCH', { ...base, upstream_workflow_path: '.github/workflows/other.yml' }],
  ['ARL_DYNAMIC_NAME_SHA_MALFORMED', { ...base, upstream_workflow_name: 'KIDULTS ARL / recovery-main', upstream_workflow_path: '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml' }],
  ['COVERAGE_DYNAMIC_NAME_CROSS_PATH', { ...base, upstream_workflow_name: `KIDULTS Coverage / source-${shaA}`, upstream_workflow_path: '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml' }],
  ['SOURCE_SHA_INVALID', { ...base, source_sha: 'bad' }],
  ['UPSTREAM_CONCLUSION_INVALID', { ...base, upstream_conclusion: 'queued' }],
  ['UPSTREAM_EVENT_INVALID', { ...base, upstream_event: 'repository_dispatch' }],
];
for (const [name, fixture] of negativeCases) {
  let rejected = false;
  try { classifyCanonicalIdentity(fixture, contract, contractText); } catch { rejected = true; }
  assert(rejected, `NEGATIVE_NOT_REJECTED:${name}`);
}

const weakened = structuredClone(contract);
weakened.runtime_dedupe.state = 'ACTIVE';
let weakenedRejected = false;
try { validateCanonicalIdentityContract(weakened); } catch { weakenedRejected = true; }
assert(weakenedRejected, 'UNPROVEN_RUNTIME_ACTIVATION_NOT_REJECTED');

process.stdout.write(`${JSON.stringify({
  id: 'kidults-continuous-assurance-canonical-identity-validation-v1',
  state: 'VERIFIED_PASS',
  allowlisted_workflows: contract.workflow_run_class_allowlist.length,
  grouped_source_acquisition_workflows: contract.workflow_run_class_allowlist.filter((entry) => entry.upstream_class === 'ASI_SOURCE_ACQUISITION_CASCADE').length,
  grouped_adapter_evidence_workflows: contract.workflow_run_class_allowlist.filter((entry) => entry.upstream_class === 'ASI_ADAPTER_EVIDENCE_CASCADE').length,
  grouped_control_plane_workflows: contract.workflow_run_class_allowlist.filter((entry) => entry.upstream_class === 'KPMO_CONTROL_PLANE_VALIDATORS').length,
  special_exact_artifact_classes: exactKeys.size,
  special_exact_three_way_bursts_isolated: exactBurstCases,
  special_exact_upstream_attempts_isolated: exactBurstCases,
  non_success_conclusions_non_dedupable: 7,
  negative_cases_rejected: negativeCases.length + 1,
  runtime_dedupe_state: contract.runtime_dedupe.state,
  canonical_execution_claimed: false,
  detector_authority: contract.truth_boundary.detector_authority,
  public: contract.truth_boundary.public,
  production: contract.truth_boundary.production,
  g5: contract.truth_boundary.g5,
}, null, 2)}\n`);
