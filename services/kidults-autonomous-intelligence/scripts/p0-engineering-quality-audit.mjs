import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_ROOTS = ['src', 'scripts'];
const EXCLUDED_DIRS = new Set(['node_modules', 'reports', 'fixtures', '.wrangler', 'dist', 'coverage']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const MAX_FILE_LINES_WARN = 700;
const MAX_FILE_LINES_FAIL = 1500;

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function walk(dir, out = []) {
  if (!(await exists(dir))) return out;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const files = [];
for (const rel of SCAN_ROOTS) await walk(path.join(ROOT, rel), files);

const findings = [];
const stats = {
  filesScanned: 0,
  linesScanned: 0,
  oversizedWarn: 0,
  oversizedFail: 0,
  todoFixme: 0,
  consoleCalls: 0,
  explicitAny: 0,
  emptyCatch: 0,
};

function add(severity, code, file, line, detail) {
  findings.push({ severity, code, file, line, detail });
}

for (const file of files) {
  const text = await fs.readFile(file, 'utf8');
  const rel = path.relative(ROOT, file).replaceAll('\\', '/');
  const lines = text.split(/\r?\n/);
  stats.filesScanned += 1;
  stats.linesScanned += lines.length;

  if (lines.length > MAX_FILE_LINES_FAIL) {
    stats.oversizedFail += 1;
    add('P1', 'OVERSIZED_FILE', rel, null, `${lines.length} lines; refactor threshold is ${MAX_FILE_LINES_FAIL}`);
  } else if (lines.length > MAX_FILE_LINES_WARN) {
    stats.oversizedWarn += 1;
    add('P2', 'LARGE_FILE', rel, null, `${lines.length} lines; review threshold is ${MAX_FILE_LINES_WARN}`);
  }

  lines.forEach((lineText, index) => {
    const n = index + 1;
    if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(lineText)) {
      stats.todoFixme += 1;
      add('P2', 'DEBT_MARKER', rel, n, lineText.trim().slice(0, 180));
    }
    if (/\bconsole\.(log|debug|warn|error)\s*\(/.test(lineText) && !rel.includes('scripts/')) {
      stats.consoleCalls += 1;
      add('P2', 'RAW_CONSOLE_IN_RUNTIME', rel, n, lineText.trim().slice(0, 180));
    }
    if (/\bany\b/.test(lineText) && /(:\s*any\b|as\s+any\b|<any>)/.test(lineText)) {
      stats.explicitAny += 1;
      add('P2', 'EXPLICIT_ANY', rel, n, lineText.trim().slice(0, 180));
    }
  });

  const emptyCatch = text.match(/catch\s*\([^)]*\)\s*\{\s*\}/g) ?? [];
  if (emptyCatch.length) {
    stats.emptyCatch += emptyCatch.length;
    add('P1', 'EMPTY_CATCH', rel, null, `${emptyCatch.length} empty catch block(s)`);
  }
}

const requiredFiles = [
  'package.json',
  'tsconfig.json',
];
for (const rel of requiredFiles) {
  if (!(await exists(path.join(ROOT, rel)))) add('P1', 'MISSING_REQUIRED_FILE', rel, null, 'required engineering baseline file is missing');
}
if (!(await exists(path.join(ROOT, 'wrangler.toml'))) && !(await exists(path.join(ROOT, 'wrangler.jsonc')))) {
  add('P2', 'WRANGLER_CONFIG_NOT_AT_SERVICE_ROOT', '.', null, 'verify Cloudflare configuration location is intentional and documented');
}

const lockfiles = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'];
if (!(await Promise.any(lockfiles.map(async (f) => (await exists(path.join(ROOT, f))) ? f : Promise.reject())).catch(() => null))) {
  add('P1', 'NO_LOCKFILE', '.', null, 'dependency graph is not reproducibly locked');
}

const packageJson = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
for (const scriptName of ['typecheck', 'validate']) {
  if (!packageJson.scripts?.[scriptName]) add('P1', 'MISSING_PACKAGE_SCRIPT', 'package.json', null, `missing script: ${scriptName}`);
}
for (const qualityScript of ['lint', 'test', 'coverage']) {
  if (!packageJson.scripts?.[qualityScript]) add('P2', 'MISSING_QUALITY_SCRIPT', 'package.json', null, `recommended quality script absent: ${qualityScript}`);
}

const counts = findings.reduce((acc, f) => {
  acc[f.severity] = (acc[f.severity] ?? 0) + 1;
  return acc;
}, {});

const status = (counts.P0 ?? 0) > 0 ? 'FAIL' : 'PASS_WITH_FINDINGS';
const report = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  objective: 'Speed x Quality engineering hardening baseline',
  status,
  thresholds: { maxFileLinesWarn: MAX_FILE_LINES_WARN, maxFileLinesFail: MAX_FILE_LINES_FAIL },
  stats,
  findingCounts: counts,
  findings: findings.sort((a, b) => (a.severity + a.code + a.file).localeCompare(b.severity + b.code + b.file)),
};

const reportDir = path.join(ROOT, 'reports', 'engineering-hardening');
await fs.mkdir(reportDir, { recursive: true });
await fs.writeFile(path.join(reportDir, 'quality-audit-latest.json'), JSON.stringify(report, null, 2) + '\n');

console.log(`Engineering quality audit: ${status}`);
console.log(`Files: ${stats.filesScanned}, lines: ${stats.linesScanned}`);
console.log(`Findings: P0=${counts.P0 ?? 0} P1=${counts.P1 ?? 0} P2=${counts.P2 ?? 0} P3=${counts.P3 ?? 0}`);
console.log('Report: reports/engineering-hardening/quality-audit-latest.json');

if (status === 'FAIL') process.exit(1);
