import {
  ASI_EVENT_VERSION,
  type AsiDecision,
  type AsiEventEnvelope,
  type AsiFreshnessState,
  type AsiRightsState,
} from './event';
import {
  ASI_CLASSIFICATION_FLEETS,
  ASI_DECISION_FLEETS,
  ASI_DISCOVERY_FLEETS,
  ASI_FLEET_BY_ID,
  ASI_QUALIFICATION_FLEETS,
  type AsiFleetId,
  type AsiFleetStage,
} from './registry';

/**
 * Deterministic SHADOW processors for the 25 ASI execution fleets.
 *
 * These functions only transform immutable task input into events/assertions.
 * They do not fetch URLs, evaluate robots.txt, write to D1, enqueue messages,
 * authorize publication, or perform any Production/external side effect.
 */
export const ASI_PROCESSOR_VERSION = 'shadow-processor-1.0.0' as const;
export const ASI_BOUNDED_SHADOW_PURPOSE = 'BOUNDED_SHADOW_ACQUISITION' as const;

export const ASI_BOUNDED_SHADOW_REQUIRED_ASSERTIONS = [
  'COLLECT',
  'STORE',
  'TRANSFORM',
  'RETENTION',
  'RATE_LIMIT',
  'ROBOTS',
  'SCHEMA',
  'PROVENANCE',
  'FRESHNESS',
] as const;

export type AsiBoundedShadowAssertionType = typeof ASI_BOUNDED_SHADOW_REQUIRED_ASSERTIONS[number];
export type AsiProcessorDecision = Exclude<AsiDecision, null>;
export type AsiProcessorState = 'PROCESSED_SHADOW' | 'HELD_SHADOW' | 'REJECTED_SHADOW';

export interface AsiAssertionInput {
  decision: AsiProcessorDecision;
  rights_state?: AsiRightsState;
  evidence_refs: string[];
  reason_codes?: string[];
  facts?: Record<string, unknown>;
  supersedes_assertion_id?: string | null;
}

export interface AsiProcessorAssertionRecord {
  assertion_id: string;
  source_id: string;
  engine_fleet: AsiFleetId;
  assertion_type: string;
  purpose: string;
  decision: AsiProcessorDecision;
  rights_state: AsiRightsState;
  /** Hash of the complete immutable output event; matches asi_event_log.payload_hash. */
  payload_hash: string;
  /** Hash of this assertion's own canonical facts and evidence. */
  assertion_payload_hash: string;
  event_id: string;
  engine_version: typeof ASI_PROCESSOR_VERSION;
  observed_at: string;
  supersedes_assertion_id: string | null;
  reason_codes: string[];
  evidence_refs: string[];
  facts: Record<string, unknown>;
}

export interface AsiProcessorResult {
  processor_version: typeof ASI_PROCESSOR_VERSION;
  fleet_id: AsiFleetId;
  stage: AsiFleetStage;
  source_id: string;
  state: AsiProcessorState;
  input_event_id: string;
  output_event: AsiEventEnvelope;
  /** One aggregate assertion per classification/qualification fleet for local fan-in membership. */
  fan_in_assertion: AsiProcessorAssertionRecord | null;
  /** Purpose-policy detail assertions; these are not direct fan-in membership rows. */
  assertions: AsiProcessorAssertionRecord[];
  side_effect_boundary: {
    network_requests: 0;
    external_writes: 0;
    paid_actions: 0;
    collection_execution_authorized: false;
    public_projection_authorized: false;
    production_authorized: false;
  };
}

export interface AsiProcessorRequest {
  fleet_id: AsiFleetId;
  event: AsiEventEnvelope;
}

export interface AsiAdmissionEvaluationRequest {
  source_event: AsiEventEnvelope;
  assertions: readonly AsiProcessorAssertionRecord[];
  purpose?: typeof ASI_BOUNDED_SHADOW_PURPOSE;
  evidence_class?: string;
  output_class?: 'INTERNAL_SHADOW';
}

export interface AsiAdmissionEvaluation {
  source_id: string;
  purpose: typeof ASI_BOUNDED_SHADOW_PURPOSE;
  decision: 'PASS' | 'HOLD' | 'REJECT';
  rights_state: 'ALLOW' | 'DENY' | 'UNKNOWN';
  required_assertion_types: readonly AsiBoundedShadowAssertionType[];
  satisfied_assertion_types: AsiBoundedShadowAssertionType[];
  assertion_ids: string[];
  reason_codes: string[];
  event: AsiEventEnvelope;
  acquisition_planning_authorized: boolean;
  collection_execution_authorized: false;
  public_projection_authorized: false;
  production_authorized: false;
}

type ProcessorSpec = {
  stage: AsiFleetStage;
  inputType: string;
  outputType: string;
  assertionTypes: readonly string[];
};

