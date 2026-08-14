import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-precision-recovery-queries.json'), 'utf8'));
const referencePolicy = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-reference-precision-policy.json'), 'utf8'));

function normalize(value) {
  return String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

test('canonical toy recovery aliases stay scoped to the existing Wikidata-only fail-closed lane', () => {
  assert.equal(config.schemaVersion, '1.0.1');
  assert.equal(config.mode, 'KIDULT100_WIKIDATA_PRECISION_RECOVERY');
  assert.equal(config.source, 'wikidata');
  assert.equal(config.sourceClass, 'REFERENCE_PUBLIC_DATA');
  assert.equal(config.rightsClass, 'CC0_STRUCTURED_DATA');
  assert.equal(config.safety.wikidataOnly, true);
  assert.equal(config.safety.officialApiOnly, true);
  assert.equal(config.safety.unauthorizedScrapingAllowed, false);
  assert.equal(config.safety.paidProviderProcurementAllowed, false);
  assert.equal(config.safety.syntheticEvidenceAllowed, false);
  assert.equal(config.safety.productionGateRelaxationAllowed, false);
});

test('canonical toy aliases are distinctive, non-generic, and duplicate-free', () => {
  const requiredAliases = [
    'Furby',
    'Tamagotchi',
    'Bratz',
    'Cabbage Patch Kids',
    'Funko Pop',
    'Polly Pocket',
    'Sylvanian Families',
    'Matchbox',
  ];
  const queries = config.verticals['toys-models'];
  assert.equal(new Set(queries.map(normalize)).size, queries.length);

  const generic = new Set((referencePolicy.genericQueries || []).map(normalize));
  for (const alias of requiredAliases) {
    assert.ok(queries.includes(alias), `missing canonical recovery alias: ${alias}`);
    assert.equal(generic.has(normalize(alias)), false, `canonical alias became generic: ${alias}`);
    assert.ok(normalize(alias).split(/\s+/).some((token) => token.length >= 4), `alias lacks a distinctive token: ${alias}`);
  }
});
