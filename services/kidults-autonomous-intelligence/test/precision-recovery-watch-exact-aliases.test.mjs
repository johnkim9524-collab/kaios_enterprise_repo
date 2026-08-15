import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePrecisionRecoveryRow } from '../scripts/lib/precision-recovery.mjs';

const ROOT = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-precision-recovery-queries.json'), 'utf8'));
const referencePolicy = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-reference-precision-policy.json'), 'utf8'));

const vertical = 'watches-jewelry';
const productTerms = referencePolicy.productObjectTermsByVertical[vertical];
const disallowedTerms = referencePolicy.disallowedDescriptionTermsByVertical[vertical];
const stopTokens = [
  ...referencePolicy.queryStopTokens,
  'toy', 'doll', 'watch', 'wristwatch', 'shoe', 'shoes', 'sneaker', 'boot', 'handbag', 'bag',
  'camera', 'computer', 'console', 'game', 'video', 'handheld', 'comic', 'book', 'card', 'trading', 'baseball',
];

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
  const queries = config.verticals[vertical];
  for (const query of [
    'Rolex Explorer II',
    'Rolex Submariner',
    'Omega Seamaster',
    'G-Shock',
    'Rolex Datejust',
    'TAG Heuer Monaco',
    'Rolex GMT Master II',
    'Rolex Milgauss',
    'Cartier Santos',
    'Breitling Superocean',
    'Grand Seiko Hi-Beat',
    'Cartier Tonneau',
    'Cartier Tortue',
  ]) {
    assert.ok(queries.includes(query));
  }
  for (const zeroYieldTypedQuery of [
    'Rolex Yacht-Master watch',
    'Rolex Air-King watch',
    'Omega Railmaster watch',
    'Omega De Ville watch',
  ]) {
    assert.equal(queries.includes(zeroYieldTypedQuery), false, `zero-yield watch query returned: ${zeroYieldTypedQuery}`);
  }
  assert.equal(queries.includes('Rolex Explorer II watch'), false);
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

test('watch recovery uses the same reference precision evaluator as production and rejects nearby variants', () => {
  const cases = [
    ['Rolex Explorer II', 'self-winding wristwatch manufactured by Rolex'],
    ['Rolex Submariner', "mechanical diver's watch"],
    ['Omega Seamaster', 'line of mechanical and quartz diving watches'],
    ['G-Shock', 'watch model series manufactured by Casio'],
    ['Rolex Datejust', 'wristwatch manufactured by Rolex'],
    ['TAG Heuer Monaco', 'automatic chronograph wristwatches'],
    ['Rolex GMT Master II', 'watch by Rolex'],
    ['Rolex Milgauss', 'antimagnetic wristwatch model by Rolex'],
    ['Cartier Santos', 'wristwatch created by Cartier'],
    ['Breitling Superocean', 'product model wristwatch'],
    ['Grand Seiko Hi-Beat', 'watch model series luxury wristwatch'],
    ['Cartier Tonneau', 'product model wristwatch'],
    ['Cartier Tortue', 'product model wristwatch'],
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
