import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRuntime } from './server.mjs';
import { createFileRuntimeSecurity, digestProjection } from './runtime-security.mjs';

async function createFixture(vertical = 'kidults') {
  const root = await mkdtemp(path.join(tmpdir(), 'kaios-runtime-security-'));
  const verticalDir = path.join(root, vertical);
  await mkdir(verticalDir, { recursive: true });
  const projection = {
    vertical,
    server_owned_value: `${vertical}-server-owned`,
    publication_enabled: false
  };
  const digest = digestProjection(projection);
  await writeFile(path.join(verticalDir, 'projection.json'), JSON.stringify({
    projection,
    projection_digest: digest,
    as_of: '2026-08-27T00:00:00.000Z'
  }));
  await writeFile(path.join(verticalDir, 'entitlements.json'), JSON.stringify({
    entitlements: [
      {
        id: 'ent-active',
        subject: 'operator',
        vertical,
        scopes: ['EXPORT'],
        status: 'active',
        projection_digest: digest,
        expires_at: '2099-01-01T00:00:00.000Z'
      },
      {
        id: 'ent-revoked',
        subject: 'operator',
        vertical,
        scopes: ['EXPORT'],
        status: 'active',
        revoked_at: '2026-08-27T00:00:00.000Z',
        projection_digest: digest,
        expires_at: '2099-01-01T00:00:00.000Z'
      },
      {
        id: 'ent-expired',
        subject: 'operator',
        vertical,
        scopes: ['EXPORT'],
        status: 'active',
        projection_digest: digest,
        expires_at: '2020-01-01T00:00:00.000Z'
      }
    ]
  }));
  return {
    root,
    projection,
    digest,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

async function withServer(config, run) {
  const server = createRuntime({
    vertical: 'kidults',
    viewerToken: 'viewer',
    operatorToken: 'operator',
    ...config
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function exportHeaders({
  token = 'operator',
  entitlementId = 'ent-active',
  nonce,
  digest
}) {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-kaios-entitlement-id': entitlementId,
    'x-kaios-nonce': nonce,
    'x-kaios-projection-digest': digest
  };
}

test('runtime fails closed when the server-owned projection runtime is not injected', async () => {
  await withServer({}, async (base) => {
    const snapshot = await fetch(`${base}/api/enterprise/snapshot`, {
      headers: { authorization: 'Bearer viewer' }
    });
    assert.equal(snapshot.status, 503);
    assert.deepEqual(await snapshot.json(), {
      ok: false,
      error: 'PROJECTION_RUNTIME_NOT_CONFIGURED'
    });

    const exportResponse = await fetch(`${base}/api/enterprise/export`, {
      method: 'POST',
      headers: exportHeaders({
        nonce: 'nonce-runtime-missing-0000001',
        digest: '0'.repeat(64)
      })
    });
    assert.equal(exportResponse.status, 503);
    assert.equal((await exportResponse.json()).error, 'EXPORT_RUNTIME_NOT_CONFIGURED');
  });
});

test('snapshot is loaded only from the server-owned projection store', async () => {
  const fixture = await createFixture();
  try {
    await withServer(createFileRuntimeSecurity({ dataDir: fixture.root }), async (base) => {
      assert.equal((await fetch(`${base}/api/enterprise/snapshot`)).status, 401);
      const response = await fetch(`${base}/api/enterprise/snapshot`, {
        headers: { authorization: 'Bearer viewer' }
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.projection_digest, fixture.digest);
      assert.deepEqual(body.snapshot, fixture.projection);
      assert.equal(body.snapshot.client_supplied_value, undefined);
    });
  } finally {
    await fixture.cleanup();
  }
});

test('export requires POST, operator role and all control headers', async () => {
  const fixture = await createFixture();
  try {
    await withServer(createFileRuntimeSecurity({ dataDir: fixture.root }), async (base) => {
      const getResponse = await fetch(`${base}/api/enterprise/export`, {
        headers: { authorization: 'Bearer operator' }
      });
      assert.equal(getResponse.status, 405);
      assert.equal(getResponse.headers.get('allow'), 'POST');

      const viewerResponse = await fetch(`${base}/api/enterprise/export`, {
        method: 'POST',
        headers: exportHeaders({
          token: 'viewer',
          nonce: 'nonce-viewer-denied-00000001',
          digest: fixture.digest
        })
      });
      assert.equal(viewerResponse.status, 403);

      const missingHeaders = await fetch(`${base}/api/enterprise/export`, {
        method: 'POST',
        headers: { authorization: 'Bearer operator' }
      });
      assert.equal(missingHeaders.status, 400);
      assert.equal((await missingHeaders.json()).error, 'EXPORT_CONTROL_HEADERS_REQUIRED');
    });
  } finally {
    await fixture.cleanup();
  }
});

test('active entitlement returns the server projection and ignores a client payload', async () => {
  const fixture = await createFixture();
  try {
    await withServer(createFileRuntimeSecurity({ dataDir: fixture.root }), async (base) => {
      const response = await fetch(`${base}/api/enterprise/export`, {
        method: 'POST',
        headers: exportHeaders({
          nonce: 'nonce-active-success-00000001',
          digest: fixture.digest
        }),
        body: JSON.stringify({
          projection: { client_supplied_value: 'must-not-escape' }
        })
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.snapshot, fixture.projection);
      assert.equal(body.snapshot.client_supplied_value, undefined);
      assert.equal(JSON.stringify(body).includes('must-not-escape'), false);
    });
  } finally {
    await fixture.cleanup();
  }
});

test('revoked and expired entitlements fail without projection leakage', async () => {
  const fixture = await createFixture();
  try {
    await withServer(createFileRuntimeSecurity({ dataDir: fixture.root }), async (base) => {
      for (const [entitlementId, nonce] of [
        ['ent-revoked', 'nonce-revoked-denied-0000001'],
        ['ent-expired', 'nonce-expired-denied-0000001']
      ]) {
        const response = await fetch(`${base}/api/enterprise/export`, {
          method: 'POST',
          headers: exportHeaders({ entitlementId, nonce, digest: fixture.digest })
        });
        assert.equal(response.status, 403);
        const raw = await response.text();
        assert.equal(raw.includes('server-owned'), false);
        assert.equal(JSON.parse(raw).error, 'EXPORT_NOT_AUTHORIZED');
      }
    });
  } finally {
    await fixture.cleanup();
  }
});

test('digest mismatch fails before nonce consumption', async () => {
  const fixture = await createFixture();
  const nonce = 'nonce-digest-retry-000000001';
  try {
    await withServer(createFileRuntimeSecurity({ dataDir: fixture.root }), async (base) => {
      const mismatch = await fetch(`${base}/api/enterprise/export`, {
        method: 'POST',
        headers: exportHeaders({ nonce, digest: 'f'.repeat(64) })
      });
      assert.equal(mismatch.status, 409);
      assert.equal((await mismatch.json()).error, 'PROJECTION_DIGEST_MISMATCH');

      const corrected = await fetch(`${base}/api/enterprise/export`, {
        method: 'POST',
        headers: exportHeaders({ nonce, digest: fixture.digest })
      });
      assert.equal(corrected.status, 200);
    });
  } finally {
    await fixture.cleanup();
  }
});

test('nonce replay is blocked and remains blocked across a runtime restart', async () => {
  const fixture = await createFixture();
  const nonce = 'nonce-persistent-replay-000001';
  try {
    await withServer(createFileRuntimeSecurity({ dataDir: fixture.root }), async (base) => {
      const first = await fetch(`${base}/api/enterprise/export`, {
        method: 'POST',
        headers: exportHeaders({ nonce, digest: fixture.digest })
      });
      assert.equal(first.status, 200);
    });

    await withServer(createFileRuntimeSecurity({ dataDir: fixture.root }), async (base) => {
      const replay = await fetch(`${base}/api/enterprise/export`, {
        method: 'POST',
        headers: exportHeaders({ nonce, digest: fixture.digest })
      });
      assert.equal(replay.status, 409);
      const raw = await replay.text();
      assert.equal(raw.includes('server-owned'), false);
      assert.equal(JSON.parse(raw).error, 'NONCE_REPLAY');
    });
  } finally {
    await fixture.cleanup();
  }
});

test('artfund runtime keeps institutional routes isolated', async () => {
  const fixture = await createFixture('artfund');
  const dependencies = createFileRuntimeSecurity({ dataDir: fixture.root });
  try {
    await withServer({ vertical: 'artfund', ...dependencies }, async (base) => {
      assert.equal((await fetch(`${base}/api/enterprise/snapshot`, {
        headers: { authorization: 'Bearer viewer' }
      })).status, 404);
      const response = await fetch(`${base}/api/institutional/snapshot`, {
        headers: { authorization: 'Bearer viewer' }
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).vertical, 'artfund');
    });
  } finally {
    await fixture.cleanup();
  }
});
