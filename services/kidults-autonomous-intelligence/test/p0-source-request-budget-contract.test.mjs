import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const source = fs.readFileSync(path.join(ROOT, 'scripts', 'kidult100-poc-live.mjs'), 'utf8');
const workflow = fs.readFileSync(path.join(ROOT, '..', '..', '.github', 'workflows', 'kidults-p0-speed-quality.yml'), 'utf8');

test('Stage 2 external source requests retain bounded fail-closed budgets', () => {
  assert.match(source, /const WIKIDATA_MAX_RETRIES = 4;/);
  assert.match(source, /const WIKIDATA_MAXLAG_SECONDS = 5;/);

  const requestTimeouts = source.match(/signal:\s*AbortSignal\.timeout\(15000\)/g) || [];
  assert.equal(requestTimeouts.length, 2, 'both non-Wikidata and Wikidata request paths must keep the 15s request timeout');

  assert.match(source, /if \(maxlag \|\| response\.status === 429 \|\| response\.status >= 500\)/);
  assert.match(source, /if \(attempt < WIKIDATA_MAX_RETRIES\)/);
  assert.match(source, /Math\.min\(10000, 900 \* \(2 \*\* attempt\)\)/);

  assert.match(workflow, /timeout --signal=TERM --kill-after=10s 240s node scripts\/kidult100-poc-live-observed\.mjs/);
  assert.match(workflow, /partialEvidenceAccepted:false/);
  assert.doesNotMatch(source, /Promise\.all\(collectors/);
  assert.doesNotMatch(source, /decisionGradeRightDataCertified:\s*true/);
  assert.doesNotMatch(source, /finalKidult100Certified:\s*true/);
});
