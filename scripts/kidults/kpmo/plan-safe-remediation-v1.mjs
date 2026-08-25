#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function worstState(receipt) {
  const states = receipt.states || {};
  if (states.internal_control_state !== 'VERIFIED_PASS') return 'RED';
  if (states.external_empirical_state !== 'VERIFIED_PASS') return 'HOLD';
  if (states.release_state !== 'VERIFIED_PASS') return 'HOLD';
  return 'VERIFIED_PASS';
}

export function planSafeRemediation(receipt, policy) {
  const failedIds = (receipt.checks || [])
    .filter((check) => check.required !== false && check.state !== 'VERIFIED_PASS')
    .map((check) => check.id)
    .sort();
  const ephemeral = new Set([
    'SOURCE_POOL_FOUNDATION_BUILD',
    'SOURCE_POOL_FOUNDATION_VALIDATE',
    'SYNTHETIC_FAIL_CLOSED_E2E_BUILD',
    'SYNTHETIC_FAIL_CLOSED_E2E_VALIDATE'
  ]);
  const safeEphemeral = failedIds.filter((id) => ephemeral.has(id));
  const persistent = failedIds.filter((id) => !ephemeral.has(id));
  const externalHolds = (receipt.unresolved_gates || []).map((gate) => gate.id).sort();
  const derivedOverall = worstState(receipt);
  const receiptOverall = receipt.states?.overall_state || 'UNKNOWN';
  if (derivedOverall !== receiptOverall) throw new Error(`Receipt state mismatch: declared ${receiptOverall}, derived ${derivedOverall}`);

  const disposition = persistent.length
    ? 'KPMO_ISOLATED_DRAFT_FIX_REQUIRED'
    : safeEphemeral.length
      ? 'EPHEMERAL_REBUILD_AND_REVALIDATE_ONLY'
      : externalHolds.length
        ? 'AUTHORITY_HOLD_NO_AUTOMATIC_MUTATION'
        : 'NO_ACTION';

  const stablePlan = {
    schema_version: '1.0.0',
    plan_type: 'KIDULTS_SAFE_REMEDIATION_PACKET',
    policy_id: policy.id,
    policy_version: policy.version,
    source_sha: receipt.source?.sha || 'UNAVAILABLE',
    incident_id: receipt.incident_id || 'UNAVAILABLE',
    disposition,
    failed_check_ids: failedIds,
    ephemeral_revalidation_ids: safeEphemeral,
    persistent_fix_ids: persistent,
    external_authority_holds: externalHolds,
    execution: {
      workflow_repository_mutation_allowed: false,
      persistent_executor: policy.immediate_improvement.persistent_fix_executor,
      persistent_mode: policy.immediate_improvement.persistent_fix_mode,
      direct_main_write: false,
      auto_merge: false,
      production_or_g5_effect: 'NONE'
    },
    circuit_breaker: {
      max_attempts: policy.immediate_improvement.max_attempts_per_incident,
      opens_after_failed_attempts: policy.immediate_improvement.circuit_breaker_after_attempts,
      current_attempt: Number(process.env.KPMO_REMEDIATION_ATTEMPT || 0),
      state: Number(process.env.KPMO_REMEDIATION_ATTEMPT || 0) >= policy.immediate_improvement.circuit_breaker_after_attempts
        ? 'CIRCUIT_OPEN_MANUAL_HOLD'
        : 'CLOSED'
    },
    empirical_truth_effect: 'NONE'
  };
  return { ...stablePlan, plan_digest: sha256(stableJson(stablePlan)) };
}

function parseArgs(argv) {
  const config = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--receipt') config.receipt = path.resolve(argv[++i]);
    else if (argv[i] === '--policy') config.policy = path.resolve(argv[++i]);
    else if (argv[i] === '--output') config.output = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!config.receipt || !config.policy || !config.output) throw new Error('Required: --receipt, --policy, --output');
  return config;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const receipt = JSON.parse(fs.readFileSync(config.receipt, 'utf8'));
  const policy = JSON.parse(fs.readFileSync(config.policy, 'utf8'));
  const plan = planSafeRemediation(receipt, policy);
  fs.mkdirSync(path.dirname(config.output), { recursive: true });
  fs.writeFileSync(config.output, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(plan, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
