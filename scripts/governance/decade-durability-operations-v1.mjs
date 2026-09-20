#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const ISO = value => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const STATES = new Set(['VERIFIED', 'HOLD', 'BLOCKED', 'UNKNOWN']);
const ASSET_FIELDS = ['id', 'durabilityClass', 'rpo', 'rto', 'retention', 'replication',
  'restoreTest', 'failureDomains', 'costOwner', 'migrationPath'];
const CLASSES = new Set(['D10_IRREPLACEABLE', 'D1_RECONSTRUCTIBLE', 'D0_EPHEMERAL']);
function fail(code) { throw new Error(code); }
function ageMs(now, timestamp) { return Date.parse(now) - Date.parse(timestamp); }
function days(value) { return value * 24 * 60 * 60 * 1000; }
function hours(value) { return value * 60 * 60 * 1000; }
function exactKeys(value, keys) {
  return value && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort())
    === JSON.stringify([...keys].sort());
}
function validControl(control) {
  return exactKeys(control, ['id', 'state', 'observedAt', 'evidenceRef'])
    && typeof control.id === 'string' && STATES.has(control.state) && ISO(control.observedAt)
    && typeof control.evidenceRef === 'string' && control.evidenceRef.length > 0;
}
function validAsset(asset) {
  return exactKeys(asset, ASSET_FIELDS) && ASSET_FIELDS.every(field => {
    const value = asset[field];
    return field === 'failureDomains' ? Array.isArray(value) && value.length > 0
      : typeof value === 'string' && value.length > 0;
  }) && CLASSES.has(asset.durabilityClass);
}

