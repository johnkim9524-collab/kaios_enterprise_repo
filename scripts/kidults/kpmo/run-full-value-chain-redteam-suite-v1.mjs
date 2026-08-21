import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const orchestratorPath = 'coordination/kidults/kpmo/full-value-chain-redteam-orchestrator-v1.json';
const orchestrator = JSON.parse(fs.readFileSync(orchestratorPath, 'utf8'));
const structuralValidator = 'scripts/kidults/kpmo/validate-full-value-chain-redteam-orchestrator-v1.mjs';
const stageCoverageValidator = 'scripts/kidults/kpmo/validate-full-value-chain-stage-machine-coverage-v1.mjs';
const validators = [structuralValidator, stageCoverageValidator, ...(orchestrator.required_family_validators || [])];

const results = [];
for (const script of validators) {
  const run = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const result = {
    script,
    status: run.status,
    signal: run.signal || null
  };
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
  empirical_evidence_readiness: 'NOT_PROMOTED_BY_THIS_SUITE',
  release_evidence_readiness: 'NOT_PROMOTED_BY_THIS_SUITE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
