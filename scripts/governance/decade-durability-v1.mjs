#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SHA = /^[0-9a-f]{64}$/;
const ISO = value => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const REQUIRED_CONTROLS = Object.freeze({
  GITHUB_PROTECTED_REF: ['DELETE_DENY', 'NON_FAST_FORWARD_DENY', 'EXACT_TREE_READBACK'],
  CROSS_PROVIDER_OBJECT_LOCK: ['SEPARATE_PROVIDER', 'SEPARATE_ADMIN_DOMAIN',
    'OBJECT_LOCK_COMPLIANCE_MODE', 'RETENTION_LEGAL_HOLD_CAPABLE'],
  OFFLINE_ENCRYPTED_COLD_COPY: ['OFFLINE_OR_AIR_GAPPED', 'SEPARATE_CUSTODIAN',
    'KEY_ESCROW_TESTED', 'MEDIA_REFRESH_SCHEDULED'],
});
function fail(code) { throw new Error(code); }

function hasRequiredControls(replica) {
  return Array.isArray(replica.controls) && (REQUIRED_CONTROLS[replica.class] ?? [])
    .every(control => replica.controls.includes(control));
}

function validRestore(restore, evidence, now, maximumAgeDays, independent) {
  const age = Date.parse(now) - Date.parse(restore?.completedAt ?? '');
  return restore?.state === 'VERIFIED' && restore.sourceSha === evidence.sourceSha
    && restore.sourceTree === evidence.sourceTree && SHA.test(restore.receiptDigest ?? '')
    && restore.testsState === 'VERIFIED' && restore.isolated === true
    && (!independent || restore.independentCustodian === true)
    && age >= 0 && age <= maximumAgeDays * 24 * 60 * 60 * 1000;
}

export function evaluateDecadeDurability(evidence, { now }) {
  if (!evidence || evidence.contractId !== 'kidults-decade-durability-evidence-v1'
    || evidence.version !== '1.0.0' || !ISO(now) || !/^[0-9a-f]{40}$/.test(evidence.sourceSha)
    || !/^[0-9a-f]{40}$/.test(evidence.sourceTree) || !Array.isArray(evidence.replicas)
    || !Array.isArray(evidence.errors) || !evidence.restoreDrill
    || !evidence.annualFullRestore) fail('DURABILITY_EVIDENCE_INVALID');

  const verified = evidence.replicas.filter(replica => replica.state === 'VERIFIED'
    && SHA.test(replica.digest) && replica.sourceSha === evidence.sourceSha
    && replica.sourceTree === evidence.sourceTree && ISO(replica.readBackAt)
    && replica.signatureState === 'VERIFIED' && typeof replica.keyIdentifier === 'string'
    && replica.keyIdentifier.length > 0 && hasRequiredControls(replica)
    && typeof replica.providerFailureDomain === 'string'
    && typeof replica.administrativeDomain === 'string');
  const providers = new Set(verified.map(replica => replica.providerFailureDomain));
  const administrators = new Set(verified.map(replica => replica.administrativeDomain));
  const classes = new Set(verified.map(replica => replica.class));
  const offsite = verified.some(replica => replica.offsite === true);
  const immutable = verified.some(replica => replica.worm === true || replica.offline === true);
  const retention = verified.every(replica => Number.isInteger(replica.retentionYears)
    && replica.retentionYears >= 10);
  const drillCurrent = validRestore(evidence.restoreDrill, evidence, now, 93, false);
  const annualCurrent = validRestore(evidence.annualFullRestore, evidence, now, 366, true);
  const requiredClasses = Object.keys(REQUIRED_CONTROLS);
  const failures = [];
  if (verified.length < 3) failures.push('MINIMUM_VERIFIED_COPIES_NOT_MET');
  if (providers.size < 2) failures.push('PROVIDER_FAILURE_DOMAIN_DIVERSITY_NOT_MET');
  if (administrators.size < 2) failures.push('ADMINISTRATIVE_DOMAIN_DIVERSITY_NOT_MET');
  if (!requiredClasses.every(value => classes.has(value))) failures.push('REPLICA_CLASS_SET_INCOMPLETE');
  if (!offsite) failures.push('OFFSITE_COPY_MISSING');
  if (!immutable) failures.push('WORM_OR_OFFLINE_COPY_MISSING');
  if (!retention) failures.push('TEN_YEAR_RETENTION_NOT_PROVEN');
  if (evidence.errors.length !== 0) failures.push('UNVERIFIED_ERRORS_PRESENT');
  if (!drillCurrent) failures.push('CURRENT_RESTORE_DRILL_MISSING');
  if (!annualCurrent) failures.push('CURRENT_INDEPENDENT_ANNUAL_RESTORE_MISSING');
  return Object.freeze({
    contractId: 'kidults-decade-durability-assessment-v1', version: '1.0.0',
    state: failures.length === 0 ? 'DECADE_DURABILITY_VERIFIED' : 'HOLD',
    sourceSha: evidence.sourceSha, sourceTree: evidence.sourceTree,
    verifiedCopies: verified.length, providerFailureDomains: providers.size,
    administrativeDomains: administrators.size, failures,
    automaticPromotion: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) fail('DURABILITY_ARGUMENTS_INVALID');
  return process.argv[index + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = evaluateDecadeDurability(JSON.parse(readFileSync(argument('--evidence'), 'utf8')),
      { now: argument('--now') });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.state !== 'DECADE_DURABILITY_VERIFIED') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ contractId: 'kidults-decade-durability-assessment-v1',
      state: 'HOLD', reason: /^[A-Z0-9_]+$/.test(error.message) ? error.message
        : 'DURABILITY_INTERNAL_ERROR', automaticPromotion: false, production: 'HOLD',
      publicRelease: 'HOLD', g5: 'HOLD' })}\n`);
    process.exitCode = 1;
  }
}
