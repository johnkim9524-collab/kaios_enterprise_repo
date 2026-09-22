import assert from 'node:assert/strict';
import test from 'node:test';
import { POSTGRES_LEDGER_DDL, PostgresTransitionLedger } from '../../../scripts/kidults/staging-operations/lib/postgres-transition-ledger-v1.mjs';
const lease = { lease_id: 'lease:fixture', generation: '7' };

test('schema preserves history and requires explicit legacy migration', () => {
  assert.match(POSTGRES_LEDGER_DDL, /SCHEMA_MIGRATION_REQUIRED/);
  assert.match(POSTGRES_LEDGER_DDL, /lease_generation bigint NOT NULL/);
  assert.doesNotMatch(POSTGRES_LEDGER_DDL, /DROP\s+(CONSTRAINT|TABLE|INDEX)/i);
  assert.doesNotMatch(POSTGRES_LEDGER_DDL, /UNIQUE\s*\([^)]*state/i);
});
test('acquisition uses server clock and exact TTL, never caller time', async () => {
  let call;
  const ledger = new PostgresTransitionLedger({ query: async (sql, values) => {
    call = { sql, values };
    return { rows: [{ task_id: values[0], lease_id: values[1], generation: '4', acquired_at: new Date(1000), expires_at: new Date(61000) }] };
  } });
  assert.equal((await ledger.acquire('task', Date.now() + 86400000, 60000)).generation, '4');
  assert.deepEqual([call.values[0], call.values[2]], ['task', 60000]);
  assert.equal(call.values.length, 3);
  assert.match(call.sql, /clock_timestamp\(\)/);
  assert.match(call.sql, /generation = kidults_staging_task_lease.generation \+ 1/);
});
test('stale or expired transition rejects empty admission in one statement', async () => {
  const calls = [];
  const ledger = new PostgresTransitionLedger({ query: async (sql, values) => { calls.push({ sql, values }); return { rows: [] }; } });
  await assert.rejects(ledger.transition('task', lease, 'COMPLETE_VERIFIED'), /STALE_OR_EXPIRED_LEASE_FENCE/);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /FOR UPDATE/);
  assert.match(calls[0].sql, /expires_at > clock_timestamp\(\)/);
  assert.deepEqual(calls[0].values.slice(0, 4), ['task', lease.lease_id, '7', 'COMPLETE_VERIFIED']);
});
test('atomic SQL failure propagates without cross-connection transaction commands', async () => {
  const calls = [];
  const ledger = new PostgresTransitionLedger({ query: async sql => { calls.push(sql); throw new Error('WRITE_FAILED'); } });
  await assert.rejects(ledger.transition('task', lease, 'COMPLETE_VERIFIED'), /WRITE_FAILED/);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /UPDATE kidults_staging_task_lease/);
  assert.match(calls[0], /INSERT INTO kidults_staging_transition/);
});
test('release checks exact fencing token and never extends expiry', async () => {
  let call;
  const ledger = new PostgresTransitionLedger({ query: async (sql, values) => { call = { sql, values }; return { rows: [{ task_id: 'task' }] }; } });
  assert.equal(await ledger.release('task', lease), true);
  assert.deepEqual(call.values, ['task', lease.lease_id, '7']);
  assert.match(call.sql, /released=true/);
  assert.doesNotMatch(call.sql, /SET expires_at/);
});
test('invalid generation rejects before SQL', async () => {
  let calls = 0;
  const ledger = new PostgresTransitionLedger({ query: async () => { calls++; } });
  for (const generation of [undefined, NaN, -1, 0, Number.MAX_SAFE_INTEGER + 1, '01', '9223372036854775808']) {
    await assert.rejects(ledger.transition('task', { lease_id: 'lease:x', generation }, 'LEASED'), /INVALID_LEASE_BINDING/);
  }
  assert.equal(calls, 0);
});
test('invalid transition state cannot mutate the ledger', async () => {
  let calls = 0;
  const ledger = new PostgresTransitionLedger({ query: async () => { calls++; } });
  await assert.rejects(ledger.transition('task', lease, 'ARBITRARY_PASS'), /INVALID_TRANSITION_STATE/);
  assert.equal(calls, 0);
});
test('invalid TTL rejects before SQL', async () => {
  const ledger = new PostgresTransitionLedger({ query: async () => { throw new Error('UNEXPECTED_SQL'); } });
  for (const ttl of [NaN, -1, 0, 1.5, 300001]) await assert.rejects(ledger.acquire('task', Date.now(), ttl), /INVALID_LEASE_REQUEST/);
});
