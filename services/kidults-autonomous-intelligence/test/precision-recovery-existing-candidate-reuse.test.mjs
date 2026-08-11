import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePrecisionRecoveryRow,
  getReusableExistingWikidataRows,
} from '../scripts/lib/precision-recovery.mjs';

function candidate(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q1',
    vertical: 'fashion-accessories',
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: 'Q1',
    canonicalTitle: 'Adidas Superstar',
    description: 'athletic shoe model',
    sourceUrl: 'https://www.wikidata.org/wiki/Q1',
    observedAt: '2026-08-11T00:00:00Z',
    rightsClass: 'CC0_STRUCTURED_DATA',
    payloadHash: 'payload-1',
    semanticRelevant: false,
    ...overrides,
  };
}

test('reuses only same-vertical rights-qualified source-native Wikidata candidate rows', () => {
  const safe = candidate();
  const rows = getReusableExistingWikidataRows([
    safe,
    candidate({ candidateKey: 'wikidata:Q2', sourceRecordId: 'Q2', vertical: 'watches-jewelry' }),
    candidate({ candidateKey: 'wikidata:Q3', sourceRecordId: 'Q3', rightsClass: 'RIGHTS_UNKNOWN' }),
    candidate({ candidateKey: 'wikidata:Q4', sourceRecordId: 'Q4', source: 'aic' }),
    candidate({ candidateKey: 'wikidata:Q5', sourceRecordId: 'Q5', sourceClass: 'INSTITUTION_ARCHIVE' }),
    candidate({ candidateKey: 'wikidata:Q6', sourceRecordId: '', canonicalTitle: '' }),
  ], 'fashion-accessories');

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    id: 'Q1',
    label: 'Adidas Superstar',
    description: 'athletic shoe model',
    concepturi: 'https://www.wikidata.org/wiki/Q1',
    payloadHash: 'payload-1',
    observedAt: '2026-08-11T00:00:00Z',
    traceSource: 'POC_EXISTING_SOURCE_NATIVE_CANDIDATE',
  });

  rows[0].label = 'mutated copy';
  assert.equal(safe.canonicalTitle, 'Adidas Superstar');
});

test('existing source-native row can satisfy the same exact recovery evaluator without creating evidence', () => {
  const [row] = getReusableExistingWikidataRows([candidate()], 'fashion-accessories');
  const evaluation = evaluatePrecisionRecoveryRow({
    query: 'Adidas Superstar shoe',
    row,
    productTerms: ['athletic shoe', 'shoe'],
    disallowedTerms: ['company', 'person', 'file'],
    stopTokens: ['shoe', 'shoes'],
  });

  assert.equal(evaluation.accepted, true);
  assert.deepEqual(evaluation.anchors, ['adidas', 'superstar']);
  assert.deepEqual(evaluation.anchorHits, ['adidas', 'superstar']);
  assert.ok(evaluation.productHits.includes('athletic shoe'));
  assert.equal(row.traceSource, 'POC_EXISTING_SOURCE_NATIVE_CANDIDATE');
});

test('invalid candidate topology returns an empty reusable row set', () => {
  assert.deepEqual(getReusableExistingWikidataRows(null, 'fashion-accessories'), []);
  assert.deepEqual(getReusableExistingWikidataRows([], ''), []);
  assert.deepEqual(getReusableExistingWikidataRows([candidate({ sourceUrl: '' })], 'fashion-accessories'), []);
  assert.deepEqual(getReusableExistingWikidataRows([candidate({ payloadHash: '' })], 'fashion-accessories'), []);
  assert.deepEqual(getReusableExistingWikidataRows([candidate({ observedAt: '' })], 'fashion-accessories'), []);
});
