import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('optional JSON input that resolves to a directory is ignored without weakening required-input validation', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-delta-optional-dir-'));
  const out = path.join(tmp, 'out.json');
  const result = spawnSync(process.execPath, ['scripts/live-open-data-delta-kpi.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_CURRENT_UNIVERSE_JSON: JSON.stringify({
        constituents: [
          {
            source: 'TEST',
            sourceRecordId: '1',
            payloadHash: 'hash-1',
          },
        ],
      }),
      KIDULTS_CURRENT_VALIDATED_MARKET_JSON: tmp,
      KIDULTS_COLLECTION_DELTA_KPI_OUTPUT: out,
    },
  });

  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(tmp, { recursive: true, force: true });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report?.metrics?.uniqueTransactions, null);
  assert.equal(report?.claims?.repeatedTransactionIdCountedMoreThanOnce, false);
});
