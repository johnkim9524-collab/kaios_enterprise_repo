import { Client as PostgresClient } from 'pg';
import {
  requireDigest, requireExactRecord, requireIdentifier, requireValue,
} from '../common-control/canonical-v1.mjs';

const OPTIONS = Object.freeze([
  'dsn', 'applicationName', 'connectTimeoutMs', 'statementTimeoutMs',
]);
const CREDENTIAL_ADAPTER_OPTIONS = Object.freeze([
  'providerId', 'secretNameDigest', 'sourceSha', 'manifestDigest', 'requestId',
  'applicationName', 'connectTimeoutMs', 'statementTimeoutMs',
]);

function boundedTimeout(value, code) {
  requireValue(Number.isSafeInteger(value) && value >= 1000 && value <= 60000, code);
  return value;
}

function postgresRuntimeConfiguration(input) {
  const options = structuredClone(input);
  requireExactRecord(options, OPTIONS, 'AUTONOMOUS_POSTGRES_RUNTIME_OPTIONS_INVALID');
  requireIdentifier(options.applicationName, 'AUTONOMOUS_POSTGRES_RUNTIME_APP_INVALID');
  requireValue(options.applicationName.startsWith('kidults-autonomous-'),
    'AUTONOMOUS_POSTGRES_RUNTIME_APP_SCOPE_DENIED');
  boundedTimeout(options.connectTimeoutMs, 'AUTONOMOUS_POSTGRES_RUNTIME_CONNECT_TIMEOUT_INVALID');
  boundedTimeout(options.statementTimeoutMs, 'AUTONOMOUS_POSTGRES_RUNTIME_STATEMENT_TIMEOUT_INVALID');
  requireValue(typeof options.dsn === 'string' && options.dsn.length <= 4096,
    'AUTONOMOUS_POSTGRES_RUNTIME_DSN_INVALID');
  let parsed;
  try { parsed = new URL(options.dsn); } catch { throw new Error('AUTONOMOUS_POSTGRES_RUNTIME_DSN_INVALID'); }
  requireValue(parsed.protocol === 'postgresql:' && parsed.username.length > 0
    && parsed.password.length > 0 && parsed.hostname.length > 0
    && parsed.pathname.length > 1, 'AUTONOMOUS_POSTGRES_RUNTIME_DSN_INVALID');
  requireValue(parsed.searchParams.get('sslmode') === 'require'
    || parsed.searchParams.get('sslmode') === 'verify-full',
  'AUTONOMOUS_POSTGRES_RUNTIME_TLS_REQUIRED');
  const port = parsed.port === '' ? 5432 : Number(parsed.port);
  requireValue(Number.isSafeInteger(port) && port >= 1 && port <= 65535,
    'AUTONOMOUS_POSTGRES_RUNTIME_PORT_INVALID');
  return Object.freeze({
    host: parsed.hostname, port, database: decodeURIComponent(parsed.pathname.slice(1)),
    user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password),
    application_name: options.applicationName,
    connectionTimeoutMillis: options.connectTimeoutMs,
    statement_timeout: options.statementTimeoutMs,
    query_timeout: options.statementTimeoutMs,
    ssl: Object.freeze({ rejectUnauthorized: true }),
  });
}

