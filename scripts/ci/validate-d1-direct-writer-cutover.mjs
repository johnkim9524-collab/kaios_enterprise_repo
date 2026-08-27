#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const SOURCE_ROOTS = [
  'services/kidults-autonomous-intelligence/src',
  'apps',
  'packages'
];
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.wrangler', 'fixtures', '__snapshots__']);
const MUTATION = /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|TRUNCATE|VACUUM|REINDEX|ATTACH|DETACH)\b/i;
const PREPARE_OR_EXEC = /\.(prepare|exec)\s*\(/g;
const STATIC_CALL = /\.(prepare|exec)\s*\(\s*([`'"])([\s\S]*?)\2\s*\)/g;

async function filesBelow(relativeRoot) {
  const base = path.join(ROOT, relativeRoot);
  const output = [];
  async function walk(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(path.join(directory, entry.name));
        continue;
      }
      if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
        output.push(path.join(directory, entry.name));
      }
    }
  }
  await walk(base);
  return output;
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function compact(value) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 180);
}

function inspect(relativePath, source) {
  const findings = [];
  const staticRanges = [];
  for (const match of source.matchAll(STATIC_CALL)) {
    const sql = match[3];
    staticRanges.push([match.index, match.index + match[0].length]);
    if (MUTATION.test(sql)) {
      findings.push({
        kind: 'STATIC_SQL_MUTATION',
        file: relativePath,
        line: lineNumber(source, match.index),
        method: match[1],
        evidence: compact(sql)
      });
    }
  }

  for (const match of source.matchAll(PREPARE_OR_EXEC)) {
    const insideStaticCall = staticRanges.some(([start, end]) => match.index >= start && match.index < end);
    if (insideStaticCall) continue;
    const argumentStart = match.index + match[0].length;
    const remainder = source.slice(argumentStart).trimStart();
    if (!remainder.startsWith('`') && !remainder.startsWith("'") && !remainder.startsWith('"')) {
      findings.push({
        kind: 'DYNAMIC_D1_SQL_PATH',
        file: relativePath,
        line: lineNumber(source, match.index),
        method: match[1],
        evidence: compact(source.slice(match.index, match.index + 220))
      });
    }
  }

  return findings;
}

const mode = process.argv.includes('--enforce-zero') ? 'enforce-zero' : 'inventory';
const outputArg = process.argv.find((item) => item.startsWith('--output='));
const outputPath = outputArg ? path.resolve(outputArg.slice('--output='.length)) : null;
const sourceFiles = (await Promise.all(SOURCE_ROOTS.map(filesBelow))).flat().sort();
const findings = [];
for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  findings.push(...inspect(path.relative(ROOT, file).replaceAll(path.sep, '/'), source));
}

const byFile = Object.fromEntries(
  [...new Set(findings.map((item) => item.file))]
    .sort()
    .map((file) => [file, findings.filter((item) => item.file === file).length])
);
const report = {
  gate: 'D1_ZERO_DIRECT_WRITER',
  mode,
  generated_at: new Date().toISOString(),
  status: findings.length === 0 ? 'PASS' : 'HOLD',
  scanned_files: sourceFiles.length,
  direct_writer_files: Object.keys(byFile).length,
  findings: findings.length,
  counts: {
    static_sql_mutations: findings.filter((item) => item.kind === 'STATIC_SQL_MUTATION').length,
    dynamic_sql_paths: findings.filter((item) => item.kind === 'DYNAMIC_D1_SQL_PATH').length
  },
  by_file: byFile,
  details: findings
};

if (outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (mode === 'enforce-zero' && findings.length > 0) process.exitCode = 1;
