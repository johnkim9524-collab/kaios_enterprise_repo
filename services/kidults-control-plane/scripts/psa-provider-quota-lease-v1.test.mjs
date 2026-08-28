import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createPsaProviderQuotaLease,
  PsaProviderQuotaLeaseError,
} from '../src/psa-provider-quota-lease.mjs';

const QUOTA_DIRECTORY = 'psa-provider-quota-v1';
const STATE_PATH = root => join(root, QUOTA_DIRECTORY, 'state.json');
const LOCK_PATH = root => join(root, QUOTA_DIRECTORY, 'reservation.lock');
const LOCK_OWNER_PATH = root => join(LOCK_PATH(root), 'owner.json');
const syntheticReference = value => `hmac-sha256:v1:${createHash('sha256').update(`synthetic/${value}`).digest('hex')}`;

async function privateRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-quota-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function forbiddenRepositoryRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'kidults-repository-root-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function reservation(index, overrides = {}) {
  return {
    runId: 'logical-run-alpha',
    dispatchId: 'dispatch-alpha',
    attemptId: `attempt-${index}`,
    idempotencyKey: `dispatch-alpha-attempt-${index}`,
    requestReferenceDigest: syntheticReference(index),
    ...overrides,
  };
}

function fixedLease(root, forbiddenRoot, overrides = {}) {
  return createPsaProviderQuotaLease({
    privateRoot: root,
    forbiddenRoot,
    approvedDailyBudget: 5,
    perRunCap: 3,
    clock: () => new Date('2026-08-28T12:00:00.000Z'),
    ...overrides,
  });
}

async function writeLockOwner(root, overrides = {}) {
  await mkdir(LOCK_PATH(root), { mode: 0o700 });
  const owner = {
    schema_version: '1.0.0',
    provider_id: 'psa-public-api',
    token: 'a'.repeat(64),
    pid: 2_147_483_647,
    hostname: hostname(),
    acquired_at: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
  await writeFile(LOCK_OWNER_PATH(root), `${JSON.stringify(owner)}\n`, { mode: 0o600, flag: 'wx' });
}

function runQuotaWorker({ moduleUrl, root, forbiddenRoot, index }) {
  const worker = `
    import { createPsaProviderQuotaLease } from ${JSON.stringify(moduleUrl)};
    const root = process.argv[1];
    const forbiddenRoot = process.argv[2];
    const index = process.argv[3];
    const reference = ${JSON.stringify(syntheticReference('race'))};
    const lease = createPsaProviderQuotaLease({
      privateRoot: root,
      forbiddenRoot,
      approvedDailyBudget: 6,
      perRunCap: 6,
      lockTimeoutMs: 15000,
    });
    try {
      await lease.reserveAttempt({
        runId: 'race-logical-run',
        dispatchId: 'race-dispatch',
        attemptId: 'race-attempt-' + index,
        idempotencyKey: 'race-idempotency-' + index,
        requestReferenceDigest: reference,
      });
      process.stdout.write(JSON.stringify({ decision: 'RESERVED' }));
    } catch (error) {
      if (error?.code === 'PSA_QUOTA_DAILY_BUDGET_EXHAUSTED') {
        process.stdout.write(JSON.stringify({ decision: 'DENIED_DAILY_BUDGET' }));
      } else {
        process.stderr.write(JSON.stringify({ code: error?.code, message: error?.message, details: error?.details }));
        process.exitCode = 2;
      }
    }
  `;
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [
      '--input-type=module', '--eval', worker, root, forbiddenRoot, String(index),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', rejectPromise);
    child.on('close', code => {
      if (code !== 0) {
        rejectPromise(new Error(`QUOTA_WORKER_FAILED:${code}:${stderr}`));
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout));
      } catch {
        rejectPromise(new Error(`QUOTA_WORKER_OUTPUT_INVALID:${stdout}:${stderr}`));
      }
    });
  });
}

test('quota reservation persists a digest-only receipt and secure 0700/0600 state', async t => {
  const root = await privateRoot(t);
  const forbiddenRoot = await forbiddenRepositoryRoot(t);
  const lease = fixedLease(root, forbiddenRoot);
  const input = reservation(1);
  const receipt = await lease.reserveAttempt(input);

  assert.equal(receipt.decision, 'RESERVED_NEW');
  assert.equal(receipt.daily_reserved_attempt_count, 1);
  assert.equal(receipt.run_reserved_attempt_count, 1);
  assert.equal(receipt.daily_remaining_attempt_count, 4);
  assert.equal(receipt.run_remaining_attempt_count, 2);
  assert.equal(receipt.raw_cert_in_receipt, false);
  assert.match(receipt.reservation_id_digest, /^hmac-sha256:v1:[0-9a-f]{64}$/);
  assert.match(receipt.state_digest, /^sha256:[0-9a-f]{64}$/);

  const serializedReceipt = JSON.stringify(receipt);
  const serializedState = await readFile(STATE_PATH(root), 'utf8');
  for (const rawIdentifier of [input.runId, input.dispatchId, input.attemptId, input.idempotencyKey]) {
    assert.equal(serializedReceipt.includes(rawIdentifier), false);
    assert.equal(serializedState.includes(rawIdentifier), false);
  }
  assert.equal((await stat(root)).mode & 0o777, 0o700);
  assert.equal((await stat(join(root, QUOTA_DIRECTORY))).mode & 0o777, 0o700);
  assert.equal((await stat(STATE_PATH(root))).mode & 0o777, 0o600);
});

