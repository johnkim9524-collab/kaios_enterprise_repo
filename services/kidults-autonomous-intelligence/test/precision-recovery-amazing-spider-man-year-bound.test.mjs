import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePrecisionRecoveryRow } from '../scripts/lib/precision-recovery.mjs';

const ROOT = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-precision-recovery-queries.json'), 'utf8'));
const referencePolicy = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-reference-precision-policy.json'), 'utf8'));

function normalize(value) {
  return String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const runtimeStopTokens = [
  ...(referencePolicy.queryStopTokens || []).map(normalize),
  'toy', 'doll', 'watch', 'wristwatch', 'shoe', 'shoes', 'sneaker', 'boot', 'handbag', 'bag',
  'camera', 'computer', 'console', 'game', 'video', 'handheld', 'comic', 'book', 'card', 'trading', 'baseball',
];

function evaluate(query, label, description) {
  return evaluatePrecisionRecoveryRow({
    query,
    row: { label, description },
    productTerms: referencePolicy.productObjectTermsByVertical['cards-comics-memorabilia'],
    disallowedTerms: referencePolicy.disallowedDescriptionTermsByVertical['cards-comics-memorabilia'],
    stopTokens: runtimeStopTokens,
  });
}

test('Amazing Spider-Man #1 recovery binds the request budget to the 1962 issue identity', () => {
  const queries = config.verticals['cards-comics-memorabilia'];

  assert.equal(queries.length, 32, 'comic recovery request budget changed');
  assert.ok(queries.includes('The Amazing Spider-Man #1 1962 comic book'));
  assert.equal(queries.includes('The Amazing Spider-Man 1 comic book'), false);
  assert.equal(queries.includes('The Amazing Spider-Man #1'), false, 'bare same-title issue alias must remain quarantined');
});

test('Amazing Spider-Man #1 year discriminator accepts the 1962 issue and rejects later same-title issues', () => {
  const original = evaluate('The Amazing Spider-Man #1 1962 comic book', 'The Amazing Spider-Man #1', '1962 comic book issue');
  const later = evaluate('The Amazing Spider-Man #1 1962 comic book', 'The Amazing Spider-Man #1', '2014 comic book issue');

  assert.equal(original.allDistinctiveAnchorsMatched, true);
  assert.equal(original.accepted, true);
  assert.equal(later.allDistinctiveAnchorsMatched, false);
  assert.equal(later.accepted, false);
});

test('Amazing Spider-Man issue recovery preserves official-Wikidata and fail-closed safety boundaries', () => {
  assert.equal(config.source, 'wikidata');
  assert.equal(config.sourceClass, 'REFERENCE_PUBLIC_DATA');
  assert.equal(config.rightsClass, 'CC0_STRUCTURED_DATA');
  assert.equal(config.safety.wikidataOnly, true);
  assert.equal(config.safety.officialApiOnly, true);
  assert.equal(config.safety.genericCategoryQueriesAllowed, false);
  assert.equal(config.safety.unauthorizedScrapingAllowed, false);
  assert.equal(config.safety.paidProviderProcurementAllowed, false);
  assert.equal(config.safety.syntheticEvidenceAllowed, false);
  assert.equal(config.safety.productionGateRelaxationAllowed, false);
});
