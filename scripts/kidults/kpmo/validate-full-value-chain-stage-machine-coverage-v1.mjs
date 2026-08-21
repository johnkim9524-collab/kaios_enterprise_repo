import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const orchestratorPath = path.join(root, 'coordination/kidults/kpmo/full-value-chain-redteam-orchestrator-v1.json');
const data = JSON.parse(fs.readFileSync(orchestratorPath, 'utf8'));

if (data.aggregate_machine_enforcement?.require_all_stage_checks_bound !== true) {
  throw new Error('Aggregate Red-Team must require all stage checks to be machine-bound');
}
if (data.aggregate_machine_enforcement?.require_all_runtime_boundary_validators_pass !== true) {
  throw new Error('Aggregate Red-Team must require all runtime boundary validators to pass');
}

const stages = Array.isArray(data.chain_stages) ? data.chain_stages : [];
if (stages.length === 0) throw new Error('No Red-Team stages declared');

const stageIds = new Set(stages.map(stage => stage.id));
const coverage = data.stage_machine_coverage || {};
const requiredRuntimeBoundaryValidators = data.required_runtime_boundary_validators || [];
const aggregateValidators = new Set([
  ...(data.required_family_validators || []),
  ...requiredRuntimeBoundaryValidators
]);

for (const stage of stages) {
  const binding = coverage[stage.id];
  if (!binding) throw new Error(`Missing machine coverage binding for stage ${stage.id}`);
  if (binding.readiness_axis !== 'INTERNAL_CONTROL_READINESS') {
    throw new Error(`Stage ${stage.id} machine coverage must remain INTERNAL_CONTROL_READINESS`);
  }
  if (binding.empirical_gate_effect !== 'NONE') {
    throw new Error(`Stage ${stage.id} machine coverage must not promote empirical gates`);
  }
  if (!Array.isArray(binding.checks) || binding.checks.length === 0) {
    throw new Error(`Stage ${stage.id} has no machine-covered checks`);
  }
  if (!Array.isArray(binding.validators) || binding.validators.length === 0) {
    throw new Error(`Stage ${stage.id} has no executable validator binding`);
  }

  const declaredChecks = new Set(stage.checks || []);
  const boundChecks = new Set(binding.checks);
  if (declaredChecks.size !== boundChecks.size) {
    throw new Error(`Stage ${stage.id} machine coverage check count differs from declared checks`);
  }
  for (const check of declaredChecks) {
    if (!boundChecks.has(check)) throw new Error(`Stage ${stage.id} check is not machine-bound: ${check}`);
  }
  for (const check of boundChecks) {
    if (!declaredChecks.has(check)) throw new Error(`Stage ${stage.id} machine coverage references undeclared check: ${check}`);
  }

  const seenValidators = new Set();
  for (const validator of binding.validators) {
    if (seenValidators.has(validator)) throw new Error(`Stage ${stage.id} repeats validator binding: ${validator}`);
    seenValidators.add(validator);
    if (!aggregateValidators.has(validator)) {
      throw new Error(`Stage ${stage.id} binds validator not executed by aggregate suite: ${validator}`);
    }
    if (!fs.existsSync(path.join(root, validator))) {
      throw new Error(`Stage ${stage.id} bound validator missing: ${validator}`);
    }
  }
}

for (const stageId of Object.keys(coverage)) {
  if (!stageIds.has(stageId)) throw new Error(`Machine coverage references unknown stage: ${stageId}`);
}

if (Object.keys(coverage).length !== stages.length) {
  throw new Error(`Machine coverage stage count ${Object.keys(coverage).length} does not equal declared stage count ${stages.length}`);
}

const runtimeValidators = new Set(coverage.RUNTIME?.validators || []);
for (const validator of requiredRuntimeBoundaryValidators) {
  if (!runtimeValidators.has(validator)) {
    throw new Error(`RUNTIME stage missing required concrete boundary validator: ${validator}`);
  }
}

console.log(`PASS full value-chain stage machine coverage: ${stages.length} stages, ${stages.reduce((n, stage) => n + stage.checks.length, 0)} checks bound only to aggregate-executed validators; runtime boundaries ${requiredRuntimeBoundaryValidators.length}; empirical promotion NONE`);
