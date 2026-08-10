import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-market-source-qualification.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-market-adapter-registry.json'), 'utf8'));

const candidates = manifest.candidates || [];

test('source qualification manifest never auto-qualifies reviewed candidates', () => {
  assert.ok(candidates.length >= 5);
  assert.equal(candidates.some((candidate) => candidate.qualification === 'QUALIFIED_FOR_PROVIDER_ONBOARDING'), false);
  assert.equal(manifest.qualificationRequirements.automaticProviderActivationAllowed, false);
  assert.equal(manifest.qualificationRequirements.syntheticOrEstimatedEvidenceAllowed, false);
  assert.equal(manifest.qualificationRequirements.listingOrEstimateAcceptedAsTransaction, false);
});

test('every reviewed source has official HTTPS evidence and an explicit blocking disposition', () => {
  const ids = new Set();
  for (const candidate of candidates) {
    assert.ok(candidate.sourceId);
    assert.equal(ids.has(candidate.sourceId), false);
    ids.add(candidate.sourceId);
    assert.ok(candidate.qualification.startsWith('NOT_'));
    assert.ok(Array.isArray(candidate.blockingReasons));
    assert.ok(candidate.blockingReasons.length > 0);
    assert.ok(Array.isArray(candidate.evidenceLinks));
    assert.ok(candidate.evidenceLinks.length > 0);
    assert.equal(candidate.evidenceLinks.every((link) => link.startsWith('https://')), true);
  }
});

test('open-rights sources are not confused with completed market evidence', () => {
  const openRights = candidates.filter((candidate) => candidate.rightsStatus.startsWith('EXPLICIT_CC0'));
  assert.ok(openRights.length >= 3);
  for (const candidate of openRights) {
    assert.notEqual(candidate.marketSemantics.completedTransactions, 'COMPLETED_TRANSACTION_FEED_CONFIRMED');
    assert.notEqual(candidate.marketSemantics.transactionBackedLiquidity, 'TRANSACTION_BACKED_LIQUIDITY_CONFIRMED');
    assert.equal(candidate.qualification, 'NOT_QUALIFIED_MARKET_SEMANTICS');
  }
});

test('authorization-gated marketplace sources remain outside the production registry', () => {
  const gated = candidates.filter((candidate) => candidate.qualification === 'NOT_QUALIFIED_AUTHORIZATION_REQUIRED');
  assert.ok(gated.length >= 1);
  assert.equal((registry.providers || []).length, 0);
  for (const candidate of gated) {
    assert.ok(candidate.blockingReasons.some((reason) => reason.includes('AUTHORIZATION') || reason.includes('APPROVED')));
  }
});
