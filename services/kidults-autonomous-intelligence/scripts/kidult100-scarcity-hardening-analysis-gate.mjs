import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const DEFAULT_REPORT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-evidence-target-queue-hardened-latest.json');
const reportRaw = process.env.KIDULTS_SCARCITY_HARDEN_OUTPUT || DEFAULT_REPORT;
const reportPath = path.isAbsolute(reportRaw) ? reportRaw : path.join(ROOT, reportRaw);

const child = spawnSync(process.execPath, ['scripts/kidult100-scarcity-target-queue-harden.mjs'], {
  cwd: ROOT,
  env: process.env,
  encoding: 'utf8',
});

if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);

if (child.status === 0) process.exit(0);
if (!fs.existsSync(reportPath) || !fs.statSync(reportPath).isFile()) process.exit(child.status ?? 1);

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
} catch {
  process.exit(child.status ?? 1);
}

const safeAnalysisOnlyShortfall = report?.mode === 'KIDULT100_SCARCITY_EVIDENCE_TARGET_QUEUE'
  && report?.queueVersion === 'HARDENED_SCOPE_V1'
  && report?.disposition === 'FAIL_CLOSED_INSUFFICIENT_SCOPE_SAFE_TARGET_SUPPLY'
  && Number(report?.metrics?.targetShortfall || 0) > 0
  && report?.hardeningContract?.clearScopeMismatchAllowed === false
  && report?.hardeningContract?.ambiguousScopeAutomaticallyQualified === false
  && report?.hardeningContract?.sourceQualificationPerformed === false
  && report?.hardeningContract?.normalizedScoreGenerated === false
  && report?.claims?.clearScopeMismatchRetained === false
  && report?.claims?.ambiguousTargetAutomaticallyQualified === false
  && report?.claims?.sourceAutomaticallyQualified === false
  && report?.claims?.productionScoringActivated === false;

if (!safeAnalysisOnlyShortfall) process.exit(child.status ?? 1);

console.log(`Scarcity hardening remains FAIL_CLOSED with shortfall=${report.metrics.targetShortfall}; continuing downstream analysis only.`);
console.log('No source qualification, production scoring, or evidence certification is implied by this continuation.');