test('duplicate dispatch/idempotency replay does not consume a second provider attempt', async t => {
  const root = await privateRoot(t);
  const forbiddenRoot = await forbiddenRepositoryRoot(t);
  const lease = fixedLease(root, forbiddenRoot);
  const input = reservation(1);
  const first = await lease.reserveAttempt(input);
  const replay = await lease.reserveAttempt(input);

  assert.equal(first.decision, 'RESERVED_NEW');
  assert.equal(replay.decision, 'RESERVED_IDEMPOTENT');
  assert.equal(replay.reservation_id_digest, first.reservation_id_digest);
  assert.equal(replay.daily_reserved_attempt_count, 1);
  assert.equal(replay.run_reserved_attempt_count, 1);

  let replayProviderCalls = 0;
  await assert.rejects(
    () => lease.executeAttempt(input, async () => { replayProviderCalls += 1; }),
    error => error.code === 'PSA_QUOTA_PROVIDER_EXECUTION_REPLAY_BLOCKED'
      && error.details.decision === 'RESERVED_IDEMPOTENT',
  );
  assert.equal(replayProviderCalls, 0);

  await assert.rejects(
    () => lease.reserveAttempt({ ...input, idempotencyKey: 'replacement-idempotency-key' }),
    error => error instanceof PsaProviderQuotaLeaseError
      && error.code === 'PSA_QUOTA_IDEMPOTENCY_CONFLICT'
      && !JSON.stringify(error.details).includes('replacement-idempotency-key'),
  );
  await assert.rejects(
    () => lease.reserveAttempt({ ...input, attemptId: 'attempt-conflict' }),
    error => error instanceof PsaProviderQuotaLeaseError
      && error.code === 'PSA_QUOTA_IDEMPOTENCY_CONFLICT'
      && !JSON.stringify(error.details).includes('attempt-conflict'),
  );
  const state = JSON.parse(await readFile(STATE_PATH(root), 'utf8'));
  assert.equal(state.consumed_attempt_count, 1);
  assert.equal(Object.keys(state.reservations).length, 1);
});

test('provider failures still consume attempts; retry, per-run cap, and daily budget fail closed', async t => {
  const root = await privateRoot(t);
  const forbiddenRoot = await forbiddenRepositoryRoot(t);
  const lease = fixedLease(root, forbiddenRoot, { approvedDailyBudget: 3, perRunCap: 2 });
  let providerCalls = 0;

  await assert.rejects(
    () => lease.executeAttempt(reservation(1), async () => {
      providerCalls += 1;
      throw new Error('SYNTHETIC_PROVIDER_FAILURE');
    }),
    /SYNTHETIC_PROVIDER_FAILURE/,
  );
  const retry = await lease.executeAttempt(reservation(2), async ({ quotaReceipt }) => {
    providerCalls += 1;
    assert.equal(quotaReceipt.daily_ordinal, 2);
    return { synthetic: true };
  });
  assert.deepEqual(retry.provider_result, { synthetic: true });
  assert.equal(providerCalls, 2);

  await assert.rejects(
    () => lease.reserveAttempt(reservation(3)),
    error => error.code === 'PSA_QUOTA_PER_RUN_CAP_EXHAUSTED'
      && error.details.decision === 'DENIED_PER_RUN_CAP_EXHAUSTED'
      && error.details.run_reserved_attempt_count === 2,
  );

  await lease.reserveAttempt(reservation(1, {
    runId: 'logical-run-beta',
    dispatchId: 'dispatch-beta',
    attemptId: 'beta-attempt-1',
    idempotencyKey: 'dispatch-beta-attempt-1',
  }));
  await assert.rejects(
    () => lease.reserveAttempt(reservation(2, {
      runId: 'logical-run-beta',
      dispatchId: 'dispatch-beta',
      attemptId: 'beta-attempt-2',
      idempotencyKey: 'dispatch-beta-attempt-2',
    })),
    error => error.code === 'PSA_QUOTA_DAILY_BUDGET_EXHAUSTED'
      && error.details.decision === 'DENIED_DAILY_BUDGET_EXHAUSTED'
      && error.details.daily_reserved_attempt_count === 3
      && error.details.daily_remaining_attempt_count === 0,
  );
});

