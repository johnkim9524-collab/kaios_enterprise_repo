import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {getCommonCrawlIndexResponse as get} from '../../../scripts/kidults/source-intelligence/common-crawl-index-http-v1.mjs';

async function serve(t, handler) {
  let calls = 0;
  const server = http.createServer((req, res) => handler(req, res, ++calls));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {server.closeAllConnections(); server.close();});
  return {url: `http://127.0.0.1:${server.address().port}/metadata`, calls: () => calls};
}
const deadline = /COMMON_CRAWL_READ_DEADLINE_EXCEEDED/;
for (const prefix of ['', '{"partial":']) {
  test(`real 200 headers then body stall is bounded (${prefix.length} bytes)`, async t => {
    const s = await serve(t, (_, res) => {res.writeHead(200); res.flushHeaders(); if (prefix) res.write(prefix);});
    const start = performance.now();
    await assert.rejects(get(s.url, {timeoutMs: 120}), deadline);
    assert.ok(performance.now() - start < 1500);
    assert.equal(s.calls(), 1);
  });
}
test('real stalled headers and abort-ignoring transport both respect deadline', async t => {
  const s = await serve(t, () => {});
  await assert.rejects(get(s.url, {timeoutMs: 100}), deadline);
  assert.equal(s.calls(), 1);
  let calls = 0;
  await assert.rejects(get(s.url, {timeoutMs: 40, fetchImpl: () => {calls++; return new Promise(() => {});}}), deadline);
  assert.equal(calls, 1);
});
for (const declared of [false, true]) {
  test(`real oversized ${declared ? 'declared' : 'chunked'} body is rejected without retry`, async t => {
    const s = await serve(t, (_, res) => {
      res.writeHead(200, declared ? {'Content-Length': '1025'} : {});
      res.write(Buffer.alloc(1025));
    });
    await assert.rejects(get(s.url, {timeoutMs: 400, maxBytes: 1024}), /COMMON_CRAWL_BODY_TOO_LARGE/);
    assert.equal(s.calls(), 1);
  });
}
test('decoded stream byte count defeats small declared compressed length', async () => {
  let calls = 0;
  const fetchImpl = async () => {calls++; return new Response('éé', {headers: {'Content-Length': '1'}});};
  await assert.rejects(get('https://index.commoncrawl.org/test', {fetchImpl, maxBytes: 3}), /BODY_TOO_LARGE/);
  assert.equal(calls, 1);
});
for (const status of [429, 503]) {
  test(`real ${status} stalled body is cancelled and only existing bounded retries occur`, async t => {
    const s = await serve(t, (_, res, calls) => {
      res.writeHead(calls < 3 ? status : 200);
      if (calls < 3) res.flushHeaders(); else res.end('{"ok":true}');
    });
    const start = performance.now();
    const result = await get(s.url, {timeoutMs: 400, retryDelayMs: 1});
    assert.deepEqual(await result.json(), {ok: true});
    assert.equal(s.calls(), 3);
    assert.ok(performance.now() - start < 1500);
  });
}
test('retry cleanup cannot hang when cancel never settles', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls === 3) return new Response('ok');
    return new Response(new ReadableStream({cancel: () => new Promise(() => {})}), {status: 503});
  };
  assert.equal(await (await get('https://index.commoncrawl.org/test', {fetchImpl, timeoutMs: 100, retryDelayMs: 0})).text(), 'ok');
  assert.equal(calls, 3);
});
test('real permanent HTTP failure is not retried', async t => {
  const s = await serve(t, (_, res) => {res.writeHead(404); res.end();});
  await assert.rejects(get(s.url), /HTTP_404/);
  assert.equal(s.calls(), 1);
});
test('retry exhaustion preserves exact final HTTP failure', async () => {
  let calls = 0;
  const fetchImpl = async () => {calls++; return new Response('', {status: 429});};
  await assert.rejects(get('https://index.commoncrawl.org/test', {fetchImpl, retryDelayMs: 0}), /HTTP_429/);
  assert.equal(calls, 3);
});
test('normal JSON and NDJSON survive exact byte boundary; parse failure does not retry', async t => {
  const payload = '{"url":"é"}\n{"url":"b"}\n';
  const s = await serve(t, (_, res) => res.end(payload));
  const result = await get(s.url, {maxBytes: Buffer.byteLength(payload)});
  assert.equal(await result.text(), payload);
  await assert.rejects(result.json(), SyntaxError);
  assert.equal(s.calls(), 1);
  const json = await get(s.url, {fetchImpl: async () => new Response('{"ok":true}')});
  assert.deepEqual(await json.json(), {ok: true});
});
test('body stream failure is retained and not retried', async () => {
  let calls = 0;
  const fetchImpl = async () => {calls++; return new Response(new ReadableStream({start(c) {c.error(new Error('stream-test'));}}));};
  await assert.rejects(get('https://index.commoncrawl.org/test', {fetchImpl}), /stream-test/);
  assert.equal(calls, 1);
});
test('actual expansion CLI consumes bounded catalog and host bodies without rights promotion', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-body-cli-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const input = path.join(dir, 'discovery.json'), output = path.join(dir, 'expansion.json');
  const mock = path.join(dir, 'fetch.mjs');
  fs.writeFileSync(input, JSON.stringify({id: 'kidults-asi-global-low-risk-discovery-v1',
    primary_target: 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE', production: 'HOLD', public_release: 'HOLD',
    acquisition_authorized: false, content_acquired: false, candidate_count: 1,
    candidates: [{endpoint_url: 'https://example.org'}]}));
  fs.writeFileSync(mock, `globalThis.fetch = async url => {
    if (String(url) === 'https://index.commoncrawl.org/collinfo.json')
      return new Response(JSON.stringify([{id:'CC-TEST', 'cdx-api':'https://index.commoncrawl.org/CC-TEST-index'}]));
    const u = new URL(url);
    if (u.origin !== 'https://index.commoncrawl.org' || u.searchParams.get('url') !== 'example.org')
      throw new Error('UNEXPECTED_PROVIDER_REQUEST');
    return new Response(JSON.stringify({url:'https://sub.example.org/item',status:'200',urlkey:'fixture'})+'\\n');
  };`);
  const env = {...process.env, ASI_COMMON_CRAWL_FRONTIER_OUT: path.join(dir, 'frontier.json'),
    ASI_COMMON_CRAWL_PREVIOUS_EXPANSION: ''};
  const result = spawnSync(process.execPath, ['--import', mock,
    'scripts/kidults/source-intelligence/asi-common-crawl-host-expansion-v1.mjs', input, output],
    {env, encoding: 'utf8', timeout: 3000});
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(value.common_crawl_index_id, 'CC-TEST');
  assert.equal(value.candidates.length, 1);
  assert.equal(value.candidates[0].rights_state, 'UNASSESSED');
  assert.equal(value.candidates[0].admission_state, 'NOT_ADMITTED');
  assert.equal(value.target_site_body_crawled, false);
  assert.equal(value.acquisition_authorized, false);
});
for (const options of [{timeoutMs: 15001}, {maxBytes: 1048577}, {retryDelayMs: 701}]) {
  test(`budget cannot expand ${JSON.stringify(options)}`, async () => {
    let calls = 0;
    await assert.rejects(get('https://index.commoncrawl.org/test', {...options, fetchImpl: () => {calls++;}}), /READ_BUDGET_INVALID/);
    assert.equal(calls, 0);
  });
}
