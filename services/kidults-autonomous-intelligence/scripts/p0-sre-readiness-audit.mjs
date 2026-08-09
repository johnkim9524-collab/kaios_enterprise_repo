import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (relative) => fs.readFile(path.join(ROOT, relative), 'utf8');
const readJson = async (relative) => JSON.parse(await read(relative));

const [policy, recovery, governance, deployment, worker, criticalCi] = await Promise.all([
  readJson('policy/p0-sre-reliability-baseline.json'),
  read('scripts/a26-autonomous-recovery.mjs'),
  read('scripts/a27-autonomous-operational-governance.mjs'),
  read('scripts/a33-deployment-governance.mjs'),
  read('src/worker.ts'),
  readJson('reports/engineering-hardening/critical-ci-audit-latest.json'),
]);

const checks = [
  {
    id: 'FAIL_CLOSED_CRITICAL_UNKNOWN',
    passed: policy?.principles?.failClosedOnUnknownCriticalState === true,
  },
  {
    id: 'NO_SYNTHETIC_LIVE_CONFUSION',
    passed:
      policy?.principles?.syntheticEvidenceDoesNotEqualLiveProof === true &&
      policy?.certificationBoundary?.liveOperationalCertified === false,
  },
  {
    id: 'SLO_ERROR_BUDGET_CONTRACT',
    passed:
      Number(policy?.serviceLevelObjectives?.availabilityTargetPercent) > 0 &&
      policy?.errorBudget?.exhaustionAction === 'FREEZE_OR_DEGRADE_AND_ESCALATE',
  },
  {
    id: 'RECOVERY_RTO_RPO_CONTRACT',
    passed:
      Number(policy?.recoveryObjectives?.targetRtoMinutes) > 0 &&
      Number(policy?.recoveryObjectives?.targetRpoMinutes) >= 0,
  },
  {
    id: 'RECOVERY_TIMEOUT_RATE_LIMIT_BACKOFF',
    passed: /TIMEOUT/u.test(recovery) && /RATE_LIMIT/u.test(recovery) && /BACKOFF/u.test(recovery),
  },
  {
    id: 'RECOVERY_QUARANTINE_ROLLBACK',
    passed: /QUARANTINE/u.test(recovery) && /ROLLBACK/u.test(recovery),
  },
  {
    id: 'STRUCTURED_OPERATIONAL_LOGS_AND_SLO',
    passed: /JSON\.stringify/u.test(governance) && /SLO/u.test(governance),
  },
  {
    id: 'CANARY_ROLLBACK_GOVERNANCE',
    passed: /CANARY/u.test(deployment) && /ROLLBACK/u.test(deployment),
  },
  {
    id: 'SCHEDULER_FAILURE_AUDIT',
    passed: worker.includes('autonomous_cycle.error'),
  },
  {
    id: 'CRITICAL_CI_DETERMINISTIC_AND_LEAST_PRIVILEGE',
    passed:
      criticalCi?.passed === true &&
      Number(criticalCi?.counts?.P1 ?? 1) === 0 &&
      Number(criticalCi?.counts?.P2 ?? 1) === 0,
  },
];

const failed = checks.filter((check) => !check.passed);
const report = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? 'PASS_BASELINE' : 'FAIL',
  scope: 'SRE/reliability hardening control baseline',
  evidenceClass: 'SIMULATION_AND_STATIC_CONTROL_EVIDENCE',
  liveOperationalCertified: false,
  liveOperationalEvidenceRequired: true,
  checks,
  counts: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
  explicitLimitations: [
    'This audit certifies control presence and simulation evidence only.',
    'It does not certify production availability, live provider failover, live RTO/RPO, or unattended-operation rates.',
  ],
};

const outDir = path.join(ROOT, 'reports', 'engineering-hardening');
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'sre-readiness-latest.json'), JSON.stringify(report, null, 2) + '\n');

console.log(`SRE readiness audit: ${report.status}; ${report.counts.passed}/${report.counts.total} checks passed; liveOperationalCertified=false`);
for (const check of failed) console.error(`SRE FAIL ${check.id}`);
if (failed.length) process.exit(1);
