import { constants as fsConstants } from 'node:fs';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { basename, dirname, resolve, sep } from 'node:path';
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rmdir,
  unlink,
} from 'node:fs/promises';

const PROVIDER_ID = 'psa-public-api';
const STATE_SCHEMA_VERSION = '1.0.0';
const LOCK_SCHEMA_VERSION = '1.0.0';
const QUOTA_DIRECTORY_NAME = 'psa-provider-quota-v1';
const STATE_FILENAME = 'state.json';
const LOCK_DIRECTORY_NAME = 'reservation.lock';
const LOCK_OWNER_FILENAME = 'owner.json';
const MAX_STATE_BYTES = 2 * 1024 * 1024;
const MAX_IDENTIFIER_LENGTH = 256;
const UTC_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const KEYED_DIGEST_PATTERN = /^hmac-sha256:v1:[0-9a-f]{64}$/;
const REQUEST_REFERENCE_PATTERN = /^hmac-sha256:v1:[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const ALLOWED_STATE_KEYS = [
  'schema_version',
  'provider_id',
  'quota_day_utc',
  'approved_daily_budget',
  'per_run_cap',
  'policy_digest',
  'digest_key_b64',
  'consumed_attempt_count',
  'run_attempt_counts',
  'reservations',
  'state_sequence',
  'created_at',
  'updated_at',
];
const ALLOWED_RESERVATION_KEYS = [
  'idempotency_key_digest',
  'run_id_digest',
  'dispatch_id_digest',
  'attempt_id_digest',
  'request_reference_digest',
  'daily_ordinal',
  'run_ordinal',
  'reserved_at',
];
const ALLOWED_LOCK_OWNER_KEYS = [
  'schema_version',
  'provider_id',
  'token',
  'pid',
  'hostname',
  'acquired_at',
];

const sleep = milliseconds => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortDeep(value[key])]));
  }
  return value;
}

function serialize(value) {
  return `${JSON.stringify(sortDeep(value), null, 2)}\n`;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
}

function keyedDigest(key, domain, value) {
  return `hmac-sha256:v1:${createHmac('sha256', key)
    .update(`kidults.psa.quota.v1\0${domain}\0${String(value)}`)
    .digest('hex')}`;
}

function modeBits(stat) {
  return stat.mode & 0o777;
}

function sameKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isValidDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function utcDay(date) {
  return date.toISOString().slice(0, 10);
}

function parseUtcDay(value) {
  if (!UTC_DAY_PATTERN.test(String(value || ''))) return Number.NaN;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : Number.NaN;
}

function validatePositiveInteger(value, code) {
  if (!Number.isSafeInteger(value) || value < 1) throw new PsaProviderQuotaLeaseError(code);
  return value;
}

function validateNonNegativeInteger(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) throw new PsaProviderQuotaLeaseError(code);
  return value;
}

function validateIdentifier(value, code) {
  if (typeof value !== 'string' || value.length > MAX_IDENTIFIER_LENGTH || !IDENTIFIER_PATTERN.test(value)) {
    throw new PsaProviderQuotaLeaseError(code);
  }
  return value;
}

function validateRequestReferenceDigest(value) {
  if (!REQUEST_REFERENCE_PATTERN.test(String(value || ''))) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_REQUEST_REFERENCE_DIGEST_INVALID');
  }
  return value;
}

function policyDigest({ approvedDailyBudget, perRunCap }) {
  return sha256(canonical({
    provider_id: PROVIDER_ID,
    approved_daily_budget: approvedDailyBudget,
    per_run_cap: perRunCap,
  }));
}

function assertOwnedByCurrentUser(stat, code) {
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw new PsaProviderQuotaLeaseError(code);
  }
}

async function ensureSecureDirectory(path, { create = true } = {}) {
  if (create) await mkdir(path, { recursive: true, mode: 0o700 });
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new PsaProviderQuotaLeaseError('PSA_QUOTA_PRIVATE_DIRECTORY_MISSING');
    throw error;
  }
  if (metadata.isSymbolicLink()) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_PRIVATE_DIRECTORY_SYMLINK_FORBIDDEN');
  }
  if (!metadata.isDirectory()) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_PRIVATE_DIRECTORY_INVALID');
  }
  if (modeBits(metadata) !== 0o700) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_PRIVATE_DIRECTORY_MODE_INVALID');
  }
  assertOwnedByCurrentUser(metadata, 'PSA_QUOTA_PRIVATE_DIRECTORY_OWNER_INVALID');
  const resolvedPath = resolve(path);
  const realPath = await realpath(path);
  if (resolvedPath !== realPath) throw new PsaProviderQuotaLeaseError('PSA_QUOTA_PRIVATE_DIRECTORY_SYMLINK_FORBIDDEN');
  return realPath;
}

