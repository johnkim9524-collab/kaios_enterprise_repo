import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function candidate(key, sourceClass, overrides = {}) {
  return {
    candidateKey: key,
    semanticRelevant: true,
    source: sourceClass === 'REFERENCE_PUBLIC_DATA' ? 'wikidata' : 'met',
    sourceClass,
    sourceRecordId: `${key}-record`,
    sourceUrl: `https://example.test/${key}`,
    rightsClass: 'CC0_STRUCTURED_DATA',
    observedAt: '2026-08-11T00:00:00.000Z',
    payloadHash: `hash-${key}`,
    ...overrides,
  };
}

function run(poc, { useFile = false, relativeOutput = false } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-canon-evidence-'));
  const absoluteOut = path.join(temp, 'out.json');
  const relativeOut = `reports/canon-test-${path.basename(temp)}.json`;
  const env = { ...process.env };
  if (useFile) {
    const input = path.join(temp, 'poc.json');
    fs.writeFileSync(input, JSON.stringify(poc));
    env.KIDULTS_CANON_POC_JSON = input;
  } else {
    env.KIDULTS_CANON_POC_JSON = JSON.stringify(poc);
  }
  env.KIDULTS_CANON_EVIDENCE_OUTPUT = relativeOutput ? relativeOut : absoluteOut;
  const result = spawnSync(process.execPath, ['scripts/kidult100-canon-evidence-recordize.mjs'], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
  const outputPath = relativeOutput ? path.join(process.cwd(), relativeOut) : absoluteOut;
  const report = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : null;
  if (relativeOutput) fs.rmSync(outputPath, { force: true });
  fs.rmSync(temp, { recursive: true, force: true });
  return { result, report };
}

test('recordizes supported reference and institutional canon signals without generating scores', () => {
  const poc = {
    candidates: [
      candidate('ref-1', 'REFERENCE_PUBLIC_DATA'),
      candidate('archive-1', 'INSTITUTION_ARCHIVE', { rightsClass: 'OPEN_ACCESS_PUBLIC_METADATA' }),
      candidate('irrelevant', 'REFERENCE_PUBLIC_DATA', { semanticRelevant: false }),
    ],
  };
  const { result, report } = run(poc);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.semanticRelevantCandidates, 2);
  assert.equal(report.metrics.canonEvidenceRecords, 2);
  assert.deepEqual(report.metrics.bySignalType, {
    REFERENCE_CANON_SIGNAL: 1,
    INSTITUTIONAL_RECOGNITION: 1,
  });
  assert.equal(report.evidence[0].primitive, 'CANON_CULTURAL_STRENGTH');
  assert.equal(report.evidence[0].evidenceClass, 'CANON_REFERENCE_EVIDENCE');
  assert.equal(report.evidence[0].rightsClass, 'CC0_STRUCTURED_DATA');
  assert.equal('normalizedScore' in report.evidence[0].value, false);
  assert.equal(report.claims.normalizedScoresGenerated, false);
  assert.equal(report.claims.sourceRightsReclassified, false);
});

test('official Wikidata HTTP concept URI is canonicalized to HTTPS while original URI is preserved', () => {
  const wikidata = candidate('wikidata-Q42', 'REFERENCE_PUBLIC_DATA', {
    sourceRecordId: 'Q42',
    sourceUrl: 'http://www.wikidata.org/entity/Q42',
  });
  const { result, report } = run({ candidates: [wikidata] });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.canonEvidenceRecords, 1);
  assert.equal(report.metrics.canonicalizedSourceUrls, 1);
  assert.equal(report.evidence[0].sourceUrl, 'https://www.wikidata.org/wiki/Q42');
  assert.equal(report.evidence[0].value.originalSourceUrl, 'http://www.wikidata.org/entity/Q42');
  assert.equal(report.evidence[0].safety.sourceUrlCanonicalizedToHttps, true);
  assert.equal(report.claims.sourceProvenanceOriginChanged, false);
  assert.equal(report.claims.originalNonHttpsSourceUrlPreservedWhenCanonicalized, true);
});

test('arbitrary HTTP sources remain fail-closed and are never upgraded', () => {
  const unsafe = candidate('wikidata-Q1', 'REFERENCE_PUBLIC_DATA', {
    sourceRecordId: 'Q1',
    sourceUrl: 'http://example.test/entity/Q1',
  });
  const { result, report } = run({ candidates: [unsafe] });
  assert.notEqual(result.status, 0);
  assert.equal(report.metrics.canonEvidenceRecords, 0);
  assert.equal(report.metrics.structuralErrorCount, 1);
  assert.match(report.structuralErrors[0], /sourceUrl/);
  assert.equal(report.claims.arbitraryHttpSourceAccepted, false);
});

test('unsupported source classes are rejected but never converted into canon evidence', () => {
  const { result, report } = run({ candidates: [candidate('market-1', 'MARKET_PROVIDER')] }, { useFile: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.canonEvidenceRecords, 0);
  assert.equal(report.metrics.rejectedCandidates, 1);
  assert.equal(report.rejected[0].reason, 'UNSUPPORTED_SOURCE_CLASS');
  assert.equal(report.rejected[0].sourceClass, 'MARKET_PROVIDER');
});

test('supported source with incomplete rights or provenance fails closed', () => {
  const malformed = candidate('bad-1', 'REFERENCE_PUBLIC_DATA', {
    source: '',
    sourceUrl: 'not-a-url',
    rightsClass: '',
    observedAt: 'invalid',
    payloadHash: '',
    sourceRecordId: '',
  });
  const { result, report } = run({ candidates: [malformed] }, { relativeOutput: true });
  assert.notEqual(result.status, 0);
  assert.equal(report.metrics.structuralErrorCount, 1);
  assert.match(report.structuralErrors[0], /INCOMPLETE_CANON_PROVENANCE:bad-1/);
  assert.match(report.structuralErrors[0], /sourceUrl/);
  assert.match(report.structuralErrors[0], /rightsClass/);
});

test('missing and duplicate candidate keys fail closed deterministically', () => {
  const duplicateA = candidate('dup', 'REFERENCE_PUBLIC_DATA');
  const duplicateB = candidate('dup', 'INSTITUTION_ARCHIVE');
  const missing = candidate('temporary', 'REFERENCE_PUBLIC_DATA', { candidateKey: '' });
  const { result, report } = run({ candidates: [missing, duplicateA, duplicateB] });
  assert.notEqual(result.status, 0);
  assert.ok(report.structuralErrors.includes('MISSING_CANDIDATE_KEY'));
  assert.ok(report.structuralErrors.includes('DUPLICATE_CANDIDATE_KEY:dup'));
  assert.equal(report.metrics.canonEvidenceRecords, 1);
});

test('missing JSON file input fails closed before materialization', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-canon-missing-'));
  const env = {
    ...process.env,
    KIDULTS_CANON_POC_JSON: path.join(temp, 'missing.json'),
    KIDULTS_CANON_EVIDENCE_OUTPUT: path.join(temp, 'out.json'),
  };
  const result = spawnSync(process.execPath, ['scripts/kidult100-canon-evidence-recordize.mjs'], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
  fs.rmSync(temp, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing JSON input/);
});
