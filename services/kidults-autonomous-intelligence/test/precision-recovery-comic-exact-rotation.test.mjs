import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-precision-recovery-queries.json'), 'utf8'));

function normalize(value) {
  return String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

test('comic recovery rotates only unambiguous verified issue labels without expanding the request budget', () => {
  const queries = config.verticals['cards-comics-memorabilia'];
  const exact = [
    'Amazing Fantasy #15',
    'Fantastic Four #1',
    'Giant-Size X-Men #1',
  ];
  const replaced = [
    'Amazing Fantasy 15 comic book',
    'Fantastic Four 1 comic book',
    'Giant-Size X-Men 1 comic book',
  ];

  assert.equal(queries.length, 32, 'comic recovery request budget changed');
  assert.equal(new Set(queries.map(normalize)).size, queries.length, 'comic recovery contains a normalized duplicate');
  for (const alias of exact) assert.ok(queries.includes(alias), `missing exact comic recovery alias: ${alias}`);
  for (const query of replaced) assert.equal(queries.includes(query), false, `typed comic query returned: ${query}`);

  // Same-title Wikidata entities can represent different issue identities. Keep this query
  // in the typed fail-closed lane until source-native identity disambiguation is available.
  assert.equal(queries.includes('X-Men #1'), false, 'ambiguous exact X-Men alias must stay quarantined');
  assert.equal(queries.includes('X-Men 1 comic book'), true, 'typed X-Men fallback must stay in the bounded request budget');
});

test('comic exact rotation preserves the existing official-Wikidata fail-closed boundary', () => {
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
