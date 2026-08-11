import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWikidataEntities } from '../scripts/lib/wikidata-source-native-client.mjs';

function response(ok, status, entities = {}) {
  return { ok, status, async json() { return { entities }; } };
}

test('batches unique valid QIDs and merges successful entity responses', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    const ids = new URL(url).searchParams.get('ids').split('|');
    return response(true, 200, Object.fromEntries(ids.map((id) => [id, { id }])));
  };
  const result = await fetchWikidataEntities(['Q1', 'Q2', 'Q1', 'bad'], { fetchImpl, endpoint: 'https://example.test/api', batchSize: 1, timeoutMs: 1000, userAgent: 'test-agent' });
  assert.equal(result.requestCount, 2);
  assert.deepEqual(Object.keys(result.entities).sort(), ['Q1', 'Q2']);
  assert.equal(result.errors.length, 0);
  assert.match(calls[0].url, /action=wbgetentities/);
  assert.match(calls[0].url, /props=claims%7Clabels%7Cdescriptions/);
  assert.equal(calls[0].options.headers['user-agent'], 'test-agent');
});

test('records non-ok and thrown fetch failures without fabricating entities', async () => {
  let call = 0;
  const fetchImpl = async () => {
    call += 1;
    if (call === 1) return response(false, 503);
    throw new Error('network down');
  };
  const result = await fetchWikidataEntities(['Q1', 'Q2'], { fetchImpl, endpoint: 'https://example.test/api', batchSize: 1 });
  assert.equal(result.requestCount, 2);
  assert.deepEqual(result.entities, {});
  assert.equal(result.errors[0].error, 'HTTP_503');
  assert.equal(result.errors[1].error, 'network down');
});

test('empty or invalid identifiers produce zero requests', async () => {
  const result = await fetchWikidataEntities(null, { fetchImpl: async () => { throw new Error('must not run'); } });
  assert.equal(result.requestCount, 0);
  assert.deepEqual(result.entities, {});
  assert.deepEqual(result.errors, []);
});
