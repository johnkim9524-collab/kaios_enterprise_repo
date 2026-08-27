import assert from 'node:assert/strict';
import test from 'node:test';
import { executeCanonicalCommand } from '../src/command-ledger.mjs';
import { d1ProjectorContract, projectOutboxEvent } from '../src/d1-projector.mjs';

const ids = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
];

class FakePostgresClient {
  constructor({ duplicate = false, failApply = false, missingOrganization = false } = {}) {
    this.calls = [];
    this.duplicate = duplicate;
    this.failApply = failApply;
    this.missingOrganization = missingOrganization;
  }
  async query(sql, params = []) {
    this.calls.push({ sql: String(sql).trim(), params });
    if (String(sql).includes('SELECT organization_id FROM kidults_control.organizations')) {
      return { rows: this.missingOrganization ? [] : [{ organization_id: params[0] }] };
    }
    if (String(sql).includes('INSERT INTO kidults_control.commands')) return { rows: this.duplicate ? [] : [{ command_id: ids[0] }] };
    if (String(sql).includes('SELECT sequence_no,event_hash')) return { rows: [] };
    if (String(sql).includes('DOMAIN_APPLY') && this.failApply) throw new Error('FORCED_DOMAIN_FAILURE');
    return { rows: [] };
  }
}

class FakeD1Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async run() { this.db.calls.push({ sql: this.sql, values: this.values }); return { success: true }; }
}

class FakeD1 {
  constructor() { this.calls = []; }
  prepare(sql) { return new FakeD1Statement(this, sql); }
}

const commandInput = (client, apply = async (db) => db.query('DOMAIN_APPLY')) => {
  let offset = 0;
  return {
    client,
    organizationId: '00000000-0000-4000-8000-000000000010',
    actorSubject: 'subject:test-owner',
    commandType: 'organization.access.change',
    idempotencyKey: 'idem-001',
    requestId: 'req-001',
    traceId: 'trace-001',
    policyVersion: 'control-plane-v1',
    payload: { role: 'OWNER' },
    aggregateType: 'organization_access',
    aggregateId: '00000000-0000-4000-8000-000000000010',
    eventType: 'organization.access.changed',
    eventPayload: { organization_id: '00000000-0000-4000-8000-000000000010' },
    apply,
    id: () => ids[offset++],
    now: () => new Date('2026-08-26T00:00:00.000Z')
  };
};

test('canonical command commits domain change, audit and outbox in one PostgreSQL transaction', async () => {
  const client = new FakePostgresClient();
  const receipt = await executeCanonicalCommand(commandInput(client));
  assert.equal(receipt.state, 'COMMITTED');
  assert.equal(client.calls[0].sql, 'BEGIN');
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
  assert(client.calls.some((call) => call.sql.includes("set_config('kidults.writer_id'")));
  assert(client.calls.some((call) => call.sql.includes('INSERT INTO kidults_control.audit_events')));
  assert(client.calls.some((call) => call.sql.includes('INSERT INTO kidults_control.outbox_events')));
  assert.equal(client.calls.filter((call) => call.sql === 'ROLLBACK').length, 0);
});

test('canonical command rolls back every write when domain application fails', async () => {
  const client = new FakePostgresClient({ failApply: true });
  await assert.rejects(() => executeCanonicalCommand(commandInput(client)), /FORCED_DOMAIN_FAILURE/);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  assert(!client.calls.some((call) => call.sql.includes('INSERT INTO kidults_control.outbox_events')));
});

test('idempotent duplicate performs no domain, audit or outbox mutation', async () => {
  const client = new FakePostgresClient({ duplicate: true });
  const receipt = await executeCanonicalCommand(commandInput(client));
  assert.equal(receipt.state, 'IDEMPOTENT_DUPLICATE');
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  assert(!client.calls.some((call) => call.sql === 'DOMAIN_APPLY'));
});

test('missing or unauthorized organization fails closed before a command is accepted', async () => {
  const client = new FakePostgresClient({ missingOrganization: true });
  await assert.rejects(() => executeCanonicalCommand(commandInput(client)), /ORGANIZATION_NOT_FOUND_OR_NOT_AUTHORIZED/);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  assert(!client.calls.some((call) => call.sql.includes('INSERT INTO kidults_control.commands')));
});

test('single projector writes an allowlisted D1 read model with source provenance', async () => {
  const db = new FakeD1();
  const event = {
    outbox_event_id: '00000000-0000-4000-8000-000000000020',
    event_type: 'control.health.changed',
    payload_hash: `sha256:${'a'.repeat(64)}`,
    source_schema_version: 'control-plane-v1',
    created_at: '2026-08-26T00:00:00.000Z',
    payload_json: {
      service_name: 'kidults-control-plane', state: 'HOLD',
      projector_lag_seconds: 0, unknown_writer_count: 1, audit_gap_count: 0
    }
  };
  const receipt = await projectOutboxEvent(db, event);
  assert.equal(receipt.projector_id, 'kpmo-d1-projector-v1');
  assert.equal(db.calls.length, 1);
  assert(db.calls[0].sql.includes('control_plane_health_projection'));
  assert(db.calls[0].sql.includes('excluded.projected_at>control_plane_health_projection.projected_at'));
  assert(db.calls[0].sql.includes('excluded.source_event_id>control_plane_health_projection.source_event_id'));
  assert(db.calls[0].values.includes('kpmo-d1-projector-v1'));
  assert(db.calls[0].values.includes(event.outbox_event_id));
  assert(db.calls[0].values.includes('2026-08-26T00:00:00.000Z'));
});

test('projector rejects unregistered event types and malformed provenance', async () => {
  const db = new FakeD1();
  await assert.rejects(() => projectOutboxEvent(db, { event_type: 'customer.truth.overwrite' }), /D1_EVENT_TYPE_NOT_REGISTERED/);
  await assert.rejects(() => projectOutboxEvent(db, {
    event_type: 'control.health.changed', outbox_event_id: ids[0],
    payload_hash: `sha256:${'a'.repeat(64)}`, source_schema_version: 'control-plane-v1',
    created_at: 'not-a-date', payload_json: { service_name: 'x', state: 'HOLD' }
  }), /SOURCE_CREATED_AT_INVALID/);
  assert.deepEqual([...d1ProjectorContract.eventTypes].sort(), [
    'control.health.changed', 'organization.access.changed',
    'source.admission.changed', 'subscription.entitlement.changed'
  ]);
});
