import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  inspectD1Schema,
  inspectCanonicalClaimRuntime,
  inspectPostgresSchema,
  inspectWorkflowReceiptRelationTruth,
  inspectWorkflowReceiptRuntime,
  loadOrderedPostgresMigrations,
  validateBoundary,
} from './validate-boundary-v1.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const postgresMigrations = path.join(serviceRoot, 'migrations/postgres');

function postgresSql() {
  return loadOrderedPostgresMigrations(postgresMigrations).sql;
}

test('current repository establishes PostgreSQL authority and inventories every D1 writer', () => {
  const receipt = validateBoundary();
  assert.deepEqual(receipt.errors, []);
  assert.equal(receipt.system_of_record, 'POSTGRESQL');
  assert.equal(receipt.d1_role, 'READ_MODEL_ONLY');
  assert.deepEqual(receipt.permitted_normal_d1_writer, ['kpmo-d1-projector-v1']);
  assert.equal(receipt.deployed_governed_d1_writer_count, 0);
  assert.equal(receipt.remote_d1_mutation, false);
  assert.equal(receipt.production, 'HOLD');
  assert.equal(receipt.discovered_production_d1_writer_sources.some((file) => file.endsWith('.d.ts')), false);
  assert.deepEqual(receipt.postgres_migrations, [
    '0001_system_of_record.sql',
    '0002_workflow_run_receipts.sql',
  ]);
  assert.equal(receipt.workflow_receipt_ledger, 'IMPLEMENTED_NOT_REMOTE_VERIFIED');
  assert.equal(receipt.workflow_receipt_remote_persistence, 'HOLD');
  assert.match(receipt.canonical_identity_classifier, /^IMPLEMENTED_.*_REMOTE_LEDGER_ACTIVATION_HOLD$/);
  assert.equal(receipt.canonical_dedupe_remote_ledger, 'REMOTE_LEDGER_ACTIVATION_HOLD');
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
  const sql = postgresSql();
  const withoutCanonicalIdentity = inspectPostgresSchema(sql.replace('canonical_source_id text NOT NULL UNIQUE', 'canonical_source_id text'));
  assert(withoutCanonicalIdentity.errors.includes('POSTGRES_CONTROL_MISSING:canonical_source_id text NOT NULL UNIQUE'));
  const withoutRightsHistoryFence = inspectPostgresSchema(sql.replace('source_rights_decisions_append_only', 'source_rights_decisions_mutable'));
  assert(withoutRightsHistoryFence.errors.includes('POSTGRES_CONTROL_MISSING:source_rights_decisions_append_only'));
});

test('PostgreSQL source control snapshots fail closed when lawful current-SOLD is zero', () => {
  const sql = postgresSql();
  const mutated = inspectPostgresSchema(sql.replace(
    'CHECK (rights_clear_collector_current_sold_count > 0 OR activation_backlog_count = 0)',
    'CHECK (activation_backlog_count >= 0)'
  ));
  assert(mutated.errors.includes('POSTGRES_CONTROL_MISSING:CHECK (rights_clear_collector_current_sold_count > 0 OR activation_backlog_count = 0)'));
});

test('PostgreSQL observability and projector receipts are immutable', () => {
  const sql = postgresSql();
  const mutableObservability = inspectPostgresSchema(sql.replace('observability_events_append_only', 'observability_events_mutable'));
  assert(mutableObservability.errors.includes('POSTGRES_CONTROL_MISSING:observability_events_append_only'));
  const mutableReceipts = inspectPostgresSchema(sql.replace('outbox_delivery_receipts_append_only', 'outbox_delivery_receipts_mutable'));
  assert(mutableReceipts.errors.includes('POSTGRES_CONTROL_MISSING:outbox_delivery_receipts_append_only'));
});

test('PostgreSQL writer identity is bound to a least-privilege database role', () => {
  const sql = postgresSql();
  const spoofable = inspectPostgresSchema(sql.replace('p.database_role = current_user', 'p.database_role IS NOT NULL'));
  assert(spoofable.errors.includes('POSTGRES_CONTROL_MISSING:p.database_role = current_user'));
  const missingProjector = inspectPostgresSchema(sql.replace("('kpmo-d1-projector-v1', 'kidults_control_projector'", "('removed-projector', 'removed-role'"));
  assert(missingProjector.errors.includes("POSTGRES_CONTROL_MISSING:('kpmo-d1-projector-v1', 'kidults_control_projector'"));
});

