import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const config = JSON.parse(fs.readFileSync('config/kidult100-wikimedia-demand-source.json', 'utf8'));

test('Wikimedia Analytics demand source remains CC0, official API only, and non-market', () => {
  assert.equal(config.policy, 'RIGHTS_QUALIFIED_CC0_WIKIMEDIA_ANALYTICS_DEMAND_SUPPLEMENT');
  assert.equal(config.source.apiBase, 'https://wikimedia.org/api/rest_v1');
  assert.equal(config.source.license, 'CC0-1.0');
  assert.equal(config.source.rightsClass, 'CC0_WIKIMEDIA_ANALYTICS_DATA');
  assert.equal(config.source.requiresUserAgent, true);
  assert.equal(config.source.sequentialRequests, true);
  assert.equal(config.source.unauthorizedScrapingAllowed, false);
  assert.equal(config.source.paidProviderRequired, false);
  assert.match(config.source.documentationUrl, /^https:\/\/doc\.wikimedia\.org\//);
  assert.match(config.source.accessPolicyUrl, /^https:\/\/doc\.wikimedia\.org\//);
  assert.equal(config.evidence.primitive, 'DEMAND_ATTENTION');
  assert.equal(config.evidence.evidenceClass, 'DEMAND_CULTURAL_SIGNAL');
  assert.equal(config.evidence.signalType, 'CULTURAL_ATTENTION_PROXY');
  assert.equal(config.evidence.normalizedScoreAllowed, false);
  assert.equal(config.evidence.marketDemandClaimAllowed, false);
  assert.equal(config.evidence.transactionOrLiquidityClaimAllowed, false);
  assert.equal(config.evidence.syntheticOrEstimatedEvidenceAllowed, false);
});
