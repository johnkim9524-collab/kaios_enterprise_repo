import fs from 'node:fs';

const runnerPath = 'scripts/kidults/kpmo/run-full-value-chain-redteam-suite-v1.mjs';
const runner = fs.readFileSync(runnerPath, 'utf8');
const snapshotReadinessMandatory = [
  'scripts/kidults/source-intelligence/validate-asi-snapshot-readiness-factory-registry-v2.mjs',
  'scripts/kidults/source-intelligence/validate-asi-snapshot-readiness-upstream-binding-v2.mjs',
  'scripts/kidults/source-intelligence/test-asi-snapshot-readiness-factory-v2.mjs'
];

const mandatory = [
  'scripts/kidults/kpmo/validate-full-value-chain-redteam-orchestrator-v1.mjs',
  'scripts/kidults/kpmo/validate-full-value-chain-stage-machine-coverage-v1.mjs',
  'scripts/kidults/audit/certify-pre-partner-intake-gate-v1.mjs',
  'scripts/kidults/audit/validate-pre-partner-control-family-coverage-v1.mjs',
  'scripts/kidults/audit/validate-unified-audit-control-plane-v1.mjs',
  'scripts/kidults/audit/validate-pre-partner-adversarial-fixtures-v1.mjs',
  'scripts/kidults/audit/validate-rights-withdrawal-transitive-invalidation-v1.mjs',
  'scripts/kidults/audit/validate-destructive-lifecycle-recovery-monotonicity-v1.mjs',
  'scripts/kidults/audit/validate-destructive-canonical-suppression-v1.mjs',
  'scripts/kidults/market/validate-provider-rights-decision-gate-v1.mjs',
  'scripts/kidults/kpmo/validate-estate-action-pinning-v1.mjs',
  'scripts/kidults/kpmo/validate-dependency-bootstrap-lock-v1.mjs',
  'scripts/kidults/kpmo/validate-a13-validation-workflow-provenance-v1.mjs',
  'scripts/kidults/kpmo/validate-portal-r001-browser-qa-supply-chain-v1.mjs',
  'scripts/kidults/kpmo/validate-github-trusted-ref-environment-readback-v1.mjs',
  'scripts/kidults/e2e/validate-black-lotus-legacy-quarantine-v1.mjs',
  'scripts/operations/validate_digitalocean_staging_bootstrap_v1.py',
  'scripts/operations/validate_digitalocean_staging_bootstrap_exec_v1.py',
  'scripts/operations/validate_digitalocean_staging_bootstrap_workflow_v1.py',
  ...snapshotReadinessMandatory,
  'scripts/kidults/portal/validate-proof-product-consumer-runtime-v1.mjs',
  'scripts/kidults/portal/validate-portal-launch-assurance-v1.mjs',
  'scripts/kidults/portal/validate-portal-release-001.mjs'
];

const errors = [];
for (const script of mandatory) {
  if (!fs.existsSync(script)) errors.push(`mandatory validator missing: ${script}`);
}

function aggregateRunnerBindingErrors(source, required) {
  const findings = required
    .filter((script) => !source.includes(script))
    .map((script) => `aggregate runner binding missing: ${script}`);
  if (!source.includes('...snapshotReadinessValidators')) {
    findings.push('aggregate runner snapshot-readiness execution spread missing');
  }
  return findings;
}

