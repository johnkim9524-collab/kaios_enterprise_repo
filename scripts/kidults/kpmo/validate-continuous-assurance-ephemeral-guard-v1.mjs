#!/usr/bin/env node
import fs from 'node:fs';
import {
  classifyCanonicalIdentity,
  stableJson,
} from './classify-continuous-assurance-canonical-identity-v1.mjs';
import {
  resolveEphemeralGuard,
  receiptDigestWithoutObservation,
  sha256,
} from './resolve-continuous-assurance-ephemeral-guard-v1.mjs';
import {
  reconstructArtifactLineage,
} from './reconstruct-continuous-assurance-artifact-lineage-v1.mjs';

const contractPath = 'coordination/kidults/kpmo/continuous-assurance-canonical-identity-v1.json';
const contractText = fs.readFileSync(contractPath, 'utf8');
const contract = JSON.parse(contractText);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sourceSha = 'a'.repeat(40);
const observedAt = '2026-08-29T23:59:00.000Z';

const classifierInput = {
  event_name: 'workflow_run',
  repository: 'johnkim9524-collab/kaios_enterprise_repo',
  source_sha: sourceSha,
  run_id: '9001',
  run_attempt: '1',
  observed_at: observedAt,
  upstream_workflow_name: 'KIDULTS ASI P0 Mission Consumption v1',
  upstream_workflow_path: '.github/workflows/kidults-asi-p0-mission-consumption-v1.yml',
  upstream_event: 'push',
  upstream_run_id: '8001',
  upstream_run_attempt: '1',
  upstream_conclusion: 'success',
  upstream_created_at: '2026-08-29T23:58:00.000Z',
};

function currentFrom(classified) {
  return {
    repository: classified.repository,
    source_sha: classified.source_sha,
    source_kind: 'PROTECTED_MAIN_WORKFLOW_RUN',
    trigger_event: classified.trigger_event,
    run_id: classified.workflow_run_id,
    run_attempt: classified.workflow_run_attempt,
    canonical_key: classified.canonical_key,
    canonical_input_digest: classified.canonical_input_digest,
    upstream_class: classified.upstream_class,
    generation_discriminator: classified.generation_discriminator,
    classifier_contract_digest: classified.classifier_contract_digest,
    classification_receipt_digest: classified.receipt_digest,
    dedupe_eligible: classified.dedupe_eligible,
    terminal_observation_non_dedupable: classified.terminal_observation_non_dedupable,
    special_exact_artifact_class: classified.special_exact_artifact_class,
    ephemeral_actions_alias_eligible: classified.ephemeral_actions_alias_eligible,
    upstream: classified.upstream,
  };
}

const classification = classifyCanonicalIdentity(classifierInput, contract, contractText);
const current = currentFrom(classification);
const canonicalArtifactName = `kidults-continuous-assurance-canonical-${classification.canonical_key.slice('sha256:'.length)}`;

function leaderCandidate(runId = 7001) {
  const run = {
    id: runId,
    run_attempt: 1,
    name: 'KIDULTS Platform Continuous Assurance V1',
    path: '.github/workflows/kidults-platform-continuous-assurance-v1.yml',
    repository: { full_name: current.repository },
    head_branch: 'main',
    head_sha: 'b'.repeat(40),
    event: 'workflow_run',
    status: 'completed',
    conclusion: 'success',
  };
  const guardDigest = `sha256:${'c'.repeat(64)}`;
  const classificationDigest = `sha256:${'d'.repeat(64)}`;
  const stableReceipt = {
    schema_version: '1.0.0',
    receipt_type: 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE',
    source: { sha: sourceSha, expected_sha: sourceSha, actual_sha: sourceSha, match: true },
    execution: {
      profile: 'sentinel',
      trigger: 'workflow_run',
      workflow_run_id: String(runId),
      workflow_run_attempt: '1',
      canonical_identity: {
        canonical_key: classification.canonical_key,
        canonical_input_digest: classification.canonical_input_digest,
        source_sha: sourceSha,
        upstream_class: classification.upstream_class,
        generation_discriminator: classification.generation_discriminator,
        classifier_contract_digest: classification.classifier_contract_digest,
        classification_receipt_digest: classificationDigest,
        ephemeral_guard_receipt_digest: guardDigest,
        runtime_dedupe_state: 'REMOTE_LEDGER_ACTIVATION_HOLD',
        canonical_execution_claimed: false,
        ephemeral_actions_leader: true,
        alias: false,
        canonical_run_id: runId,
        canonical_run_attempt: 1,
        claim_scope: 'EPHEMERAL_ACTIONS_ARTIFACT_90_DAY',
      },
    },
    states: {
      internal_control_state: 'VERIFIED_PASS',
      external_empirical_state: 'HOLD',
      release_state: 'HOLD',
      overall_state: 'HOLD',
      promotion_eligible: false,
    },
    checks: [],
    unresolved_gates: [],
    evidence: [],
  };
  const receipt = {
    ...stableReceipt,
    observed_at: '2026-08-29T23:40:00.000Z',
    receipt_digest: sha256(stableJson(stableReceipt)),
  };
  return {
    run,
    artifact: {
      id: runId + 100,
      name: canonicalArtifactName,
      expired: false,
      size_in_bytes: 4096,
      digest: `sha256:${'e'.repeat(64)}`,
      expires_at: '2026-11-27T23:40:00.000Z',
      workflow_run: { id: runId, head_sha: run.head_sha },
    },
    receipt,
  };
}

