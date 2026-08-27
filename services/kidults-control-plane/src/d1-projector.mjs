const PROJECTOR_ID = 'kpmo-d1-projector-v1';

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name}_REQUIRED`);
  return value;
}

function base(event) {
  required(event?.outbox_event_id, 'SOURCE_EVENT_ID');
  required(event?.payload_hash, 'SOURCE_EVENT_HASH');
  required(event?.source_schema_version, 'SOURCE_SCHEMA_VERSION');
  required(event?.created_at, 'SOURCE_CREATED_AT');
  if (!/^sha256:[0-9a-f]{64}$/.test(event.payload_hash)) throw new Error('SOURCE_EVENT_HASH_INVALID');
  const createdAt = new Date(event.created_at);
  if (Number.isNaN(createdAt.valueOf())) throw new Error('SOURCE_CREATED_AT_INVALID');
  return [event.outbox_event_id, event.payload_hash, event.source_schema_version, PROJECTOR_ID, createdAt.toISOString()];
}

const monotonicWhere = table => `
    WHERE excluded.projected_at>${table}.projected_at
       OR (excluded.projected_at=${table}.projected_at
           AND excluded.source_event_id>${table}.source_event_id)`;

const handlers = {
  'organization.access.changed': (db, event, payload) => db.prepare(`
    INSERT INTO organization_access_projection (
      organization_id,subject_id,organization_state,membership_state,role_code,
      permissions_json,source_event_id,source_event_hash,source_schema_version,projector_id,projected_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(organization_id,subject_id) DO UPDATE SET
      organization_state=excluded.organization_state,membership_state=excluded.membership_state,
      role_code=excluded.role_code,permissions_json=excluded.permissions_json,
      source_event_id=excluded.source_event_id,source_event_hash=excluded.source_event_hash,
      source_schema_version=excluded.source_schema_version,projector_id=excluded.projector_id,
      projected_at=excluded.projected_at
    ${monotonicWhere('organization_access_projection')}
  `).bind(
    required(payload.organization_id, 'ORGANIZATION_ID'), required(payload.subject_id, 'SUBJECT_ID'),
    required(payload.organization_state, 'ORGANIZATION_STATE'), required(payload.membership_state, 'MEMBERSHIP_STATE'),
    required(payload.role_code, 'ROLE_CODE'), JSON.stringify(payload.permissions || []), ...base(event)
  ).run(),

  'subscription.entitlement.changed': (db, event, payload) => db.prepare(`
    INSERT INTO subscription_entitlement_projection (
      organization_id,entitlement_code,subscription_state,entitlement_state,effective_from,
      effective_until,policy_version,source_event_id,source_event_hash,source_schema_version,projector_id,projected_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(organization_id,entitlement_code) DO UPDATE SET
      subscription_state=excluded.subscription_state,entitlement_state=excluded.entitlement_state,
      effective_from=excluded.effective_from,effective_until=excluded.effective_until,
      policy_version=excluded.policy_version,source_event_id=excluded.source_event_id,
      source_event_hash=excluded.source_event_hash,source_schema_version=excluded.source_schema_version,
      projector_id=excluded.projector_id,projected_at=excluded.projected_at
    ${monotonicWhere('subscription_entitlement_projection')}
  `).bind(
    required(payload.organization_id, 'ORGANIZATION_ID'), required(payload.entitlement_code, 'ENTITLEMENT_CODE'),
    required(payload.subscription_state, 'SUBSCRIPTION_STATE'), required(payload.entitlement_state, 'ENTITLEMENT_STATE'),
    required(payload.effective_from, 'EFFECTIVE_FROM'), payload.effective_until || null,
    required(payload.policy_version, 'POLICY_VERSION'), ...base(event)
  ).run(),

  'source.admission.changed': (db, event, payload) => db.prepare(`
    INSERT INTO source_admission_projection (
      source_id,purpose_code,field_set_digest,rights_decision,expires_at,last_supply_chain_run_id,
      last_normalized_digest,source_event_id,source_event_hash,source_schema_version,projector_id,projected_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(source_id,purpose_code,field_set_digest) DO UPDATE SET
      rights_decision=excluded.rights_decision,expires_at=excluded.expires_at,
      last_supply_chain_run_id=excluded.last_supply_chain_run_id,
      last_normalized_digest=excluded.last_normalized_digest,source_event_id=excluded.source_event_id,
      source_event_hash=excluded.source_event_hash,source_schema_version=excluded.source_schema_version,
      projector_id=excluded.projector_id,projected_at=excluded.projected_at
    ${monotonicWhere('source_admission_projection')}
  `).bind(
    required(payload.source_id, 'SOURCE_ID'), required(payload.purpose_code, 'PURPOSE_CODE'),
    required(payload.field_set_digest, 'FIELD_SET_DIGEST'), required(payload.rights_decision, 'RIGHTS_DECISION'),
    payload.expires_at || null, payload.last_supply_chain_run_id || null,
    payload.last_normalized_digest || null, ...base(event)
  ).run(),

  'control.health.changed': (db, event, payload) => db.prepare(`
    INSERT INTO control_plane_health_projection (
      service_name,state,slo_json,projector_lag_seconds,unknown_writer_count,audit_gap_count,
      source_event_id,source_event_hash,source_schema_version,projector_id,projected_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(service_name) DO UPDATE SET state=excluded.state,slo_json=excluded.slo_json,
      projector_lag_seconds=excluded.projector_lag_seconds,unknown_writer_count=excluded.unknown_writer_count,
      audit_gap_count=excluded.audit_gap_count,source_event_id=excluded.source_event_id,
      source_event_hash=excluded.source_event_hash,source_schema_version=excluded.source_schema_version,
      projector_id=excluded.projector_id,projected_at=excluded.projected_at
    ${monotonicWhere('control_plane_health_projection')}
  `).bind(
    required(payload.service_name, 'SERVICE_NAME'), required(payload.state, 'STATE'),
    JSON.stringify(payload.slo || {}), Number(payload.projector_lag_seconds || 0),
    Number(payload.unknown_writer_count || 0), Number(payload.audit_gap_count || 0), ...base(event)
  ).run()
};

export async function projectOutboxEvent(db, event) {
  if (!db?.prepare) throw new Error('D1_BINDING_REQUIRED');
  const handler = handlers[event?.event_type];
  if (!handler) throw new Error(`D1_EVENT_TYPE_NOT_REGISTERED:${event?.event_type || 'UNKNOWN'}`);
  let payload;
  try { payload = typeof event.payload_json === 'string' ? JSON.parse(event.payload_json) : event.payload_json; }
  catch { throw new Error('D1_EVENT_PAYLOAD_INVALID_JSON'); }
  await handler(db, event, payload || {});
  return {
    state: 'PROJECTED', projector_id: PROJECTOR_ID,
    source_event_id: event.outbox_event_id, source_event_hash: event.payload_hash
  };
}

export const d1ProjectorContract = {
  projectorId: PROJECTOR_ID,
  eventTypes: Object.freeze(Object.keys(handlers))
};
