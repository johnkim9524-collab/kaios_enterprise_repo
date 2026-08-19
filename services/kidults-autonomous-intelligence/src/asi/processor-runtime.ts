import { partitionKey, type AsiDecision, type AsiEventEnvelope, type AsiRightsState } from './event';
import {
  ASI_BOUNDED_SHADOW_PURPOSE,
  ASI_BOUNDED_SHADOW_REQUIRED_ASSERTIONS,
  ASI_PROCESSOR_VERSION,
  canonicalJson,
  evaluateBoundedShadowAdmission,
  processAsiFleet,
  sha256Ref,
  type AsiProcessorAssertionRecord,
  type AsiProcessorResult,
} from './processors';
import type { AsiFleet } from './registry';
import type { AsiMeshEnv, AsiQueueTask } from './runtime';

export interface AsiProcessorRuntimeHooks {
  stageEvent(event: AsiEventEnvelope): Promise<void>;
  dispatchEvent(eventId: string): Promise<void>;
}

export interface AsiProcessorRuntimeResult {
  processor: AsiProcessorResult;
  emitted_event_ids: string[];
  fan_in_group_id: string | null;
  source_pool_state: string | null;
}

type ReadinessRow = {
  group_id:string;
  source_id:string;
  purpose:string;
  partition_key:string;
  stage:'CLASSIFICATION'|'QUALIFICATION';
  input_snapshot_ref:string;
  required_fleet_count:number;
  satisfied_fleet_count:number;
  pass_count:number;
  hold_count:number;
  reject_count:number;
  readiness_state:string;
};

type SummaryRow = {
  assertion_id:string;
  engine_fleet:string;
  decision:string;
  rights_state:string;
  reason_codes_json:string;
  event_id:string;
};

type CandidateGateRow = {
  candidate_state:string;
  rights_state:string;
  freshness_state:string;
  purpose:string;
  partition_key:string;
};

type AdmissionGateRow = {
  source_id:string;
  purpose:string;
  decision:string;
  rights_state:string;
  input_snapshot_ref:string;
  source_event_id:string;
  required_assertion_count:number;
  satisfied_assertion_count:number;
  decided_at:string;
  review_due_at:string;
  superseded_at:string|null;
  revoked_at:string|null;
};

const POLICY_VERSION = 'kidults-asi-purpose-specific-admission-policy-v1@1.0.0';
const HOST_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const nowIso = () => new Date().toISOString();

function record(value: unknown): Record<string,unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
}

function stringValue(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

function addDays(value: string, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function decisionFromReadiness(readiness: ReadinessRow): Exclude<AsiDecision,null> {
  if (Number(readiness.reject_count) > 0 || readiness.readiness_state === 'REJECT') return 'REJECT';
  if (readiness.readiness_state === 'READY') return 'PASS';
  return 'HOLD';
}

async function deterministicId(prefix: string, value: unknown): Promise<string> {
  const hash = await sha256Ref(value);
  return `${prefix}_${hash.slice(7,39)}`;
}

async function canonicalHostIdentity(canonicalHost: string): Promise<{
  hostHash:string;
  siteId:string;
}> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalHost)));
  const hex = Array.from(digest,(byte) => byte.toString(16).padStart(2,'0')).join('');
  return {hostHash:`sha256:${hex}`,siteId:`site-${hex.slice(0,32)}`};
}

