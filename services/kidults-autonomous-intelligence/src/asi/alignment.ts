import type { AsiEventEnvelope } from './event';
import {
  ASI_ENGINE_ALIGNMENT_PROFILE as REGISTERED_ALIGNMENT_PROFILE,
  ASI_ENGINE_ALIGNMENT_STATE,
  ASI_FLEET_BY_ID,
  ASI_PLATFORM_PRINCIPLES,
  asiLogicalEngineForFleet,
  type AsiFleetId,
  type AsiLogicalEngineId,
  type AsiPlatformPrinciple,
} from './registry';

export const ASI_ENGINE_ALIGNMENT_POLICY_VERSION = 'kidults-asi-engine-refactoring-contract-v2@2.0.0' as const;
export const ASI_ENGINE_ALIGNMENT_PROFILE = REGISTERED_ALIGNMENT_PROFILE;
export const ASI_ENGINE_ALIGNMENT_POLICY_DIGEST =
  'sha256:e8fa4231fe0e282da94c54c65b79b88d3f20638f236237d81c8e9fb6272b3c35' as const;

export type AsiAlignmentState = 'PASS' | 'FAIL';

export interface AsiPrincipleAlignmentResult {
  principle: AsiPlatformPrinciple;
  state: AsiAlignmentState;
  checks: string[];
  failure_codes: string[];
}

export interface AsiEngineAlignmentPreflightReceipt {
  receipt_id: string;
  receipt_type: 'ASI_ENGINE_ALIGNMENT_PREFLIGHT_V2';
  policy_version: typeof ASI_ENGINE_ALIGNMENT_POLICY_VERSION;
  policy_digest: typeof ASI_ENGINE_ALIGNMENT_POLICY_DIGEST;
  profile: typeof ASI_ENGINE_ALIGNMENT_PROFILE;
  fleet_id: AsiFleetId;
  logical_engine_id: AsiLogicalEngineId;
  stage: string;
  input_event_id: string;
  input_snapshot_ref: string;
  principle_order: readonly AsiPlatformPrinciple[];
  principle_results: Record<AsiPlatformPrinciple, AsiPrincipleAlignmentResult>;
  hard_floor_pass: boolean;
  failure_codes: string[];
  evidence_refs: string[];
  provider_direct_path_allowed: false;
  collection_permission_created: false;
  public_projection_authorized: false;
  production: 'HOLD';
}

export interface AsiEngineAlignmentReceipt extends Omit<AsiEngineAlignmentPreflightReceipt, 'receipt_type'> {
  receipt_type: 'ASI_ENGINE_ALIGNMENT_RESULT_V2';
  output_event_id: string;
  output_payload_hash: string;
  processor_version: string;
}

const NON_EMPTY = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RIGHTS = new Set(['ALLOW', 'DENY', 'UNKNOWN', 'NOT_APPLICABLE']);
const FRESHNESS = new Set(['CURRENT', 'STALE', 'EXPIRED', 'UNKNOWN']);
const DECISIONS = new Set(['PASS', 'HOLD', 'REJECT', 'NOT_APPLICABLE', null]);

function canonicalValue(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('ASI_ALIGNMENT_NON_FINITE_NUMBER');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('ASI_ALIGNMENT_CYCLIC_VALUE');
    seen.add(value);
    const result = value.map((item) => canonicalValue(item, seen));
    seen.delete(value);
    return result;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) throw new Error('ASI_ALIGNMENT_CYCLIC_VALUE');
    seen.add(value);
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
      result[key] = canonicalValue(item, seen);
    }
    seen.delete(value);
    return result;
  }
  throw new Error('ASI_ALIGNMENT_VALUE_NOT_JSON_COMPATIBLE');
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalValue(value)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sourceIdentityPresent(event: AsiEventEnvelope): boolean {
  if (NON_EMPTY(event.payload.source_id)) return true;
  const seed = record(event.payload.discovery_seed);
  if (NON_EMPTY(seed.source_id) || NON_EMPTY(seed.canonical_host)) return true;
  const source = record(event.payload.source);
  return NON_EMPTY(source.source_id) || NON_EMPTY(source.canonical_host);
}

function providerBypassRequested(payload: Record<string, unknown>): boolean {
  return payload.provider_direct_to_truth === true ||
    payload.provider_direct_to_index === true ||
    payload.provider_direct_to_projection === true ||
    payload.provider_overwrites_canonical_truth === true ||
    payload.external_raw_data_is_kidults_moat === true;
}

function result(
  principle: AsiPlatformPrinciple,
  checks: Array<[string, boolean]>,
): AsiPrincipleAlignmentResult {
  const failureCodes = checks.filter(([, pass]) => !pass).map(([code]) => code);
  return {
    principle,
    state: failureCodes.length === 0 ? 'PASS' : 'FAIL',
    checks: checks.map(([code]) => code),
    failure_codes: failureCodes,
  };
}