const CLASSIFICATION_ASSERTIONS: Partial<Record<AsiFleetId, readonly string[]>> = {
  SOURCE_SITE_IDENTITY_OWNER_LINEAGE: ['CANONICAL_HOST', 'OWNER_LINEAGE', 'PROVENANCE'],
  SOURCE_SCOPE_ROLE_CLASSIFICATION: ['RELEVANCE', 'SCOPE_ROLE'],
  SOURCE_REGION_LANGUAGE_CLASSIFICATION: ['REGION_LANGUAGE'],
  SOURCE_MARKET_SEMANTICS_CLASSIFICATION: ['MARKET_SEMANTICS'],
};

const QUALIFICATION_ASSERTIONS: Partial<Record<AsiFleetId, readonly string[]>> = {
  SOURCE_UTILITY_VALUE_ANALYSIS: ['UTILITY_VALUE'],
  SOURCE_RIGHTS_COMPLIANCE_ANALYSIS: ['COLLECT', 'STORE', 'TRANSFORM', 'RETENTION', 'ROBOTS'],
  SOURCE_TECHNICAL_ACCESS_SCHEMA_ANALYSIS: ['RATE_LIMIT', 'SCHEMA'],
  SOURCE_COVERAGE_BIAS_ANALYSIS: ['COVERAGE_BIAS'],
  SOURCE_INDEPENDENCE_REDUNDANCY_ANALYSIS: ['INDEPENDENCE_REDUNDANCY'],
  SOURCE_FRESHNESS_STABILITY_ANALYSIS: ['FRESHNESS'],
  SOURCE_COST_ROI_ANALYSIS: ['COST_ROI'],
};

const RIGHTS_ASSERTION_TYPES = new Set<string>(['COLLECT', 'STORE', 'TRANSFORM', 'RETENTION', 'ROBOTS']);
const NON_EMPTY = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const DECISIONS = new Set<AsiProcessorDecision>(['PASS', 'HOLD', 'REJECT', 'NOT_APPLICABLE']);
const RIGHTS_STATES = new Set<AsiRightsState>(['ALLOW', 'DENY', 'UNKNOWN', 'NOT_APPLICABLE']);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

const PROCESSOR_SPECS = Object.fromEntries([
  ...ASI_DISCOVERY_FLEETS.map((fleetId) => [fleetId, {
    stage: 'DISCOVERY', inputType: 'SOURCE_DISCOVERY_REQUESTED', outputType: 'SOURCE_DISCOVERED', assertionTypes: [],
  }]),
  ...ASI_CLASSIFICATION_FLEETS.map((fleetId) => [fleetId, {
    stage: 'CLASSIFICATION', inputType: 'SOURCE_DISCOVERED', outputType: 'SOURCE_CLASSIFICATION_ASSERTED',
    assertionTypes: CLASSIFICATION_ASSERTIONS[fleetId] || [],
  }]),
  ...ASI_QUALIFICATION_FLEETS.map((fleetId) => [fleetId, {
    stage: 'QUALIFICATION', inputType: 'SOURCE_IDENTIFIED', outputType: 'SOURCE_QUALIFICATION_ASSERTED',
    assertionTypes: QUALIFICATION_ASSERTIONS[fleetId] || [],
  }]),
  ...ASI_DECISION_FLEETS.map((fleetId) => [fleetId, {
    stage: 'DECISION', inputType: 'SOURCE_PURPOSE_ADMISSION_DECIDED',
    outputType: fleetId === 'ACQUISITION_PLANNER' ? 'ACQUISITION_PLANNED' : 'SOURCE_POOL_DECIDED', assertionTypes: [],
  }]),
]) as Record<AsiFleetId, ProcessorSpec>;

const SIDE_EFFECT_BOUNDARY = Object.freeze({
  network_requests: 0,
  external_writes: 0,
  paid_actions: 0,
  collection_execution_authorized: false,
  public_projection_authorized: false,
  production_authorized: false,
} as const);

function canonicalValue(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('ASI_PROCESSOR_NON_FINITE_NUMBER');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('ASI_PROCESSOR_CYCLIC_VALUE');
    seen.add(value);
    const output = value.map((item) => canonicalValue(item, seen));
    seen.delete(value);
    return output;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) throw new Error('ASI_PROCESSOR_CYCLIC_VALUE');
    seen.add(value);
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
      output[key] = canonicalValue(item, seen);
    }
    seen.delete(value);
    return output;
  }
  throw new Error('ASI_PROCESSOR_VALUE_NOT_JSON_COMPATIBLE');
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export async function sha256Ref(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(NON_EMPTY).map((item) => item.trim()))].sort();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sourceIdFrom(event: AsiEventEnvelope): string {
  if (NON_EMPTY(event.payload.source_id)) return event.payload.source_id.trim();
  const seed = asRecord(event.payload.discovery_seed);
  if (seed && NON_EMPTY(seed.source_id)) return seed.source_id.trim();
  const source = asRecord(event.payload.source);
  if (source && NON_EMPTY(source.source_id)) return source.source_id.trim();
  throw new Error('ASI_PROCESSOR_SOURCE_ID_REQUIRED');
}

