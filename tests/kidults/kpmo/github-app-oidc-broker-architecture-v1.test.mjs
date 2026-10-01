import assert from 'node:assert/strict';
import test from 'node:test';
import {validateArchitecture} from '../../../scripts/kidults/kpmo/validate-github-app-oidc-broker-architecture-v1.mjs';

test('long-term GitHub App/OIDC broker contract is fail-closed and tokenless at the workflow boundary', () => {
  const report = validateArchitecture();
  assert.equal(report.state, 'VERIFIED_PASS');
  assert.equal(report.local_auth, 'GH_LOGIN_WEB_ON_DEMAND_ONLY');
  assert.equal(report.actions_auth, 'GITHUB_APP_INSTALLATION_TOKEN_VIA_OIDC_BROKER');
  assert.deepEqual(report.broker_profiles, [
    'AUTONOMOUS_DISCOVERY_READ', 'AUTONOMOUS_LIVE_READBACK', 'AUTONOMOUS_EVENT_DISPATCH',
  ]);
  assert.equal(report.token_ttl_seconds, 900);
  assert.equal(report.pat_persistence, 'FORBIDDEN');
  assert.equal(report.token_exposure, 'FORBIDDEN');
  assert.deepEqual(report.findings, []);
});
