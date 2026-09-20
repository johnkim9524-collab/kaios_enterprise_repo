import {
  canonicalJson, digestObject, requireDigest, requireExactRecord,
  requireIdentifier, requireInstant, requireValue, snapshotJson,
} from '../common-control/canonical-v1.mjs';
import { validateTask } from './task-lifecycle-v1.mjs';

const WRITER_ID = 'kpmo-autonomous-task-writer-v1';
const RECEIPT_KEYS = Object.freeze([
  'contractId', 'version', 'taskId', 'transition', 'fromState', 'toState',
  'fromRevision', 'toRevision', 'beforeDigest', 'afterDigest', 'workerId',
  'leaseEpoch', 'reason', 'observedAt', 'externalEgress', 'production',
  'publicRelease', 'g5', 'receiptId', 'receiptDigest',
]);

function fail(code) { throw new Error(code); }
function integer(value, minimum, code) {
  requireValue(Number.isSafeInteger(value) && value >= minimum, code);
  return value;
}
function jsonValue(value, code) {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { fail(code); }
  }
  return value;
}
function sameJson(left, right) { return canonicalJson(jsonValue(left, 'TASK_LEDGER_READBACK_JSON_INVALID')) === canonicalJson(right); }

function validateReceipt(input, before, after) {
  const receipt = snapshotJson(input, { maxBytes: 65536 });
  requireExactRecord(receipt, RECEIPT_KEYS, 'TASK_LEDGER_RECEIPT_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-autonomous-task-transition-receipt-v1'
    && receipt.version === '1.0.0', 'TASK_LEDGER_RECEIPT_CONTRACT_INVALID');
  requireIdentifier(receipt.taskId, 'TASK_LEDGER_RECEIPT_TASK_ID_INVALID');
  requireIdentifier(receipt.transition, 'TASK_LEDGER_TRANSITION_INVALID');
  requireIdentifier(receipt.fromState, 'TASK_LEDGER_FROM_STATE_INVALID');
  requireIdentifier(receipt.toState, 'TASK_LEDGER_TO_STATE_INVALID');
  integer(receipt.fromRevision, 0, 'TASK_LEDGER_FROM_REVISION_INVALID');
  integer(receipt.toRevision, 1, 'TASK_LEDGER_TO_REVISION_INVALID');
  requireDigest(receipt.beforeDigest, 'TASK_LEDGER_BEFORE_DIGEST_INVALID');
  requireDigest(receipt.afterDigest, 'TASK_LEDGER_AFTER_DIGEST_INVALID');
  requireValue(receipt.workerId === null || typeof receipt.workerId === 'string', 'TASK_LEDGER_WORKER_INVALID');
  if (receipt.workerId !== null) requireIdentifier(receipt.workerId, 'TASK_LEDGER_WORKER_INVALID');
  integer(receipt.leaseEpoch, 0, 'TASK_LEDGER_LEASE_EPOCH_INVALID');
  requireIdentifier(receipt.reason, 'TASK_LEDGER_REASON_INVALID');
  requireInstant(receipt.observedAt, 'TASK_LEDGER_OBSERVED_AT_INVALID');
  requireValue(receipt.externalEgress === false && receipt.production === 'HOLD'
    && receipt.publicRelease === 'HOLD' && receipt.g5 === 'HOLD', 'TASK_LEDGER_PROTECTED_GATE_INVALID');
  requireIdentifier(receipt.receiptId, 'TASK_LEDGER_RECEIPT_ID_INVALID');
  requireDigest(receipt.receiptDigest, 'TASK_LEDGER_RECEIPT_DIGEST_INVALID');
  const identified = Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== 'receiptDigest'));
  requireValue(receipt.receiptDigest === digestObject(identified), 'TASK_LEDGER_RECEIPT_DIGEST_MISMATCH');
  const unsigned = Object.fromEntries(Object.entries(identified).filter(([key]) => key !== 'receiptId'));
  requireValue(receipt.receiptId === `task-transition:${digestObject(unsigned).slice(7)}`, 'TASK_LEDGER_RECEIPT_ID_MISMATCH');
  requireValue(receipt.taskId === before.taskId && receipt.taskId === after.taskId
    && receipt.fromState === before.state && receipt.toState === after.state
    && receipt.fromRevision === before.revision && receipt.toRevision === after.revision
    && receipt.toRevision === receipt.fromRevision + 1
    && receipt.beforeDigest === digestObject(before) && receipt.afterDigest === digestObject(after)
    && receipt.leaseEpoch === after.leaseEpoch, 'TASK_LEDGER_TRANSITION_BINDING_INVALID');
  return receipt;
}

function snapshotParams(task) {
  return [task.taskId, task.revision, task.state, task.attempt, task.leaseOwner,
    task.leaseEpoch, JSON.stringify(task), digestObject(task), WRITER_ID];
}
function snapshotMatches(row, task) {
  return row && String(row.task_id) === task.taskId && Number(row.revision) === task.revision
    && row.state === task.state && Number(row.attempt) === task.attempt
    && (row.lease_owner ?? null) === task.leaseOwner && Number(row.lease_epoch) === task.leaseEpoch
    && row.task_digest === digestObject(task) && row.writer_id === WRITER_ID && sameJson(row.task_json, task);
}

