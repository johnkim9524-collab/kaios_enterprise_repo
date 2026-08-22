import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const orchestratorPath = 'coordination/kidults/kpmo/full-value-chain-redteam-orchestrator-v1.json';
const orchestrator = JSON.parse(fs.readFileSync(orchestratorPath, 'utf8'));
const structuralValidator = 'scripts/kidults/kpmo/validate-full-value-chain-redteam-orchestrator-v1.mjs';
const stageCoverageValidator = 'scripts/kidults/kpmo/validate-full-value-chain-stage-machine-coverage-v1.mjs';
const criticalGateBindingValidator = 'scripts/kidults/kpmo/validate-full-value-chain-critical-gate-bindings-v1.mjs';
const criticalWorkflowProvenanceValidators = [
  'scripts/kidults/kpmo/validate-critical-workflow-provenance-v1.mjs'
];
const repositoryMutationBoundaryValidators = [
  'scripts/kidults/kpmo/validate-workflow-repository-mutation-boundary-v1.mjs'
];
const secretBoundaryValidators = [
  'scripts/kidults/kpmo/validate-pr-secret-boundary-v1.mjs',
  'scripts/kidults/kpmo/inventory-secret-bearing-workflow-dispatch-v1.mjs'
];
const truthScopeValidators = [
  'scripts/kidults/kpmo/validate-scoped-certification-truth-boundary-v1.mjs'
];
const p0PrePartnerValidators = [
  'scripts/kidults/audit/certify-pre-partner-intake-gate-v1.mjs',
  'scripts/kidults/audit/validate-pre-partner-control-family-coverage-v1.mjs',
  'scripts/kidults/audit/validate-unified-audit-control-plane-v1.mjs',
  'scripts/kidults/audit/validate-pre-partner-adversarial-fixtures-v1.mjs',
  'scripts/kidults/audit/validate-rights-withdrawal-transitive-invalidation-v1.mjs',
  'scripts/kidults/audit/validate-destructive-lifecycle-recovery-monotonicity-v1.mjs',
  'scripts/kidults/audit/validate-destructive-canonical-suppression-v1.mjs'
];
const rightsBoundaryValidators = [
  'scripts/kidults/market/validate-provider-rights-decision-gate-v1.mjs'
];
const providerAdapterBoundaryValidators = [
  'scripts/kidults/kpmo/validate-provider-adapter-workflow-provenance-v1.mjs',
  'scripts/kidults/kpmo/validate-privileged-provider-probe-workflow-provenance-v1.mjs'
];
const runtimeBoundaryValidators = [
  'scripts/operations/validate_digitalocean_staging_bootstrap_v1.py',
  'scripts/operations/validate_digitalocean_staging_bootstrap_exec_v1.py',
  'scripts/operations/validate_digitalocean_staging_bootstrap_workflow_v1.py',
  'scripts/kidults/kpmo/validate-staging-portal-workflow-provenance-v1.mjs'
];
const productionRecoveryValidators = [
  'scripts/kidults/kpmo/validate-production-rollback-contract-v1.mjs'
];
const downstreamBoundaryValidators = [
  'scripts/kidults/kpmo/validate-er-projection-workflow-provenance-v1.mjs',
  'scripts/kidults/portal/validate-portal-release-001.mjs'
];
const validators = [...new Set([
  structuralValidator,
  stageCoverageValidator,
  criticalGateBindingValidator,
  ...criticalWorkflowProvenanceValidators,
  ...repositoryMutationBoundaryValidators,
  ...secretBoundaryValidators,
  ...truthScopeValidators,
  ...(orchestrator.required_family_validators || []),
  ...p0PrePartnerValidators,
  ...rightsBoundaryValidators,
  ...providerAdapterBoundaryValidators,
  ...runtimeBoundaryValidators,
  ...productionRecoveryValidators,
  ...downstreamBoundaryValidators
])];

const results = [];
for (const script of validators) {
  if (!fs.existsSync(script)) {
    console.error(`FAIL aggregate Red-Team validator missing: ${script}`);
    process.exit(1);
  }
  const command = script.endsWith('.py') ? (process.env.PYTHON || 'python3') : process.execPath;
  const run = spawnSync(command, [script], {
    cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  });
  const result = { script, command, status: run.status, signal: run.signal || null };
  results.push(result);
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.error) {
    console.error(`FAIL aggregate Red-Team validator execution error: ${script}: ${run.error.message}`);
    process.exit(1);
  }
  if (run.status !== 0) {
    console.error(`FAIL aggregate Red-Team validator: ${script} exited ${run.status}`);
    process.exit(run.status || 1);
  }
}

console.log(JSON.stringify({
  suite: 'KIDULTS_FULL_VALUE_CHAIN_REDTEAM_V1',
  control_layer_result: 'PASS',
  validators_passed: results.length,
  stages_machine_bound: Object.keys(orchestrator.stage_machine_coverage || {}).length,
  critical_workflow_provenance_machine_bound: true,
  critical_workflow_provenance_validators: criticalWorkflowProvenanceValidators.length,
  workflow_repository_mutation_boundary_machine_bound: true,
  workflow_repository_mutation_boundary_validators: repositoryMutationBoundaryValidators.length,
  pull_request_secret_boundary_machine_bound: true,
  pull_request_secret_boundary_validators: 1,
  privileged_manual_secret_lane_inventory_machine_bound: true,
  privileged_manual_secret_lane_registry_state: 'EXTERNAL_APPROVAL_REQUIRED',
  privileged_manual_secret_lane_issue: 974,
  scoped_certification_truth_boundary_machine_bound: true,
  scoped_certification_truth_boundary_validators: truthScopeValidators.length,
  pre_partner_intake_gate_machine_bound: true,
  pre_partner_certification_machine_bound: true,
  pre_partner_control_families: 12,
  pre_partner_required_controls_exactly_bound: true,
  pre_partner_control_removal_mutation_selftest: true,
  pre_partner_transitive_invalidation_machine_bound: true,
  pre_partner_durable_destructive_replay_machine_bound: true,
  pre_partner_rollback_revocation_resurrection_fail_closed: true,
  pre_partner_canonical_source_object_suppression_machine_bound: true,
  pre_partner_rekey_alias_reingestion_fail_closed: true,
  partner_like_adversarial_fixtures: 12,
  provider_rights_decision_gate_machine_bound: true,
  provider_adapter_workflow_provenance_machine_bound: true,
  provider_adapter_boundary_validators: providerAdapterBoundaryValidators.length,
  runtime_boundary_validators: runtimeBoundaryValidators.length,
  digitalocean_staging_bootstrap_boundary_machine_bound: true,
  digitalocean_staging_bootstrap_exec_contract_machine_bound: true,
  digitalocean_staging_bootstrap_workflow_machine_bound: true,
  digitalocean_staging_portal_workflow_provenance_machine_bound: true,
  production_recovery_boundary_machine_bound: true,
  production_recovery_validators: productionRecoveryValidators.length,
  production_automatic_rollback_executable_contract: true,
  er_projection_workflow_provenance_machine_bound: true,
  er_projection_workflow_provenance_validators: 1,
  projection_portal_eos_boundary_machine_bound: true,
  empirical_evidence_readiness: 'NOT_PROMOTED_BY_THIS_SUITE',
  release_evidence_readiness: 'NOT_PROMOTED_BY_THIS_SUITE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
