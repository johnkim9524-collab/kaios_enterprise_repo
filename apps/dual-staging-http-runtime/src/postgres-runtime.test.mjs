import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPostgresCliRuntime } from './postgres-runtime.mjs';
import { digestProjection } from './runtime-security.mjs';

function errorCode(error) {
  return error?.code || error?.message;
}

test('PostgreSQL projection adapter uses bound variables and verifies stored digest', async () => {
  const projection = { source: 'postgres', approved: true };
  const digest = digestProjection(projection);
  const calls = [];
  const runtime = createPostgresCliRuntime({
    tenantId: 'tenant-a',
    executor: async (call) => {
      calls.push(call);
      return JSON.stringify({ projection, digest, asOf: '2026-08-27T00:00:00.000Z' });
    }
  });

  const snapshot = await runtime.projectionStore.getSnapshot({ vertical: 'kidults' });
  assert.deepEqual(snapshot.projection, projection);
  assert.equal(snapshot.digest, digest);
  assert.equal(calls[0].variables.tenant_id, 'tenant-a');
  assert.equal(calls[0].variables.vertical, 'kidults');
  assert.equal(calls[0].sql.includes('tenant-a'), false);
  assert.equal(calls[0].sql.includes('kidults'), false);
});

test('PostgreSQL projection adapter fails closed on a stored digest mismatch', async () => {
  const runtime = createPostgresCliRuntime({
    tenantId: 'tenant-a',
    executor: async () => JSON.stringify({
      projection: { approved: true },
      digest: 'f'.repeat(64),
      asOf: null
    })
  });
  await assert.rejects(
    runtime.projectionStore.getSnapshot({ vertical: 'kidults' }),
    (error) => errorCode(error) === 'PROJECTION_DIGEST_INVALID'
  );
});

test('PostgreSQL entitlement adapter returns only active bounded grants', async () => {
  const calls = [];
  const runtime = createPostgresCliRuntime({
    tenantId: 'tenant-a',
    executor: async (call) => {
      calls.push(call);
      return JSON.stringify({
        entitlementId: 'ent-active',
        expectedDigest: 'a'.repeat(64)
      });
    }
  });
  const result = await runtime.exportControl.authorize({
    vertical: 'kidults',
    subject: 'operator',
    entitlementId: 'ent-active',
    scope: 'EXPORT'
  });
  assert.equal(result.entitlement.id, 'ent-active');
  assert.equal(result.expectedDigest, 'a'.repeat(64));
  assert.deepEqual(calls[0].variables, {
    tenant_id: 'tenant-a',
    vertical: 'kidults',
    subject_id: 'operator',
    entitlement_id: 'ent-active',
    scope: 'EXPORT'
  });
  assert.match(calls[0].sql, /revoked_at IS NULL/);
  assert.match(calls[0].sql, /expires_at > clock_timestamp\(\)/);
});

test('PostgreSQL entitlement adapter denies an empty result without leaking details', async () => {
  const runtime = createPostgresCliRuntime({
    tenantId: 'tenant-a',
    executor: async () => ''
  });
  await assert.rejects(
    runtime.exportControl.authorize({
      vertical: 'kidults',
      subject: 'operator',
      entitlementId: 'ent-missing',
      scope: 'EXPORT'
    }),
    (error) => errorCode(error) === 'EXPORT_NOT_AUTHORIZED' && error.status === 403
  );
});

test('PostgreSQL nonce adapter hashes the nonce and treats zero inserts as replay', async () => {
  const nonce = 'nonce-postgres-persistent-0001';
  const expectedNonceDigest = createHash('sha256').update(nonce).digest('hex');
  const calls = [];
  let first = true;
  const runtime = createPostgresCliRuntime({
    tenantId: 'tenant-a',
    executor: async (call) => {
      calls.push(call);
      if (first) {
        first = false;
        return '1';
      }
      return '0';
    }
  });

  await runtime.exportControl.consumeNonce({
    vertical: 'kidults',
    entitlementId: 'ent-active',
    nonce,
    digest: 'a'.repeat(64)
  });
  assert.equal(calls[0].variables.nonce_digest, expectedNonceDigest);
  assert.match(calls[0].sql, /ON CONFLICT DO NOTHING/);
  assert.match(calls[0].sql, /kaios_runtime\.export_audit/);

  await assert.rejects(
    runtime.exportControl.consumeNonce({
      vertical: 'kidults',
      entitlementId: 'ent-active',
      nonce,
      digest: 'a'.repeat(64)
    }),
    (error) => errorCode(error) === 'NONCE_REPLAY' && error.status === 409
  );
});

test('PostgreSQL adapter rejects identifier injection before executing SQL', async () => {
  let executed = false;
  const runtime = createPostgresCliRuntime({
    tenantId: 'tenant-a',
    executor: async () => {
      executed = true;
      return '';
    }
  });
  await assert.rejects(
    runtime.projectionStore.getSnapshot({ vertical: "kidults'; DROP SCHEMA public;--" }),
    (error) => errorCode(error) === 'VERTICAL_INVALID'
  );
  assert.equal(executed, false);
});
