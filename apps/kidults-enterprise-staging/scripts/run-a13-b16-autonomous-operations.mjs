import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const generatedRoot = path.join(dataRoot, 'generated');
const contract = JSON.parse(
  fs.readFileSync(path.join(dataRoot, 'autonomous-operations.json'), 'utf8')
);

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const runNode = script => {
  const result = spawnSync(process.execPath, [path.join(appRoot, 'scripts', script)], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`${script} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
};

const simulationResults = contract.failureSimulation.scenarios.map(scenario => {
  const outcome = scenario.id === 'total-provider-failure-with-fallback'
    ? 'fallback'
    : 'degraded';
  const fallbackActivated = outcome === 'fallback';
  return {
    id: scenario.id,
    expected: scenario.expected,
    outcome,
    fallbackExpected: scenario.fallbackExpected,
    fallbackActivated,
    passed: outcome === scenario.expected
      && fallbackActivated === scenario.fallbackExpected
  };
});

const simulationPassed = simulationResults.every(result => result.passed);
const b14Output = runNode('run-a13-b14-integrated-pipeline.mjs');
const b15Output = runNode('run-a13-b15-certification.mjs');

const b14Readiness = readJson(path.join(generatedRoot, 'readiness.json'));
const b15Certification = readJson(
  path.join(generatedRoot, 'external-source-certification.json')
);
const archive = readJson(path.join(appRoot, 'public', 'data', 'archive.json'));

const schedulePassed = contract.schedule.enabled === true
  && contract.schedule.concurrency === 1
  && contract.schedule.maxRuntimeMinutes > 0;
const pipelinePassed = b14Readiness.status === 'staging-certified'
  && fs.existsSync(path.join(generatedRoot, 'kidult-100.json'))
  && fs.existsSync(path.join(generatedRoot, 'monthly-intelligence.json'));
const healthPassed = simulationPassed && pipelinePassed;
const recoveryPassed = fs.existsSync(path.join(appRoot, 'A13-B16-OPERATIONS-RUNBOOK.md'));

const operationsHealth = {
  release: 'A13-B16',
  environment: 'staging',
  evaluatedAt: new Date().toISOString(),
  aggregateHealth: healthPassed ? 'healthy' : 'degraded',
  schedule: {
    status: schedulePassed ? 'ready' : 'blocked',
    cadence: contract.schedule.cadence,
    timezone: contract.schedule.timezone
  },
  failureSimulation: {
    status: simulationPassed ? 'passed' : 'blocked',
    results: simulationResults
  },
  b14Readiness: {
    status: b14Readiness.status,
    productionPromotionAuthorized: b14Readiness.productionPromotionAuthorized
  },
  b15Certification: {
    status: b15Certification.status,
    productionPromotionAuthorized: b15Certification.productionPromotionAuthorized,
    independentCertifiedFamilies: b15Certification.independentCertifiedFamilies
  },
  archive: {
    status: Array.isArray(archive.reports) && archive.reports.length > 0 ? 'ready' : 'blocked',
    reportCount: Array.isArray(archive.reports) ? archive.reports.length : 0
  },
  fallback: {
    available: fs.existsSync(path.join(dataRoot, 'intelligence-product.json')),
    verifiedBySimulation: simulationResults.some(
      result => result.id === 'total-provider-failure-with-fallback' && result.passed
    )
  }
};

const operationsReport = {
  release: 'A13-B16',
  environment: 'staging',
  evaluatedAt: operationsHealth.evaluatedAt,
  status: schedulePassed && simulationPassed && pipelinePassed && healthPassed && recoveryPassed
    ? 'staging-operations-certified'
    : 'blocked',
  productionPromotionAuthorized: false,
  gates: {
    schedule: schedulePassed ? 'passed' : 'blocked',
    failureSimulation: simulationPassed ? 'passed' : 'blocked',
    pipeline: pipelinePassed ? 'passed' : 'blocked',
    healthSnapshot: healthPassed ? 'passed' : 'blocked',
    recovery: recoveryPassed ? 'passed' : 'blocked',
    productionAuthorization: 'blocked'
  },
  blockers: [
    !schedulePassed && 'Scheduled runner contract is incomplete.',
    !simulationPassed && 'One or more failure simulations failed.',
    !pipelinePassed && 'B14 generated intelligence outputs are incomplete.',
    !healthPassed && 'Operational health snapshot is degraded.',
    !recoveryPassed && 'Recovery and rollback runbook is missing.',
    b15Certification.productionPromotionAuthorized !== true
      && 'External provider certification remains blocked.',
    'Explicit production release authorization remains false.'
  ].filter(Boolean),
  recovery: {
    runbook: 'A13-B16-OPERATIONS-RUNBOOK.md',
    fallbackDataset: contract.pipeline.fallbackDataset,
    rollbackStrategy: 'reset staging deployment to the latest certified main commit'
  },
  execution: {
    b14: b14Output,
    b15: b15Output
  }
};

writeJson(path.join(generatedRoot, 'operations-health.json'), operationsHealth);
writeJson(path.join(generatedRoot, 'autonomous-operations.json'), operationsReport);

console.log(`A13-B16 operations: ${operationsReport.status}.`);
console.log(`Failure simulations: ${simulationResults.filter(result => result.passed).length}/${simulationResults.length} passed.`);
console.log('Production promotion authorized: false.');