async function materializedEvent(
  input: AsiEventEnvelope,
  producer: string,
  eventType: AsiEventEnvelope['event_type'],
  payload: Record<string,unknown>,
  decision: Exclude<AsiDecision,null>,
  rightsState: AsiRightsState,
  reasonCodes: string[],
  traceRefs: string[],
): Promise<AsiEventEnvelope> {
  const normalizedPayload = JSON.parse(canonicalJson(payload)) as Record<string,unknown>;
  const payloadHash = await sha256Ref(normalizedPayload);
  const identity = await sha256Ref({
    producer,event_type:eventType,input_event_id:input.event_id,input_snapshot_ref:input.input_snapshot_ref,payload_hash:payloadHash,
  });
  const suffix = identity.slice(7,39);
  const purpose = input.assertion_purpose || (typeof payload.purpose === 'string' && payload.purpose.trim()
    ? payload.purpose.trim()
    : ASI_BOUNDED_SHADOW_PURPOSE);
  return {
    event_id:`evt_${suffix}`,
    event_type:eventType,
    event_version:'1.0.0',
    occurred_at:input.observed_at,
    observed_at:input.observed_at,
    producer_engine:producer,
    producer_version:ASI_PROCESSOR_VERSION,
    correlation_id:input.correlation_id,
    causation_id:input.event_id,
    idempotency_key:`asi:${producer}:${input.event_id}:${suffix}`,
    partition:{...input.partition},
    input_snapshot_ref:input.input_snapshot_ref,
    payload_hash:payloadHash,
    rights_state:rightsState,
    freshness_state:input.freshness_state,
    assertion_purpose:purpose,
    decision,
    reason_codes:[...new Set(reasonCodes)].sort(),
    trace_refs:[...new Set([...input.trace_refs,input.event_id,...traceRefs])].sort(),
    payload:normalizedPayload,
  };
}

