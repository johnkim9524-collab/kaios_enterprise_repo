import {
  canonicalJson, digestObject, requireDigest, requireExactRecord, requireIdentifier, requireInstant,
  requireValue, snapshotJson, verifySelfDigest,
} from './canonical-v1.mjs';
import {
  APPROVAL_AUTHORITY_CLASSES_V1, verifyCryptographicApprovalEnvelope,
  verifyCryptographicApprovalReceipt,
} from './approval-envelope-v1.mjs';

const WRITER_ID = 'kpmo-approval-consumption-writer-v1';
const CONSUMPTION_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'envelopeId', 'envelopeDigest', 'nonceDigest',
  'matrixContractDigest', 'trustRegistryDigest', 'requestedCapabilitiesDigest',
  'authorityClass', 'subjectType', 'subjectId', 'subjectDigest',
  'approvalVerificationReceiptDigest', 'consumedAt', 'activationAuthorized',
  'providerContactExecuted', 'spendAuthorized', 'externalEgress',
  'credentialResolution', 'production', 'publicRelease', 'g5', 'consumptionId',
  'receiptDigest',
]);

function exactSelfDigest(record, digestKey, idKey, idPrefix, code) {
  verifySelfDigest(record, digestKey, code);
  const unsigned = Object.fromEntries(Object.entries(record)
    .filter(([key]) => key !== idKey && key !== digestKey));
  requireValue(record[idKey] === `${idPrefix}:${digestObject(unsigned).slice(7)}`, code);
}

function protectedGates(record) {
  requireValue(record.activationAuthorized === false
    && record.providerContactExecuted === false && record.spendAuthorized === false
    && record.externalEgress === false && record.credentialResolution === false
    && record.production === 'HOLD' && record.publicRelease === 'HOLD'
    && record.g5 === 'HOLD', 'APPROVAL_CONSUMPTION_PROTECTED_GATE_INVALID');
}

function bindExpectedSubject(verification, expected) {
  const value = snapshotJson(expected);
  requireExactRecord(value,
    ['authorityClass', 'subjectType', 'subjectId', 'subjectDigest'],
    'APPROVAL_CONSUMPTION_EXPECTATION_SHAPE_INVALID');
  requireValue(verification.authorityClass === value.authorityClass
    && verification.subjectType === value.subjectType
    && verification.subjectId === value.subjectId
    && verification.subjectDigest === value.subjectDigest,
  'APPROVAL_CONSUMPTION_SUBJECT_BINDING_INVALID');
}

