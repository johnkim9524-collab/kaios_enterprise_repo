import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-precision-recovery-queries.json'), 'utf8'));

const fashion = config.verticals['fashion-accessories'];

test('fashion precision recovery keeps latest measured zero-yield typed queries out of the request budget', () => {
  for (const query of ['New Balance 990 shoe', 'Dr Martens 1460 boot']) {
    assert.equal(fashion.includes(query), false, `measured zero-yield query returned to the precision request budget: ${query}`);
  }
});

test('zero-yield pruning does not broaden source, rights, evidence, or production authority', () => {
  assert.equal(config.schemaVersion, '1.0.14');
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
