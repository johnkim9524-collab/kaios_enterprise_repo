import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'github-artifact-download-with-retry.sh');

function makeHarness(mode) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kidults-artifact-retry-'));
  const binDir = path.join(dir, 'bin');
  const counterPath = path.join(dir, 'counter.txt');
  const outputPath = path.join(dir, 'artifact.zip');
  const ghPath = path.join(binDir, 'gh');

  mkdirSync(binDir, { recursive: true });
  writeFileSync(counterPath, '0\n');
  writeFileSync(ghPath, `#!/usr/bin/env bash\nset -u\ncount=$(cat "$FAKE_GH_COUNTER")\ncount=$((count + 1))\necho "$count" > "$FAKE_GH_COUNTER"\ncase "$FAKE_GH_MODE" in\n  success) printf 'ZIPDATA' ;;\n  transient-then-success)\n    if [[ "$count" -lt 3 ]]; then echo 'No server available (HTTP 503)' >&2; exit 1; fi\n    printf 'ZIPDATA'\n    ;;\n  not-found) echo 'artifact missing (HTTP 404)' >&2; exit 1 ;;\n  always-503) echo 'temporary outage (HTTP 503)' >&2; exit 1 ;;\n  empty-success) exit 0 ;;\n  *) echo 'unexpected fake mode' >&2; exit 2 ;;\nesac\n`);
  chmodSync(ghPath, 0o755);

  return { dir, binDir, counterPath, outputPath, mode };
}

function runHarness(harness, maxAttempts = '3') {
  return spawnSync('bash', [SCRIPT, '/repos/example/repo/actions/artifacts/123/zip', harness.outputPath, maxAttempts], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${harness.binDir}:${process.env.PATH}`,
      FAKE_GH_COUNTER: harness.counterPath,
      FAKE_GH_MODE: harness.mode,
      KIDULTS_GH_ARTIFACT_RETRY_BASE_DELAY_SECONDS: '0',
    },
  });
}

function attempts(harness) {
  return Number(readFileSync(harness.counterPath, 'utf8').trim());
}

function assertNoPartialFiles(harness) {
  const leftovers = readdirSync(harness.dir).filter((name) => name.includes('.partial.') || name.includes('.error.'));
  assert.deepEqual(leftovers, []);
}

test('artifact helper succeeds immediately and atomically materializes output', () => {
  const harness = makeHarness('success');
  const result = runHarness(harness);
  assert.equal(result.status, 0);
  assert.equal(attempts(harness), 1);
  assert.equal(readFileSync(harness.outputPath, 'utf8'), 'ZIPDATA');
  assert.match(result.stderr, /PASS attempt=1\/3/);
  assertNoPartialFiles(harness);
});

test('artifact helper retries bounded transient HTTP 503 then succeeds', () => {
  const harness = makeHarness('transient-then-success');
  const result = runHarness(harness);
  assert.equal(result.status, 0);
  assert.equal(attempts(harness), 3);
  assert.equal(readFileSync(harness.outputPath, 'utf8'), 'ZIPDATA');
  assert.match(result.stderr, /transient failure attempt=1\/3 http=503/);
  assert.match(result.stderr, /PASS attempt=3\/3/);
  assertNoPartialFiles(harness);
});

test('artifact helper fails closed immediately for non-retryable HTTP 404', () => {
  const harness = makeHarness('not-found');
  const result = runHarness(harness);
  assert.notEqual(result.status, 0);
  assert.equal(attempts(harness), 1);
  assert.equal(existsSync(harness.outputPath), false);
  assert.match(result.stderr, /FAIL_CLOSED non-retryable HTTP 404/);
  assertNoPartialFiles(harness);
});

test('artifact helper fails closed after the configured transient retry budget', () => {
  const harness = makeHarness('always-503');
  const result = runHarness(harness, '2');
  assert.notEqual(result.status, 0);
  assert.equal(attempts(harness), 2);
  assert.equal(existsSync(harness.outputPath), false);
  assert.match(result.stderr, /FAIL_CLOSED after 2\/2 attempts/);
  assertNoPartialFiles(harness);
});

test('artifact helper treats an empty successful response as retryable transport failure', () => {
  const harness = makeHarness('empty-success');
  const result = runHarness(harness, '2');
  assert.notEqual(result.status, 0);
  assert.equal(attempts(harness), 2);
  assert.equal(existsSync(harness.outputPath), false);
  assert.match(result.stderr, /empty body/);
  assert.match(result.stderr, /FAIL_CLOSED after 2\/2 attempts/);
  assertNoPartialFiles(harness);
});

test('artifact helper rejects an invalid retry budget before invoking gh', () => {
  const harness = makeHarness('success');
  const result = runHarness(harness, '0');
  assert.equal(result.status, 64);
  assert.equal(attempts(harness), 0);
  assert.equal(existsSync(harness.outputPath), false);
  assert.match(result.stderr, /max-attempts must be a positive integer/);
  assertNoPartialFiles(harness);
});
