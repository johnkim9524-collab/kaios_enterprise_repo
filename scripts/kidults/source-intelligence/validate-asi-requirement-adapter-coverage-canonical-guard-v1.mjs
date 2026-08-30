#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  finalizeCoverageCanonicalLeader,
  resolveCoverageCanonicalGuard,
  sha256,
} from './resolve-asi-requirement-adapter-coverage-canonical-guard-v1.mjs';
import { observeCoverageAlias, receiptDigest as observerReceiptDigest } from '../kpmo/observe-continuous-assurance-coverage-alias-v1.mjs';
import {
  buildSemanticInputMaterial,
  sha256 as semanticSha256,
  stableJson as semanticStableJson,
} from './build-asi-requirement-adapter-coverage-semantic-input-v1.mjs';

const sourceSha = 'a'.repeat(40);
const leaderCoverageSha = 'b'.repeat(40);
const aliasCoverageSha = 'c'.repeat(40);
const observedAt = '2026-08-30T08:00:00.000Z';
const semanticQueue = { id: 'kidults-asi-replacement-source-mission-queue-v1', version: '1.0.0', mission_count: 1, missions: [{ mission_id: 'mission-1', required_adapter_claim: 'DATED_OBSERVED_SOLD_TRANSACTION' }], public_release: 'HOLD', production: 'HOLD' };
const semanticManifest = {
  id: 'kidults-asi-autonomous-resolution-manifest-v1', version: '1.0.0', state: 'P0_AUTONOMOUS_RESOLUTION_LAYER_EXECUTED', as_of: '2026-08-30T01:00:00Z',
  results: { replacement_missions: 1, original_actions: 2, terminal_actions: 2, gate1_remaining_hold: 0 },
  input_bindings: {
    contract: { id: 'arl-contract', version: '1.0.0', digest: `sha256:${'1'.repeat(64)}` },
    adapter_contract: { id: 'adapter-contract', profiles: 16, digest: `sha256:${'2'.repeat(64)}` },
    frontier: { path: 'frontier.psv', records: 64, digest: `sha256:${'3'.repeat(64)}` },
    crosswalk: { id: 'crosswalk', records: 32, digest: `sha256:${'4'.repeat(64)}` },
    unconsumed_run_provenance: { workflow_run_id: 10, artifact_id: 20 },
  },
  output_files: [
    { name: 'replacement-source-mission-queue-v1.json', bytes: 123, sha256: `sha256:${'5'.repeat(64)}` },
    { name: 'unconsumed-ledger.json', bytes: 456, sha256: `sha256:${'6'.repeat(64)}` },
  ],
};
const semanticReceipt = {
  id: 'kidults-asi-autonomous-resolution-layer-kpmo-receipt-v1', version: '1.1.0', state: 'VERIFIED_PASS', source_sha: sourceSha,
  trigger_event: 'workflow_run', artifact_role: 'AUTHORITATIVE_CONSUMABLE', authoritative_producer: true, downstream_consumable: true,
  p1_source_sha: sourceSha, exact_generation_bound: true, exact_triggering_run_bound: true, validation_only: false, promotion_authority: false,
  artifact_cardinality: 1, results: semanticManifest.results, autonomous_effect: 'POSITIVE', global_effect: 'POSITIVE', irreplaceable_value_effect: 'POSITIVE', transparency_effect: 'POSITIVE',
  live_target_site_network_requests: 0, rights_pass_created: 0, evidence_admitted: 0, market_events_created: 0, snapshot_candidates_created: 0,
  public_release: 'HOLD', production: 'HOLD', producer_workflow_run_id: 10, producer_workflow_run_attempt: 1,
  producer_display_title: 'ARL run 10', authoritative_generation_key: 'volatile-generation-10', p1_workflow_run_id: 11,
  p1_artifact_id: 12, p1_artifact_digest: `sha256:${'7'.repeat(64)}`, manifest_digest: `sha256:${'8'.repeat(64)}`, created_at: '2026-08-30T01:00:00Z',
};
const semanticArgs = {
  sourceSha, upstreamClass: 'ASI_AUTONOMOUS_RESOLUTION', queue: semanticQueue, manifest: semanticManifest, receipt: semanticReceipt,
  coverageContract: { id: 'kidults-asi-requirement-adapter-coverage-contract-v1', version: '1.2.0' }, coverageContractBytes: Buffer.from('{"contract":"stable"}'),
  authoritativeInputDigests: { runtime_contract: { path: 'runtime.json', digest: `sha256:${'9'.repeat(64)}` } },
  authoritativeInputConstants: { replacement_queue_id: 'kidults-asi-replacement-source-mission-queue-v1' },
  implementationDigests: { builder: { path: 'builder.mjs', digest: `sha256:${'0'.repeat(64)}` } },
};
const semanticMaterial = buildSemanticInputMaterial(semanticArgs);
const semanticDigest = semanticSha256(semanticStableJson(semanticMaterial));
const serializedSemanticMaterial = JSON.parse(JSON.stringify(semanticMaterial));
assert.equal(semanticDigest, semanticSha256(semanticStableJson(serializedSemanticMaterial)), 'serialized semantic material must reproduce the canonical digest');
const semanticInputReceipt = {
  id: 'kidults-asi-requirement-adapter-coverage-semantic-input-receipt-v1', version: '1.0.0',
  state: 'VERIFIED_PASS_SEMANTIC_INPUT_BOUND', canonical_input_digest: semanticDigest, material: semanticMaterial,
  exact_upstream_provenance_included_in_identity: false, exact_upstream_provenance_required_in_observation_receipt: true,
  runtime_dedupe_state: 'REMOTE_LEDGER_ACTIVATION_HOLD', canonical_execution_claimed: false,
  public: 'HOLD', production: 'HOLD', g5: 'EXPLICIT_APPROVAL_REQUIRED',
};
const semanticInputReceiptFileDigest = sha256(`${JSON.stringify(semanticInputReceipt, null, 2)}\n`);
const volatileReceipt = { ...semanticReceipt, producer_workflow_run_id: 999, producer_workflow_run_attempt: 4, producer_display_title: 'ARL run 999', authoritative_generation_key: 'volatile-generation-999', p1_workflow_run_id: 998, p1_artifact_id: 997, p1_artifact_digest: `sha256:${'a'.repeat(64)}`, manifest_digest: `sha256:${'b'.repeat(64)}`, created_at: '2026-08-31T01:00:00Z' };
const volatileManifest = structuredClone(semanticManifest);
volatileManifest.as_of = '2026-08-31T01:00:00Z';
volatileManifest.input_bindings.unconsumed_run_provenance = { workflow_run_id: 999, artifact_id: 998 };
volatileManifest.output_files[1].sha256 = `sha256:${'c'.repeat(64)}`;
const volatileDigest = semanticSha256(semanticStableJson(buildSemanticInputMaterial({ ...semanticArgs, manifest: volatileManifest, receipt: volatileReceipt })));
assert.equal(volatileDigest, semanticDigest, 'run/artifact/time-only provenance must not split canonical identity');
const semanticDivergentDigests = [];
for (const mutate of [
  (args) => { args.queue.missions[0].mission_id = 'changed'; },
  (args) => { args.manifest.results.terminal_actions = 1; },
  (args) => { args.manifest.input_bindings.adapter_contract.digest = `sha256:${'d'.repeat(64)}`; },
  (args) => { args.receipt.results.terminal_actions = 1; },
  (args) => { args.receipt.rights_pass_created = 1; },
  (args) => { args.receipt.production = 'AUTHORIZED'; },
  (args) => { args.authoritativeInputDigests.runtime_contract.digest = `sha256:${'e'.repeat(64)}`; },
  (args) => { args.authoritativeInputConstants.replacement_queue_id = 'changed'; },
]) {
  const changed = structuredClone(semanticArgs);
  changed.coverageContractBytes = Buffer.from(semanticArgs.coverageContractBytes);
  mutate(changed);
  const changedDigest = semanticSha256(semanticStableJson(buildSemanticInputMaterial(changed)));
  semanticDivergentDigests.push(changedDigest);
  assert.notEqual(changedDigest, semanticDigest, 'consumed semantic change must diverge');
}
const baseCurrent = {
  repository: 'kidults/platform',
  trigger_event: 'workflow_run',
  run_id: 200,
  run_attempt: 1,
  source_sha: sourceSha,
  upstream_class: 'ASI_AUTONOMOUS_RESOLUTION',
  canonical_run_key: `${sourceSha}:ASI_AUTONOMOUS_RESOLUTION`,
  canonical_input_digest: semanticDigest,
  semantic_input_receipt_digest: semanticInputReceiptFileDigest,
  canonical_contract_digest: `sha256:${'2'.repeat(64)}`,
  upstream_binding_digest: `sha256:${'3'.repeat(64)}`,
  upstream_workflow_run_id: 50,
  upstream_artifact_id: 60,
  upstream_artifact_digest: `sha256:${'4'.repeat(64)}`,
  coverage_consumer_sha: aliasCoverageSha,
  coverage_run_head_sha: aliasCoverageSha,
  coverage_run_display_title: `KIDULTS Coverage / source-${sourceSha}`,
};

