import assert from 'node:assert/strict';
import test from 'node:test';
import { POSTGRES_LEDGER_DDL, PostgresTransitionLedger } from '../../../scripts/kidults/staging-operations/lib/postgres-transition-ledger-v1.mjs';

test('PostgreSQL schema binds unique lease and unique task-state evidence', () => {
  assert.match(POSTGRES_LEDGER_DDL, /task_id text PRIMARY KEY/);
  assert.match(POSTGRES_LEDGER_DDL, /lease_id text NOT NULL UNIQUE/);
  assert.match(POSTGRES_LEDGER_DDL, /UNIQUE \(task_id, state\)/);
});

test('lease acquisition uses an atomic expiry-guarded upsert', async () => {
  const calls = [];
  const ledger = new PostgresTransitionLedger({
    nowIso: () => '2026-09-21T16:00:00.000Z',
    query: async (sql, values) => { calls.push({ sql, values }); return { rows: [{ task_id: values[0] }] }; },
  });
  await ledger.acquire('task-1', 'lease:abc', '2026-09-21T16:01:00.000Z');
  assert.match(calls[0].sql, /ON CONFLICT \(task_id\) DO UPDATE/);
  assert.match(calls[0].sql, /expires_at <= EXCLUDED\.acquired_at/);
  assert.deepEqual(calls[0].values, ['task-1', 'lease:abc', '2026-09-21T16:00:00.000Z', '2026-09-21T16:01:00.000Z']);
});

test('terminal transition is transactional and rolls back on failure', async () => {
  const calls = [];
  const ledger = new PostgresTransitionLedger({
    nowIso: () => '2026-09-21T16:00:00.000Z',
    query: async (sql, values) => {
      calls.push(sql.trim());
      if (sql.includes('UPDATE kidults_staging_task_lease')) throw new Error('WRITE_FAILED');
      return { rows: [{ sequence: 1, task_id: values?.[0], state: values?.[1] }] };
    },
  });
  await assert.rejects(ledger.transition('task-1', 'COMPLETE_VERIFIED', {}, true), /WRITE_FAILED/);
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.equal(calls.includes('COMMIT'), false);
});
