import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  canaryRunnerEnvironment, canaryVerifierEnvironment,
} from './run-autonomous-postgres-canary-v1.mjs';

test('canary forwards the credential only to the runner child environment', () => {
  const runner = canaryRunnerEnvironment({ dsn: 'postgresql://private.example/test',
    confirmation: 'EPHEMERAL_NON_PRODUCTION_APPROVED' });
  const verifier = canaryVerifierEnvironment();
  assert.equal(runner.KIDULTS_EPHEMERAL_POSTGRES_DSN, 'postgresql://private.example/test');
  assert.equal(runner.KIDULTS_EPHEMERAL_POSTGRES_CONFIRM, 'EPHEMERAL_NON_PRODUCTION_APPROVED');
  assert.equal(Object.hasOwn(verifier, 'KIDULTS_EPHEMERAL_POSTGRES_DSN'), false);
  assert.equal(Object.hasOwn(verifier, 'KIDULTS_EPHEMERAL_POSTGRES_CONFIRM'), false);
  assert.deepEqual(Object.keys(verifier).sort(), ['LANG', 'PATH', 'TZ']);
});

test('canary refuses missing DSN or non-production confirmation', () => {
  assert.throws(() => canaryRunnerEnvironment({ dsn: '',
    confirmation: 'EPHEMERAL_NON_PRODUCTION_APPROVED' }), /POSTGRES_CANARY_DSN_REQUIRED/);
  assert.throws(() => canaryRunnerEnvironment({ dsn: 'postgresql://private.example/test',
    confirmation: 'yes' }), /POSTGRES_CANARY_CONFIRMATION_REQUIRED/);
});

test('canary source uses bounded sequential child processes and never puts DSN in argv', async () => {
  const source = await readFile(new URL('./run-autonomous-postgres-canary-v1.mjs', import.meta.url), 'utf8');
  assert.match(source, /timeout: 180000/);
  assert.match(source, /timeout: 30000/);
  assert.match(source, /credentialForwardedToVerifier: false/);
  assert.equal(source.includes("'--dbname'"), false);
  assert.equal(source.includes('console.log(dsn)'), false);
  assert(source.indexOf('const runner = spawnSync') < source.indexOf('const verifier = spawnSync'));
});

test('canary CLI fails closed before execution without required bindings', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(
    './run-autonomous-postgres-canary-v1.mjs', import.meta.url))], {
    encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC' },
  });
  assert.equal(result.status, 1);
  const failure = JSON.parse(result.stderr);
  assert.equal(failure.state, 'HOLD');
  assert.equal(failure.reason, 'POSTGRES_CANARY_ARGUMENTS_INVALID');
  assert.equal(failure.authorityGranted, false);
});
