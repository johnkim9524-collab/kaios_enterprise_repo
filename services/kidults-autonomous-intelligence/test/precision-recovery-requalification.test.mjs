import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePrecisionRecoveryRow,
  canRequalifyExistingCandidate,
  requalifyExistingCandidate,
} from '../scripts/lib/precision-recovery.mjs';

const stopTokens = ['watch', 'watches', 'handbag', 'bag', 'shoe', 'shoes', 'computer', 'camera', 'console', 'game', 'comic', 'book', 'card', 'trading'];

function candidate(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q1',
    vertical: 'watches-jewelry',
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: 'Q1',
    canonicalTitle: 'Cartier Tank',
    description: 'wristwatch model',
    sourceUrl: 'https://www.wikidata.org/wiki/Q1',
    observedAt: '2026-08-11T00:00:00Z',
    rightsClass: 'CC0_STRUCTURED_DATA',
    payloadHash: 'abc',
    query: 'Cartier',
    semanticRelevant: false,
    ...overrides,
  };
}

test('exact curated recovery requires all distinctive anchors and source product context', () => {
  const pass = evaluatePrecisionRecoveryRow({
    query: 'Cartier Tank watch',
    row: { label: 'Cartier Tank', description: 'iconic wristwatch line' },
    productTerms: ['wristwatch', 'watch'],
    disallowedTerms: ['company', 'museum'],
    stopTokens,
  });
  assert.equal(pass.accepted, true);
  assert.equal(pass.allDistinctiveAnchorsMatched, true);
  assert.deepEqual(pass.anchorHits, ['cartier', 'tank']);
  assert.ok(pass.productHits.includes('wristwatch'));
  assert.ok(pass.queryProductHits.includes('watch'));

  const partial = evaluatePrecisionRecoveryRow({
    query: 'Cartier Tank watch',
    row: { label: 'Cartier', description: 'wristwatch line' },
    productTerms: ['wristwatch', 'watch'],
    disallowedTerms: ['company'],
    stopTokens,
  });
  assert.equal(partial.accepted, false);
  assert.equal(partial.allDistinctiveAnchorsMatched, false);

  const disallowed = evaluatePrecisionRecoveryRow({
    query: 'Cartier Tank watch',
    row: { label: 'Cartier Tank', description: 'watch company' },
    productTerms: ['watch'],
    disallowedTerms: ['company'],
    stopTokens,
  });
  assert.equal(disallowed.accepted, false);
  assert.ok(disallowed.disallowedHits.includes('company'));
});

test('model-specific no-description row can use exact curated query without inventing evidence', () => {
  const result = evaluatePrecisionRecoveryRow({
    query: 'Leica M3 camera',
    row: { label: 'Leica M3', description: null },
    productTerms: ['camera model', 'camera'],
    disallowedTerms: ['company', 'museum'],
    stopTokens,
  });
  assert.equal(result.accepted, true);
  assert.equal(result.modelSpecificNoDescription, true);
  assert.equal(result.productHits.length, 0);
  assert.ok(result.queryProductHits.includes('camera'));
});

test('query product type alone is insufficient when source context is neither product nor model-specific', () => {
  const result = evaluatePrecisionRecoveryRow({
    query: 'Nintendo GameCube video game console',
    row: { label: 'Nintendo GameCube', description: 'sixth-generation Nintendo system' },
    productTerms: ['video game console', 'game console'],
    disallowedTerms: ['brand owned', 'file format'],
    stopTokens,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.productHits.length, 0);
  assert.equal(result.modelSpecificNoDescription, false);
});

test('existing candidate requalification is restricted to same vertical Wikidata CC0 records', () => {
  const evaluation = { accepted: true };
  assert.equal(canRequalifyExistingCandidate(candidate(), 'watches-jewelry', evaluation), true);
  assert.equal(canRequalifyExistingCandidate(candidate({ semanticRelevant: true }), 'watches-jewelry', evaluation), false);
  assert.equal(canRequalifyExistingCandidate(candidate({ vertical: 'fashion-accessories' }), 'watches-jewelry', evaluation), false);
  assert.equal(canRequalifyExistingCandidate(candidate({ source: 'met' }), 'watches-jewelry', evaluation), false);
  assert.equal(canRequalifyExistingCandidate(candidate({ sourceClass: 'INSTITUTION_ARCHIVE' }), 'watches-jewelry', evaluation), false);
  assert.equal(canRequalifyExistingCandidate(candidate({ rightsClass: 'RIGHTS_UNKNOWN' }), 'watches-jewelry', evaluation), false);
  assert.equal(canRequalifyExistingCandidate(candidate(), 'watches-jewelry', { accepted: false }), false);
  assert.equal(canRequalifyExistingCandidate(null, 'watches-jewelry', evaluation), false);
});

test('requalification preserves source identity and records semantic-only recovery provenance', () => {
  const original = candidate();
  const evaluation = {
    accepted: true,
    anchors: ['cartier', 'tank'],
    anchorHits: ['cartier', 'tank'],
    allDistinctiveAnchorsMatched: true,
    productHits: ['wristwatch'],
    queryProductHits: ['watch'],
    disallowedHits: [],
    modelSpecificNoDescription: false,
    exactCuratedProductQueryMatch: true,
  };
  const updated = requalifyExistingCandidate(original, 'Cartier Tank watch', evaluation);
  assert.equal(updated.semanticRelevant, true);
  assert.equal(updated.query, 'Cartier Tank watch');
  assert.equal(updated.sourceUrl, original.sourceUrl);
  assert.equal(updated.payloadHash, original.payloadHash);
  assert.equal(updated.observedAt, original.observedAt);
  assert.equal(updated.rightsClass, original.rightsClass);
  assert.equal(updated.semanticRelevanceDiagnostics.precisionRecovery.originalQuery, 'Cartier');
  assert.equal(updated.semanticRelevanceDiagnostics.precisionRecovery.exactCuratedProductQueryMatch, true);

  const noDescription = requalifyExistingCandidate(
    candidate({ canonicalTitle: 'Leica M3', description: null }),
    'Leica M3 camera',
    { ...evaluation, modelSpecificNoDescription: true },
  );
  assert.equal(noDescription.query, 'Leica M3');
  assert.equal(noDescription.semanticRelevanceDiagnostics.precisionRecovery.recoveryQuery, 'Leica M3 camera');
});
