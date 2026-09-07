import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script = fs.readFileSync('scripts/staging/verify-ephemeral-postgres-runtime-v1.sh', 'utf8');
const workflow = fs.readFileSync('.github/workflows/kir-ephemeral-postgres-runtime-v1.yml', 'utf8');

test('operational verifier exercises physical PostgreSQL recovery instead of a synthetic adapter', () => {
  for (const required of [
    'initdb', 'pg_basebackup', 'pg_ctl', 'pg_isready', 'psql',
    'archive_mode = on', 'recovery.signal', 'recovery_target_time',
    'recovery_target_action', 'SELECT NOT pg_is_in_recovery()'
  ]) assert.match(script, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(script, /FAKE_|mock|synthetic/i);
});

test('receipt binds exact commit and tree while preserving protected holds', () => {
  for (const required of [
    'source_sha', 'source_tree', 'connect_verified', 'reconnect_verified',
    'restart_verified', 'transaction_rollback_verified', 'persistence_verified',
    'wal_archive_verified', 'pitr_compatibility_verified', 'recovery_verified',
    '"production": "HOLD"', '"public_release": "HOLD"', '"g5": "HOLD"'
  ]) assert.ok(script.includes(required), `missing ${required}`);
});

test('workflow is automatic, bounded, exact-checkout, and retains the runtime receipt', () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /timeout-minutes: 15/);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(workflow, /verify-ephemeral-postgres-runtime-v1\.sh/);
  assert.match(workflow, /if-no-files-found: error/);
});