function purposeFrom(event: AsiEventEnvelope): string {
  if (NON_EMPTY(event.assertion_purpose)) return event.assertion_purpose;
  if (NON_EMPTY(event.payload.purpose)) return event.payload.purpose.trim();
  return ASI_BOUNDED_SHADOW_PURPOSE;
}

function assertionInputFor(event: AsiEventEnvelope, fleetId: AsiFleetId, assertionType: string): Record<string, unknown> | null {
  const direct = asRecord(event.payload.assertion_inputs);
  const directValue = direct ? asRecord(direct[assertionType]) : null;
  if (directValue) return directValue;
  const processorInputs = asRecord(event.payload.processor_inputs);
  const fleetInputs = processorInputs ? asRecord(processorInputs[fleetId]) : null;
  const fleetAssertions = fleetInputs ? asRecord(fleetInputs.assertions) : null;
  return fleetAssertions ? asRecord(fleetAssertions[assertionType]) : null;
}

function assertionDecision(
  raw: Record<string, unknown> | null,
  assertionType: string,
  inputFreshness: AsiFreshnessState,
): {
  decision: AsiProcessorDecision;
  rightsState: AsiRightsState;
  evidenceRefs: string[];
  reasonCodes: string[];
  facts: Record<string, unknown>;
  supersedes: string | null;
} {
  const rightsSensitive = RIGHTS_ASSERTION_TYPES.has(assertionType);
  if (!raw) return {
    decision: 'HOLD',
    rightsState: rightsSensitive ? 'UNKNOWN' : 'NOT_APPLICABLE',
    evidenceRefs: [],
    reasonCodes: [`ASSERTION_INPUT_MISSING:${assertionType}`],
    facts: {},
    supersedes: null,
  };

  const evidenceRefs = uniqueStrings(raw.evidence_refs);
  const requestedDecision = DECISIONS.has(raw.decision as AsiProcessorDecision)
    ? raw.decision as AsiProcessorDecision
    : 'HOLD';
  const suppliedRights = RIGHTS_STATES.has(raw.rights_state as AsiRightsState)
    ? raw.rights_state as AsiRightsState
    : rightsSensitive ? 'UNKNOWN' : 'NOT_APPLICABLE';
  const reasonCodes = uniqueStrings(raw.reason_codes);
  const facts = asRecord(raw.facts) || {};
  let decision = requestedDecision;
  let rightsState = rightsSensitive ? suppliedRights : 'NOT_APPLICABLE';

  if (!DECISIONS.has(raw.decision as AsiProcessorDecision)) reasonCodes.push(`ASSERTION_DECISION_MISSING:${assertionType}`);
  if (decision === 'NOT_APPLICABLE') {
    decision = 'HOLD';
    reasonCodes.push(`REQUIRED_ASSERTION_NOT_APPLICABLE:${assertionType}`);
  }
  if (decision === 'PASS' && evidenceRefs.length === 0) {
    decision = 'HOLD';
    reasonCodes.push(`EVIDENCE_REFERENCE_MISSING:${assertionType}`);
  }
  if (rightsSensitive) {
    if (rightsState === 'DENY') {
      decision = 'REJECT';
      reasonCodes.push(`RIGHTS_DENIED:${assertionType}`);
    } else if (rightsState !== 'ALLOW') {
      decision = 'HOLD';
      rightsState = 'UNKNOWN';
      reasonCodes.push(`RIGHTS_NOT_EXPLICITLY_ALLOWED:${assertionType}`);
    }
  }
  if (assertionType === 'FRESHNESS' && inputFreshness !== 'CURRENT') {
    decision = 'HOLD';
    reasonCodes.push(`FRESHNESS_NOT_CURRENT:${inputFreshness}`);
  }

  return {
    decision,
    rightsState,
    evidenceRefs,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    facts: canonicalValue(facts) as Record<string, unknown>,
    supersedes: NON_EMPTY(raw.supersedes_assertion_id) ? raw.supersedes_assertion_id.trim() : null,
  };
}