export async function evaluateAsiExecutionAlignment(
  fleetId: AsiFleetId,
  event: AsiEventEnvelope,
): Promise<AsiEngineAlignmentPreflightReceipt> {
  const fleet = ASI_FLEET_BY_ID.get(fleetId);
  if (!fleet) throw new Error(`ASI_ENGINE_ALIGNMENT_PROFILE_MISSING:${fleetId}`);
  if (ASI_ENGINE_ALIGNMENT_PROFILE !== 'FOUR_PRINCIPLE_HARD_FLOOR_V2' || ASI_ENGINE_ALIGNMENT_STATE !== 'ENFORCED') {
    throw new Error(`ASI_ENGINE_ALIGNMENT_PROFILE_NOT_ENFORCED:${fleetId}`);
  }
  const logicalEngine = asiLogicalEngineForFleet(fleetId);

  const payload = record(event.payload);
  const partition = event.partition;
  const autonomous = result('AUTONOMOUS', [
    ['AUTONOMOUS_FLEET_REGISTERED', true],
    ['AUTONOMOUS_LOGICAL_ENGINE_BOUND', NON_EMPTY(logicalEngine)],
    ['AUTONOMOUS_EXPLICIT_TARGET_ROUTING_ABSENT', payload.target_fleet === undefined],
    ['AUTONOMOUS_PRODUCTION_SIDE_EFFECT_NOT_REQUESTED', payload.production_authorized !== true],
    ['AUTONOMOUS_PUBLIC_SIDE_EFFECT_NOT_REQUESTED', payload.public_projection_authorized !== true],
  ]);
  const global = result('GLOBAL', [
    ['GLOBAL_CHANNEL_EXPLICIT', NON_EMPTY(partition.channel)],
    ['GLOBAL_REGION_EXPLICIT', NON_EMPTY(partition.region)],
    ['GLOBAL_LANGUAGE_EXPLICIT', NON_EMPTY(partition.language)],
    ['GLOBAL_SCOPE_EXPLICIT', NON_EMPTY(partition.scope_id)],
    ['GLOBAL_SOURCE_ROLE_EXPLICIT', NON_EMPTY(partition.source_role)],
    ['GLOBAL_CANONICAL_HOST_PARTITION_EXPLICIT', NON_EMPTY(partition.canonical_host_hash)],
  ]);
  const irreplaceable = result('IRREPLACEABLE_VALUE', [
    ['IRREPLACEABLE_SOURCE_IDENTITY_PRESENT', sourceIdentityPresent(event)],
    ['IRREPLACEABLE_PROVIDER_DIRECT_PATH_FORBIDDEN', !providerBypassRequested(payload)],
    ['IRREPLACEABLE_KIDULTS_LOGICAL_ENGINE_BOUND', NON_EMPTY(logicalEngine)],
    ['IRREPLACEABLE_EXTERNAL_COLLECTION_NOT_AUTHORIZED', payload.content_collection_authorized !== true && payload.external_collection_execution_authorized !== true],
  ]);
  const transparent = result('TRANSPARENT', [
    ['TRANSPARENT_INPUT_SNAPSHOT_PRESENT', NON_EMPTY(event.input_snapshot_ref)],
    ['TRANSPARENT_PAYLOAD_HASH_VALID', HASH_PATTERN.test(event.payload_hash)],
    ['TRANSPARENT_RIGHTS_STATE_EXPLICIT', RIGHTS.has(event.rights_state)],
    ['TRANSPARENT_FRESHNESS_STATE_EXPLICIT', FRESHNESS.has(event.freshness_state)],
    ['TRANSPARENT_DECISION_STATE_EXPLICIT', DECISIONS.has(event.decision)],
    ['TRANSPARENT_REASON_CODES_ARRAY', Array.isArray(event.reason_codes)],
    ['TRANSPARENT_TRACE_REFS_ARRAY', Array.isArray(event.trace_refs)],
    ['TRANSPARENT_EVENT_AND_PROCESSOR_VERSIONED', NON_EMPTY(event.event_version) && NON_EMPTY(event.producer_version)],
  ]);

  const principleResults: Record<AsiPlatformPrinciple, AsiPrincipleAlignmentResult> = {
    AUTONOMOUS: autonomous,
    GLOBAL: global,
    IRREPLACEABLE_VALUE: irreplaceable,
    TRANSPARENT: transparent,
  };
  const failureCodes = ASI_PLATFORM_PRINCIPLES.flatMap((principle) => principleResults[principle].failure_codes);
  const receiptBase = {
    policy_version: ASI_ENGINE_ALIGNMENT_POLICY_VERSION,
    policy_digest: ASI_ENGINE_ALIGNMENT_POLICY_DIGEST,
    profile: ASI_ENGINE_ALIGNMENT_PROFILE,
    fleet_id: fleet.id,
    logical_engine_id: logicalEngine,
    stage: fleet.stage,
    input_event_id: event.event_id,
    input_snapshot_ref: event.input_snapshot_ref,
    principle_order: ASI_PLATFORM_PRINCIPLES,
    principle_results: principleResults,
    hard_floor_pass: failureCodes.length === 0,
    failure_codes: [...new Set(failureCodes)].sort(),
    evidence_refs: [...new Set([
      event.event_id,
      event.input_snapshot_ref,
      event.payload_hash,
      ...event.trace_refs,
      ASI_ENGINE_ALIGNMENT_POLICY_DIGEST,
    ])].sort(),
  };
  const receiptHash = await sha256(receiptBase);
  return {
    receipt_id: `align_${receiptHash.slice('sha256:'.length, 'sha256:'.length + 32)}`,
    receipt_type: 'ASI_ENGINE_ALIGNMENT_PREFLIGHT_V2',
    ...receiptBase,
    provider_direct_path_allowed: false,
    collection_permission_created: false,
    public_projection_authorized: false,
    production: 'HOLD',
  };
}

