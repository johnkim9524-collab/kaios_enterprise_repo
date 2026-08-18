export const ASI_EVENT_VERSION = '1.0.0' as const;

export type AsiRightsState = 'ALLOW' | 'DENY' | 'UNKNOWN' | 'NOT_APPLICABLE';
export type AsiFreshnessState = 'CURRENT' | 'STALE' | 'EXPIRED' | 'UNKNOWN';
export type AsiDecision = 'PASS' | 'HOLD' | 'REJECT' | 'NOT_APPLICABLE' | null;

export type AsiEventType =
  | 'SOURCE_DISCOVERED'
  | 'SOURCE_IDENTIFIED'
  | 'SOURCE_CLASSIFICATION_ASSERTED'
  | 'SOURCE_QUALIFICATION_ASSERTED'
  | 'SOURCE_PURPOSE_ADMISSION_DECIDED'
  | 'ACQUISITION_PLANNED'
  | 'SOURCE_RECORD_QUARANTINED'
  | 'SOURCE_RECORD_ADMITTED'
  | 'ENTITY_RESOLUTION_ASSERTED'
  | 'EVIDENCE_ASSERTED'
  | 'MARKET_EVENT_ASSERTED'
  | 'MARKET_CELL_ANALYZED'
  | 'INTELLIGENCE_ELIGIBILITY_DECIDED'
  | 'ENGINE_TASK_HELD'
  | 'ENGINE_TASK_DEAD_LETTERED';

export interface AsiPartition {
  channel: string;
  region: string;
  language: string;
  scope_id: string;
  source_role: string;
  canonical_host_hash: string;
}

export interface AsiEventEnvelope {
  event_id: string;
  event_type: AsiEventType;
  event_version: typeof ASI_EVENT_VERSION;
  occurred_at: string;
  observed_at: string;
  producer_engine: string;
  producer_version: string;
  correlation_id: string;
  causation_id: string | null;
  idempotency_key: string;
  partition: AsiPartition;
  input_snapshot_ref: string;
  payload_hash: string;
  rights_state: AsiRightsState;
  freshness_state: AsiFreshnessState;
  assertion_purpose: string | null;
  decision: AsiDecision;
  reason_codes: string[];
  trace_refs: string[];
  payload: Record<string, unknown>;
}

