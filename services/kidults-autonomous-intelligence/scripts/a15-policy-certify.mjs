import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { authorizeAction, validateExecutionContract } from './lib/autonomous-policy-engine.mjs';

const cwd = process.cwd();
const policy = JSON.parse(readFileSync(resolve(cwd, 'policy', 'global-autonomous-policy.json'), 'utf8'));
const inventory = JSON.parse(readFileSync(resolve(cwd, 'policy', 'autonomous-operations-inventory.json'), 'utf8'));

const executionStages = ['discover','preflight','plan','authorize','execute','verify','cleanup_or_rollback','evidence','finalize'];
const contract = validateExecutionContract(policy, executionStages);

const cases = [
  {
    name: 'R0 read-only observation is autonomous', expected: true,
    action: { risk:'R0', adapter:'cloudflare', environment:'staging', mutation:false, preflightPassed:true, rollbackReady:true, canaryPassed:true, interactive:false, evidenceContract:true, estimatedCostUsd:0, blastRadius:1 }
  },
  {
    name: 'R2 controlled mutation with policy gates is autonomous', expected: true,
    action: { risk:'R2', adapter:'provider', environment:'staging', mutation:true, preflightPassed:true, rollbackReady:true, canaryPassed:true, interactive:false, evidenceContract:true, estimatedCostUsd:10, blastRadius:100 }
  },
  {
    name: 'mutation without preflight is denied', expected: false,
    action: { risk:'R2', adapter:'database', environment:'staging', mutation:true, preflightPassed:false, rollbackReady:true, canaryPassed:true, interactive:false, evidenceContract:true, estimatedCostUsd:1, blastRadius:10 }
  },
  {
    name: 'interactive autonomous execution is denied', expected: false,
    action: { risk:'R2', adapter:'cloudflare', environment:'staging', mutation:true, preflightPassed:true, rollbackReady:true, canaryPassed:true, interactive:true, evidenceContract:true, estimatedCostUsd:1, blastRadius:10 }
  },
  {
    name: 'R3 production mutation without rollback is denied', expected: false,
    action: { risk:'R3', adapter:'digitalocean', environment:'production', mutation:true, preflightPassed:true, rollbackReady:false, canaryPassed:true, interactive:false, evidenceContract:true, estimatedCostUsd:50, blastRadius:10 }
  },
  {
    name: 'R3 production mutation without canary is denied', expected: false,
    action: { risk:'R3', adapter:'github', environment:'production', mutation:true, preflightPassed:true, rollbackReady:true, canaryPassed:false, interactive:false, evidenceContract:true, estimatedCostUsd:1, blastRadius:10 }
  },
  {
    name: 'R4 irreversible action cannot self-authorize', expected: false,
    action: { risk:'R4', adapter:'dns', environment:'production', mutation:true, preflightPassed:true, rollbackReady:true, canaryPassed:true, interactive:false, humanApproved:false, evidenceContract:true, estimatedCostUsd:1, blastRadius:1 }
  },
  {
    name: 'R4 can proceed only with explicit human approval', expected: true,
    action: { risk:'R4', adapter:'dns', environment:'production', mutation:true, preflightPassed:true, rollbackReady:true, canaryPassed:true, interactive:false, humanApproved:true, evidenceContract:true, estimatedCostUsd:1, blastRadius:1 }
  },
  {
    name: 'unknown adapter fails closed', expected: false,
    action: { risk:'R1', adapter:'unknown-system', environment:'staging', mutation:false, preflightPassed:true, rollbackReady:true, canaryPassed:true, interactive:false, evidenceContract:true, estimatedCostUsd:0, blastRadius:1 }
  },
  {
    name: 'cost budget breach is denied', expected: false,
    action: { risk:'R2', adapter:'digitalocean', environment:'staging', mutation:true, preflightPassed:true, rollbackReady:true, canaryPassed:true, interactive:false, evidenceContract:true, estimatedCostUsd:101, blastRadius:1 }
  },
  {
    name: 'missing evidence contract is denied', expected: false,
    action: { risk:'R1', adapter:'server', environment:'staging', mutation:false, preflightPassed:true, rollbackReady:true, canaryPassed:true, interactive:false, evidenceContract:false, estimatedCostUsd:0, blastRadius:1 }
  }
];

const results = cases.map((test) => {
  const decision = authorizeAction(policy, test.action);
  return { ...test, decision, passed: decision.allowed === test.expected };
});

const inventorySystems = new Set(inventory.surfaces.map((x) => x.system));
const requiredSystems = ['cloudflare','github','digitalocean','server','database','dns','provider','npm-node','publication','recovery'];
const inventoryCoverage = requiredSystems.every((system) => inventorySystems.has(system));
const hasR4 = inventory.surfaces.some((x) => x.risk === 'R4');
const nonInteractivePolicy = policy.globalRequirements?.interactivePromptAllowedInAutonomousExecution === false;
const defaultDeny = policy.globalRequirements?.defaultDecision === 'deny';
const adapterCoverage = ['cloudflare','github','digitalocean','provider','database','storage','dns','server'].every((x) => policy.adapters?.[x]?.enabled === true);

const gates = {
  executionContractCompleteAndOrdered: contract.valid,
  policyCasesPass: results.every((r) => r.passed),
  autonomousOperationsInventoryCoverage: inventoryCoverage,
  irreversibleActionsClassified: hasR4,
  nonInteractiveByDefault: nonInteractivePolicy,
  failClosedDefault: defaultDeny,
  coreAdapterPolicyCoverage: adapterCoverage,
  policyBeforeExecution: policy.principles?.includes('policy-before-execution') === true,
  evidenceRequired: policy.globalRequirements?.successRequiresEvidence === true,
  mutationPreflightRequired: policy.globalRequirements?.mutationRequiresPreflight === true
};

const report = {
  certification: 'KIDULTS A15 Global Autonomous Policy Foundation',
  policyVersion: policy.policyVersion,
  platform: policy.platform,
  completedAt: new Date().toISOString(),
  executionContract: { required: policy.executionContract, observed: executionStages, ...contract },
  inventory: { surfaces: inventory.surfaces.length, systems: [...inventorySystems].sort(), requiredSystems },
  testResults: results.map(({ name, expected, decision, passed }) => ({ name, expected, decision, passed })),
  gates
};
report.status = Object.values(gates).every(Boolean) ? 'PASS' : 'FAIL';

const dir = resolve(cwd, 'reports', 'policy');
mkdirSync(dir, { recursive: true });
const reportPath = resolve(dir, `a15-policy-${Date.now()}.json`);
writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
console.log(`A15 report: ${reportPath}`);
console.log(`A15 certification: ${report.status}`);
if (report.status !== 'PASS') process.exit(1);
