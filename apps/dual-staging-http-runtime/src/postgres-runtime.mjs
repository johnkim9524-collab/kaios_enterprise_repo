import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  digestProjection,
  equalDigest,
  RuntimeControlError
} from './runtime-security.mjs';

const execFileAsync = promisify(execFile);
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;
const NONCE = /^[A-Za-z0-9._~-]{24,128}$/;

function fail(code, status = 503) {
  throw new RuntimeControlError(code, status);
}

function identifier(value, code) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail(code, 400);
  return value;
}

function lastLine(output) {
  return String(output || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) || '';
}

export function createPsqlExecutor({ dsn, timeoutMs = 10_000 }) {
  if (!dsn) fail('POSTGRES_DSN_REQUIRED', 503);
  return async ({ sql, variables = {} }) => {
    const args = [
      '--no-psqlrc',
      '--quiet',
      '--tuples-only',
      '--no-align',
      '--set=ON_ERROR_STOP=1'
    ];
    for (const [name, value] of Object.entries(variables)) {
      if (!/^[a-z][a-z0-9_]*$/.test(name)) fail('POSTGRES_VARIABLE_INVALID', 503);
      args.push(`--set=${name}=${value}`);
    }
    args.push('--command', sql);
    try {
      const { stdout } = await execFileAsync('psql', args, {
        timeout: timeoutMs,
        maxBuffer: 2 * 1024 * 1024,
        env: {
          ...process.env,
          PGDATABASE: dsn,
          PGAPPNAME: 'kaios-dual-staging-runtime',
          PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT || '5'
        }
      });
      return lastLine(stdout);
    } catch {
      fail('POSTGRES_QUERY_FAILED', 503);
    }
  };
}

export function createPostgresCliRuntime({
  dsn,
  tenantId,
  executor = null,
  timeoutMs = 10_000
}) {
  const safeTenantId = identifier(tenantId, 'TENANT_ID_INVALID');
  const execute = executor || createPsqlExecutor({ dsn, timeoutMs });

  const projectionStore = {
    async getSnapshot({ vertical }) {
      const safeVertical = identifier(vertical, 'VERTICAL_INVALID');
      const raw = await execute({
        variables: {
          tenant_id: safeTenantId,
          vertical: safeVertical
        },
        sql: `
WITH tenant_context AS MATERIALIZED (
  SELECT set_config('app.tenant_id', :'tenant_id', true)
)
SELECT json_build_object(
  'projection', p.projection_json,
  'digest', p.projection_digest,
  'asOf', p.as_of
)::text
FROM tenant_context
JOIN kaios_runtime.projections p
  ON p.tenant_id = :'tenant_id'
 AND p.vertical = :'vertical'
WHERE p.status = 'approved'
LIMIT 1;
`
      });
      if (!raw) fail('PROJECTION_NOT_AVAILABLE', 503);
      let row;
      try {
        row = JSON.parse(raw);
      } catch {
        fail('PROJECTION_RESULT_INVALID', 503);
      }
      if (!row || row.projection === null || typeof row.projection !== 'object') {
        fail('PROJECTION_RESULT_INVALID', 503);
      }
      const computedDigest = digestProjection(row.projection);
      if (!equalDigest(String(row.digest || ''), computedDigest)) {
        fail('PROJECTION_DIGEST_INVALID', 503);
      }
      return {
        projection: row.projection,
        digest: computedDigest,
        asOf: row.asOf || null
      };
    }
  };

  const exportControl = {
    async authorize({ vertical, subject, entitlementId, scope = 'EXPORT' }) {
      const safeVertical = identifier(vertical, 'VERTICAL_INVALID');
      const safeSubject = identifier(subject, 'SUBJECT_INVALID');
      const safeEntitlementId = identifier(entitlementId, 'ENTITLEMENT_ID_INVALID');
      const safeScope = identifier(scope, 'SCOPE_INVALID');
      const raw = await execute({
        variables: {
          tenant_id: safeTenantId,
          vertical: safeVertical,
          subject_id: safeSubject,
          entitlement_id: safeEntitlementId,
          scope: safeScope
        },
        sql: `
WITH tenant_context AS MATERIALIZED (
  SELECT set_config('app.tenant_id', :'tenant_id', true)
)
SELECT json_build_object(
  'entitlementId', e.entitlement_id,
  'expectedDigest', e.projection_digest
)::text
FROM tenant_context
JOIN kaios_runtime.entitlements e
  ON e.tenant_id = :'tenant_id'
 AND e.entitlement_id = :'entitlement_id'
WHERE e.vertical = :'vertical'
  AND e.subject_id = :'subject_id'
  AND e.status = 'active'
  AND e.revoked_at IS NULL
  AND (e.expires_at IS NULL OR e.expires_at > clock_timestamp())
  AND :'scope' = ANY(e.scopes)
LIMIT 1;
`
      });
      if (!raw) fail('EXPORT_NOT_AUTHORIZED', 403);
      let row;
      try {
        row = JSON.parse(raw);
      } catch {
        fail('ENTITLEMENT_RESULT_INVALID', 503);
      }
      return {
        entitlement: { id: row.entitlementId },
        expectedDigest: row.expectedDigest || null
      };
    },

    async consumeNonce({ vertical, entitlementId, nonce, digest }) {
      const safeVertical = identifier(vertical, 'VERTICAL_INVALID');
      const safeEntitlementId = identifier(entitlementId, 'ENTITLEMENT_ID_INVALID');
      if (typeof nonce !== 'string' || !NONCE.test(nonce)) fail('NONCE_INVALID', 400);
      if (!/^[a-f0-9]{64}$/.test(digest || '')) fail('PROJECTION_DIGEST_INVALID', 409);
      const nonceDigest = createHash('sha256').update(nonce).digest('hex');
      const result = await execute({
        variables: {
          tenant_id: safeTenantId,
          vertical: safeVertical,
          entitlement_id: safeEntitlementId,
          nonce_digest: nonceDigest,
          projection_digest: digest
        },
        sql: `
WITH tenant_context AS MATERIALIZED (
  SELECT set_config('app.tenant_id', :'tenant_id', true)
), inserted AS (
  INSERT INTO kaios_runtime.export_nonces (
    tenant_id, vertical, entitlement_id, nonce_digest, projection_digest
  )
  SELECT :'tenant_id', :'vertical', :'entitlement_id', :'nonce_digest', :'projection_digest'
  FROM tenant_context
  ON CONFLICT DO NOTHING
  RETURNING tenant_id, vertical, entitlement_id, nonce_digest, projection_digest
), audited AS (
  INSERT INTO kaios_runtime.export_audit (
    tenant_id, vertical, subject_id, entitlement_id, nonce_digest,
    projection_digest, decision, reason_code
  )
  SELECT i.tenant_id, i.vertical, 'operator', i.entitlement_id, i.nonce_digest,
         i.projection_digest, 'authorized', 'EXPORT_GRANTED'
  FROM inserted i
  RETURNING 1
)
SELECT count(*) FROM inserted;
`
      });
      if (result !== '1') fail('NONCE_REPLAY', 409);
      return true;
    }
  };

  return { projectionStore, exportControl };
}