async function buildAssertionDrafts(
  event: AsiEventEnvelope,
  fleetId: AsiFleetId,
  assertionTypes: readonly string[],
  sourceId: string,
  purpose: string,
): Promise<Array<Omit<AsiProcessorAssertionRecord, 'event_id' | 'payload_hash'>>> {
  return Promise.all(assertionTypes.map(async (assertionType) => {
    const evaluated = assertionDecision(assertionInputFor(event, fleetId, assertionType), assertionType, event.freshness_state);
    const assertionBody = {
      source_id: sourceId,
      engine_fleet: fleetId,
      assertion_type: assertionType,
      purpose,
      decision: evaluated.decision,
      rights_state: evaluated.rightsState,
      reason_codes: evaluated.reasonCodes,
      evidence_refs: evaluated.evidenceRefs,
      facts: evaluated.facts,
      input_event_id: event.event_id,
      input_payload_hash: event.payload_hash,
      engine_version: ASI_PROCESSOR_VERSION,
    };
    const assertionPayloadHash = await sha256Ref(assertionBody);
    const assertionIdHash = await sha256Ref({
      source_id: sourceId,
      fleet_id: fleetId,
      assertion_type: assertionType,
      purpose,
      input_event_id: event.event_id,
      assertion_payload_hash: assertionPayloadHash,
    });
    return {
      assertion_id: `assert_${assertionIdHash.slice('sha256:'.length, 'sha256:'.length + 32)}`,
      source_id: sourceId,
      engine_fleet: fleetId,
      assertion_type: assertionType,
      purpose,
      decision: evaluated.decision,
      rights_state: evaluated.rightsState,
      assertion_payload_hash: assertionPayloadHash,
      engine_version: ASI_PROCESSOR_VERSION,
      observed_at: event.observed_at,
      supersedes_assertion_id: evaluated.supersedes,
      reason_codes: evaluated.reasonCodes,
      evidence_refs: evaluated.evidenceRefs,
      facts: evaluated.facts,
    };
  }));
}

function aggregateDecision(assertions: readonly Omit<AsiProcessorAssertionRecord, 'event_id' | 'payload_hash'>[]): AsiProcessorDecision {
  if (assertions.some((assertion) => assertion.decision === 'REJECT')) return 'REJECT';
  if (assertions.some((assertion) => assertion.decision !== 'PASS')) return 'HOLD';
  return assertions.length > 0 ? 'PASS' : 'NOT_APPLICABLE';
}

function aggregateRights(assertions: readonly Omit<AsiProcessorAssertionRecord, 'event_id' | 'payload_hash'>[]): AsiRightsState {
  const rightsAssertions = assertions.filter((assertion) => RIGHTS_ASSERTION_TYPES.has(assertion.assertion_type));
  if (rightsAssertions.some((assertion) => assertion.rights_state === 'DENY')) return 'DENY';
  if (rightsAssertions.some((assertion) => assertion.rights_state !== 'ALLOW')) return 'UNKNOWN';
  return rightsAssertions.length > 0 ? 'ALLOW' : 'NOT_APPLICABLE';
}

function stateFor(decision: AsiDecision): AsiProcessorState {
  if (decision === 'REJECT') return 'REJECTED_SHADOW';
  if (decision === 'HOLD') return 'HELD_SHADOW';
  return 'PROCESSED_SHADOW';
}

function discoveryOutcome(event: AsiEventEnvelope): {
  decision: 'PASS' | 'HOLD' | 'REJECT';
  rightsState: 'ALLOW' | 'DENY' | 'UNKNOWN';
  reasonCodes: string[];
  seed: Record<string, unknown>;
} {
  const seed = asRecord(event.payload.discovery_seed) || {};
  const reasons: string[] = [];
  const seedRightsState = RIGHTS_STATES.has(seed.discovery_rights_state as AsiRightsState)
    ? seed.discovery_rights_state as AsiRightsState
    : 'UNKNOWN';
  const envelopeRejected = event.decision === 'REJECT' || event.rights_state === 'DENY';
  const rightsState: 'ALLOW' | 'DENY' | 'UNKNOWN' = envelopeRejected || seedRightsState === 'DENY'
    ? 'DENY'
    : event.rights_state === 'ALLOW' && seedRightsState === 'ALLOW' ? 'ALLOW' : 'UNKNOWN';
  if (!NON_EMPTY(seed.seed_ref)) reasons.push('DISCOVERY_SEED_PROVENANCE_MISSING');
  if (!NON_EMPTY(seed.canonical_host)) reasons.push('CANONICAL_HOST_EVIDENCE_MISSING');
  if (event.decision === 'REJECT') reasons.push('DISCOVERY_ENVELOPE_DECISION_REJECTED');
  else if (event.decision !== 'PASS') reasons.push(`DISCOVERY_ENVELOPE_DECISION_NOT_PASS:${event.decision || 'NULL'}`);
  if (event.rights_state === 'DENY') reasons.push('DISCOVERY_ENVELOPE_RIGHTS_DENIED');
  else if (event.rights_state !== 'ALLOW') reasons.push(`DISCOVERY_ENVELOPE_RIGHTS_NOT_ALLOWED:${event.rights_state}`);
  if (seedRightsState === 'DENY') reasons.push('DISCOVERY_CHANNEL_RIGHTS_DENIED');
  else if (seedRightsState !== 'ALLOW') reasons.push('DISCOVERY_CHANNEL_RIGHTS_UNKNOWN');
  return {
    decision: rightsState === 'DENY' ? 'REJECT' : reasons.length > 0 ? 'HOLD' : 'PASS',
    rightsState,
    reasonCodes: [...new Set(reasons)].sort(),
    seed: canonicalValue(seed) as Record<string, unknown>,
  };
}

