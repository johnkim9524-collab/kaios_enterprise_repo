import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchWikidataEntities } from '../scripts/lib/wikidata-source-native-client.mjs';

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] ?? null;
      },
    },
    async json() {
      return body;
    },
  };
}

test('source-native client exercises the default global fetch path without external network access', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return response(200, { entities: { Q103: { id: 'Q103' } } });
  };

  try {
    const result = await fetchWikidataEntities(['Q103'], { maxRetries: 0 });
    assert.equal(result.entities.Q103.id, 'Q103');
    assert.equal(result.requestCount, 1);
    assert.equal(result.accessPolicy.officialEndpoint, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /^https:\/\/www\.wikidata\.org\/w\/api\.php\?/);
    assert.match(calls[0].options.headers['user-agent'], /^KIDULTS-Kidult100-Bot\/1\.1/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('source-native client keeps terminal 429 fail-closed when retry budget is zero', async () => {
  const result = await fetchWikidataEntities(['Q104'], {
    maxRetries: 0,
    fetchImpl: async () => response(429, { error: { code: 'ratelimited' } }, { 'retry-after': '0' }),
  });

  assert.deepEqual(result.entities, {});
  assert.deepEqual(result.errors, [{ ids: ['Q104'], error: 'HTTP_429' }]);
  assert.equal(result.requestCount, 1);
  assert.equal(result.retries, 0);
  assert.equal(result.rateLimits, 1);
});

test('source-native client falls back to bounded backoff when maxlag reports a non-positive lag', async () => {
  let attempts = 0;
  const sleeps = [];
  const result = await fetchWikidataEntities(['Q105'], {
    maxRetries: 1,
    baseBackoffMs: 17,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) return response(200, { error: { code: 'maxlag', lag: 0 } });
      return response(200, { entities: { Q105: { id: 'Q105' } } });
    },
    sleepImpl: async (ms) => sleeps.push(ms),
  });

  assert.equal(result.entities.Q105.id, 'Q105');
  assert.equal(result.maxlagResponses, 1);
  assert.equal(result.retries, 1);
  assert.deepEqual(sleeps, [17]);
});
