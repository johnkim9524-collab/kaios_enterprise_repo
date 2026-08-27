import assert from 'node:assert/strict';
import test from 'node:test';
import { admitSupplyChainRun } from '../src/supply-chain-admission.mjs';

const organizationId = '00000000-0000-4000-8000-000000000010';
const sourceId = '00000000-0000-4000-8000-000000000020';
const rightsDecisionId = '00000000-0000-4000-8000-000000000030';
const ids = [
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000103',
];
const hash = char => `sha256:${char.repeat(64)}`;

class Client {
  constructor({ decision = 'PASS', transform = true, missing = false } = {}) {
    this.calls = []; this.decision = decision; this.transform = transform; this.missing = missing;
  }
  async query(sql, params = []) {
    this.calls.push({ sql: String(sql).trim(), params });
    const text = String(sql);
    if (text.includes('SELECT organization_id FROM kidults_control.organizations')) return { rows: [{ organization_id: organizationId }] };
    if (text.includes('INSERT INTO kidults_control.commands')) return { rows: [{ command_id: ids[0] }] };
    if (text.includes('FROM kidults_control.source_rights_decisions')) return { rows: this.missing ? [] : [{
      decision: this.decision, collect_allowed: true, store_allowed: true,
      transform_allowed: this.transform, model_use_allowed: false,
      display_allowed: false, post_exit_allowed: false, field_set_digest: hash('a'),
      expires_at: '2026-09-01T00:00:00.000Z', canonical_source_id: 'museum.example',
    }] };
    if (text.includes('SELECT sequence_no,event_hash')) return { rows: [] };
    return { rows: [] };
  }
}

function input(client) {
  let index = 0;
  return {
    client, organizationId, actorSubject: 'supply:worker', sourceId, rightsDecisionId,
    purposeCode: 'INTERNAL_ENTITY_RESOLUTION', fieldSetDigest: hash('a'),
    sourceTimestamp: '2026-08-26T00:00:00.000Z', acquiredAt: '2026-08-26T00:01:00.000Z',
    rawDigest: hash('b'), normalizedDigest: hash('c'), codeVersion: '641d5bd02',
    schemaVersion: 'source-v1', expectedCardinality: 10, actualCardinality: 10,
    replayCommandDigest: hash('d'), idempotencyKey: 'supply-run-001',
    requestId: 'request-supply-001', traceId: 'trace-supply-001',
    now: () => new Date('2026-08-26T00:02:00.000Z'), id: () => ids[index++],
  };
}

test('lawful supply run is admitted atomically with audit and outbox', async () => {
  const client = new Client();
  const receipt = await admitSupplyChainRun(input(client));
  assert.equal(receipt.state, 'COMMITTED');
  assert(client.calls.some(call => call.sql.includes('INSERT INTO kidults_control.supply_chain_runs')));
  assert(client.calls.some(call => call.sql.includes('INSERT INTO kidults_control.audit_events')));
  const outbox = client.calls.find(call => call.sql.includes('INSERT INTO kidults_control.outbox_events'));
  assert(outbox);
  assert(outbox.params.some(value => typeof value === 'string' && value.includes(`"last_supply_chain_run_id":"${ids[0]}"`)));
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
});

test('supply run with insufficient purpose rights rolls back without admission or outbox', async () => {
  const client = new Client({ transform: false });
  await assert.rejects(() => admitSupplyChainRun(input(client)), /SUPPLY_CHAIN_REQUIRED_RIGHT_DENIED/);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  assert(!client.calls.some(call => call.sql.includes('INSERT INTO kidults_control.supply_chain_runs')));
  assert(!client.calls.some(call => call.sql.includes('INSERT INTO kidults_control.outbox_events')));
});

test('supply run fails before PostgreSQL mutation on cardinality mismatch', async () => {
  const client = new Client();
  const args = input(client); args.actualCardinality = 9;
  await assert.rejects(() => admitSupplyChainRun(args), /SUPPLY_CHAIN_CARDINALITY_MISMATCH/);
  assert.equal(client.calls.length, 0);
});
