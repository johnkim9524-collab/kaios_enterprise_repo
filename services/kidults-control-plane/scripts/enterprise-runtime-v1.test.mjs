import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeEnterpriseRequest } from '../src/enterprise-access.mjs';
import { ingestBillingWebhook } from '../src/billing-ledger.mjs';
import { appendObservabilityEvent } from '../src/observability-ledger.mjs';

const organizationId = '00000000-0000-4000-8000-000000000010';
const subscriptionId = '00000000-0000-4000-8000-000000000011';
const ids = [
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000103',
];

class AccessClient {
  constructor({ permissionGranted = true, entitlementState = 'ACTIVE', subscriptionState = 'ACTIVE', row = true } = {}) {
    this.calls = [];
    this.permissionGranted = permissionGranted;
    this.entitlementState = entitlementState;
    this.subscriptionState = subscriptionState;
    this.row = row;
  }
  async query(sql, params = []) {
    this.calls.push({ sql: String(sql).trim(), params });
    if (String(sql).includes('FROM kidults_control.users')) return { rows: this.row ? [{
      user_id: '00000000-0000-4000-8000-000000000020', user_state: 'ACTIVE',
      organization_state: 'ACTIVE', membership_id: '00000000-0000-4000-8000-000000000021',
      membership_state: 'ACTIVE', role_code: 'ANALYST', expires_at: null,
      permission_granted: this.permissionGranted,
      entitlement_state: this.entitlementState,
      entitlement_effective_from: '2026-08-25T00:00:00.000Z',
      entitlement_effective_until: '2026-09-25T00:00:00.000Z',
      subscription_state: this.subscriptionState,
    }] : [] };
    return { rows: [] };
  }
}

class AccessAuditClient {
  constructor({ fail = false } = {}) { this.calls = []; this.fail = fail; }
  async query(sql, params = []) {
    this.calls.push({ sql: String(sql).trim(), params });
    if (this.fail && String(sql).includes('INSERT INTO kidults_control.observability_events')) {
      throw new Error('AUDIT_STORE_UNAVAILABLE');
    }
    return { rows: [] };
  }
}

const accessInput = (client, verifier) => ({
  client, auditClient: new AccessAuditClient(), verifier, token: 'opaque-never-persisted', organizationId,
  permissionCode: 'workspace:read', resourceType: 'workspace', resourceId: 'executive',
  entitlementCode: 'workspace:read', audience: 'kidults-enterprise',
  allowedIssuers: ['https://identity.example.test'],
  requestId: 'request-access-001', traceId: 'trace-access-001',
  now: () => new Date('2026-08-26T00:05:00.000Z'),
});

const verifiedIdentity = {
  verify: async () => ({ verified: true, provider: 'enterprise-oidc', claims: {
    iss: 'https://identity.example.test', aud: 'kidults-enterprise', sub: 'subject:001',
    iat: Date.parse('2026-08-26T00:00:00.000Z') / 1000,
    exp: Date.parse('2026-08-26T01:00:00.000Z') / 1000,
    jti: 'token-instance-001', amr: ['mfa'],
  } }),
};

test('enterprise access trusts verified identity but derives tenant permission server-side', async () => {
  const client = new AccessClient();
  const input = accessInput(client, verifiedIdentity);
  const receipt = await authorizeEnterpriseRequest(input);
  assert.equal(receipt.state, 'AUTHORIZED');
  assert.equal(receipt.organizationId, organizationId);
  assert.equal(receipt.permissionCode, 'workspace:read');
  assert.equal(receipt.resourceType, 'workspace');
  assert.equal(receipt.resourceId, 'executive');
  assert.equal(receipt.entitlementCode, 'workspace:read');
  assert.deepEqual(receipt.authenticationMethods, ['mfa']);
  assert(client.calls.some(call => call.sql.includes("set_config('kidults.organization_id'")));
  assert(client.calls.some(call => call.sql === 'SET TRANSACTION READ ONLY'));
  assert(!client.calls.some(call => call.params.includes('opaque-never-persisted')));
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
  const auditInsert = input.auditClient.calls.find(call => call.sql.includes('INSERT INTO kidults_control.observability_events'));
  assert(auditInsert);
  assert(auditInsert.params.some(value => typeof value === 'string' && value.includes('"outcome":"ALLOW"')));
  assert(!auditInsert.params.includes('opaque-never-persisted'));
});

test('enterprise access rejects malformed numeric dates before database access', async () => {
  const client = new AccessClient();
  const verifier = { verify: async () => ({
    verified: true, provider: 'enterprise-oidc', claims: {
      iss: 'https://identity.example.test', aud: 'kidults-enterprise', sub: 'subject:001',
      iat: 'not-a-number', exp: 'also-not-a-number',
    },
  }) };
  await assert.rejects(() => authorizeEnterpriseRequest(accessInput(client, verifier)), /IDENTITY_EXPIRY_INVALID/);
  assert.equal(client.calls.length, 0);
});

test('enterprise access rejects unverified identity before any database read', async () => {
  const client = new AccessClient();
  const verifier = { verify: async () => ({ verified: false }) };
  await assert.rejects(() => authorizeEnterpriseRequest(accessInput(client, verifier)), /IDENTITY_SIGNATURE_NOT_VERIFIED/);
  assert.equal(client.calls.length, 0);
});