test('PostgreSQL migrations are ordered, transactional and include the workflow receipt ledger', () => {
  const loaded = loadOrderedPostgresMigrations(postgresMigrations);
  assert.deepEqual(loaded.errors, []);
  assert.deepEqual(loaded.files, ['0001_system_of_record.sql', '0002_workflow_run_receipts.sql']);
  const missingReceiptTable = inspectPostgresSchema(loaded.sql.replace(
    'CREATE TABLE kidults_control.workflow_run_receipts',
    'CREATE TABLE kidults_control.workflow_receipts_removed'
  ));
  assert(missingReceiptTable.errors.includes('POSTGRES_CANONICAL_TABLE_MISSING:workflow_run_receipts'));
});

test('workflow receipt ledger requires least privilege, immutable rows and replay identity', () => {
  const sql = postgresSql();
  const mutable = inspectPostgresSchema(sql.replace(
    'workflow_run_receipts_append_only',
    'workflow_run_receipts_mutable'
  ));
  assert(mutable.errors.includes('POSTGRES_CONTROL_MISSING:workflow_run_receipts_append_only'));
  const replayable = inspectPostgresSchema(sql.replace(
    'UNIQUE (repository, workflow_run_id, workflow_run_attempt, receipt_type)',
    'UNIQUE (workflow_receipt_id)'
  ));
  assert(replayable.errors.includes('POSTGRES_CONTROL_MISSING:UNIQUE (repository, workflow_run_id, workflow_run_attempt, receipt_type)'));
  const excessiveGrant = inspectPostgresSchema(sql.replace(
    'GRANT SELECT, INSERT ON kidults_control.workflow_run_receipts',
    'GRANT SELECT, INSERT, UPDATE ON kidults_control.workflow_run_receipts'
  ));
  assert(excessiveGrant.errors.includes('POSTGRES_WORKFLOW_LEDGER_MUTATION_GRANT_PROHIBITED:workflow_run_receipts'));
  const excessiveClaimGrant = inspectPostgresSchema(sql.replace(
    'GRANT SELECT, INSERT ON kidults_control.workflow_canonical_run_claims',
    'GRANT SELECT, INSERT, DELETE ON kidults_control.workflow_canonical_run_claims'
  ));
  assert(excessiveClaimGrant.errors.includes('POSTGRES_WORKFLOW_LEDGER_MUTATION_GRANT_PROHIBITED:workflow_canonical_run_claims'));
  const truncatable = inspectPostgresSchema(sql.replace(
    'workflow_canonical_run_aliases_truncate_denied',
    'workflow_canonical_run_aliases_truncate_allowed'
  ));
  assert(truncatable.errors.includes('POSTGRES_CONTROL_MISSING:workflow_canonical_run_aliases_truncate_denied'));
});

test('workflow receipt ledger requires database-enforced exact leader and alias relations', () => {
  const sql = postgresSql();
  for (const control of [
    'enforce_workflow_receipt_canonical_relation',
    'KIDULTS_WORKFLOW_RECEIPT_CANONICAL_LEADER_BINDING_INVALID',
    'KIDULTS_WORKFLOW_RECEIPT_CANONICAL_ALIAS_BINDING_INVALID',
    'c.canonical_claim_id = NEW.canonical_claim_id',
    'c.repository = NEW.repository',
    'c.leader_workflow_run_id = NEW.workflow_run_id',
    'c.leader_claim_binding_digest = NEW.canonical_binding_digest',
    'c.canonical_claim_id = a.canonical_claim_id',
    'a.canonical_claim_id = NEW.canonical_claim_id',
    'a.repository = NEW.repository',
    'a.alias_workflow_run_id = NEW.workflow_run_id',
    'a.alias_binding_digest = NEW.canonical_binding_digest',
    'workflow_run_receipts_writer_relation_guard',
  ]) {
    const weakened = inspectPostgresSchema(sql.replaceAll(control, 'REMOVED_RELATION_CONTROL'));
    assert(weakened.errors.includes(`POSTGRES_CONTROL_MISSING:${control}`), control);
  }
});

