#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [snapshotArg = '/tmp/kidults-management-control-tower/control-tower-snapshot-v1.json',
  receiptArg = '/tmp/kidults-management-control-tower/validation-receipt.json'] = process.argv.slice(2);
const root = process.cwd();
const snapshotPath = resolve(root, snapshotArg);
const receiptPath = resolve(root, receiptArg);
const policyPath = 'coordination/kidults/market/current-sold-admission-contract-v1.json';

const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const fail = (code) => { throw new Error(code); };

let receipt = {
  id: 'kidults-management-control-tower-evidence-freshness-receipt-v1',
  version: '1.0.0',
  state: 'VERIFIED_FAIL',
  failed_check_ids: ['CONTROL_TOWER_EVIDENCE_FRESHNESS_GATE_INCOMPLETE'],
  transport_validation: 'VERIFIED_PASS',
  evidence_freshness: {
    state_at_validation: 'UNVERIFIED',
    threshold_minutes: null,
    policy_contract_path: policyPath,
    policy_rule: 'freshness.strict_current_max_age_days'
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
  const maxAgeDays = policy?.freshness?.strict_current_max_age_days;
  if (!Number.isInteger(maxAgeDays) || maxAgeDays < 1) fail('CONTROL_TOWER_EVIDENCE_FRESHNESS_POLICY_INVALID');
  const thresholdMinutes = maxAgeDays * 24 * 60;
  const generatedAt = Date.parse(snapshot.generated_at);
  const sourceAsOf = Date.parse(snapshot.source_as_of);
  if (!Number.isFinite(generatedAt)) fail('CONTROL_TOWER_EVIDENCE_GENERATED_AT_INVALID');
  if (!Number.isFinite(sourceAsOf)) fail('CONTROL_TOWER_EVIDENCE_SOURCE_AS_OF_INVALID');
  if (sourceAsOf > generatedAt) fail('CONTROL_TOWER_EVIDENCE_SOURCE_IN_FUTURE');
  const ageMinutes = (generatedAt - sourceAsOf) / 60_000;
  const declaredAge = snapshot.freshness?.evidence?.oldest_material_age_minutes_at_build;
  if (!Number.isFinite(declaredAge) || Math.abs(declaredAge - ageMinutes) > 1e-9) {
    fail('CONTROL_TOWER_EVIDENCE_AGE_BINDING_MISMATCH');
  }
  if (snapshot.freshness?.evidence?.aggregate_as_of !== snapshot.source_as_of) {
    fail('CONTROL_TOWER_EVIDENCE_AGGREGATE_AS_OF_MISMATCH');
  }
  const stale = ageMinutes > thresholdMinutes;
  receipt = {
    ...receipt,
    state: stale ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
    failed_check_ids: stale ? ['CONTROL_TOWER_EVIDENCE_STALE'] : [],
    snapshot: snapshot.id,
    generated_at: snapshot.generated_at,
    source_as_of: snapshot.source_as_of,
    producer: snapshot.producer,
    snapshot_sha256: sha256(snapshotText),
    evidence_freshness: {
      state_at_validation: stale ? 'STALE' : 'FRESH',
      threshold_minutes: thresholdMinutes,
      oldest_material_age_minutes_at_build: ageMinutes,
      policy_contract_path: policyPath,
      policy_contract_sha256: sha256(policyText),
      policy_rule: 'freshness.strict_current_max_age_days'
    }
  };
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