test('enterprise access rejects missing server-side grant and rolls back', async () => {
  const client = new AccessClient({ permissionGranted: false });
  const input = accessInput(client, verifiedIdentity);
  await assert.rejects(() => authorizeEnterpriseRequest(input), /ENTERPRISE_PERMISSION_DENIED/);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  const auditInsert = input.auditClient.calls.find(call => call.sql.includes('INSERT INTO kidults_control.observability_events'));
  assert(auditInsert.params.some(value => typeof value === 'string' && value.includes('"outcome":"DENY"')));
});

test('enterprise access rejects an inactive billing entitlement even when RBAC grants permission', async () => {
  const client = new AccessClient({ entitlementState: 'SUSPENDED' });
  await assert.rejects(() => authorizeEnterpriseRequest(accessInput(client, verifiedIdentity)), /ENTERPRISE_ENTITLEMENT_DENIED/);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
});

test('enterprise access fails closed when the allow decision cannot be audited', async () => {
  const client = new AccessClient();
  const input = accessInput(client, verifiedIdentity);
  input.auditClient = new AccessAuditClient({ fail: true });
  await assert.rejects(() => authorizeEnterpriseRequest(input), /ENTERPRISE_ACCESS_AUDIT_FAILED/);
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
});

class BillingClient {
  constructor({ stale = false } = {}) { this.calls = []; this.stale = stale; }
  async query(sql, params = []) {
    this.calls.push({ sql: String(sql).trim(), params });
    const text = String(sql);
    if (text.includes('SELECT organization_id FROM kidults_control.organizations')) return { rows: [{ organization_id: params[0] }] };
    if (text.includes('INSERT INTO kidults_control.commands')) return { rows: [{ command_id: ids[0] }] };
    if (text.includes('UPDATE kidults_control.subscriptions')) return { rows: this.stale ? [] : [{ subscription_id: subscriptionId, state_version: 2 }] };
    if (text.includes('SELECT sequence_no,event_hash')) return { rows: [] };
    return { rows: [] };
  }
}

const billingInput = (client, verifier) => {
  let offset = 0;
  return {
    client, verifier, providerCode: 'provider-test', rawBody: '{"event":"subscription.updated"}',
    headers: { 'x-provider-signature': 'redacted' }, requestId: 'request-001', traceId: 'trace-001',
    now: () => new Date('2026-08-26T00:10:00.000Z'), id: () => ids[offset++],
  };
};

const verifiedBilling = {
  verify: async () => ({ signatureVerified: true, event: {
    organizationId, providerEventId: 'evt-001', eventType: 'subscription.updated',
    providerCreatedAt: '2026-08-26T00:09:00.000Z', orderingKey: 'sub-001:2',
    subscriptionId, stateVersion: 2, subscriptionState: 'ACTIVE', entitlementState: 'ACTIVE',
    entitlementCode: 'workspace:read', effectiveFrom: '2026-08-26T00:09:00.000Z',
  } }),
};

test('billing webhook commits verified monotonic transition with audit and outbox', async () => {
  const client = new BillingClient();
  const receipt = await ingestBillingWebhook(billingInput(client, verifiedBilling));
  assert.equal(receipt.state, 'COMMITTED');
  assert(client.calls.some(call => call.sql.includes('INSERT INTO kidults_control.billing_events')));
  assert(client.calls.some(call => call.sql.includes('UPDATE kidults_control.subscriptions')));
  assert(client.calls.some(call => call.sql.includes('INSERT INTO kidults_control.entitlements')));
  assert(client.calls.some(call => call.sql.includes('INSERT INTO kidults_control.audit_events')));
  assert(client.calls.some(call => call.sql.includes('INSERT INTO kidults_control.outbox_events')));
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
});

test('billing webhook rejects bad signature before opening a transaction', async () => {
  const client = new BillingClient();
  const verifier = { verify: async () => ({ signatureVerified: false }) };
  await assert.rejects(() => ingestBillingWebhook(billingInput(client, verifier)), /BILLING_SIGNATURE_NOT_VERIFIED/);
  assert.equal(client.calls.length, 0);
});

test('billing webhook rejects stale or unknown subscription transitions atomically', async () => {
  const client = new BillingClient({ stale: true });
  await assert.rejects(() => ingestBillingWebhook(billingInput(client, verifiedBilling)), /BILLING_STALE_OR_UNKNOWN_SUBSCRIPTION_TRANSITION/);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  assert(!client.calls.some(call => call.sql.includes('INSERT INTO kidults_control.audit_events')));
});

class ObservationClient {
  constructor() { this.calls = []; }
  async query(sql, params = []) { this.calls.push({ sql: String(sql).trim(), params }); return { rows: [] }; }
}

test('observability ledger writes attributable tenant-scoped event', async () => {
  const client = new ObservationClient();
  const receipt = await appendObservabilityEvent({
    client, organizationId, signalType: 'SLO', serviceName: 'kidults-control-plane',
    eventName: 'command_latency', requestId: 'request-002', traceId: 'trace-002',
    payload: { p95_ms: 120, target_ms: 250 }, occurredAt: new Date('2026-08-26T00:12:00.000Z'),
    id: () => ids[0],
  });
  assert.equal(receipt.state, 'RECORDED');
  assert(client.calls.some(call => call.sql.includes('INSERT INTO kidults_control.observability_events')));
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
});

test('observability ledger rejects secret-like fields before database mutation', async () => {
  const client = new ObservationClient();
  await assert.rejects(() => appendObservabilityEvent({
    client, organizationId, signalType: 'LOG', serviceName: 'kidults-control-plane',
    eventName: 'unsafe', payload: { nested: { access_token: 'must-not-log' } },
  }), /OBSERVABILITY_SECRET_LIKE_FIELD_DENIED/);
  assert.equal(client.calls.length, 0);
});
