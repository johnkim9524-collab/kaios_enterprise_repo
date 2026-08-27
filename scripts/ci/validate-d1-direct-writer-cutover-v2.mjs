#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const SERVICE_ROOT = path.join(ROOT, 'services/kidults-autonomous-intelligence/src');
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'fixtures', '__tests__', '__snapshots__']);
const MUTATION = /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|TRUNCATE|VACUUM|REINDEX|ATTACH|DETACH)\b/i;
const STATIC_CALL = /\.(prepare|exec)\s*\(\s*([`'"])([\s\S]*?)\2\s*\)/g;
const PREPARE_OR_EXEC = /\.(prepare|exec)\s*\(/g;

async function sourceFiles() {
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
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(fullPath);
      } else if (
        entry.isFile() &&
        EXTENSIONS.has(path.extname(entry.name)) &&
        !/\.(test|spec)\.[^.]+$/.test(entry.name)
      ) {
        output.push(fullPath);
      }
    }
  }
  await walk(SERVICE_ROOT);
  return output.sort();
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function compact(value) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 220);
}

function inspect(file, source) {
  if (!source.includes('.prepare(') && !source.includes('.exec(')) return [];
  const relativeFile = path.relative(ROOT, file).replaceAll(path.sep, '/');
  const findings = [];
  const staticRanges = [];

  for (const match of source.matchAll(STATIC_CALL)) {
    staticRanges.push([match.index, match.index + match[0].length]);
    if (!MUTATION.test(match[3])) continue;
    findings.push({
      kind: 'STATIC_D1_MUTATION',
      file: relativeFile,
      line: lineNumber(source, match.index),
      method: match[1],
      evidence: compact(match[3])
    });
  }

  for (const match of source.matchAll(PREPARE_OR_EXEC)) {
    if (staticRanges.some(([start, end]) => match.index >= start && match.index < end)) continue;
    const argument = source.slice(match.index + match[0].length).trimStart();
    if (argument.startsWith('`') || argument.startsWith("'") || argument.startsWith('"')) continue;
    findings.push({
      kind: 'DYNAMIC_D1_SQL_PATH',
      file: relativeFile,
      line: lineNumber(source, match.index),
      method: match[1],
      evidence: compact(source.slice(match.index, match.index + 260))
    });
  }
  return findings;
}

const mode = process.argv.includes('--enforce-zero') ? 'enforce-zero' : 'inventory';
const outputArg = process.argv.find((item) => item.startsWith('--output='));
const outputPath = outputArg ? path.resolve(outputArg.slice('--output='.length)) : null;
const files = await sourceFiles();
const findings = [];
for (const file of files) findings.push(...inspect(file, await readFile(file, 'utf8')));

const byFile = Object.fromEntries(
  [...new Set(findings.map((item) => item.file))]
    .sort()
    .map((file) => [file, findings.filter((item) => item.file === file).length])
);
const report = {
  gate: 'D1_ZERO_DIRECT_WRITER',
  scope: 'services/kidults-autonomous-intelligence/src production sources',
  mode,
  generated_at: new Date().toISOString(),
  status: findings.length === 0 ? 'PASS' : 'HOLD',
  scanned_files: files.length,
  direct_writer_files: Object.keys(byFile).length,
  findings: findings.length,
  counts: {
    static_d1_mutations: findings.filter((item) => item.kind === 'STATIC_D1_MUTATION').length,
    dynamic_d1_sql_paths: findings.filter((item) => item.kind === 'DYNAMIC_D1_SQL_PATH').length
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
