import assert from 'node:assert/strict';
import test from 'node:test';
import { POSTGRES_LEDGER_DDL, PostgresTransitionLedger } from '../../../scripts/kidults/staging-operations/lib/postgres-transition-ledger-v1.mjs';

test('PostgreSQL schema binds lease generation to transition evidence', () => {
  assert.match(POSTGRES_LEDGER_DDL, /task_id text PRIMARY KEY/);
  assert.match(POSTGRES_LEDGER_DDL, /generation bigint NOT NULL DEFAULT 1/);
  assert.match(POSTGRES_LEDGER_DDL, /lease_generation bigint/);
  assert.match(POSTGRES_LEDGER_DDL, /task_generation_state_uq/);
});

test('lease acquisition atomically increments generation after expiry', async () => {
  const calls = [];
  const ledger = new PostgresTransitionLedger({
    nowIso: () => '2026-09-21T16:00:00.000Z',
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [{
        task_id: values[0], lease_id: values[1], generation: 4,
        acquired_at: values[2], expires_at: values[3],
      }] };
    },
  });
  const lease = await ledger.acquire('task-1', Date.parse('2026-09-21T16:00:00.000Z'), 60_000);
  assert.match(calls[0].sql, /generation = kidults_staging_task_lease\.generation \+ 1/);
  assert.match(calls[0].sql, /expires_at <= EXCLUDED\.acquired_at/);
  assert.equal(lease.generation, 4);
  assert.equal(lease.acquired_at_ms, Date.parse('2026-09-21T16:00:00.000Z'));
});

test('stale PostgreSQL worker is rejected before transition insert', async () => {
  const calls = [];
  const ledger = new PostgresTransitionLedger({
    nowIso: () => '2026-09-21T16:00:00.000Z',
    query: async (sql) => {
      calls.push(sql.trim());
      if (sql.includes('SELECT task_id, lease_id, generation')) {
        return { rows: [{ task_id: 'task-1', lease_id: 'lease:new', generation: 2, terminal: false }] };
      }
      return { rows: [] };
    },
  });
  await assert.rejects(
    ledger.transition('task-1', { lease_id: 'lease:old', generation: 1 }, 'COMPLETE_VERIFIED', {}),
    /STALE_LEASE_FENCE/,
  );
  assert.equal(calls.some(sql => sql.startsWith('INSERT INTO kidults_staging_transition')), false);
  assert.equal(calls.at(-1), 'ROLLBACK');
});

test('terminal transition is fenced and rolls back on terminal write failure', async () => {
  const calls = [];
  const lease = { lease_id: 'lease:abc', generation: 3 };
  const ledger = new PostgresTransitionLedger({
    nowIso: () => '2026-09-21T16:00:00.000Z',
    query: async (sql, values) => {
      calls.push(sql.trim());
      if (sql.includes('SELECT task_id, lease_id, generation')) {
        return { rows: [{ task_id: 'task-1', lease_id: lease.lease_id, generation: lease.generation, terminal: false }] };
      }
      if (sql.includes('INSERT INTO kidults_staging_transition')) {
        return { rows: [{ sequence: 1, task_id: values[0], lease_id: values[1], lease_generation: values[2], state: values[3] }] };
      }
      if (sql.includes('UPDATE kidults_staging_task_lease') && sql.includes('SET terminal = true')) throw new Error('WRITE_FAILED');
      return { rows: [] };
    },
  });
  await assert.rejects(ledger.transition('task-1', lease, 'COMPLETE_VERIFIED', {}), /WRITE_FAILED/);
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.equal(calls.includes('COMMIT'), false);
});

test('release is fenced to the exact lease id and generation', async () => {
  const calls = [];
  const lease = { lease_id: 'lease:abc', generation: 7 };
  const ledger = new PostgresTransitionLedger({
    nowIso: () => '2026-09-21T16:00:05.000Z',
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [{ task_id: values[0] }] };
    },
  });
  assert.equal(await ledger.release('task-1', lease), true);
  assert.match(calls[0].sql, /lease_id = \$2/);
  assert.match(calls[0].sql, /generation = \$3/);
  assert.deepEqual(calls[0].values, ['task-1', 'lease:abc', 7, '2026-09-21T16:00:05.000Z']);
});
