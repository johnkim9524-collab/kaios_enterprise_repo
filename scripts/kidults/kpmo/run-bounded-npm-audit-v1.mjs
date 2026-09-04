#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = '/tmp/kidults-security-r1';
const AUDIT_DIR = path.join(ROOT, 'npm-audit');
const STATUS_PATH = path.join(ROOT, 'npm-audit-status.ndjson');
const SUMMARY_PATH = path.join(ROOT, 'npm-audit-summary.json');
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 45_000;
const MAX_BUFFER = 20 * 1024 * 1024;

const req = (value, code) => { if (!value) throw new Error(code); };
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function classifyAuditPayload(raw, exitCode = 0, timedOut = false) {
  if (timedOut) return { valid: false, retryable: true, reason: 'TIMEOUT', exit_code: exitCode };
  let payload;
  try { payload = JSON.parse(String(raw || '')); }
  catch { return { valid: false, retryable: true, reason: 'INVALID_JSON', exit_code: exitCode }; }
  if (payload?.error || !payload?.metadata || !payload.metadata.vulnerabilities) {
    const code = payload?.error?.code || payload?.error?.summary || 'AUDIT_RESPONSE_UNAVAILABLE';
    return { valid: false, retryable: true, reason: String(code), exit_code: exitCode, payload };
  }
  const v = payload.metadata.vulnerabilities;
  const high = Number(v.high || 0);
  const critical = Number(v.critical || 0);
  const countsValid = Number.isFinite(high) && Number.isFinite(critical) && high >= 0 && critical >= 0;
  if (!countsValid) return { valid: false, retryable: false, reason: 'INVALID_VULNERABILITY_COUNTS', exit_code: exitCode, payload };
  return { valid: true, retryable: false, reason: 'VALID_AUDIT_RESPONSE', exit_code: exitCode, high, critical, payload };
}

export function selectAuditTargets(lockPaths) {
  const byDirectory = new Map();
  for (const raw of lockPaths) {
    const lockfile = String(raw || '').trim();
    if (!lockfile) continue;
    const base = path.basename(lockfile);
    if (!['package-lock.json', 'npm-shrinkwrap.json'].includes(base)) continue;
    const cwd = path.dirname(lockfile);
    const prior = byDirectory.get(cwd);
    if (!prior || base === 'npm-shrinkwrap.json') byDirectory.set(cwd, { cwd, lockfile, lock_type: base === 'npm-shrinkwrap.json' ? 'NPM_SHRINKWRAP' : 'PACKAGE_LOCK' });
  }
  return [...byDirectory.values()].sort((a, b) => a.cwd.localeCompare(b.cwd) || a.lockfile.localeCompare(b.lockfile));
}

function safeName(target) {
  const raw = target.cwd === '.' ? 'root' : target.cwd;
  return raw.replace(/[^A-Za-z0-9_-]/g, '_');
}

function auditOne(target) {
  const attempts = [];
  let final = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = spawnSync('npm', ['audit', '--audit-level=high', '--json'], {
      cwd: target.cwd,
      encoding: 'utf8',
      timeout: ATTEMPT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      env: {
        ...process.env,
        npm_config_fetch_retries: '0',
        npm_config_fetch_retry_mintimeout: '1000',
        npm_config_fetch_retry_maxtimeout: '1000',
        npm_config_fetch_timeout: '30000'
      }
    });
    const exitCode = Number.isInteger(result.status) ? result.status : 124;
    const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM';
    const classified = classifyAuditPayload(result.stdout, exitCode, timedOut);
    attempts.push({ attempt, exit_code: exitCode, timed_out: timedOut, valid: classified.valid, retryable: classified.retryable, reason: classified.reason, stderr_tail: String(result.stderr || '').slice(-500) });
    if (classified.valid || !classified.retryable || attempt === MAX_ATTEMPTS) { final = classified; break; }
    sleep(attempt === 1 ? 2_000 : 5_000);
  }
  req(final, `AUDIT_FINAL_STATE_MISSING:${target.lockfile}`);
  return { ...target, attempts, final };
}

