import { promises as fs } from 'node:fs';
import path from 'node:path';

const SERVICE_ROOT = process.cwd();
const REPO_ROOT = path.resolve(SERVICE_ROOT, '..', '..');
const WORKFLOW_DIR = path.join(REPO_ROOT, '.github', 'workflows');
const HARDENING_WORKFLOW = 'kidults-p0-speed-quality.yml';
const MIN_STAGE = 15;
const MAX_STAGE = 40;

const files = await fs.readdir(WORKFLOW_DIR);
const critical = [];
const findings = [];

for (const file of files) {
  const match = file.match(/^kidults-a(\d+).*\.ya?ml$/i);
  if (!match) continue;
  const stage = Number(match[1]);
  if (stage < MIN_STAGE || stage > MAX_STAGE) continue;

  const text = await fs.readFile(path.join(WORKFLOW_DIR, file), 'utf8');
  critical.push({ file, stage });

  if (!/node-version:\s*['"]?22['"]?/i.test(text)) {
    findings.push({ severity: 'P1', code: 'CRITICAL_CI_NODE_BASELINE', file, detail: 'critical workflow must use Node 22' });
  }
  if (!/\bnpm ci\b/.test(text)) {
    findings.push({ severity: 'P1', code: 'CRITICAL_CI_NONDETERMINISTIC_INSTALL', file, detail: 'critical workflow must use npm ci' });
  }
  if (/\bnpm install\b/.test(text)) {
    findings.push({ severity: 'P1', code: 'CRITICAL_CI_NPM_INSTALL', file, detail: 'critical workflow still contains npm install' });
  }
  if (!text.includes('services/kidults-autonomous-intelligence/package-lock.json')) {
    findings.push({ severity: 'P1', code: 'CRITICAL_CI_LOCK_CACHE', file, detail: 'critical workflow must bind cache to tracked package-lock.json' });
  }
  if (!/permissions:\s*\n\s*contents:\s*read\b/m.test(text)) {
    findings.push({ severity: 'P2', code: 'CRITICAL_CI_LEAST_PRIVILEGE', file, detail: 'critical workflow should explicitly declare contents: read' });
  }
}

const hardening = await fs.readFile(path.join(WORKFLOW_DIR, HARDENING_WORKFLOW), 'utf8');
for (let stage = 25; stage <= 40; stage += 1) {
  if (!hardening.includes(`npm run a${stage}:certify`)) {
    findings.push({ severity: 'P1', code: 'UPPER_STAGE_REGRESSION_GAP', file: HARDENING_WORKFLOW, detail: `missing A${stage} simulation regression command` });
  }
}
if (!/permissions:\s*\n\s*contents:\s*read\b/m.test(hardening)) {
  findings.push({ severity: 'P1', code: 'HARDENING_PERMISSION_WIDENED', file: HARDENING_WORKFLOW, detail: 'hardening workflow must remain contents: read' });
}

critical.sort((a, b) => a.stage - b.stage || a.file.localeCompare(b.file));
findings.sort((a, b) => `${a.severity}${a.file}${a.code}`.localeCompare(`${b.severity}${b.file}${b.code}`));

const p1 = findings.filter((f) => f.severity === 'P1').length;
const p2 = findings.filter((f) => f.severity === 'P2').length;
const report = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  stageRange: `A${MIN_STAGE}-A${MAX_STAGE}`,
  workflowsChecked: critical,
  hardeningRegressionRange: 'A25-A40',
  findings,
  counts: { P1: p1, P2: p2 },
  passed: p1 === 0,
};

const outDir = path.join(SERVICE_ROOT, 'reports', 'engineering-hardening');
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'critical-ci-audit-latest.json'), JSON.stringify(report, null, 2) + '\n');

console.log(`Critical CI audit: ${report.passed ? 'PASS' : 'FAIL'}; workflows=${critical.length}; P1=${p1}; P2=${p2}`);
for (const finding of findings) console.log(`${finding.severity} ${finding.code} ${finding.file}: ${finding.detail}`);
if (!report.passed) process.exit(1);
