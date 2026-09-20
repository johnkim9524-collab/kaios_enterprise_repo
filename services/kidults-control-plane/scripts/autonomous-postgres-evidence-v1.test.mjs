import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildContainmentFenceFixture, buildEphemeralFixture,
  buildProtectedLaunchManifestConsumptionFixture, buildTrustRevocationRaceFixture,
  psqlEnvironment, validateEphemeralTarget,
} from './autonomous-postgres-evidence-v1.mjs';
import { digestObject } from '../src/common-control/canonical-v1.mjs';

const HEAD = 'a'.repeat(40);

test('ephemeral target requires exact non-production confirmation, safe name and empty schema', () => {
  assert.deepEqual(validateEphemeralTarget({ expectedSha: HEAD,
    confirmation: 'EPHEMERAL_NON_PRODUCTION_APPROVED',
    databaseName: 'kidults_ephemeral_runner_01', schemaPresent: false,
  }), { expectedSha: HEAD, databaseName: 'kidults_ephemeral_runner_01' });
  for (const input of [
    { expectedSha: 'bad', confirmation: 'EPHEMERAL_NON_PRODUCTION_APPROVED', databaseName: 'kidults_ephemeral_x', schemaPresent: false },
    { expectedSha: HEAD, confirmation: 'yes', databaseName: 'kidults_ephemeral_x', schemaPresent: false },
    { expectedSha: HEAD, confirmation: 'EPHEMERAL_NON_PRODUCTION_APPROVED', databaseName: 'production', schemaPresent: false },
    { expectedSha: HEAD, confirmation: 'EPHEMERAL_NON_PRODUCTION_APPROVED', databaseName: 'kidults_ephemeral_x', schemaPresent: true },
  ]) assert.throws(() => validateEphemeralTarget(input), /AUTONOMOUS_POSTGRES_/);
});

test('protected manifest fixture is exact-digest bound and keeps every protected gate held', () => {
  const value = buildProtectedLaunchManifestConsumptionFixture(HEAD);
  const unsigned = { ...value }; delete unsigned.manifestDigest;
  assert.equal(value.manifestDigest, digestObject(unsigned));
  assert.equal(value.sourceSha, HEAD);
  assert.equal(value.automaticTrigger, 'NOT_REGISTERED_HOLD');
  assert.equal(value.production, 'HOLD');
  assert.equal(value.publicRelease, 'HOLD');
  assert.equal(value.g5, 'HOLD');
});

test('fixture creates two divergent claims over one exact initial revision', () => {
  const fixture = buildEphemeralFixture(HEAD);
  assert.equal(fixture.initial.revision, 0);
  assert.equal(fixture.claims.length, 2);
  assert.equal(fixture.claims[0].task.revision, 1);
  assert.equal(fixture.claims[1].task.revision, 1);
  assert.equal(fixture.claims[0].receipt.beforeDigest, digestObject(fixture.initial));
  assert.equal(fixture.claims[1].receipt.beforeDigest, digestObject(fixture.initial));
  assert.notEqual(fixture.claims[0].receipt.afterDigest, fixture.claims[1].receipt.afterDigest);
  assert.equal(fixture.admissionProof.sourceRequest.taskId, fixture.initial.taskId);
  assert.equal(fixture.admissionProof.manifest.allowedMode, 'SHADOW_NO_FETCH');
});

