import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  projectProviderRightsPreflight, verifyProviderRightsPreflight,
} from '../src/common-control/provider-rights-preflight-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const gate = JSON.parse(fs.readFileSync(path.join(root,
  'coordination/kidults/market/provider-rights-decision-gate-v1.json'), 'utf8'));
const observedAt = '2026-09-19T10:00:00.000Z';

test('existing Track A/Z decisions project fail-closed without execution authority', () => {
  const expected = new Map([
    ['CLASSIC.COM', ['HOLD', 'RIGHTS_CLARIFICATION_REQUIRED']],
    ['ALT/FNDATA', ['DENY', 'RIGHTS_NO_GO']],
    ['DISCOGS', ['HOLD', 'RIGHTS_CLARIFICATION_REQUIRED']],
    ['CARDMARKET', ['HOLD', 'RIGHTS_CLARIFICATION_REQUIRED']],
    ['EBAY_MARKETPLACE_INSIGHTS', ['HOLD', 'RIGHTS_CLARIFICATION_REQUIRED']],
  ]);
  for (const [providerId, [verdict, reason]] of expected) {
    const result = projectProviderRightsPreflight({ rightsGate: gate, providerId, observedAt });
    assert.equal(result.verdict, verdict);
    assert.equal(result.reason, reason);
    assert.equal(result.activation, 'DISABLED');
    assert.equal(result.externalEgress, false);
    verifyProviderRightsPreflight(result);
  }
});

test('a rights PASS remains preflight-only and cannot activate provider work', () => {
  const fixture = structuredClone(gate);
  fixture.current_provider_state['CLASSIC.COM'].decision = 'PASS';
  const result = projectProviderRightsPreflight({ rightsGate: fixture,
    providerId: 'CLASSIC.COM', observedAt });
  assert.equal(result.verdict, 'PREFLIGHT_ELIGIBLE_NO_FETCH');
  assert.equal(result.reason, 'RIGHTS_PASS_EXECUTION_NOT_AUTHORIZED');
  assert.equal(result.providerContact, false);
  assert.equal(result.activation, 'DISABLED');
});

test('unknown providers, enabled activation and tampering fail closed', () => {
  assert.throws(() => projectProviderRightsPreflight({ rightsGate: gate,
    providerId: 'UNKNOWN', observedAt }), /PROVIDER_RIGHTS_PROVIDER_NOT_REGISTERED/);
  const enabled = structuredClone(gate);
  enabled.current_provider_state['CLASSIC.COM'].activation = 'ENABLED';
  assert.throws(() => projectProviderRightsPreflight({ rightsGate: enabled,
    providerId: 'CLASSIC.COM', observedAt }), /PROVIDER_RIGHTS_ACTIVATION_NOT_DISABLED/);
  const staleVersion = structuredClone(gate);
  staleVersion.version = '1.2.0';
  assert.throws(() => projectProviderRightsPreflight({ rightsGate: staleVersion,
    providerId: 'CLASSIC.COM', observedAt }), /PROVIDER_RIGHTS_GATE_CONTRACT_INVALID/);
  const result = projectProviderRightsPreflight({ rightsGate: gate,
    providerId: 'ALT\/FNDATA', observedAt });
  assert.throws(() => verifyProviderRightsPreflight({ ...result, verdict: 'HOLD' }),
    /PROVIDER_RIGHTS_PREFLIGHT_PROJECTION_INVALID/);
});
