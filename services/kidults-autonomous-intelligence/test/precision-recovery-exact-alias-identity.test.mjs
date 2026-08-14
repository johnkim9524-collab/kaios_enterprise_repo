import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePrecisionRecoveryRow } from '../scripts/lib/precision-recovery.mjs';

const stopTokens = ['watch', 'wristwatch', 'shoe', 'shoes', 'camera', 'computer', 'console', 'game', 'video', 'comic', 'book', 'card', 'trading'];

function evaluate(query, label, description, productTerms) {
  return evaluatePrecisionRecoveryRow({
    query,
    row: { label, description },
    productTerms,
    disallowedTerms: ['company', 'museum', 'subscription'],
    stopTokens,
  });
}

test('untyped canonical aliases require exact normalized source title identity', () => {
  const exact = evaluate('Nintendo Switch', 'Nintendo Switch', 'hybrid video game console', ['video game console', 'video game']);
  assert.equal(exact.exactTitleRequired, true);
  assert.equal(exact.exactTitleMatched, true);
  assert.equal(exact.accepted, true);

  for (const [label, description] of [
    ['Nintendo Switch Sports', '2022 sports simulation video game'],
    ['Nintendo Switch OLED', 'hybrid video game console developed by Nintendo'],
  ]) {
    const related = evaluate('Nintendo Switch', label, description, ['video game console', 'video game']);
    assert.equal(related.allDistinctiveAnchorsMatched, true);
    assert.equal(related.exactTitleRequired, true);
    assert.equal(related.exactTitleMatched, false);
    assert.equal(related.accepted, false);
  }
});

test('numeric comic aliases do not admit nearby issue numbers after normalization', () => {
  const exact = evaluate('Action Comics #1', 'Action Comics #1', 'comic book issue', ['comic book', 'comic']);
  const nearby = evaluate('Action Comics #1', 'Action Comics #1000', 'comic book issue', ['comic book', 'comic']);
  assert.equal(exact.exactTitleRequired, true);
  assert.equal(exact.exactTitleMatched, true);
  assert.equal(exact.accepted, true);
  assert.equal(nearby.allDistinctiveAnchorsMatched, true);
  assert.equal(nearby.exactTitleMatched, false);
  assert.equal(nearby.accepted, false);
});

test('typed curated queries retain bounded product-context recovery behavior', () => {
  const result = evaluate('Cartier Tank watch', 'Cartier Tank', 'iconic wristwatch line', ['wristwatch', 'watch']);
  assert.equal(result.exactTitleRequired, false);
  assert.equal(result.accepted, true);
});
