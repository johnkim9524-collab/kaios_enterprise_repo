#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const POLICY_PATH = 'coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json';
const PROMOTION_CONTRACT_PATH = 'contracts/certification/kidults-controlled-production-promotion.v1.json';
const TECHNICAL_EVIDENCE_ID = 'KIDULTS_PRODUCTION_READINESS_EVIDENCE_V1';
const READINESS_ID = 'KIDULTS_PRODUCTION_READINESS_DECISION_V1';
const OWNER_RECEIPT_ID = 'KIDULTS_PROGRAM_OWNER_PRODUCTION_RELEASE_RECEIPT_V1';
const CONSUMPTION_ATTESTATION_ID = 'KIDULTS_PROTECTED_EXECUTOR_RELEASE_CONSUMPTION_ATTESTATION_V1';
const NONCE_STORE_RECEIPT_ID = 'KIDULTS_PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_V1';
const SEALED_MANIFEST_ID = 'KIDULTS_SEALED_PRODUCTION_RELEASE_EVIDENCE_V1';
const VERSION = '1.0.0';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RECOVERY_EVIDENCE_AGE_MS = 30 * DAY_MS;
const MAX_OWNER_RECEIPT_TTL_MS = DAY_MS;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SUPPORTED_POLICY_VERSIONS = new Set(['1.0.0', '1.1.0']);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ARCHIVE_MEMBER_PATTERN = /^(?:support\/[A-Za-z0-9._/-]+|[A-Za-z0-9._-]+\.json)$/;

const AUXILIARY_EVIDENCE_SPECS = Object.freeze([
  ['production-audit.json', 'KIDULTS_PRODUCTION_AUDIT_EVIDENCE_V1', 'KIDULTS_PRODUCTION_AUDIT_COLLECTOR_V1'],
  ['production-rollback-rehearsal.json', 'KIDULTS_PRODUCTION_ROLLBACK_REHEARSAL_EVIDENCE_V1', 'KIDULTS_PRODUCTION_ROLLBACK_REHEARSAL_V1'],
  ['production-mobile-320.json', 'KIDULTS_PRODUCTION_MOBILE_320_EVIDENCE_V1', 'KIDULTS_PRODUCTION_MOBILE_CERTIFIER_V1'],
  ['production-governance-trust.json', 'KIDULTS_PRODUCTION_GOVERNANCE_TRUST_EVIDENCE_V1', 'KIDULTS_PRODUCTION_GOVERNANCE_CERTIFIER_V1'],
  ['production-observability.json', 'KIDULTS_PRODUCTION_OBSERVABILITY_EVIDENCE_V1', 'KIDULTS_PRODUCTION_OBSERVABILITY_CERTIFIER_V1'],
  ['production-incident-response.json', 'KIDULTS_PRODUCTION_INCIDENT_RESPONSE_EVIDENCE_V1', 'KIDULTS_PRODUCTION_INCIDENT_RESPONSE_CERTIFIER_V1'],
  ['staging-production-delta.json', 'KIDULTS_STAGING_PRODUCTION_DELTA_EVIDENCE_V1', 'KIDULTS_STAGING_PRODUCTION_DELTA_CERTIFIER_V1'],
].map(([member, schemaId, producerId]) => ({ member, schemaId, producerId })));

const SUPPORT_EVIDENCE_SPECS = Object.freeze({
  OBSERVATION_LEDGER: 'KIDULTS_NATURAL_RUN_LEDGER_V1',
  BETA_RELIABILITY: 'KIDULTS_BETA_RELIABILITY_EVALUATOR_V1',
  SLO_ERROR_BUDGET: 'KIDULTS_SLO_ERROR_BUDGET_EVALUATOR_V1',
  PITR: 'KIDULTS_PITR_VERIFIER_V1',
  ROLLBACK: 'KIDULTS_ROLLBACK_VERIFIER_V1',
  NATURAL_RUN: 'KIDULTS_NATURAL_RUN_EXECUTOR_V1',
});
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROMOTION_CONTRACT = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, PROMOTION_CONTRACT_PATH), 'utf8'));
const CONTRACT_POLICY_VERSION = PROMOTION_CONTRACT.canonical_policy_version;

export class ProductionReleaseGateError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProductionReleaseGateError';
    this.code = code;
  }
}

const fail = (code) => {
  throw new ProductionReleaseGateError(code);
};

