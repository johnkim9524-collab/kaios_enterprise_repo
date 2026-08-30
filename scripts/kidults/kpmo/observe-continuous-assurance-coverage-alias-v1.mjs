#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const POSITIVE = /^[1-9][0-9]*$/;
const REMOTE_STATE = 'REMOTE_LEDGER_ACTIVATION_HOLD';

const stableJson = (value) => Array.isArray(value)
  ? `[${value.map(stableJson).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const fail = (code) => { throw new Error(code); };
const required = (value, code) => {
  if (value === undefined || value === null || String(value).trim() === '') fail(code);
  return String(value).trim();
};
const positive = (value, code) => {
  const text = required(value, code);
  if (!POSITIVE.test(text)) fail(code);
  return Number(text);
};
const exactDigest = (value, code) => {
  const text = required(value, code);
  if (!DIGEST.test(text)) fail(code);
  return text;
};
const receiptDigest = (receipt) => {
  const unsigned = structuredClone(receipt);
  delete unsigned.observed_at;
  delete unsigned.receipt_digest;
  return sha256(stableJson(unsigned));
};
const sign = (receipt, observedAt) => ({ ...receipt, observed_at: observedAt, receipt_digest: sha256(stableJson(receipt)) });

export function observeCoverageAlias(input) {
  const observedAt = required(input.observed_at, 'OBSERVED_AT_REQUIRED');
  if (!Number.isFinite(Date.parse(observedAt))) fail('OBSERVED_AT_INVALID');
  const repository = required(input.repository, 'REPOSITORY_REQUIRED');
  const auditSourceSha = required(input.audit_source_sha, 'AUDIT_SOURCE_SHA_REQUIRED');
  const canonicalSourceSha = required(input.coverage_canonical_source_sha, 'COVERAGE_CANONICAL_SOURCE_SHA_REQUIRED');
  if (!SHA.test(auditSourceSha) || !SHA.test(canonicalSourceSha)) fail('SOURCE_SHA_INVALID');
  const workflowRunId = positive(input.workflow_run_id, 'WORKFLOW_RUN_ID_REQUIRED');
  const workflowRunAttempt = positive(input.workflow_run_attempt, 'WORKFLOW_RUN_ATTEMPT_REQUIRED');
  const coverageUpstreamRunId = positive(input.coverage_upstream_run_id, 'COVERAGE_UPSTREAM_RUN_ID_REQUIRED');
  const coverageUpstreamRunAttempt = positive(input.coverage_upstream_run_attempt, 'COVERAGE_UPSTREAM_RUN_ATTEMPT_REQUIRED');
  const coverageRunHeadSha = required(input.coverage_run_head_sha, 'COVERAGE_RUN_HEAD_SHA_REQUIRED');
  const coverageRunDisplayTitle = required(input.coverage_run_display_title, 'COVERAGE_RUN_DISPLAY_TITLE_REQUIRED');
  const coverageRunEvent = required(input.coverage_run_event, 'COVERAGE_RUN_EVENT_REQUIRED');
  if (!SHA.test(coverageRunHeadSha)) fail('COVERAGE_RUN_HEAD_SHA_INVALID');
  if (auditSourceSha !== coverageRunHeadSha) fail('AUDIT_SOURCE_COVERAGE_RUN_HEAD_MISMATCH');
  if (coverageRunEvent !== 'workflow_run' || coverageRunDisplayTitle !== `KIDULTS Coverage / source-${canonicalSourceSha}`) fail('COVERAGE_RUN_IDENTITY_INVALID');
  const coverageArtifactId = positive(input.coverage_artifact_id, 'COVERAGE_ARTIFACT_ID_REQUIRED');
  const coverageArtifactDigest = exactDigest(input.coverage_artifact_digest, 'COVERAGE_ARTIFACT_DIGEST_REQUIRED');
  const currentUpstreamBindingDigest = exactDigest(input.current_upstream_binding_digest, 'CURRENT_UPSTREAM_BINDING_DIGEST_REQUIRED');
  const canonicalArtifactId = positive(input.canonical_artifact_id, 'CANONICAL_ARTIFACT_ID_REQUIRED');
  const canonicalArtifactName = required(input.canonical_artifact_name, 'CANONICAL_ARTIFACT_NAME_REQUIRED');
  const canonicalArtifactDigest = exactDigest(input.canonical_artifact_digest, 'CANONICAL_ARTIFACT_DIGEST_REQUIRED');
  const canonicalArtifactWorkflowRunId = positive(input.canonical_artifact_workflow_run_id, 'CANONICAL_ARTIFACT_WORKFLOW_RUN_ID_REQUIRED');
  const canonicalArtifactWorkflowRunHeadSha = required(input.canonical_artifact_workflow_run_head_sha, 'CANONICAL_ARTIFACT_WORKFLOW_RUN_HEAD_SHA_REQUIRED');
  if (!SHA.test(canonicalArtifactWorkflowRunHeadSha)) fail('CANONICAL_ARTIFACT_WORKFLOW_RUN_HEAD_SHA_INVALID');
  const classifier = input.classifier || {};
  for (const [code, value] of [
    ['CLASSIFIER_CANONICAL_KEY_REQUIRED', classifier.canonical_key],
    ['CLASSIFIER_INPUT_DIGEST_REQUIRED', classifier.canonical_input_digest],
    ['CLASSIFIER_CONTRACT_DIGEST_REQUIRED', classifier.classifier_contract_digest],
    ['CLASSIFICATION_RECEIPT_DIGEST_REQUIRED', classifier.classification_receipt_digest],
    ['EPHEMERAL_GUARD_DIGEST_REQUIRED', classifier.ephemeral_guard_receipt_digest],
  ]) exactDigest(value, code);
  required(classifier.generation_discriminator, 'CLASSIFIER_GENERATION_DISCRIMINATOR_REQUIRED');
  if (classifier.upstream_class !== 'ASI_REQUIREMENT_COVERAGE') fail('CLASSIFIER_UPSTREAM_CLASS_INVALID');
  const alias = input.alias_receipt || {};
  const leader = input.leader_receipt || {};
  const semantic = input.semantic_input_receipt || {};
  const semanticFileDigest = exactDigest(input.semantic_input_receipt_file_digest, 'SEMANTIC_INPUT_RECEIPT_FILE_DIGEST_REQUIRED');
  const semanticMaterialDigest = semantic.material && typeof semantic.material === 'object' && !Array.isArray(semantic.material)
    ? sha256(stableJson(semantic.material))
    : null;
  const canonicalRun = input.canonical_run || {};
  if (alias.id !== 'kidults-asi-requirement-adapter-coverage-canonical-alias-receipt-v1' ||
      alias.state !== 'VERIFIED_PASS_EPHEMERAL_ALIAS_NO_FULL_COVERAGE') fail('COVERAGE_ALIAS_RECEIPT_INVALID');
  if (leader.id !== 'kidults-asi-requirement-adapter-coverage-canonical-leader-receipt-v1' ||
      leader.state !== 'VERIFIED_PASS_EPHEMERAL_CANONICAL_LEADER') fail('COVERAGE_LEADER_RECEIPT_INVALID');
  if (alias.receipt_digest !== receiptDigest(alias)) fail('COVERAGE_ALIAS_RECEIPT_DIGEST_INVALID');
  if (leader.receipt_digest !== receiptDigest(leader)) fail('COVERAGE_LEADER_RECEIPT_DIGEST_INVALID');
  if (alias.repository !== repository || leader.repository !== repository || alias.source_sha !== canonicalSourceSha || leader.source_sha !== canonicalSourceSha) fail('COVERAGE_ALIAS_SOURCE_BINDING_INVALID');
  if (alias.upstream_class !== 'ASI_AUTONOMOUS_RESOLUTION' || leader.upstream_class !== 'ASI_AUTONOMOUS_RESOLUTION') fail('COVERAGE_ALIAS_CLASS_BINDING_INVALID');
  if (alias.canonical_run_key !== leader.canonical_run_key || alias.canonical_input_digest !== leader.canonical_input_digest || alias.canonical_contract_digest !== leader.canonical_contract_digest) fail('COVERAGE_ALIAS_CANONICAL_INPUT_DIVERGENCE');
  if (!DIGEST.test(alias.semantic_input_receipt_digest || '') || alias.semantic_input_receipt_digest !== leader.semantic_input_receipt_digest) fail('COVERAGE_ALIAS_SEMANTIC_RECEIPT_DIVERGENCE');
  if (alias.canonical_receipt_digest !== leader.receipt_digest) fail('COVERAGE_ALIAS_LEADER_RECEIPT_BINDING_INVALID');
  if (semanticFileDigest !== leader.semantic_input_receipt_digest ||
      semantic.id !== 'kidults-asi-requirement-adapter-coverage-semantic-input-receipt-v1' ||
      semantic.version !== '1.0.0' || semantic.state !== 'VERIFIED_PASS_SEMANTIC_INPUT_BOUND' ||
      semantic.canonical_input_digest !== leader.canonical_input_digest ||
      semantic.canonical_input_digest !== semanticMaterialDigest) fail('COVERAGE_SEMANTIC_INPUT_READBACK_INVALID');
  if (semantic.exact_upstream_provenance_included_in_identity !== false ||
      semantic.exact_upstream_provenance_required_in_observation_receipt !== true ||
      semantic.runtime_dedupe_state !== REMOTE_STATE || semantic.canonical_execution_claimed !== false ||
      semantic.public !== 'HOLD' || semantic.production !== 'HOLD' || semantic.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') fail('COVERAGE_SEMANTIC_INPUT_TRUTH_BOUNDARY_INVALID');
  if (alias.canonical_workflow_run_id !== leader.canonical_workflow_run_id ||
      alias.canonical_workflow_run_attempt !== leader.canonical_workflow_run_attempt) fail('COVERAGE_ALIAS_LEADER_RUN_BINDING_INVALID');
  if (alias.canonical_artifact_id !== canonicalArtifactId || alias.canonical_artifact_name !== canonicalArtifactName ||
      alias.canonical_artifact_digest !== canonicalArtifactDigest) fail('COVERAGE_ALIAS_LEADER_ARTIFACT_BINDING_INVALID');
  if (alias.current_workflow_run_id !== coverageUpstreamRunId || alias.current_workflow_run_attempt !== coverageUpstreamRunAttempt ||
      alias.current_trigger_event !== coverageRunEvent || alias.current_upstream_binding_digest !== currentUpstreamBindingDigest ||
      alias.current_coverage_consumer_sha !== coverageRunHeadSha || alias.current_coverage_run_head_sha !== coverageRunHeadSha ||
      alias.current_coverage_run_display_title !== coverageRunDisplayTitle) fail('COVERAGE_ALIAS_CURRENT_OBSERVATION_BINDING_INVALID');
  if (Number(canonicalRun.id) !== leader.canonical_workflow_run_id || Number(canonicalRun.run_attempt) !== leader.canonical_workflow_run_attempt ||
      canonicalRun.name !== 'KIDULTS ASI Requirement-to-Adapter Coverage v1' ||
      canonicalRun.path !== '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml' ||
      canonicalRun.repository?.full_name !== repository || canonicalRun.head_branch !== 'main' ||
      canonicalRun.event !== 'workflow_run' || canonicalRun.status !== 'completed' || canonicalRun.conclusion !== 'success') fail('COVERAGE_CANONICAL_RUN_METADATA_INVALID');
  if (!SHA.test(canonicalRun.head_sha || '') || canonicalRun.display_title !== `KIDULTS Coverage / source-${canonicalSourceSha}`) fail('COVERAGE_CANONICAL_RUN_SOURCE_IDENTITY_INVALID');
  if (canonicalRun.head_sha !== leader.coverage_run_head_sha || leader.coverage_consumer_sha !== leader.coverage_run_head_sha ||
      canonicalRun.display_title !== leader.coverage_run_display_title ||
      leader.coverage_workflow_name !== canonicalRun.name || leader.coverage_workflow_path !== canonicalRun.path ||
      leader.coverage_repository !== repository) fail('COVERAGE_LEADER_STORED_RUN_METADATA_INVALID');
  if (alias.canonical_coverage_consumer_sha !== leader.coverage_consumer_sha ||
      alias.canonical_coverage_run_head_sha !== leader.coverage_run_head_sha ||
      alias.canonical_coverage_run_display_title !== leader.coverage_run_display_title) fail('COVERAGE_ALIAS_STORED_RUN_METADATA_INVALID');
  if (canonicalArtifactWorkflowRunId !== Number(canonicalRun.id) ||
      canonicalArtifactWorkflowRunHeadSha !== canonicalRun.head_sha) fail('COVERAGE_CANONICAL_ARTIFACT_RUN_BINDING_INVALID');
  if (alias.runtime_dedupe_state !== REMOTE_STATE || leader.runtime_dedupe_state !== REMOTE_STATE || alias.canonical_execution_claimed !== false || leader.canonical_execution_claimed !== false) fail('COVERAGE_ALIAS_DURABILITY_BOUNDARY_INVALID');
  if (alias.public !== 'HOLD' || alias.production !== 'HOLD' || leader.public !== 'HOLD' || leader.production !== 'HOLD') fail('COVERAGE_ALIAS_PROMOTION_BOUNDARY_INVALID');

  const coverageBinding = {
    status: 'VERIFIED_PASS_COVERAGE_ALIAS_OBSERVATION',
    upstream_run_id: coverageUpstreamRunId,
    upstream_run_attempt: coverageUpstreamRunAttempt,
    upstream_run_head_sha: coverageRunHeadSha,
    upstream_run_display_title: coverageRunDisplayTitle,
    upstream_run_event: coverageRunEvent,
    audit_source_sha: auditSourceSha,
    canonical_source_sha: canonicalSourceSha,
    artifact_cardinality: 1,
    artifact_id: coverageArtifactId,
    artifact_digest: coverageArtifactDigest,
    alias_receipt_digest: alias.receipt_digest,
    current_upstream_binding_digest: alias.current_upstream_binding_digest,
    canonical_run_key: alias.canonical_run_key,
    canonical_input_digest: alias.canonical_input_digest,
    canonical_workflow_run_id: alias.canonical_workflow_run_id,
    canonical_artifact_id: alias.canonical_artifact_id,
    canonical_artifact_name: alias.canonical_artifact_name,
    canonical_artifact_digest: alias.canonical_artifact_digest,
    canonical_artifact_workflow_run_id: canonicalArtifactWorkflowRunId,
    canonical_artifact_workflow_run_head_sha: canonicalArtifactWorkflowRunHeadSha,
    canonical_receipt_digest: leader.receipt_digest,
    semantic_input_receipt_digest: semanticFileDigest,
    full_continuous_assurance_audit_executed: false,
    exact_observer_receipt_retained: true,
    promotion_eligible: false,
    public: 'HOLD',
    production: 'HOLD',
  };
  const coverageBindingDigest = sha256(stableJson(coverageBinding));
  const audit = sign({
    schema_version: '1.0.0',
    receipt_type: 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE_COVERAGE_ALIAS_OBSERVER',
    source: { sha: auditSourceSha, expected_sha: auditSourceSha, actual_sha: auditSourceSha, match: true, kind: 'workflow_run', workflow_path: '.github/workflows/kidults-platform-continuous-assurance-v1.yml' },
    execution: {
      profile: 'EXACT_COVERAGE_ALIAS_OBSERVER_NO_FULL_AUDIT',
      trigger: 'workflow_run',
      workflow_run_id: String(workflowRunId),
      workflow_run_attempt: String(workflowRunAttempt),
      canonical_identity: {
        canonical_key: classifier.canonical_key,
        canonical_input_digest: classifier.canonical_input_digest,
        source_sha: auditSourceSha,
        upstream_class: classifier.upstream_class,
        generation_discriminator: classifier.generation_discriminator,
        classifier_contract_digest: classifier.classifier_contract_digest,
        classification_receipt_digest: classifier.classification_receipt_digest,
        ephemeral_guard_receipt_digest: classifier.ephemeral_guard_receipt_digest,
        runtime_dedupe_state: REMOTE_STATE,
        canonical_execution_claimed: false,
        durable_claim_created: false,
        ephemeral_actions_leader: false,
        alias: false,
        coverage_upstream_alias_observation: true,
        coverage_binding_digest: coverageBindingDigest,
        coverage_canonical_source_sha: canonicalSourceSha,
        coverage_alias_receipt_digest: alias.receipt_digest,
        coverage_canonical_receipt_digest: leader.receipt_digest,
        coverage_execution_disposition: 'VERIFIED_ALIAS_OBSERVER_NO_FULL_AUDIT',
      },
    },
    states: { internal_control_state: 'VERIFIED_PASS', external_empirical_state: 'HOLD', release_state: 'HOLD', overall_state: 'HOLD', promotion_eligible: false },
    checks: [{ id: 'EXACT_COVERAGE_ALIAS_AND_CANONICAL_LEADER_BINDING', required: true, state: 'VERIFIED_PASS' }],
    unresolved_gates: ['REMOTE_LEDGER_ACTIVATION_HOLD'],
    evidence: [{ kind: 'COVERAGE_ALIAS_OBSERVATION', ...coverageBinding }],
    empirical_truth_effect: { graded_delta: 0, human_review_delta: 0, dated_sold_delta: 0, candidate_or_evidence_created: false, track_b_started: false, projection_approved: false },
    authority_boundary: { detector_authority: 'READ_ONLY', repository_mutation_performed: false, credentialed_external_mutation_performed: false, secret_material_read: false, production_or_g5_promoted: false },
  }, observedAt);
  const plan = {
    schema_version: '1.0.0', plan_type: 'KIDULTS_SAFE_REMEDIATION_PACKET', source_sha: auditSourceSha,
    source_receipt_digest: audit.receipt_digest, disposition: 'VERIFIED_COVERAGE_ALIAS_OBSERVER_NO_ACTION',
    failed_check_ids: [], integrity_findings: [], activation: { eligible: false, state: 'HOLD' }, activation_eligible: false,
    direct_main_write: false, auto_merge: false, public: 'HOLD', production: 'HOLD', g5: 'EXPLICIT_APPROVAL_REQUIRED',
  };
  return { audit, plan, coverage_binding: coverageBinding, coverage_binding_digest: coverageBindingDigest };
}

function parseArgs(argv) {
  const args = {};
  const mapping = { '--input': 'input', '--audit-output': 'audit', '--plan-output': 'plan', '--binding-output': 'binding' };
  for (let index = 0; index < argv.length; index += 2) {
    if (!mapping[argv[index]] || !argv[index + 1]) fail('ARGUMENT_INVALID');
    args[mapping[argv[index]]] = argv[index + 1];
  }
  for (const key of ['input', 'audit', 'plan', 'binding']) if (!args[key]) fail('ARGUMENT_REQUIRED');
  return args;
}

const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
if (process.argv[1]?.endsWith('observe-continuous-assurance-coverage-alias-v1.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  const result = observeCoverageAlias(JSON.parse(fs.readFileSync(args.input, 'utf8')));
  write(args.audit, result.audit); write(args.plan, result.plan); write(args.binding, result.coverage_binding);
  if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `KPMO_EXECUTE_FULL_AUDIT=false\nKPMO_COVERAGE_ALIAS_OBSERVATION=true\nKPMO_UPSTREAM_BINDING_DIGEST=${result.coverage_binding_digest}\n`);
  process.stdout.write(`${JSON.stringify({ state: 'VERIFIED_PASS_COVERAGE_ALIAS_OBSERVATION', audit_receipt_digest: result.audit.receipt_digest, coverage_binding_digest: result.coverage_binding_digest, production: 'HOLD' }, null, 2)}\n`);
}

export { receiptDigest, stableJson };