test('trust race fixture chains an active head to a revocation tombstone', () => {
  const fixture = buildTrustRevocationRaceFixture();
  assert.equal(fixture.activeHead.revision, 1);
  assert.equal(fixture.activeHead.activeRegistryDigest, fixture.registryDigest);
  assert.equal(fixture.revokedHead.revision, 2);
  assert.equal(fixture.revokedHead.previousHeadDigest, fixture.activeHead.headDigest);
  assert.equal(fixture.revokedHead.activeRegistryId, null);
  assert.equal(fixture.revokedHead.activeRegistryDigest, null);
  assert.equal(fixture.consumption.trustRegistryDigest, fixture.registryDigest);
  assert.equal(fixture.consumption.activationAuthorized, false);
  const reverse = buildTrustRevocationRaceFixture({ scenario: 'consumption-first',
    startRevision: 3, previousHeadDigest: fixture.revokedHead.headDigest });
  assert.equal(reverse.activeHead.revision, 3);
  assert.equal(reverse.activeHead.previousHeadDigest, fixture.revokedHead.headDigest);
  assert.equal(reverse.revokedHead.revision, 4);
  assert.notEqual(reverse.consumption.envelopeId, fixture.consumption.envelopeId);
});

test('containment fixture chains STOP to RELEASE without opening protected gates', () => {
  const value = buildContainmentFenceFixture();
  assert.equal(value.stop.state, 'APPROVED_CONTAINMENT_FENCE_ACTIVE');
  assert.equal(value.stop.allowInvocation, false);
  assert.equal(value.release.state, 'APPROVED_CONTAINMENT_RELEASED');
  assert.equal(value.release.allowInvocation, true);
  assert.equal(value.release.previousFenceDigest, value.stop.fenceDigest);
  assert.equal(value.release.sourceEvidenceDigest, value.stop.fenceDigest);
  for (const fence of [value.stop, value.release]) {
    assert.equal(fence.automaticActionTaken, false);
    assert.equal(fence.mutationAllowed, false);
    assert.equal(fence.production, 'HOLD');
    assert.equal(fence.publicRelease, 'HOLD');
    assert.equal(fence.g5, 'HOLD');
  }
});

test('runner source never prints or persists the DSN value', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./autonomous-postgres-evidence-v1.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('console.log(dsn)'), false);
  assert.equal(source.includes('writeFileSync(path.join(output, \'dsn'), false);
  assert.equal(source.includes("'--dbname'"), false);
  assert.match(source, /PGHOST: parsed\.hostname/);
  assert.match(source, /credentialMaterialRetained: false/);
  assert.match(source, /runtimeRunnerDatabaseExecution: false/);
  assert.match(source, /setTimeout\(\(\) => child\.kill\('SIGKILL'\), 30000\)/);
});

test('psql environment decomposes the DSN instead of treating it as a local database name', () => {
  const env = psqlEnvironment('postgresql://runner:p%40ss@db.example.test:25060/kidults_ephemeral_test?sslmode=require');
  assert.equal(env.PGHOST, 'db.example.test');
  assert.equal(env.PGPORT, '25060');
  assert.equal(env.PGDATABASE, 'kidults_ephemeral_test');
  assert.equal(env.PGUSER, 'runner');
  assert.equal(env.PGPASSWORD, 'p@ss');
  assert.equal(env.PGSSLMODE, 'require');
  assert.equal(Object.values(env).includes('postgresql://runner:p%40ss@db.example.test:25060/kidults_ephemeral_test?sslmode=require'), false);
  for (const dsn of ['not-a-url', 'https://db.example.test/name', 'postgresql://db.example.test']) {
    assert.throws(() => psqlEnvironment(dsn), /AUTONOMOUS_POSTGRES_DSN_INVALID/);
  }
});

test('CLI without an approved DSN fails closed before writing a receipt', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'kidults-autonomous-postgres-hold-'));
  try {
    await chmod(output, 0o700);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./autonomous-postgres-evidence-v1.mjs', import.meta.url)),
      '--expected-sha', HEAD, '--output-dir', output], {
      encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC' },
    });
    assert.equal(result.status, 1);
    const receipt = JSON.parse(result.stderr);
    assert.equal(receipt.state, 'HOLD');
    assert.equal(receipt.reason, 'AUTONOMOUS_POSTGRES_DSN_REQUIRED');
    assert.equal(receipt.credentialMaterialRetained, false);
  } finally { await rm(output, { recursive: true, force: true }); }
});