function selfTest() {
  const clean = classifyAuditPayload(JSON.stringify({ metadata: { vulnerabilities: { high: 0, critical: 0 } } }), 0, false);
  req(clean.valid && clean.high === 0 && clean.critical === 0 && !clean.retryable, 'SELF_CLEAN');
  const vulnerable = classifyAuditPayload(JSON.stringify({ metadata: { vulnerabilities: { high: 2, critical: 1 } } }), 1, false);
  req(vulnerable.valid && vulnerable.high === 2 && vulnerable.critical === 1 && !vulnerable.retryable, 'SELF_VULNERABLE');
  const unavailable = classifyAuditPayload(JSON.stringify({ error: { code: 'E503', summary: 'Service Unavailable' } }), 1, false);
  req(!unavailable.valid && unavailable.retryable && unavailable.reason === 'E503', 'SELF_503');
  const malformed = classifyAuditPayload('{bad', 1, false);
  req(!malformed.valid && malformed.retryable && malformed.reason === 'INVALID_JSON', 'SELF_MALFORMED');
  const timeout = classifyAuditPayload('', 124, true);
  req(!timeout.valid && timeout.retryable && timeout.reason === 'TIMEOUT', 'SELF_TIMEOUT');
  const invalidCounts = classifyAuditPayload(JSON.stringify({ metadata: { vulnerabilities: { high: -1, critical: 0 } } }), 1, false);
  req(!invalidCounts.valid && !invalidCounts.retryable, 'SELF_INVALID_COUNTS');
  const targets = selectAuditTargets(['package-lock.json', 'npm-shrinkwrap.json', 'services/a/package-lock.json', 'services/b/npm-shrinkwrap.json']);
  req(targets.length === 3, 'SELF_TARGET_COUNT');
  req(targets.find(x => x.cwd === '.')?.lock_type === 'NPM_SHRINKWRAP', 'SELF_SHRINKWRAP_PRECEDENCE');
  req(targets.some(x => x.lockfile === 'services/a/package-lock.json') && targets.some(x => x.lockfile === 'services/b/npm-shrinkwrap.json'), 'SELF_NESTED_TARGETS');
  console.log(JSON.stringify({ test: 'BOUNDED_NPM_AUDIT_V1', state: 'VERIFIED_PASS', max_attempts: MAX_ATTEMPTS, attempt_timeout_ms: ATTEMPT_TIMEOUT_MS, transient_only_retry: true, vulnerability_response_not_retried: true, final_unavailable_fail_closed: true, npm_shrinkwrap_included: true, one_audit_per_directory: true, shrinkwrap_precedence: true, negative_cases: 9 }));
}

function main() {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  fs.writeFileSync(STATUS_PATH, '');
  const listed = spawnSync('git', ['ls-files', '*package-lock.json', '*npm-shrinkwrap.json'], { encoding: 'utf8', maxBuffer: MAX_BUFFER });
  req(listed.status === 0, 'LOCKFILE_DISCOVERY_FAILED');
  const paths = String(listed.stdout || '').split('\n').map(x => x.trim()).filter(Boolean);
  const targets = selectAuditTargets(paths);
  const safeNames = targets.map(safeName);
  req(new Set(safeNames).size === safeNames.length, 'AUDIT_OUTPUT_NAME_COLLISION');
  const records = [];
  for (const target of targets) {
    const record = auditOne(target);
    records.push(record);
    const output = record.final?.payload ?? { error: { code: record.final?.reason || 'UNAVAILABLE_AFTER_RETRY' } };
    fs.writeFileSync(path.join(AUDIT_DIR, `${safeName(target)}.json`), `${JSON.stringify(output, null, 2)}\n`);
    fs.appendFileSync(STATUS_PATH, `${JSON.stringify({ lockfile: target.lockfile, lock_type: target.lock_type, cwd: target.cwd, attempts: record.attempts.length, final_exit_code: record.final.exit_code, valid_response: record.final.valid, retry_exhausted: !record.final.valid && record.final.retryable, final_reason: record.final.reason })}\n`);
  }

  let high = 0, critical = 0, unavailable = 0, invalid = 0, anomalousNonzero = 0, retryCount = 0;
  for (const record of records) {
    retryCount += Math.max(0, record.attempts.length - 1);
    if (!record.final.valid) { if (record.final.retryable) unavailable += 1; else invalid += 1; continue; }
    high += Number(record.final.high || 0);
    critical += Number(record.final.critical || 0);
    if (record.final.exit_code !== 0 && Number(record.final.high || 0) === 0 && Number(record.final.critical || 0) === 0) anomalousNonzero += 1;
  }
  const summary = { audit_file_count: records.length, discovered_lock_artifact_count: paths.length, audited_directory_count: targets.length, high, critical, invalid, unavailable, anomalous_nonzero_exit: anomalousNonzero, retry_count: retryCount, max_attempts_per_lockfile: MAX_ATTEMPTS, attempt_timeout_ms: ATTEMPT_TIMEOUT_MS, npm_internal_fetch_retries: 0, retry_policy: 'TRANSIENT_INVALID_ERROR_OR_TIMEOUT_ONLY', lock_precedence: 'NPM_SHRINKWRAP_OVER_PACKAGE_LOCK_PER_DIRECTORY', scope: 'FULL_NPM_LOCKED_DIRECTORY_INCLUDING_DEV' };
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(summary);
  if (invalid || unavailable || high || critical || anomalousNonzero) process.exit(1);
}

if (process.argv.includes('--self-test')) selfTest();
else main();
