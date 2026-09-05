import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  appendRegistrySnapshot,
  emitRegistrySnapshotSql,
  registryDigest,
  validateGlobalSoldSourceRegistry
} from '../../../scripts/kidults/source-intelligence/global-sold-source-registry-v1.mjs';

const registryPath = fileURLToPath(new URL('../../../coordination/kidults/source-intelligence/global-sold-source-registry-v1.json', import.meta.url));
const migrationPath = fileURLToPath(new URL('../../../infrastructure/postgres/source-intelligence/0001_global_sold_source_registry_v1.sql', import.meta.url));
const loadRegistry = () => JSON.parse(fs.readFileSync(registryPath, 'utf8'));

class MemoryClient {
  constructor() {
    this.snapshot = null;
    this.assessments = new Map();
    this.calls = [];
  }
  async query(sql, params = []) {
    this.calls.push({ sql, params });
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' || sql.startsWith('SELECT set_config') || sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 };
    if (sql.startsWith('SELECT snapshot_digest')) return { rows: this.snapshot ? [structuredClone(this.snapshot)] : [], rowCount: this.snapshot ? 1 : 0 };
    if (sql.includes('INSERT INTO kidults_control.global_source_registry_snapshot_ledger')) {
      this.snapshot = { snapshot_digest: params[2], registry_payload: JSON.parse(params[5]) };
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('SELECT assessment_digest')) {
      const row = this.assessments.get(`${params[0]}:${params[1]}`);
      return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes('INSERT INTO kidults_control.global_source_assessment_ledger')) {
      this.assessments.set(`${params[0]}:${params[1]}`, { assessment_digest: params[15], assessment_payload: JSON.parse(params[16]) });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`UNHANDLED_SQL:${sql}`);
  }
}

test('canonical source pool is digest-bound and fail-closed', () => {
  const registry = loadRegistry();
  const result = validateGlobalSoldSourceRegistry(registry);
  assert.equal(result.status, 'PASS');
  assert.equal(result.snapshot_digest, registryDigest(registry));
  assert.equal(result.acquisition_authorized, false);
  assert.equal(result.production, 'HOLD');
  assert.ok(result.source_count >= 15);
});

test('blocks rights self-promotion and NO-GO weakening', () => {
  const promoted = loadRegistry();
  promoted.release_boundary.adapter_activation_authorized = true;
  promoted.snapshot_digest = registryDigest(promoted);
  assert.throws(() => validateGlobalSoldSourceRegistry(promoted), /REGISTRY_ADAPTER_AUTHORITY_FORBIDDEN/);

  const weakened = loadRegistry();
  const source = weakened.sources.find((item) => item.decision === 'NO_GO');
  source.rights.store = 'HOLD';
  weakened.snapshot_digest = registryDigest(weakened);
  assert.throws(() => validateGlobalSoldSourceRegistry(weakened), /NO_GO_SOURCE_RIGHT_NOT_BLOCKED/);
});

test('blocks duplicate sources and digest drift', () => {
  const duplicate = loadRegistry();
  duplicate.sources.push(structuredClone(duplicate.sources[0]));
  duplicate.snapshot_digest = registryDigest(duplicate);
  assert.throws(() => validateGlobalSoldSourceRegistry(duplicate), /SOURCE_ID_DUPLICATE/);

  const drift = loadRegistry();
  drift.sources[0].claim_ceiling = 'FORGED';
  assert.throws(() => validateGlobalSoldSourceRegistry(drift), /REGISTRY_DIGEST_MISMATCH/);
});

test('append is transactional and replay-idempotent', async () => {
  const client = new MemoryClient();
  const registry = loadRegistry();
  const first = await appendRegistrySnapshot(client, registry);
  assert.equal(first.status, 'COMMITTED');
  assert.equal(first.counts.snapshots_inserted, 1);
  assert.equal(first.counts.assessments_inserted, registry.sources.length);
  const replay = await appendRegistrySnapshot(client, registry);
  assert.equal(replay.counts.snapshots_idempotent, 1);
  assert.equal(replay.counts.assessments_idempotent, registry.sources.length);
});

test('snapshots caller-owned registry before the first asynchronous SQL boundary', async () => {
  const registry = loadRegistry();
  const originalName = registry.sources[0].source_name;
  class MutatingClient extends MemoryClient {
    async query(sql, params = []) {
      if (sql === 'BEGIN') registry.sources[0].source_name = 'MUTATED_AFTER_VALIDATION';
      return super.query(sql, params);
    }
  }
  const client = new MutatingClient();
  await appendRegistrySnapshot(client, registry);
  assert.equal(client.snapshot.registry_payload.sources[0].source_name, originalName);
  assert.equal([...client.assessments.values()][0].assessment_payload.source_name, originalName);
});

test('preserves the original registry write failure when rollback also fails', async () => {
  const original = new Error('ORIGINAL_WRITE_FAILURE');
  const rollback = new Error('ROLLBACK_FAILURE');
  const client = {
    async query(sql) {
      if (sql === 'BEGIN') return { rows: [], rowCount: 0 };
      if (sql === 'ROLLBACK') throw rollback;
      throw original;
    }
  };
  await assert.rejects(
    () => appendRegistrySnapshot(client, loadRegistry()),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.cause, original);
      assert.deepEqual(error.errors, [original, rollback]);
      return true;
    }
  );
});

test('migration is append-only and prevents release authority', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /global_source_registry_snapshot_ledger/);
  assert.match(sql, /global_source_assessment_ledger/);
  assert.match(sql, /BEFORE UPDATE OR DELETE/);
  assert.match(sql, /BEFORE TRUNCATE/);
  assert.match(sql, /REVOKE UPDATE, DELETE, TRUNCATE/);
  assert.match(sql, /activation_authorized BOOLEAN NOT NULL CHECK \(activation_authorized = false\)/);
  assert.match(sql, /production_authorized BOOLEAN NOT NULL CHECK \(production_authorized = false\)/);
  assert.doesNotMatch(sql, /ON CONFLICT[\s\S]*DO UPDATE/i);
});

test('emitted PostgreSQL packet is transactional, idempotent and preserves HOLD boundaries', () => {
  const registry = loadRegistry();
  const sql = emitRegistrySnapshotSql(registry);
  assert.match(sql, /^\\set ON_ERROR_STOP on\nBEGIN;/);
  assert.match(sql, /SET ROLE kidults_control_supply/);
  assert.match(sql, /ON CONFLICT \(snapshot_digest\) DO NOTHING/);
  assert.equal((sql.match(/INSERT INTO kidults_control\.global_source_assessment_ledger/g) || []).length, registry.sources.length);
  assert.match(sql, /GLOBAL_SOURCE_REGISTRY_SNAPSHOT_BINDING_FAILED/);
  assert.match(sql, /REVOKE kidults_control_supply/);
  assert.match(sql, /COMMIT;\n$/);
  assert.doesNotMatch(sql, /DO UPDATE/i);
});
