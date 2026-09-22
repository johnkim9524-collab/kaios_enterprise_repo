import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { PostgresTransitionLedger } from '../../../scripts/kidults/staging-operations/lib/postgres-transition-ledger-v1.mjs';
import { AutonomousRuntime } from '../../../scripts/kidults/staging-operations/lib/autonomous-runtime-v1.mjs';
import { ShadowFetchBroker } from '../../../scripts/kidults/staging-operations/lib/provider-control-v1.mjs';
import { AwsDurabilityBoundary, MockImmutableStore, ephemeralEd25519 } from '../../../scripts/kidults/staging-operations/lib/aws-durability-v1.mjs';
if (process.env.KPMO_POSTGRES_CANARY_SCOPE !== 'ISOLATED_DOCKER_ONLY' || process.env.PGHOST !== 'postgres') throw new Error('ISOLATED_CANARY_ONLY');
const require = createRequire(new URL('./postgres-live-deps/package.json', import.meta.url));
const { Pool } = require('pg');
const schema = `kpmo_${randomUUID().replaceAll('-', '')}`;
const config = { host: 'postgres', database: 'kpmo_canary', user: 'postgres', password: 'isolated-test-fixture-only', max: 8, statement_timeout: 4000, query_timeout: 5000 };
const admin = new Pool(config);
await admin.query(`CREATE SCHEMA ${schema}`);
const scoped = { ...config, options: `-c search_path=${schema}` };
const pool = new Pool(scoped);
const ledger = new PostgresTransitionLedger({ query: pool.query.bind(pool) });
const findings = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function check(name, fn) {
  try { await fn(); findings.push({ name, state: 'PASS' }); }
  catch (error) { findings.push({ name, state: 'FAIL', error: error.message, code: error.code ?? null }); }
}
const token = (task, ttl = 10000) => ledger.acquire(task, Date.now(), ttl);
await ledger.initialize();
await check('eight_workers_one_lease', async () => {
  const leases = await Promise.all(Array.from({ length: 8 }, () => token('race')));
  assert.equal(leases.filter(Boolean).length, 1);
});
await check('repeated_retry_states_append', async () => {
  const lease = await token('retry');
  await ledger.transition('retry', lease, 'RETRY_WAIT', { attempt: 1 });
  await ledger.transition('retry', lease, 'RETRY_WAIT', { attempt: 2 });
  assert.equal((await ledger.rows('retry')).length, 2);
});
await check('expired_worker_rejected_without_reacquisition', async () => {
  const lease = await token('expired', 30); await sleep(100);
  await assert.rejects(ledger.transition('expired', lease, 'COMPLETE_VERIFIED'), /LEASE_FENCE/);
  assert.equal((await ledger.rows('expired')).length, 0);
});
await check('caller_future_clock_cannot_steal_lease', async () => {
  assert.ok(await token('future', 60000));
  assert.equal(await ledger.acquire('future', Date.now() + 86400000, 10000), null);
});
await check('stale_generation_and_release_rejected', async () => {
  const old = await token('reacquire', 30); await sleep(100);
  const current = await token('reacquire');
  assert.equal(BigInt(current.generation), BigInt(old.generation) + 1n);
  await assert.rejects(ledger.transition('reacquire', old, 'COMPLETE_VERIFIED'), /LEASE_FENCE/);
  assert.equal(await ledger.release('reacquire', old), false);
  await ledger.transition('reacquire', current, 'COMPLETE_VERIFIED');
  assert.equal(await token('reacquire'), null);
});
await check('concurrent_terminal_writes_have_one_winner', async () => {
  const lease = await token('terminal');
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => ledger.transition('terminal', lease, 'COMPLETE_VERIFIED')));
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal((await ledger.rows('terminal')).length, 1);
});
await check('expiry_rechecked_after_lock_wait', async () => {
  const lease = await token('locked-expiry', 200);
  const blocker = await pool.connect();
  try {
    await blocker.query('BEGIN');
    await blocker.query("SELECT * FROM kidults_staging_task_lease WHERE task_id='locked-expiry' FOR UPDATE");
    const pending = ledger.transition('locked-expiry', lease, 'COMPLETE_VERIFIED');
    const outcome = pending.then(value => ({ value }), error => ({ error }));
    await sleep(300); await blocker.query('COMMIT');
    assert.match((await outcome).error?.message ?? '', /LEASE_FENCE/);
    assert.equal((await ledger.rows('locked-expiry')).length, 0);
  } finally { await blocker.query('ROLLBACK'); blocker.release(); }
});
await check('terminal_append_failure_rolls_back_lease_mutation', async () => {
  await pool.query("CREATE FUNCTION reject_terminal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.task_id='rollback' AND NEW.state='COMPLETE_VERIFIED' THEN RAISE EXCEPTION 'INJECTED_APPEND_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_terminal BEFORE INSERT ON kidults_staging_transition FOR EACH ROW EXECUTE FUNCTION reject_terminal()");
  const lease = await token('rollback');
  await assert.rejects(ledger.transition('rollback', lease, 'COMPLETE_VERIFIED'), /INJECTED_APPEND_FAILURE/);
  assert.equal((await pool.query("SELECT terminal FROM kidults_staging_task_lease WHERE task_id='rollback'")).rows[0].terminal, false);
  assert.equal((await ledger.rows('rollback')).length, 0);
});
const mainSha = '1027c7e4f98469a24633811f8a9d0074d0877193';
const request = task_id => ({ task_id, provider_id: 'TEST_FIXTURE_ONLY', policy_version: 'TEST_ONLY', rights: { snapshot_id: 'TEST_ONLY' }, approval_a: { fixture_only: true }, approval_z: { fixture_only: true } });
const testBrokers = [];
function runtimeFor(broker, selectedLedger = ledger) {
  testBrokers.push(broker);
  return new AutonomousRuntime({ now: Date.now, ledger: selectedLedger, leaseTtlMs: 10000, broker,
    providerControl: { decide: async () => ({ decision: 'ALLOW_SHADOW', decision_id: 'TEST_ONLY_NOT_AUTHORITY' }) },
    durability: new AwsDurabilityBoundary({ store: new MockImmutableStore(), ...ephemeralEd25519(), mainSha }) });
}
await check('runtime_real_postgres_two_retries_then_terminal', async () => {
  const broker = new ShadowFetchBroker({ fixture: { synthetic: true }, failAttempts: 2 });
  assert.equal((await runtimeFor(broker).tick(request('runtime-retry'))).state, 'COMPLETE_VERIFIED');
  const rows = await ledger.rows('runtime-retry');
  assert.equal(rows.filter(row => row.state === 'RETRY_WAIT').length, 2);
  assert.equal(rows.filter(row => row.state === 'COMPLETE_VERIFIED').length, 1);
  assert.equal(broker.calls, 3);
});
await check('ledger_failure_does_not_repeat_successful_fetch', async () => {
  const failing = new PostgresTransitionLedger({ query: async (sql, values) => {
    if (values?.[3] === 'BROKERED_SHADOW') throw new Error('INJECTED_LEDGER_FAILURE');
    return pool.query(sql, values);
  } });
  const broker = new ShadowFetchBroker({ fixture: { synthetic: true } });
  await assert.rejects(runtimeFor(broker, failing).tick(request('no-refetch')), /INJECTED_LEDGER_FAILURE/);
  assert.equal(broker.calls, 1);
  assert.equal((await ledger.rows('no-refetch')).some(row => row.state === 'COMPLETE_VERIFIED'), false);
});
await check('abrupt_worker_exit_then_recovery_preserves_fencing', async () => {
  const script = `import fs from 'node:fs'; import { createRequire } from 'node:module';
    import { PostgresTransitionLedger } from './scripts/kidults/staging-operations/lib/postgres-transition-ledger-v1.mjs';
    const require=createRequire(process.cwd()+'/tests/kidults/staging-operations/postgres-live-deps/package.json');
    const {Client}=require('pg'); const c=new Client(JSON.parse(process.argv[1])); await c.connect();
    const l=new PostgresTransitionLedger({query:c.query.bind(c)});
    const token=await l.acquire('worker-exit',Date.now(),100); fs.writeSync(1,JSON.stringify(token)); process.exit(0);`;
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(scoped)], { timeout: 5000 });
  const old = JSON.parse(stdout); await sleep(200);
  const current = await token('worker-exit'); assert.ok(current);
  await assert.rejects(ledger.transition('worker-exit', old, 'COMPLETE_VERIFIED'), /LEASE_FENCE/);
  await ledger.transition('worker-exit', current, 'COMPLETE_VERIFIED');
});
await check('legacy_schema_requires_explicit_migration_without_data_loss', async () => {
  const legacy = `${schema}_legacy`; const c = await admin.connect();
  try {
    await c.query(`CREATE SCHEMA ${legacy}; SET search_path TO ${legacy}; CREATE TABLE kidults_staging_task_lease (task_id text PRIMARY KEY, lease_id text); INSERT INTO kidults_staging_task_lease VALUES ('preserve','original')`);
    const oldLedger = new PostgresTransitionLedger({ query: c.query.bind(c) });
    await assert.rejects(oldLedger.initialize(), /SCHEMA_MIGRATION_REQUIRED/);
    assert.deepEqual((await c.query('SELECT * FROM kidults_staging_task_lease')).rows, [{ task_id: 'preserve', lease_id: 'original' }]);
  } finally { await c.query('SET search_path TO public'); c.release(); }
});
await check('three_postgres_runtime_cycles_have_readback_receipts', async () => {
  for (let i = 0; i < 3; i++) {
    const name = `cycle-${i}`;
    assert.equal((await runtimeFor(new ShadowFetchBroker({ fixture: { synthetic: true } })).tick(request(name))).state, 'COMPLETE_VERIFIED');
    assert.equal((await ledger.rows(name)).filter(row => row.state === 'COMPLETE_VERIFIED').length, 1);
  }
});
const digests = Object.fromEntries([
  '../../../scripts/kidults/staging-operations/lib/postgres-transition-ledger-v1.mjs',
  '../../../scripts/kidults/staging-operations/lib/autonomous-runtime-v1.mjs',
  './postgres-live-canary-v1.mjs', './postgres-live-deps/npm-shrinkwrap.json',
].map(file => [file, createHash('sha256').update(fs.readFileSync(new URL(file, import.meta.url))).digest('hex')]));
const receipt = {
  id: 'kpmo-2289-local-linux-postgres-canary-v1',
  observed_at: new Date().toISOString(), candidate_commit: process.env.KPMO_CANARY_SOURCE_SHA ?? null,
  base_commit: '4193569f0229cced6da89eb6214f0ab413361a45',
  engine: (await pool.query('SELECT version() AS v')).rows[0].v, node: process.version,
  test_count: findings.length, passed: findings.filter(x => x.state === 'PASS').length,
  failed: findings.filter(x => x.state === 'FAIL').length, findings, digests,
  postgres: 'REAL_ISOLATED_LINUX_DATABASE', approval_authority: 'TEST_STUB_NOT_VERIFIED',
  durability: 'LOCAL_MOCK_IMMUTABLE_STORE_NOT_AWS', aws_live_executed: false,
  external_provider_requests: testBrokers.reduce((total, broker) => total + broker.externalCalls, 0), production: 'HOLD', public: 'HOLD', g5: 'HOLD',
};
receipt.state = receipt.failed === 0 ? 'VERIFIED_PASS_LOCAL_POSTGRES_ONLY' : 'VERIFIED_FAIL';
receipt.receipt_digest = createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
fs.writeFileSync(process.argv[2] ?? '/suite/results/postgres-live.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
await pool.end(); await admin.end();
process.exitCode = receipt.failed === 0 ? 0 : 1;
