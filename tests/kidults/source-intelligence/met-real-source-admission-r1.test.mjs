import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('scripts/kidults/source-intelligence/run-met-real-source-admission-r1.mjs','utf8');

test('uses the Met paginated v1.1 search endpoint after v1 retirement',()=>{
  assert.match(source,/https:\/\/collectionapi\.metmuseum\.org\/public\/collection\/v1\.1\/search\?/);
  assert.match(source,/offset=0&limit=60/);
  assert.doesNotMatch(source,/collection\/v1\/search\?/);
});

test('binds the selected endpoint into the admission artifact',()=>{
  assert.match(source,/search_endpoint:\s*SEARCH_URL/);
});