export function createBoundedPostgresCredentialResolver(input, dependencies = {}) {
  const options = structuredClone(input);
  requireExactRecord(options, CREDENTIAL_ADAPTER_OPTIONS,
    'AUTONOMOUS_POSTGRES_CREDENTIAL_ADAPTER_OPTIONS_INVALID');
  requireIdentifier(options.providerId, 'AUTONOMOUS_POSTGRES_CREDENTIAL_PROVIDER_INVALID');
  requireDigest(options.secretNameDigest,
    'AUTONOMOUS_POSTGRES_CREDENTIAL_SECRET_BINDING_INVALID');
  requireValue(/^[0-9a-f]{40}$/.test(options.sourceSha),
    'AUTONOMOUS_POSTGRES_CREDENTIAL_SOURCE_INVALID');
  requireDigest(options.manifestDigest,
    'AUTONOMOUS_POSTGRES_CREDENTIAL_MANIFEST_INVALID');
  requireIdentifier(options.requestId, 'AUTONOMOUS_POSTGRES_CREDENTIAL_REQUEST_INVALID');
  requireIdentifier(options.applicationName, 'AUTONOMOUS_POSTGRES_RUNTIME_APP_INVALID');
  requireValue(options.applicationName === 'kidults-autonomous-protected-launcher-v1',
    'AUTONOMOUS_POSTGRES_RUNTIME_APP_SCOPE_DENIED');
  boundedTimeout(options.connectTimeoutMs,
    'AUTONOMOUS_POSTGRES_RUNTIME_CONNECT_TIMEOUT_INVALID');
  boundedTimeout(options.statementTimeoutMs,
    'AUTONOMOUS_POSTGRES_RUNTIME_STATEMENT_TIMEOUT_INVALID');
  requireValue(typeof dependencies.resolveSecret === 'function',
    'AUTONOMOUS_POSTGRES_CREDENTIAL_PROVIDER_REQUIRED');
  let resolved = false;
  return async request => {
    requireExactRecord(request,
      ['purpose', 'applicationName', 'sourceSha', 'requestId', 'manifestDigest'],
      'AUTONOMOUS_POSTGRES_CREDENTIAL_REQUEST_INVALID');
    requireValue(request.purpose === 'AUTONOMOUS_POSTGRES_LAUNCH'
      && request.applicationName === options.applicationName
      && request.sourceSha === options.sourceSha && request.requestId === options.requestId
      && request.manifestDigest === options.manifestDigest,
    'AUTONOMOUS_POSTGRES_CREDENTIAL_REQUEST_BINDING_INVALID');
    requireValue(resolved === false, 'AUTONOMOUS_POSTGRES_CREDENTIAL_ALREADY_RESOLVED');
    resolved = true;
    let dsn;
    try {
      dsn = await dependencies.resolveSecret(Object.freeze({
        providerId: options.providerId, secretNameDigest: options.secretNameDigest,
      }));
    } catch {
      throw new Error('AUTONOMOUS_POSTGRES_CREDENTIAL_PROVIDER_FAILED');
    }
    requireValue(typeof dsn === 'string' && dsn.length > 0 && dsn.length <= 4096,
      'AUTONOMOUS_POSTGRES_CREDENTIAL_VALUE_INVALID');
    return Object.freeze({ dsn, applicationName: options.applicationName,
      connectTimeoutMs: options.connectTimeoutMs,
      statementTimeoutMs: options.statementTimeoutMs });
  };
}

export async function connectAutonomousPostgresRuntime(input, dependencies = {}) {
  const configuration = postgresRuntimeConfiguration(input);
  const Client = dependencies.Client ?? PostgresClient;
  requireValue(typeof Client === 'function', 'AUTONOMOUS_POSTGRES_RUNTIME_CLIENT_INVALID');
  const client = new Client(configuration);
  requireValue(client && typeof client.connect === 'function' && typeof client.query === 'function'
    && typeof client.end === 'function', 'AUTONOMOUS_POSTGRES_RUNTIME_CLIENT_INVALID');
  let closed = false;
  try { await client.connect(); } catch {
    try { await client.end(); } catch { /* preserve bounded failure */ }
    throw new Error('AUTONOMOUS_POSTGRES_RUNTIME_CONNECT_FAILED');
  }
  return Object.freeze({
    async query(...args) {
      requireValue(!closed, 'AUTONOMOUS_POSTGRES_RUNTIME_CLIENT_CLOSED');
      try { return await client.query(...args); } catch {
        throw new Error('AUTONOMOUS_POSTGRES_RUNTIME_QUERY_FAILED');
      }
    },
    async close() {
      if (closed) return { state: 'ALREADY_CLOSED' };
      closed = true;
      try { await client.end(); } catch {
        throw new Error('AUTONOMOUS_POSTGRES_RUNTIME_CLOSE_FAILED');
      }
      return { state: 'CLOSED' };
    },
  });
}

export async function withAutonomousPostgresRuntime(input, operation, dependencies = {}) {
  requireValue(typeof operation === 'function', 'AUTONOMOUS_POSTGRES_RUNTIME_OPERATION_INVALID');
  const connect = dependencies.connect ?? connectAutonomousPostgresRuntime;
  requireValue(typeof connect === 'function', 'AUTONOMOUS_POSTGRES_RUNTIME_CONNECTOR_INVALID');
  const client = await connect(input);
  requireValue(client && typeof client.query === 'function' && typeof client.close === 'function',
    'AUTONOMOUS_POSTGRES_RUNTIME_CLIENT_INVALID');
  let result;
  let failure;
  try {
    result = await operation(client);
  } catch (error) {
    failure = error;
  }
  try {
    await client.close();
  } catch (error) {
    if (failure === undefined) failure = error;
  }
  if (failure !== undefined) throw failure;
  return result;
}
