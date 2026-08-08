import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ExecutionControlPlane, validateAdapterContract } from './lib/autonomous-execution-control-plane.mjs';
import { autonomousAdapters } from './lib/autonomous-adapters.mjs';

const cwd = process.cwd();
const policy = JSON.parse(readFileSync(resolve(cwd, 'policy', 'global-autonomous-policy.json'), 'utf8'));
const evidence = [];
const plane = new ExecutionControlPlane({ policy, adapters: autonomousAdapters, evidenceSink: async (entry) => evidence.push(entry) });

const adapterContractCoverage = Object.entries(autonomousAdapters).map(([name, adapter]) => ({ name, ...validateAdapterContract(adapter) }));

const passOperation = {
  id: 'a16-staging-cloudflare-dry-run', adapter: 'cloudflare', risk: 'R2', environment: 'staging',
  mutation: true, mode: 'dry-run', rollbackReady: true, canaryPassed: true, estimatedCostUsd: 1, blastRadius: 1
};
const productionPassOperation = {
  id: 'a16-production-digitalocean-canary', adapter: 'digitalocean', risk: 'R3', environment: 'production',
  mutation: true, mode: 'dry-run', rollbackReady: true, canaryPassed: true, estimatedCostUsd: 5, blastRadius: 1
};

const successfulRuns = [];
for (const operation of [passOperation, productionPassOperation]) {
  successfulRuns.push(await plane.run(operation));
}

async function expectFailure(name, operation, expectedFragment) {
  try {
    await plane.run(operation);
    return { name, passed: false, reason: 'unexpected-success' };
  } catch (error) {
    const message = String(error?.message ?? error);
    return { name, passed: message.includes(expectedFragment), message };
  }
}

const negativeCases = [];
negativeCases.push(await expectFailure('unknown adapter fails closed', {
  id:'unknown-adapter', adapter:'unknown', risk:'R1', environment:'staging', mutation:false
}, 'adapter-not-registered'));
negativeCases.push(await expectFailure('preflight failure blocks execution', {
  id:'preflight-fail', adapter:'github', risk:'R2', environment:'staging', mutation:true, forcePreflightFailure:true,
  rollbackReady:true, canaryPassed:true, estimatedCostUsd:1, blastRadius:1
}, 'preflight-failed'));
negativeCases.push(await expectFailure('production without rollback is policy denied', {
  id:'rollback-missing', adapter:'digitalocean', risk:'R3', environment:'production', mutation:true,
  rollbackReady:false, canaryPassed:true, estimatedCostUsd:1, blastRadius:1
}, 'policy-denied:production-rollback-required'));
negativeCases.push(await expectFailure('R4 without human approval is policy denied', {
  id:'r4-deny', adapter:'dns', risk:'R4', environment:'production', mutation:true,
  rollbackReady:true, canaryPassed:true, humanApproved:false, estimatedCostUsd:1, blastRadius:1
}, 'policy-denied:human-approval-required'));
negativeCases.push(await expectFailure('verification failure invokes rollback path', {
  id:'verify-fail', adapter:'database', risk:'R2', environment:'staging', mutation:true,
  rollbackReady:true, canaryPassed:true, forceVerificationFailure:true, estimatedCostUsd:1, blastRadius:1
}, 'verification-failed'));

const successfulEvidence = evidence.filter((x) => x.status === 'PASS');
const failedEvidence = evidence.filter((x) => x.status === 'FAIL');
const orderedStages = ['discover','preflight','plan','authorize','execute','verify','cleanup_or_rollback','evidence','finalize'];
const successfulStageOrder = successfulEvidence.every((entry) => orderedStages.every((stage, index) => entry.stages[index]?.name === stage));
const rollbackObserved = failedEvidence.some((entry) => entry.stages.some((stage) => stage.name === 'cleanup_or_rollback' && stage.mode === 'rollback'));

const gates = {
  adapterContractCoverage: adapterContractCoverage.every((x) => x.valid),
  cloudflareAdapterRegistered: Boolean(autonomousAdapters.cloudflare),
  githubAdapterRegistered: Boolean(autonomousAdapters.github),
  digitaloceanAdapterRegistered: Boolean(autonomousAdapters.digitalocean),
  providerAdapterRegistered: Boolean(autonomousAdapters.provider),
  databaseStorageDnsServerRegistered: ['database','storage','dns','server'].every((x) => Boolean(autonomousAdapters[x])),
  successfulPolicyGovernedExecution: successfulRuns.every((x) => x.status === 'PASS'),
  executionStagesOrdered: successfulStageOrder,
  negativeCasesFailClosed: negativeCases.every((x) => x.passed),
  rollbackPathCertified: rollbackObserved,
  evidenceProducedForEveryAttempt: evidence.length === successfulRuns.length + negativeCases.length,
  nonInteractiveExecutionContract: successfulRuns.every((x) => x.evidence.stages.length > 0)
};

const report = {
  certification: 'KIDULTS A16 Autonomous Execution Control Plane',
  completedAt: new Date().toISOString(),
  adapters: adapterContractCoverage,
  successfulRuns: successfulRuns.map((x) => ({ operationId:x.evidence.operationId, status:x.status, stages:x.evidence.stages.map((s) => s.name) })),
  negativeCases,
  evidenceCount: evidence.length,
  gates
};
report.status = Object.values(gates).every(Boolean) ? 'PASS' : 'FAIL';

const dir = resolve(cwd, 'reports', 'execution-control');
mkdirSync(dir, { recursive: true });
const reportPath = resolve(dir, `a16-execution-control-${Date.now()}.json`);
writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
console.log(`A16 report: ${reportPath}`);
console.log(`A16 certification: ${report.status}`);
if (report.status !== 'PASS') process.exit(1);
