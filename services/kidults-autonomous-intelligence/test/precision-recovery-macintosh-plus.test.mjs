import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePrecisionRecoveryRow } from '../scripts/lib/precision-recovery.mjs';

const ROOT = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-precision-recovery-queries.json'), 'utf8'));

function evaluate(label) {
  return evaluatePrecisionRecoveryRow({
    query: 'Macintosh Plus',
    row: { label, description: 'home computer model by Apple' },
    productTerms: ['computer model', 'home computer', 'computer'],
    disallowedTerms: ['company', 'museum', 'subscription'],
    stopTokens: ['computer'],
  });
}

test('Macintosh Plus exact alias remains inside the existing Wikidata-only fail-closed recovery lane', () => {
  assert.ok(config.verticals['technology-cameras'].includes('Macintosh Plus'));
  assert.equal(config.safety.wikidataOnly, true);
  assert.equal(config.safety.officialApiOnly, true);
  assert.equal(config.safety.unauthorizedScrapingAllowed, false);
  assert.equal(config.safety.paidProviderProcurementAllowed, false);
  assert.equal(config.safety.syntheticEvidenceAllowed, false);
  assert.equal(config.safety.productionGateRelaxationAllowed, false);
});

test('Macintosh Plus recovery requires exact source title identity', () => {
  const exact = evaluate('Macintosh Plus');
  const variant = evaluate('Macintosh Plus 1');

  assert.equal(exact.exactTitleRequired, true);
  assert.equal(exact.exactTitleMatched, true);
  assert.equal(exact.accepted, true);

  assert.equal(variant.exactTitleRequired, true);
  assert.equal(variant.exactTitleMatched, false);
  assert.equal(variant.accepted, false);
});
