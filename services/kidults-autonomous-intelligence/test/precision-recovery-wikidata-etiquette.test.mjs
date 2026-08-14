import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const PRECISION_SCRIPT = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'kidult100-precision-recovery-live.mjs'),
  'utf8',
);
const STAGE2_SCRIPT = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'kidult100-poc-live.mjs'),
  'utf8',
);

function assertServerDrivenWikidataReadContract(script, { intervalName, maxlagName }) {
  assert.match(script, new RegExp(`const ${intervalName} = 0;`));
  assert.match(script, new RegExp(`const ${maxlagName} = 5;`));
  assert.match(script, new RegExp(`maxlag=\\$\\{${maxlagName}\\}`));
  assert.match(script, /'accept-encoding': 'gzip,deflate'/);
  assert.match(script, /body\?\.error\?\.code === 'maxlag'/);
  assert.match(script, /maxlagResponses \+= 1/);
  assert.match(script, /serverDrivenBackpressure: true/);
  assert.doesNotMatch(script, /Promise\.all\s*\(/);
}

test('precision recovery uses serial server-driven Wikidata backpressure without weakening safety gates', () => {
  assertServerDrivenWikidataReadContract(PRECISION_SCRIPT, {
    intervalName: 'MIN_INTERVAL_MS',
    maxlagName: 'MAXLAG_SECONDS',
  });
  assert.match(PRECISION_SCRIPT, /serialReadRequests: true/);
  assert.match(PRECISION_SCRIPT, /unauthorizedScrapingRequested: false/);
  assert.match(PRECISION_SCRIPT, /paidProviderProcurementRequested: false/);
  assert.match(PRECISION_SCRIPT, /productionGateRelaxed: false/);
});

test('Stage2 discovery uses the same serial server-driven Wikidata backpressure contract', () => {
  assertServerDrivenWikidataReadContract(STAGE2_SCRIPT, {
    intervalName: 'WIKIDATA_MIN_INTERVAL_MS',
    maxlagName: 'WIKIDATA_MAXLAG_SECONDS',
  });
  assert.match(STAGE2_SCRIPT, /serialWikidataReadRequests: true/);
  assert.match(STAGE2_SCRIPT, /accessDenialCircuitBreaker: true/);
});

test('Stage2 discovery retries only explicit Wikidata backpressure and keeps generic 5xx terminal', () => {
  assert.match(STAGE2_SCRIPT, /if \(maxlag \|\| response\.status === 429\)/);
  assert.match(STAGE2_SCRIPT, /retriesOnlyOnExplicitBackpressure: true/);
  assert.match(STAGE2_SCRIPT, /wikidataRetriesOnlyOnExplicitBackpressure: true/);
  assert.doesNotMatch(STAGE2_SCRIPT, /response\.status >= 500/);
});
