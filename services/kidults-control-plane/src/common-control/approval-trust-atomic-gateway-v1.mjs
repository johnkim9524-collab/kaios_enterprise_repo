import { requireDigest, requireValue } from './canonical-v1.mjs';
import {
  consumePreparedCryptographicApprovalInTransaction,
  prepareCryptographicApprovalConsumption,
} from './approval-consumption-v1.mjs';
import {
  TRUST_HEAD_LOCK_SQL, verifyTrustCurrentHeadRow,
} from './approval-trust-current-head-v1.mjs';
import { resolveExactTrustRegistrySnapshot } from './approval-trust-registry-resolver-v1.mjs';

const CONSUMER_WRITER_ID = 'kpmo-approval-consumption-writer-v1';
async function rollback(client) { try { await client.query('ROLLBACK'); } catch { /* preserve */ } }

export async function atomicallyVerifyAndConsumeCurrentTrust(client, {
  registryId, registryDigest, expectedCurrentLifecycleStateDigest,
  envelope, expectedSubject, now, beforeCommit,
}) {
  requireValue(beforeCommit === undefined || typeof beforeCommit === 'function',
    'ATOMIC_TRUST_GATEWAY_BEFORE_COMMIT_INVALID');
  requireDigest(expectedCurrentLifecycleStateDigest,
    'ATOMIC_TRUST_GATEWAY_CURRENT_HEAD_PIN_INVALID');
  const resolved = await resolveExactTrustRegistrySnapshot(client, { registryId, registryDigest });
  const prepared = prepareCryptographicApprovalConsumption({ envelope,
    trustRegistry: resolved.registry, expectedTrustRegistryDigest: registryDigest,
    expectedSubject, now });
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('kidults.writer_id', $1, true)", [CONSUMER_WRITER_ID]);
    await client.query('SELECT kidults_control.assert_registered_writer($1)', [CONSUMER_WRITER_ID]);
    await client.query(TRUST_HEAD_LOCK_SQL);
    const rows = (await client.query(`SELECT * FROM kidults_control.approval_trust_current_heads
      ORDER BY revision DESC LIMIT 1`)).rows ?? [];
    requireValue(rows.length === 1, 'ATOMIC_TRUST_GATEWAY_CURRENT_HEAD_REQUIRED');
    const head = verifyTrustCurrentHeadRow(rows[0]);
    requireValue(head.lifecycleStateDigest === expectedCurrentLifecycleStateDigest,
      'ATOMIC_TRUST_GATEWAY_CURRENT_HEAD_PIN_MISMATCH');
    requireValue(head.activeRegistryId === registryId
      && head.activeRegistryDigest === registryDigest,
    'ATOMIC_TRUST_GATEWAY_STALE_ROTATED_OR_REVOKED');
    const consumed = await consumePreparedCryptographicApprovalInTransaction(client, prepared);
    const transactionResult = consumed.state === 'CONSUMED_AUTHORITY_NOT_ACTIVATED'
      && beforeCommit ? await beforeCommit(consumed) : null;
    await client.query('COMMIT');
    return { state: consumed.state, currentHeadDigest: head.headDigest,
      currentHeadRevision: head.revision, verificationReceipt: consumed.verificationReceipt,
      consumptionReceipt: consumed.consumptionReceipt, activationAuthorized: false,
      transactionResult,
      externalEgress: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' };
  } catch (error) { await rollback(client); throw error; }
}
