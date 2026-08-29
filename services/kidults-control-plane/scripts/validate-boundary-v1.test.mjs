import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  inspectD1Schema,
  inspectPostgresSchema,
  legacyRemoteDeployFailsClosed,
  validateBoundary,
} from './validate-boundary-v1.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const postgresMigration = path.join(serviceRoot, 'migrations/postgres/0001_system_of_record.sql');

test('current repository establishes PostgreSQL authority and inventories every D1 writer', () => {
  const receipt = validateBoundary();
  assert.deepEqual(receipt.errors, []);
  assert.equal(receipt.system_of_record, 'POSTGRESQL');
  assert.equal(receipt.d1_role, 'READ_MODEL_ONLY');
  assert.deepEqual(receipt.permitted_normal_d1_writer, ['kpmo-d1-projector-v1']);
  assert.equal(receipt.deployed_governed_d1_writer_count, 0);
  assert.equal(receipt.remote_d1_mutation, false);
  assert.equal(receipt.production, 'HOLD');
});

test('legacy remote deployment accepts a terminal global freeze or the D1 writer guard only', () => {
  assert.equal(legacyRemoteDeployFailsClosed('node scripts/cloudflare-global-no-rerun.mjs'), true);
  assert.equal(legacyRemoteDeployFailsClosed('npm run deploy:preflight && npm run d1:writer:remote-guard && wrangler deploy'), true);
  assert.equal(legacyRemoteDeployFailsClosed('wrangler deploy'), false);
  assert.equal(legacyRemoteDeployFailsClosed('npm run deploy:preflight'), false);
});

test('D1 schema rejects a canonical customer table', () => {
  const result = inspectD1Schema(`
    CREATE TABLE users (user_id TEXT PRIMARY KEY);
    CREATE TABLE projection_meta (projection_name TEXT PRIMARY KEY);
  `);
  assert(result.errors.includes('D1_CANONICAL_TABLE_PROHIBITED:users'));
});

test('D1 schema rejects an unregistered projection table', () => {
  const result = inspectD1Schema('CREATE TABLE shadow_truth (id TEXT PRIMARY KEY);');
  assert(result.errors.includes('D1_UNREGISTERED_READ_MODEL:shadow_truth'));
});

test('PostgreSQL schema rejects missing writer and append-only controls', () => {
  const result = inspectPostgresSchema('BEGIN; CREATE TABLE kidults_control.organizations(id uuid); COMMIT;');
  assert(result.errors.includes('POSTGRES_CONTROL_MISSING:assert_registered_writer'));
  assert(result.errors.includes('POSTGRES_CONTROL_MISSING:KIDULTS_APPEND_ONLY_MUTATION_DENIED'));
});

test('PostgreSQL source ledger requires canonical identity and immutable rights history', () => {
  const sql = fs.readFileSync(postgresMigration, 'utf8');
  const withoutCanonicalIdentity = inspectPostgresSchema(sql.replace('canonical_source_id text NOT NULL UNIQUE', 'canonical_source_id text'));
  assert(withoutCanonicalIdentity.errors.includes('POSTGRES_CONTROL_MISSING:canonical_source_id text NOT NULL UNIQUE'));
  const withoutRightsHistoryFence = inspectPostgresSchema(sql.replace('source_rights_decisions_append_only', 'source_rights_decisions_mutable'));
  assert(withoutRightsHistoryFence.errors.includes('POSTGRES_CONTROL_MISSING:source_rights_decisions_append_only'));
});

test('PostgreSQL source control snapshots fail closed when lawful current-SOLD is zero', () => {
  const sql = fs.readFileSync(postgresMigration, 'utf8');
  const mutated = inspectPostgresSchema(sql.replace(
    'CHECK (rights_clear_collector_current_sold_count > 0 OR activation_backlog_count = 0)',
    'CHECK (activation_backlog_count >= 0)'
  ));
  assert(mutated.errors.includes('POSTGRES_CONTROL_MISSING:CHECK (rights_clear_collector_current_sold_count > 0 OR activation_backlog_count = 0)'));
});

test('PostgreSQL observability and projector receipts are immutable', () => {
  const sql = fs.readFileSync(postgresMigration, 'utf8');
  const mutableObservability = inspectPostgresSchema(sql.replace('observability_events_append_only', 'observability_events_mutable'));
  assert(mutableObservability.errors.includes('POSTGRES_CONTROL_MISSING:observability_events_append_only'));
  const mutableReceipts = inspectPostgresSchema(sql.replace('outbox_delivery_receipts_append_only', 'outbox_delivery_receipts_mutable'));
  assert(mutableReceipts.errors.includes('POSTGRES_CONTROL_MISSING:outbox_delivery_receipts_append_only'));
});

test('PostgreSQL writer identity is bound to a least-privilege database role', () => {
  const sql = fs.readFileSync(postgresMigration, 'utf8');
  const spoofable = inspectPostgresSchema(sql.replace('p.database_role = current_user', 'p.database_role IS NOT NULL'));
  assert(spoofable.errors.includes('POSTGRES_CONTROL_MISSING:p.database_role = current_user'));
  const missingProjector = inspectPostgresSchema(sql.replace("('kpmo-d1-projector-v1', 'kidults_control_projector'", "('removed-projector', 'removed-role'"));
  assert(missingProjector.errors.includes("POSTGRES_CONTROL_MISSING:('kpmo-d1-projector-v1', 'kidults_control_projector'"));
});
