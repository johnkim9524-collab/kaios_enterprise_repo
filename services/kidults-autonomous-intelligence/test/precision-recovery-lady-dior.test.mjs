import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePrecisionRecoveryRow } from '../scripts/lib/precision-recovery.mjs';

const ROOT = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-precision-recovery-queries.json'), 'utf8'));

const stopTokens = ['watch', 'wristwatch', 'shoe', 'shoes', 'camera', 'computer', 'console', 'game', 'video', 'comic', 'book', 'card', 'trading'];

function evaluate(query, label, description) {
  return evaluatePrecisionRecoveryRow({
    query,
    row: { label, description },
    productTerms: ['handbag', 'bag'],
    disallowedTerms: ['company', 'museum', 'subscription'],
    stopTokens,
  });
}

test('Lady Dior recovery uses the exact canonical alias without expanding the request budget', () => {
  const queries = config.verticals['fashion-accessories'];
  assert.ok(queries.includes('Lady Dior'));
  assert.equal(queries.includes('Lady Dior handbag'), false);
  assert.equal(new Set(queries).size, queries.length);

  assert.equal(config.source, 'wikidata');
  assert.equal(config.rightsClass, 'CC0_STRUCTURED_DATA');
  assert.equal(config.safety.wikidataOnly, true);
  assert.equal(config.safety.officialApiOnly, true);
  assert.equal(config.safety.unauthorizedScrapingAllowed, false);
  assert.equal(config.safety.paidProviderProcurementAllowed, false);
  assert.equal(config.safety.syntheticEvidenceAllowed, false);
  assert.equal(config.safety.productionGateRelaxationAllowed, false);
});

test('Lady Dior exact identity is accepted while nearby labels remain fail-closed', () => {
  const exact = evaluate('Lady Dior', 'Lady Dior', "Women's handbag by Christian Dior");
  const nearby = evaluate('Lady Dior', 'Lady Dior Mini', "Women's handbag by Christian Dior");
  const company = evaluate('Lady Dior', 'Lady Dior', 'fashion company');

  assert.equal(exact.exactTitleRequired, true);
  assert.equal(exact.exactTitleMatched, true);
  assert.equal(exact.accepted, true);

  assert.equal(nearby.exactTitleRequired, true);
  assert.equal(nearby.exactTitleMatched, false);
  assert.equal(nearby.accepted, false);

  assert.equal(company.accepted, false);
});
