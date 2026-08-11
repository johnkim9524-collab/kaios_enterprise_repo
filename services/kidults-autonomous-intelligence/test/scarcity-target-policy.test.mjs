import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const policy = JSON.parse(fs.readFileSync('config/kidult100-scarcity-target-policy.json', 'utf8'));

test('scarcity target queue requires explicit rights-qualified TOTAL_PRODUCED and never scoring proxies', () => {
  assert.equal(policy.policy, 'FAIL_CLOSED_SCARCITY_TOTAL_PRODUCED_TARGET_QUEUE');
  assert.equal(policy.primitive, 'SCARCITY');
  assert.equal(policy.requiredSignalType, 'TOTAL_PRODUCED');
  assert.equal(policy.selection.preserveVerticalGapAllocation, true);
  assert.equal(policy.selection.selectOnlyCandidatesWithoutEligibleScarcity, true);
  assert.equal(policy.evidenceRequirements.explicitQuantityRequired, true);
  assert.equal(policy.evidenceRequirements.rightsClassRequired, true);
  assert.equal(policy.evidenceRequirements.httpsSourceUrlRequired, true);
  assert.equal(policy.evidenceRequirements.observedAtRequired, true);
  assert.equal(policy.evidenceRequirements.payloadHashRequired, true);
  assert.equal(policy.evidenceRequirements.syntheticAllowed, false);
  assert.equal(policy.evidenceRequirements.estimatedAllowed, false);
  assert.equal(policy.evidenceRequirements.inferredScarcityAllowed, false);
  assert.equal(policy.evidenceRequirements.listingOrMarketingLanguageAcceptedAsQuantity, false);
  assert.equal(policy.evidenceRequirements.unauthorizedScrapingAllowed, false);
  assert.equal(policy.evidenceRequirements.paidProviderProcurementAllowed, false);
  assert.equal(policy.evidenceRequirements.automaticProductionScoringActivationAllowed, false);
});
