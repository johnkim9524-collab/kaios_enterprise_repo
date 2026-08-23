#!/usr/bin/env node
import assert from 'node:assert/strict';
import { evaluateRightsPolicy } from './evaluate-rights-policy-v1.mjs';

const baseGrant = {
  provider_id: 'TEST',
  field_pattern: 'sold_price',
  purpose: 'derive',
  decision: 'PASS',
  evidence_type: 'written_legal_or_commercial_determination',
  evidence_reference: 'fixture:test-1',
  effective_at: '2026-01-01T00:00:00Z',
  expires_at: '2027-01-01T00:00:00Z',
  entity_scope: ['KIDULTS'],
  territory_scope: ['*'],
  environment_scope: ['DEV', 'SHADOW']
};

const request = {
  provider_id: 'TEST',
  field: 'sold_price',
  purpose: 'derive',
  entity: 'KIDULTS',
  territory: 'KR',
  environment: 'DEV'
};

const now = '2026-08-24T00:00:00Z';

assert.equal(evaluateRightsPolicy({ grants: [baseGrant], request, now }).decision, 'PASS');
assert.equal(evaluateRightsPolicy({ grants: [], request, now }).decision, 'HOLD');
assert.equal(evaluateRightsPolicy({ grants: [{ ...baseGrant, expires_at: '2025-01-01T00:00:00Z' }], request, now }).decision, 'HOLD');
assert.equal(evaluateRightsPolicy({ grants: [{ ...baseGrant, environment_scope: ['PROD'] }], request, now }).decision, 'HOLD');
assert.equal(evaluateRightsPolicy({ grants: [{ ...baseGrant, territory_scope: ['US'] }], request, now }).decision, 'HOLD');
assert.equal(evaluateRightsPolicy({ grants: [{ ...baseGrant, entity_scope: ['OTHER'] }], request, now }).decision, 'HOLD');
assert.equal(evaluateRightsPolicy({ grants: [{ ...baseGrant, decision: 'DENY' }], request, now }).decision, 'DENY');
assert.equal(evaluateRightsPolicy({ grants: [baseGrant, { ...baseGrant, decision: 'DENY', evidence_reference: 'fixture:test-conflict' }], request, now }).decision, 'HOLD');
assert.equal(evaluateRightsPolicy({ grants: [{ ...baseGrant, field_pattern: '*' }], request, now }).decision, 'PASS');
assert.equal(evaluateRightsPolicy({ grants: [{ ...baseGrant, purpose: 'display' }], request, now }).decision, 'HOLD');
assert.equal(evaluateRightsPolicy({ grants: [{ ...baseGrant, evidence_reference: '' }], request, now }).decision, 'HOLD');
assert.equal(evaluateRightsPolicy({ grants: [baseGrant], request: { ...request, field: 'currency' }, now }).decision, 'HOLD');

console.log('Track F rights-policy v1: 12/12 deterministic fail-closed tests PASS');
