#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE_EXTENSIONS = new Set(['.mjs', '.js', '.cjs', '.ts', '.tsx']);
const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', 'coverage', 'dist', 'build', 'out']);
const LOW_LEVEL_SYMBOLS = ['normalizeCurrentSoldObservation', 'admitCurrentSoldBatch'];
const ALLOWED_PRODUCTION_FILES = new Set([
  'scripts/kidults/market/current-sold-engine-v1.mjs',
  'scripts/kidults/market/current-sold-batch-v1.mjs',
  'scripts/kidults/market/current-sold-atomic-batch-v1.mjs',
  'scripts/kidults/market/current-sold-postgres-ledger-v1.mjs',
  'scripts/kidults/market/validate-current-sold-canonical-entrypoint-v1.mjs',
]);
const REQUIRED_ATOMIC_CONSUMERS = [
  'scripts/kidults/market/current-sold-private-dry-run-v1.mjs',
  'scripts/kidults/market/current-sold-postgres-ledger-v1.mjs',
];

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function walk(directory, base = directory) {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...walk(absolute, base));
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(path.relative(base, absolute).split(path.sep).join('/'));
    }
  }
  return results.sort();
}

export function validateCurrentSoldCanonicalEntrypoint(rootDirectory = process.cwd()) {
  const root = path.resolve(rootDirectory);
  const violations = [];
  const inspected = [];
  for (const relative of walk(root)) {
    const absolute = path.join(root, relative);
    const content = fs.readFileSync(absolute, 'utf8');
    inspected.push(relative);
    const isTest = relative.startsWith('tests/');
    if (!isTest && !ALLOWED_PRODUCTION_FILES.has(relative)) {
      for (const symbol of LOW_LEVEL_SYMBOLS) {
        if (new RegExp(`\\b${symbol}\\b`).test(content)) {
          violations.push(`${relative}:${symbol}`);
        }
      }
    }
  }

  for (const relative of REQUIRED_ATOMIC_CONSUMERS) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) fail('CURRENT_SOLD_ENTRYPOINT_REQUIRED_CONSUMER_MISSING', relative);
    const content = fs.readFileSync(absolute, 'utf8');
    if (relative.endsWith('private-dry-run-v1.mjs') &&
        !content.includes("from './current-sold-atomic-batch-v1.mjs'")) {
      violations.push(`${relative}:ATOMIC_BATCH_IMPORT_MISSING`);
    }
    if (relative.endsWith('postgres-ledger-v1.mjs') &&
        !content.includes('CURRENT_SOLD_LEDGER_ADMISSION_RECOMPUTE_MISMATCH')) {
      violations.push(`${relative}:LEDGER_RECOMPUTE_GUARD_MISSING`);
    }
  }

  if (violations.length > 0) {
    fail('CURRENT_SOLD_CANONICAL_ENTRYPOINT_BYPASS', violations.join('|'));
  }

  return {
    state: 'PASS',
    canonical_entrypoint: 'buildAtomicCurrentSoldBatchBundle',
    low_level_symbols_guarded: LOW_LEVEL_SYMBOLS,
    allowed_production_files: [...ALLOWED_PRODUCTION_FILES].sort(),
    inspected_source_files: inspected.length,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(validateCurrentSoldCanonicalEntrypoint(process.argv[2] || process.cwd()), null, 2));
}