export function taskFromSnapshotRow(row) {
  requireValue(row && typeof row === 'object', 'TASK_LEDGER_SNAPSHOT_ROW_INVALID');
  const task = validateTask(jsonValue(row.task_json, 'TASK_LEDGER_READBACK_JSON_INVALID'));
  requireValue(snapshotMatches(row, task), 'TASK_LEDGER_SNAPSHOT_ROW_MISMATCH');
  return task;
}
function transitionMatches(row, receipt) {
  return row && row.receipt_id === receipt.receiptId && row.task_id === receipt.taskId
    && Number(row.from_revision) === receipt.fromRevision && Number(row.to_revision) === receipt.toRevision
    && row.transition === receipt.transition && row.from_state === receipt.fromState
    && row.to_state === receipt.toState && row.before_digest === receipt.beforeDigest
    && row.after_digest === receipt.afterDigest && (row.worker_id ?? null) === receipt.workerId
    && Number(row.lease_epoch) === receipt.leaseEpoch && row.reason === receipt.reason
    && new Date(row.observed_at).toISOString() === receipt.observedAt
    && row.receipt_digest === receipt.receiptDigest && row.writer_id === WRITER_ID
    && sameJson(row.receipt_json, receipt);
}

async function begin(client) {
  requireValue(client && typeof client.query === 'function', 'TASK_LEDGER_CLIENT_INVALID');
  await client.query('BEGIN');
  await client.query("SELECT set_config('kidults.writer_id', $1, true)", [WRITER_ID]);
  await client.query('SELECT kidults_control.assert_registered_writer($1)', [WRITER_ID]);
}
async function rollback(client) { try { await client.query('ROLLBACK'); } catch { /* preserve original failure */ } }

export async function persistInitialTask(client, input) {
  const task = validateTask(input);
  requireValue(task.revision === 0 && task.state === 'PENDING', 'TASK_LEDGER_INITIAL_STATE_INVALID');
  requireValue(Buffer.byteLength(canonicalJson(task), 'utf8') <= 65536, 'TASK_LEDGER_TASK_TOO_LARGE');
  try {
    await begin(client);
    const inserted = await client.query(`INSERT INTO kidults_control.autonomous_task_snapshots
      (task_id, revision, state, attempt, lease_owner, lease_epoch, task_json, task_digest, writer_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
      ON CONFLICT (task_id, revision) DO NOTHING RETURNING *`, snapshotParams(task));
    const row = inserted.rows?.[0] ?? (await client.query(
      'SELECT * FROM kidults_control.autonomous_task_snapshots WHERE task_id=$1 AND revision=$2',
      [task.taskId, task.revision]
    )).rows?.[0];
    if (!snapshotMatches(row, task)) fail('TASK_LEDGER_INITIAL_CONFLICT');
    await client.query('COMMIT');
    return { state: inserted.rows?.length ? 'RECORDED' : 'IDEMPOTENT_REPLAY', taskDigest: digestObject(task), remoteActivation: 'HOLD' };
  } catch (error) {
    await rollback(client);
    throw error;
  }
}

export async function persistTaskTransition(client, beforeInput, resultInput) {
  const before = validateTask(beforeInput);
  requireValue(resultInput && typeof resultInput === 'object', 'TASK_LEDGER_RESULT_INVALID');
  const after = validateTask(resultInput.task);
  const receipt = validateReceipt(resultInput.receipt, before, after);
  requireValue(Buffer.byteLength(canonicalJson(after), 'utf8') <= 65536, 'TASK_LEDGER_TASK_TOO_LARGE');
  try {
    await begin(client);
    const latest = (await client.query(
      'SELECT * FROM kidults_control.autonomous_task_snapshots WHERE task_id=$1 ORDER BY revision DESC LIMIT 1',
      [before.taskId]
    )).rows?.[0];
    if (snapshotMatches(latest, after)) {
      const replay = (await client.query(
        'SELECT * FROM kidults_control.autonomous_task_transitions WHERE receipt_id=$1', [receipt.receiptId]
      )).rows?.[0];
      if (!transitionMatches(replay, receipt)) fail('TASK_LEDGER_TRANSITION_CONFLICT');
      await client.query('COMMIT');
      return { state: 'IDEMPOTENT_REPLAY', taskDigest: receipt.afterDigest, receiptDigest: receipt.receiptDigest, remoteActivation: 'HOLD' };
    }
    if (!snapshotMatches(latest, before)) fail('TASK_LEDGER_STALE_REVISION');
    const insertedSnapshot = await client.query(`INSERT INTO kidults_control.autonomous_task_snapshots
      (task_id, revision, state, attempt, lease_owner, lease_epoch, task_json, task_digest, writer_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
      ON CONFLICT (task_id, revision) DO NOTHING RETURNING *`, snapshotParams(after));
    if (!snapshotMatches(insertedSnapshot.rows?.[0], after)) fail('TASK_LEDGER_REVISION_CONFLICT');
    const insertedTransition = await client.query(`INSERT INTO kidults_control.autonomous_task_transitions
      (receipt_id, task_id, from_revision, to_revision, transition, from_state, to_state, before_digest, after_digest,
       worker_id, lease_epoch, reason, observed_at, receipt_json, receipt_digest, writer_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16)
      ON CONFLICT (receipt_id) DO NOTHING RETURNING *`, [
      receipt.receiptId, receipt.taskId, receipt.fromRevision, receipt.toRevision, receipt.transition,
      receipt.fromState, receipt.toState, receipt.beforeDigest, receipt.afterDigest,
      receipt.workerId, receipt.leaseEpoch, receipt.reason,
      receipt.observedAt, JSON.stringify(receipt), receipt.receiptDigest, WRITER_ID,
    ]);
    if (!transitionMatches(insertedTransition.rows?.[0], receipt)) fail('TASK_LEDGER_TRANSITION_CONFLICT');
    await client.query('COMMIT');
    return { state: 'RECORDED', taskDigest: receipt.afterDigest, receiptDigest: receipt.receiptDigest, remoteActivation: 'HOLD' };
  } catch (error) {
    await rollback(client);
    throw error;
  }
}
