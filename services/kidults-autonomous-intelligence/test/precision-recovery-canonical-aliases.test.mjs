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

function hasDistinctiveShape(value) {
  const tokens = normalize(value).split(/\s+/).filter(Boolean);
  return tokens.length >= 2 || tokens.some((token) => token.length >= 4);
}

test('canonical recovery aliases stay scoped to the existing Wikidata-only fail-closed lane', () => {
  assert.equal(config.schemaVersion, '1.0.2');
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
    assert.ok(hasDistinctiveShape(alias), `alias lacks a distinctive exact-name shape: ${alias}`);
  }
});

test('cross-vertical exact aliases remain narrow, distinctive, and duplicate-free', () => {
  const expected = {
    'watches-jewelry': [
      'Cartier Tank',
      'Audemars Piguet Royal Oak',
      'Jaeger-LeCoultre Reverso',
      'Breitling Navitimer',
    ],
    'fashion-accessories': [
      'Air Jordan 1',
      'Air Jordan 4',
      'Air Max 90',
      'Chanel 2.55',
    ],
    'technology-cameras': [
      'Macintosh 128K',
      'iMac G3',
      'Power Mac G4 Cube',
      'Polaroid SX-70',
    ],
    'gaming-music-screen': [
      'Nintendo Switch',
      'Nintendo 64',
      'Nintendo GameCube',
      'Atari 2600',
    ],
    'cards-comics-memorabilia': [
      'Action Comics #1',
      'Detective Comics #27',
      'Pikachu Illustrator',
      'Black Lotus',
    ],
  };
  const generic = new Set((referencePolicy.genericQueries || []).map(normalize));

  for (const [vertical, aliases] of Object.entries(expected)) {
    const queries = config.verticals[vertical];
    assert.equal(new Set(queries.map(normalize)).size, queries.length, `${vertical} query set contains a normalized duplicate`);
    for (const alias of aliases) {
      assert.ok(queries.includes(alias), `missing ${vertical} canonical recovery alias: ${alias}`);
      assert.equal(generic.has(normalize(alias)), false, `${vertical} canonical alias became generic: ${alias}`);
      assert.ok(hasDistinctiveShape(alias), `${vertical} alias lacks a distinctive exact-name shape: ${alias}`);
    }
  }
});