function decisionOutcome(event: AsiEventEnvelope, fleetId: AsiFleetId): {
  decision: 'PASS' | 'HOLD' | 'REJECT';
  rightsState: 'ALLOW' | 'DENY' | 'UNKNOWN';
  reasonCodes: string[];
  payload: Record<string, unknown>;
} {
  const reasons = [...event.reason_codes];
  const purpose = purposeFrom(event);
  const required = uniqueStrings(event.payload.required_assertion_types);
  const satisfied = uniqueStrings(event.payload.satisfied_assertion_types);
  const requiredSetMatches = ASI_BOUNDED_SHADOW_REQUIRED_ASSERTIONS.every((type) => required.includes(type)) &&
    required.length === ASI_BOUNDED_SHADOW_REQUIRED_ASSERTIONS.length;
  const satisfiedSetMatches = ASI_BOUNDED_SHADOW_REQUIRED_ASSERTIONS.every((type) => satisfied.includes(type));
  let decision: 'PASS' | 'HOLD' | 'REJECT' = event.decision === 'REJECT' ? 'REJECT' : event.decision === 'PASS' ? 'PASS' : 'HOLD';
  let rightsState: 'ALLOW' | 'DENY' | 'UNKNOWN' = event.rights_state === 'DENY'
    ? 'DENY'
    : event.rights_state === 'ALLOW' ? 'ALLOW' : 'UNKNOWN';
  if (purpose !== ASI_BOUNDED_SHADOW_PURPOSE) reasons.push('PURPOSE_NOT_IMPLEMENTED_BY_SHADOW_PROCESSOR');
  if (!requiredSetMatches) reasons.push('ADMISSION_REQUIRED_ASSERTION_SET_INVALID');
  if (!satisfiedSetMatches) reasons.push('ADMISSION_ASSERTIONS_INCOMPLETE');
  if ((!requiredSetMatches || !satisfiedSetMatches || purpose !== ASI_BOUNDED_SHADOW_PURPOSE) && decision !== 'REJECT') {
    decision = 'HOLD';
  }
  if (rightsState === 'DENY') decision = 'REJECT';
  else if (rightsState !== 'ALLOW' && decision !== 'REJECT') decision = 'HOLD';
  const approved = decision === 'PASS' && rightsState === 'ALLOW';
  return {
    decision,
    rightsState,
    reasonCodes: [...new Set(reasons)].sort(),
    payload: fleetId === 'ACQUISITION_PLANNER' ? {
      source_id: sourceIdFrom(event),
      purpose,
      plan_state: approved ? 'SHADOW_PLAN_READY' : 'SHADOW_PLAN_HOLD',
      admission_event_id: event.event_id,
      acquisition_planning_authorized: approved,
      external_collection_execution_authorized: false,
      public_projection_authorized: false,
      production_authorized: false,
    } : {
      source_id: sourceIdFrom(event),
      purpose,
      pool_state: approved ? 'QUALIFIED_INTERNAL_SHADOW' : decision === 'REJECT' ? 'REJECTED' : 'HOLD',
      admission_event_id: event.event_id,
      acquisition_execution_authorized: false,
      public_projection_authorized: false,
      production_authorized: false,
    },
  };
}

async function derivedEvent(
  input: AsiEventEnvelope,
  producerEngine: string,
  outputType: string,
  payload: Record<string, unknown>,
  purpose: string,
  decision: AsiDecision,
  rightsState: AsiRightsState,
  reasonCodes: string[],
  evidenceRefs: string[],
): Promise<AsiEventEnvelope> {
  const canonicalPayload = canonicalValue(payload) as Record<string, unknown>;
  const payloadHash = await sha256Ref(canonicalPayload);
  const identityHash = await sha256Ref({
    input_event_id: input.event_id,
    input_payload_hash: input.payload_hash,
    producer_engine: producerEngine,
    processor_version: ASI_PROCESSOR_VERSION,
    output_type: outputType,
    payload_hash: payloadHash,
  });
  const suffix = identityHash.slice('sha256:'.length, 'sha256:'.length + 32);
  return {
    event_id: `evt_${suffix}`,
    event_type: outputType as AsiEventEnvelope['event_type'],
    event_version: ASI_EVENT_VERSION,
    occurred_at: input.observed_at,
    observed_at: input.observed_at,
    producer_engine: producerEngine,
    producer_version: ASI_PROCESSOR_VERSION,
    correlation_id: input.correlation_id,
    causation_id: input.event_id,
    idempotency_key: `asi:${producerEngine}:${input.event_id}:${suffix}`,
    partition: {...input.partition},
    input_snapshot_ref: input.input_snapshot_ref,
    payload_hash: payloadHash,
    rights_state: rightsState,
    freshness_state: input.freshness_state,
    assertion_purpose: purpose,
    decision,
    reason_codes: [...new Set(reasonCodes)].sort(),
    trace_refs: [...new Set([...input.trace_refs, input.event_id, ...evidenceRefs])].sort(),
    payload: canonicalPayload,
  };
}