export async function assertAsiExecutionAlignment(
  fleetId: AsiFleetId,
  event: AsiEventEnvelope,
): Promise<AsiEngineAlignmentPreflightReceipt> {
  const receipt = await evaluateAsiExecutionAlignment(fleetId, event);
  if (!receipt.hard_floor_pass) {
    throw new Error(`ASI_ENGINE_ALIGNMENT_HARD_FLOOR_FAILED:${fleetId}:${receipt.failure_codes.join('|')}`);
  }
  return receipt;
}

export async function finalizeAsiEngineAlignment(
  preflight: AsiEngineAlignmentPreflightReceipt,
  outputEvent: AsiEventEnvelope,
  processorVersion: string,
): Promise<AsiEngineAlignmentReceipt> {
  if (!preflight.hard_floor_pass) throw new Error('ASI_ENGINE_ALIGNMENT_PREFLIGHT_NOT_PASS');
  if (!HASH_PATTERN.test(outputEvent.payload_hash)) throw new Error('ASI_ENGINE_ALIGNMENT_OUTPUT_HASH_INVALID');
  const finalHash = await sha256({
    preflight_receipt_id: preflight.receipt_id,
    output_event_id: outputEvent.event_id,
    output_payload_hash: outputEvent.payload_hash,
    processor_version: processorVersion,
  });
  return {
    ...preflight,
    receipt_id: `align_${finalHash.slice('sha256:'.length, 'sha256:'.length + 32)}`,
    receipt_type: 'ASI_ENGINE_ALIGNMENT_RESULT_V2',
    output_event_id: outputEvent.event_id,
    output_payload_hash: outputEvent.payload_hash,
    processor_version: processorVersion,
  };
}

export function assertAsiEngineAlignmentReceipt(receipt: AsiEngineAlignmentReceipt): void {
  if (receipt.policy_version !== ASI_ENGINE_ALIGNMENT_POLICY_VERSION ||
      receipt.policy_digest !== ASI_ENGINE_ALIGNMENT_POLICY_DIGEST ||
      receipt.profile !== ASI_ENGINE_ALIGNMENT_PROFILE) {
    throw new Error('ASI_ENGINE_ALIGNMENT_RECEIPT_POLICY_MISMATCH');
  }
  if (!receipt.hard_floor_pass || receipt.failure_codes.length > 0) {
    throw new Error('ASI_ENGINE_ALIGNMENT_RECEIPT_NOT_PASS');
  }
  for (const principle of ASI_PLATFORM_PRINCIPLES) {
    if (receipt.principle_results[principle]?.state !== 'PASS') {
      throw new Error(`ASI_ENGINE_ALIGNMENT_RECEIPT_AXIS_NOT_PASS:${principle}`);
    }
  }
  if (!NON_EMPTY(receipt.output_event_id) || !HASH_PATTERN.test(receipt.output_payload_hash)) {
    throw new Error('ASI_ENGINE_ALIGNMENT_RECEIPT_OUTPUT_EVIDENCE_INVALID');
  }
  if (receipt.provider_direct_path_allowed !== false || receipt.collection_permission_created !== false ||
      receipt.public_projection_authorized !== false || receipt.production !== 'HOLD') {
    throw new Error('ASI_ENGINE_ALIGNMENT_RECEIPT_PERMISSION_PROMOTION');
  }
}