async function prospectiveRealPath(path) {
  let cursor = resolve(path);
  const missingSegments = [];
  for (;;) {
    try {
      const existingRealPath = await realpath(cursor);
      return resolve(existingRealPath, ...missingSegments.reverse());
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw new PsaProviderQuotaLeaseError('PSA_QUOTA_PRIVATE_ROOT_RESOLUTION_FAILED');
      missingSegments.push(basename(cursor));
      cursor = parent;
    }
  }
}

function pathsOverlap(left, right) {
  return left === right || left.startsWith(`${right}${sep}`) || right.startsWith(`${left}${sep}`);
}

async function assertPrivateRootBoundary(privateRoot, forbiddenRoot) {
  let forbiddenRealPath;
  try {
    forbiddenRealPath = await realpath(forbiddenRoot);
    const forbiddenMetadata = await lstat(forbiddenRealPath);
    if (!forbiddenMetadata.isDirectory()) throw new PsaProviderQuotaLeaseError('PSA_QUOTA_FORBIDDEN_ROOT_INVALID');
  } catch (error) {
    if (error instanceof PsaProviderQuotaLeaseError) throw error;
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_FORBIDDEN_ROOT_INVALID');
  }
  const prospectivePrivateRoot = await prospectiveRealPath(privateRoot);
  if (prospectivePrivateRoot !== resolve(privateRoot)) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_PRIVATE_DIRECTORY_SYMLINK_FORBIDDEN');
  }
  if (pathsOverlap(prospectivePrivateRoot, forbiddenRealPath)) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_PRIVATE_ROOT_OVERLAP_FORBIDDEN');
  }
  return forbiddenRealPath;
}

async function readSecureFile(path, { missingAllowed = false, maxBytes = MAX_STATE_BYTES } = {}) {
  let before;
  try {
    before = await lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT' && missingAllowed) return null;
    if (error?.code === 'ENOENT') throw new PsaProviderQuotaLeaseError('PSA_QUOTA_SECURE_FILE_MISSING');
    throw error;
  }
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_SECURE_FILE_TYPE_INVALID');
  }
  if (modeBits(before) !== 0o600) throw new PsaProviderQuotaLeaseError('PSA_QUOTA_SECURE_FILE_MODE_INVALID');
  assertOwnedByCurrentUser(before, 'PSA_QUOTA_SECURE_FILE_OWNER_INVALID');
  if (before.size > maxBytes) throw new PsaProviderQuotaLeaseError('PSA_QUOTA_SECURE_FILE_TOO_LARGE');

  const noFollow = fsConstants.O_NOFOLLOW ?? 0;
  let file;
  try {
    try {
      file = await open(path, fsConstants.O_RDONLY | noFollow);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new PsaProviderQuotaLeaseError('PSA_QUOTA_SECURE_FILE_CHANGED_DURING_OPEN');
      }
      throw error;
    }
    const after = await file.stat();
    if (!after.isFile() || after.nlink !== 1 || after.dev !== before.dev || after.ino !== before.ino) {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_SECURE_FILE_CHANGED_DURING_OPEN');
    }
    if (modeBits(after) !== 0o600 || after.size > maxBytes) {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_SECURE_FILE_METADATA_INVALID');
    }
    return await file.readFile('utf8');
  } finally {
    await file?.close();
  }
}

async function readSecureJson(path, options) {
  const text = await readSecureFile(path, options);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_SECURE_JSON_INVALID');
  }
}

async function syncDirectory(path) {
  const directoryFlag = fsConstants.O_DIRECTORY ?? 0;
  const directory = await open(path, fsConstants.O_RDONLY | directoryFlag);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function writeExclusiveSecureFile(path, contents) {
  const noFollow = fsConstants.O_NOFOLLOW ?? 0;
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollow;
  const file = await open(path, flags, 0o600);
  try {
    await file.writeFile(contents, 'utf8');
    await file.sync();
    const metadata = await file.stat();
    if (modeBits(metadata) !== 0o600 || !metadata.isFile() || metadata.nlink !== 1) {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_SECURE_FILE_CREATE_INVALID');
    }
  } finally {
    await file.close();
  }
}

async function atomicReplaceJson(path, value) {
  const parent = dirname(path);
  const temporary = resolve(parent, `.state-${process.pid}-${randomBytes(12).toString('hex')}.tmp`);
  let created = false;
  try {
    await writeExclusiveSecureFile(temporary, serialize(value));
    created = true;
    await rename(temporary, path);
    created = false;
    await syncDirectory(parent);
  } finally {
    if (created) await unlink(temporary).catch(() => {});
  }
}

async function createImmutableJson(path, value) {
  try {
    await writeExclusiveSecureFile(path, serialize(value));
    await syncDirectory(dirname(path));
    return;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  const existing = await readSecureJson(path);
  if (canonical(existing) !== canonical(value)) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_ARCHIVE_CONFLICT');
  }
}

function validateDigestKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return null;
  const key = Buffer.from(value, 'base64');
  return key.length === 32 && key.toString('base64') === value ? key : null;
}