test('workflow receipt runtime requires fail-closed validation, idempotency and HOLD truth', () => {
  const source = fs.readFileSync(path.join(serviceRoot, 'src/workflow-receipt-ledger.mjs'), 'utf8');
  assert.deepEqual(inspectWorkflowReceiptRuntime(source).errors, []);
  const withoutReplayConflict = inspectWorkflowReceiptRuntime(source.replaceAll(
    'WORKFLOW_RECEIPT_REPLAY_CONFLICT',
    'WORKFLOW_RECEIPT_REPLAY_ACCEPTED'
  ));
  assert(withoutReplayConflict.errors.some((error) => error.includes('WORKFLOW_RECEIPT_REPLAY_CONFLICT')));
  const withoutRelationVerification = inspectWorkflowReceiptRuntime(source.replaceAll(
    'verifyCanonicalRelationBinding',
    'acceptCanonicalRelationWithoutVerification'
  ));
  assert(withoutRelationVerification.errors.some((error) => error.includes('verifyCanonicalRelationBinding')));
  const withoutAliasParentJoin = inspectWorkflowReceiptRuntime(source.replace(
    'JOIN kidults_control.workflow_canonical_run_claims c',
    'JOIN kidults_control.workflow_canonical_run_claims_removed c'
  ));
  assert(withoutAliasParentJoin.errors.some((error) => error.includes('JOIN kidults_control.workflow_canonical_run_claims c')));
  const updatePrivilegeLock = inspectWorkflowReceiptRuntime(`${source}\nSELECT 1 FOR SHARE;`);
  assert(updatePrivilegeLock.errors.includes('WORKFLOW_RECEIPT_RUNTIME_ROW_LOCK_REQUIRES_PROHIBITED_UPDATE_PRIVILEGE'));
});

test('workflow receipt contract and operator docs preserve exact-relation and activation HOLD truth', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'contracts/control-plane-v1.json'), 'utf8'));
  const readme = fs.readFileSync(path.join(serviceRoot, 'README.md'), 'utf8');
  const runbook = fs.readFileSync(path.join(serviceRoot, 'ACTIVATION_RUNBOOK.md'), 'utf8');
  assert.deepEqual(inspectWorkflowReceiptRelationTruth(contract, readme, runbook).errors, []);

  const overprivileged = structuredClone(contract);
  overprivileged.workflow_receipt_ledger.database_privileges.push('UPDATE');
  assert(inspectWorkflowReceiptRelationTruth(overprivileged, readme, runbook).errors.includes(
    'WORKFLOW_RECEIPT_DATABASE_PRIVILEGES_NOT_SELECT_INSERT_ONLY'
  ));

  const weakened = structuredClone(contract);
  weakened.workflow_receipt_ledger.canonical_relation_binding.alias_match = ['canonical_claim_id'];
  assert(inspectWorkflowReceiptRelationTruth(weakened, readme, runbook).errors.includes(
    'WORKFLOW_RECEIPT_CANONICAL_ALIAS_MATCH_INCOMPLETE'
  ));

  assert(inspectWorkflowReceiptRelationTruth(
    contract,
    readme.replace('exact alias row and parent claim', 'unchecked alias relation'),
    runbook
  ).errors.some(error => error.startsWith('WORKFLOW_RECEIPT_README_TRUTH_MISSING:')));
  assert(inspectWorkflowReceiptRelationTruth(
    contract,
    readme,
    runbook.replace('remote receipt finalization remains `HOLD`', 'remote finalization is active')
  ).errors.some(error => error.startsWith('WORKFLOW_RECEIPT_RUNBOOK_TRUTH_MISSING:')));
});

test('canonical claim runtime requires trusted classification, explicit CAS and divergence HOLD', () => {
  const source = fs.readFileSync(path.join(serviceRoot, 'src/workflow-canonical-run-claims.mjs'), 'utf8');
  assert.deepEqual(inspectCanonicalClaimRuntime(source).errors, []);
  const unsafe = inspectCanonicalClaimRuntime(source.replace(
    'ON CONFLICT ON CONSTRAINT workflow_canonical_run_claims_key DO NOTHING',
    'ON CONFLICT DO NOTHING'
  ));
  assert(unsafe.errors.some((error) => error.includes('workflow_canonical_run_claims_key')));
  const updatePrivilegeLock = inspectCanonicalClaimRuntime(`${source}\nSELECT 1 FOR UPDATE;`);
  assert(updatePrivilegeLock.errors.includes('CANONICAL_CLAIM_RUNTIME_ROW_LOCK_REQUIRES_PROHIBITED_UPDATE_PRIVILEGE'));
});
