import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateUnifiedPreflight } from '../scripts/lib/unified-preflight.mjs';

const passDomains = Object.fromEntries([
  'engineering','runtime','security','data','provenance','provider','product','rights','entitlement','cost','observability','recovery',
].map((name) => [name, { status: 'PASS', evidence: [`${name}-evidence`] }]));

test('READY when all critical domains pass and live/commercial certification exists', () => {
  const result = evaluateUnifiedPreflight({
    domains: passDomains,
    liveMutationRequested: true,
    liveOperationalCertified: true,
    commercialUseRequested: true,
    commercialRightsCertified: true,
  });
  assert.equal(result.outcome, 'READY');
  assert.equal(result.productionMutationAllowed, true);
  assert.equal(result.commercialUseAllowed, true);
});

test('FAIL_CLOSED on critical domain failure', () => {
  const result = evaluateUnifiedPreflight({
    domains: { ...passDomains, provenance: { status: 'FAIL', evidence: ['bad-provenance'] } },
  });
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.deepEqual(result.criticalFailures, ['provenance']);
});

test('FAIL_CLOSED when required evidence is missing', () => {
  const result = evaluateUnifiedPreflight({
    domains: { ...passDomains, security: { status: 'PASS', evidence: [] } },
  });
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.deepEqual(result.criticalFailures, ['security']);
});

test('HOLD on unknown critical dependency', () => {
  const result = evaluateUnifiedPreflight({
    domains: { ...passDomains, provider: { status: 'UNKNOWN', evidence: ['provider-check'] } },
  });
  assert.equal(result.outcome, 'HOLD');
});

test('CANARY_ONLY when real execution is requested without live certification', () => {
  const result = evaluateUnifiedPreflight({
    domains: passDomains,
    liveMutationRequested: true,
    liveOperationalCertified: false,
  });
  assert.equal(result.outcome, 'CANARY_ONLY');
  assert.equal(result.productionMutationAllowed, false);
});

test('HUMAN_APPROVAL_REQUIRED outranks warnings and canary', () => {
  const result = evaluateUnifiedPreflight({
    domains: { ...passDomains, rights: { status: 'WARN', evidence: ['rights-review'] } },
    liveMutationRequested: true,
    liveOperationalCertified: false,
    humanApprovalRequired: true,
  });
  assert.equal(result.outcome, 'HUMAN_APPROVAL_REQUIRED');
});