function validateState(state) {
  if (!sameKeys(state, ALLOWED_STATE_KEYS)) throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_SHAPE_INVALID');
  if (state.schema_version !== STATE_SCHEMA_VERSION || state.provider_id !== PROVIDER_ID) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_IDENTITY_INVALID');
  }
  const dayTimestamp = parseUtcDay(state.quota_day_utc);
  if (Number.isNaN(dayTimestamp)) throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_DAY_INVALID');
  validatePositiveInteger(state.approved_daily_budget, 'PSA_QUOTA_STATE_DAILY_BUDGET_INVALID');
  validatePositiveInteger(state.per_run_cap, 'PSA_QUOTA_STATE_PER_RUN_CAP_INVALID');
  if (state.per_run_cap > state.approved_daily_budget) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_PER_RUN_CAP_EXCEEDS_DAILY_BUDGET');
  }
  if (!SHA256_PATTERN.test(String(state.policy_digest || ''))) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_POLICY_DIGEST_INVALID');
  }
  if (state.policy_digest !== policyDigest({
    approvedDailyBudget: state.approved_daily_budget,
    perRunCap: state.per_run_cap,
  })) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_POLICY_BINDING_INVALID');
  }
  const digestKey = validateDigestKey(state.digest_key_b64);
  if (!digestKey) throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_DIGEST_KEY_INVALID');
  validateNonNegativeInteger(state.consumed_attempt_count, 'PSA_QUOTA_STATE_COUNT_INVALID');
  validateNonNegativeInteger(state.state_sequence, 'PSA_QUOTA_STATE_SEQUENCE_INVALID');
  if (state.state_sequence !== state.consumed_attempt_count) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_SEQUENCE_COUNT_MISMATCH');
  }
  if (state.consumed_attempt_count > state.approved_daily_budget) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_BUDGET_EXCEEDED');
  }
  if (!state.run_attempt_counts || typeof state.run_attempt_counts !== 'object' || Array.isArray(state.run_attempt_counts)) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_RUN_COUNTS_INVALID');
  }
  if (!state.reservations || typeof state.reservations !== 'object' || Array.isArray(state.reservations)) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_RESERVATIONS_INVALID');
  }
  if (!isValidDate(state.created_at) || !isValidDate(state.updated_at) || Date.parse(state.updated_at) < Date.parse(state.created_at)) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_TIMESTAMPS_INVALID');
  }
  if (utcDay(new Date(state.created_at)) !== state.quota_day_utc || utcDay(new Date(state.updated_at)) !== state.quota_day_utc) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_TIMESTAMP_DAY_MISMATCH');
  }

  const reservations = Object.entries(state.reservations);
  if (reservations.length !== state.consumed_attempt_count) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_RESERVATION_COUNT_MISMATCH');
  }
  const derivedRunCounts = new Map();
  const dailyOrdinals = new Set();
  let latestReservationTimestamp = Number.NEGATIVE_INFINITY;
  for (const [reservationDigest, reservation] of reservations) {
    if (!KEYED_DIGEST_PATTERN.test(reservationDigest) || !sameKeys(reservation, ALLOWED_RESERVATION_KEYS)) {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_RESERVATION_SHAPE_INVALID');
    }
    if (!KEYED_DIGEST_PATTERN.test(String(reservation.run_id_digest || ''))
      || !KEYED_DIGEST_PATTERN.test(String(reservation.idempotency_key_digest || ''))
      || !KEYED_DIGEST_PATTERN.test(String(reservation.dispatch_id_digest || ''))
      || !KEYED_DIGEST_PATTERN.test(String(reservation.attempt_id_digest || ''))
      || !REQUEST_REFERENCE_PATTERN.test(String(reservation.request_reference_digest || ''))) {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_RESERVATION_DIGEST_INVALID');
    }
    validatePositiveInteger(reservation.daily_ordinal, 'PSA_QUOTA_STATE_DAILY_ORDINAL_INVALID');
    validatePositiveInteger(reservation.run_ordinal, 'PSA_QUOTA_STATE_RUN_ORDINAL_INVALID');
    if (reservation.daily_ordinal > state.consumed_attempt_count || reservation.run_ordinal > state.per_run_cap) {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_RESERVATION_ORDINAL_BOUNDS_INVALID');
    }
    if (dailyOrdinals.has(reservation.daily_ordinal)) {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_DAILY_ORDINAL_DUPLICATE');
    }
    dailyOrdinals.add(reservation.daily_ordinal);
    if (!isValidDate(reservation.reserved_at) || utcDay(new Date(reservation.reserved_at)) !== state.quota_day_utc) {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_RESERVATION_TIMESTAMP_INVALID');
    }
    const reservedAt = Date.parse(reservation.reserved_at);
    if (reservedAt < Date.parse(state.created_at) || reservedAt > Date.parse(state.updated_at)) {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_RESERVATION_TIMESTAMP_BOUNDS_INVALID');
    }
    latestReservationTimestamp = Math.max(latestReservationTimestamp, reservedAt);
    const expectedRunOrdinal = (derivedRunCounts.get(reservation.run_id_digest) || 0) + 1;
    derivedRunCounts.set(reservation.run_id_digest, expectedRunOrdinal);
  }
  for (let ordinal = 1; ordinal <= state.consumed_attempt_count; ordinal += 1) {
    if (!dailyOrdinals.has(ordinal)) throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_DAILY_ORDINAL_GAP');
  }
  if (reservations.length > 0 && latestReservationTimestamp !== Date.parse(state.updated_at)) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_LATEST_RESERVATION_MISMATCH');
  }

  const runCountEntries = Object.entries(state.run_attempt_counts);
  if (runCountEntries.length !== derivedRunCounts.size) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_RUN_COUNT_CARDINALITY_MISMATCH');
  }
  for (const [runDigest, count] of runCountEntries) {
    if (!KEYED_DIGEST_PATTERN.test(runDigest)) throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_RUN_DIGEST_INVALID');
    validatePositiveInteger(count, 'PSA_QUOTA_STATE_RUN_COUNT_INVALID');
    if (count > state.per_run_cap || derivedRunCounts.get(runDigest) !== count) {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_RUN_COUNT_MISMATCH');
    }
    const runOrdinals = reservations
      .map(([, reservation]) => reservation)
      .filter(reservation => reservation.run_id_digest === runDigest)
      .map(reservation => reservation.run_ordinal)
      .sort((left, right) => left - right);
    if (runOrdinals.some((ordinal, index) => ordinal !== index + 1)) {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_RUN_ORDINAL_GAP');
    }
  }
  return { digestKey, dayTimestamp };
}

