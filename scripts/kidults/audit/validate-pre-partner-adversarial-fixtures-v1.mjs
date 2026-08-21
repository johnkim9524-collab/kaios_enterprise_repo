import fs from 'node:fs';
import { parseRfc3339Millis } from './rfc3339-v1.mjs';

const contract = JSON.parse(fs.readFileSync('coordination/kidults/audit/unified-audit-control-plane-v1.json', 'utf8'));
const pack = JSON.parse(fs.readFileSync('coordination/kidults/audit/pre-partner-adversarial-fixtures-v2.json', 'utf8'));

const ALLOWED_CURRENCIES = new Set(['USD','EUR','GBP','JPY','KRW','CHF','HKD','SGD','AUD','CAD']);
const ALLOWED_UNITS = new Set(['ITEM','LOT']);

function rightsTemporalStatus(rights, asOf) {
  try {
    const asOfMs = parseRfc3339Millis(asOf, 'record.as_of');
    if (rights?.expires_at === null || rights?.expires_at === undefined) return { valid: true, expired: false };
    const expiresMs = parseRfc3339Millis(rights.expires_at, 'rights.expires_at');
    return { valid: true, expired: expiresMs <= asOfMs };
  } catch (error) {
    return { valid: false, expired: false, reason: error.message };
  }
}

function evaluateRecord(record) {
  const triggers = [];
  const lifecycle = record.lifecycle || {};
  const transport = record.transport || {};
  const replay = record.replay || {};
  const provider = record.provider || {};
  const rights = record.rights || {};
  const schema = record.schema || {};
  const semantics = record.semantics || {};
  const identity = record.identity || {};
  const lineage = record.lineage || {};
  const quality = record.quality || {};

  // Withdrawal/deletion must remain possible even after rights cease to be usable.
  if (lifecycle.deletion_requested === true) {
    triggers.push('deletion_requested');
    if (!['PROMOTED','SUPERSEDED','WITHDRAWN'].includes(lifecycle.current_state)) {
      return { disposition: 'QUARANTINED_OR_REJECTED', triggers: [...triggers, 'invalid_deletion_state'] };
    }
    return { disposition: 'WITHDRAWN_OR_DELETED', triggers };
  }

  // Transport failure never promotes and therefore may short-circuit before content admission checks.
  if (transport.http_status === 429 || transport.http_status >= 500 || transport.retries_exhausted === true) {
    triggers.push(`transport_${transport.http_status || 'retries_exhausted'}`);
    return { disposition: 'NO_PROMOTION_RETRY_OR_DLQ', triggers };
  }

  // Rights are a universal admission prerequisite, including replay/recovery.
  // Never allow replay idempotency to substitute for a current rights check.
  const temporal = rightsTemporalStatus(rights, record.as_of);
  if (!temporal.valid) {
    triggers.push('rights_temporal_invalid');
    return { disposition: 'REJECTED', triggers };
  }

  if (rights.present !== true || rights.status !== 'PASS' || temporal.expired) {
    if (rights.present !== true) triggers.push('rights_missing');
    if (rights.status !== 'PASS') triggers.push('rights_not_pass');
    if (temporal.expired) triggers.push('rights_expired');
    return { disposition: 'REJECTED', triggers };
  }

  // Provider substitution must be revalidated before a replay may be considered safe.
  if (provider.substitution === true) {
    triggers.push('provider_substitution');
    const revalidated = provider.adapter_validated === true && provider.rights_revalidated === true && provider.identity_revalidated === true && provider.lineage_revalidated === true;
    if (!revalidated) return { disposition: 'REVALIDATE_RIGHTS_SCHEMA_IDENTITY_LINEAGE', triggers };
  }

  // Replay/recovery must pass the same current schema/semantic/identity/lineage/quality
  // controls as a normal record. A matching digest only proves byte identity, not current admissibility.
  if (schema.received_version !== schema.expected_version || schema.required_fields_present !== true) {
    triggers.push('schema_integrity');
  }
  if (!ALLOWED_CURRENCIES.has(semantics.currency) || !ALLOWED_UNITS.has(semantics.unit) || semantics.timezone_valid !== true) {
    triggers.push('semantic_integrity');
  }
  if (identity.duplicate_of || identity.relisted_from || identity.contradiction === true) {
    triggers.push('identity_resolution');
  }
  if (lineage.complete !== true) triggers.push('lineage_incomplete');
  if (quality.outlier === true || quality.impossible_value === true) triggers.push('quality_anomaly');
  if (quality.batch_complete !== true || quality.batch_expected_count !== quality.batch_received_count) triggers.push('batch_incomplete');

  if (triggers.length) return { disposition: 'QUARANTINED_OR_REJECTED', triggers };

  if (replay.is_replay === true) {
    triggers.push('replay');
    if (replay.same_digest === true && replay.idempotency_key_match === true) {
      return { disposition: 'IDEMPOTENT_REPLAY_WITH_AUDIT_TRACE', triggers };
    }
    return { disposition: 'QUARANTINED_OR_REJECTED', triggers: [...triggers, 'replay_identity_mismatch'] };
  }

  return { disposition: 'CONTROL_ONLY_EVIDENCE_ELIGIBLE', triggers: ['all_control_checks_pass'] };
}

