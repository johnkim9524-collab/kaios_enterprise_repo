import fs from 'node:fs';

const runnerPath = 'scripts/kidults/kpmo/run-full-value-chain-redteam-suite-v1.mjs';
const runner = fs.readFileSync(runnerPath, 'utf8');

const mandatory = [
  'scripts/kidults/kpmo/validate-full-value-chain-redteam-orchestrator-v1.mjs',
  'scripts/kidults/kpmo/validate-full-value-chain-stage-machine-coverage-v1.mjs',
  'scripts/kidults/audit/certify-pre-partner-intake-gate-v1.mjs',
  'scripts/kidults/audit/validate-pre-partner-control-family-coverage-v1.mjs',
  'scripts/kidults/audit/validate-unified-audit-control-plane-v1.mjs',
  'scripts/kidults/audit/validate-pre-partner-adversarial-fixtures-v1.mjs',
  'scripts/kidults/audit/validate-rights-withdrawal-transitive-invalidation-v1.mjs',
  'scripts/kidults/audit/validate-destructive-lifecycle-recovery-monotonicity-v1.mjs',
  'scripts/kidults/market/validate-provider-rights-decision-gate-v1.mjs',
  'scripts/operations/validate_digitalocean_staging_bootstrap_v1.py',
  'scripts/operations/validate_digitalocean_staging_bootstrap_exec_v1.py',
  'scripts/operations/validate_digitalocean_staging_bootstrap_workflow_v1.py',
  'scripts/kidults/portal/validate-portal-release-001.mjs'
];

const errors = [];
for (const script of mandatory) {
  if (!fs.existsSync(script)) errors.push(`mandatory validator missing: ${script}`);
  if (!runner.includes(script)) errors.push(`aggregate runner binding missing: ${script}`);
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
  'digitalocean_staging_bootstrap_exec_contract_machine_bound: true',
  'digitalocean_staging_bootstrap_workflow_machine_bound: true'
]) {
  if (!runner.includes(marker)) errors.push(`aggregate truth/control marker missing: ${marker}`);
}

const preIntake = JSON.parse(fs.readFileSync('coordination/kidults/audit/unified-audit-control-plane-v1.json','utf8'));
if (preIntake.governing_issue !== 881) errors.push('Unified Audit Control Plane must remain bound to #881');
if (!Array.isArray(preIntake.pre_partner_control_families) || preIntake.pre_partner_control_families.length !== 12) errors.push('all 12 #881 control families must remain machine-bound');
if (preIntake.truth_boundary?.empirical_gate_effect !== 'NONE') errors.push('control evidence must not promote empirical gates');

const orchestrator = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/full-value-chain-redteam-orchestrator-v1.json','utf8'));
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
  provider_rights_decision_gate:'MACHINE_BOUND',
  runtime_exec_contract:'MACHINE_BOUND',
  runtime_exec_workflow:'MACHINE_BOUND',
  empirical_gate_effect:'NONE',
  external_partner_data_ingestion:'HOLD',
  production:'HOLD',
  public:'HOLD',
  g5:'EXPLICIT_APPROVAL_REQUIRED'
},null,2));