function createState({ approvedDailyBudget, perRunCap, day, now }) {
  const state = {
    schema_version: STATE_SCHEMA_VERSION,
    provider_id: PROVIDER_ID,
    quota_day_utc: day,
    approved_daily_budget: approvedDailyBudget,
    per_run_cap: perRunCap,
    policy_digest: policyDigest({ approvedDailyBudget, perRunCap }),
    digest_key_b64: randomBytes(32).toString('base64'),
    consumed_attempt_count: 0,
    run_attempt_counts: {},
    reservations: {},
    state_sequence: 0,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  validateState(state);
  return state;
}

function validateLockOwner(owner) {
  if (!sameKeys(owner, ALLOWED_LOCK_OWNER_KEYS)
    || owner.schema_version !== LOCK_SCHEMA_VERSION
    || owner.provider_id !== PROVIDER_ID
    || !/^[0-9a-f]{64}$/.test(String(owner.token || ''))
    || !Number.isSafeInteger(owner.pid)
    || owner.pid < 1
    || typeof owner.hostname !== 'string'
    || owner.hostname.length < 1
    || owner.hostname.length > 255
    || !isValidDate(owner.acquired_at)) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_LOCK_OWNER_INVALID');
  }
  return owner;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    if (error?.code === 'EPERM') return true;
    return null;
  }
}