if (pack.governing_issue !== 881) throw new Error('fixture pack must be governed by #881');
if (pack.fixture_type !== 'SYNTHETIC_NON_PROMOTABLE_CONTROL') throw new Error('fixture pack must be synthetic/non-promotable');
if (pack.empirical_gate_effect !== 'NONE') throw new Error('fixture pack may not affect empirical gates');

const baseline = pack.baseline_control;
if (!baseline?.synthetic || baseline.promotable !== false) throw new Error('baseline control must be synthetic and non-promotable');
const baselineEval = evaluateRecord(baseline.record);
if (baselineEval.disposition !== baseline.expected_disposition || baselineEval.disposition !== 'CONTROL_ONLY_EVIDENCE_ELIGIBLE') {
  throw new Error(`baseline control failed: ${baselineEval.disposition}`);
}

const temporalMutationCases = [
  { id: 'malformed_expiry', mutate: r => { r.rights.expires_at = 'not-a-date'; } },
  { id: 'timezone_less_expiry', mutate: r => { r.rights.expires_at = '2099-01-01T00:00:00'; } },
  { id: 'invalid_calendar_expiry', mutate: r => { r.rights.expires_at = '2099-02-30T00:00:00Z'; } },
  { id: 'malformed_as_of', mutate: r => { r.as_of = 'invalid'; } }
];
for (const test of temporalMutationCases) {
  const mutated = structuredClone(baseline.record);
  test.mutate(mutated);
  const actual = evaluateRecord(mutated);
  if (actual.disposition !== 'REJECTED' || !actual.triggers.includes('rights_temporal_invalid')) {
    throw new Error(`temporal mutation ${test.id} failed closed check: ${actual.disposition}/${actual.triggers.join(',')}`);
  }
}

// Mutation-test the cross-control replay boundary itself. A valid replay envelope must not
// bypass current rights, schema, or provider-substitution validation merely because its digest
// and idempotency key match a previously seen record.
const replayFailClosedMutationCases = [
  {
    id: 'replay_expired_rights',
    mutate: r => { r.rights.expires_at = '2026-08-20T00:00:00Z'; },
    expected: 'REJECTED'
  },
  {
    id: 'replay_missing_rights',
    mutate: r => { r.rights.present = false; r.rights.status = 'UNKNOWN'; },
    expected: 'REJECTED'
  },
  {
    id: 'replay_malformed_expiry',
    mutate: r => { r.rights.expires_at = 'not-a-date'; },
    expected: 'REJECTED'
  },
  {
    id: 'replay_invalid_as_of',
    mutate: r => { r.as_of = 'invalid'; },
    expected: 'REJECTED'
  },
  {
    id: 'replay_schema_drift',
    mutate: r => { r.schema.received_version = 'partner-sale-v2-unknown'; },
    expected: 'QUARANTINED_OR_REJECTED'
  },
  {
    id: 'replay_unvalidated_provider_substitution',
    mutate: r => {
      r.provider.substitution = true;
      r.provider.adapter_validated = false;
      r.provider.rights_revalidated = false;
      r.provider.identity_revalidated = false;
      r.provider.lineage_revalidated = false;
    },
    expected: 'REVALIDATE_RIGHTS_SCHEMA_IDENTITY_LINEAGE'
  }
];
for (const test of replayFailClosedMutationCases) {
  const mutated = structuredClone(baseline.record);
  mutated.replay = { is_replay: true, same_digest: true, idempotency_key_match: true };
  test.mutate(mutated);
  const actual = evaluateRecord(mutated);
  if (actual.disposition !== test.expected || actual.disposition === 'IDEMPOTENT_REPLAY_WITH_AUDIT_TRACE') {
    throw new Error(`replay mutation ${test.id} failed closed check: expected=${test.expected} actual=${actual.disposition}/${actual.triggers.join(',')}`);
  }
}

