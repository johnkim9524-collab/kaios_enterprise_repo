#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [snapshotArg = '/tmp/kidults-management-control-tower/control-tower-snapshot-v1.json',
  receiptArg = '/tmp/kidults-management-control-tower/validation-receipt.json'] = process.argv.slice(2);
const root = process.cwd();
const snapshotPath = resolve(root, snapshotArg);
const receiptPath = resolve(root, receiptArg);
const policyPath = 'coordination/kidults/governance/management-control-tower-contract-v1.json';
const policyRule = 'snapshot_integrity.evidence_freshness_threshold';

const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const fail = code => { throw new Error(code); };
const requireCondition = (value, code) => { if (!value) fail(code); };

function evaluateEvidenceFreshnessContract(snapshot, policy, snapshotText = '', policyText = '') {
  const threshold = policy?.snapshot_integrity?.evidence_freshness_threshold;
  const policyState = policy?.snapshot_integrity?.evidence_freshness_state;
  requireCondition(threshold === 'NOT_DEFINED' && policyState === 'UNASSESSED_AND_VISIBLE',
    'CONTROL_TOWER_EVIDENCE_FRESHNESS_POLICY_UNSUPPORTED');

  const generatedAt = Date.parse(snapshot.generated_at);
  const sourceAsOf = Date.parse(snapshot.source_as_of);
  requireCondition(Number.isFinite(generatedAt), 'CONTROL_TOWER_EVIDENCE_GENERATED_AT_INVALID');
  requireCondition(Number.isFinite(sourceAsOf), 'CONTROL_TOWER_EVIDENCE_SOURCE_AS_OF_INVALID');
  requireCondition(sourceAsOf <= generatedAt, 'CONTROL_TOWER_EVIDENCE_SOURCE_IN_FUTURE');

  const ageMinutes = (generatedAt - sourceAsOf) / 60_000;
  const declared = snapshot.freshness?.evidence;
  requireCondition(declared?.state_at_build === 'UNASSESSED',
    'CONTROL_TOWER_EVIDENCE_SELF_DECLARED_CLASSIFICATION');
  requireCondition(declared?.threshold === 'NOT_DEFINED',
    'CONTROL_TOWER_EVIDENCE_THRESHOLD_DRIFT');
  requireCondition(declared?.aggregate_as_of === snapshot.source_as_of,
    'CONTROL_TOWER_EVIDENCE_AGGREGATE_AS_OF_MISMATCH');
  requireCondition(Number.isFinite(declared?.oldest_material_age_minutes_at_build)
    && Math.abs(declared.oldest_material_age_minutes_at_build - ageMinutes) <= 1e-9,
  'CONTROL_TOWER_EVIDENCE_AGE_BINDING_MISMATCH');

  return {
    id: 'kidults-management-control-tower-evidence-freshness-receipt-v1',
    version: '1.1.0',
    state: 'VERIFIED_PASS',
    failed_check_ids: [],
    transport_validation: 'VERIFIED_PASS',
    snapshot: snapshot.id,
    generated_at: snapshot.generated_at,
    source_as_of: snapshot.source_as_of,
    producer: snapshot.producer,
    snapshot_sha256: snapshotText ? sha256(snapshotText) : null,
    evidence_freshness: {
      state_at_validation: 'UNASSESSED',
      freshness_claim: 'NONE',
      threshold: 'NOT_DEFINED',
      threshold_minutes: null,
      oldest_material_age_minutes_at_build: ageMinutes,
      policy_contract_path: policyPath,
      policy_contract_sha256: policyText ? sha256(policyText) : null,
      policy_rule: policyRule,
      assessment_authority: 'NO_AGE_CLASSIFICATION_UNTIL_CONTROL_TOWER_CONTRACT_DEFINES_THRESHOLD'
    },
    promotion_eligible: false,
    evidence_admission: 'NONE',
    public_release: 'HOLD',
    production: 'HOLD'
  };
}

function expectRejected(expectedCode, operation) {
  try {
    operation();
  } catch (error) {
    requireCondition(String(error?.message || error) === expectedCode,
      `CONTROL_TOWER_EVIDENCE_SELF_TEST_WRONG_REJECTION:${expectedCode}`);
    return;
  }
  fail(`CONTROL_TOWER_EVIDENCE_SELF_TEST_MUTATION_ACCEPTED:${expectedCode}`);
}