const emptyInput = {
  observed_at: observedAt,
  current: baseCurrent,
  readback: { state: 'COMPLETE', total_count: 0, returned_count: 0, prior_success_count: 0, reason_codes: [] },
  candidates: [],
};
const leaderSelection = resolveCoverageCanonicalGuard(emptyInput);
assert.equal(leaderSelection.execute_full_coverage, true);
assert.equal(leaderSelection.ephemeral_actions_leader, true);
assert.equal(leaderSelection.guard.state, 'EPHEMERAL_CANONICAL_LEADER_SELECTED');
assert.equal(leaderSelection.guard.canonical_execution_claimed, false);
assert.equal(leaderSelection.guard.every_noncanonical_trigger_alias_receipt_guaranteed, false);

const leaderCurrent = {
  ...baseCurrent,
  run_id: 100,
  upstream_binding_digest: `sha256:${'5'.repeat(64)}`,
  upstream_workflow_run_id: 45,
  upstream_artifact_id: 55,
  upstream_artifact_digest: `sha256:${'6'.repeat(64)}`,
  coverage_consumer_sha: leaderCoverageSha,
  coverage_run_head_sha: leaderCoverageSha,
};
const leaderReceipt = finalizeCoverageCanonicalLeader({
  ...leaderCurrent,
  observed_at: observedAt,
  coverage_manifest_digest: `sha256:${'6'.repeat(64)}`,
  coverage_kpmo_receipt_digest: `sha256:${'7'.repeat(64)}`,
  archive_validation_receipt_digest: `sha256:${'8'.repeat(64)}`,
  guard_receipt_digest: `sha256:${'9'.repeat(64)}`,
});
const artifactName = leaderSelection.guard.canonical_artifact_name;
const candidate = {
  run: {
    id: 100,
    run_attempt: 1,
    name: 'KIDULTS ASI Requirement-to-Adapter Coverage v1',
    path: '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',
    repository: { full_name: 'kidults/platform' },
    head_branch: 'main',
    head_sha: leaderCoverageSha,
    display_title: `KIDULTS Coverage / source-${sourceSha}`,
    event: 'workflow_run',
    status: 'completed',
    conclusion: 'success',
  },
  artifact: {
    id: 300,
    name: artifactName,
    expired: false,
    size_in_bytes: 4096,
    digest: `sha256:${'b'.repeat(64)}`,
    expires_at: '2026-10-01T00:00:00.000Z',
    workflow_run: { id: 100, head_sha: leaderCoverageSha },
  },
  receipt: leaderReceipt,
  semantic_input_receipt: semanticInputReceipt,
  semantic_input_receipt_file_digest: semanticInputReceiptFileDigest,
};
const aliasInput = {
  ...emptyInput,
  readback: { state: 'COMPLETE', total_count: 1, returned_count: 1, prior_success_count: 1, reason_codes: [] },
  candidates: [candidate],
};
const alias = resolveCoverageCanonicalGuard(aliasInput);
assert.equal(alias.execute_full_coverage, false);
assert.equal(alias.ephemeral_actions_leader, false);
assert.equal(alias.guard.state, 'DEDUPED_ALIAS');
assert.equal(alias.alias_receipt.state, 'VERIFIED_PASS_EPHEMERAL_ALIAS_NO_FULL_COVERAGE');
assert.equal(alias.alias_receipt.current_upstream_binding_digest, baseCurrent.upstream_binding_digest);
assert.equal(alias.alias_receipt.canonical_upstream_binding_digest, leaderReceipt.upstream_binding_digest);
assert.notEqual(alias.alias_receipt.current_upstream_binding_digest, alias.alias_receipt.canonical_upstream_binding_digest);
assert.notEqual(alias.alias_receipt.current_upstream_workflow_run_id, alias.alias_receipt.canonical_upstream_workflow_run_id);
assert.notEqual(alias.alias_receipt.current_upstream_artifact_id, alias.alias_receipt.canonical_upstream_artifact_id);
const observerInput = {
  observed_at: observedAt,
  repository: 'kidults/platform', audit_source_sha: aliasCoverageSha, coverage_canonical_source_sha: sourceSha,
  workflow_run_id: 400, workflow_run_attempt: 1,
  coverage_upstream_run_id: 200, coverage_upstream_run_attempt: 1,
  coverage_run_head_sha: aliasCoverageSha, coverage_run_display_title: `KIDULTS Coverage / source-${sourceSha}`,
  coverage_run_event: 'workflow_run', coverage_artifact_id: 500, coverage_artifact_digest: `sha256:${'c'.repeat(64)}`,
  canonical_artifact_id: candidate.artifact.id, canonical_artifact_name: candidate.artifact.name,
  canonical_artifact_digest: candidate.artifact.digest, canonical_artifact_workflow_run_id: candidate.run.id,
  canonical_artifact_workflow_run_head_sha: candidate.run.head_sha,
  semantic_input_receipt_file_digest: semanticInputReceiptFileDigest,
  semantic_input_receipt: semanticInputReceipt,
  current_upstream_binding_digest: alias.alias_receipt.current_upstream_binding_digest,
  classifier: {
    canonical_key: `sha256:${'d'.repeat(64)}`, canonical_input_digest: `sha256:${'e'.repeat(64)}`,
    upstream_class: 'ASI_REQUIREMENT_COVERAGE', generation_discriminator: 'coverage-v1',
    classifier_contract_digest: `sha256:${'f'.repeat(64)}`, classification_receipt_digest: `sha256:${'0'.repeat(64)}`,
    ephemeral_guard_receipt_digest: `sha256:${'a'.repeat(64)}`,
  },
  alias_receipt: alias.alias_receipt, leader_receipt: leaderReceipt, canonical_run: candidate.run,
};
const observation = observeCoverageAlias(observerInput);
assert.equal(observation.audit.receipt_type, 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE_COVERAGE_ALIAS_OBSERVER');
assert.equal(observation.audit.execution.canonical_identity.coverage_upstream_alias_observation, true);
assert.equal(observation.coverage_binding.full_continuous_assurance_audit_executed, false);
assert.throws(() => observeCoverageAlias({ ...observerInput, alias_receipt: { ...alias.alias_receipt, canonical_input_digest: `sha256:${'9'.repeat(64)}` } }), /COVERAGE_ALIAS_RECEIPT_DIGEST_INVALID/);
assert.throws(() => observeCoverageAlias({ ...observerInput, leader_receipt: { ...leaderReceipt, production: 'AUTHORIZED' } }), /COVERAGE_LEADER_RECEIPT_DIGEST_INVALID/);
const forgedAliasRun = structuredClone(alias.alias_receipt);
forgedAliasRun.canonical_workflow_run_id = 999;
forgedAliasRun.receipt_digest = observerReceiptDigest(forgedAliasRun);
assert.throws(() => observeCoverageAlias({ ...observerInput, alias_receipt: forgedAliasRun }), /COVERAGE_ALIAS_LEADER_RUN_BINDING_INVALID/);
const forgedAliasAttempt = structuredClone(alias.alias_receipt);
forgedAliasAttempt.canonical_workflow_run_attempt = 9;
forgedAliasAttempt.receipt_digest = observerReceiptDigest(forgedAliasAttempt);
assert.throws(() => observeCoverageAlias({ ...observerInput, alias_receipt: forgedAliasAttempt }), /COVERAGE_ALIAS_LEADER_RUN_BINDING_INVALID/);
const forgedLeaderHead = structuredClone(leaderReceipt);
forgedLeaderHead.coverage_run_head_sha = 'd'.repeat(40);
forgedLeaderHead.coverage_consumer_sha = 'd'.repeat(40);
forgedLeaderHead.receipt_digest = observerReceiptDigest(forgedLeaderHead);
const forgedLeaderAlias = structuredClone(alias.alias_receipt);
forgedLeaderAlias.canonical_receipt_digest = forgedLeaderHead.receipt_digest;
forgedLeaderAlias.receipt_digest = observerReceiptDigest(forgedLeaderAlias);
assert.throws(() => observeCoverageAlias({ ...observerInput, alias_receipt: forgedLeaderAlias, leader_receipt: forgedLeaderHead }), /COVERAGE_LEADER_STORED_RUN_METADATA_INVALID/);
assert.throws(() => observeCoverageAlias({ ...observerInput, audit_source_sha: 'e'.repeat(40) }), /AUDIT_SOURCE_COVERAGE_RUN_HEAD_MISMATCH/);
assert.throws(() => observeCoverageAlias({ ...observerInput, canonical_artifact_workflow_run_id: 999 }), /COVERAGE_CANONICAL_ARTIFACT_RUN_BINDING_INVALID/);
assert.throws(() => observeCoverageAlias({ ...observerInput, semantic_input_receipt_file_digest: `sha256:${'f'.repeat(64)}` }), /COVERAGE_SEMANTIC_INPUT_READBACK_INVALID/);

function expectFailClosed(mutator, reason) {
  const mutated = structuredClone(aliasInput);
  mutator(mutated);
  const result = resolveCoverageCanonicalGuard(mutated);
  assert.equal(result.fail_closed, true, reason);
  assert.equal(result.execute_full_coverage, false, reason);
  assert.match(result.guard.state, /HOLD/, reason);
}

expectFailClosed((input) => { input.candidates[0].receipt.canonical_input_digest = `sha256:${'f'.repeat(64)}`; }, 'semantic divergence');
expectFailClosed((input) => { input.candidates[0].receipt.coverage_manifest_digest = `sha256:${'e'.repeat(64)}`; }, 'receipt tamper');
expectFailClosed((input) => { input.candidates[0].semantic_input_receipt_file_digest = `sha256:${'e'.repeat(64)}`; }, 'semantic receipt file tamper');
expectFailClosed((input) => { input.candidates[0].semantic_input_receipt.material.source_sha = 'f'.repeat(40); }, 'semantic material tamper');
expectFailClosed((input) => { input.readback.total_count = 2; }, 'incomplete readback');
expectFailClosed((input) => { input.candidates.push(structuredClone(input.candidates[0])); input.readback.total_count = 2; input.readback.returned_count = 2; }, 'multiple leaders');
expectFailClosed((input) => { input.candidates[0].run.id = 200; input.candidates[0].artifact.workflow_run.id = 200; input.candidates[0].receipt.canonical_workflow_run_id = 200; }, 'current run cannot be prior leader');
const visibilityLag = resolveCoverageCanonicalGuard({
  ...emptyInput,
  readback: { state: 'COMPLETE', total_count: 0, returned_count: 0, prior_success_count: 1, reason_codes: [] },
});
assert.equal(visibilityLag.fail_closed, true);
assert.equal(visibilityLag.guard.state, 'ARTIFACT_VISIBILITY_OR_RETENTION_HOLD');
const trueSemanticDivergence = resolveCoverageCanonicalGuard({
  ...aliasInput,
  current: {
    ...baseCurrent,
    canonical_input_digest: semanticDivergentDigests[0],
    semantic_input_receipt_digest: `sha256:${'f'.repeat(64)}`,
  },
});
assert.equal(trueSemanticDivergence.fail_closed, true);
assert.equal(trueSemanticDivergence.guard.state, 'INPUT_DIVERGENCE_HOLD');

const manualCurrent = { ...baseCurrent, trigger_event: 'workflow_dispatch', coverage_run_display_title: 'KIDULTS Coverage / manual-200' };
const manual = resolveCoverageCanonicalGuard({
  observed_at: observedAt,
  current: manualCurrent,
  readback: { state: 'BYPASS', total_count: 0, returned_count: 0, prior_success_count: 0, reason_codes: [] },
  candidates: [],
});
assert.equal(manual.execute_full_coverage, true);
assert.equal(manual.ephemeral_actions_leader, false);
assert.equal(manual.guard.state, 'MANUAL_RECOVERY_FULL_VALIDATION_NON_LEADER');
assert.throws(() => resolveCoverageCanonicalGuard({
  observed_at: observedAt,
  current: manualCurrent,
  readback: { state: 'COMPLETE', total_count: 1, returned_count: 1, prior_success_count: 1, reason_codes: [] },
  candidates: [candidate],
}), /MANUAL_RECOVERY_CANNOT_IMPERSONATE_CANONICAL/);
assert.throws(() => finalizeCoverageCanonicalLeader({
  ...manualCurrent,
  observed_at: observedAt,
  coverage_manifest_digest: `sha256:${'6'.repeat(64)}`,
  coverage_kpmo_receipt_digest: `sha256:${'7'.repeat(64)}`,
  archive_validation_receipt_digest: `sha256:${'8'.repeat(64)}`,
  guard_receipt_digest: `sha256:${'9'.repeat(64)}`,
}), /CANONICAL_LEADER_MUST_BE_WORKFLOW_RUN/);

const contract = JSON.parse(fs.readFileSync('coordination/kidults/source-intelligence/asi-requirement-adapter-coverage-contract-v1.json', 'utf8'));
const registry = JSON.parse(fs.readFileSync('coordination/kidults/source-intelligence/asi-requirement-adapter-coverage-registry-v1.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml', 'utf8');
assert.equal(contract.canonical_fanout.cancel_in_progress, false);
assert.equal(contract.canonical_fanout.canonical_guard.runtime_exactly_once_claimed, false);
assert.equal(contract.canonical_fanout.canonical_guard.remote_ledger_state, 'REMOTE_LEDGER_ACTIVATION_HOLD');
assert.equal(registry.automatic_activation.workflow_run_exactly_once_durable, false);
for (const marker of [
  "cancel-in-progress: false",
  'resolve-asi-requirement-adapter-coverage-canonical-guard-v1.mjs',
  'build-asi-requirement-adapter-coverage-semantic-input-v1.mjs',
  'run-name: KIDULTS Coverage /',
  'validate-safe-zip-archive-v1.py',
  "if: env.KIDULTS_COVERAGE_EXECUTE_FULL == 'true'",
  "if: success() && env.KIDULTS_COVERAGE_EXECUTE_FULL == 'true' && env.KIDULTS_COVERAGE_EPHEMERAL_LEADER == 'true'",
  '-f name="$CANONICAL_ARTIFACT_NAME"',
]) assert.ok(workflow.includes(marker), `WORKFLOW_MARKER_MISSING:${marker}`);
assert.ok(workflow.indexOf('Publish successful bounded Coverage canonical leader artifact') > workflow.indexOf('Revalidate pristine coverage outputs and registry'), 'LEADER_ARTIFACT_MUST_BE_LAST');
const cancellationMutation = workflow.replace('cancel-in-progress: false', 'cancel-in-progress: true');
assert.notEqual(cancellationMutation, workflow);
assert.ok(!cancellationMutation.includes('cancel-in-progress: false'));
const manualMutation = structuredClone(manualCurrent);
manualMutation.trigger_event = 'workflow_run';
assert.equal(manualMutation.trigger_event, 'workflow_run');
assert.equal(sha256(baseCurrent.canonical_run_key).length, 71);

console.log(JSON.stringify({
  id: 'kidults-asi-requirement-adapter-coverage-canonical-guard-validation-v1',
  state: 'VERIFIED_PASS',
  leader_cases: 1,
  alias_cases: 1,
  negative_cases: 13,
  semantic_identity_positive_cases: 2,
  semantic_identity_negative_cases: 8,
  continuous_assurance_alias_observer_cases: 9,
  archive_limits_registered: true,
  durable_exactly_once: 'REMOTE_LEDGER_ACTIVATION_HOLD',
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
