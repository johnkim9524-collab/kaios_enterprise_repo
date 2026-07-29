import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from './server.mjs';

async function withServer(vertical, run) {
  const server = createRuntime({ vertical, viewerToken: 'viewer', operatorToken: 'operator' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('kidults runtime enforces authentication and viewer export denial', async () => {
  await withServer('kidults', async (base) => {
    assert.equal((await fetch(`${base}/api/enterprise/snapshot`)).status, 401);
    assert.equal((await fetch(`${base}/api/enterprise/snapshot`, { headers: { authorization: 'Bearer viewer' } })).status, 200);
    assert.equal((await fetch(`${base}/api/enterprise/export`, { headers: { authorization: 'Bearer viewer' } })).status, 403);
    assert.equal((await fetch(`${base}/portal?viewport=320`, { headers: { authorization: 'Bearer viewer' } })).status, 200);
  });
});

test('artfund runtime exposes isolated institutional routes', async () => {
  await withServer('artfund', async (base) => {
    assert.equal((await fetch(`${base}/api/institutional/snapshot`)).status, 401);
    const response = await fetch(`${base}/api/institutional/snapshot`, { headers: { authorization: 'Bearer operator' } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).vertical, 'artfund');
    assert.equal((await fetch(`${base}/api/institutional/export`, { headers: { authorization: 'Bearer operator' } })).status, 200);
  });
});
