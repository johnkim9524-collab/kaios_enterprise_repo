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

test('Batman and Superman issue recovery uses source-native publication-year discriminators without expanding request count', () => {
  const queries = config.verticals['cards-comics-memorabilia'];

  assert.equal(queries.length, 32, 'comic recovery request budget changed');
  assert.ok(queries.includes('Batman #1 1940 comic book'));
  assert.ok(queries.includes('Superman #1 1939 comic book'));
  assert.equal(queries.includes('Batman 1 comic book'), false);
  assert.equal(queries.includes('Superman 1 comic book'), false);
  assert.equal(queries.includes('Batman #1'), false, 'bare same-title Batman issue alias must remain quarantined');
  assert.equal(queries.includes('Superman #1'), false, 'bare same-title Superman issue alias must remain quarantined');
});

test('Batman #1 recovery accepts the 1940 issue and rejects later same-title issues', () => {
  const original = evaluate('Batman #1 1940 comic book', 'Batman #1', '1940 comic book issue');
  const later = evaluate('Batman #1 1940 comic book', 'Batman #1', '2011 comic book issue');

  assert.equal(original.allDistinctiveAnchorsMatched, true);
  assert.equal(original.accepted, true);
  assert.equal(later.allDistinctiveAnchorsMatched, false);
  assert.equal(later.accepted, false);
});

test('Superman #1 recovery accepts the 1939 issue and rejects later same-title issues', () => {
  const original = evaluate('Superman #1 1939 comic book', 'Superman #1', '1939 comic book issue');
  const later = evaluate('Superman #1 1939 comic book', 'Superman #1', '2018 comic book issue');

  assert.equal(original.allDistinctiveAnchorsMatched, true);
  assert.equal(original.accepted, true);
  assert.equal(later.allDistinctiveAnchorsMatched, false);
  assert.equal(later.accepted, false);
});

test('year-bound comic recovery preserves official-Wikidata and fail-closed safety boundaries', () => {
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