test('UTC rollover archives the prior counter, resets once, and rejects clock rollback', async t => {
  const root = await privateRoot(t);
  const forbiddenRoot = await forbiddenRepositoryRoot(t);
  let currentTime = new Date('2026-08-28T23:59:59.000Z');
  const lease = fixedLease(root, forbiddenRoot, {
    approvedDailyBudget: 2,
    perRunCap: 2,
    clock: () => new Date(currentTime),
  });
  const input = reservation(1);
  await lease.reserveAttempt(input);

  currentTime = new Date('2026-08-29T00:00:01.000Z');
  const nextDay = await lease.reserveAttempt(input);
  assert.equal(nextDay.decision, 'RESERVED_NEW');
  assert.equal(nextDay.quota_day_utc, '2026-08-29');
  assert.equal(nextDay.daily_reserved_attempt_count, 1);

  const archivePath = join(root, QUOTA_DIRECTORY, 'state-2026-08-28.json');
  const archive = JSON.parse(await readFile(archivePath, 'utf8'));
  const current = JSON.parse(await readFile(STATE_PATH(root), 'utf8'));
  assert.equal(archive.quota_day_utc, '2026-08-28');
  assert.equal(archive.consumed_attempt_count, 1);
  assert.equal(current.quota_day_utc, '2026-08-29');
  assert.equal(current.consumed_attempt_count, 1);
  assert.equal((await stat(archivePath)).mode & 0o777, 0o600);

  currentTime = new Date('2026-08-28T23:59:59.500Z');
  await assert.rejects(
    () => lease.reserveAttempt(reservation(2)),
    error => error.code === 'PSA_QUOTA_CLOCK_ROLLBACK_DETECTED',
  );
});

test('corrupt state and insecure state permissions fail closed without resetting the counter', async t => {
  const forbiddenRoot = await forbiddenRepositoryRoot(t);
  const corruptRoot = await privateRoot(t);
  const corruptLease = fixedLease(corruptRoot, forbiddenRoot);
  await corruptLease.reserveAttempt(reservation(1));
  const corrupted = JSON.parse(await readFile(STATE_PATH(corruptRoot), 'utf8'));
  corrupted.consumed_attempt_count = 0;
  await writeFile(STATE_PATH(corruptRoot), `${JSON.stringify(corrupted)}\n`);

  await assert.rejects(
    () => corruptLease.reserveAttempt(reservation(2)),
    error => error.code === 'PSA_QUOTA_STATE_CORRUPT'
      && error.details.cause_code === 'PSA_QUOTA_STATE_SEQUENCE_COUNT_MISMATCH',
  );

  const insecureRoot = await privateRoot(t);
  const insecureLease = fixedLease(insecureRoot, forbiddenRoot);
  await insecureLease.reserveAttempt(reservation(1));
  await chmod(STATE_PATH(insecureRoot), 0o644);
  await assert.rejects(
    () => insecureLease.reserveAttempt(reservation(2)),
    error => error.code === 'PSA_QUOTA_STATE_CORRUPT'
      && error.details.cause_code === 'PSA_QUOTA_SECURE_FILE_MODE_INVALID',
  );
});

test('corrupt locks fail closed; stale locks recover only after same-host dead-owner proof', async t => {
  const forbiddenRoot = await forbiddenRepositoryRoot(t);
  const corruptRoot = await privateRoot(t);
  const corruptLease = fixedLease(corruptRoot, forbiddenRoot);
  await corruptLease.reserveAttempt(reservation(1));
  await mkdir(LOCK_PATH(corruptRoot), { mode: 0o700 });
  await writeFile(LOCK_OWNER_PATH(corruptRoot), '{}\n', { mode: 0o600, flag: 'wx' });
  await assert.rejects(
    () => corruptLease.reserveAttempt(reservation(2)),
    error => error.code === 'PSA_QUOTA_LOCK_CORRUPT',
  );

  const recoverableRoot = await privateRoot(t);
  const recoverableLease = fixedLease(recoverableRoot, forbiddenRoot, { staleLockMs: 1 });
  await recoverableLease.reserveAttempt(reservation(1));
  await writeLockOwner(recoverableRoot);
  const recovered = await recoverableLease.reserveAttempt(reservation(2));
  assert.equal(recovered.daily_reserved_attempt_count, 2);
  const lockEntries = await readdir(join(recoverableRoot, QUOTA_DIRECTORY));
  assert(lockEntries.includes(`reservation.lock.stale-${'a'.repeat(64)}`));

  const activeRoot = await privateRoot(t);
  const activeLease = fixedLease(activeRoot, forbiddenRoot, { staleLockMs: 1 });
  await activeLease.reserveAttempt(reservation(1));
  await writeLockOwner(activeRoot, { token: 'b'.repeat(64), pid: process.pid });
  await assert.rejects(
    () => activeLease.reserveAttempt(reservation(2)),
    error => error.code === 'PSA_QUOTA_LOCK_ACTIVE_STALE',
  );
});

