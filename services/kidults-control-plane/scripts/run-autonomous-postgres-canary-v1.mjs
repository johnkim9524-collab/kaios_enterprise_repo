#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { digestObject } from '../src/common-control/canonical-v1.mjs';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const runnerPath = path.join(scriptRoot, 'autonomous-postgres-evidence-v1.mjs');
const verifierPath = path.join(scriptRoot, 'verify-autonomous-postgres-evidence-v1.mjs');
const CONFIRMATION = 'EPHEMERAL_NON_PRODUCTION_APPROVED';
function fail(code) { throw new Error(code); }

export function canaryRunnerEnvironment({ dsn, confirmation }) {
  if (typeof dsn !== 'string' || dsn.length < 1) fail('POSTGRES_CANARY_DSN_REQUIRED');
  if (confirmation !== CONFIRMATION) fail('POSTGRES_CANARY_CONFIRMATION_REQUIRED');
  return { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC',
    KIDULTS_EPHEMERAL_POSTGRES_DSN: dsn,
    KIDULTS_EPHEMERAL_POSTGRES_CONFIRM: confirmation };
}

export function canaryVerifierEnvironment() {
  return { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC' };
}

export function runGovernedPostgresCanary({ dsn, confirmation, expectedSha, outputDirectory }) {
  const runner = spawnSync(process.execPath, [runnerPath, '--expected-sha', expectedSha,
    '--output-dir', outputDirectory], { encoding: 'utf8', timeout: 180000,
    maxBuffer: 4 * 1024 * 1024, env: canaryRunnerEnvironment({ dsn, confirmation }) });
  if (runner.error || runner.signal || runner.status !== 0) fail('POSTGRES_CANARY_RUNNER_FAILED');
  const receiptPath = path.join(outputDirectory, 'receipt.json');
  const verifier = spawnSync(process.execPath, [verifierPath, '--receipt', receiptPath,
    '--expected-sha', expectedSha], { encoding: 'utf8', timeout: 30000,
    maxBuffer: 1024 * 1024, env: canaryVerifierEnvironment() });
  if (verifier.error || verifier.signal || verifier.status !== 0) {
    fail('POSTGRES_CANARY_INDEPENDENT_VERIFICATION_FAILED');
  }
  let verified;
  try { verified = JSON.parse(verifier.stdout); }
  catch { fail('POSTGRES_CANARY_VERIFIER_OUTPUT_INVALID'); }
  if (verified.state !== 'VERIFIED_PASS_READ_ONLY'
    || verified.exactSourceSha !== expectedSha || verified.authorityGranted !== false
    || verified.externalEgress !== false || verified.credentialMaterialRead !== false
    || verified.production !== 'HOLD' || verified.publicRelease !== 'HOLD'
    || verified.g5 !== 'HOLD') fail('POSTGRES_CANARY_VERIFIER_RESULT_INVALID');
  const unsigned = {
    id: 'kidults-autonomous-postgres-governed-canary-v1', version: '1.0.0',
    state: 'VERIFIED_PASS_EPHEMERAL_ONLY', exactSourceSha: expectedSha,
    evidenceReceiptDigest: verified.evidenceReceiptDigest,
    migrationDigest: verified.migrationDigest, runnerExitCode: 0, verifierExitCode: 0,
    credentialForwardedOnlyToRunner: true, credentialForwardedToVerifier: false,
    authorityGranted: false, externalEgress: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return { ...unsigned, receiptDigest: digestObject(unsigned) };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--expected-sha' || args[2] !== '--output-dir') {
    fail('POSTGRES_CANARY_ARGUMENTS_INVALID');
  }
  console.log(JSON.stringify(runGovernedPostgresCanary({
    dsn: process.env.KIDULTS_EPHEMERAL_POSTGRES_DSN,
    confirmation: process.env.KIDULTS_EPHEMERAL_POSTGRES_CONFIRM,
    expectedSha: args[1], outputDirectory: args[3],
  }), null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(JSON.stringify({ id: 'kidults-autonomous-postgres-governed-canary-v1',
      state: 'HOLD', reason: /^POSTGRES_CANARY_[A-Z0-9_]+$/.test(error.message)
        ? error.message : 'POSTGRES_CANARY_INTERNAL_ERROR', authorityGranted: false,
      credentialMaterialRetained: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' }));
    process.exitCode = 1;
  }
}