function selfTest() {
  const generatedAt = '2026-09-04T12:00:00.000Z';
  const sourceAsOf = '2026-08-24T05:20:00.000Z';
  const ageMinutes = (Date.parse(generatedAt) - Date.parse(sourceAsOf)) / 60_000;
  const policy = {
    snapshot_integrity: {
      evidence_freshness_threshold: 'NOT_DEFINED',
      evidence_freshness_state: 'UNASSESSED_AND_VISIBLE'
    }
  };
  const snapshot = {
    id: 'self-test-control-tower',
    generated_at: generatedAt,
    source_as_of: sourceAsOf,
    producer: { generation_class: 'SELF_TEST' },
    freshness: {
      evidence: {
        state_at_build: 'UNASSESSED',
        threshold: 'NOT_DEFINED',
        aggregate_as_of: sourceAsOf,
        oldest_material_age_minutes_at_build: ageMinutes
      }
    }
  };

  const receipt = evaluateEvidenceFreshnessContract(snapshot, policy);
  requireCondition(receipt.state === 'VERIFIED_PASS'
    && receipt.evidence_freshness.state_at_validation === 'UNASSESSED'
    && receipt.evidence_freshness.freshness_claim === 'NONE'
    && receipt.evidence_freshness.threshold === 'NOT_DEFINED'
    && receipt.evidence_freshness.threshold_minutes === null
    && receipt.promotion_eligible === false
    && receipt.evidence_admission === 'NONE',
  'CONTROL_TOWER_EVIDENCE_SELF_TEST_BASELINE');

  const forgedThresholdPolicy = structuredClone(policy);
  forgedThresholdPolicy.snapshot_integrity.evidence_freshness_threshold = 7;
  expectRejected('CONTROL_TOWER_EVIDENCE_FRESHNESS_POLICY_UNSUPPORTED',
    () => evaluateEvidenceFreshnessContract(snapshot, forgedThresholdPolicy));

  const forgedFreshSnapshot = structuredClone(snapshot);
  forgedFreshSnapshot.freshness.evidence.state_at_build = 'FRESH';
  expectRejected('CONTROL_TOWER_EVIDENCE_SELF_DECLARED_CLASSIFICATION',
    () => evaluateEvidenceFreshnessContract(forgedFreshSnapshot, policy));

  const driftedAgeSnapshot = structuredClone(snapshot);
  driftedAgeSnapshot.freshness.evidence.oldest_material_age_minutes_at_build += 1;
  expectRejected('CONTROL_TOWER_EVIDENCE_AGE_BINDING_MISMATCH',
    () => evaluateEvidenceFreshnessContract(driftedAgeSnapshot, policy));

  const futureSnapshot = structuredClone(snapshot);
  futureSnapshot.source_as_of = '2026-09-05T00:00:00.000Z';
  futureSnapshot.freshness.evidence.aggregate_as_of = futureSnapshot.source_as_of;
  futureSnapshot.freshness.evidence.oldest_material_age_minutes_at_build = -720;
  expectRejected('CONTROL_TOWER_EVIDENCE_SOURCE_IN_FUTURE',
    () => evaluateEvidenceFreshnessContract(futureSnapshot, policy));
}

selfTest();

let receipt = {
  id: 'kidults-management-control-tower-evidence-freshness-receipt-v1',
  version: '1.1.0',
  state: 'VERIFIED_FAIL',
  failed_check_ids: ['CONTROL_TOWER_EVIDENCE_FRESHNESS_GATE_INCOMPLETE'],
  transport_validation: 'VERIFIED_PASS',
  evidence_freshness: {
    state_at_validation: 'UNVERIFIED',
    freshness_claim: 'NONE',
    threshold: null,
    threshold_minutes: null,
    policy_contract_path: policyPath,
    policy_rule: policyRule
  },
  promotion_eligible: false,
  evidence_admission: 'NONE',
  public_release: 'HOLD',
  production: 'HOLD'
};

try {
  const snapshotText = readFileSync(snapshotPath, 'utf8');
  const snapshot = JSON.parse(snapshotText);
  const policyText = readFileSync(resolve(root, policyPath), 'utf8');
  const policy = JSON.parse(policyText);
  receipt = evaluateEvidenceFreshnessContract(snapshot, policy, snapshotText, policyText);
} catch (error) {
  const code = String(error?.message || 'CONTROL_TOWER_EVIDENCE_FRESHNESS_GATE_ERROR');
  receipt = {
    ...receipt,
    failed_check_ids: [code.startsWith('CONTROL_TOWER_') ? code : 'CONTROL_TOWER_EVIDENCE_FRESHNESS_GATE_ERROR'],
    error: code
  };
}

mkdirSync(dirname(receiptPath), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
if (receipt.state !== 'VERIFIED_PASS') process.exitCode = 1;
