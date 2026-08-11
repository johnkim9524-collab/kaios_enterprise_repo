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

test('source-native client preserves serial batching and filters duplicate/invalid QIDs', async () => {
  const calls = [];
  const result = await fetchWikidataEntities(['Q1', 'bad', 'Q1', 'Q2'], {
    endpoint: 'https://example.test/api',
    batchSize: 1,
    timeoutMs: 1000,
    userAgent: 'test-agent',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      const id = new URL(url).searchParams.get('ids');
      return response(200, { entities: { [id]: { id } } });
    },
    sleepImpl: async () => assert.fail('successful requests must not sleep'),
  });

  assert.deepEqual(Object.keys(result.entities), ['Q1', 'Q2']);
  assert.equal(result.errors.length, 0);
  assert.equal(result.requestCount, 2);
  assert.equal(result.retries, 0);
  assert.equal(result.rateLimits, 0);
  assert.equal(result.maxlagResponses, 0);
  assert.equal(result.accessPolicy.officialEndpoint, false);
  assert.equal(result.accessPolicy.serialRequests, true);
  assert.equal(result.accessPolicy.serverDrivenBackpressure, true);
  assert.equal(result.accessPolicy.maxRetries, 4);
  assert.equal(result.accessPolicy.maxlagSeconds, 5);
  assert.equal(result.accessPolicy.gzipRequested, true);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /action=wbgetentities/);
  assert.match(calls[0].url, /props=claims%7Clabels%7Cdescriptions/);
  assert.equal(new URL(calls[0].url).searchParams.get('maxlag'), '5');
  assert.equal(calls[0].options.headers['user-agent'], 'test-agent');
  assert.equal(calls[0].options.headers['accept-encoding'], 'gzip,deflate');
});

test('source-native client retries 429 using Retry-After then succeeds without dropping entities', async () => {
  let attempts = 0;
  const sleeps = [];
  const result = await fetchWikidataEntities(['Q42'], {
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) return response(429, { error: { code: 'ratelimited' } }, { 'retry-after': '2' });
      return response(200, { entities: { Q42: { id: 'Q42' } } });
    },
    sleepImpl: async (ms) => sleeps.push(ms),
  });

  assert.equal(result.entities.Q42.id, 'Q42');
  assert.equal(result.errors.length, 0);
  assert.equal(result.requestCount, 2);
  assert.equal(result.retries, 1);
  assert.equal(result.rateLimits, 1);
  assert.deepEqual(sleeps, [2000]);
});

test('source-native client honors HTTP-200 maxlag body and reported lag before retry', async () => {
  let attempts = 0;
  const sleeps = [];
  const result = await fetchWikidataEntities(['Q84'], {
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) return response(200, { error: { code: 'maxlag', lag: 1.25 } });
      return response(200, { entities: { Q84: { id: 'Q84' } } });
    },
    sleepImpl: async (ms) => sleeps.push(ms),
  });

  assert.equal(result.entities.Q84.id, 'Q84');
  assert.equal(result.errors.length, 0);
  assert.equal(result.maxlagResponses, 1);
  assert.equal(result.retries, 1);
  assert.deepEqual(sleeps, [1250]);
});

test('source-native client retries 5xx with exponential backoff and records terminal HTTP failures fail-closed', async () => {
  let attempts = 0;
  const sleeps = [];
  const recovered = await fetchWikidataEntities(['Q7'], {
    maxRetries: 1,
    baseBackoffMs: 100,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) return response(503, { error: { code: 'unavailable' } });
      return response(200, { entities: { Q7: { id: 'Q7' } } });
    },
    sleepImpl: async (ms) => sleeps.push(ms),
  });
  assert.equal(recovered.entities.Q7.id, 'Q7');
  assert.equal(recovered.retries, 1);
  assert.deepEqual(sleeps, [100]);

  const terminal = await fetchWikidataEntities(['Q8'], {
    maxRetries: 0,
    fetchImpl: async () => response(400, { error: { code: 'badrequest' } }),
    sleepImpl: async () => assert.fail('non-retryable failure must not sleep'),
  });
  assert.equal(terminal.entities.Q8, undefined);
  assert.deepEqual(terminal.errors, [{ ids: ['Q8'], error: 'HTTP_400' }]);
});

test('source-native client records terminal maxlag without fabricating entities', async () => {
  const result = await fetchWikidataEntities(['Q9'], {
    maxRetries: 0,
    fetchImpl: async () => response(200, { error: { code: 'maxlag', lag: 3 } }),
    sleepImpl: async () => assert.fail('terminal maxlag must not sleep'),
  });
  assert.equal(result.entities.Q9, undefined);
  assert.deepEqual(result.errors, [{ ids: ['Q9'], error: 'WIKIDATA_MAXLAG' }]);
  assert.equal(result.maxlagResponses, 1);
});

test('source-native client retries transient fetch exceptions and records exhausted transport failures', async () => {
  let attempts = 0;
  const sleeps = [];
  const recovered = await fetchWikidataEntities(['Q10'], {
    maxRetries: 1,
    baseBackoffMs: 100,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary transport failure');
      return response(200, { entities: { Q10: { id: 'Q10' } } });
    },
    sleepImpl: async (ms) => sleeps.push(ms),
  });
  assert.equal(recovered.entities.Q10.id, 'Q10');
  assert.equal(recovered.retries, 1);
  assert.deepEqual(sleeps, [100]);

  const exhausted = await fetchWikidataEntities(['Q11'], {
    maxRetries: 0,
    fetchImpl: async () => { throw new Error('permanent transport failure'); },
    sleepImpl: async () => assert.fail('terminal transport failure must not sleep'),
  });
  assert.deepEqual(exhausted.errors, [{ ids: ['Q11'], error: 'permanent transport failure' }]);
});

test('source-native client tolerates malformed JSON as empty successful payload and handles empty input without network access', async () => {
  const malformed = await fetchWikidataEntities(['Q12'], {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      async json() { throw new Error('bad json'); },
    }),
    sleepImpl: async () => assert.fail('successful HTTP response must not sleep'),
  });
  assert.deepEqual(malformed.entities, {});
  assert.deepEqual(malformed.errors, []);

  const empty = await fetchWikidataEntities(['bad', '', null], {
    fetchImpl: async () => assert.fail('empty valid QID set must not fetch'),
    sleepImpl: async () => assert.fail('empty valid QID set must not sleep'),
  });
  assert.deepEqual(empty.entities, {});
  assert.deepEqual(empty.errors, []);
  assert.equal(empty.requestCount, 0);
});
