import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const TEST_DIR = path.join(ROOT, 'test');
const REPORT_DIR = path.join(ROOT, 'reports', 'engineering-hardening');
const REPORT_PATH = path.join(REPORT_DIR, 'coverage-gate-latest.txt');
const testFiles = readdirSync(TEST_DIR)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => path.join('test', name));

if (testFiles.length === 0) {
  console.error('Coverage gate FAIL: no test files discovered.');
  process.exit(1);
}

const thresholds = {
  lines: Number(process.env.COVERAGE_LINES_MIN ?? 100),
  branches: Number(process.env.COVERAGE_BRANCHES_MIN ?? 85),
  functions: Number(process.env.COVERAGE_FUNCTIONS_MIN ?? 100),
};

for (const [name, value] of Object.entries(thresholds)) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    console.error(`Coverage gate FAIL: invalid ${name} threshold ${value}.`);
    process.exit(1);
  }
}

console.log(`Coverage gate thresholds: lines>=${thresholds.lines}% branches>=${thresholds.branches}% functions>=${thresholds.functions}%`);

const result = spawnSync(
  process.execPath,
  [
    '--experimental-test-coverage',
    `--test-coverage-lines=${thresholds.lines}`,
    `--test-coverage-branches=${thresholds.branches}`,
    `--test-coverage-functions=${thresholds.functions}`,
    '--test',
    ...testFiles,
  ],
  { cwd: ROOT, encoding: 'utf8' },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(REPORT_PATH, [
  `generatedAt=${new Date().toISOString()}`,
  `status=${result.status ?? 'null'}`,
  `signal=${result.signal ?? 'none'}`,
  `linesThreshold=${thresholds.lines}`,
  `branchesThreshold=${thresholds.branches}`,
  `functionsThreshold=${thresholds.functions}`,
  '',
  '--- stdout ---',
  result.stdout || '',
  '',
  '--- stderr ---',
  result.stderr || '',
].join('\n'));
console.log(`Coverage diagnostic: ${path.relative(ROOT, REPORT_PATH)}`);

if (result.error) {
  console.error(`Coverage gate FAIL: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  const diagnosticLines = `${result.stdout || ''}\n${result.stderr || ''}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsedRows = diagnosticLines
    .filter((line) => line.includes('|'))
    .map((line) => ({
      raw: line,
      fields: line.replace(/^#\s*/, '').split('|').map((field) => field.trim()),
    }))
    .filter(({ fields }) => fields.length >= 4 && fields[0]);
  const totalRow = parsedRows.find(({ fields }) => /^all files$/i.test(fields[0]));
  const totalMetrics = totalRow ? {
    lines: Number(totalRow.fields[1]),
    branches: Number(totalRow.fields[2]),
    functions: Number(totalRow.fields[3]),
  } : null;
  const failedDimensions = {
    lines: Number.isFinite(totalMetrics?.lines) && totalMetrics.lines < thresholds.lines,
    branches: Number.isFinite(totalMetrics?.branches) && totalMetrics.branches < thresholds.branches,
    functions: Number.isFinite(totalMetrics?.functions) && totalMetrics.functions < thresholds.functions,
  };
  const displayedAtThreshold = {
    lines: Number.isFinite(totalMetrics?.lines) && totalMetrics.lines === thresholds.lines,
    branches: Number.isFinite(totalMetrics?.branches) && totalMetrics.branches === thresholds.branches,
    functions: Number.isFinite(totalMetrics?.functions) && totalMetrics.functions === thresholds.functions,
  };
  const coverageRows = parsedRows.filter(({ fields }) => !/^(file|all files)$/i.test(fields[0]));
  const failingRows = coverageRows.filter(({ fields }) => {
    const linePct = Number(fields[1]);
    const branchPct = Number(fields[2]);
    const functionPct = Number(fields[3]);
    return (failedDimensions.lines && Number.isFinite(linePct) && linePct < thresholds.lines)
      || (failedDimensions.branches && Number.isFinite(branchPct) && branchPct < thresholds.branches)
      || (failedDimensions.functions && Number.isFinite(functionPct) && functionPct < thresholds.functions);
  });
  const roundedThresholdSuspects = coverageRows.filter(({ fields }) => {
    const linePct = Number(fields[1]);
    const branchPct = Number(fields[2]);
    const functionPct = Number(fields[3]);
    const uncoveredLineDetail = fields.slice(4).join(' | ');
    return (displayedAtThreshold.lines && Number.isFinite(linePct) && linePct < thresholds.lines)
      || (displayedAtThreshold.branches && Number.isFinite(branchPct) && branchPct < thresholds.branches)
      || (displayedAtThreshold.functions && Number.isFinite(functionPct) && functionPct < thresholds.functions)
      || (displayedAtThreshold.lines && /\d/.test(uncoveredLineDetail));
  });
  const diagnosticRows = failingRows.length > 0 ? failingRows : roundedThresholdSuspects;
  const totalLine = totalRow?.raw || diagnosticLines.find((line) => /all files/i.test(line));
  const fallbackLine = diagnosticLines.find((line) => /coverage/i.test(line) && /fail|threshold|does not meet/i.test(line))
    || diagnosticLines.slice(-1)[0]
    || `test runner exited with status ${result.status}`;
  const coverageDetail = [totalLine, ...diagnosticRows.slice(0, 12).map(({ raw }) => raw)]
    .filter(Boolean)
    .join(' || ')
    || fallbackLine;
  const annotation = coverageDetail
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
  console.error(`::error title=KIDULTS P0 coverage gate::${annotation}`);
  console.error(`Coverage gate FAIL: test runner exited with status ${result.status}.`);
  process.exit(result.status ?? 1);
}

console.log('Coverage gate PASS.');
