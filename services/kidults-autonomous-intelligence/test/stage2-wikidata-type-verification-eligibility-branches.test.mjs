import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-stage2-wikidata-type-verify.mjs');

function base(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q100', canonicalTitle: 'Example Model 100', vertical: 'automobiles-mobility',
    source: 'wikidata', sourceClass: 'REFERENCE_PUBLIC_DATA', sourceRecordId: 'Q100',
    sourceUrl: 'https://www.wikidata.org/entity/Q100', rightsClass: 'CC0_STRUCTURED_DATA',
    observedAt: '2026-08-11T00:00:00Z', payloadHash: 'a'.repeat(64), semanticRelevant: false,
    semanticStageD: { reasons: ['REFERENCE_PRODUCT_OBJECT_CONTEXT_MISSING'], diagnostics: { allAnchorsMatched: true } },
    ...overrides,
  };
}

function invoke(input, fixture = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-type-eligibility-'));
  const inputPath = path.join(dir, 'input.json');
  const fixturePath = path.join(dir, 'fixture.json');
  const outputPath = path.join(dir, 'out.json');
  const auditPath = path.join(dir, 'audit.json');
  fs.writeFileSync(inputPath, JSON.stringify(input));
  fs.writeFileSync(fixturePath, JSON.stringify(fixture));
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_WIKIDATA_TYPE_INPUT_JSON: inputPath,
      KIDULTS_WIKIDATA_TYPE_ENTITIES_JSON: fixturePath,
      KIDULTS_WIKIDATA_TYPE_OUTPUT: outputPath,
      KIDULTS_WIKIDATA_TYPE_AUDIT_OUTPUT: auditPath,
    },
  });
  const output = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : null;
  const audit = fs.existsSync(auditPath) ? JSON.parse(fs.readFileSync(auditPath, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, output, audit };
}

test('Stage E eligibility rejects each identity and prior-stage mismatch without requalification', () => {
  const candidates = [
    base(),
    base({ candidateKey: 'source-mismatch', source: 'other' }),
    base({ candidateKey: 'class-mismatch', sourceClass: 'OTHER' }),
    base({ candidateKey: 'rights-mismatch', rightsClass: 'UNKNOWN' }),
    base({ candidateKey: 'qid-mismatch', sourceRecordId: 'not-qid' }),
    base({ candidateKey: 'reasons-length', semanticStageD: { reasons: ['REFERENCE_PRODUCT_OBJECT_CONTEXT_MISSING', 'EXTRA'], diagnostics: { allAnchorsMatched: true } } }),
    base({ candidateKey: 'reason-mismatch', semanticStageD: { reasons: ['OTHER_REASON'], diagnostics: { allAnchorsMatched: true } } }),
    base({ candidateKey: 'anchor-mismatch', semanticStageD: { reasons: ['REFERENCE_PRODUCT_OBJECT_CONTEXT_MISSING'], diagnostics: { allAnchorsMatched: false } } }),
  ];
  const input = { mode: 'KIDULT100_VALUE_BEFORE_DATA_POC', candidates };
  const { result, output, audit } = invoke(input, { Q100: { missing: '' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(audit.metrics.eligibleStageDContextMissingCandidates, 1);
  assert.equal(audit.metrics.evaluatedCandidates, 1);
  assert.equal(output.candidates.filter((row) => row.semanticStageE.disposition === 'NOT_ELIGIBLE_FOR_SOURCE_NATIVE_REQUALIFICATION').length, 7);
  assert.equal(output.candidates[0].semanticStageE.reasons[0], 'WIKIDATA_ENTITY_UNAVAILABLE');
});

test('Stage E input topology fails closed for wrong mode non-array candidates and missing candidate identity', () => {
  const wrongMode = invoke({ mode: 'WRONG_MODE', candidates: [] });
  assert.notEqual(wrongMode.result.status, 0);
  assert.match(wrongMode.result.stderr, /Invalid POC mode/);

  const nonArray = invoke({ mode: 'KIDULT100_VALUE_BEFORE_DATA_POC', candidates: null });
  assert.notEqual(nonArray.result.status, 0);
  assert.match(nonArray.result.stderr, /candidates must be an array/);

  const missingKey = invoke({ mode: 'KIDULT100_VALUE_BEFORE_DATA_POC', candidates: [base({ candidateKey: '' })] });
  assert.notEqual(missingKey.result.status, 0);
  assert.match(missingKey.result.stderr, /missing candidateKey/);
});