async function buildFanInAssertion(
  input: AsiEventEnvelope,
  event: AsiEventEnvelope,
  fleetId: AsiFleetId,
  purpose: string,
  assertions: readonly AsiProcessorAssertionRecord[],
): Promise<AsiProcessorAssertionRecord> {
  const assertionType = `FLEET_SUMMARY:${fleetId}`;
  const evidenceRefs = [...new Set(assertions.flatMap((assertion) => assertion.evidence_refs))].sort();
  const facts = {
    detail_assertion_count: assertions.length,
    detail_assertion_ids: assertions.map((assertion) => assertion.assertion_id).sort(),
    detail_assertion_types: assertions.map((assertion) => assertion.assertion_type).sort(),
    detail_assertion_payload_hashes: assertions.map((assertion) => assertion.assertion_payload_hash).sort(),
    aggregate_event_id: event.event_id,
  };
  const assertionPayloadHash = await sha256Ref({
    source_id: sourceIdFrom(input),
    engine_fleet: fleetId,
    assertion_type: assertionType,
    purpose,
    decision: event.decision,
    rights_state: event.rights_state,
    reason_codes: event.reason_codes,
    evidence_refs: evidenceRefs,
    facts,
    input_event_id: input.event_id,
    input_payload_hash: input.payload_hash,
    engine_version: ASI_PROCESSOR_VERSION,
  });
  const idHash = await sha256Ref({
    source_id: sourceIdFrom(input),
    fleet_id: fleetId,
    assertion_type: assertionType,
    purpose,
    input_event_id: input.event_id,
    assertion_payload_hash: assertionPayloadHash,
  });
  return {
    assertion_id: `assert_${idHash.slice('sha256:'.length, 'sha256:'.length + 32)}`,
    source_id: sourceIdFrom(input),
    engine_fleet: fleetId,
    assertion_type: assertionType,
    purpose,
    decision: event.decision || 'HOLD',
    rights_state: event.rights_state,
    payload_hash: event.payload_hash,
    assertion_payload_hash: assertionPayloadHash,
    event_id: event.event_id,
    engine_version: ASI_PROCESSOR_VERSION,
    observed_at: event.observed_at,
    supersedes_assertion_id: null,
    reason_codes: event.reason_codes,
    evidence_refs: evidenceRefs,
    facts,
  };
}

