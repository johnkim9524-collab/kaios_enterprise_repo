import assert from 'node:assert/strict';
import test from 'node:test';
import { runStagingD1ProjectorOnce } from '../src/staging-d1-projector-runtime.mjs';

const organizationId = '00000000-0000-4000-8000-000000000010';
const eventId = '00000000-0000-4000-8000-000000000020';

class PgClient {
  constructor() { this.calls = []; }
  async query(sql, params = []) {
    this.calls.push({ sql: String(sql), params });
    if (String(sql).includes('WITH candidate AS')) return { rows: [{
      outbox_event_id: eventId,
      organization_id: organizationId,
      event_type: 'control.health.changed',
      payload_hash: `sha256:${'a'.repeat(64)}`,
      source_schema_version: 'control-plane-v1',
      created_at: '2026-09-20T00:00:00.000Z',
      payload_json: { service_name: 'control-plane', state: 'HOLD' },
      attempt_no: 1,
      claim_token: '00000000-0000-4000-8000-000000000030',
      worker_id: 'staging-worker-1',
      claimed_until: '2026-09-20T00:02:00.000Z',
    }] };
    if (String(sql).includes('UPDATE kidults_control.outbox_delivery_claims')) {
      return { rowCount: 1, rows: [{ outbox_event_id: eventId }] };
    }
    return { rows: [] };
  }
}
test('STAGING runtime binds PostgreSQL outbox delivery to the single governed D1 writer', async () => {
  const requests = [];
  const result = await runStagingD1ProjectorOnce({
    client: new PgClient(),
    organizationId,
    workerId: 'staging-worker-1',
    cloudflare: {
      environment: 'STAGING',
      accountId: 'account-test',
      databaseId: 'database-test',
      apiToken: 'token-test',
      projectorId: 'kpmo-d1-projector-v1',
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, status: 200, json: async () => ({
        success: true, errors: [], result: [{ success: true, meta: { changes: 1 } }],
      }) };
    },
    now: () => new Date('2026-09-20T00:01:00.000Z'),
    id: () => '00000000-0000-4000-8000-000000000040',
  });
  assert.equal(result.state, 'PROJECTED');
  assert.equal(requests.length, 1);
  assert.match(requests[0].body.sql, /^INSERT INTO control_plane_health_projection/);
});

test('runtime rejects non-STAGING activation before PostgreSQL or D1 access', async () => {
  const client = new PgClient();
  await assert.rejects(() => runStagingD1ProjectorOnce({
    client,
    organizationId,
    workerId: 'worker',
    cloudflare: { environment: 'production' },
  }), /D1_PROJECTOR_STAGING_ENVIRONMENT_REQUIRED/);
  assert.equal(client.calls.length, 0);
});
