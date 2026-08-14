import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePrecisionRecoveryRow } from '../scripts/lib/precision-recovery.mjs';

const ROOT = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-precision-recovery-queries.json'), 'utf8'));

const productTerms = ['watch', 'wristwatch', 'diving watch', 'mechanical watch', 'model series'];
const disallowedTerms = ['company', 'museum', 'subscription', 'album', 'film'];
const stopTokens = ['watch', 'wristwatch'];

function evaluate(query, label, description) {
  return evaluatePrecisionRecoveryRow({
    query,
    row: { label, description },
    productTerms,
    disallowedTerms,
    stopTokens,
  });
}

test('exact watch aliases remain inside the official Wikidata CC0 fail-closed recovery lane', () => {
  const queries = config.verticals['watches-jewelry'];
  for (const query of ['Rolex Submariner', 'Omega Seamaster', 'G-Shock']) {
    assert.ok(queries.includes(query));
  }
  assert.equal(new Set(queries).size, queries.length);
  assert.equal(config.source, 'wikidata');
  assert.equal(config.rightsClass, 'CC0_STRUCTURED_DATA');
  assert.equal(config.safety.wikidataOnly, true);
  assert.equal(config.safety.officialApiOnly, true);
  assert.equal(config.safety.genericCategoryQueriesAllowed, false);
  assert.equal(config.safety.unauthorizedScrapingAllowed, false);
  assert.equal(config.safety.paidProviderProcurementAllowed, false);
  assert.equal(config.safety.syntheticEvidenceAllowed, false);
  assert.equal(config.safety.productionGateRelaxationAllowed, false);
});

test('watch recovery accepts exact canonical identities and rejects nearby variants', () => {
  const cases = [
    ['Rolex Submariner', "mechanical diver's watch"],
    ['Omega Seamaster', 'line of mechanical and quartz diving watches'],
    ['G-Shock', 'watch model series manufactured by Casio'],
  ];

  for (const [query, description] of cases) {
    const exact = evaluate(query, query, description);
    const nearby = evaluate(query, `${query} II`, description);
    const company = evaluate(query, query, 'watch company');

    assert.equal(exact.exactTitleRequired, true);
    assert.equal(exact.exactTitleMatched, true);
    assert.equal(exact.accepted, true);

    assert.equal(nearby.exactTitleRequired, true);
    assert.equal(nearby.exactTitleMatched, false);
    assert.equal(nearby.accepted, false);
    assert.equal(company.accepted, false);
  }
});
