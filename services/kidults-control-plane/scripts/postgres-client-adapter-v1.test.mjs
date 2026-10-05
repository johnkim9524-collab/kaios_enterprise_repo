import assert from 'node:assert/strict';
import test from 'node:test';
import {
  openGovernedProjectorClient,
  postgresProjectorRuntimeContract,
} from '../src/postgres-client-adapter.mjs';

class FakeClient {
  static instances = [];
  constructor(options) {
    this.options = options;
    this.calls = [];
    this.ended = false;
    FakeClient.instances.push(this);
  }
  async connect() { this.connected = true; }
  async query(sql) {
    this.calls.push(String(sql));
    if (String(sql).includes('current_user')) {
      return { rows: [{ current_user: 'kidults_control_projector' }] };
    }
    return { rows: [] };
  }
  async end() { this.ended = true; }
}

test('adapter activates the governed projector role without putting DSN in argv', async () => {
  const dsn = 'postgresql://runtime:secret@example.test:25060/defaultdb?sslmode=require';
  const client = await openGovernedProjectorClient({ connectionString: dsn, Client: FakeClient });
  assert.equal(client.connected, true);
  assert.equal(client.options.connectionString, dsn);
  assert.deepEqual(client.calls, [
    'SET ROLE kidults_control_projector',
    'SELECT current_user AS current_user',
  ]);
  assert.equal(postgresProjectorRuntimeContract.secretsInArgv, false);
});

test('adapter rejects invalid DSN before opening a connection', async () => {
  FakeClient.instances.length = 0;
  await assert.rejects(
    () => openGovernedProjectorClient({ connectionString: 'file:///tmp/db', Client: FakeClient }),
    /POSTGRES_DSN_INVALID/,
  );
  assert.equal(FakeClient.instances.length, 0);
});

test('adapter closes the connection when role activation fails', async () => {
  class WrongRoleClient extends FakeClient {
    async query(sql) {
      this.calls.push(String(sql));
      if (String(sql).includes('current_user')) return { rows: [{ current_user: 'doadmin' }] };
      return { rows: [] };
    }
  }
  await assert.rejects(
    () => openGovernedProjectorClient({
      connectionString: 'postgresql://runtime:secret@example.test/db',
      Client: WrongRoleClient,
    }),
    /POSTGRES_PROJECTOR_ROLE_NOT_ACTIVE/,
  );
  assert.equal(WrongRoleClient.instances.at(-1).ended, true);
});
