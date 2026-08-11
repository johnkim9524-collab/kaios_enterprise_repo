import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePrecisionRecoveryRow,
  canRequalifyExistingCandidate,
  canRefreshExistingRelevantCandidate,
  requalifyExistingCandidate,
  refreshExistingRelevantCandidate,
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

function acceptedEvaluation(overrides = {}) {
  return {
    accepted: true,
    anchors: ['cartier', 'tank'],
    anchorHits: ['cartier', 'tank'],
    allDistinctiveAnchorsMatched: true,
    productHits: ['wristwatch'],
    queryProductHits: ['watch'],
    disallowedHits: [],
    modelSpecificNoDescription: false,
    exactCuratedProductQueryMatch: true,
    recoverySearchPayloadHash: 'search-hash',
    recoveryObservedAt: '2026-08-11T12:00:00Z',
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

test('existing candidate recovery actions are mutually exclusive and rights scoped', () => {
  const evaluation = { accepted: true };
  const irrelevant = candidate();
  const relevant = candidate({ semanticRelevant: true });
  assert.equal(canRequalifyExistingCandidate(irrelevant, 'watches-jewelry', evaluation), true);
  assert.equal(canRefreshExistingRelevantCandidate(irrelevant, 'watches-jewelry', evaluation), false);
  assert.equal(canRequalifyExistingCandidate(relevant, 'watches-jewelry', evaluation), false);
  assert.equal(canRefreshExistingRelevantCandidate(relevant, 'watches-jewelry', evaluation), true);

  for (const unsafe of [
    candidate({ semanticRelevant: true, vertical: 'fashion-accessories' }),
    candidate({ semanticRelevant: true, source: 'met' }),
    candidate({ semanticRelevant: true, sourceClass: 'INSTITUTION_ARCHIVE' }),
    candidate({ semanticRelevant: true, rightsClass: 'RIGHTS_UNKNOWN' }),
  ]) {
    assert.equal(canRefreshExistingRelevantCandidate(unsafe, 'watches-jewelry', evaluation), false);
  }
  assert.equal(canRefreshExistingRelevantCandidate(relevant, 'watches-jewelry', { accepted: false }), false);
  assert.equal(canRefreshExistingRelevantCandidate(null, 'watches-jewelry', evaluation), false);
});

test('requalification preserves source identity and records semantic-only recovery provenance', () => {
  const original = candidate();
  const evaluation = acceptedEvaluation();
  const updated = requalifyExistingCandidate(original, 'Cartier Tank watch', evaluation);
  assert.equal(updated.semanticRelevant, true);
  assert.equal(updated.query, 'Cartier Tank watch');
  assert.equal(updated.sourceUrl, original.sourceUrl);
  assert.equal(updated.payloadHash, original.payloadHash);
  assert.equal(updated.observedAt, original.observedAt);
  assert.equal(updated.rightsClass, original.rightsClass);
  assert.equal(updated.semanticRelevanceDiagnostics.precisionRecovery.requalifiedExistingCandidate, true);
  assert.equal(updated.semanticRelevanceDiagnostics.precisionRecovery.refreshedExistingRelevantCandidate, false);
  assert.equal(updated.semanticRelevanceDiagnostics.precisionRecovery.semanticSearchContextOnlyNotEvidence, true);
  assert.equal(updated.semanticRelevanceDiagnostics.precisionRecovery.recoverySearchPayloadHash, 'search-hash');
  assert.equal(updated.semanticRelevanceDiagnostics.precisionRecovery.originalQuery, 'Cartier');

  const noDescription = requalifyExistingCandidate(
    candidate({ canonicalTitle: 'Leica M3', description: null }),
    'Leica M3 camera',
    acceptedEvaluation({ modelSpecificNoDescription: true }),
  );
  assert.equal(noDescription.query, 'Leica M3');
});

test('proof refresh preserves an already relevant candidate and only replaces semantic query context', () => {
  const original = candidate({ semanticRelevant: true, query: 'watch' });
  const updated = refreshExistingRelevantCandidate(original, 'Cartier Tank watch', acceptedEvaluation());
  assert.equal(updated.semanticRelevant, true);
  assert.equal(updated.query, 'Cartier Tank watch');
  assert.equal(updated.semanticRelevanceVersion, 'SEMANTIC_V2_8_WIKIDATA_EXACT_QUERY_PROOF_REFRESH');
  assert.equal(updated.candidateKey, original.candidateKey);
  assert.equal(updated.sourceRecordId, original.sourceRecordId);
  assert.equal(updated.sourceUrl, original.sourceUrl);
  assert.equal(updated.rightsClass, original.rightsClass);
  assert.equal(updated.observedAt, original.observedAt);
  assert.equal(updated.payloadHash, original.payloadHash);
  const proof = updated.semanticRelevanceDiagnostics.precisionRecovery;
  assert.equal(proof.requalifiedExistingCandidate, false);
  assert.equal(proof.refreshedExistingRelevantCandidate, true);
  assert.equal(proof.semanticSearchContextOnlyNotEvidence, true);
  assert.equal(proof.originalQuery, 'watch');
  assert.equal(proof.recoveryQuery, 'Cartier Tank watch');
  assert.equal(proof.recoveryObservedAt, '2026-08-11T12:00:00Z');
});
