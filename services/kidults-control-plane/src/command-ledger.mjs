import { createHash, randomUUID } from 'node:crypto';

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name}_REQUIRED`);
  return value;
}

function uuid(value, name) {
  required(value, name);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

export async function executeCanonicalCommand({
  client,
  organizationId,
  actorSubject,
  commandType,
  idempotencyKey,
  requestId,
  traceId,
  policyVersion,
  payload,
  aggregateType,
  aggregateId,
  eventType,
  eventPayload,
  apply,
  writerId = 'kpmo-command-service-v1',
  now = () => new Date(),
  id = () => randomUUID()
}) {
  if (!client?.query) throw new Error('POSTGRES_CLIENT_REQUIRED');
  uuid(organizationId, 'ORGANIZATION_ID');
  required(actorSubject, 'ACTOR_SUBJECT');
  required(commandType, 'COMMAND_TYPE');
  required(idempotencyKey, 'IDEMPOTENCY_KEY');
  required(requestId, 'REQUEST_ID');
  required(traceId, 'TRACE_ID');
  required(policyVersion, 'POLICY_VERSION');
  required(aggregateType, 'AGGREGATE_TYPE');
  required(aggregateId, 'AGGREGATE_ID');
  required(eventType, 'EVENT_TYPE');
  required(writerId, 'WRITER_ID');
  if (typeof apply !== 'function') throw new Error('CANONICAL_APPLY_REQUIRED');

  const commandId = id();
  const outboxEventId = id();
  const auditEventId = id();
  const occurredAt = now().toISOString();
  const payloadDigest = sha256(canonicalJson(payload));

  await client.query('BEGIN');
  try {
    await client.query("SELECT set_config('kidults.writer_id', $1, true)", [writerId]);
    await client.query("SELECT set_config('kidults.organization_id', $1, true)", [organizationId]);

    // Serialize commands per tenant. This also closes the empty-audit-chain
    // race where two first events could otherwise both claim sequence 1.
    const organization = await client.query(`
      SELECT organization_id FROM kidults_control.organizations
      WHERE organization_id=$1 FOR UPDATE
    `, [organizationId]);
    if (!organization.rows?.length) throw new Error('ORGANIZATION_NOT_FOUND_OR_NOT_AUTHORIZED');

    const command = await client.query(`
      INSERT INTO kidults_control.commands (
        command_id,organization_id,idempotency_key,command_type,actor_subject,
        request_id,trace_id,payload_digest,writer_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (organization_id,idempotency_key) DO NOTHING
      RETURNING command_id
    `, [commandId, organizationId, idempotencyKey, commandType, actorSubject,
      requestId, traceId, payloadDigest, writerId]);

    if (!command.rows?.length) {
      await client.query('ROLLBACK');
      return { state: 'IDEMPOTENT_DUPLICATE', organizationId, idempotencyKey };
    }

    const result = await apply(client, {
      commandId, organizationId, writerId, actorSubject, requestId, traceId, occurredAt
    });
    const resolvedEventPayload = typeof eventPayload === 'function'
      ? eventPayload({ commandId, outboxEventId, organizationId, occurredAt }, result)
      : eventPayload;
    const eventJson = canonicalJson(resolvedEventPayload);
    const eventHash = sha256(eventJson);

    const previous = await client.query(`
      SELECT sequence_no,event_hash FROM kidults_control.audit_events
      WHERE organization_id=$1 ORDER BY sequence_no DESC LIMIT 1 FOR UPDATE
    `, [organizationId]);
    const previousSequence = Number(previous.rows?.[0]?.sequence_no || 0);
    const previousHash = previous.rows?.[0]?.event_hash || null;
    const sequenceNo = previousSequence + 1;
    const auditMaterial = canonicalJson({
      auditEventId, organizationId, sequenceNo, actorSubject, action: commandType,
      aggregateType, aggregateId, outcome: 'ALLOW', requestId, traceId,
      policyVersion, previousHash, occurredAt, eventHash
    });
    const auditHash = sha256(auditMaterial);

    await client.query(`
      INSERT INTO kidults_control.audit_events (
        audit_event_id,organization_id,sequence_no,actor_subject,action,resource_type,
        resource_id,outcome,reason,request_id,trace_id,policy_version,before_digest,
        after_digest,previous_event_hash,event_hash,occurred_at,writer_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'ALLOW',$8,$9,$10,$11,NULL,$12,$13,$14,$15,$16)
    `, [auditEventId, organizationId, sequenceNo, actorSubject, commandType,
      aggregateType, aggregateId, `COMMAND_ACCEPTED:${commandId}`, requestId,
      traceId, policyVersion, eventHash, previousHash, auditHash, occurredAt, writerId]);

    await client.query(`
      INSERT INTO kidults_control.outbox_events (
        outbox_event_id,organization_id,aggregate_type,aggregate_id,event_type,
        source_schema_version,payload_json,payload_hash,writer_id,created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
    `, [outboxEventId, organizationId, aggregateType, aggregateId, eventType,
      policyVersion, eventJson, eventHash, writerId, occurredAt]);

    await client.query('COMMIT');
    return {
      state: 'COMMITTED', commandId, auditEventId, outboxEventId,
      organizationId, eventHash, auditHash, result
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export const commandLedgerInternals = { canonicalJson, sha256 };
