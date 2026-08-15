import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePrecisionRecoveryRow } from '../scripts/lib/precision-recovery.mjs';

const ROOT = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-precision-recovery-queries.json'), 'utf8'));
const referencePolicy = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-reference-precision-policy.json'), 'utf8'));
const productTerms = referencePolicy.productObjectTermsByVertical['fashion-accessories'];
const disallowedTerms = referencePolicy.disallowedDescriptionTermsByVertical['fashion-accessories'];
const stopTokens = ['watch', 'wristwatch', 'shoe', 'shoes', 'camera', 'computer', 'console', 'game', 'video', 'comic', 'book', 'card', 'trading'];

function evaluate(query, label, description) {
  return evaluatePrecisionRecoveryRow({
    query,
    row: { label, description },
    productTerms,
    disallowedTerms,
    stopTokens,
  });
}

test('new fashion footwear aliases stay inside the existing official Wikidata CC0 lane', () => {
  const queries = config.verticals['fashion-accessories'];
  for (const alias of ['Nike Air Flight', 'Nike Air Ship', 'Nike Mercurial Vapor']) {
    assert.ok(queries.includes(alias), `missing exact fashion recovery alias: ${alias}`);
  }

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

test('new fashion footwear aliases require exact entity identity and product context', () => {
  const cases = [
    ['Nike Air Flight', 'line of shoes released by Nike'],
    ['Nike Air Ship', 'basketball shoe produced by Nike'],
    ['Nike Mercurial Vapor', 'association football boots produced by Nike'],
  ];

  for (const [query, description] of cases) {
    const exact = evaluate(query, query, description);
    const nearby = evaluate(query, `${query} 2`, description);
    const company = evaluate(query, query, 'footwear company');

    assert.equal(exact.exactTitleRequired, true);
    assert.equal(exact.exactTitleMatched, true);
    assert.equal(exact.accepted, true);

    assert.equal(nearby.exactTitleRequired, true);
    assert.equal(nearby.exactTitleMatched, false);
    assert.equal(nearby.accepted, false);

    assert.equal(company.exactTitleRequired, true);
    assert.equal(company.exactTitleMatched, true);
    assert.equal(company.accepted, false);
  }
});