const eventTypes = new Set<AsiEventType>([
  'SOURCE_DISCOVERED','SOURCE_IDENTIFIED','SOURCE_CLASSIFICATION_ASSERTED','SOURCE_QUALIFICATION_ASSERTED',
  'SOURCE_PURPOSE_ADMISSION_DECIDED','ACQUISITION_PLANNED','SOURCE_RECORD_QUARANTINED','SOURCE_RECORD_ADMITTED',
  'ENTITY_RESOLUTION_ASSERTED','EVIDENCE_ASSERTED','MARKET_EVENT_ASSERTED','MARKET_CELL_ANALYZED',
  'INTELLIGENCE_ELIGIBILITY_DECIDED','ENGINE_TASK_HELD','ENGINE_TASK_DEAD_LETTERED',
]);
const requiredEventKeys = [
  'event_id','event_type','event_version','occurred_at','observed_at','producer_engine','producer_version',
  'correlation_id','causation_id','idempotency_key','partition','input_snapshot_ref','payload_hash','rights_state',
  'freshness_state','payload',
] as const;
const optionalEventKeys = ['assertion_purpose','decision','reason_codes','trace_refs'] as const;
const allowedEventKeys = new Set<string>([...requiredEventKeys,...optionalEventKeys]);
const partitionKeys = ['channel','region','language','scope_id','source_role','canonical_host_hash'] as const;
const decisionValues = new Set<Exclude<AsiDecision,null>>(['PASS','HOLD','REJECT','NOT_APPLICABLE']);
const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const normalizedDateTime = (value: unknown): string => {
  if (!nonEmptyString(value) || !rfc3339.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('ASI_EVENT_TIME_INVALID');
  return new Date(value).toISOString();
};

export function partitionKey(partition: AsiPartition): string {
  return [partition.channel, partition.region, partition.language, partition.scope_id, partition.source_role, partition.canonical_host_hash].join('|');
}

export function validateAsiEvent(value: unknown): AsiEventEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ASI_EVENT_NOT_OBJECT');
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !allowedEventKeys.has(key))) throw new Error('ASI_EVENT_ADDITIONAL_PROPERTY_FORBIDDEN');
  if (requiredEventKeys.some((key) => !Object.hasOwn(raw,key))) throw new Error('ASI_EVENT_REQUIRED_PROPERTY_MISSING');
  const event = raw as unknown as Partial<AsiEventEnvelope>;
  if (!nonEmptyString(event.event_id) || !eventTypes.has(event.event_type as AsiEventType)) throw new Error('ASI_EVENT_ID_OR_TYPE_INVALID');
  if (event.event_version !== ASI_EVENT_VERSION) throw new Error('ASI_EVENT_VERSION_INVALID');
  if (!nonEmptyString(event.producer_engine) || !nonEmptyString(event.producer_version) || !nonEmptyString(event.correlation_id) || !nonEmptyString(event.idempotency_key)) throw new Error('ASI_EVENT_LINEAGE_INVALID');
  if (event.causation_id !== null && typeof event.causation_id !== 'string') throw new Error('ASI_EVENT_CAUSATION_ID_INVALID');
  if (!nonEmptyString(event.input_snapshot_ref) || !/^sha256:[a-f0-9]{64}$/.test(event.payload_hash || '')) throw new Error('ASI_EVENT_SNAPSHOT_OR_HASH_INVALID');
  if (!event.partition || Object.keys(event.partition).length !== partitionKeys.length ||
    Object.keys(event.partition).some((key) => !partitionKeys.includes(key as typeof partitionKeys[number])) ||
    partitionKeys.some((key) => typeof event.partition?.[key] !== 'string' || !event.partition[key])) throw new Error('ASI_EVENT_PARTITION_INVALID');
  const occurredAt = normalizedDateTime(event.occurred_at);
  const observedAt = normalizedDateTime(event.observed_at);
  if (!['ALLOW','DENY','UNKNOWN','NOT_APPLICABLE'].includes(event.rights_state || '')) throw new Error('ASI_EVENT_RIGHTS_INVALID');
  if (!['CURRENT','STALE','EXPIRED','UNKNOWN'].includes(event.freshness_state || '')) throw new Error('ASI_EVENT_FRESHNESS_INVALID');
  if (event.assertion_purpose !== undefined && event.assertion_purpose !== null && typeof event.assertion_purpose !== 'string') throw new Error('ASI_EVENT_ASSERTION_PURPOSE_INVALID');
  if (event.decision !== undefined && event.decision !== null && !decisionValues.has(event.decision)) throw new Error('ASI_EVENT_DECISION_INVALID');
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) throw new Error('ASI_EVENT_PAYLOAD_INVALID');
  if (event.reason_codes !== undefined && (!Array.isArray(event.reason_codes) || event.reason_codes.some((item) => typeof item !== 'string'))) throw new Error('ASI_EVENT_REASON_CODES_INVALID');
  if (event.trace_refs !== undefined && (!Array.isArray(event.trace_refs) || event.trace_refs.some((item) => typeof item !== 'string'))) throw new Error('ASI_EVENT_TRACE_REFS_INVALID');
  if (event.reason_codes && new Set(event.reason_codes).size !== event.reason_codes.length) throw new Error('ASI_EVENT_REASON_CODES_NOT_UNIQUE');
  if (event.trace_refs && new Set(event.trace_refs).size !== event.trace_refs.length) throw new Error('ASI_EVENT_TRACE_REFS_NOT_UNIQUE');
  return {
    ...(event as AsiEventEnvelope),
    occurred_at: occurredAt,
    observed_at: observedAt,
    assertion_purpose: event.assertion_purpose ?? null,
    decision: event.decision ?? null,
    reason_codes: event.reason_codes ?? [],
    trace_refs: event.trace_refs ?? [],
  };
}
