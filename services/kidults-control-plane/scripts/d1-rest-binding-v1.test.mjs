import assert from 'node:assert/strict';
import test from 'node:test';
import { createGovernedD1RestBinding } from '../src/d1-rest-binding.mjs';

const config = {
  accountId: 'account-test',
  databaseId: 'database-test',
  apiToken: 'token-test',
};

test('governed binding sends one parameterized D1 mutation without exposing credentials', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, errors: [], result: [{ success: true, meta: { changes: 1 } }] }),
    };
  };
  const db = createGovernedD1RestBinding({ ...config, fetchImpl });
  const result = await db.prepare('INSERT INTO projection_meta (projection_name) VALUES (?)')
    .bind('organization_access_projection').run();

  assert.equal(result.success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.cloudflare.com/client/v4/accounts/account-test/d1/database/database-test/query');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-test');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    sql: 'INSERT INTO projection_meta (projection_name) VALUES (?)',
    params: ['organization_access_projection'],
  });
});
test('binding fails closed for non-governed writer identity', () => {
  assert.throws(
    () => createGovernedD1RestBinding({ ...config, projectorId: 'legacy-writer' }),
    /D1_WRITER_ID_NOT_GOVERNED/,
  );
});

test('binding rejects reads and schema mutations at the write boundary', () => {
  const db = createGovernedD1RestBinding({
    ...config,
    fetchImpl: async () => { throw new Error('NETWORK_MUST_NOT_BE_CALLED'); },
  });
  assert.throws(() => db.prepare('SELECT 1'), /D1_PROJECTOR_STATEMENT_NON_MUTATION/);
  assert.throws(
    () => db.prepare('INSERT INTO x VALUES (1); DROP TABLE x'),
    /D1_PROJECTOR_SCHEMA_MUTATION_DENIED/,
  );
});

test('binding maps Cloudflare errors without returning the token', async () => {
  const db = createGovernedD1RestBinding({
    ...config,
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      json: async () => ({ success: false, errors: [{ code: 9109, message: 'Unauthorized' }] }),
    }),
  });
  await assert.rejects(
    () => db.prepare('DELETE FROM projection_meta WHERE projection_name=?').bind('x').run(),
    (error) => error.message === 'D1_REMOTE_QUERY_FAILED:9109' && !error.message.includes(config.apiToken),
  );
});
