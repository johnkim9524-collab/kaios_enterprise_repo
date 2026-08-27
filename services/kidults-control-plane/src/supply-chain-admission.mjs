import { executeCanonicalCommand } from './command-ledger.mjs';

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const RIGHTS = new Set([
  'collect_allowed', 'store_allowed', 'transform_allowed',
  'model_use_allowed', 'display_allowed', 'post_exit_allowed',
]);
const required = (value, name) => {
  if (value === undefined || value === null || value === '') throw new Error(`${name}_REQUIRED`);
  return value;
};
const digest = (value, name) => {
  if (!DIGEST.test(required(value, name))) throw new Error(`${name}_INVALID`);
  return value;
};
const instant = (value, name) => {
  const parsed = new Date(required(value, name));
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${name}_INVALID`);
  return parsed;
};

export async function admitSupplyChainRun({
  client,
  organizationId,
  actorSubject,
  sourceId,
  rightsDecisionId,
  purposeCode,
  fieldSetDigest,
  sourceTimestamp,
  acquiredAt,
  rawDigest,
  normalizedDigest,
  codeVersion,
  schemaVersion,
  expectedCardinality,
  actualCardinality,
  replayCommandDigest,
  requiredRights = ['collect_allowed', 'store_allowed', 'transform_allowed'],
  idempotencyKey,
  requestId,
  traceId,
  policyVersion = 'control-plane-v1',
  now,
  id,
}) {
  required(sourceId, 'SOURCE_ID');
  required(rightsDecisionId, 'RIGHTS_DECISION_ID');
  required(purposeCode, 'PURPOSE_CODE');
  digest(fieldSetDigest, 'FIELD_SET_DIGEST');
  digest(rawDigest, 'RAW_DIGEST');
  digest(normalizedDigest, 'NORMALIZED_DIGEST');
  digest(replayCommandDigest, 'REPLAY_COMMAND_DIGEST');
  required(codeVersion, 'CODE_VERSION');
  required(schemaVersion, 'SCHEMA_VERSION');
  if (!Number.isSafeInteger(expectedCardinality) || expectedCardinality < 0) throw new Error('EXPECTED_CARDINALITY_INVALID');
  if (!Number.isSafeInteger(actualCardinality) || actualCardinality < 0) throw new Error('ACTUAL_CARDINALITY_INVALID');
  if (expectedCardinality !== actualCardinality) throw new Error('SUPPLY_CHAIN_CARDINALITY_MISMATCH');
  const sourceAt = instant(sourceTimestamp, 'SOURCE_TIMESTAMP');
  const acquired = instant(acquiredAt, 'ACQUIRED_AT');
  if (sourceAt > acquired) throw new Error('SUPPLY_CHAIN_SOURCE_TIMESTAMP_FUTURE');
  if (!Array.isArray(requiredRights) || requiredRights.length === 0 || requiredRights.some(right => !RIGHTS.has(right))) {
    throw new Error('REQUIRED_RIGHTS_INVALID');
  }

  return executeCanonicalCommand({
    client,
    organizationId,
    actorSubject,
    commandType: 'source.supply_run.admit',
    idempotencyKey,
    requestId,
    traceId,
    policyVersion,
    payload: {
      sourceId, rightsDecisionId, purposeCode, fieldSetDigest, sourceTimestamp,
      acquiredAt, rawDigest, normalizedDigest, codeVersion, schemaVersion,
      expectedCardinality, actualCardinality, replayCommandDigest, requiredRights,
    },
    aggregateType: 'source_admission',
    aggregateId: sourceId,
    eventType: 'source.admission.changed',
    eventPayload: (context, result) => ({
      source_id: sourceId,
      purpose_code: purposeCode,
      field_set_digest: fieldSetDigest,
      rights_decision: 'PASS',
      expires_at: result.rightsExpiresAt,
      last_supply_chain_run_id: context.commandId,
      last_normalized_digest: normalizedDigest,
    }),
    writerId: 'kpmo-supply-chain-admission-v1',
    now,
    id,
    apply: async (db, context) => {
      const rights = await db.query(`
        SELECT rd.decision,rd.collect_allowed,rd.store_allowed,rd.transform_allowed,
          rd.model_use_allowed,rd.display_allowed,rd.post_exit_allowed,
          rd.field_set_digest,rd.expires_at,ds.canonical_source_id
        FROM kidults_control.source_rights_decisions rd
        JOIN kidults_control.data_sources ds ON ds.source_id=rd.source_id
        WHERE rd.rights_decision_id=$1 AND rd.source_id=$2 AND rd.purpose_code=$3
          AND rd.field_set_digest=$4
        FOR SHARE
      `, [rightsDecisionId, sourceId, purposeCode, fieldSetDigest]);
      const row = rights.rows?.[0];
      if (!row) throw new Error('SUPPLY_CHAIN_RIGHTS_DECISION_NOT_FOUND_OR_MISMATCHED');
      if (row.decision !== 'PASS') throw new Error('SUPPLY_CHAIN_RIGHTS_NOT_PASS');
      if (row.expires_at && instant(row.expires_at, 'RIGHTS_EXPIRY') <= acquired) {
        throw new Error('SUPPLY_CHAIN_RIGHTS_EXPIRED');
      }
      const denied = requiredRights.filter(right => row[right] !== true);
      if (denied.length) throw new Error(`SUPPLY_CHAIN_REQUIRED_RIGHT_DENIED:${denied.join(',')}`);
      await db.query(`
        INSERT INTO kidults_control.supply_chain_runs (
          supply_chain_run_id,source_id,rights_decision_id,source_timestamp,acquired_at,
          raw_digest,normalized_digest,code_version,schema_version,expected_cardinality,
          actual_cardinality,replay_command_digest,admission_state,writer_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ADMITTED',$13)
      `, [context.commandId, sourceId, rightsDecisionId, sourceAt.toISOString(), acquired.toISOString(),
        rawDigest, normalizedDigest, codeVersion, schemaVersion, expectedCardinality,
        actualCardinality, replayCommandDigest, context.writerId]);
      return {
        supplyChainRunId: context.commandId,
        canonicalSourceId: row.canonical_source_id,
        rightsDecisionId,
        purposeCode,
        rightsExpiresAt: row.expires_at ? instant(row.expires_at, 'RIGHTS_EXPIRY').toISOString() : null,
      };
    },
  });
}