const contractFixtures = new Map((contract.adversarial_fixtures || []).map(f => [f.id, f.expected_disposition]));
const packFixtures = pack.fixtures || [];
if (packFixtures.length !== 12) throw new Error(`expected 12 executable #881 adversarial fixtures, got ${packFixtures.length}`);
if (contractFixtures.size !== 12) throw new Error(`contract must declare exactly 12 #881 adversarial fixtures, got ${contractFixtures.size}`);

const results = [];
for (const fixture of packFixtures) {
  if (fixture.synthetic !== true || fixture.promotable !== false) throw new Error(`fixture ${fixture.id} must be synthetic and non-promotable`);
  const contractExpected = contractFixtures.get(fixture.id);
  if (!contractExpected) throw new Error(`fixture ${fixture.id} missing from control-plane contract`);
  if (contractExpected !== fixture.expected_disposition) throw new Error(`fixture ${fixture.id} contract/pack disposition drift`);

  const actual = evaluateRecord(fixture.record);
  if (actual.disposition !== fixture.expected_disposition) {
    throw new Error(`fixture ${fixture.id} expected=${fixture.expected_disposition} actual=${actual.disposition} triggers=${actual.triggers.join(',')}`);
  }
  if (!actual.triggers.length || actual.triggers[0] === 'all_control_checks_pass') throw new Error(`fixture ${fixture.id} did not exercise an adversarial control`);

  // Prove the harness is behavior-driven rather than fixture-ID-driven.
  const renamed = evaluateRecord(structuredClone(fixture.record));
  if (renamed.disposition !== actual.disposition) throw new Error(`fixture ${fixture.id} result is not payload-deterministic`);

  results.push({ id: fixture.id, disposition: actual.disposition, triggers: actual.triggers, promotable: false });
}

for (const id of contractFixtures.keys()) {
  if (!packFixtures.some(f => f.id === id)) throw new Error(`contract fixture has no executable payload: ${id}`);
}
if (results.some(r => r.promotable)) throw new Error('synthetic adversarial fixture may not be promotable');
if (results.some(r => r.disposition === 'PROMOTED')) throw new Error('adversarial fixture may never directly promote');
if (contract.truth_boundary?.synthetic_fixture_effect !== 'CONTROL_VALIDATION_ONLY') throw new Error('synthetic fixture truth boundary drift');
if (contract.truth_boundary?.empirical_gate_effect !== 'NONE') throw new Error('fixture harness cannot promote empirical readiness');
if (contract.truth_boundary?.external_partner_data_ingestion !== 'HOLD') throw new Error('partner data ingestion must remain HOLD');

console.log(JSON.stringify({
  suite: 'PRE_PARTNER_ADVERSARIAL_FIXTURES_V2',
  control_layer_result: 'PASS',
  executable_payload_fixtures_passed: results.length,
  temporal_fail_closed_mutation_cases: temporalMutationCases.length,
  replay_cross_control_fail_closed_mutation_cases: replayFailClosedMutationCases.length,
  replay_requires_current_rights_and_control_revalidation: true,
  baseline_control: baselineEval.disposition,
  behavior_driven_evaluation: true,
  empirical_gate_effect: 'NONE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
