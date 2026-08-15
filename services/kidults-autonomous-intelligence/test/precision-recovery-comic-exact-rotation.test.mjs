import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePrecisionRecoveryRow } from '../scripts/lib/precision-recovery.mjs';

const ROOT = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-precision-recovery-queries.json'), 'utf8'));
const referencePolicy = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-reference-precision-policy.json'), 'utf8'));

function normalize(value) {
  return String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const runtimeStopTokens = [
  ...(referencePolicy.queryStopTokens || []).map(normalize),
  'toy', 'doll', 'watch', 'wristwatch', 'shoe', 'shoes', 'sneaker', 'boot', 'handbag', 'bag',
  'camera', 'computer', 'console', 'game', 'video', 'handheld', 'comic', 'book', 'card', 'trading', 'baseball',
];

test('comic recovery rotates only unambiguous verified issue labels without expanding the request budget', () => {
  const queries = config.verticals['cards-comics-memorabilia'];
  const exact = [
    'Amazing Fantasy #15',
    'Fantastic Four #1',
    'Giant-Size X-Men #1',
    'Captain America Comics #1',
  ];
  const replaced = [
    'Amazing Fantasy 15 comic book',
    'Fantastic Four 1 comic book',
    'Giant-Size X-Men 1 comic book',
    'Captain America Comics 1 comic book',
  ];

  assert.equal(queries.length, 32, 'comic recovery request budget changed');
  assert.equal(new Set(queries.map(normalize)).size, queries.length, 'comic recovery contains a normalized duplicate');
  for (const alias of exact) assert.ok(queries.includes(alias), `missing exact comic recovery alias: ${alias}`);
  for (const query of replaced) assert.equal(queries.includes(query), false, `typed comic query returned: ${query}`);

  // Same-title Wikidata entities can represent different issue identities. Keep the bare exact
  // alias quarantined and require a source-native publication-year anchor in the bounded query.
  assert.equal(queries.includes('X-Men #1'), false, 'ambiguous exact X-Men alias must stay quarantined');
  assert.equal(queries.includes('X-Men 1 comic book'), false, 'undiscriminated typed X-Men fallback must stay quarantined');
  assert.equal(queries.includes('X-Men #1 1963 comic book'), true, 'year-bound X-Men recovery query is missing');
});

test('X-Men recovery requires the 1963 source-native issue discriminator', () => {
  const productTerms = referencePolicy.productObjectTermsByVertical['cards-comics-memorabilia'];
  const disallowedTerms = referencePolicy.disallowedDescriptionTermsByVertical['cards-comics-memorabilia'];
  const query = 'X-Men #1 1963 comic book';

  const originalIssue = evaluatePrecisionRecoveryRow({
    query,
    row: { label: 'X-Men #1', description: '1963 comic book issue' },
    productTerms,
    disallowedTerms,
    stopTokens: runtimeStopTokens,
  });
  const laterSameTitleIssue = evaluatePrecisionRecoveryRow({
    query,
    row: { label: 'X-Men #1', description: '1991 comic book issue' },
    productTerms,
    disallowedTerms,
    stopTokens: runtimeStopTokens,
  });

  assert.equal(originalIssue.allDistinctiveAnchorsMatched, true);
  assert.equal(originalIssue.accepted, true);
  assert.equal(laterSameTitleIssue.allDistinctiveAnchorsMatched, false);
  assert.equal(laterSameTitleIssue.accepted, false);
});

test('Captain America Comics #1 exact recovery rejects nearby issue identities', () => {
  const productTerms = referencePolicy.productObjectTermsByVertical['cards-comics-memorabilia'];
  const disallowedTerms = referencePolicy.disallowedDescriptionTermsByVertical['cards-comics-memorabilia'];
  const query = 'Captain America Comics #1';

  const issueOne = evaluatePrecisionRecoveryRow({
    query,
    row: { label: 'Captain America Comics #1', description: '1940 comic book issue' },
    productTerms,
    disallowedTerms,
    stopTokens: runtimeStopTokens,
  });
  const issueTen = evaluatePrecisionRecoveryRow({
    query,
    row: { label: 'Captain America Comics #10', description: '1942 comic book issue' },
    productTerms,
    disallowedTerms,
    stopTokens: runtimeStopTokens,
  });

  assert.equal(issueOne.exactTitleRequired, true);
  assert.equal(issueOne.exactTitleMatched, true);
  assert.equal(issueOne.accepted, true);
  // Single-digit issue numbers are intentionally not distinctive anchors because one-character
  // tokens are excluded. Exact-title matching is therefore the fail-closed identity boundary.
  assert.equal(issueTen.allDistinctiveAnchorsMatched, true);
  assert.equal(issueTen.exactTitleRequired, true);
  assert.equal(issueTen.exactTitleMatched, false);
  assert.equal(issueTen.accepted, false);
});

test('comic exact rotation preserves the existing official-Wikidata fail-closed boundary', () => {
  assert.equal(config.source, 'wikidata');
  assert.equal(config.sourceClass, 'REFERENCE_PUBLIC_DATA');
  assert.equal(config.rightsClass, 'CC0_STRUCTURED_DATA');
  assert.equal(config.safety.wikidataOnly, true);
  assert.equal(config.safety.officialApiOnly, true);
  assert.equal(config.safety.genericCategoryQueriesAllowed, false);
  assert.equal(config.safety.unauthorizedScrapingAllowed, false);
  assert.equal(config.safety.paidProviderProcurementAllowed, false);
  assert.equal(config.safety.syntheticEvidenceAllowed, false);
  assert.equal(config.safety.productionGateRelaxationAllowed, false);
});