export async function processAsiFleet(request: AsiProcessorRequest): Promise<AsiProcessorResult> {
  const fleet = ASI_FLEET_BY_ID.get(request.fleet_id);
  const spec = PROCESSOR_SPECS[request.fleet_id];
  if (!fleet || !spec || fleet.stage !== spec.stage) throw new Error('ASI_PROCESSOR_FLEET_REGISTRY_DRIFT');
  if (String(request.event.event_type) !== spec.inputType) {
    throw new Error(`ASI_PROCESSOR_INPUT_TYPE_INVALID:${request.fleet_id}:${request.event.event_type}`);
  }
  const sourceId = sourceIdFrom(request.event);
  const purpose = purposeFrom(request.event);
  const assertionDrafts = await buildAssertionDrafts(request.event, request.fleet_id, spec.assertionTypes, sourceId, purpose);

  let decision = aggregateDecision(assertionDrafts);
  let rightsState = aggregateRights(assertionDrafts);
  let reasonCodes = assertionDrafts.flatMap((assertion) => assertion.reason_codes);
  let evidenceRefs = assertionDrafts.flatMap((assertion) => assertion.evidence_refs);
  let payload: Record<string, unknown>;

  if (spec.stage === 'DISCOVERY') {
    const outcome = discoveryOutcome(request.event);
    decision = outcome.decision;
    rightsState = outcome.rightsState;
    reasonCodes = outcome.reasonCodes;
    evidenceRefs = NON_EMPTY(outcome.seed.seed_ref) ? [outcome.seed.seed_ref.trim()] : [];
    payload = {
      source_id: sourceId,
      discovery_fleet: request.fleet_id,
      discovery_seed: outcome.seed,
      processor_inputs: request.event.payload.processor_inputs || null,
      assertion_inputs: request.event.payload.assertion_inputs || null,
      discovery_metadata_only: true,
      content_collection_authorized: false,
      public_projection_authorized: false,
      production_authorized: false,
    };
  } else if (spec.stage === 'DECISION') {
    const outcome = decisionOutcome(request.event, request.fleet_id);
    decision = outcome.decision;
    rightsState = outcome.rightsState;
    reasonCodes = outcome.reasonCodes;
    evidenceRefs = uniqueStrings(request.event.payload.assertion_ids);
    payload = outcome.payload;
  } else {
    payload = {
      source_id: sourceId,
      stage: spec.stage,
      engine_fleet: request.fleet_id,
      purpose,
      assertion_count: assertionDrafts.length,
      assertions: assertionDrafts.map((assertion) => ({
        assertion_id: assertion.assertion_id,
        assertion_type: assertion.assertion_type,
        decision: assertion.decision,
        rights_state: assertion.rights_state,
        assertion_payload_hash: assertion.assertion_payload_hash,
        reason_codes: assertion.reason_codes,
        evidence_refs: assertion.evidence_refs,
      })),
      processor_inputs: request.event.payload.processor_inputs || null,
      assertion_inputs: request.event.payload.assertion_inputs || null,
      external_side_effects: false,
      public_projection_authorized: false,
      production_authorized: false,
    };
  }

  const event = await derivedEvent(
    request.event,
    request.fleet_id,
    spec.outputType,
    payload,
    purpose,
    decision,
    rightsState,
    reasonCodes,
    evidenceRefs,
  );
  const assertions = assertionDrafts.map((assertion) => ({
    ...assertion,
    event_id: event.event_id,
    payload_hash: event.payload_hash,
  }));
  const fanInAssertion = spec.stage === 'CLASSIFICATION' || spec.stage === 'QUALIFICATION'
    ? await buildFanInAssertion(request.event,event,request.fleet_id,purpose,assertions)
    : null;
  return {
    processor_version: ASI_PROCESSOR_VERSION,
    fleet_id: request.fleet_id,
    stage: spec.stage,
    source_id: sourceId,
    state: stateFor(decision),
    input_event_id: request.event.event_id,
    output_event: event,
    fan_in_assertion: fanInAssertion,
    assertions,
    side_effect_boundary: SIDE_EFFECT_BOUNDARY,
  };
}

function admissionObservedAt(source: AsiEventEnvelope, assertions: readonly AsiProcessorAssertionRecord[]): string {
  return [source.observed_at, ...assertions.map((assertion) => assertion.observed_at)]
    .map((value) => new Date(value).toISOString())
    .sort()
    .at(-1) as string;
}

