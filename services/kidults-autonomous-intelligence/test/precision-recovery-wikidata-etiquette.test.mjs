import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const SCRIPT = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'kidult100-precision-recovery-live.mjs'),
  'utf8',
);

test('precision recovery uses serial server-driven Wikidata backpressure without weakening safety gates', () => {
  assert.match(SCRIPT, /const MIN_INTERVAL_MS = 0;/);
  assert.match(SCRIPT, /const MAXLAG_SECONDS = 5;/);
  assert.match(SCRIPT, /maxlag=\$\{MAXLAG_SECONDS\}/);
  assert.match(SCRIPT, /'accept-encoding': 'gzip,deflate'/);
  assert.match(SCRIPT, /body\?\.error\?\.code === 'maxlag'/);
  assert.match(SCRIPT, /runtime\.maxlagResponses \+= 1/);
  assert.match(SCRIPT, /serialReadRequests: true/);
  assert.match(SCRIPT, /serverDrivenBackpressure: true/);
  assert.match(SCRIPT, /unauthorizedScrapingRequested: false/);
  assert.match(SCRIPT, /paidProviderProcurementRequested: false/);
  assert.match(SCRIPT, /productionGateRelaxed: false/);
  assert.doesNotMatch(SCRIPT, /Promise\.all\s*\(/);
});
