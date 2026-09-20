import {
  canonicalJson, digestObject, requireDigest, requireExactRecord, requireIdentifier,
  requireInstant, requireValue, snapshotJson, verifySelfDigest,
} from './canonical-v1.mjs';
import {
  verifyCompiledTrustRegistryHandoff, verifyTrustRegistryHandoffReceipt,
} from './approval-trust-registry-compiler-v1.mjs';

export const TRUST_REGISTRY_SNAPSHOT_WRITER_ID = 'kpmo-trust-registry-snapshot-writer-v1';
const RECEIPT_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'snapshotId', 'registryId', 'registryDigest',
  'handoffId', 'handoffDigest', 'candidateSetDigest', 'eventSetDigest',
  'lifecycleStateDigest', 'recordedAt', 'activationAuthorized',
  'providerContactExecuted', 'spendAuthorized', 'externalEgress',
  'credentialResolution', 'production', 'publicRelease', 'g5', 'receiptDigest',
]);

function protectedGates(receipt) {
  requireValue(receipt.activationAuthorized === false
    && receipt.providerContactExecuted === false && receipt.spendAuthorized === false
    && receipt.externalEgress === false && receipt.credentialResolution === false
    && receipt.production === 'HOLD' && receipt.publicRelease === 'HOLD'
    && receipt.g5 === 'HOLD', 'TRUST_REGISTRY_SNAPSHOT_PROTECTED_GATE_INVALID');
}

export function verifyTrustRegistrySnapshotReceipt(input) {
  const receipt = snapshotJson(input, { maxBytes: 65536 });
  requireExactRecord(receipt, RECEIPT_KEYS, 'TRUST_REGISTRY_SNAPSHOT_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-approval-trust-registry-snapshot-v1'
    && receipt.version === '1.0.0'
    && receipt.state === 'SNAPSHOT_RECORDED_AUTHORITY_NOT_ACTIVATED',
  'TRUST_REGISTRY_SNAPSHOT_CONTRACT_INVALID');
  requireIdentifier(receipt.snapshotId, 'TRUST_REGISTRY_SNAPSHOT_ID_INVALID');
  requireIdentifier(receipt.registryId, 'TRUST_REGISTRY_SNAPSHOT_REGISTRY_ID_INVALID');
  requireIdentifier(receipt.handoffId, 'TRUST_REGISTRY_SNAPSHOT_HANDOFF_ID_INVALID');
  for (const digest of [receipt.registryDigest, receipt.handoffDigest,
    receipt.candidateSetDigest, receipt.eventSetDigest, receipt.lifecycleStateDigest]) {
    requireDigest(digest, 'TRUST_REGISTRY_SNAPSHOT_DIGEST_INVALID');
  }
  requireInstant(receipt.recordedAt, 'TRUST_REGISTRY_SNAPSHOT_TIME_INVALID');
  protectedGates(receipt);
  requireDigest(receipt.receiptDigest, 'TRUST_REGISTRY_SNAPSHOT_DIGEST_INVALID');
  verifySelfDigest(receipt, 'receiptDigest', 'TRUST_REGISTRY_SNAPSHOT_INTEGRITY_INVALID');
  const identity = digestObject({ registryDigest: receipt.registryDigest,
    handoffDigest: receipt.handoffDigest });
  requireValue(receipt.snapshotId === `trust-registry-snapshot:${identity.slice(7)}`,
    'TRUST_REGISTRY_SNAPSHOT_ID_INVALID');
  return receipt;
}

