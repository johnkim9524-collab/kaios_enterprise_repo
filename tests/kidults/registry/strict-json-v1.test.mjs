import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRegistryJson} from '../../../scripts/kidults/registry/lib/strict-json-v1.mjs';

test('conflicting authority and creator declarations cannot silently override', () => {
  for (const source of ['{"created_by":"Atlas","created_by":"Other"}',
    '{"role":{"approved":false,"approved":true}}',
    '[{"production":"HOLD","production":"ALLOW"}]']) {
    assert.throws(() => parseRegistryJson(source), /REGISTRY_DUPLICATE_JSON_KEY/);
  }
});

test('escaped equivalent keys are still duplicate declarations', () => {
  assert.throws(() => parseRegistryJson(String.raw`{"role":1,"\u0072ole":2}`),
    /REGISTRY_DUPLICATE_JSON_KEY:role/);
});

test('separate nested scopes and punctuation in strings stay valid', () => {
  const source = String.raw`{"a":{"id":1},"b":[{"id":2},{"id":3}],"text":"{\"id\":4}:[]"}`;
  assert.deepEqual(parseRegistryJson(source), JSON.parse(source));
  for (const source of ['null', '[]', '{}', '"value"', '12', 'true']) {
    assert.deepEqual(parseRegistryJson(source), JSON.parse(source));
  }
});

test('malformed JSON is rejected before registry values are returned', () => {
  assert.throws(() => parseRegistryJson('{"id":1,}'), SyntaxError);
});