function input(candidates = [], readback = {}) {
  return {
    observed_at: observedAt,
    current,
    readback: {
      state: 'COMPLETE',
      total_count: candidates.length,
      returned_count: candidates.length,
      reason_codes: [],
      ...readback,
    },
    candidates,
  };
}

const zero = resolveEphemeralGuard(input(), contract);
assert(zero.state === 'EPHEMERAL_CANONICAL_LEADER_SELECTED' && zero.execute_full_audit === true && zero.ephemeral_actions_leader === true, 'ZERO_CANDIDATE_LEADER');
assert(zero.guard.canonical_execution_claimed === false && zero.guard.runtime_dedupe_state === 'REMOTE_LEDGER_ACTIVATION_HOLD', 'LEADER_DURABLE_CLAIM_FORBIDDEN');

const leader = leaderCandidate();
const one = resolveEphemeralGuard(input([leader]), contract);
assert(one.state === 'DEDUPED_ALIAS' && one.execute_full_audit === false && one.fail_closed === false, 'ONE_VALID_LEADER_ALIAS');
assert(one.alias_receipt.execution.canonical_identity.canonical_run_id === leader.run.id, 'ALIAS_CANONICAL_RUN_BINDING');
assert(one.alias_receipt.execution.canonical_identity.canonical_artifact_digest === leader.artifact.digest, 'ALIAS_ARTIFACT_DIGEST_BINDING');
assert(one.alias_receipt.execution.canonical_identity.canonical_receipt_digest === leader.receipt.receipt_digest, 'ALIAS_RECEIPT_DIGEST_BINDING');
assert(one.alias_receipt.receipt_digest === receiptDigestWithoutObservation(one.alias_receipt), 'ALIAS_OWN_DIGEST');
assert(one.remediation_plan.source_receipt_digest === one.alias_receipt.receipt_digest && one.remediation_plan.activation.eligible === false, 'ALIAS_PLAN_BINDING');

const repositoryArtifactWithoutEmbeddedLineage = structuredClone(leader.artifact);
delete repositoryArtifactWithoutEmbeddedLineage.workflow_run;
const runScopedArtifact = structuredClone(repositoryArtifactWithoutEmbeddedLineage);
const lineageInput = {
  repository_artifact: repositoryArtifactWithoutEmbeddedLineage,
  run: leader.run,
  run_artifact_index: { total_count: 1, artifacts: [runScopedArtifact] },
  receipt: leader.receipt,
};
const reconstructed = reconstructArtifactLineage(lineageInput);
assert(reconstructed.workflow_run.id === leader.run.id && reconstructed.workflow_run.head_sha === leader.run.head_sha, 'RUN_SCOPED_LINEAGE_RECONSTRUCTION');
assert(reconstructed.lineage_resolution === 'RUN_SCOPED_ARTIFACT_MEMBERSHIP', 'RUN_SCOPED_LINEAGE_MODE');
const lineageMutations = [
  ['MEMBERSHIP_MISSING', (x) => { x.run_artifact_index = { total_count: 0, artifacts: [] }; }],
  ['READBACK_TRUNCATED', (x) => { x.run_artifact_index.total_count = 2; }],
  ['METADATA_DRIFT', (x) => { x.run_artifact_index.artifacts[0].digest = `sha256:${'0'.repeat(64)}`; }],
  ['RECEIPT_RUN_DRIFT', (x) => { x.receipt.execution.workflow_run_id = '7002'; }],
  ['RECEIPT_SOURCE_DRIFT', (x) => { x.receipt.source.actual_sha = '0'.repeat(40); }],
  ['EMBEDDED_REPOSITORY_CONTRADICTION', (x) => { x.repository_artifact.workflow_run = { id: 7002, head_sha: x.run.head_sha }; }],
  ['EMBEDDED_RUN_SCOPED_CONTRADICTION', (x) => { x.run_artifact_index.artifacts[0].workflow_run = { id: 7002, head_sha: x.run.head_sha }; }],
];
for (const [name, mutate] of lineageMutations) {
  const candidate = structuredClone(lineageInput);
  mutate(candidate);
  let rejected = false;
  try { reconstructArtifactLineage(candidate); } catch { rejected = true; }
  assert(rejected, `RUN_SCOPED_LINEAGE_MUTATION_NOT_REJECTED:${name}`);
}

