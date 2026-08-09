import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const TEST_DIR = path.join(ROOT, 'test');
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
  { cwd: ROOT, stdio: 'inherit' },
);

if (result.error) {
  console.error(`Coverage gate FAIL: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`Coverage gate FAIL: test runner exited with status ${result.status}.`);
  process.exit(result.status ?? 1);
}

console.log('Coverage gate PASS.');
