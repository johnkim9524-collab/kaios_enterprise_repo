import { randomUUID } from 'node:crypto';

const required = (value, name) => {
  if (value === undefined || value === null || value === '') throw new Error(`${name}_REQUIRED`);
  return value;
};

function hasSecretLikeKey(value) {
  if (Array.isArray(value)) return value.some(hasSecretLikeKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) =>
    /authorization|cookie|password|secret|token/i.test(key) || hasSecretLikeKey(child));
}

export async function appendObservabilityEvent({
  client,
  organizationId,
  signalType,
  serviceName,
  eventName,
  requestId = null,
  traceId = null,
  payload,
  occurredAt = new Date(),
  writerId = 'kpmo-audit-writer-v1',
  id = () => randomUUID(),
}) {
  if (!client?.query) throw new Error('POSTGRES_CLIENT_REQUIRED');
  required(organizationId, 'ORGANIZATION_ID');
  required(signalType, 'SIGNAL_TYPE');
  required(serviceName, 'SERVICE_NAME');
  required(eventName, 'EVENT_NAME');
  if (!['METRIC', 'LOG', 'TRACE', 'SLO', 'ALERT'].includes(signalType)) throw new Error('SIGNAL_TYPE_INVALID');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('OBSERVABILITY_PAYLOAD_OBJECT_REQUIRED');
  if (hasSecretLikeKey(payload)) throw new Error('OBSERVABILITY_SECRET_LIKE_FIELD_DENIED');
  const serialized = JSON.stringify(payload);

  await client.query('BEGIN');
  try {
    await client.query("SELECT set_config('kidults.writer_id', $1, true)", [writerId]);
    await client.query("SELECT set_config('kidults.organization_id', $1, true)", [organizationId]);
    const observabilityEventId = id();
    await client.query(`
      INSERT INTO kidults_control.observability_events (
        observability_event_id,organization_id,signal_type,service_name,event_name,
        request_id,trace_id,payload_json,occurred_at,writer_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
    `, [observabilityEventId, organizationId, signalType, serviceName, eventName,
      requestId, traceId, serialized, occurredAt.toISOString(), writerId]);
    await client.query('COMMIT');
    return { state: 'RECORDED', observabilityEventId, organizationId, signalType, serviceName, eventName };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