const ok = (condition, code) => {
  if (!condition) fail(code);
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const exactKeys = (value, keys, code) => {
  ok(isObject(value), `${code}:NOT_OBJECT`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${code}:FIELD_SET`);
};

const recursivelySorted = (value) => {
  if (Array.isArray(value)) return value.map(recursivelySorted);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, recursivelySorted(value[key])]));
};

export const stableStringify = (value) => JSON.stringify(recursivelySorted(value));

const sha256Bytes = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
export const sha256Object = (value) => sha256Bytes(Buffer.from(stableStringify(value), 'utf8'));

const stableStatFields = (metadata) => [
  metadata.dev, metadata.ino, metadata.mode, metadata.nlink, metadata.uid,
  metadata.gid, metadata.size, metadata.mtimeMs, metadata.ctimeMs,
];

const readStableRegularFile = (filePath, code, maximumBytes = Number.MAX_SAFE_INTEGER) => {
  let pathBefore;
  let descriptor = -1;
  try {
    const heldDescriptorPath = /^\/proc\/self\/fd\/[0-9]+$/.test(String(filePath));
    pathBefore = heldDescriptorPath ? fs.statSync(filePath) : fs.lstatSync(filePath);
    descriptor = fs.openSync(
      filePath,
      fs.constants.O_RDONLY
        | (heldDescriptorPath ? 0 : (fs.constants.O_NOFOLLOW ?? 0))
        | (fs.constants.O_NONBLOCK ?? 0),
    );
    const opened = fs.fstatSync(descriptor);
    ok(
      opened.isFile()
        && opened.nlink === 1
        && opened.dev === pathBefore.dev
        && opened.ino === pathBefore.ino
        && opened.size <= maximumBytes,
      code,
    );
    const raw = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor);
    const pathAfter = heldDescriptorPath ? fs.statSync(filePath) : fs.lstatSync(filePath);
    ok(
      raw.length === opened.size
        && JSON.stringify(stableStatFields(opened)) === JSON.stringify(stableStatFields(after))
        && after.dev === pathAfter.dev
        && after.ino === pathAfter.ino,
      code,
    );
    return raw;
  } catch (error) {
    if (error instanceof ProductionReleaseGateError) throw error;
    fail(code);
  } finally {
    if (descriptor >= 0) fs.closeSync(descriptor);
  }
};

export const sha256File = (filePath) => sha256Bytes(readStableRegularFile(filePath, 'SHA256_FILE_INVALID'));

const requireSha256 = (value, code) => ok(typeof value === 'string' && SHA256_PATTERN.test(value), code);
const requireSourceSha = (value, code) => ok(typeof value === 'string' && SOURCE_SHA_PATTERN.test(value), code);
const requireIdentifier = (value, code) => ok(typeof value === 'string' && IDENTIFIER_PATTERN.test(value), code);
const requireRunId = (value, code) => ok(typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value), code);
const requireRunAttempt = (value, code) => ok(Number.isInteger(value) && value >= 1 && value <= 1000, code);
const requireArchiveMember = (value, code) => {
  ok(typeof value === 'string' && ARCHIVE_MEMBER_PATTERN.test(value), code);
  ok(!value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..'), code);
};

const parseIso = (value, code) => {
  ok(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value), code);
  const timestamp = Date.parse(value);
  ok(Number.isFinite(timestamp), code);
  return timestamp;
};

const loadJson = (filePath, code) => {
  let raw;
  let value;
  try {
    raw = readStableRegularFile(filePath, code);
    value = JSON.parse(raw.toString('utf8'));
  } catch {
    fail(code);
  }
  return { raw, value };
};

const parseNonEmptyEvidenceEnvelope = (raw, {
  schemaId,
  producerId,
  sourceSha,
  evidenceKind = null,
  subjectId = null,
  code,
}) => {
  let value;
  try {
    value = JSON.parse(raw.toString('utf8'));
  } catch {
    fail(`${code}:JSON`);
  }
  exactKeys(value, [
    'id', 'version', 'producer_id', 'source_sha', 'observed_at', 'state',
    ...(evidenceKind === null ? [] : ['evidence_kind', 'subject_id']),
    'evidence',
  ], code);
  ok(value.id === schemaId && value.version === VERSION, `${code}:SCHEMA`);
  ok(value.producer_id === producerId, `${code}:PRODUCER`);
  ok(value.source_sha === sourceSha, `${code}:SOURCE_SHA`);
  parseIso(value.observed_at, `${code}:OBSERVED_AT`);
  ok(value.state === 'VERIFIED', `${code}:STATE`);
  if (evidenceKind !== null) {
    ok(value.evidence_kind === evidenceKind, `${code}:KIND`);
    ok(value.subject_id === subjectId, `${code}:SUBJECT`);
  }
  ok(isObject(value.evidence) && Object.keys(value.evidence).length > 0, `${code}:EMPTY_EVIDENCE`);
  return value;
};

const validateAuxiliaryBindings = (bindings, expectedSourceSha) => {
  ok(Array.isArray(bindings) && bindings.length === AUXILIARY_EVIDENCE_SPECS.length, 'AUXILIARY_BINDING_COUNT');
  const byMember = new Map();
  for (const binding of bindings) {
    exactKeys(binding, ['member', 'schema_id', 'schema_version', 'producer_id', 'source_sha', 'sha256'], 'AUXILIARY_BINDING');
    requireArchiveMember(binding.member, 'AUXILIARY_BINDING_MEMBER');
    ok(!byMember.has(binding.member), 'AUXILIARY_BINDING_DUPLICATE');
    requireSha256(binding.sha256, 'AUXILIARY_BINDING_DIGEST');
    ok(binding.source_sha === expectedSourceSha, 'AUXILIARY_BINDING_SOURCE_SHA');
    byMember.set(binding.member, binding);
  }
  for (const spec of AUXILIARY_EVIDENCE_SPECS) {
    const binding = byMember.get(spec.member);
    ok(binding, `AUXILIARY_BINDING_MISSING:${spec.member}`);
    ok(binding.schema_id === spec.schemaId && binding.schema_version === VERSION, `AUXILIARY_BINDING_SCHEMA:${spec.member}`);
    ok(binding.producer_id === spec.producerId, `AUXILIARY_BINDING_PRODUCER:${spec.member}`);
  }
  return byMember;
};

const validateSupportBindings = (bindings, expectedSourceSha) => {
  ok(Array.isArray(bindings), 'SUPPORT_BINDINGS_NOT_ARRAY');
  const expectedKinds = ['OBSERVATION_LEDGER', 'BETA_RELIABILITY', 'SLO_ERROR_BUDGET', 'PITR', 'ROLLBACK'];
  const expectedCount = expectedKinds.length + 30;
  ok(bindings.length >= expectedCount, 'SUPPORT_BINDING_COUNT');
  const byKey = new Map();
  const byMember = new Map();
  for (const binding of bindings) {
    exactKeys(binding, ['evidence_kind', 'subject_id', 'member', 'schema_id', 'schema_version', 'producer_id', 'source_sha', 'sha256'], 'SUPPORT_BINDING');
    ok(Object.hasOwn(SUPPORT_EVIDENCE_SPECS, binding.evidence_kind), 'SUPPORT_BINDING_KIND');
    requireIdentifier(binding.subject_id, 'SUPPORT_BINDING_SUBJECT');
    requireArchiveMember(binding.member, 'SUPPORT_BINDING_MEMBER');
    ok(binding.member.startsWith('support/'), 'SUPPORT_BINDING_MEMBER_SCOPE');
    requireSha256(binding.sha256, 'SUPPORT_BINDING_DIGEST');
    ok(binding.schema_id === 'KIDULTS_PRODUCTION_SUPPORT_EVIDENCE_RECEIPT_V1' && binding.schema_version === VERSION, 'SUPPORT_BINDING_SCHEMA');
    ok(binding.producer_id === SUPPORT_EVIDENCE_SPECS[binding.evidence_kind], 'SUPPORT_BINDING_PRODUCER');
    ok(binding.source_sha === expectedSourceSha, 'SUPPORT_BINDING_SOURCE_SHA');
    const key = `${binding.evidence_kind}:${binding.subject_id}`;
    ok(!byKey.has(key), 'SUPPORT_BINDING_DUPLICATE_LOGICAL');
    ok(!byMember.has(binding.member), 'SUPPORT_BINDING_DUPLICATE_MEMBER');
    byKey.set(key, binding);
    byMember.set(binding.member, binding);
  }
  for (const kind of expectedKinds) ok(byKey.has(`${kind}:${kind.toLowerCase()}`), `SUPPORT_BINDING_MISSING:${kind}`);
  return { byKey, byMember };
};

const withoutKeys = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

const expectedSupportEvidence = (technicalEvidence, binding) => {
  if (binding.evidence_kind === 'OBSERVATION_LEDGER') {
    return {
      observation_window: withoutKeys(technicalEvidence.observation_window, ['ledger_receipt_sha256']),
      natural_run_partition: technicalEvidence.natural_runs.map((run) => ({
        natural_run_id: run.natural_run_id,
        workflow_run_id: run.workflow_run_id,
        run_attempt: run.run_attempt,
        logical_schedule_slot: run.logical_schedule_slot,
      })),
    };
  }
  if (binding.evidence_kind === 'BETA_RELIABILITY') return withoutKeys(technicalEvidence.beta_reliability, ['receipt_sha256']);
  if (binding.evidence_kind === 'SLO_ERROR_BUDGET') return withoutKeys(technicalEvidence.slo_error_budget, ['receipt_sha256']);
  if (binding.evidence_kind === 'PITR') {
    return Object.fromEntries(Object.entries(technicalEvidence.recovery).filter(([key]) => key.startsWith('pitr_') && key !== 'pitr_receipt_sha256'));
  }
  if (binding.evidence_kind === 'ROLLBACK') {
    return Object.fromEntries(Object.entries(technicalEvidence.recovery).filter(([key]) => key.startsWith('rollback_') && key !== 'rollback_receipt_sha256'));
  }
  if (binding.evidence_kind === 'NATURAL_RUN') {
    const run = technicalEvidence.natural_runs.find((candidate) => candidate.natural_run_id === binding.subject_id);
    ok(run, 'NATURAL_RUN_SUPPORT_SUBJECT_MISSING');
    return withoutKeys(run, ['receipt_sha256']);
  }
  fail('SUPPORT_EVIDENCE_KIND_UNREACHABLE');
};

const validateSupportEnvelopeSemantics = (envelope, technicalEvidence, binding) => {
  ok(stableStringify(envelope.evidence) === stableStringify(expectedSupportEvidence(technicalEvidence, binding)), `SUPPORT_MEMBER_SEMANTICS:${binding.evidence_kind}:${binding.subject_id}`);
};

const requireExactEvidenceFields = (evidence, fields, code) => exactKeys(evidence, fields, code);

const validateAuxiliaryEvidenceSemantics = (member, evidence) => {
  const shaHex = (value, code) => ok(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), code);
  if (member === 'production-audit.json') {
    requireExactEvidenceFields(evidence, [
      'status', 'production_root', 'production_database', 'database_integrity',
      'database_checksum', 'schema_checksum', 'health_http',
      'unauthenticated_collector_http', 'portal_http', 'latest_backup_manifest',
      'backup_age_seconds', 'backup_integrity', 'publication_promotion_authorized',
      'artfund_production_promotion_authorized',
    ], 'AUXILIARY_PRODUCTION_AUDIT_EVIDENCE');
    ok(evidence.status === 'pass', 'AUXILIARY_PRODUCTION_AUDIT_STATUS');
    ok(evidence.production_root === '/opt/intelligence-holdings/kidults/app', 'AUXILIARY_PRODUCTION_AUDIT_ROOT');
    ok(evidence.production_database === '/opt/intelligence-holdings/kidults/data/kaios.db', 'AUXILIARY_PRODUCTION_AUDIT_DATABASE');
    ok(evidence.database_integrity === 'ok' && evidence.backup_integrity === 'ok', 'AUXILIARY_PRODUCTION_AUDIT_INTEGRITY');
    shaHex(evidence.database_checksum, 'AUXILIARY_PRODUCTION_AUDIT_DATABASE_DIGEST');
    shaHex(evidence.schema_checksum, 'AUXILIARY_PRODUCTION_AUDIT_SCHEMA_DIGEST');
    ok(evidence.health_http === 200 && evidence.portal_http === 200 && evidence.unauthenticated_collector_http === 401, 'AUXILIARY_PRODUCTION_AUDIT_HTTP');
    ok(typeof evidence.latest_backup_manifest === 'string' && evidence.latest_backup_manifest.startsWith('/'), 'AUXILIARY_PRODUCTION_AUDIT_BACKUP_PATH');
    ok(Number.isInteger(evidence.backup_age_seconds) && evidence.backup_age_seconds >= 0 && evidence.backup_age_seconds <= DAY_MS / 1000, 'AUXILIARY_PRODUCTION_AUDIT_BACKUP_AGE');
    ok(evidence.publication_promotion_authorized === false && evidence.artfund_production_promotion_authorized === false, 'AUXILIARY_PRODUCTION_AUDIT_AUTHORIZATION');
    return;
  }
  if (member === 'production-rollback-rehearsal.json') {
    requireExactEvidenceFields(evidence, [
      'status', 'rollback_rehearsal_passed', 'snapshot_manifest_sha256',
      'recovery_receipt_sha256', 'production_change_executed',
      'artfund_production_promotion_authorized',
    ], 'AUXILIARY_ROLLBACK_REHEARSAL_EVIDENCE');
    ok(evidence.status === 'pass' && evidence.rollback_rehearsal_passed === true, 'AUXILIARY_ROLLBACK_REHEARSAL_STATUS');
    requireSha256(evidence.snapshot_manifest_sha256, 'AUXILIARY_ROLLBACK_REHEARSAL_SNAPSHOT');
    requireSha256(evidence.recovery_receipt_sha256, 'AUXILIARY_ROLLBACK_REHEARSAL_RECEIPT');
    ok(evidence.production_change_executed === false && evidence.artfund_production_promotion_authorized === false, 'AUXILIARY_ROLLBACK_REHEARSAL_AUTHORIZATION');
    return;
  }
  if (member === 'production-mobile-320.json') {
    requireExactEvidenceFields(evidence, [
      'status', 'viewport_width', 'mobile_320_passed', 'overflow_detected',
      'visual_evidence_sha256',
    ], 'AUXILIARY_MOBILE_EVIDENCE');
    ok(evidence.status === 'pass' && evidence.viewport_width === 320 && evidence.mobile_320_passed === true && evidence.overflow_detected === false, 'AUXILIARY_MOBILE_STATUS');
    requireSha256(evidence.visual_evidence_sha256, 'AUXILIARY_MOBILE_DIGEST');
    return;
  }
  if (member === 'production-governance-trust.json') {
    requireExactEvidenceFields(evidence, [
      'status', 'governance_gate_passed', 'policy_sha256', 'rights_census_state',
      'schema_census_state', 'publication_promotion_authorized',
    ], 'AUXILIARY_GOVERNANCE_EVIDENCE');
    ok(evidence.status === 'pass' && evidence.governance_gate_passed === true, 'AUXILIARY_GOVERNANCE_STATUS');
    requireSha256(evidence.policy_sha256, 'AUXILIARY_GOVERNANCE_POLICY_DIGEST');
    ok(evidence.rights_census_state === 'PASS' && evidence.schema_census_state === 'PASS', 'AUXILIARY_GOVERNANCE_CENSUS');
    ok(evidence.publication_promotion_authorized === false, 'AUXILIARY_GOVERNANCE_AUTHORIZATION');
    return;
  }
  if (member === 'production-observability.json') {
    requireExactEvidenceFields(evidence, [
      'status', 'observability_passed', 'slo_state', 'error_budget_state',
      'observability_receipt_sha256',
    ], 'AUXILIARY_OBSERVABILITY_EVIDENCE');
    ok(evidence.status === 'pass' && evidence.observability_passed === true, 'AUXILIARY_OBSERVABILITY_STATUS');
    ok(evidence.slo_state === 'PASS' && evidence.error_budget_state === 'WITHIN_BUDGET', 'AUXILIARY_OBSERVABILITY_BUDGET');
    requireSha256(evidence.observability_receipt_sha256, 'AUXILIARY_OBSERVABILITY_RECEIPT');
    return;
  }
  if (member === 'production-incident-response.json') {
    requireExactEvidenceFields(evidence, [
      'status', 'incident_response_ready', 'rollback_escalation_ready',
      'artfund_isolated', 'drill_receipt_sha256',
    ], 'AUXILIARY_INCIDENT_EVIDENCE');
    ok(evidence.status === 'pass' && evidence.incident_response_ready === true && evidence.rollback_escalation_ready === true && evidence.artfund_isolated === true, 'AUXILIARY_INCIDENT_STATUS');
    requireSha256(evidence.drill_receipt_sha256, 'AUXILIARY_INCIDENT_RECEIPT');
    return;
  }
  if (member === 'staging-production-delta.json') {
    requireExactEvidenceFields(evidence, [
      'status', 'destructive_schema_delta', 'viewer_export_exposed',
      'restricted_rights_exposed', 'rollback_rehearsal_passed',
      'mobile_320_passed', 'governance_gate_passed', 'observability_passed',
      'incident_response_ready', 'critical_deltas',
    ], 'AUXILIARY_STAGING_DELTA_EVIDENCE');
    ok(evidence.status === 'pass', 'AUXILIARY_STAGING_DELTA_STATUS');
    for (const field of ['destructive_schema_delta', 'viewer_export_exposed', 'restricted_rights_exposed']) {
      ok(evidence[field] === false, `AUXILIARY_STAGING_DELTA_NEGATIVE:${field}`);
    }
    for (const field of ['rollback_rehearsal_passed', 'mobile_320_passed', 'governance_gate_passed', 'observability_passed', 'incident_response_ready']) {
      ok(evidence[field] === true, `AUXILIARY_STAGING_DELTA_POSITIVE:${field}`);
    }
    ok(Array.isArray(evidence.critical_deltas) && evidence.critical_deltas.length === 0, 'AUXILIARY_STAGING_DELTA_CRITICAL');
    return;
  }
  fail(`AUXILIARY_MEMBER_SCHEMA_UNREGISTERED:${member}`);
};

const validateEvidenceEnvelopeTime = (envelope, technicalEvidence, now, code) => {
  const observedAt = parseIso(envelope.observed_at, `${code}:OBSERVED_AT`);
  const observationEndedAt = parseIso(technicalEvidence.observation_window.ended_at, `${code}:OBSERVATION_END`);
  const nowMs = now.getTime();
  ok(Number.isFinite(nowMs), `${code}:VERIFICATION_TIME`);
  ok(observedAt >= observationEndedAt, `${code}:BEFORE_OBSERVATION_END`);
  ok(observedAt <= nowMs + CLOCK_SKEW_MS, `${code}:FROM_FUTURE`);
};

const validateCanonicalPolicy = (policy, expectedPolicyVersion) => {
  ok(policy?.id === 'KIDULTS_CURRENT_SOLD_SAMPLE_GOVERNANCE_V1', 'POLICY_IDENTITY');
  ok(SUPPORTED_POLICY_VERSIONS.has(expectedPolicyVersion), 'CONTRACT_POLICY_VERSION_UNSUPPORTED');
  ok(policy?.version === expectedPolicyVersion, 'POLICY_VERSION');
  ok(policy?.rights_gate?.mode === 'CENSUS_NOT_SAMPLE', 'POLICY_RIGHTS_CENSUS_MODE');
  ok(policy?.rights_gate?.required_for_every_event === true, 'POLICY_RIGHTS_CENSUS_REQUIRED');
  ok(policy?.rights_gate?.unknown_or_expired_is === 'HOLD', 'POLICY_RIGHTS_UNKNOWN_HOLD');
  ok(policy?.failure_accounting?.retry_is_new_independent_success === false, 'POLICY_RETRY_INDEPENDENCE');
  ok(policy?.failure_accounting?.duplicate_event_counts_as === 'INVALID_AND_HOLD', 'POLICY_DUPLICATE_HOLD');
  const readiness = policy?.promotion_matrix?.PRODUCTION_READINESS;
  const production = policy?.promotion_matrix?.PRODUCTION;
  ok(readiness?.required_tier === 'BETA_RELIABILITY', 'POLICY_PRODUCTION_READINESS_TIER');
  ok(Number.isInteger(readiness?.required_natural_runs) && readiness.required_natural_runs === 30, 'POLICY_NATURAL_RUN_COUNT');
  ok(Number.isInteger(readiness?.required_window_days) && readiness.required_window_days === 7, 'POLICY_NATURAL_RUN_WINDOW');
  ok(readiness?.requires_slo_error_budget === true, 'POLICY_SLO_ERROR_BUDGET_REQUIRED');
  ok(readiness?.requires_pitr_rollback_receipt === true, 'POLICY_PITR_ROLLBACK_REQUIRED');
  ok(readiness?.release_allowed === false, 'POLICY_READINESS_CANNOT_RELEASE');
  ok(production?.required_tier === 'PRODUCTION_READINESS', 'POLICY_PRODUCTION_TIER');
  ok(production?.release_allowed === true, 'POLICY_PRODUCTION_RELEASE_ROUTE');
  ok(production?.program_owner_approval_required === true, 'POLICY_PROGRAM_OWNER_REQUIRED');
  const beta = policy?.tiers?.find((tier) => tier.id === 'BETA_RELIABILITY');
  ok(beta?.min_n === 4603 && beta?.zero_failure_n === 4603, 'POLICY_BETA_MINIMUM');
  ok(beta?.critical_defect_tolerance === 0, 'POLICY_BETA_CRITICAL_TOLERANCE');
  if (expectedPolicyVersion === '1.1.0') {
    ok(Array.isArray(policy.tiers) && policy.tiers.length === 6, 'POLICY_TIER_SET');
    ok(policy.tiers.every((tier) => tier.claim_target === 'DATED_OBSERVED_SOLD_TRANSACTION'), 'POLICY_TIER_CLAIM_TARGET');
  }
  return { readiness, production, beta };
};

const assertUnique = (values, code) => ok(new Set(values).size === values.length, code);

export function validateTechnicalEvidence(evidence, {
  expectedSourceSha,
  policy,
  policySha256,
  evidenceSha256 = null,
  expectedPolicyVersion = CONTRACT_POLICY_VERSION,
} = {}) {
  const policyRules = validateCanonicalPolicy(policy, expectedPolicyVersion);
  requireSourceSha(expectedSourceSha, 'EXPECTED_SOURCE_SHA');
  requireSha256(policySha256, 'POLICY_SHA256');
  if (evidenceSha256 !== null) requireSha256(evidenceSha256, 'EVIDENCE_SHA256');

  exactKeys(evidence, [
    'id', 'version', 'source_sha', 'policy_binding', 'observation_window', 'cohort_binding',
    'auxiliary_evidence_bindings', 'support_evidence_bindings',
    'beta_reliability', 'natural_runs', 'slo_error_budget', 'recovery',
  ], 'TECHNICAL_EVIDENCE');
  ok(evidence.id === TECHNICAL_EVIDENCE_ID && evidence.version === VERSION, 'TECHNICAL_EVIDENCE_IDENTITY');
  ok(evidence.source_sha === expectedSourceSha, 'TECHNICAL_EVIDENCE_SOURCE_SHA');
  const auxiliaryBindings = validateAuxiliaryBindings(evidence.auxiliary_evidence_bindings, expectedSourceSha);
  const supportBindings = validateSupportBindings(evidence.support_evidence_bindings, expectedSourceSha);

  exactKeys(evidence.policy_binding, ['path', 'id', 'version', 'sha256'], 'POLICY_BINDING');
  ok(evidence.policy_binding.path === POLICY_PATH, 'POLICY_BINDING_PATH');
  ok(evidence.policy_binding.id === policy.id && evidence.policy_binding.version === policy.version, 'POLICY_BINDING_IDENTITY');
  ok(evidence.policy_binding.sha256 === policySha256, 'POLICY_BINDING_DIGEST');

  const observation = evidence.observation_window;
  exactKeys(observation, [
    'pre_registered_at', 'started_at', 'ended_at', 'selection_rule', 'ledger_complete',
    'eligible_run_count', 'failed_run_count', 'retry_count', 'ledger_receipt_sha256',
  ], 'OBSERVATION_WINDOW');
  const preRegisteredAt = parseIso(observation.pre_registered_at, 'OBSERVATION_PRE_REGISTERED_AT');
  const observationStartedAt = parseIso(observation.started_at, 'OBSERVATION_STARTED_AT');
  const observationEndedAt = parseIso(observation.ended_at, 'OBSERVATION_ENDED_AT');
  ok(preRegisteredAt <= observationStartedAt, 'OBSERVATION_NOT_PRE_REGISTERED');
  ok(observationEndedAt - observationStartedAt >= policyRules.readiness.required_window_days * DAY_MS, 'OBSERVATION_WINDOW_TOO_SHORT');
  ok(observation.selection_rule === 'ALL_ELIGIBLE_FIRST_ATTEMPT_SCHEDULED_RUNS_IN_PRE_REGISTERED_WINDOW', 'OBSERVATION_SELECTION_RULE');
  ok(observation.ledger_complete === true, 'OBSERVATION_LEDGER_INCOMPLETE');
  ok(Number.isInteger(observation.eligible_run_count), 'OBSERVATION_ELIGIBLE_COUNT');
  ok(observation.failed_run_count === 0, 'OBSERVATION_FAILED_RUNS_PRESENT');
  ok(observation.retry_count === 0, 'OBSERVATION_RETRIES_PRESENT');
  requireSha256(observation.ledger_receipt_sha256, 'OBSERVATION_LEDGER_RECEIPT');
  ok(supportBindings.byKey.get('OBSERVATION_LEDGER:observation_ledger')?.sha256 === observation.ledger_receipt_sha256, 'OBSERVATION_LEDGER_MEMBER_BINDING');

  const cohort = evidence.cohort_binding;
  exactKeys(cohort, [
    'cohort_sha256', 'rights_census_sha256', 'schema_census_sha256',
    'rights_census_state', 'schema_census_state',
  ], 'COHORT_BINDING');
  for (const [field, code] of [
    ['cohort_sha256', 'COHORT_DIGEST'],
    ['rights_census_sha256', 'RIGHTS_CENSUS_DIGEST'],
    ['schema_census_sha256', 'SCHEMA_CENSUS_DIGEST'],
  ]) requireSha256(cohort[field], code);
  ok(cohort.rights_census_state === 'PASS', 'RIGHTS_CENSUS_NOT_PASS');
  ok(cohort.schema_census_state === 'PASS', 'SCHEMA_CENSUS_NOT_PASS');

  const beta = evidence.beta_reliability;
  exactKeys(beta, [
    'tier', 'effective_n', 'critical_defects', 'major_a_defects', 'major_b_defects',
    'operational_defects', 'track_b_decision', 'rights_census_state', 'schema_census_state',
    'coverage_gate_state', 'concentration_gate_state', 'cohort_sha256',
    'rights_census_sha256', 'schema_census_sha256', 'receipt_sha256',
  ], 'BETA_RELIABILITY');
  ok(beta.tier === 'BETA_RELIABILITY', 'BETA_TIER');
  ok(Number.isInteger(beta.effective_n) && beta.effective_n >= policyRules.beta.min_n, 'BETA_EFFECTIVE_N');
  for (const field of ['critical_defects', 'major_a_defects', 'major_b_defects', 'operational_defects']) {
    ok(beta[field] === 0, `BETA_ZERO_FAILURE:${field}`);
  }
  ok(beta.track_b_decision === 'PASS', 'BETA_TRACK_B_DECISION');
  ok(beta.rights_census_state === 'PASS' && beta.schema_census_state === 'PASS', 'BETA_CENSUS_STATE');
  ok(beta.coverage_gate_state === 'PASS' && beta.concentration_gate_state === 'PASS', 'BETA_COVERAGE_CONCENTRATION');
  for (const field of ['cohort_sha256', 'rights_census_sha256', 'schema_census_sha256']) {
    ok(beta[field] === cohort[field], `BETA_BINDING:${field}`);
  }
  requireSha256(beta.receipt_sha256, 'BETA_RECEIPT_DIGEST');
  ok(supportBindings.byKey.get('BETA_RELIABILITY:beta_reliability')?.sha256 === beta.receipt_sha256, 'BETA_RECEIPT_MEMBER_BINDING');

  const recovery = evidence.recovery;
  exactKeys(recovery, [
    'pitr_status', 'pitr_source_system', 'pitr_restore_target_is_isolated', 'pitr_verified_at',
    'pitr_restore_point_at', 'pitr_receipt_sha256', 'rollback_status', 'rollback_target',
    'rollback_verified_at', 'rollback_receipt_sha256',
  ], 'RECOVERY');
  ok(recovery.pitr_status === 'VERIFIED', 'PITR_NOT_VERIFIED');
  ok(recovery.pitr_source_system === 'POSTGRESQL_CANONICAL_SYSTEM_OF_RECORD', 'PITR_SOURCE_SYSTEM');
  ok(recovery.pitr_restore_target_is_isolated === true, 'PITR_RESTORE_TARGET_NOT_ISOLATED');
  const pitrVerifiedAt = parseIso(recovery.pitr_verified_at, 'PITR_VERIFIED_AT');
  const pitrRestorePointAt = parseIso(recovery.pitr_restore_point_at, 'PITR_RESTORE_POINT_AT');
  requireSha256(recovery.pitr_receipt_sha256, 'PITR_RECEIPT_DIGEST');
  ok(recovery.rollback_status === 'VERIFIED', 'ROLLBACK_NOT_VERIFIED');
  ok(recovery.rollback_target === 'CONTROLLED_PRODUCTION_RUNTIME', 'ROLLBACK_TARGET');
  const rollbackVerifiedAt = parseIso(recovery.rollback_verified_at, 'ROLLBACK_VERIFIED_AT');
  requireSha256(recovery.rollback_receipt_sha256, 'ROLLBACK_RECEIPT_DIGEST');
  ok(supportBindings.byKey.get('PITR:pitr')?.sha256 === recovery.pitr_receipt_sha256, 'PITR_RECEIPT_MEMBER_BINDING');
  ok(supportBindings.byKey.get('ROLLBACK:rollback')?.sha256 === recovery.rollback_receipt_sha256, 'ROLLBACK_RECEIPT_MEMBER_BINDING');
  ok(pitrRestorePointAt <= pitrVerifiedAt, 'PITR_RESTORE_POINT_AFTER_VERIFICATION');
  ok(pitrVerifiedAt <= observationEndedAt && observationEndedAt - pitrVerifiedAt <= MAX_RECOVERY_EVIDENCE_AGE_MS, 'PITR_RECEIPT_STALE');
  ok(rollbackVerifiedAt <= observationEndedAt && observationEndedAt - rollbackVerifiedAt <= MAX_RECOVERY_EVIDENCE_AGE_MS, 'ROLLBACK_RECEIPT_STALE');

  const slo = evidence.slo_error_budget;
  exactKeys(slo, [
    'status', 'measurement_started_at', 'measurement_ended_at', 'minimum_sample_size_met',
    'slo_target_ratio', 'observed_availability_ratio', 'error_budget_status',
    'error_budget_remaining_ratio', 'maximum_error_budget_burn_rate',
    'observed_error_budget_burn_rate', 'receipt_sha256',
  ], 'SLO_ERROR_BUDGET');
  const sloStartedAt = parseIso(slo.measurement_started_at, 'SLO_STARTED_AT');
  const sloEndedAt = parseIso(slo.measurement_ended_at, 'SLO_ENDED_AT');
  ok(sloStartedAt <= observationStartedAt && sloEndedAt >= observationEndedAt, 'SLO_WINDOW_COVERAGE');
  ok(slo.status === 'PASS' && slo.minimum_sample_size_met === true, 'SLO_NOT_PASS');
  ok(typeof slo.slo_target_ratio === 'number' && slo.slo_target_ratio > 0 && slo.slo_target_ratio <= 1, 'SLO_TARGET_RATIO');
  ok(typeof slo.observed_availability_ratio === 'number' && slo.observed_availability_ratio >= slo.slo_target_ratio && slo.observed_availability_ratio <= 1, 'SLO_OBSERVED_RATIO');
  ok(slo.error_budget_status === 'WITHIN_BUDGET', 'ERROR_BUDGET_NOT_WITHIN');
  ok(typeof slo.error_budget_remaining_ratio === 'number' && slo.error_budget_remaining_ratio >= 0 && slo.error_budget_remaining_ratio <= 1, 'ERROR_BUDGET_REMAINING');
  ok(typeof slo.maximum_error_budget_burn_rate === 'number' && slo.maximum_error_budget_burn_rate > 0, 'ERROR_BUDGET_MAX_BURN');
  ok(typeof slo.observed_error_budget_burn_rate === 'number' && slo.observed_error_budget_burn_rate >= 0 && slo.observed_error_budget_burn_rate <= slo.maximum_error_budget_burn_rate, 'ERROR_BUDGET_BURN_RATE');
  requireSha256(slo.receipt_sha256, 'SLO_RECEIPT_DIGEST');
  ok(supportBindings.byKey.get('SLO_ERROR_BUDGET:slo_error_budget')?.sha256 === slo.receipt_sha256, 'SLO_RECEIPT_MEMBER_BINDING');

  ok(Array.isArray(evidence.natural_runs), 'NATURAL_RUNS_NOT_ARRAY');
  ok(evidence.natural_runs.length >= policyRules.readiness.required_natural_runs, 'NATURAL_RUN_COUNT_TOO_LOW');
  ok(observation.eligible_run_count === evidence.natural_runs.length, 'NATURAL_RUN_LEDGER_COUNT_MISMATCH');
  const runFields = [
    'natural_run_id', 'workflow_run_id', 'run_attempt', 'logical_schedule_slot', 'started_at',
    'completed_at', 'trigger', 'conclusion', 'source_sha', 'policy_sha256', 'cohort_sha256',
    'rights_census_sha256', 'schema_census_sha256', 'rights_census_state', 'schema_census_state',
    'slo_state', 'error_budget_state', 'pitr_receipt_sha256', 'rollback_receipt_sha256',
    'receipt_sha256',
  ];
  const runIds = [];
  const workflowRunIds = [];
  const scheduleSlots = [];
  const receiptDigests = [];
  const slotTimes = [];
  const startedTimes = [];
  const completedTimes = [];
  for (const run of evidence.natural_runs) {
    exactKeys(run, runFields, 'NATURAL_RUN');
    requireIdentifier(run.natural_run_id, 'NATURAL_RUN_ID');
    ok(typeof run.workflow_run_id === 'string' && /^[1-9][0-9]{0,19}$/.test(run.workflow_run_id), 'NATURAL_WORKFLOW_RUN_ID');
    ok(run.run_attempt === 1, 'NATURAL_RUN_ATTEMPT_NOT_FIRST');
    const slot = parseIso(run.logical_schedule_slot, 'NATURAL_SCHEDULE_SLOT');
    const startedAt = parseIso(run.started_at, 'NATURAL_RUN_STARTED_AT');
    const completedAt = parseIso(run.completed_at, 'NATURAL_RUN_COMPLETED_AT');
    ok(slot >= observationStartedAt && slot <= observationEndedAt, 'NATURAL_SCHEDULE_SLOT_OUTSIDE_WINDOW');
    ok(startedAt >= observationStartedAt && completedAt <= observationEndedAt && completedAt >= startedAt, 'NATURAL_RUN_TIME_OUTSIDE_WINDOW');
    ok(startedAt >= slot, 'NATURAL_RUN_STARTED_BEFORE_SCHEDULE_SLOT');
    ok(run.trigger === 'schedule', 'NATURAL_RUN_TRIGGER_NOT_SCHEDULE');
    ok(run.conclusion === 'success', 'NATURAL_RUN_NOT_SUCCESS');
    ok(run.source_sha === expectedSourceSha, 'NATURAL_RUN_SOURCE_SHA');
    ok(run.policy_sha256 === policySha256, 'NATURAL_RUN_POLICY_DIGEST');
    for (const field of ['cohort_sha256', 'rights_census_sha256', 'schema_census_sha256']) {
      ok(run[field] === cohort[field], `NATURAL_RUN_BINDING:${field}`);
    }
    ok(run.rights_census_state === 'PASS', 'NATURAL_RUN_RIGHTS_NOT_PASS');
    ok(run.schema_census_state === 'PASS', 'NATURAL_RUN_SCHEMA_NOT_PASS');
    ok(run.slo_state === 'PASS', 'NATURAL_RUN_SLO_NOT_PASS');
    ok(run.error_budget_state === 'WITHIN_BUDGET', 'NATURAL_RUN_ERROR_BUDGET_NOT_WITHIN');
    ok(run.pitr_receipt_sha256 === recovery.pitr_receipt_sha256, 'NATURAL_RUN_PITR_BINDING');
    ok(run.rollback_receipt_sha256 === recovery.rollback_receipt_sha256, 'NATURAL_RUN_ROLLBACK_BINDING');
    requireSha256(run.receipt_sha256, 'NATURAL_RUN_RECEIPT_DIGEST');
    ok(supportBindings.byKey.get(`NATURAL_RUN:${run.natural_run_id}`)?.sha256 === run.receipt_sha256, 'NATURAL_RUN_RECEIPT_MEMBER_BINDING');
    runIds.push(run.natural_run_id);
    workflowRunIds.push(run.workflow_run_id);
    scheduleSlots.push(run.logical_schedule_slot);
    receiptDigests.push(run.receipt_sha256);
    slotTimes.push(slot);
    startedTimes.push(startedAt);
    completedTimes.push(completedAt);
  }
  assertUnique(runIds, 'NATURAL_RUN_ID_DUPLICATE');
  assertUnique(workflowRunIds, 'NATURAL_WORKFLOW_RUN_ID_DUPLICATE');
  assertUnique(scheduleSlots, 'NATURAL_SCHEDULE_SLOT_DUPLICATE');
  assertUnique(receiptDigests, 'NATURAL_RUN_RECEIPT_DUPLICATE');
  ok(evidence.support_evidence_bindings.length === 5 + evidence.natural_runs.length, 'SUPPORT_BINDING_EXACT_COUNT');
  const expectedSupportKeys = new Set([
    'OBSERVATION_LEDGER:observation_ledger',
    'BETA_RELIABILITY:beta_reliability',
    'SLO_ERROR_BUDGET:slo_error_budget',
    'PITR:pitr',
    'ROLLBACK:rollback',
    ...runIds.map((runId) => `NATURAL_RUN:${runId}`),
  ]);
  ok([...supportBindings.byKey.keys()].every((key) => expectedSupportKeys.has(key)), 'SUPPORT_BINDING_UNEXPECTED');
  ok(Math.max(...slotTimes) - Math.min(...slotTimes) >= policyRules.readiness.required_window_days * DAY_MS, 'NATURAL_RUN_SPAN_TOO_SHORT');
  ok(Math.max(...startedTimes) - Math.min(...startedTimes) >= policyRules.readiness.required_window_days * DAY_MS, 'NATURAL_EXECUTION_SPAN_TOO_SHORT');

  return {
    state: 'TECHNICAL_READINESS_VERIFIED',
    source_sha: expectedSourceSha,
    policy_sha256: policySha256,
    readiness_evidence_sha256: evidenceSha256,
    beta_effective_n: beta.effective_n,
    unique_natural_runs: runIds.length,
    natural_run_window_days: (Math.max(...slotTimes) - Math.min(...slotTimes)) / DAY_MS,
    observation_started_at: observation.started_at,
    observation_ended_at: observation.ended_at,
    first_natural_run_started_at: new Date(Math.min(...startedTimes)).toISOString(),
    last_natural_run_completed_at: new Date(Math.max(...completedTimes)).toISOString(),
    rights_census: 'PASS',
    schema_census: 'PASS',
    slo_error_budget: 'PASS',
    pitr_rollback: 'VERIFIED',
    auxiliary_evidence_member_count: auxiliaryBindings.size,
    support_evidence_member_count: supportBindings.byMember.size,
    production_release_authorized: false,
  };
}

const readinessChecksum = (readiness) => {
  const { checksum, ...withoutChecksum } = readiness;
  return sha256Object(withoutChecksum);
};

export function validateReadinessDecision(readiness, technicalSummary, { now = new Date() } = {}) {
  exactKeys(readiness, [
    'id', 'version', 'decision', 'score', 'maximum_score', 'sections', 'mandatory_gates_passed',
    'hard_blockers', 'generated_at', 'source_sha', 'policy_sha256', 'readiness_evidence_sha256',
    'technical_evidence_summary', 'explicit_program_owner_release_required',
    'production_promotion_authorized', 'artfund_production_promotion_authorized', 'checksum',
  ], 'READINESS_DECISION');
  ok(readiness.id === READINESS_ID && readiness.version === VERSION, 'READINESS_IDENTITY');
  ok(readiness.decision === 'ready_for_program_owner_release', 'READINESS_DECISION_NOT_READY');
  ok(readiness.score === 100 && readiness.maximum_score === 100, 'READINESS_SCORE');
  ok(readiness.mandatory_gates_passed === true, 'READINESS_MANDATORY_GATES');
  ok(Array.isArray(readiness.hard_blockers) && readiness.hard_blockers.length === 0, 'READINESS_HARD_BLOCKERS');
  const readinessGeneratedAt = parseIso(readiness.generated_at, 'READINESS_GENERATED_AT');
  ok(readinessGeneratedAt <= now.getTime() + CLOCK_SKEW_MS, 'READINESS_GENERATED_IN_FUTURE');
  ok(readinessGeneratedAt >= parseIso(technicalSummary.observation_ended_at, 'READINESS_OBSERVATION_END'), 'READINESS_GENERATED_BEFORE_OBSERVATION_END');
  ok(readiness.source_sha === technicalSummary.source_sha, 'READINESS_SOURCE_SHA');
  ok(readiness.policy_sha256 === technicalSummary.policy_sha256, 'READINESS_POLICY_DIGEST');
  ok(readiness.readiness_evidence_sha256 === technicalSummary.readiness_evidence_sha256, 'READINESS_EVIDENCE_DIGEST');
  ok(stableStringify(readiness.technical_evidence_summary) === stableStringify(technicalSummary), 'READINESS_TECHNICAL_SUMMARY');
  ok(readiness.explicit_program_owner_release_required === true, 'READINESS_OWNER_RELEASE_NOT_REQUIRED');
  ok(readiness.production_promotion_authorized === false, 'READINESS_SELF_AUTHORIZED');
  ok(readiness.artfund_production_promotion_authorized === false, 'READINESS_ARTFUND_AUTHORIZED');
  requireSha256(readiness.checksum, 'READINESS_CHECKSUM_FORMAT');
  ok(readiness.checksum === readinessChecksum(readiness), 'READINESS_CHECKSUM_MISMATCH');
  return readiness.checksum;
}

const ownerSigningDocument = (receipt) => {
  const { signature_base64: _signature, ...unsigned } = receipt;
  return unsigned;
};

export const ownerSigningPayload = (receipt) => Buffer.from(stableStringify(ownerSigningDocument(receipt)), 'utf8');

const consumptionSigningDocument = (attestation) => {
  const { signature_base64: _signature, ...unsigned } = attestation;
  return unsigned;
};

export const consumptionSigningPayload = (attestation) => Buffer.from(stableStringify(consumptionSigningDocument(attestation)), 'utf8');

export const releaseNonceStoreKey = (receipt, ownerReceiptCanonicalSha256 = sha256Object(receipt)) => sha256Object({
  authority: 'KIDULTS_PROGRAM_OWNER_PRODUCTION_RELEASE_RECEIPT_V1',
  receipt_id: receipt.receipt_id,
  owner_receipt_canonical_sha256: ownerReceiptCanonicalSha256,
  release_nonce: receipt.release_nonce,
});

const keyFingerprint = (publicKey) => {
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return sha256Bytes(der);
};

const verifiedEd25519Key = (publicKeyPem, expectedKeyId, codePrefix) => {
  requireSha256(expectedKeyId, `${codePrefix}_EXPECTED_KEY_ID`);
  let publicKey;
  try {
    publicKey = crypto.createPublicKey(publicKeyPem);
  } catch {
    fail(`${codePrefix}_PUBLIC_KEY_INVALID`);
  }
  ok(publicKey.asymmetricKeyType === 'ed25519', `${codePrefix}_PUBLIC_KEY_NOT_ED25519`);
  const actualKeyId = keyFingerprint(publicKey);
  ok(actualKeyId === expectedKeyId, `${codePrefix}_TRUST_ANCHOR_MISMATCH`);
  return { publicKey, actualKeyId };
};

export function validateNonceStoreReceipt(raw, {
  attestation,
  ownerReceipt,
  ownerReceiptCanonicalSha256,
  evidenceBundleSha256,
} = {}) {
  ok(Buffer.isBuffer(raw) && raw.length > 0, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_REQUIRED');
  let receipt;
  try {
    receipt = JSON.parse(raw.toString('utf8'));
  } catch {
    fail('PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_JSON');
  }
  exactKeys(receipt, [
    'id', 'version', 'state', 'store_id', 'atomic_operation', 'nonce_store_key',
    'consumption_id', 'consumed_at', 'prior_consumption_count', 'consumption_sequence',
    'repository', 'protected_environment', 'evidence_run_id', 'evidence_run_attempt',
    'artifact_id', 'artifact_name', 'artifact_sha256', 'archive_sha256', 'source_sha',
    'evidence_bundle_sha256', 'owner_receipt_id', 'owner_receipt_canonical_sha256',
    'release_nonce', 'execution_mode', 'predeployment_snapshot_manifest_sha256',
    'target_gateway_image_id', 'target_scheduler_image_id', 'deployment_manifest_sha256', 'executor_run_id',
    'executor_run_attempt',
  ], 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT');
  ok(receipt.id === NONCE_STORE_RECEIPT_ID && receipt.version === VERSION, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_IDENTITY');
  ok(receipt.state === 'CONSUMED_EXACTLY_ONCE', 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_STATE');
  ok(receipt.store_id === 'KIDULTS_PROTECTED_RELEASE_NONCE_STORE_V1', 'PROTECTED_EXECUTOR_NONCE_STORE_IDENTITY');
  ok(receipt.atomic_operation === 'CREATE_IF_ABSENT', 'PROTECTED_EXECUTOR_NONCE_STORE_OPERATION');
  ok(receipt.prior_consumption_count === 0 && receipt.consumption_sequence === 1, 'PROTECTED_EXECUTOR_NONCE_STORE_NOT_FIRST_CONSUMPTION');
  ok(receipt.execution_mode === 'CONTROLLED_PRODUCTION_PROMOTION', 'PROTECTED_EXECUTOR_NONCE_STORE_EXECUTION_MODE');
  requireSha256(receipt.nonce_store_key, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_KEY');
  requireIdentifier(receipt.consumption_id, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_CONSUMPTION_ID');
  parseIso(receipt.consumed_at, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_CONSUMED_AT');
  requireSourceSha(receipt.source_sha, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_SOURCE_SHA');
  requireSha256(receipt.evidence_bundle_sha256, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_BUNDLE_DIGEST');
  requireSha256(receipt.owner_receipt_canonical_sha256, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_OWNER_DIGEST');
  requireSha256(receipt.predeployment_snapshot_manifest_sha256, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_SNAPSHOT_DIGEST');
  requireSha256(receipt.target_gateway_image_id, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_GATEWAY_IMAGE_ID');
  requireSha256(receipt.target_scheduler_image_id, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_SCHEDULER_IMAGE_ID');
  requireSha256(receipt.deployment_manifest_sha256, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_DEPLOYMENT_MANIFEST');
  requireRunId(receipt.evidence_run_id, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_EVIDENCE_RUN_ID');
  requireRunAttempt(receipt.evidence_run_attempt, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_EVIDENCE_RUN_ATTEMPT');
  requireRunId(receipt.artifact_id, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_ARTIFACT_ID');
  requireRunId(receipt.executor_run_id, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_EXECUTOR_RUN_ID');
  requireRunAttempt(receipt.executor_run_attempt, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_EXECUTOR_RUN_ATTEMPT');
  for (const field of [
    'nonce_store_key', 'consumption_id', 'consumed_at', 'prior_consumption_count',
    'consumption_sequence', 'repository', 'protected_environment', 'evidence_run_id',
    'evidence_run_attempt', 'artifact_id', 'artifact_name', 'artifact_sha256',
    'archive_sha256', 'source_sha', 'evidence_bundle_sha256', 'owner_receipt_id',
    'owner_receipt_canonical_sha256', 'release_nonce', 'execution_mode',
    'predeployment_snapshot_manifest_sha256', 'target_gateway_image_id',
    'target_scheduler_image_id', 'deployment_manifest_sha256', 'executor_run_id', 'executor_run_attempt',
  ]) ok(receipt[field] === attestation[field], `PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_CONTEXT:${field}`);
  ok(receipt.owner_receipt_id === ownerReceipt.receipt_id, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_OWNER_ID');
  ok(receipt.owner_receipt_canonical_sha256 === ownerReceiptCanonicalSha256, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_OWNER_BINDING');
  ok(receipt.release_nonce === ownerReceipt.release_nonce, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_OWNER_NONCE');
  ok(receipt.evidence_bundle_sha256 === evidenceBundleSha256, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_BUNDLE_BINDING');
  const receiptSha256 = sha256Bytes(raw);
  ok(attestation.nonce_store_receipt_sha256 === receiptSha256, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_DIGEST');
  return {
    state: 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_VERIFIED',
    nonce_store_key: receipt.nonce_store_key,
    receipt_sha256: receiptSha256,
  };
}

export function validateProtectedExecutorConsumptionAttestation(attestation, {
  ownerReceipt,
  ownerReceiptMemberSha256,
  ownerReceiptCanonicalSha256,
  evidenceBundleSha256,
  archiveSha256,
  executionContext,
  publicKeyPem,
  expectedKeyId,
  nonceStoreReceiptRaw = null,
  now = new Date(),
} = {}) {
  ok(isObject(executionContext), 'PROTECTED_EXECUTOR_CONTEXT_REQUIRED');
  exactKeys(attestation, [
    'id', 'version', 'state', 'protected_executor', 'repository', 'protected_environment',
    'consumption_id', 'consumed_at', 'evidence_run_id', 'evidence_run_attempt',
    'artifact_id', 'artifact_name', 'artifact_sha256', 'archive_sha256', 'source_sha',
    'execution_mode', 'predeployment_snapshot_manifest_sha256',
    'target_gateway_image_id', 'target_scheduler_image_id', 'deployment_manifest_sha256', 'nonce_store_key',
    'nonce_store_receipt_sha256',
    'owner_receipt_id', 'owner_receipt_member_sha256', 'owner_receipt_canonical_sha256',
    'release_nonce', 'evidence_bundle_sha256', 'executor_run_id', 'executor_run_attempt',
    'prior_consumption_count', 'consumption_sequence', 'key_id', 'signature_algorithm',
    'signature_base64',
  ], 'PROTECTED_EXECUTOR_CONSUMPTION_ATTESTATION');
  ok(attestation.id === CONSUMPTION_ATTESTATION_ID && attestation.version === VERSION, 'PROTECTED_EXECUTOR_ATTESTATION_IDENTITY');
  ok(attestation.protected_executor === 'KIDULTS_PRODUCTION_RELEASE_PROTECTED_EXECUTOR_V1', 'PROTECTED_EXECUTOR_IDENTITY');
  requireIdentifier(attestation.consumption_id, 'PROTECTED_EXECUTOR_CONSUMPTION_ID');
  requireRunId(attestation.evidence_run_id, 'PROTECTED_EXECUTOR_EVIDENCE_RUN_ID');
  requireRunAttempt(attestation.evidence_run_attempt, 'PROTECTED_EXECUTOR_EVIDENCE_RUN_ATTEMPT');
  requireRunId(attestation.artifact_id, 'PROTECTED_EXECUTOR_ARTIFACT_ID');
  requireIdentifier(attestation.artifact_name, 'PROTECTED_EXECUTOR_ARTIFACT_NAME');
  requireSha256(attestation.artifact_sha256, 'PROTECTED_EXECUTOR_ARTIFACT_DIGEST');
  requireSha256(attestation.archive_sha256, 'PROTECTED_EXECUTOR_ARCHIVE_DIGEST');
  requireRunId(attestation.executor_run_id, 'PROTECTED_EXECUTOR_RUN_ID');
  requireRunAttempt(attestation.executor_run_attempt, 'PROTECTED_EXECUTOR_RUN_ATTEMPT');
  ok(['CERTIFICATION_ONLY', 'CONTROLLED_PRODUCTION_PROMOTION'].includes(attestation.execution_mode), 'PROTECTED_EXECUTOR_EXECUTION_MODE');
  if (attestation.execution_mode === 'CERTIFICATION_ONLY') {
    ok(attestation.predeployment_snapshot_manifest_sha256 === null, 'PROTECTED_EXECUTOR_CERTIFICATION_SNAPSHOT_MUST_BE_NULL');
  } else {
    requireSha256(attestation.predeployment_snapshot_manifest_sha256, 'PROTECTED_EXECUTOR_SNAPSHOT_DIGEST');
  }
  ok(typeof attestation.repository === 'string' && REPOSITORY_PATTERN.test(attestation.repository), 'PROTECTED_EXECUTOR_REPOSITORY');
  requireIdentifier(attestation.protected_environment, 'PROTECTED_EXECUTOR_ENVIRONMENT');
  requireSha256(ownerReceiptMemberSha256, 'PROGRAM_OWNER_RECEIPT_MEMBER_DIGEST_REQUIRED');
  requireSha256(ownerReceiptCanonicalSha256, 'PROGRAM_OWNER_RECEIPT_CANONICAL_DIGEST_REQUIRED');
  requireSha256(evidenceBundleSha256, 'EVIDENCE_BUNDLE_DIGEST_REQUIRED');
  requireSha256(archiveSha256, 'ARCHIVE_DIGEST_REQUIRED');
  requireSha256(attestation.nonce_store_key, 'PROTECTED_EXECUTOR_NONCE_STORE_KEY');

  for (const field of [
    'repository', 'protected_environment', 'evidence_run_id', 'evidence_run_attempt',
    'artifact_id', 'artifact_name', 'artifact_sha256', 'executor_run_id', 'executor_run_attempt',
    'execution_mode', 'predeployment_snapshot_manifest_sha256',
    'target_gateway_image_id', 'target_scheduler_image_id', 'deployment_manifest_sha256',
  ]) ok(attestation[field] === executionContext[field], `PROTECTED_EXECUTOR_CONTEXT_MISMATCH:${field}`);
  ok(attestation.repository === ownerReceipt.repository, 'PROTECTED_EXECUTOR_OWNER_REPOSITORY');
  ok(attestation.protected_environment === ownerReceipt.protected_environment, 'PROTECTED_EXECUTOR_OWNER_ENVIRONMENT');
  ok(attestation.evidence_run_id === ownerReceipt.evidence_run_id, 'PROTECTED_EXECUTOR_OWNER_EVIDENCE_RUN');
  ok(attestation.evidence_run_attempt === ownerReceipt.evidence_run_attempt, 'PROTECTED_EXECUTOR_OWNER_EVIDENCE_ATTEMPT');
  ok(attestation.artifact_name === ownerReceipt.artifact_name, 'PROTECTED_EXECUTOR_OWNER_ARTIFACT_NAME');
  ok(attestation.source_sha === ownerReceipt.source_sha, 'PROTECTED_EXECUTOR_SOURCE_SHA');
  ok(attestation.owner_receipt_id === ownerReceipt.receipt_id, 'PROTECTED_EXECUTOR_OWNER_RECEIPT_ID');
  ok(attestation.owner_receipt_member_sha256 === ownerReceiptMemberSha256, 'PROTECTED_EXECUTOR_OWNER_MEMBER_DIGEST');
  ok(attestation.owner_receipt_canonical_sha256 === ownerReceiptCanonicalSha256, 'PROTECTED_EXECUTOR_OWNER_CANONICAL_DIGEST');
  ok(attestation.release_nonce === ownerReceipt.release_nonce, 'PROTECTED_EXECUTOR_RELEASE_NONCE');
  ok(attestation.evidence_bundle_sha256 === evidenceBundleSha256, 'PROTECTED_EXECUTOR_BUNDLE_DIGEST');
  ok(attestation.archive_sha256 === archiveSha256, 'PROTECTED_EXECUTOR_ARCHIVE_BINDING');
  const expectedNonceStoreKey = releaseNonceStoreKey(ownerReceipt, ownerReceiptCanonicalSha256);
  ok(attestation.nonce_store_key === expectedNonceStoreKey, 'PROTECTED_EXECUTOR_NONCE_STORE_KEY_BINDING');

  if (attestation.execution_mode === 'CERTIFICATION_ONLY') {
    ok(attestation.state === 'CERTIFIED_UNCONSUMED', 'PROTECTED_EXECUTOR_CERTIFICATION_STATE');
    ok(attestation.prior_consumption_count === 0 && attestation.consumption_sequence === 0, 'PROTECTED_EXECUTOR_CERTIFICATION_MUST_NOT_CONSUME');
    ok(attestation.nonce_store_receipt_sha256 === null, 'PROTECTED_EXECUTOR_CERTIFICATION_STORE_RECEIPT_MUST_BE_NULL');
    ok(attestation.target_gateway_image_id === null && attestation.target_scheduler_image_id === null, 'PROTECTED_EXECUTOR_CERTIFICATION_IMAGES_MUST_BE_NULL');
    ok(attestation.deployment_manifest_sha256 === null, 'PROTECTED_EXECUTOR_CERTIFICATION_DEPLOYMENT_MANIFEST_MUST_BE_NULL');
    ok(nonceStoreReceiptRaw === null, 'PROTECTED_EXECUTOR_CERTIFICATION_STORE_RECEIPT_BYTES_MUST_BE_NULL');
  } else {
    ok(attestation.state === 'CONSUMED_EXACTLY_ONCE', 'PROTECTED_EXECUTOR_ATTESTATION_STATE');
    ok(attestation.prior_consumption_count === 0 && attestation.consumption_sequence === 1, 'PROTECTED_EXECUTOR_NOT_FIRST_CONSUMPTION');
    ok(attestation.consumption_id === expectedNonceStoreKey, 'PROTECTED_EXECUTOR_CONSUMPTION_ID_NOT_NONCE_BOUND');
    requireSha256(attestation.nonce_store_receipt_sha256, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT');
    requireSha256(attestation.target_gateway_image_id, 'PROTECTED_EXECUTOR_GATEWAY_IMAGE_ID');
    requireSha256(attestation.target_scheduler_image_id, 'PROTECTED_EXECUTOR_SCHEDULER_IMAGE_ID');
    requireSha256(attestation.deployment_manifest_sha256, 'PROTECTED_EXECUTOR_DEPLOYMENT_MANIFEST');
    ok(attestation.target_gateway_image_id === ownerReceipt.target_gateway_image_id, 'PROTECTED_EXECUTOR_OWNER_GATEWAY_IMAGE_ID');
    ok(attestation.target_scheduler_image_id === ownerReceipt.target_scheduler_image_id, 'PROTECTED_EXECUTOR_OWNER_SCHEDULER_IMAGE_ID');
    ok(attestation.deployment_manifest_sha256 === ownerReceipt.deployment_manifest_sha256, 'PROTECTED_EXECUTOR_OWNER_DEPLOYMENT_MANIFEST');
    validateNonceStoreReceipt(nonceStoreReceiptRaw, {
      attestation,
      ownerReceipt,
      ownerReceiptCanonicalSha256,
      evidenceBundleSha256,
    });
  }

  const consumedAt = parseIso(attestation.consumed_at, 'PROTECTED_EXECUTOR_CONSUMED_AT');
  const issuedAt = parseIso(ownerReceipt.issued_at, 'PROTECTED_EXECUTOR_OWNER_ISSUED_AT');
  const expiresAt = parseIso(ownerReceipt.expires_at, 'PROTECTED_EXECUTOR_OWNER_EXPIRES_AT');
  const nowMs = now.getTime();
  ok(Number.isFinite(nowMs), 'PROTECTED_EXECUTOR_VERIFICATION_TIME');
  ok(consumedAt >= issuedAt && consumedAt <= nowMs + CLOCK_SKEW_MS && consumedAt < expiresAt, 'PROTECTED_EXECUTOR_CONSUMPTION_TIME');
  ok(attestation.signature_algorithm === 'ED25519', 'PROTECTED_EXECUTOR_SIGNATURE_ALGORITHM');
  const { publicKey, actualKeyId } = verifiedEd25519Key(publicKeyPem, expectedKeyId, 'PROTECTED_EXECUTOR');
  ok(attestation.key_id === actualKeyId, 'PROTECTED_EXECUTOR_KEY_ID');
  ok(typeof attestation.signature_base64 === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(attestation.signature_base64), 'PROTECTED_EXECUTOR_SIGNATURE_ENCODING');
  const signature = Buffer.from(attestation.signature_base64, 'base64');
  ok(signature.length === 64 && signature.toString('base64') === attestation.signature_base64, 'PROTECTED_EXECUTOR_SIGNATURE_CANONICAL_ENCODING');
  ok(crypto.verify(null, consumptionSigningPayload(attestation), publicKey, signature), 'PROTECTED_EXECUTOR_SIGNATURE_INVALID');
  return {
    state: attestation.execution_mode === 'CONTROLLED_PRODUCTION_PROMOTION'
      ? 'PROTECTED_EXECUTOR_CONSUMPTION_VERIFIED'
      : 'PROTECTED_EXECUTOR_CERTIFICATION_VERIFIED_UNCONSUMED',
    consumption_id: attestation.consumption_id,
    attestation_sha256: sha256Object(attestation),
    executor_run_id: attestation.executor_run_id,
    artifact_id: attestation.artifact_id,
    artifact_sha256: attestation.artifact_sha256,
    archive_sha256: attestation.archive_sha256,
  };
}

export function validateProgramOwnerSignature(receipt, {
  technicalSummary,
  readiness,
  publicKeyPem,
  expectedKeyId,
  evidenceBundleSha256,
  executionContext,
  now = new Date(),
} = {}) {
  exactKeys(receipt, [
    'id', 'version', 'authority', 'decision', 'release_scope', 'receipt_id', 'issued_at',
    'expires_at', 'source_sha', 'policy_sha256', 'readiness_evidence_sha256',
    'readiness_checksum', 'repository', 'protected_environment', 'evidence_run_id',
    'evidence_run_attempt', 'artifact_name', 'evidence_bundle_sha256',
    'target_gateway_image_id', 'target_scheduler_image_id', 'deployment_manifest_sha256', 'release_nonce',
    'key_id', 'signature_algorithm', 'signature_base64',
  ], 'PROGRAM_OWNER_RECEIPT');
  ok(receipt.id === OWNER_RECEIPT_ID && receipt.version === VERSION, 'PROGRAM_OWNER_RECEIPT_IDENTITY');
  ok(receipt.authority === 'PROGRAM_OWNER', 'PROGRAM_OWNER_AUTHORITY');
  ok(receipt.decision === 'APPROVE_PRODUCTION_RELEASE', 'PROGRAM_OWNER_DECISION');
  ok(receipt.release_scope === 'KIDULTS_PRODUCTION', 'PROGRAM_OWNER_RELEASE_SCOPE');
  requireIdentifier(receipt.receipt_id, 'PROGRAM_OWNER_RECEIPT_ID');
  ok(typeof receipt.repository === 'string' && REPOSITORY_PATTERN.test(receipt.repository), 'PROGRAM_OWNER_REPOSITORY');
  requireIdentifier(receipt.protected_environment, 'PROGRAM_OWNER_PROTECTED_ENVIRONMENT');
  requireRunId(receipt.evidence_run_id, 'PROGRAM_OWNER_EVIDENCE_RUN_ID');
  requireRunAttempt(receipt.evidence_run_attempt, 'PROGRAM_OWNER_EVIDENCE_RUN_ATTEMPT');
  requireIdentifier(receipt.artifact_name, 'PROGRAM_OWNER_ARTIFACT_NAME');
  requireSha256(receipt.evidence_bundle_sha256, 'PROGRAM_OWNER_BUNDLE_DIGEST');
  requireSha256(receipt.target_gateway_image_id, 'PROGRAM_OWNER_GATEWAY_IMAGE_ID');
  requireSha256(receipt.target_scheduler_image_id, 'PROGRAM_OWNER_SCHEDULER_IMAGE_ID');
  requireSha256(receipt.deployment_manifest_sha256, 'PROGRAM_OWNER_DEPLOYMENT_MANIFEST');
  ok(typeof receipt.release_nonce === 'string' && /^[A-Za-z0-9._:-]{32,128}$/.test(receipt.release_nonce), 'PROGRAM_OWNER_RELEASE_NONCE');
  const issuedAt = parseIso(receipt.issued_at, 'PROGRAM_OWNER_ISSUED_AT');
  const expiresAt = parseIso(receipt.expires_at, 'PROGRAM_OWNER_EXPIRES_AT');
  const nowMs = now.getTime();
  ok(Number.isFinite(nowMs), 'PROGRAM_OWNER_VERIFICATION_TIME');
  ok(issuedAt <= nowMs + CLOCK_SKEW_MS, 'PROGRAM_OWNER_RECEIPT_FROM_FUTURE');
  ok(nowMs - issuedAt <= MAX_OWNER_RECEIPT_TTL_MS, 'PROGRAM_OWNER_RECEIPT_TOO_OLD');
  ok(expiresAt > nowMs, 'PROGRAM_OWNER_RECEIPT_EXPIRED');
  ok(expiresAt > issuedAt && expiresAt - issuedAt <= MAX_OWNER_RECEIPT_TTL_MS, 'PROGRAM_OWNER_RECEIPT_TTL');
  const observationEndedAt = parseIso(technicalSummary.observation_ended_at, 'PROGRAM_OWNER_OBSERVATION_END');
  ok(observationEndedAt <= nowMs, 'PROGRAM_OWNER_FUTURE_OBSERVATION');
  ok(issuedAt >= observationEndedAt, 'PROGRAM_OWNER_APPROVAL_BEFORE_OBSERVATION_END');
  ok(issuedAt >= parseIso(readiness.generated_at, 'PROGRAM_OWNER_READINESS_GENERATED_AT'), 'PROGRAM_OWNER_APPROVAL_BEFORE_READINESS');
  ok(receipt.source_sha === technicalSummary.source_sha, 'PROGRAM_OWNER_SOURCE_SHA');
  ok(receipt.policy_sha256 === technicalSummary.policy_sha256, 'PROGRAM_OWNER_POLICY_DIGEST');
  ok(receipt.readiness_evidence_sha256 === technicalSummary.readiness_evidence_sha256, 'PROGRAM_OWNER_EVIDENCE_DIGEST');
  ok(receipt.readiness_checksum === readiness.checksum, 'PROGRAM_OWNER_READINESS_CHECKSUM');
  requireSha256(evidenceBundleSha256, 'EXPECTED_EVIDENCE_BUNDLE_DIGEST');
  ok(receipt.evidence_bundle_sha256 === evidenceBundleSha256, 'PROGRAM_OWNER_BUNDLE_BINDING');
  ok(isObject(executionContext), 'PROGRAM_OWNER_EXECUTION_CONTEXT_REQUIRED');
  for (const field of ['repository', 'protected_environment', 'evidence_run_id', 'evidence_run_attempt', 'artifact_name']) {
    ok(receipt[field] === executionContext[field], `PROGRAM_OWNER_CONTEXT_MISMATCH:${field}`);
  }
  ok(receipt.signature_algorithm === 'ED25519', 'PROGRAM_OWNER_SIGNATURE_ALGORITHM');
  const { publicKey, actualKeyId } = verifiedEd25519Key(publicKeyPem, expectedKeyId, 'PROGRAM_OWNER');
  ok(receipt.key_id === actualKeyId, 'PROGRAM_OWNER_KEY_ID');
  ok(typeof receipt.signature_base64 === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(receipt.signature_base64), 'PROGRAM_OWNER_SIGNATURE_ENCODING');
  const signature = Buffer.from(receipt.signature_base64, 'base64');
  ok(signature.length === 64 && signature.toString('base64') === receipt.signature_base64, 'PROGRAM_OWNER_SIGNATURE_CANONICAL_ENCODING');
  ok(crypto.verify(null, ownerSigningPayload(receipt), publicKey, signature), 'PROGRAM_OWNER_SIGNATURE_INVALID');
  const canonicalDigest = sha256Object(receipt);
  return {
    state: 'PROGRAM_OWNER_SIGNATURE_VERIFIED_UNCONSUMED',
    receipt_id: receipt.receipt_id,
    receipt_sha256: canonicalDigest,
    key_id: actualKeyId,
    expires_at: receipt.expires_at,
  };
}

export function validateProgramOwnerReceipt(receipt, {
  technicalSummary,
  readiness,
  publicKeyPem,
  expectedKeyId,
  evidenceBundleSha256,
  executionContext,
  consumptionAttestation,
  consumptionPublicKeyPem,
  expectedConsumptionKeyId,
  ownerReceiptMemberSha256,
  archiveSha256,
  nonceStoreReceiptRaw = null,
  now = new Date(),
} = {}) {
  ok(expectedKeyId !== expectedConsumptionKeyId, 'RELEASE_TRUST_ROOTS_NOT_INDEPENDENT');
  const owner = validateProgramOwnerSignature(receipt, {
    technicalSummary,
    readiness,
    publicKeyPem,
    expectedKeyId,
    evidenceBundleSha256,
    executionContext,
    now,
  });
  ok(isObject(consumptionAttestation), 'PROTECTED_EXECUTOR_CONSUMPTION_ATTESTATION_REQUIRED');
  const consumption = validateProtectedExecutorConsumptionAttestation(consumptionAttestation, {
    ownerReceipt: receipt,
    ownerReceiptMemberSha256,
    ownerReceiptCanonicalSha256: owner.receipt_sha256,
    evidenceBundleSha256,
    archiveSha256,
    executionContext,
    publicKeyPem: consumptionPublicKeyPem,
    expectedKeyId: expectedConsumptionKeyId,
    nonceStoreReceiptRaw,
    now,
  });
  return {
    state: executionContext.execution_mode === 'CONTROLLED_PRODUCTION_PROMOTION'
      ? 'EXPLICIT_PROGRAM_OWNER_RELEASE_AND_CONSUMPTION_VERIFIED'
      : 'PROGRAM_OWNER_SIGNATURE_CERTIFIED_UNCONSUMED',
    receipt_id: owner.receipt_id,
    receipt_sha256: owner.receipt_sha256,
    key_id: owner.key_id,
    expires_at: owner.expires_at,
    consumption,
  };
}

const technicalFromFiles = ({ evidencePath, evidenceDir, policyPath, expectedSourceSha, now = new Date() }) => {
  ok(typeof evidenceDir === 'string' && evidenceDir.length > 0, 'EVIDENCE_DIRECTORY_REQUIRED');
  let expectedEvidencePath;
  let actualEvidencePath;
  try {
    expectedEvidencePath = fs.realpathSync(path.join(evidenceDir, 'production-readiness-evidence-v1.json'));
    actualEvidencePath = fs.realpathSync(evidencePath);
  } catch {
    fail('TECHNICAL_EVIDENCE_FILE_INVALID');
  }
  ok(actualEvidencePath === expectedEvidencePath, 'TECHNICAL_EVIDENCE_PATH_SUBSTITUTION');
  try {
    ok(fs.realpathSync(policyPath) === fs.realpathSync(path.join(REPOSITORY_ROOT, POLICY_PATH)), 'POLICY_PATH_SUBSTITUTION');
  } catch {
    fail('POLICY_FILE_INVALID');
  }
  const policyLoaded = loadJson(policyPath, 'POLICY_FILE_INVALID');
  const evidenceLoaded = loadJson(evidencePath, 'TECHNICAL_EVIDENCE_FILE_INVALID');
  const policySha256 = sha256Bytes(policyLoaded.raw);
  const evidenceSha256 = sha256Bytes(evidenceLoaded.raw);
  const summary = validateTechnicalEvidence(evidenceLoaded.value, {
    expectedSourceSha,
    policy: policyLoaded.value,
    policySha256,
    evidenceSha256,
  });
  const boundEvidence = validateBoundEvidenceDirectory({ evidenceDir, evidence: evidenceLoaded.value, expectedSourceSha, now });
  return { policyLoaded, evidenceLoaded, summary, boundEvidence };
};

const releaseFromValues = ({
  evidence,
  evidenceRaw,
  readiness,
  ownerReceipt,
  policy,
  policyRaw,
  publicKeyPem,
  expectedOwnerKeyId,
  evidenceBundleSha256,
  executionContext,
  consumptionAttestation,
  consumptionPublicKeyPem,
  expectedConsumptionKeyId,
  ownerReceiptMemberSha256,
  archiveSha256,
  nonceStoreReceiptRaw,
  expectedSourceSha,
  now,
}) => {
  const summary = validateTechnicalEvidence(evidence, {
    expectedSourceSha,
    policy,
    policySha256: sha256Bytes(policyRaw),
    evidenceSha256: sha256Bytes(evidenceRaw),
  });
  validateReadinessDecision(readiness, summary, { now });
  const owner = validateProgramOwnerReceipt(ownerReceipt, {
    technicalSummary: summary,
    readiness,
    publicKeyPem,
    expectedKeyId: expectedOwnerKeyId,
    evidenceBundleSha256,
    executionContext,
    consumptionAttestation,
    consumptionPublicKeyPem,
    expectedConsumptionKeyId,
    ownerReceiptMemberSha256,
    archiveSha256,
    nonceStoreReceiptRaw,
    now,
  });
  return { summary, owner };
};

const tarMembers = (archiveBytes) => {
  const result = spawnSync('tar', ['-tzf', '-'], { input: archiveBytes, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  ok(result.status === 0, 'SEALED_ARCHIVE_LIST_FAILED');
  const members = result.stdout.split('\n').filter(Boolean);
  const verbose = spawnSync('tar', ['-tvzf', '-'], { input: archiveBytes, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  ok(verbose.status === 0, 'SEALED_ARCHIVE_TYPE_LIST_FAILED');
  const typeRows = verbose.stdout.split('\n').filter(Boolean);
  ok(typeRows.length === members.length, 'SEALED_ARCHIVE_TYPE_COUNT');
  ok(typeRows.every((row) => row.startsWith('-')), 'SEALED_ARCHIVE_NON_REGULAR_MEMBER');
  return members;
};

const tarRead = (archiveBytes, member) => {
  const result = spawnSync('tar', ['-xOzf', '-', member], { input: archiveBytes, encoding: null, maxBuffer: 50 * 1024 * 1024 });
  ok(result.status === 0, `SEALED_ARCHIVE_MEMBER_READ:${member}`);
  return result.stdout;
};

const parseArchiveJson = (archiveBytes, member) => {
  const raw = tarRead(archiveBytes, member);
  let value;
  try {
    value = JSON.parse(raw.toString('utf8'));
  } catch {
    fail(`SEALED_ARCHIVE_MEMBER_JSON:${member}`);
  }
  return { raw, value };
};

export const evidenceBundleDigest = (memberRawByName) => {
  const entries = [...memberRawByName.entries()]
    .filter(([member]) => member !== 'program-owner-production-release-receipt-v1.json')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([member, raw]) => ({ member, sha256: sha256Bytes(raw) }));
  ok(entries.length > 0, 'EVIDENCE_BUNDLE_EMPTY');
  return sha256Object({ algorithm: 'SHA256_SORTED_MEMBER_DIGESTS_V1', entries });
};

const validateBoundArchiveMembers = ({ archiveBytes, members, evidence, expectedSourceSha, now }) => {
  const auxiliaryBindings = validateAuxiliaryBindings(evidence.auxiliary_evidence_bindings, expectedSourceSha);
  const supportBindings = validateSupportBindings(evidence.support_evidence_bindings, expectedSourceSha);
  const requiredMembers = [
    'production-readiness-evidence-v1.json',
    'kidults-production-readiness.json',
    'program-owner-production-release-receipt-v1.json',
    ...auxiliaryBindings.keys(),
    ...supportBindings.byMember.keys(),
  ];
  ok(members.length === requiredMembers.length, 'SEALED_ARCHIVE_MEMBER_COUNT');
  ok(stableStringify([...members].sort()) === stableStringify([...requiredMembers].sort()), 'SEALED_ARCHIVE_MEMBER_SET');
  const rawByMember = new Map();
  for (const member of members) rawByMember.set(member, tarRead(archiveBytes, member));
  for (const spec of AUXILIARY_EVIDENCE_SPECS) {
    const binding = auxiliaryBindings.get(spec.member);
    const raw = rawByMember.get(spec.member);
    ok(sha256Bytes(raw) === binding.sha256, `AUXILIARY_MEMBER_DIGEST:${spec.member}`);
    const envelope = parseNonEmptyEvidenceEnvelope(raw, {
      schemaId: spec.schemaId,
      producerId: spec.producerId,
      sourceSha: expectedSourceSha,
      code: `AUXILIARY_MEMBER:${spec.member}`,
    });
    validateEvidenceEnvelopeTime(envelope, evidence, now, `AUXILIARY_MEMBER:${spec.member}`);
    validateAuxiliaryEvidenceSemantics(spec.member, envelope.evidence);
  }
  for (const binding of supportBindings.byMember.values()) {
    const raw = rawByMember.get(binding.member);
    ok(sha256Bytes(raw) === binding.sha256, `SUPPORT_MEMBER_DIGEST:${binding.member}`);
    const envelope = parseNonEmptyEvidenceEnvelope(raw, {
      schemaId: 'KIDULTS_PRODUCTION_SUPPORT_EVIDENCE_RECEIPT_V1',
      producerId: binding.producer_id,
      sourceSha: expectedSourceSha,
      evidenceKind: binding.evidence_kind,
      subjectId: binding.subject_id,
      code: `SUPPORT_MEMBER:${binding.member}`,
    });
    validateSupportEnvelopeSemantics(envelope, evidence, binding);
    validateEvidenceEnvelopeTime(envelope, evidence, now, `SUPPORT_MEMBER:${binding.member}`);
  }
  return rawByMember;
};

const readRegularBoundEvidenceFile = (evidenceDir, member) => {
  requireArchiveMember(member, 'EVIDENCE_DIRECTORY_MEMBER');
  let base;
  let candidate;
  let stat;
  try {
    base = fs.realpathSync(evidenceDir);
    candidate = fs.realpathSync(path.resolve(base, member));
    stat = fs.lstatSync(path.resolve(base, member));
  } catch {
    fail(`EVIDENCE_DIRECTORY_MEMBER_MISSING:${member}`);
  }
  ok(candidate.startsWith(`${base}${path.sep}`), `EVIDENCE_DIRECTORY_MEMBER_ESCAPE:${member}`);
  ok(stat.isFile() && !stat.isSymbolicLink(), `EVIDENCE_DIRECTORY_MEMBER_NOT_REGULAR:${member}`);
  try {
    return readStableRegularFile(candidate, `EVIDENCE_DIRECTORY_MEMBER_READ:${member}`);
  } catch {
    fail(`EVIDENCE_DIRECTORY_MEMBER_READ:${member}`);
  }
};

const validateBoundEvidenceDirectory = ({ evidenceDir, evidence, expectedSourceSha, now }) => {
  const auxiliaryBindings = validateAuxiliaryBindings(evidence.auxiliary_evidence_bindings, expectedSourceSha);
  const supportBindings = validateSupportBindings(evidence.support_evidence_bindings, expectedSourceSha);
  const rawByMember = new Map();
  for (const spec of AUXILIARY_EVIDENCE_SPECS) {
    const binding = auxiliaryBindings.get(spec.member);
    const raw = readRegularBoundEvidenceFile(evidenceDir, spec.member);
    ok(sha256Bytes(raw) === binding.sha256, `AUXILIARY_MEMBER_DIGEST:${spec.member}`);
    const envelope = parseNonEmptyEvidenceEnvelope(raw, {
      schemaId: spec.schemaId,
      producerId: spec.producerId,
      sourceSha: expectedSourceSha,
      code: `AUXILIARY_MEMBER:${spec.member}`,
    });
    validateEvidenceEnvelopeTime(envelope, evidence, now, `AUXILIARY_MEMBER:${spec.member}`);
    validateAuxiliaryEvidenceSemantics(spec.member, envelope.evidence);
    rawByMember.set(spec.member, raw);
  }
  for (const binding of supportBindings.byMember.values()) {
    const raw = readRegularBoundEvidenceFile(evidenceDir, binding.member);
    ok(sha256Bytes(raw) === binding.sha256, `SUPPORT_MEMBER_DIGEST:${binding.member}`);
    const envelope = parseNonEmptyEvidenceEnvelope(raw, {
      schemaId: 'KIDULTS_PRODUCTION_SUPPORT_EVIDENCE_RECEIPT_V1',
      producerId: binding.producer_id,
      sourceSha: expectedSourceSha,
      evidenceKind: binding.evidence_kind,
      subjectId: binding.subject_id,
      code: `SUPPORT_MEMBER:${binding.member}`,
    });
    validateSupportEnvelopeSemantics(envelope, evidence, binding);
    validateEvidenceEnvelopeTime(envelope, evidence, now, `SUPPORT_MEMBER:${binding.member}`);
    rawByMember.set(binding.member, raw);
  }
  return rawByMember;
};

export function verifySealedRelease({
  archivePath,
  manifestPath,
  policyPath,
  publicKeyPath,
  expectedOwnerKeyId,
  consumptionAttestationPath,
  nonceStoreReceiptPath,
  executorPublicKeyPath,
  expectedExecutorKeyId,
  executionContext,
  expectedSourceSha,
  now = new Date(),
}) {
  let archiveBytes;
  try {
    archiveBytes = readStableRegularFile(archivePath, 'SEALED_ARCHIVE_FILE_INVALID', 100 * 1024 * 1024);
  } catch {
    fail('SEALED_ARCHIVE_FILE_INVALID');
  }
  ok(archiveBytes.length > 0 && archiveBytes.length <= 100 * 1024 * 1024, 'SEALED_ARCHIVE_SIZE');
  const archiveSha256 = sha256Bytes(archiveBytes);
  const members = tarMembers(archiveBytes);
  assertUnique(members, 'SEALED_ARCHIVE_DUPLICATE_MEMBER');
  for (const coreMember of [
    'production-readiness-evidence-v1.json',
    'kidults-production-readiness.json',
    'program-owner-production-release-receipt-v1.json',
  ]) ok(members.includes(coreMember), `SEALED_ARCHIVE_CORE_MEMBER_MISSING:${coreMember}`);

  const manifestLoaded = loadJson(manifestPath, 'SEALED_MANIFEST_FILE_INVALID');
  const manifest = manifestLoaded.value;
  exactKeys(manifest, [
    'id', 'version', 'status', 'vertical', 'sealed_at', 'archive_sha256', 'readiness_checksum',
    'decision', 'technical_readiness_verified', 'explicit_program_owner_release_verified',
    'protected_executor_consumption_verified',
    'owner_release_receipt_sha256', 'owner_key_id', 'source_sha', 'policy_sha256',
    'readiness_evidence_sha256', 'evidence_bundle_sha256', 'repository',
    'protected_environment', 'evidence_run_id', 'evidence_run_attempt', 'artifact_name',
    'production_change_executed',
    'artfund_production_promotion_authorized',
  ], 'SEALED_MANIFEST');
  ok(manifest.id === SEALED_MANIFEST_ID && manifest.version === VERSION, 'SEALED_MANIFEST_IDENTITY');
  ok(manifest.status === 'sealed_release_candidate' && manifest.vertical === 'kidults', 'SEALED_MANIFEST_STATE');
  const sealedAt = parseIso(manifest.sealed_at, 'SEALED_MANIFEST_TIME');
  ok(manifest.archive_sha256 === archiveSha256, 'SEALED_ARCHIVE_DIGEST');
  ok(manifest.decision === 'ready_for_program_owner_release', 'SEALED_MANIFEST_DECISION');
  ok(manifest.technical_readiness_verified === true, 'SEALED_MANIFEST_TECHNICAL_GATE');
  ok(manifest.explicit_program_owner_release_verified === true, 'SEALED_MANIFEST_OWNER_GATE');
  ok(manifest.protected_executor_consumption_verified === false, 'SEALED_MANIFEST_MUST_NOT_PRECLAIM_CONSUMPTION');
  ok(manifest.production_change_executed === false, 'SEALED_MANIFEST_PRODUCTION_CHANGE');
  ok(manifest.artfund_production_promotion_authorized === false, 'SEALED_MANIFEST_ARTFUND_GATE');

  try {
    ok(fs.realpathSync(policyPath) === fs.realpathSync(path.join(REPOSITORY_ROOT, POLICY_PATH)), 'POLICY_PATH_SUBSTITUTION');
  } catch {
    fail('POLICY_FILE_INVALID');
  }
  const policyLoaded = loadJson(policyPath, 'POLICY_FILE_INVALID');
  const evidenceLoaded = parseArchiveJson(archiveBytes, 'production-readiness-evidence-v1.json');
  const readinessLoaded = parseArchiveJson(archiveBytes, 'kidults-production-readiness.json');
  const ownerLoaded = parseArchiveJson(archiveBytes, 'program-owner-production-release-receipt-v1.json');
  validateTechnicalEvidence(evidenceLoaded.value, {
    expectedSourceSha,
    policy: policyLoaded.value,
    policySha256: sha256Bytes(policyLoaded.raw),
    evidenceSha256: sha256Bytes(evidenceLoaded.raw),
  });
  const rawByMember = validateBoundArchiveMembers({ archiveBytes, members, evidence: evidenceLoaded.value, expectedSourceSha, now });
  const evidenceBundleSha256 = evidenceBundleDigest(rawByMember);
  let publicKeyPem;
  let executorPublicKeyPem;
  try {
    publicKeyPem = readStableRegularFile(publicKeyPath, 'PROGRAM_OWNER_PUBLIC_KEY_FILE_INVALID', 1024 * 1024);
  } catch {
    fail('PROGRAM_OWNER_PUBLIC_KEY_FILE_INVALID');
  }
  try {
    executorPublicKeyPem = readStableRegularFile(executorPublicKeyPath, 'PROTECTED_EXECUTOR_PUBLIC_KEY_FILE_INVALID', 1024 * 1024);
  } catch {
    fail('PROTECTED_EXECUTOR_PUBLIC_KEY_FILE_INVALID');
  }
  const consumptionLoaded = loadJson(consumptionAttestationPath, 'PROTECTED_EXECUTOR_CONSUMPTION_ATTESTATION_FILE_INVALID');
  let nonceStoreReceiptRaw = null;
  if (executionContext.execution_mode === 'CONTROLLED_PRODUCTION_PROMOTION') {
    ok(typeof nonceStoreReceiptPath === 'string' && nonceStoreReceiptPath.length > 0, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_PATH_REQUIRED');
    nonceStoreReceiptRaw = loadJson(nonceStoreReceiptPath, 'PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_FILE_INVALID').raw;
  } else {
    ok(nonceStoreReceiptPath === null, 'PROTECTED_EXECUTOR_CERTIFICATION_STORE_RECEIPT_PATH_MUST_BE_NULL');
  }
  const release = releaseFromValues({
    evidence: evidenceLoaded.value,
    evidenceRaw: evidenceLoaded.raw,
    readiness: readinessLoaded.value,
    ownerReceipt: ownerLoaded.value,
    policy: policyLoaded.value,
    policyRaw: policyLoaded.raw,
    publicKeyPem,
    expectedOwnerKeyId,
    evidenceBundleSha256,
    executionContext,
    consumptionAttestation: consumptionLoaded.value,
    consumptionPublicKeyPem: executorPublicKeyPem,
    expectedConsumptionKeyId: expectedExecutorKeyId,
    ownerReceiptMemberSha256: sha256Bytes(ownerLoaded.raw),
    archiveSha256,
    nonceStoreReceiptRaw,
    expectedSourceSha,
    now,
  });
  const verificationTime = now.getTime();
  const ownerIssuedAt = parseIso(ownerLoaded.value.issued_at, 'SEALED_MANIFEST_OWNER_ISSUED_AT');
  const ownerExpiresAt = parseIso(ownerLoaded.value.expires_at, 'SEALED_MANIFEST_OWNER_EXPIRES_AT');
  const executorAttestedAt = parseIso(consumptionLoaded.value.consumed_at, 'SEALED_MANIFEST_EXECUTOR_ATTESTED_AT');
  ok(sealedAt >= ownerIssuedAt, 'SEALED_MANIFEST_BEFORE_OWNER_APPROVAL');
  ok(sealedAt <= verificationTime + CLOCK_SKEW_MS, 'SEALED_MANIFEST_FROM_FUTURE');
  ok(sealedAt < ownerExpiresAt, 'SEALED_MANIFEST_AFTER_OWNER_EXPIRY');
  ok(executorAttestedAt >= sealedAt, 'PROTECTED_EXECUTOR_ATTESTATION_BEFORE_SEAL');
  ok(manifest.readiness_checksum === readinessLoaded.value.checksum, 'SEALED_MANIFEST_READINESS_CHECKSUM');
  ok(manifest.owner_release_receipt_sha256 === sha256Bytes(ownerLoaded.raw), 'SEALED_MANIFEST_OWNER_RECEIPT_DIGEST');
  ok(manifest.owner_key_id === release.owner.key_id, 'SEALED_MANIFEST_OWNER_KEY');
  ok(manifest.evidence_bundle_sha256 === evidenceBundleSha256, 'SEALED_MANIFEST_BUNDLE_DIGEST');
  for (const field of [
    'repository', 'protected_environment', 'evidence_run_id', 'evidence_run_attempt', 'artifact_name',
  ]) ok(manifest[field] === executionContext[field], `SEALED_MANIFEST_CONTEXT:${field}`);
  ok(manifest.source_sha === release.summary.source_sha, 'SEALED_MANIFEST_SOURCE_SHA');
  ok(manifest.policy_sha256 === release.summary.policy_sha256, 'SEALED_MANIFEST_POLICY_DIGEST');
  ok(manifest.readiness_evidence_sha256 === release.summary.readiness_evidence_sha256, 'SEALED_MANIFEST_EVIDENCE_DIGEST');
  return {
    state: executionContext.execution_mode === 'CONTROLLED_PRODUCTION_PROMOTION'
      ? 'SEALED_PRODUCTION_RELEASE_EVIDENCE_CONSUMED_VERIFIED'
      : 'SEALED_RELEASE_CANDIDATE_CERTIFIED_UNCONSUMED',
    archive_sha256: archiveSha256,
    technical: release.summary,
    program_owner_release: release.owner,
    protected_executor_consumption: release.owner.consumption,
    production_execution: executionContext.execution_mode === 'CONTROLLED_PRODUCTION_PROMOTION'
      ? 'AUTHORIZED_NOT_PERFORMED'
      : 'NOT_AUTHORIZED_CERTIFICATION_ONLY',
  };
}

const parseArgs = (argv) => {
  const command = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    ok(argument.startsWith('--'), `UNKNOWN_ARGUMENT:${argument}`);
    const key = argument.slice(2);
    const value = argv[++index];
    ok(value !== undefined, `MISSING_ARGUMENT_VALUE:${argument}`);
    options[key] = value;
  }
  return { command, options };
};

const requireOption = (options, name) => {
  const value = options[name];
  ok(typeof value === 'string' && value.length > 0, `OPTION_REQUIRED:${name}`);
  return value;
};

const requireIntegerOption = (options, name) => {
  const value = requireOption(options, name);
  ok(/^[1-9][0-9]{0,19}$/.test(value), `OPTION_INVALID:${name}`);
  const numeric = Number(value);
  ok(Number.isSafeInteger(numeric), `OPTION_INVALID:${name}`);
  return numeric;
};

const executionContextFromOptions = (options) => ({
  repository: requireOption(options, 'repository'),
  protected_environment: requireOption(options, 'protected-environment'),
  evidence_run_id: requireOption(options, 'evidence-run-id'),
  evidence_run_attempt: requireIntegerOption(options, 'evidence-run-attempt'),
  artifact_id: requireOption(options, 'artifact-id'),
  artifact_name: requireOption(options, 'artifact-name'),
  artifact_sha256: requireOption(options, 'artifact-sha256'),
  executor_run_id: requireOption(options, 'executor-run-id'),
  executor_run_attempt: requireIntegerOption(options, 'executor-run-attempt'),
  execution_mode: requireOption(options, 'execution-mode'),
  predeployment_snapshot_manifest_sha256: requireOption(options, 'predeployment-snapshot-manifest-sha256') === 'null'
    ? null
    : requireOption(options, 'predeployment-snapshot-manifest-sha256'),
  target_gateway_image_id: requireOption(options, 'target-gateway-image-id') === 'null'
    ? null
    : requireOption(options, 'target-gateway-image-id'),
  target_scheduler_image_id: requireOption(options, 'target-scheduler-image-id') === 'null'
    ? null
    : requireOption(options, 'target-scheduler-image-id'),
  deployment_manifest_sha256: requireOption(options, 'deployment-manifest-sha256') === 'null'
    ? null
    : requireOption(options, 'deployment-manifest-sha256'),
});

const ownerContextFromOptions = (options) => ({
  repository: requireOption(options, 'repository'),
  protected_environment: requireOption(options, 'protected-environment'),
  evidence_run_id: requireOption(options, 'evidence-run-id'),
  evidence_run_attempt: requireIntegerOption(options, 'evidence-run-attempt'),
  artifact_name: requireOption(options, 'artifact-name'),
});

const main = () => {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === 'technical') {
    const result = technicalFromFiles({
      evidencePath: requireOption(options, 'evidence'),
      evidenceDir: requireOption(options, 'evidence-dir'),
      policyPath: options.policy || POLICY_PATH,
      expectedSourceSha: requireOption(options, 'expected-source-sha'),
    });
    console.log(JSON.stringify({ suite: 'KIDULTS_PRODUCTION_TECHNICAL_READINESS_V1', result: 'VERIFIED_PASS', summary: result.summary }, null, 2));
    return;
  }
  if (command === 'release') {
    const evidenceDir = requireOption(options, 'evidence-dir');
    const evidencePath = requireOption(options, 'evidence');
    const readinessPath = requireOption(options, 'readiness');
    const ownerReceiptPath = requireOption(options, 'owner-receipt');
    const policyPath = options.policy || POLICY_PATH;
    const expectedSourceSha = requireOption(options, 'expected-source-sha');
    const technical = technicalFromFiles({ evidencePath, evidenceDir, policyPath, expectedSourceSha });
    for (const [filePath, expectedMember, code] of [
      [readinessPath, 'kidults-production-readiness.json', 'READINESS_PATH_SUBSTITUTION'],
      [ownerReceiptPath, 'program-owner-production-release-receipt-v1.json', 'PROGRAM_OWNER_RECEIPT_PATH_SUBSTITUTION'],
    ]) {
      let actual;
      let expected;
      try {
        actual = fs.realpathSync(filePath);
        expected = fs.realpathSync(path.join(evidenceDir, expectedMember));
      } catch {
        fail(code);
      }
      ok(actual === expected, code);
    }
    const readinessLoaded = loadJson(readinessPath, 'READINESS_FILE_INVALID');
    validateReadinessDecision(readinessLoaded.value, technical.summary);
    const ownerLoaded = loadJson(ownerReceiptPath, 'PROGRAM_OWNER_RECEIPT_FILE_INVALID');
    let publicKeyPem;
    try {
      publicKeyPem = readStableRegularFile(
        requireOption(options, 'owner-public-key'),
        'PROGRAM_OWNER_PUBLIC_KEY_FILE_INVALID',
        1024 * 1024,
      );
    } catch {
      fail('PROGRAM_OWNER_PUBLIC_KEY_FILE_INVALID');
    }
    const bundleMembers = new Map(technical.boundEvidence);
    bundleMembers.set('production-readiness-evidence-v1.json', technical.evidenceLoaded.raw);
    bundleMembers.set('kidults-production-readiness.json', readinessLoaded.raw);
    const bundleSha256 = evidenceBundleDigest(bundleMembers);
    ok(bundleSha256 === requireOption(options, 'evidence-bundle-sha256'), 'PRESEAL_EVIDENCE_BUNDLE_DIGEST');
    const owner = validateProgramOwnerSignature(ownerLoaded.value, {
      technicalSummary: technical.summary,
      readiness: readinessLoaded.value,
      publicKeyPem,
      expectedKeyId: requireOption(options, 'expected-owner-key-id'),
      evidenceBundleSha256: bundleSha256,
      executionContext: ownerContextFromOptions(options),
    });
    console.log(JSON.stringify({
      suite: 'KIDULTS_PRODUCTION_RELEASE_PRESEAL_V1',
      result: 'HOLD',
      state: 'PROGRAM_OWNER_SIGNATURE_VERIFIED_UNCONSUMED',
      technical: technical.summary,
      program_owner_release: owner,
      evidence_bundle_sha256: bundleSha256,
      production_release_authorized: false,
      release_condition: 'PROTECTED_EXECUTOR_CONSUMPTION_ATTESTATION_REQUIRED',
    }, null, 2));
    return;
  }
  if (command === 'owner-signing-payload') {
    const receipt = loadJson(requireOption(options, 'owner-receipt'), 'PROGRAM_OWNER_RECEIPT_FILE_INVALID').value;
    process.stdout.write(ownerSigningPayload(receipt));
    return;
  }
  if (command === 'consumption-signing-payload') {
    const attestation = loadJson(requireOption(options, 'consumption-attestation'), 'PROTECTED_EXECUTOR_CONSUMPTION_ATTESTATION_FILE_INVALID').value;
    process.stdout.write(consumptionSigningPayload(attestation));
    return;
  }
  if (command === 'verify-sealed-release') {
    const result = verifySealedRelease({
      archivePath: requireOption(options, 'archive'),
      manifestPath: requireOption(options, 'manifest'),
      policyPath: options.policy || POLICY_PATH,
      publicKeyPath: requireOption(options, 'owner-public-key'),
      expectedOwnerKeyId: requireOption(options, 'expected-owner-key-id'),
      consumptionAttestationPath: requireOption(options, 'consumption-attestation'),
      nonceStoreReceiptPath: requireOption(options, 'nonce-store-receipt') === 'null'
        ? null
        : requireOption(options, 'nonce-store-receipt'),
      executorPublicKeyPath: requireOption(options, 'executor-public-key'),
      expectedExecutorKeyId: requireOption(options, 'expected-executor-key-id'),
      executionContext: executionContextFromOptions(options),
      expectedSourceSha: requireOption(options, 'expected-source-sha'),
    });
    const productionAuthorized = result.state === 'SEALED_PRODUCTION_RELEASE_EVIDENCE_CONSUMED_VERIFIED';
    console.log(JSON.stringify({
      suite: 'KIDULTS_SEALED_PRODUCTION_RELEASE_GATE_V1',
      result: productionAuthorized ? 'VERIFIED_PASS' : 'HOLD',
      production_release_authorized: productionAuthorized,
      ...result,
    }, null, 2));
    return;
  }
  fail('COMMAND_REQUIRED');
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    const code = error instanceof ProductionReleaseGateError ? error.code : 'UNEXPECTED_GATE_FAILURE';
    console.error(JSON.stringify({ suite: 'KIDULTS_PRODUCTION_RELEASE_GATE_V1', result: 'VERIFIED_FAIL', code }));
    process.exitCode = 1;
  }
}