export async function evaluateBoundedShadowAdmission(
  request: AsiAdmissionEvaluationRequest,
): Promise<AsiAdmissionEvaluation> {
  const sourceId = sourceIdFrom(request.source_event);
  const purpose = request.purpose || ASI_BOUNDED_SHADOW_PURPOSE;
  const relevant = request.assertions.filter((assertion) => assertion.source_id === sourceId && assertion.purpose === purpose);
  const reasonCodes: string[] = [];
  const satisfied: AsiBoundedShadowAssertionType[] = [];
  const assertionIds: string[] = [];
  let denied = false;
  let unknownRights = false;
  let processorRejected = false;
  let processorHeld = false;

  const fleetSummaries = relevant.filter((assertion) => assertion.assertion_type.startsWith('FLEET_SUMMARY:'));
  const expectedSummaryCount = ASI_CLASSIFICATION_FLEETS.length + ASI_QUALIFICATION_FLEETS.length;
  const summarizedFleets = new Set(fleetSummaries.map((assertion) => assertion.engine_fleet));
  if (fleetSummaries.length !== expectedSummaryCount || summarizedFleets.size !== expectedSummaryCount) {
    processorHeld = true;
    reasonCodes.push('PROCESSOR_FAN_IN_SUMMARY_SET_INCOMPLETE_OR_DUPLICATE');
  }
  for (const summary of fleetSummaries) {
    if (summary.decision === 'REJECT') {
      processorRejected = true;
      reasonCodes.push(`PROCESSOR_FLEET_REJECTED:${summary.engine_fleet}`);
    } else if (summary.decision !== 'PASS') {
      // Non-PASS fleet summaries are never ignored merely because the nine
      // bounded-acquisition assertions pass.
      processorHeld = true;
      reasonCodes.push(`PROCESSOR_FLEET_NOT_PASS:${summary.engine_fleet}`);
    }
  }

  for (const assertionType of ASI_BOUNDED_SHADOW_REQUIRED_ASSERTIONS) {
    const matches = relevant.filter((assertion) => assertion.assertion_type === assertionType);
    if (matches.length === 0) {
      reasonCodes.push(`ASSERTION_MISSING:${assertionType}`);
      if (RIGHTS_ASSERTION_TYPES.has(assertionType)) unknownRights = true;
      continue;
    }
    if (matches.length > 1) {
      reasonCodes.push(`ASSERTION_CONFLICT:${assertionType}`);
      if (RIGHTS_ASSERTION_TYPES.has(assertionType)) unknownRights = true;
      continue;
    }
    const assertion = matches[0];
    assertionIds.push(assertion.assertion_id);
    if (!HASH_PATTERN.test(assertion.payload_hash) || assertion.evidence_refs.length === 0) {
      reasonCodes.push(`ASSERTION_EVIDENCE_INVALID:${assertionType}`);
      continue;
    }
    if (RIGHTS_ASSERTION_TYPES.has(assertionType)) {
      if (assertion.rights_state === 'DENY' || assertion.decision === 'REJECT') {
        denied = true;
        reasonCodes.push(`RIGHTS_DENIED:${assertionType}`);
        continue;
      }
      if (assertion.rights_state !== 'ALLOW') {
        unknownRights = true;
        reasonCodes.push(`RIGHTS_UNKNOWN:${assertionType}`);
        continue;
      }
    }
    if (assertion.decision !== 'PASS') {
      reasonCodes.push(`ASSERTION_NOT_PASS:${assertionType}`);
      continue;
    }
    satisfied.push(assertionType);
  }

  let decision: 'PASS' | 'HOLD' | 'REJECT' = satisfied.length === ASI_BOUNDED_SHADOW_REQUIRED_ASSERTIONS.length
    ? 'PASS'
    : 'HOLD';
  if (denied || processorRejected) decision = 'REJECT';
  else if (unknownRights || processorHeld) decision = 'HOLD';
  const rightsState: 'ALLOW' | 'DENY' | 'UNKNOWN' = denied ? 'DENY' : unknownRights ? 'UNKNOWN' : 'ALLOW';
  const observedAt = admissionObservedAt(request.source_event, relevant);
  const eventInput: AsiEventEnvelope = {...request.source_event, observed_at: observedAt, occurred_at: observedAt};
  const payload = {
    source_id: sourceId,
    purpose,
    evidence_class: request.evidence_class || 'SOURCE_QUALIFICATION_ASSERTIONS',
    output_class: request.output_class || 'INTERNAL_SHADOW',
    policy_version: 'kidults-asi-purpose-specific-admission-policy-v1@1.0.0',
    required_assertion_count: ASI_BOUNDED_SHADOW_REQUIRED_ASSERTIONS.length,
    satisfied_assertion_count: satisfied.length,
    required_assertion_types: [...ASI_BOUNDED_SHADOW_REQUIRED_ASSERTIONS],
    satisfied_assertion_types: satisfied,
    assertion_ids: [...new Set(assertionIds)].sort(),
    acquisition_planning_authorized: decision === 'PASS' && rightsState === 'ALLOW',
    collection_execution_authorized: false,
    public_projection_authorized: false,
    production_authorized: false,
  };
  const event = await derivedEvent(
    eventInput,
    'PURPOSE_ADMISSION_MATERIALIZER',
    'SOURCE_PURPOSE_ADMISSION_DECIDED',
    payload,
    purpose,
    decision,
    rightsState,
    reasonCodes,
    assertionIds,
  );
  return {
    source_id: sourceId,
    purpose,
    decision,
    rights_state: rightsState,
    required_assertion_types: ASI_BOUNDED_SHADOW_REQUIRED_ASSERTIONS,
    satisfied_assertion_types: satisfied,
    assertion_ids: [...new Set(assertionIds)].sort(),
    reason_codes: [...new Set(reasonCodes)].sort(),
    event,
    acquisition_planning_authorized: decision === 'PASS' && rightsState === 'ALLOW',
    collection_execution_authorized: false,
    public_projection_authorized: false,
    production_authorized: false,
  };
}

export function asiProcessorInventory(): Array<{
  fleet_id: AsiFleetId;
  stage: AsiFleetStage;
  input_event_type: string;
  output_event_type: string;
  assertion_types: readonly string[];
  side_effect_mode: 'PURE_SHADOW_NO_IO';
}> {
  return Object.entries(PROCESSOR_SPECS).map(([fleetId, spec]) => ({
    fleet_id: fleetId as AsiFleetId,
    stage: spec.stage,
    input_event_type: spec.inputType,
    output_event_type: spec.outputType,
    assertion_types: spec.assertionTypes,
    side_effect_mode: 'PURE_SHADOW_NO_IO',
  }));
}