function createReceipt(registry, handoffReceipt, recordedAt) {
  requireInstant(recordedAt, 'TRUST_REGISTRY_SNAPSHOT_TIME_INVALID');
  const identity = digestObject({ registryDigest: registry.registryDigest,
    handoffDigest: handoffReceipt.handoffDigest });
  const unsigned = {
    contractId: 'kidults-approval-trust-registry-snapshot-v1', version: '1.0.0',
    state: 'SNAPSHOT_RECORDED_AUTHORITY_NOT_ACTIVATED',
    snapshotId: `trust-registry-snapshot:${identity.slice(7)}`,
    registryId: registry.registryId, registryDigest: registry.registryDigest,
    handoffId: handoffReceipt.handoffId, handoffDigest: handoffReceipt.handoffDigest,
    candidateSetDigest: handoffReceipt.candidateSetDigest,
    eventSetDigest: handoffReceipt.eventSetDigest,
    lifecycleStateDigest: handoffReceipt.lifecycleStateDigest, recordedAt,
    activationAuthorized: false, providerContactExecuted: false, spendAuthorized: false,
    externalEgress: false, credentialResolution: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return verifyTrustRegistrySnapshotReceipt({ ...unsigned, receiptDigest: digestObject(unsigned) });
}

function jsonValue(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { throw new Error('TRUST_REGISTRY_SNAPSHOT_JSON_INVALID'); }
}

export function verifyTrustRegistrySnapshotRow(row) {
  requireValue(row && typeof row === 'object', 'TRUST_REGISTRY_SNAPSHOT_ROW_INVALID');
  const registry = jsonValue(row.registry_json);
  const handoffReceipt = verifyTrustRegistryHandoffReceipt(jsonValue(row.handoff_json));
  const receipt = verifyTrustRegistrySnapshotReceipt(jsonValue(row.snapshot_json));
  requireValue(row.snapshot_id === receipt.snapshotId && row.registry_id === receipt.registryId
    && row.registry_digest === receipt.registryDigest && row.handoff_id === receipt.handoffId
    && row.handoff_digest === receipt.handoffDigest
    && row.lifecycle_state_digest === receipt.lifecycleStateDigest
    && row.receipt_digest === receipt.receiptDigest
    && row.writer_id === TRUST_REGISTRY_SNAPSHOT_WRITER_ID
    && new Date(row.recorded_at).toISOString() === receipt.recordedAt
    && registry.registryId === receipt.registryId
    && registry.registryDigest === receipt.registryDigest
    && handoffReceipt.registryId === receipt.registryId
    && handoffReceipt.registryDigest === receipt.registryDigest
    && handoffReceipt.handoffId === receipt.handoffId
    && handoffReceipt.handoffDigest === receipt.handoffDigest
    && handoffReceipt.candidateSetDigest === receipt.candidateSetDigest
    && handoffReceipt.eventSetDigest === receipt.eventSetDigest
    && handoffReceipt.lifecycleStateDigest === receipt.lifecycleStateDigest,
  'TRUST_REGISTRY_SNAPSHOT_ROW_BINDING_INVALID');
  return { registry, handoffReceipt, snapshotReceipt: receipt };
}

async function rollback(client) { try { await client.query('ROLLBACK'); } catch { /* preserve */ } }

export async function recordCompiledTrustRegistrySnapshot(client, {
  registry, handoffReceipt, candidates, events, recordedAt,
}) {
  requireValue(client && typeof client.query === 'function', 'TRUST_REGISTRY_SNAPSHOT_CLIENT_INVALID');
  const verified = verifyCompiledTrustRegistryHandoff({
    registry, handoffReceipt, candidates, events,
  });
  const receipt = createReceipt(verified.registry, verified.handoffReceipt, recordedAt);
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('kidults.writer_id', $1, true)",
      [TRUST_REGISTRY_SNAPSHOT_WRITER_ID]);
    await client.query('SELECT kidults_control.assert_registered_writer($1)',
      [TRUST_REGISTRY_SNAPSHOT_WRITER_ID]);
    const inserted = await client.query(`INSERT INTO kidults_control.approval_trust_registry_snapshots
      (snapshot_id, registry_id, registry_digest, handoff_id, handoff_digest,
       lifecycle_state_digest, registry_json, handoff_json, snapshot_json,
       receipt_digest, writer_id, recorded_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12)
      ON CONFLICT DO NOTHING RETURNING *`, [receipt.snapshotId, receipt.registryId,
      receipt.registryDigest, receipt.handoffId, receipt.handoffDigest,
      receipt.lifecycleStateDigest, JSON.stringify(verified.registry),
      JSON.stringify(verified.handoffReceipt), JSON.stringify(receipt), receipt.receiptDigest,
      TRUST_REGISTRY_SNAPSHOT_WRITER_ID, receipt.recordedAt]);
    if (!inserted.rows?.length) {
      const rows = (await client.query(`SELECT * FROM kidults_control.approval_trust_registry_snapshots
        WHERE snapshot_id=$1 OR registry_digest=$2 OR handoff_digest=$3 ORDER BY snapshot_id`,
      [receipt.snapshotId, receipt.registryDigest, receipt.handoffDigest])).rows ?? [];
      requireValue(rows.length === 1, 'TRUST_REGISTRY_SNAPSHOT_REPLAY_INVALID');
      const existing = verifyTrustRegistrySnapshotRow(rows[0]);
      requireValue(canonicalJson(existing.registry) === canonicalJson(verified.registry)
        && canonicalJson(existing.handoffReceipt) === canonicalJson(verified.handoffReceipt)
        && canonicalJson(existing.snapshotReceipt) === canonicalJson(receipt),
      'TRUST_REGISTRY_SNAPSHOT_REPLAY_CONFLICT');
      await client.query('COMMIT');
      return { state: 'IDEMPOTENT_SNAPSHOT_REPLAY', ...existing, activationAuthorized: false };
    }
    const stored = verifyTrustRegistrySnapshotRow(inserted.rows[0]);
    await client.query('COMMIT');
    return { state: 'SNAPSHOT_RECORDED_AUTHORITY_NOT_ACTIVATED', ...stored,
      activationAuthorized: false };
  } catch (error) { await rollback(client); throw error; }
}