errors.push(...aggregateRunnerBindingErrors(runner, mandatory));
let snapshotRemovalMutationCases = 0;
for (const [index, script] of snapshotReadinessMandatory.entries()) {
  const mutated = runner.split(script).join(`scripts/kidults/source-intelligence/removed-snapshot-validator-${index}.mjs`);
  if (mutated === runner) {
    errors.push(`snapshot-readiness removal mutation not applied: ${script}`);
    continue;
  }
  const findings = aggregateRunnerBindingErrors(mutated, snapshotReadinessMandatory);
  if (!findings.includes(`aggregate runner binding missing: ${script}`)) {
    errors.push(`snapshot-readiness aggregate binding removal mutation escaped: ${script}`);
    continue;
  }
  snapshotRemovalMutationCases += 1;
}
const invocationRemovalMutation = runner.replace('...snapshotReadinessValidators', '/* snapshot-readiness execution removed */');
if (invocationRemovalMutation === runner) {
  errors.push('snapshot-readiness execution-spread removal mutation not applied');
} else if (!aggregateRunnerBindingErrors(invocationRemovalMutation, snapshotReadinessMandatory)
  .includes('aggregate runner snapshot-readiness execution spread missing')) {
  errors.push('snapshot-readiness execution-spread removal mutation escaped');
} else {
  snapshotRemovalMutationCases += 1;
}

for (const marker of [
  "external_partner_data_ingestion: 'HOLD'",
  "production: 'HOLD'",
  "public: 'HOLD'",
  "g5: 'EXPLICIT_APPROVAL_REQUIRED'",
  "empirical_evidence_readiness: 'NOT_PROMOTED_BY_THIS_SUITE'",
  "release_evidence_readiness: 'NOT_PROMOTED_BY_THIS_SUITE'",
  'pre_partner_required_controls_exactly_bound: true',
  'pre_partner_control_removal_mutation_selftest: true',
  'pre_partner_transitive_invalidation_machine_bound: true',
  'pre_partner_durable_destructive_replay_machine_bound: true',
  'pre_partner_rollback_revocation_resurrection_fail_closed: true',
  'pre_partner_canonical_source_object_suppression_machine_bound: true',
  'pre_partner_rekey_alias_reingestion_fail_closed: true',
  'black_lotus_legacy_qualification_quarantined: true',
  'estate_action_pinning_machine_bound: true',
  'estate_action_pinning_mutation_selftest: true',
  'estate_action_pinning_semantic_key_mutation_selftest: true',
  'estate_action_exact_allowlist_machine_bound: true',
  'estate_action_allowlist_mutation_selftest: true',
  'estate_moving_runner_alias_forbidden: true',
  'github_hosted_image_build_external_residual: true',
  'digitalocean_staging_bootstrap_exec_contract_machine_bound: true',
  'digitalocean_staging_bootstrap_workflow_machine_bound: true',
  'snapshot_readiness_factory_machine_bound: true',
  "snapshot_readiness_upstream_no_argument_mode: 'SAFE_SELF_TEST'",
  'snapshot_readiness_output_existence_is_prerequisite: false',
  'snapshot_readiness_track_b_submission_preauthorized: false',
  'proof_product_consumer_runtime_machine_bound: true',
  'dependency_bootstrap_lock_machine_bound: true',
  "dependency_bootstrap_empirical_gate_effect: 'NONE'",
  'proof_product_consumer_schema_runtime_bound: true',
  "proof_product_api_export_binding: 'SIGNED_SERVER_CAPABILITY_BOUND__PUBLIC_CALLER_PATH_HOLD'"
]) {
  if (!runner.includes(marker)) errors.push(`aggregate truth/control marker missing: ${marker}`);
}

const preIntake = JSON.parse(fs.readFileSync('coordination/kidults/audit/unified-audit-control-plane-v1.json','utf8'));
if (preIntake.governing_issue !== 881) errors.push('Unified Audit Control Plane must remain bound to #881');
if (!Array.isArray(preIntake.pre_partner_control_families) || preIntake.pre_partner_control_families.length !== 12) errors.push('all 12 #881 control families must remain machine-bound');
if (preIntake.truth_boundary?.empirical_gate_effect !== 'NONE') errors.push('control evidence must not promote empirical gates');

