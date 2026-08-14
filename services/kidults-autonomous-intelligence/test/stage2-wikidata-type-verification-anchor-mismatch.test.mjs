import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-stage2-wikidata-type-verify.mjs');

function candidate(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q100',
    canonicalTitle: 'LaFerrari',
    vertical: 'automobiles-mobility',
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: 'Q100',
    sourceUrl: 'https://www.wikidata.org/entity/Q100',
    rightsClass: 'CC0_STRUCTURED_DATA',
    observedAt: '2026-08-11T00:00:00Z',
    payloadHash: 'a'.repeat(64),
    query: 'Ferrari Enzo',
    semanticRelevant: false,
    semanticStageD: {
      passed: false,
      reasons: ['REFERENCE_QUERY_ANCHOR_MISMATCH'],
      diagnostics: {
        genericQuery: false,
        allAnchorsMatched: false,
        productTitleHits: [],
        productDescriptionHits: ['sports car'],
      },
    },
    ...overrides,
  };
}

function entity(typeIds = []) {
  return { claims: { P31: typeIds.map((id) => ({ mainsnak: { datavalue: { value: { id } } } })) } };
}

function type(label, description = '') {
  return { labels: { en: { value: label } }, descriptions: { en: { value: description } } };
}

function invoke(candidates, fixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-anchor-mismatch-'));
  const outputPath = path.join(dir, 'out.json');
  const auditPath = path.join(dir, 'audit.json');
  const input = { mode: 'KIDULT100_VALUE_BEFORE_DATA_POC', semanticPolicy: {}, metrics: {}, candidateBuild: {}, claims: {}, candidates };
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_WIKIDATA_TYPE_INPUT_JSON: JSON.stringify(input),
      KIDULTS_WIKIDATA_TYPE_ENTITIES_JSON: JSON.stringify({ entities: fixture }),
      KIDULTS_WIKIDATA_TYPE_OUTPUT: outputPath,
      KIDULTS_WIKIDATA_TYPE_AUDIT_OUTPUT: auditPath,
    },
  });
  const output = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : null;
  const audit = fs.existsSync(auditPath) ? JSON.parse(fs.readFileSync(auditPath, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, output, audit };
}

test('query-anchor mismatch cannot be requalified by product context or direct P31 product type alone', () => {
  const rows = [
    candidate(),
    candidate({
      candidateKey: 'wikidata:Q101', sourceRecordId: 'Q101', canonicalTitle: 'NES Remix', vertical: 'gaming-music-screen', query: 'Nintendo Entertainment System', payloadHash: 'b'.repeat(64),
      semanticStageD: { passed: false, reasons: ['REFERENCE_QUERY_ANCHOR_MISMATCH'], diagnostics: { genericQuery: false, allAnchorsMatched: false, productTitleHits: [], productDescriptionHits: ['video game'] } },
    }),
    candidate({
      candidateKey: 'wikidata:Q102', sourceRecordId: 'Q102', canonicalTitle: 'Generic Query Candidate', payloadHash: 'c'.repeat(64),
      semanticStageD: { passed: false, reasons: ['REFERENCE_QUERY_ANCHOR_MISMATCH'], diagnostics: { genericQuery: true, allAnchorsMatched: false, productTitleHits: [], productDescriptionHits: ['sports car'] } },
    }),
    candidate({
      candidateKey: 'wikidata:Q103', sourceRecordId: 'Q103', canonicalTitle: 'Wrong Entity Type', payloadHash: 'd'.repeat(64),
      semanticStageD: { passed: false, reasons: ['REFERENCE_PRODUCT_OBJECT_CONTEXT_MISSING'], diagnostics: { allAnchorsMatched: true } },
    }),
    candidate({
      candidateKey: 'wikidata:Q104', sourceRecordId: 'Q104', canonicalTitle: 'Verified Car Model', payloadHash: 'e'.repeat(64),
      semanticStageD: { passed: false, reasons: ['REFERENCE_PRODUCT_OBJECT_CONTEXT_MISSING'], diagnostics: { allAnchorsMatched: true } },
    }),
    candidate({
      candidateKey: 'wikidata:Q105', sourceRecordId: 'Q105', canonicalTitle: 'Disabled Sentinel Probe', payloadHash: 'f'.repeat(64),
      semanticStageD: { passed: false, reasons: ['REFERENCE_QUERY_ANCHOR_MISMATCH__REQUALIFICATION_DISABLED'], diagnostics: { genericQuery: false, allAnchorsMatched: false, productTitleHits: [], productDescriptionHits: [] } },
    }),
  ];
  const fixture = {
    Q100: entity(['Q900']), Q900: type('car model', 'automobile product model'),
    Q101: entity(['Q901']), Q901: type('video game compilation', 'multiple video games sold as a single product'),
    Q102: entity(['Q900']),
    Q103: entity(['Q902']), Q902: type('human'),
    Q104: entity(['Q900']),
  };
  const { result, output, audit } = invoke(rows, fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(audit.metrics.eligibleStageDAnchorMismatchCandidates, 0);
  assert.equal(audit.metrics.recoveredAnchorMismatchCandidates, 0);
  assert.equal(output.candidates[0].semanticRelevant, false);
  assert.equal(output.candidates[0].semanticStageE.disposition, 'NOT_ELIGIBLE_FOR_SOURCE_NATIVE_REQUALIFICATION');
  assert.equal(output.candidates[0].payloadHash, 'a'.repeat(64));
  assert.equal(output.candidates[1].semanticRelevant, false);
  assert.equal(output.candidates[1].semanticStageE.disposition, 'NOT_ELIGIBLE_FOR_SOURCE_NATIVE_REQUALIFICATION');
  assert.equal(output.candidates[2].semanticRelevant, false);
  assert.equal(output.candidates[2].semanticStageE.disposition, 'NOT_ELIGIBLE_FOR_SOURCE_NATIVE_REQUALIFICATION');
  assert.equal(output.candidates[3].semanticRelevant, false);
  assert.equal(output.candidates[3].semanticStageE.reasons[0], 'WIKIDATA_DIRECT_P31_DISALLOWED_TYPE');
  assert.equal(output.candidates[4].semanticRelevant, true);
  assert.equal(output.candidates[4].semanticStageE.reasons[0], 'WIKIDATA_DIRECT_P31_PRODUCT_TYPE_CONFIRMED');
  assert.equal(output.candidates[5].semanticRelevant, false);
  assert.equal(output.candidates[5].semanticStageE.disposition, 'NOT_ELIGIBLE_FOR_SOURCE_NATIVE_REQUALIFICATION');
  assert.equal(audit.metrics.recoveredCandidates, 1);
  assert.equal(audit.safety.rightsClassificationRelaxed, false);
  assert.equal(audit.safety.provenanceRelaxed, false);
});
