import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const orchestratorPath = 'coordination/kidults/kpmo/full-value-chain-redteam-orchestrator-v1.json';
const orchestrator = JSON.parse(fs.readFileSync(orchestratorPath, 'utf8'));
const structuralValidator = 'scripts/kidults/kpmo/validate-full-value-chain-redteam-orchestrator-v1.mjs';
const stageCoverageValidator = 'scripts/kidults/kpmo/validate-full-value-chain-stage-machine-coverage-v1.mjs';
const criticalGateBindingValidator = 'scripts/kidults/kpmo/validate-full-value-chain-critical-gate-bindings-v1.mjs';
const repositoryMutationBoundaryValidators = [
  'scripts/kidults/kpmo/validate-workflow-repository-mutation-boundary-v1.mjs'
];
const secretBoundaryValidators = [
  'scripts/kidults/kpmo/validate-pr-secret-boundary-v1.mjs'
];
const p0PrePartnerValidators = [
  'scripts/kidults/audit/certify-pre-partner-intake-gate-v1.mjs',
  'scripts/kidults/audit/validate-pre-partner-control-family-coverage-v1.mjs',
  'scripts/kidults/audit/validate-unified-audit-control-plane-v1.mjs',
  'scripts/kidults/audit/validate-pre-partner-adversarial-fixtures-v1.mjs',
  'scripts/kidults/audit/validate-rights-withdrawal-transitive-invalidation-v1.mjs'
];
const rightsBoundaryValidators = [
  'scripts/kidults/market/validate-provider-rights-decision-gate-v1.mjs'
];
const runtimeBoundaryValidators = [
  'scripts/operations/validate_digitalocean_staging_bootstrap_v1.py',
  'scripts/operations/validate_digitalocean_staging_bootstrap_exec_v1.py',
  'scripts/operations/validate_digitalocean_staging_bootstrap_workflow_v1.py'
];
const downstreamBoundaryValidators = [
  'scripts/kidults/portal/validate-portal-release-001.mjs'
];
const validators = [...new Set([
  structuralValidator,
  stageCoverageValidator,
  criticalGateBindingValidator,
  ...repositoryMutationBoundaryValidators,
  ...secretBoundaryValidators,
  ...(orchestrator.required_family_validators || []),
  ...p0PrePartnerValidators,
  ...rightsBoundaryValidators,
  ...runtimeBoundaryValidators,
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
  workflow_repository_mutation_boundary_machine_bound: true,
  workflow_repository_mutation_boundary_validators: repositoryMutationBoundaryValidators.length,
  pull_request_secret_boundary_machine_bound: true,
  pull_request_secret_boundary_validators: secretBoundaryValidators.length,
  pre_partner_intake_gate_machine_bound: true,
  pre_partner_certification_machine_bound: true,
  pre_partner_control_families: 12,
  pre_partner_required_controls_exactly_bound: true,
  pre_partner_control_removal_mutation_selftest: true,
  pre_partner_transitive_invalidation_machine_bound: true,
  partner_like_adversarial_fixtures: 12,
  provider_rights_decision_gate_machine_bound: true,
  runtime_boundary_validators: runtimeBoundaryValidators.length,
  digitalocean_staging_bootstrap_boundary_machine_bound: true,
  digitalocean_staging_bootstrap_exec_contract_machine_bound: true,
  digitalocean_staging_bootstrap_workflow_machine_bound: true,
  projection_portal_eos_boundary_machine_bound: true,
  empirical_evidence_readiness: 'NOT_PROMOTED_BY_THIS_SUITE',
  release_evidence_readiness: 'NOT_PROMOTED_BY_THIS_SUITE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