const orchestrator = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/full-value-chain-redteam-orchestrator-v1.json','utf8'));
if (JSON.stringify(orchestrator.required_snapshot_readiness_validators || []) !== JSON.stringify(snapshotReadinessMandatory)) {
  errors.push('required snapshot-readiness validator registry must remain exact and ordered');
}
if (orchestrator.aggregate_machine_enforcement?.require_all_snapshot_readiness_validators_pass !== true) {
  errors.push('aggregate must require every snapshot-readiness validator to pass');
}
const snapshotStage = new Set(orchestrator.stage_machine_coverage?.SNAPSHOT_AND_TRACK_B?.validators || []);
for (const script of snapshotReadinessMandatory) {
  if (!snapshotStage.has(script)) errors.push(`SNAPSHOT_AND_TRACK_B stage binding missing: ${script}`);
}
const runtimeRequired = new Set(orchestrator.required_runtime_boundary_validators || []);
const runtimeStage = new Set(orchestrator.stage_machine_coverage?.RUNTIME?.validators || []);
for (const script of [
  'scripts/operations/validate_digitalocean_staging_bootstrap_v1.py',
  'scripts/operations/validate_digitalocean_staging_bootstrap_exec_v1.py',
  'scripts/operations/validate_digitalocean_staging_bootstrap_workflow_v1.py'
]) {
  if (!runtimeRequired.has(script)) errors.push(`required runtime boundary missing: ${script}`);
  if (!runtimeStage.has(script)) errors.push(`RUNTIME stage executable boundary missing: ${script}`);
}

const rightsGate = JSON.parse(fs.readFileSync('coordination/kidults/market/provider-rights-decision-gate-v1.json','utf8'));
for (const provider of ['CLASSIC.COM','ALT/FNDATA']) {
  const state = rightsGate.current_provider_state?.[provider];
  if (!state) errors.push(`provider state missing: ${provider}`);
  if (state?.decision !== 'PASS' && state?.activation !== 'DISABLED') errors.push(`${provider} activation must remain disabled without PASS`);
}
if (rightsGate.non_bypass?.production !== 'HOLD' || rightsGate.non_bypass?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('provider rights gate release boundary drift');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  suite:'KIDULTS_FULL_VALUE_CHAIN_CRITICAL_GATE_BINDINGS_V1',
  result:'PASS',
  mandatory_validator_bindings:mandatory.length,
  pre_partner_control_families:12,
  pre_partner_control_family_exact_coverage:'MACHINE_BOUND',
  pre_partner_control_removal_mutation_selftest:'MACHINE_BOUND',
  pre_partner_transitive_invalidation:'MACHINE_BOUND',
  pre_partner_durable_destructive_replay:'MACHINE_BOUND',
  pre_partner_rollback_revocation_resurrection:'FAIL_CLOSED',
  pre_partner_canonical_source_object_suppression:'MACHINE_BOUND',
  pre_partner_rekey_alias_reingestion:'FAIL_CLOSED',
  provider_rights_decision_gate:'MACHINE_BOUND',
  estate_action_pinning:'MACHINE_BOUND',
  estate_action_pinning_mutation_selftest:'MACHINE_BOUND',
  estate_action_pinning_semantic_key_mutation_selftest:'MACHINE_BOUND',
  estate_action_exact_allowlist:'MACHINE_BOUND',
  estate_action_allowlist_mutation_selftest:'MACHINE_BOUND',
  estate_moving_runner_alias:'FORBIDDEN_MACHINE_BOUND',
  github_hosted_image_build_immutability:'EXTERNAL_RESIDUAL',
  snapshot_readiness_factory:'MACHINE_BOUND',
  snapshot_readiness_validator_bindings:snapshotReadinessMandatory.length,
  snapshot_readiness_binding_removal_mutation_cases:snapshotRemovalMutationCases,
  snapshot_readiness_upstream_no_argument_mode:'SAFE_SELF_TEST',
  snapshot_readiness_output_existence_is_prerequisite:false,
  snapshot_readiness_track_b_submission_preauthorized:false,
  runtime_exec_contract:'MACHINE_BOUND',
  runtime_exec_workflow:'MACHINE_BOUND',
  empirical_gate_effect:'NONE',
  external_partner_data_ingestion:'HOLD',
  production:'HOLD',
  public:'HOLD',
  g5:'EXPLICIT_APPROVAL_REQUIRED'
},null,2));
