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
  assert.equal(config.schemaVersion, '1.0.11');
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
      'Rolex Cosmograph Daytona',
      'Omega Speedmaster',
      'Rolex Milgauss',
      'Cartier Santos',
      'G-Shock',
    ],
    'fashion-accessories': [
      'Air Jordan 1',
      'Air Jordan 4',
      'Nike Air Max 90',
      'Nike Air Max 97',
      'Chanel 2.55',
      'Adidas Samba',
      'Adidas Superstar',
      'Adidas Gazelle',
      'Air Force 1',
      'Nike Dunk',
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
      'Nintendo DS',
      'Nintendo 3DS',
      'Game Boy Color',
      'Game Boy Advance SP',
      'Dreamcast',
      'Atari 7800',
      'PlayStation 5',
      'Xbox 360',
      'Wii U',
      'Sega Saturn',
    ],
    'cards-comics-memorabilia': [
      'Action Comics #1',
      'Detective Comics #27',
      'Pikachu Illustrator',
      'Black Lotus',
      'T206 Honus Wagner',
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

test('fashion recovery prunes typed searches already covered by stricter canonical aliases', () => {
  const queries = config.verticals['fashion-accessories'];
  const canonical = [
    'Air Jordan 1',
    'Air Jordan 4',
    'Nike Air Max 90',
    'Nike Air Max 97',
    'Chanel 2.55',
    'Adidas Samba',
    'Adidas Superstar',
    'Adidas Gazelle',
    'Air Force 1',
  ];
  const redundant = [
    'Nike Air Jordan 1 shoe',
    'Nike Air Jordan 4 shoe',
    'Nike Air Max 90 shoe',
    'Nike Air Max 97 shoe',
    'Air Max 90',
    'Chanel 2.55 handbag',
    'Adidas Samba shoe',
    'Adidas Superstar shoe',
    'Adidas Gazelle shoe',
    'Nike Air Force 1 shoe',
  ];

  for (const alias of canonical) assert.ok(queries.includes(alias), `missing retained canonical alias: ${alias}`);
  for (const query of redundant) assert.equal(queries.includes(query), false, `redundant fashion recovery query returned: ${query}`);
  assert.equal(queries.includes('Nike Mag'), false, 'zero-yield Nike Mag query returned to the request budget');
  assert.equal(queries.includes('Nike Air Yeezy'), false, 'zero-yield Nike Air Yeezy query returned to the request budget');
  assert.ok(queries.includes('Nike Dunk'), 'exact Nike Dunk recovery alias is missing');
  assert.ok(queries.length >= 20, 'fashion recovery buffer fell below the fail-closed minimum');
});

test('exact-alias covered technology and gaming searches stay pruned to preserve the precision budget', () => {
  const technology = config.verticals['technology-cameras'];
  const gaming = config.verticals['gaming-music-screen'];

  for (const alias of ['Macintosh Plus', 'iMac G3', 'Power Mac G4 Cube']) {
    assert.ok(technology.includes(alias), `missing retained technology exact alias: ${alias}`);
  }
  for (const query of ['Apple Macintosh Plus computer', 'Apple iMac G3 computer', 'Apple Power Mac G4 Cube computer']) {
    assert.equal(technology.includes(query), false, `redundant technology recovery query returned: ${query}`);
  }

  assert.ok(gaming.includes('Dreamcast'), 'missing retained Dreamcast exact alias');
  assert.equal(gaming.includes('Sega Dreamcast video game console'), false, 'redundant Dreamcast typed query returned');
  assert.ok(gaming.includes('Wii U'), 'missing Wii U exact alias');
  assert.equal(gaming.includes('Nintendo Wii U video game console'), false, 'redundant Wii U typed query returned');
  assert.ok(gaming.includes('Sega Saturn'), 'missing Sega Saturn exact alias');
});