async function inspectExistingLock(paths, options, now) {
  let directoryMetadata;
  try {
    directoryMetadata = await lstat(paths.lockDirectory);
  } catch (error) {
    if (error?.code === 'ENOENT') return 'RETRY';
    throw error;
  }
  if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory() || modeBits(directoryMetadata) !== 0o700) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_LOCK_DIRECTORY_INVALID');
  }
  assertOwnedByCurrentUser(directoryMetadata, 'PSA_QUOTA_LOCK_DIRECTORY_OWNER_INVALID');

  let owner;
  try {
    owner = validateLockOwner(await readSecureJson(paths.lockOwner));
  } catch (error) {
    if (error?.code === 'PSA_QUOTA_SECURE_FILE_MISSING'
      || error?.code === 'PSA_QUOTA_SECURE_FILE_CHANGED_DURING_OPEN') {
      let currentDirectoryMetadata;
      try {
        currentDirectoryMetadata = await lstat(paths.lockDirectory);
      } catch (directoryError) {
        if (directoryError?.code === 'ENOENT') return 'RETRY';
        throw directoryError;
      }
      const initializationAge = now.valueOf() - currentDirectoryMetadata.mtimeMs;
      if (initializationAge >= -options.clockSkewToleranceMs
        && initializationAge <= options.ownerInitializationGraceMs) return 'BUSY';
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_LOCK_OWNER_MISSING');
    }
    if (error instanceof PsaProviderQuotaLeaseError) {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_LOCK_CORRUPT', { cause_code: error.code });
    }
    throw error;
  }

  const age = now.valueOf() - Date.parse(owner.acquired_at);
  if (age < -options.clockSkewToleranceMs) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_LOCK_TIME_INVALID');
  }
  if (age <= options.staleLockMs) return 'BUSY';
  if (owner.hostname !== hostname()) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_LOCK_STALE_OWNER_UNVERIFIABLE');
  }
  const alive = processIsAlive(owner.pid);
  if (alive === true) throw new PsaProviderQuotaLeaseError('PSA_QUOTA_LOCK_ACTIVE_STALE');
  if (alive === null) throw new PsaProviderQuotaLeaseError('PSA_QUOTA_LOCK_STALE_OWNER_UNVERIFIABLE');

  const quarantine = resolve(paths.quotaDirectory, `reservation.lock.stale-${owner.token}`);
  try {
    await rename(paths.lockDirectory, quarantine);
    await syncDirectory(paths.quotaDirectory);
    return 'RECOVERED';
  } catch (error) {
    if (error?.code === 'ENOENT') return 'RETRY';
    if (error?.code === 'EEXIST' || error?.code === 'ENOTEMPTY') {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_LOCK_STALE_QUARANTINE_CONFLICT');
    }
    throw error;
  }
}

async function acquireLock(paths, options, clock) {
  const deadline = Date.now() + options.lockTimeoutMs;
  for (;;) {
    const token = randomBytes(32).toString('hex');
    try {
      await mkdir(paths.lockDirectory, { mode: 0o700 });
      const owner = {
        schema_version: LOCK_SCHEMA_VERSION,
        provider_id: PROVIDER_ID,
        token,
        pid: process.pid,
        hostname: hostname(),
        acquired_at: clock().toISOString(),
      };
      const temporaryOwner = resolve(paths.lockDirectory, `.owner-${token}.tmp`);
      await writeExclusiveSecureFile(temporaryOwner, serialize(owner));
      await rename(temporaryOwner, paths.lockOwner);
      await syncDirectory(paths.lockDirectory);
      return owner;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }

    const lockState = await inspectExistingLock(paths, options, clock());
    if (lockState === 'RECOVERED' || lockState === 'RETRY') continue;
    if (Date.now() >= deadline) throw new PsaProviderQuotaLeaseError('PSA_QUOTA_LOCK_BUSY');
    const jitter = Math.floor(Math.random() * Math.max(1, options.lockPollMs));
    await sleep(options.lockPollMs + jitter);
  }
}

async function releaseLock(paths, owner) {
  let current;
  try {
    current = validateLockOwner(await readSecureJson(paths.lockOwner));
  } catch (error) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_LOCK_RELEASE_OWNER_INVALID', {
      cause_code: error instanceof PsaProviderQuotaLeaseError ? error.code : 'UNKNOWN',
    });
  }
  if (current.token !== owner.token || current.pid !== process.pid || current.hostname !== hostname()) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_LOCK_RELEASE_OWNERSHIP_MISMATCH');
  }
  await unlink(paths.lockOwner);
  try {
    await rmdir(paths.lockDirectory);
  } catch (error) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_LOCK_RELEASE_DIRECTORY_NOT_EMPTY', {
      cause_code: error?.code || 'UNKNOWN',
    });
  }
  await syncDirectory(paths.quotaDirectory);
}

function buildPaths(privateRoot) {
  const root = resolve(privateRoot);
  return {
    privateRoot: root,
    quotaDirectory: resolve(root, QUOTA_DIRECTORY_NAME),
    state: resolve(root, QUOTA_DIRECTORY_NAME, STATE_FILENAME),
    lockDirectory: resolve(root, QUOTA_DIRECTORY_NAME, LOCK_DIRECTORY_NAME),
    lockOwner: resolve(root, QUOTA_DIRECTORY_NAME, LOCK_DIRECTORY_NAME, LOCK_OWNER_FILENAME),
  };
}

async function preparePaths(privateRoot, forbiddenRoot) {
  const paths = buildPaths(privateRoot);
  const forbiddenRealPath = await assertPrivateRootBoundary(paths.privateRoot, forbiddenRoot);
  await ensureSecureDirectory(paths.privateRoot);
  const privateRealPath = await realpath(paths.privateRoot);
  if (pathsOverlap(privateRealPath, forbiddenRealPath)) {
    throw new PsaProviderQuotaLeaseError('PSA_QUOTA_PRIVATE_ROOT_OVERLAP_FORBIDDEN');
  }
  await ensureSecureDirectory(paths.quotaDirectory);
  return paths;
}