export function evaluateDurabilityOperations(input, contract, { now }) {
  const inputKeys = ['contractId', 'version', 'sourceSha', 'sourceTree', 'controls', 'assets',
    'restoreDrill', 'identityRecovery', 'checkpoint', 'retention', 'errors'];
  if (!exactKeys(input, inputKeys) || input.contractId !== 'kidults-decade-durability-operations-evidence-v1'
    || input.version !== '1.0.0' || !SHA.test(input.sourceSha) || !SHA.test(input.sourceTree)
    || !ISO(now) || !Array.isArray(input.controls) || !input.controls.every(validControl)
    || !Array.isArray(input.assets) || !Array.isArray(input.errors)
    || contract?.id !== 'kidults-decade-durability-operations-contract-v1') {
    fail('DURABILITY_OPERATIONS_EVIDENCE_INVALID');
  }
  const controlMap = new Map(input.controls.map(control => [control.id, control]));
  const failures = [];
  const alerts = [];
  for (const capability of contract.capabilities) {
    const control = controlMap.get(capability.id);
    if (!control || control.state !== 'VERIFIED') failures.push(`CONTROL_${capability.id}_NOT_VERIFIED`);
    else {
      const controlAge = ageMs(now, control.observedAt);
      if (controlAge < 0 || controlAge > hours(contract.alerts.checkpoint_stale_hours)) {
        failures.push(`CONTROL_${capability.id}_STALE`);
        alerts.push({ severity: 'CRITICAL', code: `CONTROL_${capability.id}_STALE` });
      }
    }
  }
  const checkpointAge = ageMs(now, input.checkpoint?.completedAt ?? '');
  if (input.checkpoint?.state !== 'VERIFIED' || input.checkpoint.sourceSha !== input.sourceSha
    || input.checkpoint.sourceTree !== input.sourceTree || !ISO(input.checkpoint.completedAt)
    || checkpointAge < 0 || checkpointAge > hours(contract.alerts.checkpoint_stale_hours)) {
    failures.push('CURRENT_CHECKPOINT_MISSING');
    alerts.push({ severity: 'CRITICAL', code: 'CHECKPOINT_STALE_OR_INVALID' });
  }
  const restoreAge = ageMs(now, input.restoreDrill?.completedAt ?? '');
  if (input.restoreDrill?.state !== 'VERIFIED' || input.restoreDrill.sourceSha !== input.sourceSha
    || input.restoreDrill.sourceTree !== input.sourceTree || input.restoreDrill.isolated !== true
    || restoreAge < 0 || restoreAge > days(93)) failures.push('CURRENT_RESTORE_DRILL_MISSING');
  else if (restoreAge > days(93 - contract.alerts.restore_due_warning_days)) {
    alerts.push({ severity: 'WARNING', code: 'RESTORE_DRILL_DUE_SOON' });
  }
  const identityAge = ageMs(now, input.identityRecovery?.completedAt ?? '');
  const requiredIdentity = contract.identity_recovery.required_evidence;
  if (input.identityRecovery?.state !== 'VERIFIED' || !ISO(input.identityRecovery.completedAt)
    || identityAge < 0 || identityAge > days(366) || !Array.isArray(input.identityRecovery.controls)
    || !requiredIdentity.every(item => input.identityRecovery.controls.includes(item))) {
    failures.push('IDENTITY_AND_KEY_RECOVERY_NOT_VERIFIED');
  }
  const invalidAssets = input.assets.filter(asset => !validAsset(asset));
  if (input.assets.length === 0 || invalidAssets.length > 0) {
    failures.push('DURABILITY_CLASSIFICATION_INCOMPLETE');
    alerts.push({ severity: 'CRITICAL', code: 'UNCLASSIFIED_OR_INVALID_ASSET', count: invalidAssets.length });
  }
  if (input.retention?.state !== 'VERIFIED' || !ISO(input.retention.minimumRetainUntil)
    || Date.parse(input.retention.minimumRetainUntil) - Date.parse(now) < days(3650)) {
    failures.push('TEN_YEAR_RETENTION_WINDOW_NOT_VERIFIED');
    alerts.push({ severity: 'CRITICAL', code: 'RETENTION_WINDOW_INSUFFICIENT' });
  }
  if (input.errors.length > 0) failures.push('UNVERIFIED_ERRORS_PRESENT');
  const state = failures.length === 0 ? 'OPERATING_TRANSITION_READY' : 'HOLD';
  return Object.freeze({
    contractId: 'kidults-decade-durability-operations-assessment-v1', version: '1.0.0',
    state, sourceSha: input.sourceSha, sourceTree: input.sourceTree,
    dashboard: { controlsVerified: contract.capabilities.filter(item => {
      const control = controlMap.get(item.id);
      const controlAge = ageMs(now, control?.observedAt ?? '');
      return control?.state === 'VERIFIED' && controlAge >= 0
        && controlAge <= hours(contract.alerts.checkpoint_stale_hours);
    }).length, controlsRequired: contract.capabilities.length,
      assetsClassified: input.assets.length - invalidAssets.length, assetsTotal: input.assets.length,
      checkpointCompletedAt: input.checkpoint?.completedAt ?? null,
      restoreCompletedAt: input.restoreDrill?.completedAt ?? null,
      identityRecoveryCompletedAt: input.identityRecovery?.completedAt ?? null,
      minimumRetainUntil: input.retention?.minimumRetainUntil ?? null },
    alerts, failures: [...new Set(failures)], automaticPromotion: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) fail('DURABILITY_OPERATIONS_ARGUMENTS_INVALID');
  return process.argv[index + 1];
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = evaluateDurabilityOperations(JSON.parse(readFileSync(argument('--evidence'), 'utf8')),
      JSON.parse(readFileSync(argument('--contract'), 'utf8')), { now: argument('--now') });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.state !== 'OPERATING_TRANSITION_READY') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ contractId: 'kidults-decade-durability-operations-assessment-v1',
      state: 'HOLD', reason: /^[A-Z0-9_]+$/.test(error.message) ? error.message
        : 'DURABILITY_OPERATIONS_INTERNAL_ERROR', automaticPromotion: false,
      production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' })}\n`);
    process.exitCode = 1;
  }
}