test('cross-process racing reservations atomically enforce one shared daily budget', async t => {
  const root = await privateRoot(t);
  const forbiddenRoot = await forbiddenRepositoryRoot(t);
  const moduleUrl = new URL('../src/psa-provider-quota-lease.mjs', import.meta.url).href;
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, index) => runQuotaWorker({ moduleUrl, root, forbiddenRoot, index })),
  );
  assert.equal(results.filter(result => result.decision === 'RESERVED').length, 6);
  assert.equal(results.filter(result => result.decision === 'DENIED_DAILY_BUDGET').length, 4);

  const state = JSON.parse(await readFile(STATE_PATH(root), 'utf8'));
  assert.equal(state.consumed_attempt_count, 6);
  assert.equal(state.state_sequence, 6);
  assert.equal(Object.keys(state.reservations).length, 6);
  assert.deepEqual(Object.values(state.run_attempt_counts), [6]);
});

test('private quota root rejects repository overlap and symlink resolution before state creation', async t => {
  const forbiddenRoot = await forbiddenRepositoryRoot(t);
  const overlappingPrivateRoot = join(forbiddenRoot, 'private-quota');
  const overlappingLease = fixedLease(overlappingPrivateRoot, forbiddenRoot);
  await assert.rejects(
    () => overlappingLease.reserveAttempt(reservation(1)),
    error => error.code === 'PSA_QUOTA_PRIVATE_ROOT_OVERLAP_FORBIDDEN',
  );
  await assert.rejects(
    () => stat(overlappingPrivateRoot),
    error => error.code === 'ENOENT',
  );

  const broadPrivateRoot = await privateRoot(t);
  const nestedForbiddenRoot = join(broadPrivateRoot, 'repository');
  await mkdir(nestedForbiddenRoot, { mode: 0o700 });
  const broadLease = fixedLease(broadPrivateRoot, nestedForbiddenRoot);
  await assert.rejects(
    () => broadLease.reserveAttempt(reservation(1)),
    error => error.code === 'PSA_QUOTA_PRIVATE_ROOT_OVERLAP_FORBIDDEN',
  );
  await assert.rejects(
    () => stat(join(broadPrivateRoot, QUOTA_DIRECTORY)),
    error => error.code === 'ENOENT',
  );

  const safeTarget = await privateRoot(t);
  const linkContainer = await privateRoot(t);
  const linkedPrivateRoot = join(linkContainer, 'linked-private');
  await symlink(safeTarget, linkedPrivateRoot, 'dir');
  const symlinkLease = fixedLease(linkedPrivateRoot, forbiddenRoot);
  await assert.rejects(
    () => symlinkLease.reserveAttempt(reservation(1)),
    error => error.code === 'PSA_QUOTA_PRIVATE_DIRECTORY_SYMLINK_FORBIDDEN',
  );
  await assert.rejects(
    () => stat(join(safeTarget, QUOTA_DIRECTORY)),
    error => error.code === 'ENOENT',
  );
});

test('configuration rejects an unbounded per-run cap before touching private state', async t => {
  const root = await privateRoot(t);
  const forbiddenRoot = await forbiddenRepositoryRoot(t);
  assert.throws(
    () => createPsaProviderQuotaLease({ privateRoot: root, approvedDailyBudget: 5, perRunCap: 5 }),
    error => error.code === 'PSA_QUOTA_FORBIDDEN_ROOT_REQUIRED',
  );
  assert.throws(
    () => createPsaProviderQuotaLease({
      privateRoot: root, forbiddenRoot, approvedDailyBudget: 5, perRunCap: 6,
    }),
    error => error.code === 'PSA_QUOTA_PER_RUN_CAP_EXCEEDS_DAILY_BUDGET',
  );
  await assert.rejects(
    () => stat(join(root, QUOTA_DIRECTORY)),
    error => error.code === 'ENOENT',
  );

  const unkeyedRoot = await privateRoot(t);
  const unkeyedLease = fixedLease(unkeyedRoot, forbiddenRoot);
  await assert.rejects(
    () => unkeyedLease.reserveAttempt({
      ...reservation(1),
      requestReferenceDigest: `sha256:${'a'.repeat(64)}`,
    }),
    error => error.code === 'PSA_QUOTA_REQUEST_REFERENCE_DIGEST_INVALID',
  );
  await assert.rejects(
    () => stat(join(unkeyedRoot, QUOTA_DIRECTORY)),
    error => error.code === 'ENOENT',
  );
});