function reservationDigests(state, input) {
  const key = Buffer.from(state.digest_key_b64, 'base64');
  return {
    reservationIdDigest: keyedDigest(
      key,
      `reservation/${state.quota_day_utc}`,
      `${input.dispatchId}\0${input.attemptId}`,
    ),
    idempotencyKeyDigest: keyedDigest(key, `idempotency/${state.quota_day_utc}`, input.idempotencyKey),
    runIdDigest: keyedDigest(key, `run/${state.quota_day_utc}`, input.runId),
    dispatchIdDigest: keyedDigest(key, `dispatch/${state.quota_day_utc}`, input.dispatchId),
    attemptIdDigest: keyedDigest(key, `attempt/${state.quota_day_utc}`, input.attemptId),
  };
}

function buildReceipt({ state, reservationIdDigest, reservation, decision }) {
  const runCount = state.run_attempt_counts[reservation.run_id_digest];
  return {
    receipt_id: 'KIDULTS_PSA_PROVIDER_QUOTA_RESERVATION_V1',
    provider_id: PROVIDER_ID,
    decision,
    quota_day_utc: state.quota_day_utc,
    reservation_id_digest: reservationIdDigest,
    idempotency_key_digest: reservation.idempotency_key_digest,
    run_id_digest: reservation.run_id_digest,
    dispatch_id_digest: reservation.dispatch_id_digest,
    attempt_id_digest: reservation.attempt_id_digest,
    request_reference_digest: reservation.request_reference_digest,
    approved_daily_budget: state.approved_daily_budget,
    per_run_cap: state.per_run_cap,
    daily_reserved_attempt_count: state.consumed_attempt_count,
    run_reserved_attempt_count: runCount,
    daily_remaining_attempt_count: state.approved_daily_budget - state.consumed_attempt_count,
    run_remaining_attempt_count: state.per_run_cap - runCount,
    daily_ordinal: reservation.daily_ordinal,
    run_ordinal: reservation.run_ordinal,
    state_sequence: state.state_sequence,
    state_digest: sha256(canonical(state)),
    reserved_at: reservation.reserved_at,
    raw_cert_in_receipt: false,
  };
}

function buildExhaustionDetails({ state, digests, requestReferenceDigest, reason }) {
  const runCount = state.run_attempt_counts[digests.runIdDigest] || 0;
  return {
    receipt_id: 'KIDULTS_PSA_PROVIDER_QUOTA_DENIAL_V1',
    provider_id: PROVIDER_ID,
    decision: reason,
    quota_day_utc: state.quota_day_utc,
    reservation_id_digest: digests.reservationIdDigest,
    idempotency_key_digest: digests.idempotencyKeyDigest,
    run_id_digest: digests.runIdDigest,
    dispatch_id_digest: digests.dispatchIdDigest,
    attempt_id_digest: digests.attemptIdDigest,
    request_reference_digest: requestReferenceDigest,
    approved_daily_budget: state.approved_daily_budget,
    per_run_cap: state.per_run_cap,
    daily_reserved_attempt_count: state.consumed_attempt_count,
    run_reserved_attempt_count: runCount,
    daily_remaining_attempt_count: state.approved_daily_budget - state.consumed_attempt_count,
    run_remaining_attempt_count: state.per_run_cap - runCount,
    state_sequence: state.state_sequence,
    state_digest: sha256(canonical(state)),
    raw_cert_in_receipt: false,
  };
}