const two = resolveEphemeralGuard(input([leaderCandidate(7001), leaderCandidate(7002)]), contract);
assert(two.state === 'INPUT_DIVERGENCE_HOLD' && two.fail_closed === true && two.execute_full_audit === false, 'MULTIPLE_LEADERS_FAIL_CLOSED');

const incomplete = resolveEphemeralGuard(input([], { total_count: 1, returned_count: 0, reason_codes: ['API_TRUNCATED'] }), contract);
assert(incomplete.state === 'INPUT_DIVERGENCE_HOLD' && incomplete.fail_closed === true, 'INCOMPLETE_READBACK_FAIL_CLOSED');

const expired = leaderCandidate();
expired.artifact.expired = true;
const postRetention = resolveEphemeralGuard(input([expired]), contract);
assert(postRetention.state === 'EPHEMERAL_CANONICAL_LEADER_SELECTED' && postRetention.execute_full_audit === true, 'POST_RETENTION_REPLAY_MUST_EXECUTE');

const mutationCases = [
  ['ARTIFACT_NAME', (x) => { x.artifact.name = 'wrong'; }],
  ['ARTIFACT_DIGEST', (x) => { x.artifact.digest = ''; }],
  ['ARTIFACT_SIZE', (x) => { x.artifact.size_in_bytes = 5 * 1024 * 1024; }],
  ['ARTIFACT_EXPIRY', (x) => { x.artifact.expires_at = '2026-08-01T00:00:00.000Z'; }],
  ['ARTIFACT_RUN', (x) => { x.artifact.workflow_run.id += 1; }],
  ['ARTIFACT_SHA', (x) => { x.artifact.workflow_run.head_sha = 'f'.repeat(40); }],
  ['RUN_NAME', (x) => { x.run.name = 'wrong'; }],
  ['RUN_PATH', (x) => { x.run.path = '.github/workflows/wrong.yml'; }],
  ['RUN_REPOSITORY', (x) => { x.run.repository.full_name = 'wrong/repo'; }],
  ['RUN_BRANCH', (x) => { x.run.head_branch = 'feature'; }],
  ['RUN_EVENT', (x) => { x.run.event = 'push'; }],
  ['RUN_STATUS', (x) => { x.run.status = 'in_progress'; }],
  ['RUN_CONCLUSION', (x) => { x.run.conclusion = 'failure'; }],
  ['CURRENT_RUN', (x) => { x.run.id = current.run_id; x.artifact.workflow_run.id = current.run_id; x.receipt.execution.workflow_run_id = String(current.run_id); x.receipt.execution.canonical_identity.canonical_run_id = current.run_id; }],
  ['RECEIPT_TAMPER', (x) => { x.receipt.states.overall_state = 'GREEN'; }],
  ['ALIAS_AS_LEADER', (x) => { x.receipt.receipt_type = 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE_ALIAS'; x.receipt.execution.canonical_identity.alias = true; x.receipt.receipt_digest = receiptDigestWithoutObservation(x.receipt); }],
  ['CANONICAL_KEY', (x) => { x.receipt.execution.canonical_identity.canonical_key = `sha256:${'0'.repeat(64)}`; x.receipt.receipt_digest = receiptDigestWithoutObservation(x.receipt); }],
  ['CANONICAL_INPUT', (x) => { x.receipt.execution.canonical_identity.canonical_input_digest = `sha256:${'0'.repeat(64)}`; x.receipt.receipt_digest = receiptDigestWithoutObservation(x.receipt); }],
  ['CANONICAL_SOURCE', (x) => { x.receipt.execution.canonical_identity.source_sha = '0'.repeat(40); x.receipt.receipt_digest = receiptDigestWithoutObservation(x.receipt); }],
  ['CANONICAL_CLASS', (x) => { x.receipt.execution.canonical_identity.upstream_class = 'WRONG_CLASS'; x.receipt.receipt_digest = receiptDigestWithoutObservation(x.receipt); }],
  ['CANONICAL_GENERATION', (x) => { x.receipt.execution.canonical_identity.generation_discriminator = 'wrong'; x.receipt.receipt_digest = receiptDigestWithoutObservation(x.receipt); }],
  ['CANONICAL_CONTRACT', (x) => { x.receipt.execution.canonical_identity.classifier_contract_digest = `sha256:${'0'.repeat(64)}`; x.receipt.receipt_digest = receiptDigestWithoutObservation(x.receipt); }],
  ['DURABLE_CLAIM_FALSE_REQUIRED', (x) => { x.receipt.execution.canonical_identity.canonical_execution_claimed = true; x.receipt.receipt_digest = receiptDigestWithoutObservation(x.receipt); }],
];
for (const [name, mutate] of mutationCases) {
  const candidate = leaderCandidate();
  mutate(candidate);
  const result = resolveEphemeralGuard(input([candidate]), contract);
  assert(result.state === 'INPUT_DIVERGENCE_HOLD' && result.fail_closed === true && !result.alias_receipt, `MUTATION_NOT_REJECTED:${name}`);
}

const bypassFixtures = [
  classifyCanonicalIdentity({ ...classifierInput, run_attempt: '2' }, contract, contractText),
  classifyCanonicalIdentity({ ...classifierInput, upstream_run_attempt: '2' }, contract, contractText),
  classifyCanonicalIdentity({ ...classifierInput, upstream_event: 'workflow_dispatch' }, contract, contractText),
  classifyCanonicalIdentity({ ...classifierInput, upstream_conclusion: 'failure' }, contract, contractText),
  classifyCanonicalIdentity({
    ...classifierInput,
    upstream_workflow_name: 'KIDULTS ASI Requirement-to-Adapter Coverage v1',
    upstream_workflow_path: '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',
  }, contract, contractText),
  classifyCanonicalIdentity({
    ...classifierInput,
    upstream_workflow_name: 'KIDULTS ASI Snapshot Readiness Factory v2',
    upstream_workflow_path: '.github/workflows/kidults-asi-snapshot-readiness-factory-v2.yml',
  }, contract, contractText),
  classifyCanonicalIdentity({
    ...classifierInput,
    upstream_workflow_name: 'KPMO Live Canonical Issue Truth V1',
    upstream_workflow_path: '.github/workflows/kpmo-live-canonical-issue-truth-v1.yml',
  }, contract, contractText),
  classifyCanonicalIdentity({
    event_name: 'workflow_dispatch', repository: classifierInput.repository, source_sha: sourceSha,
    run_id: '9901', run_attempt: '1', observed_at: observedAt,
  }, contract, contractText),
  classifyCanonicalIdentity({
    event_name: 'schedule', repository: classifierInput.repository, source_sha: sourceSha,
    run_id: '9902', run_attempt: '1', observed_at: observedAt, schedule_expression: '17,47 * * * *',
  }, contract, contractText),
];
for (const fixture of bypassFixtures) {
  const result = resolveEphemeralGuard({
    observed_at: observedAt,
    current: currentFrom(fixture),
    readback: { state: 'BYPASS', total_count: 0, returned_count: 0, reason_codes: [] },
    candidates: [],
  }, contract);
  assert(result.state === 'FULL_AUDIT_BYPASS_NON_ALIASABLE' && result.execute_full_audit === true && !result.alias_receipt, `BYPASS_FAILED:${fixture.upstream_class}`);
}

process.stdout.write(`${JSON.stringify({
  id: 'kidults-continuous-assurance-ephemeral-guard-validation-v1',
  state: 'VERIFIED_PASS',
  leader_cardinality_cases: 3,
  post_retention_replay_executes: true,
  mutation_cases_rejected: mutationCases.length,
  bypass_cases: bypassFixtures.length,
  alias_receipt_digest_bound: true,
  run_scoped_lineage_reconstruction: true,
  run_scoped_lineage_mutations_rejected: lineageMutations.length,
  canonical_execution_claimed: false,
  runtime_dedupe_state: 'REMOTE_LEDGER_ACTIVATION_HOLD',
  public: 'HOLD',
  production: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
}, null, 2)}\n`);