function consumptionReceipt(verificationInput, consumedAt) {
  const verification = verifyCryptographicApprovalReceipt(verificationInput);
  const consumed = requireInstant(consumedAt, 'APPROVAL_CONSUMPTION_TIME_INVALID');
  requireValue(consumed.getTime() === new Date(verification.observedAt).getTime(),
    'APPROVAL_CONSUMPTION_TIME_BINDING_INVALID');
  const unsigned = {
    contractId: 'kidults-cryptographic-approval-consumption-receipt-v1', version: '1.0.0',
    state: 'VERIFIED_AND_CONSUMED_AUTHORITY_NOT_ACTIVATED',
    envelopeId: verification.envelopeId, envelopeDigest: verification.envelopeDigest,
    nonceDigest: verification.nonceDigest,
    matrixContractDigest: verification.matrixContractDigest,
    trustRegistryDigest: verification.trustRegistryDigest,
    requestedCapabilitiesDigest: verification.requestedCapabilitiesDigest,
    authorityClass: verification.authorityClass,
    subjectType: verification.subjectType, subjectId: verification.subjectId,
    subjectDigest: verification.subjectDigest,
    approvalVerificationReceiptDigest: verification.receiptDigest, consumedAt,
    activationAuthorized: false, providerContactExecuted: false, spendAuthorized: false,
    externalEgress: false, credentialResolution: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const consumptionId = `approval-consumption:${digestObject(unsigned).slice(7)}`;
  const identified = { ...unsigned, consumptionId };
  return { ...identified, receiptDigest: digestObject(identified) };
}

export function verifyApprovalConsumptionReceipt(input) {
  const receipt = snapshotJson(input);
  requireExactRecord(receipt, CONSUMPTION_KEYS, 'APPROVAL_CONSUMPTION_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-cryptographic-approval-consumption-receipt-v1'
    && receipt.version === '1.0.0'
    && receipt.state === 'VERIFIED_AND_CONSUMED_AUTHORITY_NOT_ACTIVATED',
  'APPROVAL_CONSUMPTION_CONTRACT_INVALID');
  requireIdentifier(receipt.envelopeId, 'APPROVAL_CONSUMPTION_ENVELOPE_INVALID');
  requireIdentifier(receipt.subjectId, 'APPROVAL_CONSUMPTION_SUBJECT_INVALID');
  requireValue(['LOCAL_SYNTHETIC_SHADOW', 'PROVIDER_PREFLIGHT_NO_FETCH',
    'PROTECTED_ACTION_PACKAGE'].includes(receipt.authorityClass),
  'APPROVAL_CONSUMPTION_AUTHORITY_INVALID');
  requireValue(APPROVAL_AUTHORITY_CLASSES_V1[receipt.authorityClass]?.subjectType
    === receipt.subjectType, 'APPROVAL_CONSUMPTION_SUBJECT_INVALID');
  for (const digest of [receipt.envelopeDigest, receipt.nonceDigest, receipt.subjectDigest,
    receipt.matrixContractDigest, receipt.trustRegistryDigest,
    receipt.requestedCapabilitiesDigest, receipt.approvalVerificationReceiptDigest]) {
    requireDigest(digest, 'APPROVAL_CONSUMPTION_DIGEST_INVALID');
  }
  requireInstant(receipt.consumedAt, 'APPROVAL_CONSUMPTION_TIME_INVALID');
  protectedGates(receipt);
  requireIdentifier(receipt.consumptionId, 'APPROVAL_CONSUMPTION_ID_INVALID');
  requireDigest(receipt.receiptDigest, 'APPROVAL_CONSUMPTION_DIGEST_INVALID');
  exactSelfDigest(receipt, 'receiptDigest', 'consumptionId', 'approval-consumption',
    'APPROVAL_CONSUMPTION_INTEGRITY_INVALID');
  return receipt;
}

function jsonValue(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { throw new Error('APPROVAL_CONSUMPTION_READBACK_JSON_INVALID'); }
}

function rowMatches(row, receipt) {
  return row && row.envelope_id === receipt.envelopeId
    && row.envelope_digest === receipt.envelopeDigest
    && row.nonce_digest === receipt.nonceDigest
    && row.matrix_contract_digest === receipt.matrixContractDigest
    && row.trust_registry_digest === receipt.trustRegistryDigest
    && row.requested_capabilities_digest === receipt.requestedCapabilitiesDigest
    && row.authority_class === receipt.authorityClass
    && row.subject_type === receipt.subjectType && row.subject_id === receipt.subjectId
    && row.subject_digest === receipt.subjectDigest
    && row.approval_verification_receipt_digest === receipt.approvalVerificationReceiptDigest
    && row.consumption_id === receipt.consumptionId
    && row.receipt_digest === receipt.receiptDigest && row.writer_id === WRITER_ID
    && canonicalJson(jsonValue(row.consumption_json)) === canonicalJson(receipt);
}

async function begin(client) {
  requireValue(client && typeof client.query === 'function', 'APPROVAL_CONSUMPTION_CLIENT_INVALID');
  await client.query('BEGIN');
  await client.query("SELECT set_config('kidults.writer_id', $1, true)", [WRITER_ID]);
  await client.query('SELECT kidults_control.assert_registered_writer($1)', [WRITER_ID]);
}

async function rollback(client) { try { await client.query('ROLLBACK'); } catch { /* preserve original */ } }

export async function verifyAndConsumeCryptographicApproval(client, {
  envelope, trustRegistry, expectedTrustRegistryDigest, expectedSubject, now,
}) {
  const prepared = prepareCryptographicApprovalConsumption({
    envelope, trustRegistry, expectedTrustRegistryDigest, expectedSubject, now,
  });
  try {
    await begin(client);
    const result = await consumePreparedCryptographicApprovalInTransaction(client, prepared);
    await client.query('COMMIT');
    return result;
  } catch (error) { await rollback(client); throw error; }
}

export function prepareCryptographicApprovalConsumption({
  envelope, trustRegistry, expectedTrustRegistryDigest, expectedSubject, now,
}) {
  requireValue(now instanceof Date && Number.isFinite(now.getTime()),
    'APPROVAL_CONSUMPTION_TIME_INVALID');
  const observedAt = now.toISOString();
  const verification = verifyCryptographicApprovalEnvelope({
    envelope, trustRegistry, expectedTrustRegistryDigest, now: observedAt,
  });
  bindExpectedSubject(verification, expectedSubject);
  const receipt = consumptionReceipt(verification, observedAt);
  requireValue(Buffer.byteLength(JSON.stringify(receipt), 'utf8') <= 65536,
    'APPROVAL_CONSUMPTION_TOO_LARGE');
  return { verificationReceipt: verification, consumptionReceipt: receipt };
}

export async function consumePreparedCryptographicApprovalInTransaction(client, preparedInput) {
  requireValue(client && typeof client.query === 'function', 'APPROVAL_CONSUMPTION_CLIENT_INVALID');
  const prepared = snapshotJson(preparedInput);
  requireExactRecord(prepared, ['verificationReceipt', 'consumptionReceipt'],
    'APPROVAL_CONSUMPTION_PREPARED_SHAPE_INVALID');
  const verification = verifyCryptographicApprovalReceipt(prepared.verificationReceipt);
  const receipt = verifyApprovalConsumptionReceipt(prepared.consumptionReceipt);
  requireValue(receipt.approvalVerificationReceiptDigest === verification.receiptDigest
    && receipt.envelopeId === verification.envelopeId
    && receipt.envelopeDigest === verification.envelopeDigest
    && receipt.trustRegistryDigest === verification.trustRegistryDigest,
  'APPROVAL_CONSUMPTION_PREPARED_BINDING_INVALID');
  const inserted = await client.query(`INSERT INTO kidults_control.cryptographic_approval_consumptions
      (envelope_id, envelope_digest, nonce_digest, matrix_contract_digest,
       trust_registry_digest, requested_capabilities_digest,
       authority_class, subject_type, subject_id,
       subject_digest, approval_verification_receipt_digest, consumption_id, consumed_at,
       consumption_json, receipt_digest, writer_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16)
      ON CONFLICT DO NOTHING RETURNING *`, [receipt.envelopeId, receipt.envelopeDigest,
      receipt.nonceDigest, receipt.matrixContractDigest, receipt.trustRegistryDigest,
      receipt.requestedCapabilitiesDigest, receipt.authorityClass, receipt.subjectType,
      receipt.subjectId, receipt.subjectDigest, receipt.approvalVerificationReceiptDigest,
      receipt.consumptionId, receipt.consumedAt, JSON.stringify(receipt), receipt.receiptDigest,
      WRITER_ID]);
  if (!inserted.rows?.length) {
    const rows = (await client.query(`SELECT * FROM kidults_control.cryptographic_approval_consumptions
        WHERE envelope_id=$1 OR nonce_digest=$2 ORDER BY envelope_id`,
    [receipt.envelopeId, receipt.nonceDigest])).rows ?? [];
    requireValue(rows.length === 1, 'APPROVAL_CONSUMPTION_REPLAY_READBACK_INVALID');
    const existing = verifyApprovalConsumptionReceipt(jsonValue(rows[0].consumption_json));
    requireValue(rowMatches(rows[0], existing), 'APPROVAL_CONSUMPTION_READBACK_MISMATCH');
    requireValue(existing.envelopeId === receipt.envelopeId
      && existing.envelopeDigest === receipt.envelopeDigest
      && existing.nonceDigest === receipt.nonceDigest,
    'APPROVAL_CONSUMPTION_REPLAY_CONFLICT');
    return { state: 'ALREADY_CONSUMED_HOLD', verificationReceipt: verification,
      consumptionReceipt: null, activationAuthorized: false };
  }
  requireValue(rowMatches(inserted.rows[0], receipt),
    'APPROVAL_CONSUMPTION_READBACK_MISMATCH');
  return { state: 'CONSUMED_AUTHORITY_NOT_ACTIVATED',
    verificationReceipt: verification, consumptionReceipt: receipt,
    activationAuthorized: false };
}
