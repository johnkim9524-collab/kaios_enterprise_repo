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

const cases = [
  ['Avengers #1 1963 comic book', 'Avengers #1', '1963 comic book issue', '2012 comic book issue'],
  ['Daredevil #1 1964 comic book', 'Daredevil #1', '1964 comic book issue', '2019 comic book issue'],
  ['The Incredible Hulk #181 1974 comic book', 'The Incredible Hulk #181', '1974 comic book issue', '2024 comic book issue'],
  ['Tales of Suspense #39 1963 comic book', 'Tales of Suspense #39', '1963 comic book issue', '2018 comic book issue'],
];

test('classic comic recovery rotates four typed queries to year-bound source-native issue identities without expanding request count', () => {
  const queries = config.verticals['cards-comics-memorabilia'];
  assert.equal(queries.length, 32, 'comic recovery request budget changed');
  for (const [query] of cases) assert.ok(queries.includes(query), `missing year-bound comic query: ${query}`);
  for (const oldQuery of [
    'Avengers 1 comic book',
    'Daredevil 1 comic book',
    'The Incredible Hulk 181 comic book',
    'Tales of Suspense 39 comic book',
  ]) assert.equal(queries.includes(oldQuery), false, `legacy typed query returned: ${oldQuery}`);
});

for (const [query, label, correctDescription, wrongDescription] of cases) {
  test(`${label} year-bound recovery rejects a same-title issue with the wrong publication year`, () => {
    const correct = evaluate(query, label, correctDescription);
    const wrong = evaluate(query, label, wrongDescription);
    assert.equal(correct.allDistinctiveAnchorsMatched, true);
    assert.equal(correct.accepted, true);
    assert.equal(wrong.allDistinctiveAnchorsMatched, false);
    assert.equal(wrong.accepted, false);
  });
}

test('classic comic year-bound batch preserves official-Wikidata and fail-closed safety boundaries', () => {
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
