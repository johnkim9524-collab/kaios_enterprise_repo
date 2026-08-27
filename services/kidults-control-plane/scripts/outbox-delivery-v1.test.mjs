import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverNextOutboxEvent } from '../src/outbox-delivery.mjs';

const organizationId = '00000000-0000-4000-8000-000000000010';
const eventId = '00000000-0000-4000-8000-000000000020';
const ids = [
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000103',
];

class PgClient {
  constructor({ idle = false } = {}) { this.calls = []; this.idle = idle; }
  async query(sql, params = []) {
    this.calls.push({ sql: String(sql).trim(), params });
    if (String(sql).includes('WITH candidate AS')) return { rows: this.idle ? [] : [{
      outbox_event_id: eventId, organization_id: organizationId,
      event_type: 'control.health.changed', payload_hash: `sha256:${'a'.repeat(64)}`,
      source_schema_version: 'control-plane-v1', created_at: '2026-08-26T00:00:00.000Z',
      payload_json: { service_name: 'control-plane', state: 'HOLD' }, attempt_no: 1,
    }] };
    return { rows: [] };
  }
}

class D1Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; }
  bind(...values) { this.values = values; return this; }
  async run() {
    if (this.db.fail) throw new Error('D1_FORCED_FAILURE');
    this.db.calls.push({ sql: this.sql, values: this.values });
    return { success: true };
  }
}
class D1 { constructor({ fail = false } = {}) { this.calls = []; this.fail = fail; } prepare(sql) { return new D1Statement(this, sql); } }

function input(client, db) {
  let index = 0;
  return {
    client, db, organizationId, workerId: 'worker-test-1', leaseSeconds: 60,
    now: () => new Date('2026-08-26T00:01:00.000Z'), id: () => ids[index++],
  };
}

test('outbox delivery claims one event, projects it and records an append-only success receipt', async () => {
  const client = new PgClient();
  const db = new D1();
  const receipt = await deliverNextOutboxEvent(input(client, db));
  assert.equal(receipt.state, 'PROJECTED');
  assert.equal(receipt.sourceEventId, eventId);
  assert(client.calls.some(call => call.sql.includes('INSERT INTO kidults_control.outbox_delivery_claims')));
  const final = client.calls.find(call => call.sql.includes('INSERT INTO kidults_control.outbox_delivery_receipts'));
  assert(final);
  assert(final.params.includes('PROJECTED'));
  assert.equal(db.calls.length, 1);
});

test('outbox delivery records a failed attempt and releases the lease', async () => {
  const client = new PgClient();
  await assert.rejects(() => deliverNextOutboxEvent(input(client, new D1({ fail: true }))), /D1_FORCED_FAILURE/);
  const final = client.calls.find(call => call.sql.includes('INSERT INTO kidults_control.outbox_delivery_receipts'));
  assert(final.params.includes('FAILED'));
  assert(final.params.includes('D1_FORCED_FAILURE'));
  assert(client.calls.some(call => call.sql.includes('UPDATE kidults_control.outbox_delivery_claims')));
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
});

test('outbox delivery quarantines a poison event at the bounded retry limit', async () => {
  const client = new PgClient();
  const args = input(client, new D1({ fail: true }));
  args.maxAttempts = 1;
  await assert.rejects(() => deliverNextOutboxEvent(args), /D1_FORCED_FAILURE/);
  const final = client.calls.find(call => call.sql.includes('INSERT INTO kidults_control.outbox_delivery_receipts'));
  assert(final.params.includes('QUARANTINED'));
  const claim = client.calls.find(call => call.sql.includes('WITH candidate AS'));
  assert(claim.sql.includes("r.state IN ('PROJECTED','QUARANTINED')"));
});

test('outbox delivery returns IDLE without touching D1 when no event is claimable', async () => {
  const client = new PgClient({ idle: true });
  const db = new D1();
  const receipt = await deliverNextOutboxEvent(input(client, db));
  assert.equal(receipt.state, 'IDLE');
  assert.equal(db.calls.length, 0);
});
