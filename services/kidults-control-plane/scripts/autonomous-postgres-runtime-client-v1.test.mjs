import assert from 'node:assert/strict';
import test from 'node:test';
import { connectAutonomousPostgresRuntime, createBoundedPostgresCredentialResolver } from
  '../src/autonomous-control/postgres-runtime-client-v1.mjs';

const options = {
  dsn: 'postgresql://runtime-user:private-value@db.example.test:25060/kidults_runtime?sslmode=require',
  applicationName: 'kidults-autonomous-runtime-v1',
  connectTimeoutMs: 5000,
  statementTimeoutMs: 30000,
};

const credentialRequest = {
  purpose: 'AUTONOMOUS_POSTGRES_LAUNCH',
  applicationName: 'kidults-autonomous-protected-launcher-v1',
  sourceSha: '8'.repeat(40), requestId: 'protected-launch-request',
  manifestDigest: `sha256:${'b'.repeat(64)}`,
};

test('provider-neutral credential adapter resolves one exact bound secret', async () => {
  const calls = [];
  const resolver = createBoundedPostgresCredentialResolver({
    providerId: 'github-environment-secret-provider',
    secretNameDigest: `sha256:${'a'.repeat(64)}`,
    sourceSha: credentialRequest.sourceSha, manifestDigest: credentialRequest.manifestDigest,
    requestId: credentialRequest.requestId, applicationName: credentialRequest.applicationName,
    connectTimeoutMs: 5000, statementTimeoutMs: 30000,
  }, { resolveSecret: async binding => { calls.push(binding); return options.dsn; } });
  const credential = await resolver(credentialRequest);
  assert.deepEqual(calls, [{ providerId: 'github-environment-secret-provider',
    secretNameDigest: `sha256:${'a'.repeat(64)}` }]);
  assert.equal(credential.dsn, options.dsn);
  assert.equal(credential.applicationName, credentialRequest.applicationName);
  await assert.rejects(resolver(credentialRequest),
    /AUTONOMOUS_POSTGRES_CREDENTIAL_ALREADY_RESOLVED/);
});

test('credential adapter rejects substitution before provider access and bounds failures', async () => {
  let called = 0;
  const resolver = createBoundedPostgresCredentialResolver({
    providerId: 'external-secret-provider', secretNameDigest: `sha256:${'c'.repeat(64)}`,
    sourceSha: credentialRequest.sourceSha, manifestDigest: credentialRequest.manifestDigest,
    requestId: credentialRequest.requestId, applicationName: credentialRequest.applicationName,
    connectTimeoutMs: 5000, statementTimeoutMs: 30000,
  }, { resolveSecret: async () => { called += 1; throw new Error('raw provider secret'); } });
  await assert.rejects(resolver({ ...credentialRequest, sourceSha: '7'.repeat(40) }),
    /AUTONOMOUS_POSTGRES_CREDENTIAL_REQUEST_BINDING_INVALID/);
  assert.equal(called, 0);
  await assert.rejects(resolver(credentialRequest), error =>
    error.message === 'AUTONOMOUS_POSTGRES_CREDENTIAL_PROVIDER_FAILED'
      && !error.message.includes('raw provider secret'));
  assert.equal(called, 1);
});

test('runtime configuration decomposes DSN and enforces certificate verification', async () => {
  let config;
  class ConfigurationCaptureClient {
    constructor(value) { config = value; }
    async connect() {}
    async query() {}
    async end() {}
  }
  const runtime = await connectAutonomousPostgresRuntime(options,
    { Client: ConfigurationCaptureClient });
  assert.deepEqual({ ...config, ssl: { ...config.ssl } }, {
    host: 'db.example.test', port: 25060, database: 'kidults_runtime',
    user: 'runtime-user', password: 'private-value',
    application_name: 'kidults-autonomous-runtime-v1', connectionTimeoutMillis: 5000,
    statement_timeout: 30000, query_timeout: 30000, ssl: { rejectUnauthorized: true },
  });
  await runtime.close();
  await assert.rejects(connectAutonomousPostgresRuntime({ ...options,
    dsn: 'postgresql://runtime-user:private-value@db.example.test/kidults_runtime' },
  { Client: ConfigurationCaptureClient }), /AUTONOMOUS_POSTGRES_RUNTIME_TLS_REQUIRED/);
  await assert.rejects(connectAutonomousPostgresRuntime({ ...options, dsn: 'not-a-dsn' },
    { Client: ConfigurationCaptureClient }), /AUTONOMOUS_POSTGRES_RUNTIME_DSN_INVALID/);
});

test('one connected client preserves query order and closes exactly once', async () => {
  const events = [];
  class FakeClient {
    constructor(config) { events.push(['construct', config.host, config.password]); }
    async connect() { events.push(['connect']); }
    async query(text, values) { events.push(['query', text, values]); return { rows: [{ ok: true }] }; }
    async end() { events.push(['end']); }
  }
  const runtime = await connectAutonomousPostgresRuntime(options, { Client: FakeClient });
  assert.deepEqual(await runtime.query('BEGIN'), { rows: [{ ok: true }] });
  await runtime.query('SELECT $1::text', ['bounded']);
  await runtime.query('COMMIT');
  assert.deepEqual(await runtime.close(), { state: 'CLOSED' });
  assert.deepEqual(await runtime.close(), { state: 'ALREADY_CLOSED' });
  assert.deepEqual(events.map((event) => event[0]),
    ['construct', 'connect', 'query', 'query', 'query', 'end']);
  await assert.rejects(runtime.query('SELECT 1'), /AUTONOMOUS_POSTGRES_RUNTIME_CLIENT_CLOSED/);
});

test('connection and query failures expose no credential or driver error material', async () => {
  class ConnectFailure {
    async connect() { throw new Error(`could not connect ${options.dsn}`); }
    async query() {}
    async end() {}
  }
  await assert.rejects(connectAutonomousPostgresRuntime(options, { Client: ConnectFailure }),
    error => error.message === 'AUTONOMOUS_POSTGRES_RUNTIME_CONNECT_FAILED'
      && !error.message.includes('private-value'));
  class QueryFailure {
    async connect() {}
    async query() { throw new Error('password private-value rejected'); }
    async end() {}
  }
  const runtime = await connectAutonomousPostgresRuntime(options, { Client: QueryFailure });
  await assert.rejects(runtime.query('SELECT 1'),
    error => error.message === 'AUTONOMOUS_POSTGRES_RUNTIME_QUERY_FAILED'
      && !error.message.includes('private-value'));
  await runtime.close();
});
