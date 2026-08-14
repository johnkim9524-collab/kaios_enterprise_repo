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
    productTerms: ['athletic shoe', 'shoe', 'shoes', 'sneaker', 'sneakers'],
    disallowedTerms: ['company', 'museum', 'subscription', 'album', 'film'],
    stopTokens,
  });
}

test('zero-yield Air Yeezy stays pruned while Nike Dunk remains inside the exact official Wikidata CC0 lane', () => {
  const queries = config.verticals['fashion-accessories'];
  assert.equal(config.schemaVersion, '1.0.10');
  assert.equal(queries.includes('Nike Air Yeezy'), false);
  assert.equal(queries.includes('Nike Mag'), false);
  assert.ok(queries.includes('Nike Dunk'));
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

test('Nike Dunk exact identity is accepted while nearby or non-product labels remain fail-closed', () => {
  const exact = evaluate('Nike Dunk', 'Nike Dunk', 'line of shoes by Nike');
  const nearby = evaluate('Nike Dunk', 'Nike Dunk Low', 'line of shoes by Nike');
  const company = evaluate('Nike Dunk', 'Nike Dunk', 'footwear company');
  const media = evaluate('Nike Dunk', 'Nike Dunk', 'album');

  assert.equal(exact.exactTitleRequired, true);
  assert.equal(exact.exactTitleMatched, true);
  assert.equal(exact.accepted, true);

  assert.equal(nearby.exactTitleRequired, true);
  assert.equal(nearby.exactTitleMatched, false);
  assert.equal(nearby.accepted, false);

  assert.equal(company.accepted, false);
  assert.equal(media.accepted, false);
});