async function recordDiscoveryCandidate(
  env: AsiMeshEnv,
  fleet: AsiFleet,
  result: AsiProcessorResult,
): Promise<void> {
  const event = result.output_event;
  const seed = record(event.payload.discovery_seed);
  const canonicalHost = stringValue(seed.canonical_host,'ASI_DISCOVERY_CANONICAL_HOST_REQUIRED').toLowerCase().replace(/^www\./,'');
  if (!HOST_PATTERN.test(canonicalHost)) throw new Error('ASI_DISCOVERY_CANONICAL_HOST_INVALID');
  const sourceId = result.source_id;
  const canonicalIdentity = await canonicalHostIdentity(canonicalHost);
  if (event.partition.canonical_host_hash !== canonicalIdentity.hostHash) {
    throw new Error('ASI_DISCOVERY_CANONICAL_HOST_HASH_MISMATCH');
  }
  if (seed.canonical_site_id !== undefined && seed.canonical_site_id !== canonicalIdentity.siteId) {
    throw new Error('ASI_DISCOVERY_CANONICAL_SITE_ID_MISMATCH');
  }
  const canonicalSiteId = canonicalIdentity.siteId;
  const purpose = event.assertion_purpose || ASI_BOUNDED_SHADOW_PURPOSE;
  const key = partitionKey(event.partition);
  const recordedAt = nowIso();
  const candidateState = event.decision === 'REJECT' ? 'REJECTED' : event.decision === 'PASS' ? 'DISCOVERED' : 'HOLD';
  const observationId = await deterministicId('observation',{event_id:event.event_id,source_id:sourceId,fleet:fleet.id});
  const seedRef = typeof seed.seed_ref === 'string' ? seed.seed_ref : null;
  const existing = await env.DB.prepare(`
    SELECT canonical_site_id,canonical_host,canonical_host_hash,purpose,partition_key
    FROM asi_source_candidates WHERE source_id=?
  `).bind(sourceId).first<Record<string,string>>();
  if (existing && (existing.canonical_site_id !== canonicalSiteId || existing.canonical_host !== canonicalHost ||
    existing.canonical_host_hash !== event.partition.canonical_host_hash || existing.purpose !== purpose ||
    existing.partition_key !== key)) {
    // Reject before the append batch. The database provenance trigger repeats
    // this identity check so a concurrent first-observation race also rolls the
    // whole batch back instead of committing a poisoned observation.
    throw new Error('ASI_SOURCE_CANDIDATE_IDEMPOTENCY_CONFLICT');
  }
  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO asi_source_candidates (
        source_id,canonical_site_id,canonical_host,canonical_host_hash,purpose,partition_key,channel,region,language,scope_id,
        source_role,discovery_engine_fleet,discovery_event_id,input_snapshot_ref,payload_hash,rights_state,freshness_state,
        candidate_state,idempotency_key,first_seen_at,last_seen_at,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      sourceId,canonicalSiteId,canonicalHost,event.partition.canonical_host_hash,purpose,key,event.partition.channel,
      event.partition.region,event.partition.language,event.partition.scope_id,event.partition.source_role,fleet.id,event.event_id,
      event.input_snapshot_ref,event.payload_hash,event.rights_state,event.freshness_state,candidateState,
      `candidate:${event.event_id}`,event.observed_at,event.observed_at,recordedAt,recordedAt,
    ),
    env.DB.prepare(`
      INSERT OR IGNORE INTO asi_source_candidate_observations (
        observation_id,source_id,discovery_event_id,discovery_engine_fleet,discovery_channel,input_snapshot_ref,payload_hash,
        rights_state,freshness_state,provenance_json,idempotency_key,observed_at,recorded_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      observationId,sourceId,event.event_id,fleet.id,event.partition.channel,event.input_snapshot_ref,event.payload_hash,
      event.rights_state,event.freshness_state,canonicalJson({seed_ref:seedRef,metadata_only:true,target_collection_authorized:false}),
      `observation:${event.event_id}:${fleet.id}`,event.observed_at,recordedAt,
    ),
  ]);
  const stored = await env.DB.prepare(`
    SELECT canonical_site_id,canonical_host,canonical_host_hash,purpose,partition_key
    FROM asi_source_candidates WHERE source_id=?
  `).bind(sourceId).first<Record<string,string>>();
  if (!stored || stored.canonical_site_id !== canonicalSiteId || stored.canonical_host !== canonicalHost ||
    stored.canonical_host_hash !== event.partition.canonical_host_hash || stored.purpose !== purpose || stored.partition_key !== key) {
    throw new Error('ASI_SOURCE_CANDIDATE_IDEMPOTENCY_CONFLICT');
  }
}

async function fanInGroupId(result: AsiProcessorResult): Promise<string> {
  return deterministicId('fanin',{
    source_id:result.source_id,purpose:result.output_event.assertion_purpose,partition:partitionKey(result.output_event.partition),
    stage:result.stage,input_snapshot_ref:result.output_event.input_snapshot_ref,
  });
}

async function recordProcessorAssertions(
  env: AsiMeshEnv,
  task: AsiQueueTask,
  messageId: string,
  result: AsiProcessorResult,
): Promise<string> {
  if (!result.fan_in_assertion || (result.stage !== 'CLASSIFICATION' && result.stage !== 'QUALIFICATION')) {
    throw new Error('ASI_PROCESSOR_FAN_IN_ASSERTION_REQUIRED');
  }
  const event = result.output_event;
  const purpose = event.assertion_purpose || ASI_BOUNDED_SHADOW_PURPOSE;
  const key = partitionKey(event.partition);
  const groupId = await fanInGroupId(result);
  const recordedAt = nowIso();
  const assertions = [...result.assertions,result.fan_in_assertion];
  const statements: D1PreparedStatement[] = [env.DB.prepare(`
    INSERT OR IGNORE INTO asi_processor_fan_in_groups (
      group_id,source_id,purpose,partition_key,stage,correlation_id,input_snapshot_ref,idempotency_key,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(groupId,result.source_id,purpose,key,result.stage,event.correlation_id,event.input_snapshot_ref,`fanin:${groupId}`,recordedAt)];

  for (const assertion of assertions) {
    statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO asi_processor_assertions (
        assertion_id,source_id,purpose,partition_key,stage,engine_fleet,assertion_type,decision,rights_state,freshness_state,
        event_id,causation_event_id,source_outbox_id,source_message_id,correlation_id,input_snapshot_ref,
        assertion_payload_hash,payload_hash,result_json,reason_codes_json,engine_version,idempotency_key,observed_at,recorded_at,
        supersedes_assertion_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      assertion.assertion_id,result.source_id,purpose,key,result.stage,result.fleet_id,assertion.assertion_type,
      assertion.decision,assertion.rights_state,event.freshness_state,event.event_id,task.event.event_id,task.outbox_id,
      messageId,event.correlation_id,event.input_snapshot_ref,assertion.assertion_payload_hash,event.payload_hash,
      canonicalJson(assertion),JSON.stringify(assertion.reason_codes),assertion.engine_version,
      `processor:${assertion.assertion_id}`,assertion.observed_at,recordedAt,assertion.supersedes_assertion_id,
    ));
    if (!assertion.assertion_type.startsWith('FLEET_SUMMARY:')) {
      statements.push(env.DB.prepare(`
        INSERT OR IGNORE INTO asi_engine_assertions (
          assertion_id,source_id,engine_fleet,assertion_type,purpose,decision,rights_state,payload_hash,event_id,
          engine_version,observed_at,supersedes_assertion_id
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        assertion.assertion_id,result.source_id,result.fleet_id,assertion.assertion_type,purpose,assertion.decision,
        assertion.rights_state,assertion.assertion_payload_hash,event.event_id,assertion.engine_version,
        assertion.observed_at,assertion.supersedes_assertion_id,
      ));
    }
  }
  statements.push(env.DB.prepare(`
    INSERT OR IGNORE INTO asi_processor_fan_in_members (group_id,engine_fleet,assertion_id,linked_at)
    VALUES (?,?,?,?)
  `).bind(groupId,result.fleet_id,result.fan_in_assertion.assertion_id,recordedAt));
  await env.DB.batch(statements);
  const member = await env.DB.prepare(`
    SELECT m.assertion_id,a.event_id,a.payload_hash FROM asi_processor_fan_in_members m
    JOIN asi_processor_assertions a ON a.assertion_id=m.assertion_id
    WHERE m.group_id=? AND m.engine_fleet=?
  `).bind(groupId,result.fleet_id).first<{assertion_id:string;event_id:string;payload_hash:string}>();
  if (!member || member.assertion_id !== result.fan_in_assertion.assertion_id || member.event_id !== event.event_id ||
    member.payload_hash !== event.payload_hash) throw new Error('ASI_PROCESSOR_ASSERTION_IDEMPOTENCY_CONFLICT');
  return groupId;
}

async function readiness(env: AsiMeshEnv, groupId: string): Promise<ReadinessRow> {
  const value = await env.DB.prepare(`SELECT * FROM asi_processor_fan_in_readiness WHERE group_id=?`)
    .bind(groupId).first<ReadinessRow>();
  if (!value) throw new Error('ASI_PROCESSOR_FAN_IN_READINESS_MISSING');
  return value;
}

async function summaryRows(env: AsiMeshEnv, groupId: string): Promise<SummaryRow[]> {
  const values = await env.DB.prepare(`
    SELECT a.assertion_id,a.engine_fleet,a.decision,a.rights_state,a.reason_codes_json,a.event_id
    FROM asi_processor_fan_in_members m JOIN asi_processor_assertions a ON a.assertion_id=m.assertion_id
    WHERE m.group_id=? ORDER BY a.engine_fleet
  `).bind(groupId).all<SummaryRow>();
  return values.results || [];
}

async function materializeClassification(
  env: AsiMeshEnv,
  task: AsiQueueTask,
  groupId: string,
  hooks: AsiProcessorRuntimeHooks,
): Promise<AsiEventEnvelope | null> {
  const state = await readiness(env,groupId);
  if (Number(state.satisfied_fleet_count) !== Number(state.required_fleet_count)) return null;
  const summaries = await summaryRows(env,groupId);
  const decision = decisionFromReadiness(state);
  const reasons = summaries.flatMap((row) => JSON.parse(row.reason_codes_json) as string[]);
  if (state.readiness_state !== 'READY') reasons.push(`CLASSIFICATION_FAN_IN_${state.readiness_state}`);
  const payload = {
    ...task.event.payload,
    source_id:state.source_id,
    purpose:state.purpose,
    classification_group_id:groupId,
    classification_fan_in_state:state.readiness_state,
    required_classifier_count:Number(state.required_fleet_count),
    satisfied_classifier_count:Number(state.satisfied_fleet_count),
    classification_assertion_ids:summaries.map((row) => row.assertion_id),
    market_claim_authorized:false,
    public_projection_authorized:false,
    production_authorized:false,
  };
  const event = await materializedEvent(
    task.event,'SOURCE_CLASSIFICATION_FAN_IN_MATERIALIZER','SOURCE_IDENTIFIED',payload,decision,
    task.event.rights_state,reasons,summaries.flatMap((row) => [row.assertion_id,row.event_id]),
  );
  await hooks.stageEvent(event);
  await hooks.dispatchEvent(event.event_id);
  return event;
}

async function loadAdmissionAssertions(
  env: AsiMeshEnv,
  sourceId: string,
  purpose: string,
  key: string,
  snapshot: string,
): Promise<AsiProcessorAssertionRecord[]> {
  const rows = await env.DB.prepare(`
    SELECT result_json FROM asi_processor_assertions
    WHERE source_id=? AND purpose=? AND partition_key=? AND input_snapshot_ref=?
      AND stage IN ('CLASSIFICATION','QUALIFICATION')
    ORDER BY stage,engine_fleet,assertion_type
  `).bind(sourceId,purpose,key,snapshot).all<{result_json:string}>();
  return (rows.results || []).map((row) => JSON.parse(row.result_json) as AsiProcessorAssertionRecord);
}

async function materializeAdmission(
  env: AsiMeshEnv,
  task: AsiQueueTask,
  qualificationGroupId: string,
  hooks: AsiProcessorRuntimeHooks,
): Promise<AsiEventEnvelope | null> {
  const qualification = await readiness(env,qualificationGroupId);
  if (Number(qualification.satisfied_fleet_count) !== Number(qualification.required_fleet_count)) return null;
  const sourceId = qualification.source_id;
  const purpose = qualification.purpose;
  const key = qualification.partition_key;
  const classification = await env.DB.prepare(`
    SELECT * FROM asi_processor_fan_in_readiness
    WHERE source_id=? AND purpose=? AND partition_key=? AND stage='CLASSIFICATION' AND input_snapshot_ref=?
    LIMIT 1
  `).bind(sourceId,purpose,key,qualification.input_snapshot_ref).first<ReadinessRow>();
  if (!classification || Number(classification.satisfied_fleet_count) !== Number(classification.required_fleet_count)) return null;
  if (purpose !== ASI_BOUNDED_SHADOW_PURPOSE) return null;
  const assertions = await loadAdmissionAssertions(env,sourceId,purpose,key,qualification.input_snapshot_ref);
  const evaluated = await evaluateBoundedShadowAdmission({source_event:task.event,assertions});
  const candidate = await env.DB.prepare(`
    SELECT CASE o.discovery_decision WHEN 'PASS' THEN 'DISCOVERED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'HOLD' END AS candidate_state,
      o.rights_state,o.freshness_state,c.purpose,c.partition_key
    FROM asi_source_candidates c
    JOIN asi_source_candidate_current_observation o ON o.source_id=c.source_id
    WHERE c.source_id=? AND o.input_snapshot_ref=?
  `).bind(sourceId,qualification.input_snapshot_ref).first<CandidateGateRow>();
  const reasonCodes = [...evaluated.reason_codes];
  let finalDecision: 'PASS'|'HOLD'|'REJECT' = evaluated.decision;
  let finalRights: 'ALLOW'|'DENY'|'UNKNOWN' = evaluated.rights_state;
  if (classification.readiness_state === 'REJECT' || qualification.readiness_state === 'REJECT') {
    finalDecision = 'REJECT';
    reasonCodes.push('PROCESSOR_FAN_IN_REJECTED');
  } else if (classification.readiness_state !== 'READY' || qualification.readiness_state !== 'READY') {
    if (finalDecision !== 'REJECT') finalDecision = 'HOLD';
    reasonCodes.push('PROCESSOR_FAN_IN_NOT_READY');
  }
  if (!candidate || candidate.purpose !== purpose || candidate.partition_key !== key) {
    if (finalDecision !== 'REJECT') finalDecision = 'HOLD';
    finalRights = finalRights === 'DENY' ? 'DENY' : 'UNKNOWN';
    reasonCodes.push('DISCOVERY_CANDIDATE_GATE_MISSING');
  } else if (candidate.candidate_state === 'REJECTED' || candidate.rights_state === 'DENY') {
    finalDecision = 'REJECT';
    finalRights = 'DENY';
    reasonCodes.push('DISCOVERY_CANDIDATE_REJECTED');
  } else {
    if (candidate.candidate_state !== 'DISCOVERED') {
      if (finalDecision !== 'REJECT') finalDecision = 'HOLD';
      reasonCodes.push(`DISCOVERY_CANDIDATE_STATE_${candidate.candidate_state}`);
    }
    if (candidate.rights_state !== 'ALLOW') {
      if (finalDecision !== 'REJECT') finalDecision = 'HOLD';
      finalRights = finalRights === 'DENY' ? 'DENY' : 'UNKNOWN';
      reasonCodes.push('DISCOVERY_CHANNEL_RIGHTS_NOT_ALLOWED');
    }
    if (candidate.freshness_state !== 'CURRENT') {
      if (finalDecision !== 'REJECT') finalDecision = 'HOLD';
      reasonCodes.push(`DISCOVERY_CANDIDATE_FRESHNESS_${candidate.freshness_state}`);
    }
  }
  const admissionId = await deterministicId('admission',{
    source_id:sourceId,purpose,partition_key:key,input_snapshot_ref:qualification.input_snapshot_ref,
    classification_group_id:classification.group_id,qualification_group_id:qualificationGroupId,policy_version:POLICY_VERSION,
  });
  const payload = {
    ...evaluated.event.payload,
    admission_id:admissionId,
    classification_group_id:classification.group_id,
    qualification_group_id:qualificationGroupId,
    classification_fan_in_state:classification.readiness_state,
    qualification_fan_in_state:qualification.readiness_state,
    discovery_candidate_state:candidate?.candidate_state || 'MISSING',
    discovery_candidate_rights_state:candidate?.rights_state || 'UNKNOWN',
    discovery_candidate_freshness_state:candidate?.freshness_state || 'UNKNOWN',
    acquisition_planning_authorized:finalDecision === 'PASS' && finalRights === 'ALLOW',
    collection_execution_authorized:false,
    public_projection_authorized:false,
    production_authorized:false,
  };
  const event = await materializedEvent(
    task.event,'PURPOSE_ADMISSION_MATERIALIZER','SOURCE_PURPOSE_ADMISSION_DECIDED',payload,finalDecision,
    finalRights,reasonCodes,evaluated.assertion_ids,
  );
  await hooks.stageEvent(event);
  const reviewDueAt = addDays(event.observed_at,7);
  const statements: D1PreparedStatement[] = [env.DB.prepare(`
    INSERT OR IGNORE INTO asi_purpose_admissions (
      admission_id,source_id,purpose,evidence_class,output_class,region,decision,rights_state,policy_version,input_snapshot_ref,
      reason_codes_json,required_assertion_count,satisfied_assertion_count,source_event_id,decided_at,review_due_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    admissionId,sourceId,purpose,`SOURCE_ROLE:${event.partition.source_role}`,'INTERNAL_SHADOW',event.partition.region,
    finalDecision,finalRights,POLICY_VERSION,event.input_snapshot_ref,JSON.stringify(event.reason_codes),
    ASI_BOUNDED_SHADOW_REQUIRED_ASSERTIONS.length,evaluated.satisfied_assertion_types.length,event.event_id,event.observed_at,reviewDueAt,
  )];
  for (const assertionId of evaluated.assertion_ids) {
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO asi_admission_assertions (admission_id,assertion_id) VALUES (?,?)`)
      .bind(admissionId,assertionId));
  }
  await env.DB.batch(statements);
  const admission = await env.DB.prepare(`
    SELECT source_id,purpose,decision,rights_state,input_snapshot_ref,source_event_id FROM asi_purpose_admissions WHERE admission_id=?
  `).bind(admissionId).first<Record<string,string>>();
  if (!admission || admission.source_id !== sourceId || admission.purpose !== purpose ||
    admission.decision !== finalDecision || admission.rights_state !== finalRights ||
    admission.input_snapshot_ref !== event.input_snapshot_ref || admission.source_event_id !== event.event_id) {
    throw new Error('ASI_PURPOSE_ADMISSION_IDEMPOTENCY_CONFLICT');
  }
  await hooks.dispatchEvent(event.event_id);
  return event;
}

async function assertCandidateGrain(env: AsiMeshEnv, task: AsiQueueTask): Promise<void> {
  const sourceId = stringValue(task.event.payload.source_id,'ASI_PROCESSOR_SOURCE_ID_REQUIRED');
  const purpose = task.event.assertion_purpose || (typeof task.event.payload.purpose === 'string'
    ? task.event.payload.purpose
    : ASI_BOUNDED_SHADOW_PURPOSE);
  const key = partitionKey(task.event.partition);
  const candidate = await env.DB.prepare(`
    SELECT purpose,partition_key FROM asi_source_candidates WHERE source_id=?
  `).bind(sourceId).first<{purpose:string;partition_key:string}>();
  if (!candidate || candidate.purpose !== purpose || candidate.partition_key !== key) {
    throw new Error('ASI_PROCESSOR_SOURCE_CANDIDATE_GRAIN_MISMATCH');
  }
}

async function assertDecisionInputProvenance(env: AsiMeshEnv, task: AsiQueueTask): Promise<void> {
  const sourceId = stringValue(task.event.payload.source_id,'ASI_DECISION_SOURCE_ID_REQUIRED');
  const purpose = task.event.assertion_purpose || stringValue(task.event.payload.purpose,'ASI_DECISION_PURPOSE_REQUIRED');
  const key = partitionKey(task.event.partition);
  const admissionId = stringValue(task.event.payload.admission_id,'ASI_DECISION_ADMISSION_ID_REQUIRED');
  const classificationGroupId = stringValue(task.event.payload.classification_group_id,'ASI_DECISION_CLASSIFICATION_GROUP_REQUIRED');
  const qualificationGroupId = stringValue(task.event.payload.qualification_group_id,'ASI_DECISION_QUALIFICATION_GROUP_REQUIRED');
  const admission = await env.DB.prepare(`
    SELECT source_id,purpose,decision,rights_state,input_snapshot_ref,source_event_id,required_assertion_count,
      satisfied_assertion_count,decided_at,review_due_at,superseded_at,revoked_at
    FROM asi_purpose_admissions WHERE admission_id=?
  `).bind(admissionId).first<AdmissionGateRow>();
  if (!admission || admission.source_id !== sourceId || admission.purpose !== purpose ||
    admission.decision !== task.event.decision || admission.rights_state !== task.event.rights_state ||
    admission.input_snapshot_ref !== task.event.input_snapshot_ref || admission.source_event_id !== task.event.event_id ||
    admission.superseded_at !== null || admission.revoked_at !== null ||
    !Number.isFinite(Date.parse(admission.decided_at)) || !Number.isFinite(Date.parse(admission.review_due_at)) ||
    Date.parse(admission.review_due_at) <= Date.parse(admission.decided_at)) {
    throw new Error('ASI_DECISION_ADMISSION_PROVENANCE_MISMATCH');
  }
  const [classification,qualification] = await Promise.all([
    readiness(env,classificationGroupId),
    readiness(env,qualificationGroupId),
  ]);
  if (classification.source_id !== sourceId || classification.purpose !== purpose || classification.partition_key !== key ||
    classification.stage !== 'CLASSIFICATION' || classification.input_snapshot_ref !== task.event.input_snapshot_ref ||
    qualification.source_id !== sourceId || qualification.purpose !== purpose || qualification.partition_key !== key ||
    qualification.stage !== 'QUALIFICATION' || qualification.input_snapshot_ref !== task.event.input_snapshot_ref) {
    throw new Error('ASI_DECISION_FAN_IN_PROVENANCE_MISMATCH');
  }
  if (task.event.decision === 'PASS' && (
    task.event.rights_state !== 'ALLOW' || classification.readiness_state !== 'READY' || qualification.readiness_state !== 'READY' ||
    Number(admission.required_assertion_count) !== ASI_BOUNDED_SHADOW_REQUIRED_ASSERTIONS.length ||
    Number(admission.satisfied_assertion_count) !== Number(admission.required_assertion_count)
  )) throw new Error('ASI_DECISION_PASS_GATE_INCOMPLETE');
}

async function recordSourcePoolDecision(
  env: AsiMeshEnv,
  task: AsiQueueTask,
  result: AsiProcessorResult,
  messageId: string,
): Promise<string> {
  const event = result.output_event;
  const payload = record(event.payload);
  const requested = payload.pool_state;
  const poolState = requested === 'QUALIFIED_INTERNAL_SHADOW' ? 'QUALIFIED_INTERNAL_SHADOW'
    : requested === 'REJECTED' ? 'REJECTED' : 'HOLD';
  const admissionId = stringValue(task.event.payload.admission_id,'ASI_POOL_ADMISSION_ID_REQUIRED');
  const classificationGroupId = stringValue(task.event.payload.classification_group_id,'ASI_POOL_CLASSIFICATION_GROUP_REQUIRED');
  const qualificationGroupId = stringValue(task.event.payload.qualification_group_id,'ASI_POOL_QUALIFICATION_GROUP_REQUIRED');
  const decisionId = await deterministicId('pool_decision',{event_id:event.event_id,source_id:result.source_id,pool_state:poolState});
  const review = await env.DB.prepare(`SELECT review_due_at FROM asi_purpose_admissions WHERE admission_id=?`)
    .bind(admissionId).first<{review_due_at:string}>();
  if (!review) throw new Error('ASI_POOL_ADMISSION_NOT_FOUND');
  await env.DB.prepare(`
    INSERT OR IGNORE INTO asi_source_pool_decisions (
      decision_id,source_id,purpose,partition_key,pool_state,rights_state,classification_group_id,qualification_group_id,
      admission_id,decision_engine_fleet,decision_event_id,causation_event_id,source_outbox_id,source_message_id,
      correlation_id,policy_version,input_snapshot_ref,reason_codes_json,acquisition_mode,idempotency_key,decided_at,review_due_at
    ) VALUES (?,?,?,?,?,?,?,?,?,'SOURCE_POOL_EVOLUTION',?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    decisionId,result.source_id,event.assertion_purpose || ASI_BOUNDED_SHADOW_PURPOSE,partitionKey(event.partition),poolState,
    event.rights_state,classificationGroupId,qualificationGroupId,admissionId,event.event_id,task.event.event_id,
    task.outbox_id,messageId,event.correlation_id,POLICY_VERSION,event.input_snapshot_ref,JSON.stringify(event.reason_codes),
    poolState === 'QUALIFIED_INTERNAL_SHADOW' ? 'PLAN_ONLY' : 'NONE',`pool:${decisionId}`,event.observed_at,review.review_due_at,
  ).run();
  const stored = await env.DB.prepare(`SELECT pool_state,rights_state,decision_event_id FROM asi_source_pool_decisions WHERE decision_id=?`)
    .bind(decisionId).first<{pool_state:string;rights_state:string;decision_event_id:string}>();
  if (!stored || stored.pool_state !== poolState || stored.rights_state !== event.rights_state ||
    stored.decision_event_id !== event.event_id) throw new Error('ASI_SOURCE_POOL_DECISION_IDEMPOTENCY_CONFLICT');
  return poolState;
}

export async function runAsiProcessorTask(
  env: AsiMeshEnv,
  fleet: AsiFleet,
  task: AsiQueueTask,
  messageId: string,
  hooks: AsiProcessorRuntimeHooks,
): Promise<AsiProcessorRuntimeResult> {
  if (fleet.stage === 'CLASSIFICATION' || fleet.stage === 'QUALIFICATION') await assertCandidateGrain(env,task);
  if (fleet.stage === 'DECISION') await assertDecisionInputProvenance(env,task);
  const processor = await processAsiFleet({fleet_id:fleet.id,event:task.event});
  await hooks.stageEvent(processor.output_event);
  const emitted = [processor.output_event.event_id];
  let groupId: string | null = null;
  let poolState: string | null = null;

  if (processor.stage === 'DISCOVERY') {
    const seed = record(processor.output_event.payload.discovery_seed);
    const host = typeof seed.canonical_host === 'string' ? seed.canonical_host.toLowerCase().replace(/^www\./,'') : '';
    if (HOST_PATTERN.test(host)) await recordDiscoveryCandidate(env,fleet,processor);
    await hooks.dispatchEvent(processor.output_event.event_id);
  } else if (processor.stage === 'CLASSIFICATION' || processor.stage === 'QUALIFICATION') {
    groupId = await recordProcessorAssertions(env,task,messageId,processor);
    const aggregate = processor.stage === 'CLASSIFICATION'
      ? await materializeClassification(env,task,groupId,hooks)
      : await materializeAdmission(env,task,groupId,hooks);
    if (aggregate) emitted.push(aggregate.event_id);
  } else if (processor.fleet_id === 'SOURCE_POOL_EVOLUTION') {
    poolState = await recordSourcePoolDecision(env,task,processor,messageId);
  }

  return {processor,emitted_event_ids:emitted,fan_in_group_id:groupId,source_pool_state:poolState};
}
