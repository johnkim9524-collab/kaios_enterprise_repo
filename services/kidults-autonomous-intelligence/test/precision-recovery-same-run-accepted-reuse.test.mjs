import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluatePrecisionRecoveryRow,
  getReusableExistingWikidataRows,
} from '../scripts/lib/precision-recovery.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const recoverySource = fs.readFileSync(path.join(__dirname, '../scripts/kidult100-precision-recovery-live.mjs'), 'utf8');

function acceptedCandidate(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q4637',
    vertical: 'fashion-accessories',
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: 'Q4637',
    canonicalTitle: 'Adidas Superstar',
    description: 'athletic shoe model',
    sourceUrl: 'https://www.wikidata.org/wiki/Q4637',
    observedAt: '2026-08-14T05:00:00Z',
    rightsClass: 'CC0_STRUCTURED_DATA',
    payloadHash: 'same-run-payload',
    semanticRelevant: true,
    ...overrides,
  };
}

test('accepted same-run source-native candidate can satisfy a later exact alias only through the same evaluator', () => {
  const [row] = getReusableExistingWikidataRows([acceptedCandidate()], 'fashion-accessories');
  row.traceSource = 'PRECISION_RECOVERY_SAME_RUN_ACCEPTED_CANDIDATE';

  const evaluation = evaluatePrecisionRecoveryRow({
    query: 'Adidas Superstar',
    row,
    productTerms: ['athletic shoe', 'shoe'],
    disallowedTerms: ['company', 'person', 'file'],
    stopTokens: ['shoe', 'shoes'],
  });

  assert.equal(evaluation.accepted, true);
  assert.equal(evaluation.exactTitleRequired, true);
  assert.equal(evaluation.exactTitleMatched, true);
  assert.equal(row.traceSource, 'PRECISION_RECOVERY_SAME_RUN_ACCEPTED_CANDIDATE');
  assert.equal(row.id, 'Q4637');
  assert.equal(row.payloadHash, 'same-run-payload');
});

test('same-run cache cannot make a mismatched exact alias eligible', () => {
  const [row] = getReusableExistingWikidataRows([acceptedCandidate({ canonicalTitle: 'Adidas Stan Smith' })], 'fashion-accessories');
  row.traceSource = 'PRECISION_RECOVERY_SAME_RUN_ACCEPTED_CANDIDATE';
  const evaluation = evaluatePrecisionRecoveryRow({
    query: 'Adidas Superstar',
    row,
    productTerms: ['athletic shoe', 'shoe'],
    disallowedTerms: ['company', 'person', 'file'],
    stopTokens: ['shoe', 'shoes'],
  });

  assert.equal(evaluation.accepted, false);
  assert.equal(evaluation.exactTitleRequired, true);
  assert.equal(evaluation.exactTitleMatched, false);
});

test('live precision recovery keeps same-run reuse observational and evidence-neutral', () => {
  assert.match(recoverySource, /sameRunAcceptedCandidateRowsCached/);
  assert.match(recoverySource, /sameRunAcceptedCandidateResolvedQueries/);
  assert.match(recoverySource, /PRECISION_RECOVERY_SAME_RUN_ACCEPTED_CANDIDATE/);
  assert.match(recoverySource, /sameRunAcceptedCandidateReuseOnlyWhenSameRecoveryEvaluatorPasses: true/);
  assert.match(recoverySource, /sameRunAcceptedCandidateReuseCreatesEvidence: false/);
  assert.match(recoverySource, /rightsOrProvenanceRelaxed: false/);
  assert.match(recoverySource, /productionGateRelaxed: false/);
});
