import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateCurrentSoldCanonicalEntrypoint,
} from '../../../scripts/kidults/market/validate-current-sold-canonical-entrypoint-v1.mjs';

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-sold-entrypoint-'));
  write(root, 'scripts/kidults/market/current-sold-engine-v1.mjs',
    'export function normalizeCurrentSoldObservation(){}; export function admitCurrentSoldBatch(){};');
  write(root, 'scripts/kidults/market/current-sold-batch-v1.mjs',
    "import { admitCurrentSoldBatch } from './current-sold-engine-v1.mjs';");
  write(root, 'scripts/kidults/market/current-sold-atomic-batch-v1.mjs',
    "import { admitCurrentSoldBatch } from './current-sold-engine-v1.mjs'; export function buildAtomicCurrentSoldBatchBundle(){};");
  write(root, 'scripts/kidults/market/current-sold-private-dry-run-v1.mjs',
    "import { buildAtomicCurrentSoldBatchBundle } from './current-sold-atomic-batch-v1.mjs';");
  write(root, 'scripts/kidults/market/current-sold-postgres-ledger-v1.mjs',
    "import { admitCurrentSoldBatch } from './current-sold-engine-v1.mjs'; const x='CURRENT_SOLD_LEDGER_ADMISSION_RECOMPUTE_MISMATCH';");
  write(root, 'tests/kidults/market/current-sold-test.mjs',
    "import { normalizeCurrentSoldObservation, admitCurrentSoldBatch } from '../../../scripts/kidults/market/current-sold-engine-v1.mjs';");
  return root;
}

test('approved engine, atomic wrapper, ledger and tests pass the entrypoint guard', () => {
  assert.equal(validateCurrentSoldCanonicalEntrypoint(fixture()).state, 'PASS');
});

test('a production consumer cannot call the low-level observation normalizer directly', () => {
  const root = fixture();
  write(root, 'services/consumer.mjs',
    "import { normalizeCurrentSoldObservation } from '../scripts/kidults/market/current-sold-engine-v1.mjs';");
  assert.throws(() => validateCurrentSoldCanonicalEntrypoint(root),
    /CURRENT_SOLD_CANONICAL_ENTRYPOINT_BYPASS/);
});

test('Track B cannot directly call the pre-atomic batch function', () => {
  const root = fixture();
  write(root, 'scripts/kidults/integration/track-b.mjs',
    "import { admitCurrentSoldBatch } from '../market/current-sold-engine-v1.mjs';");
  assert.throws(() => validateCurrentSoldCanonicalEntrypoint(root),
    /CURRENT_SOLD_CANONICAL_ENTRYPOINT_BYPASS/);
});

test('private dry-run must retain the atomic batch entrypoint', () => {
  const root = fixture();
  write(root, 'scripts/kidults/market/current-sold-private-dry-run-v1.mjs',
    'export function run(){};');
  assert.throws(() => validateCurrentSoldCanonicalEntrypoint(root),
    /CURRENT_SOLD_CANONICAL_ENTRYPOINT_BYPASS/);
});

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('PR-specific development snapshot exporter cannot become permanent workflow surface', () => {
  assert.equal(
    fs.existsSync(path.join(repositoryRoot, '.github/workflows/kpmo-pr1921-dev-snapshot-export-v1.yml')),
    false,
    'PR1921 development snapshot export workflow must remain absent',
  );
});
