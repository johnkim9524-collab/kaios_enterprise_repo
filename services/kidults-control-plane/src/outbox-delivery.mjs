import { createHash, randomUUID } from 'node:crypto';
import { projectOutboxEvent, d1ProjectorContract } from './d1-projector.mjs';

const PROJECTOR_ID = d1ProjectorContract.projectorId;
const WRITER_ID = PROJECTOR_ID;
const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const required = (value, name) => {
  if (value === undefined || value === null || value === '') throw new Error(`${name}_REQUIRED`);
  return value;
};

async function configure(client, organizationId) {
  await client.query("SELECT set_config('kidults.writer_id', $1, true)", [WRITER_ID]);
  await client.query("SELECT set_config('kidults.organization_id', $1, true)", [organizationId]);
}

async function recordFinalReceipt({ client, organizationId, event, attemptNo, claimToken, workerId, state, result, error, now, id }) {
  const occurredAt = now().toISOString();
  const resultDigest = result ? sha256(JSON.stringify(result)) : null;
  const errorCode = error ? String(error.message || error).split(':', 1)[0].slice(0, 160) : null;
  await client.query('BEGIN');
  try {
    await configure(client, organizationId);
    const fenced = await client.query(`
      UPDATE kidults_control.outbox_delivery_claims
      SET claimed_until=$1,updated_at=$1,writer_id=$2
      WHERE outbox_event_id=$3 AND projector_id=$4
        AND claim_token=$5 AND worker_id=$6 AND attempt_no=$7
      RETURNING outbox_event_id
    `, [occurredAt, WRITER_ID, event.outbox_event_id, PROJECTOR_ID, claimToken, workerId, attemptNo]);
    if (fenced.rowCount !== 1 || fenced.rows?.length !== 1) throw new Error('STALE_PROJECTOR_CLAIM');
    await client.query(`
      INSERT INTO kidults_control.outbox_delivery_receipts (
        receipt_id,outbox_event_id,organization_id,projector_id,attempt_no,state,
        projection_cursor,d1_result_digest,error_code,writer_id,occurred_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [id(), event.outbox_event_id, organizationId, PROJECTOR_ID, attemptNo, state,
      event.created_at, resultDigest, errorCode, WRITER_ID, occurredAt]);
    await client.query('COMMIT');
  } catch (finalizeError) {
    await client.query('ROLLBACK');
    throw finalizeError;
  }
  return { resultDigest, errorCode };
}

export async function deliverNextOutboxEvent({
  client,
  db,
  organizationId,
  workerId,
  leaseSeconds = 60,
  maxAttempts = 5,
  now = () => new Date(),
  id = () => randomUUID(),
}) {
  if (!client?.query) throw new Error('POSTGRES_CLIENT_REQUIRED');
  if (!db?.prepare) throw new Error('D1_BINDING_REQUIRED');
  required(organizationId, 'ORGANIZATION_ID');
  required(workerId, 'WORKER_ID');
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 900) {
    throw new Error('DELIVERY_LEASE_SECONDS_INVALID');
  }
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) {
    throw new Error('DELIVERY_MAX_ATTEMPTS_INVALID');
  }
  const claimedAt = now();
  const claimedUntil = new Date(claimedAt.valueOf() + leaseSeconds * 1000);
  const claimToken = id();

  await client.query('BEGIN');
  let claimed;
  try {
    await configure(client, organizationId);
    const result = await client.query(`
      WITH candidate AS (
        SELECT o.* FROM kidults_control.outbox_events o
        WHERE o.organization_id=$1
          AND NOT EXISTS (
            SELECT 1 FROM kidults_control.outbox_delivery_receipts r
            WHERE r.outbox_event_id=o.outbox_event_id AND r.projector_id=$2
              AND r.state IN ('PROJECTED','QUARANTINED')
          )
          AND NOT EXISTS (
            SELECT 1 FROM kidults_control.outbox_delivery_claims active
            WHERE active.outbox_event_id=o.outbox_event_id AND active.projector_id=$2
              AND active.claimed_until>$3
          )
        ORDER BY o.created_at,o.outbox_event_id
        LIMIT 1
      ), claimed AS (
        INSERT INTO kidults_control.outbox_delivery_claims (
          outbox_event_id,organization_id,projector_id,claim_token,worker_id,
          attempt_no,claimed_until,writer_id,updated_at
        ) SELECT outbox_event_id,organization_id,$2,$4,$5,1,$6,$2,$3 FROM candidate
        ON CONFLICT (outbox_event_id,projector_id) DO UPDATE SET
          claim_token=excluded.claim_token,worker_id=excluded.worker_id,
          attempt_no=kidults_control.outbox_delivery_claims.attempt_no+1,
          claimed_until=excluded.claimed_until,writer_id=excluded.writer_id,
          updated_at=excluded.updated_at
        WHERE kidults_control.outbox_delivery_claims.claimed_until<=$3
        RETURNING outbox_event_id,attempt_no,claim_token,worker_id,claimed_until
      )
      SELECT o.*,claimed.attempt_no,claimed.claim_token,claimed.worker_id,claimed.claimed_until FROM claimed
      JOIN kidults_control.outbox_events o USING (outbox_event_id)
    `, [organizationId, PROJECTOR_ID, claimedAt.toISOString(), claimToken, workerId, claimedUntil.toISOString()]);
    claimed = result.rows?.[0] || null;
    await client.query('COMMIT');
  } catch (claimError) {
    await client.query('ROLLBACK');
    throw claimError;
  }

  if (!claimed) return { state: 'IDLE', organizationId, projectorId: PROJECTOR_ID };

  try {
    const projection = await projectOutboxEvent(db, claimed);
    const receipt = await recordFinalReceipt({
      client, organizationId, event: claimed, attemptNo: claimed.attempt_no,
      claimToken: claimed.claim_token, workerId: claimed.worker_id,
      state: 'PROJECTED', result: projection, error: null, now, id,
    });
    return {
      state: 'PROJECTED', organizationId, projectorId: PROJECTOR_ID,
      sourceEventId: claimed.outbox_event_id, attemptNo: claimed.attempt_no,
      d1ResultDigest: receipt.resultDigest,
    };
  } catch (projectionError) {
    const terminalState = claimed.attempt_no >= maxAttempts ? 'QUARANTINED' : 'FAILED';
    await recordFinalReceipt({
      client, organizationId, event: claimed, attemptNo: claimed.attempt_no,
      claimToken: claimed.claim_token, workerId: claimed.worker_id,
      state: terminalState, result: null, error: projectionError, now, id,
    });
    throw projectionError;
  }
}
