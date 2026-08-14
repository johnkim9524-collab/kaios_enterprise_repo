import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const config = JSON.parse(fs.readFileSync(
  path.join(process.cwd(), 'config', 'kidult100-precision-recovery-queries.json'),
  'utf8',
));

test('precision recovery keeps exact aliases while pruning stop-token-equivalent typed queries', () => {
  assert.equal(config.schemaVersion, '1.0.11');
  assert.equal(config.safety.wikidataOnly, true);
  assert.equal(config.safety.officialApiOnly, true);
  assert.equal(config.safety.unauthorizedScrapingAllowed, false);
  assert.equal(config.safety.paidProviderProcurementAllowed, false);
  assert.equal(config.safety.syntheticEvidenceAllowed, false);
  assert.equal(config.safety.productionGateRelaxationAllowed, false);

  const cases = {
    'toys-models': {
      canonical: ['Cabbage Patch Kids'],
      redundant: ['Cabbage Patch Kids doll'],
    },
    'watches-jewelry': {
      canonical: [
        'Rolex Cosmograph Daytona',
        'Cartier Tank',
        'Audemars Piguet Royal Oak',
        'Jaeger-LeCoultre Reverso',
        'Breitling Navitimer',
        'Rolex Milgauss',
        'Cartier Santos',
        'TAG Heuer Monaco',
        'G-Shock',
      ],
      redundant: [
        'Rolex Cosmograph Daytona watch',
        'Cartier Tank watch',
        'Audemars Piguet Royal Oak watch',
        'Jaeger-LeCoultre Reverso watch',
        'Breitling Navitimer watch',
        'Rolex Milgauss watch',
        'Cartier Santos watch',
        'TAG Heuer Monaco watch',
        'Casio G-Shock watch',
      ],
    },
    'fashion-accessories': {
      canonical: ['Air Force 1'],
      redundant: ['Nike Air Force 1 shoe'],
    },
    'technology-cameras': {
      canonical: ['Polaroid SX-70'],
      redundant: ['Polaroid SX-70 camera'],
    },
    'gaming-music-screen': {
      canonical: ['Nintendo Switch', 'Nintendo 64', 'Nintendo GameCube', 'Atari 2600', 'Nintendo DS', 'Nintendo 3DS', 'Game Boy Color', 'Game Boy Advance SP', 'Atari 7800', 'PlayStation 5', 'Xbox 360', 'Wii U', 'Sega Saturn'],
      redundant: ['Nintendo Switch video game console', 'Nintendo 64 video game console', 'Nintendo GameCube video game console', 'Atari 2600 video game console', 'Nintendo DS handheld game console', 'Nintendo 3DS handheld game console', 'Game Boy Color handheld game console', 'Game Boy Advance SP handheld game console', 'Atari 7800 video game console', 'PlayStation 5 video game console', 'Xbox 360 video game console', 'Nintendo Wii U video game console', 'Sega Saturn video game console'],
    },
    'cards-comics-memorabilia': {
      canonical: ['Action Comics #1', 'Detective Comics #27', 'Pikachu Illustrator', 'Black Lotus', 'T206 Honus Wagner'],
      redundant: ['Action Comics 1 comic book', 'Detective Comics 27 comic book', 'Pikachu Illustrator trading card', 'Black Lotus trading card', 'T206 Honus Wagner baseball card'],
    },
  };

  for (const [vertical, { canonical, redundant }] of Object.entries(cases)) {
    const queries = config.verticals[vertical];
    for (const alias of canonical) assert.ok(queries.includes(alias), `missing retained exact alias in ${vertical}: ${alias}`);
    for (const query of redundant) assert.equal(queries.includes(query), false, `redundant typed query returned in ${vertical}: ${query}`);
    assert.ok(queries.length >= 20, `${vertical} recovery buffer fell below the fail-closed minimum`);
  }
});
