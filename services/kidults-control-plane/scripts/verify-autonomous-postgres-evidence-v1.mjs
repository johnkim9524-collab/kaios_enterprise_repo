#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  AUTONOMOUS_POSTGRES_MIGRATIONS_V1,
  verifyAutonomousPostgresEvidenceReceipt,
} from '../src/common-control/autonomous-postgres-evidence-receipt-v1.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(serviceRoot, '..', '..');
const SHA = /^[0-9a-f]{40}$/;
function fail(code) { throw new Error(code); }
function sha256(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }

export function readSafeEvidenceReceipt(receiptPath) {
  if (!path.isAbsolute(receiptPath ?? '')) fail('POSTGRES_EVIDENCE_RECEIPT_ABSOLUTE_PATH_REQUIRED');
  const resolved = path.resolve(receiptPath);
  const relative = path.relative(repositoryRoot, resolved);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..')) {
    fail('POSTGRES_EVIDENCE_RECEIPT_INSIDE_REPOSITORY_DENIED');
  }
  const stat = lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(resolved) !== resolved) {
    fail('POSTGRES_EVIDENCE_RECEIPT_FILE_INVALID');
  }
  if (stat.size < 2 || stat.size > 65536) fail('POSTGRES_EVIDENCE_RECEIPT_SIZE_INVALID');
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
    fail('POSTGRES_EVIDENCE_RECEIPT_PERMISSIONS_INVALID');
  }
  if (process.platform !== 'win32' && typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    fail('POSTGRES_EVIDENCE_RECEIPT_OWNER_INVALID');
  }
  try { return JSON.parse(readFileSync(resolved, 'utf8')); }
  catch { fail('POSTGRES_EVIDENCE_RECEIPT_JSON_INVALID'); }
}

function exactHead(expectedSha) {
  if (!SHA.test(expectedSha ?? '')) fail('POSTGRES_EVIDENCE_EXPECTED_SHA_INVALID');
  const git = args => execFileSync('/usr/bin/git', ['--no-replace-objects', '-c',
    'core.fsmonitor=false', ...args], { cwd: repositoryRoot, encoding: 'utf8', timeout: 10000,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC', GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' } }).trim();
  if (git(['rev-parse', 'HEAD']) !== expectedSha) fail('POSTGRES_EVIDENCE_CHECKOUT_MISMATCH');
  if (git(['status', '--porcelain=v1', '--untracked-files=all']) !== '') {
    fail('POSTGRES_EVIDENCE_DIRTY_SOURCE');
  }
  const origin = git(['remote', 'get-url', 'origin']);
  if (!['https://github.com/johnkim9524-collab/kaios_enterprise_repo.git',
    'https://github.com/johnkim9524-collab/kaios_enterprise_repo'].includes(origin)) {
    fail('POSTGRES_EVIDENCE_ORIGIN_INVALID');
  }
}

function migrationDigest() {
  return sha256(Buffer.concat(AUTONOMOUS_POSTGRES_MIGRATIONS_V1.map(file =>
    readFileSync(path.join(serviceRoot, 'migrations/postgres', file)))));
}

export function verifyEvidenceReceiptAgainstRepository({ receiptPath, expectedSha }) {
  exactHead(expectedSha);
  const receipt = verifyAutonomousPostgresEvidenceReceipt(readSafeEvidenceReceipt(receiptPath), {
    expectedSourceSha: expectedSha, expectedMigrationDigest: migrationDigest(),
  });
  return {
    id: 'kidults-autonomous-postgres-evidence-independent-verification-v1',
    state: 'VERIFIED_PASS_READ_ONLY', exactSourceSha: expectedSha,
    evidenceReceiptDigest: receipt.receiptDigest,
    migrationDigest: receipt.migrationDigest, authorityGranted: false,
    externalEgress: false, credentialMaterialRead: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--receipt' || args[2] !== '--expected-sha') {
    fail('POSTGRES_EVIDENCE_VERIFY_ARGUMENTS_INVALID');
  }
  console.log(JSON.stringify(verifyEvidenceReceiptAgainstRepository({
    receiptPath: args[1], expectedSha: args[3],
  }), null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(JSON.stringify({
      id: 'kidults-autonomous-postgres-evidence-independent-verification-v1',
      state: 'VERIFIED_FAIL', reason: /^POSTGRES_EVIDENCE_[A-Z0-9_]+$/.test(error.message)
        ? error.message : 'POSTGRES_EVIDENCE_VERIFY_INTERNAL_ERROR',
      authorityGranted: false, credentialMaterialRead: false,
      production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
    }));
    process.exitCode = 1;
  }
}