export class PsaProviderQuotaLeaseError extends Error {
  constructor(code, details = undefined) {
    super(code);
    this.name = 'PsaProviderQuotaLeaseError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export class PsaProviderQuotaLease {
  constructor({
    privateRoot,
    forbiddenRoot,
    approvedDailyBudget,
    perRunCap,
    clock = () => new Date(),
    lockTimeoutMs = 10_000,
    staleLockMs = 30_000,
    lockPollMs = 10,
    ownerInitializationGraceMs = 250,
    clockSkewToleranceMs = 5_000,
  }) {
    if (typeof privateRoot !== 'string' || !privateRoot.trim()) {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_PRIVATE_ROOT_REQUIRED');
    }
    const root = resolve(privateRoot);
    if (dirname(root) === root) throw new PsaProviderQuotaLeaseError('PSA_QUOTA_PRIVATE_ROOT_TOO_BROAD');
    this.privateRoot = root;
    if (typeof forbiddenRoot !== 'string' || !forbiddenRoot.trim()) {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_FORBIDDEN_ROOT_REQUIRED');
    }
    this.forbiddenRoot = resolve(forbiddenRoot);
    this.approvedDailyBudget = validatePositiveInteger(
      approvedDailyBudget,
      'PSA_QUOTA_APPROVED_DAILY_BUDGET_INVALID',
    );
    this.perRunCap = validatePositiveInteger(perRunCap, 'PSA_QUOTA_PER_RUN_CAP_INVALID');
    if (this.perRunCap > this.approvedDailyBudget) {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_PER_RUN_CAP_EXCEEDS_DAILY_BUDGET');
    }
    if (typeof clock !== 'function') throw new PsaProviderQuotaLeaseError('PSA_QUOTA_CLOCK_INVALID');
    this.clock = clock;
    this.lockOptions = {
      lockTimeoutMs: validatePositiveInteger(lockTimeoutMs, 'PSA_QUOTA_LOCK_TIMEOUT_INVALID'),
      staleLockMs: validatePositiveInteger(staleLockMs, 'PSA_QUOTA_STALE_LOCK_WINDOW_INVALID'),
      lockPollMs: validatePositiveInteger(lockPollMs, 'PSA_QUOTA_LOCK_POLL_INVALID'),
      ownerInitializationGraceMs: validateNonNegativeInteger(
        ownerInitializationGraceMs,
        'PSA_QUOTA_LOCK_INITIALIZATION_GRACE_INVALID',
      ),
      clockSkewToleranceMs: validateNonNegativeInteger(
        clockSkewToleranceMs,
        'PSA_QUOTA_CLOCK_SKEW_TOLERANCE_INVALID',
      ),
    };
  }

  now() {
    const value = new Date(this.clock());
    if (Number.isNaN(value.valueOf())) throw new PsaProviderQuotaLeaseError('PSA_QUOTA_CLOCK_INVALID');
    return value;
  }

  async reserveAttempt({
    runId,
    dispatchId,
    attemptId,
    idempotencyKey,
    requestReferenceDigest,
  }) {
    const input = {
      runId: validateIdentifier(runId, 'PSA_QUOTA_RUN_ID_INVALID'),
      dispatchId: validateIdentifier(dispatchId, 'PSA_QUOTA_DISPATCH_ID_INVALID'),
      attemptId: validateIdentifier(attemptId, 'PSA_QUOTA_ATTEMPT_ID_INVALID'),
      idempotencyKey: validateIdentifier(idempotencyKey, 'PSA_QUOTA_IDEMPOTENCY_KEY_INVALID'),
      requestReferenceDigest: validateRequestReferenceDigest(requestReferenceDigest),
    };
    const paths = await preparePaths(this.privateRoot, this.forbiddenRoot);
    const owner = await acquireLock(paths, this.lockOptions, () => this.now());
    let primaryError;
    try {
      let now = this.now();
      const currentDay = utcDay(now);
      let state;
      try {
        state = await readSecureJson(paths.state, { missingAllowed: true });
        if (state) validateState(state);
      } catch (error) {
        if (error instanceof PsaProviderQuotaLeaseError) {
          throw new PsaProviderQuotaLeaseError('PSA_QUOTA_STATE_CORRUPT', { cause_code: error.code });
        }
        throw error;
      }

      if (!state) {
        state = createState({
          approvedDailyBudget: this.approvedDailyBudget,
          perRunCap: this.perRunCap,
          day: currentDay,
          now,
        });
      } else {
        const stateDay = parseUtcDay(state.quota_day_utc);
        const today = parseUtcDay(currentDay);
        if (today < stateDay) throw new PsaProviderQuotaLeaseError('PSA_QUOTA_CLOCK_ROLLBACK_DETECTED');
        if (today > stateDay) {
          const archivePath = resolve(paths.quotaDirectory, `state-${state.quota_day_utc}.json`);
          await createImmutableJson(archivePath, state);
          state = createState({
            approvedDailyBudget: this.approvedDailyBudget,
            perRunCap: this.perRunCap,
            day: currentDay,
            now,
          });
        } else if (state.policy_digest !== policyDigest({
          approvedDailyBudget: this.approvedDailyBudget,
          perRunCap: this.perRunCap,
        })) {
          throw new PsaProviderQuotaLeaseError('PSA_QUOTA_POLICY_CHANGE_DURING_UTC_DAY_FORBIDDEN');
        } else {
          const lastUpdate = Date.parse(state.updated_at);
          if (now.valueOf() + this.lockOptions.clockSkewToleranceMs < lastUpdate) {
            throw new PsaProviderQuotaLeaseError('PSA_QUOTA_CLOCK_ROLLBACK_DETECTED');
          }
          if (now.valueOf() < lastUpdate) now = new Date(lastUpdate);
        }
      }

      const digests = reservationDigests(state, input);
      const existing = state.reservations[digests.reservationIdDigest];
      const reusedIdempotency = Object.entries(state.reservations)
        .find(([, reservation]) => reservation.idempotency_key_digest === digests.idempotencyKeyDigest);
      if (existing) {
        if (existing.idempotency_key_digest !== digests.idempotencyKeyDigest
          || existing.run_id_digest !== digests.runIdDigest
          || existing.dispatch_id_digest !== digests.dispatchIdDigest
          || existing.attempt_id_digest !== digests.attemptIdDigest
          || existing.request_reference_digest !== input.requestReferenceDigest) {
          throw new PsaProviderQuotaLeaseError('PSA_QUOTA_IDEMPOTENCY_CONFLICT', {
            reservation_id_digest: digests.reservationIdDigest,
            expected_idempotency_key_digest: existing.idempotency_key_digest,
            observed_idempotency_key_digest: digests.idempotencyKeyDigest,
            expected_run_id_digest: existing.run_id_digest,
            observed_run_id_digest: digests.runIdDigest,
            expected_request_reference_digest: existing.request_reference_digest,
            observed_request_reference_digest: input.requestReferenceDigest,
          });
        }
        return buildReceipt({
          state,
          reservationIdDigest: digests.reservationIdDigest,
          reservation: existing,
          decision: 'RESERVED_IDEMPOTENT',
        });
      }
      if (reusedIdempotency) {
        throw new PsaProviderQuotaLeaseError('PSA_QUOTA_IDEMPOTENCY_CONFLICT', {
          reservation_id_digest: digests.reservationIdDigest,
          idempotency_key_digest: digests.idempotencyKeyDigest,
          existing_reservation_id_digest: reusedIdempotency[0],
          observed_dispatch_id_digest: digests.dispatchIdDigest,
          observed_attempt_id_digest: digests.attemptIdDigest,
        });
      }

      const runCount = state.run_attempt_counts[digests.runIdDigest] || 0;
      if (state.consumed_attempt_count >= state.approved_daily_budget) {
        throw new PsaProviderQuotaLeaseError('PSA_QUOTA_DAILY_BUDGET_EXHAUSTED', buildExhaustionDetails({
          state,
          digests,
          requestReferenceDigest: input.requestReferenceDigest,
          reason: 'DENIED_DAILY_BUDGET_EXHAUSTED',
        }));
      }
      if (runCount >= state.per_run_cap) {
        throw new PsaProviderQuotaLeaseError('PSA_QUOTA_PER_RUN_CAP_EXHAUSTED', buildExhaustionDetails({
          state,
          digests,
          requestReferenceDigest: input.requestReferenceDigest,
          reason: 'DENIED_PER_RUN_CAP_EXHAUSTED',
        }));
      }

      const reservation = {
        idempotency_key_digest: digests.idempotencyKeyDigest,
        run_id_digest: digests.runIdDigest,
        dispatch_id_digest: digests.dispatchIdDigest,
        attempt_id_digest: digests.attemptIdDigest,
        request_reference_digest: input.requestReferenceDigest,
        daily_ordinal: state.consumed_attempt_count + 1,
        run_ordinal: runCount + 1,
        reserved_at: now.toISOString(),
      };
      state.reservations[digests.reservationIdDigest] = reservation;
      state.run_attempt_counts[digests.runIdDigest] = runCount + 1;
      state.consumed_attempt_count += 1;
      state.state_sequence += 1;
      state.updated_at = now.toISOString();
      validateState(state);
      await atomicReplaceJson(paths.state, state);
      return buildReceipt({
        state,
        reservationIdDigest: digests.reservationIdDigest,
        reservation,
        decision: 'RESERVED_NEW',
      });
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      try {
        await releaseLock(paths, owner);
      } catch (releaseError) {
        if (!primaryError) throw releaseError;
      }
    }
  }

  async executeAttempt(reservationInput, providerRequest) {
    if (typeof providerRequest !== 'function') {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_PROVIDER_REQUEST_CALLBACK_REQUIRED');
    }
    const quotaReceipt = await this.reserveAttempt(reservationInput);
    if (quotaReceipt.decision !== 'RESERVED_NEW') {
      throw new PsaProviderQuotaLeaseError('PSA_QUOTA_PROVIDER_EXECUTION_REPLAY_BLOCKED', {
        receipt_id: quotaReceipt.receipt_id,
        provider_id: quotaReceipt.provider_id,
        decision: quotaReceipt.decision,
        reservation_id_digest: quotaReceipt.reservation_id_digest,
        state_digest: quotaReceipt.state_digest,
        raw_cert_in_receipt: false,
      });
    }
    const providerResult = await providerRequest({ quotaReceipt });
    return { quota_receipt: quotaReceipt, provider_request_executed: true, provider_result: providerResult };
  }
}

export function createPsaProviderQuotaLease(options) {
  return new PsaProviderQuotaLease(options);
}
