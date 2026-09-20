import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(scriptDir, '..');
const defaultRoot = path.resolve(serviceRoot, '..', '..');

const writeSql = /\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE\s+[A-Za-z_][A-Za-z0-9_]*|DELETE\s+FROM|REPLACE\s+INTO)\b/i;
const d1Signal = /(?:\bD1Database\b|\bD1PreparedStatement\b|\benv\.DB\b|\.DB\.prepare\b|\.DB\.batch\b|\bdb\.prepare\b)/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function walk(dir, predicate, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'coverage', '.wrangler'].includes(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute, predicate, found);
    else if (predicate(absolute)) found.push(absolute);
  }
  return found;
}

export function inspectD1Schema(sql) {
  const errors = [];
  const forbidden = [
    'users', 'organizations', 'memberships', 'resource_grants', 'plans',
    'subscriptions', 'entitlements', 'usage_events', 'billing_events',
    'data_sources', 'source_aliases', 'source_rights_decisions', 'supply_chain_runs',
    'source_control_plane_snapshots',
    'commands', 'audit_events', 'outbox_events', 'outbox_delivery_receipts',
    'outbox_delivery_claims', 'observability_events', 'workflow_run_receipts',
    'workflow_canonical_run_claims', 'workflow_canonical_run_aliases',
    'autonomous_task_snapshots', 'autonomous_task_transitions',
    'cryptographic_approval_consumptions', 'approval_trust_root_candidates',
    'approval_trust_root_lifecycle_events', 'approval_trust_registry_snapshots',
    'approval_trust_current_heads'
  ];
  const created = [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)/gi)]
    .map((match) => match[1].toLowerCase());
  for (const table of forbidden) if (created.includes(table)) errors.push(`D1_CANONICAL_TABLE_PROHIBITED:${table}`);
  const allowed = new Set([
    'projection_meta', 'organization_access_projection',
    'subscription_entitlement_projection', 'source_admission_projection',
    'control_plane_health_projection'
  ]);
  for (const table of created) if (!allowed.has(table)) errors.push(`D1_UNREGISTERED_READ_MODEL:${table}`);
  for (const required of allowed) if (!created.includes(required)) errors.push(`D1_REQUIRED_READ_MODEL_MISSING:${required}`);
  const projectionTables = created.filter((table) => table !== 'projection_meta');
  for (const table of projectionTables) {
    const tableStart = sql.search(new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`, 'i'));
    const tableEnd = sql.indexOf(';', tableStart);
    const definition = sql.slice(tableStart, tableEnd + 1);
    for (const column of ['source_event_id', 'source_event_hash', 'source_schema_version', 'projector_id', 'projected_at']) {
      if (!new RegExp(`\\b${column}\\b`, 'i').test(definition)) errors.push(`D1_PROVENANCE_COLUMN_MISSING:${table}:${column}`);
    }
  }
  if (!sql.includes("projector_id = 'kpmo-d1-projector-v1'")) errors.push('D1_PROJECTOR_ID_FENCE_MISSING');
  return { created, errors };
}

export function inspectPostgresSchema(sql) {
  const errors = [];
  const requiredTables = [
    'writer_principals', 'users', 'organizations', 'memberships', 'resource_grants',
    'plans', 'subscriptions', 'entitlements', 'usage_events', 'billing_events',
    'data_sources', 'source_aliases', 'source_rights_decisions', 'supply_chain_runs',
    'source_control_plane_snapshots', 'commands',
    'audit_events', 'outbox_events', 'outbox_delivery_receipts',
    'outbox_delivery_claims', 'observability_events', 'workflow_run_receipts',
    'workflow_canonical_run_claims', 'workflow_canonical_run_aliases',
    'protected_launch_manifest_consumptions'
  ];
  for (const table of requiredTables) {
    if (!new RegExp(`CREATE\\s+TABLE\\s+kidults_control\\.${table}\\b`, 'i').test(sql)) {
      errors.push(`POSTGRES_CANONICAL_TABLE_MISSING:${table}`);
    }
  }
  const requiredControls = [
    'assert_registered_writer', 'enforce_registered_writer', 'reject_mutation',
    'ENABLE ROW LEVEL SECURITY', 'FORCE ROW LEVEL SECURITY',
    'KIDULTS_WRITER_ID_REQUIRED', 'KIDULTS_APPEND_ONLY_MUTATION_DENIED',
    'database_role name NOT NULL', 'p.database_role = current_user',
    "('kpmo-d1-projector-v1', 'kidults_control_projector'",
    'NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
    'GRANT INSERT ON kidults_control.outbox_delivery_receipts TO kidults_control_projector',
    'GRANT INSERT, UPDATE ON kidults_control.outbox_delivery_claims TO kidults_control_projector',
    'GRANT EXECUTE ON FUNCTION kidults_control.current_organization_id()',
    'commands_append_only', 'entitlements_append_only', '_delete_denied',
    'REVOKE ALL ON SCHEMA kidults_control FROM PUBLIC',
    'canonical_source_id text NOT NULL UNIQUE',
    'source_aliases_append_only',
    'source_rights_decisions_append_only',
    'FOREIGN KEY (rights_decision_id, source_id)',
    'source_control_plane_snapshots_append_only',
    'outbox_delivery_receipts_append_only',
    'observability_events_append_only',
    "CHECK (rights_clear_collector_current_sold_count > 0 OR activation_backlog_count = 0)",
    'CREATE ROLE kidults_control_workflow_receipt',
    'KIDULTS_WORKFLOW_RECEIPT_ROLE_DRIFT',
    "'kpmo-workflow-receipt-writer-v1'",
    'workflow_run_receipts_writer_guard',
    'enforce_workflow_receipt_canonical_relation',
    'KIDULTS_WORKFLOW_RECEIPT_CANONICAL_BINDING_PARTIAL',
    'KIDULTS_WORKFLOW_RECEIPT_CANONICAL_LEADER_BINDING_INVALID',
    'KIDULTS_WORKFLOW_RECEIPT_CANONICAL_ALIAS_BINDING_INVALID',
    'c.canonical_claim_id = NEW.canonical_claim_id',
    'c.repository = NEW.repository',
    'c.leader_workflow_path = NEW.workflow_path',
    'c.leader_workflow_run_id = NEW.workflow_run_id',
    'c.leader_workflow_run_attempt = NEW.workflow_run_attempt',
    'c.leader_claim_binding_digest = NEW.canonical_binding_digest',
    'c.canonical_claim_id = a.canonical_claim_id',
    'a.canonical_claim_id = NEW.canonical_claim_id',
    'a.repository = NEW.repository',
    'a.alias_workflow_path = NEW.workflow_path',
    'a.alias_workflow_run_id = NEW.workflow_run_id',
    'a.alias_workflow_run_attempt = NEW.workflow_run_attempt',
    'a.alias_binding_digest = NEW.canonical_binding_digest',
    'workflow_run_receipts_writer_relation_guard',
    'FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_workflow_receipt_canonical_relation()',
    'REVOKE ALL ON FUNCTION kidults_control.enforce_workflow_receipt_canonical_relation() FROM PUBLIC',
    'workflow_run_receipts_append_only',
    'binding_digest text NOT NULL UNIQUE',
    'UNIQUE (repository, workflow_run_id, workflow_run_attempt, receipt_type)',
    'CHECK (octet_length(result_json::text) <= 262144)',
    'REVOKE ALL ON kidults_control.workflow_run_receipts FROM PUBLIC',
    'GRANT SELECT, INSERT ON kidults_control.workflow_run_receipts TO kidults_control_workflow_receipt',
    'GRANT SELECT (writer_id, database_role, state)',
    'GRANT EXECUTE ON FUNCTION kidults_control.assert_registered_writer(text)',
    'CONSTRAINT workflow_canonical_run_claims_key UNIQUE',
    'CONSTRAINT workflow_canonical_run_claims_leader_run UNIQUE',
    'CONSTRAINT workflow_canonical_run_claims_alias_fk_target UNIQUE',
    'canonical_input_digest text NOT NULL',
    'canonical_input_digest_state text NOT NULL',
    "canonical_input_digest_state = 'VERIFIED_EXACT_ARTIFACT_INPUT'",
    'dedupe_eligible boolean NOT NULL CHECK (dedupe_eligible)',
    'workflow_canonical_run_claims_append_only',
    'workflow_canonical_run_claims_truncate_denied',
    'workflow_canonical_run_aliases_claim_fk',
    'workflow_canonical_run_aliases_run_key',
    'workflow_canonical_run_aliases_append_only',
    'workflow_canonical_run_aliases_truncate_denied',
    'workflow_run_receipts_truncate_denied',
    'GRANT SELECT, INSERT ON kidults_control.workflow_canonical_run_claims TO kidults_control_workflow_receipt',
    'GRANT SELECT, INSERT ON kidults_control.workflow_canonical_run_aliases TO kidults_control_workflow_receipt',
    'CREATE ROLE kidults_control_autonomous_task',
    'KIDULTS_AUTONOMOUS_TASK_ROLE_DRIFT',
    "'kpmo-autonomous-task-writer-v1'",
    'autonomous_task_snapshots_writer_guard',
    'autonomous_task_transitions_writer_guard',
    'autonomous_task_snapshots_append_only',
    'autonomous_task_snapshots_truncate_denied',
    'autonomous_task_transitions_append_only',
    'autonomous_task_transitions_truncate_denied',
    'PRIMARY KEY (task_id, revision)',
    'UNIQUE (task_id, revision, task_digest)',
    'CHECK (to_revision = from_revision + 1)',
    "CHECK (task_json->>'taskId' = task_id)",
    "CHECK ((task_json - ARRAY[",
    "CHECK ((receipt_json - ARRAY[",
    "CHECK (task_json->>'state' = state)",
    "CHECK (receipt_json->>'receiptId' = receipt_id)",
    "CHECK (receipt_json->'externalEgress' = 'false'::jsonb)",
    "CHECK (receipt_json->>'production' = 'HOLD')",
    "CHECK (receipt_json->>'publicRelease' = 'HOLD')",
    "CHECK (receipt_json->>'g5' = 'HOLD')",
    'FOREIGN KEY (task_id, from_revision, before_digest, from_state)',
    'FOREIGN KEY (task_id, to_revision, after_digest, to_state)',
    "CHECK (receipt_json->>'fromState' = from_state)",
    "CHECK (receipt_json->>'toState' = to_state)",
    'REVOKE ALL ON kidults_control.autonomous_task_snapshots FROM PUBLIC',
    'REVOKE ALL ON kidults_control.autonomous_task_transitions FROM PUBLIC',
    'GRANT SELECT, INSERT ON kidults_control.autonomous_task_snapshots TO kidults_control_autonomous_task',
    'GRANT SELECT, INSERT ON kidults_control.autonomous_task_transitions TO kidults_control_autonomous_task',
    'assert_autonomous_task_snapshot_transition_pair',
    'autonomous_task_snapshot_transition_pair',
    'DEFERRABLE INITIALLY DEFERRED',
    'KIDULTS_AUTONOMOUS_TASK_TRANSITION_PAIR_REQUIRED',
    'CREATE ROLE kidults_control_autonomous_invocation',
    'KIDULTS_AUTONOMOUS_INVOCATION_ROLE_DRIFT',
    "'kpmo-autonomous-invocation-writer-v1'",
    'CREATE TABLE kidults_control.autonomous_supervisor_invocation_requests',
    'CREATE TABLE kidults_control.autonomous_supervisor_invocation_decisions',
    'CREATE TABLE kidults_control.autonomous_supervisor_invocation_consumptions',
    'FOREIGN KEY (command_id, request_id, request_digest)',
    'FOREIGN KEY (command_id, decision_id, decision_digest)',
    'autonomous_supervisor_invocation_requests_append_only',
    'autonomous_supervisor_invocation_decisions_append_only',
    'autonomous_supervisor_invocation_consumptions_append_only',
    'GRANT SELECT, INSERT ON kidults_control.autonomous_supervisor_invocation_consumptions',
    'CREATE TABLE kidults_control.protected_launch_manifest_consumptions',
    'protected_launch_manifest_consumptions_writer_guard',
    'protected_launch_manifest_consumptions_append_only',
    'protected_launch_manifest_consumptions_truncate_denied',
    'REVOKE ALL ON kidults_control.protected_launch_manifest_consumptions FROM PUBLIC',
    'GRANT SELECT, INSERT ON kidults_control.protected_launch_manifest_consumptions',
    'CREATE ROLE kidults_control_approval_consumer',
    'KIDULTS_APPROVAL_CONSUMER_ROLE_DRIFT',
    "'kpmo-approval-consumption-writer-v1'",
    'CREATE TABLE kidults_control.cryptographic_approval_consumptions',
    'nonce_digest text NOT NULL UNIQUE',
    'cryptographic_approval_consumptions_writer_guard',
    'cryptographic_approval_consumptions_append_only',
    'cryptographic_approval_consumptions_truncate_denied',
    'REVOKE ALL ON kidults_control.cryptographic_approval_consumptions FROM PUBLIC',
    'GRANT SELECT, INSERT ON kidults_control.cryptographic_approval_consumptions',
    'CREATE TABLE kidults_control.autonomous_containment_fence_events',
    'autonomous_containment_fence_events_writer_guard',
    'autonomous_containment_fence_events_append_only',
    'autonomous_containment_fence_events_truncate_denied',
    'REVOKE ALL ON kidults_control.autonomous_containment_fence_events FROM PUBLIC',
    'GRANT SELECT, INSERT ON kidults_control.autonomous_containment_fence_events',
    'event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL',
    'GRANT USAGE, SELECT ON SEQUENCE',
    'CREATE ROLE kidults_control_trust_root_lifecycle',
    'KIDULTS_TRUST_ROOT_LIFECYCLE_ROLE_DRIFT',
    "'kpmo-trust-root-lifecycle-writer-v1'",
    'CREATE TABLE kidults_control.approval_trust_root_candidates',
    'CREATE TABLE kidults_control.approval_trust_root_lifecycle_events',
    'approval_trust_root_candidates_append_only',
    'approval_trust_root_lifecycle_events_append_only',
    'GRANT SELECT, INSERT ON kidults_control.approval_trust_root_candidates',
    'GRANT SELECT, INSERT ON kidults_control.approval_trust_root_lifecycle_events',
    'CREATE ROLE kidults_control_trust_registry_snapshot',
    'KIDULTS_TRUST_REGISTRY_SNAPSHOT_ROLE_DRIFT',
    "'kpmo-trust-registry-snapshot-writer-v1'",
    'CREATE TABLE kidults_control.approval_trust_registry_snapshots',
    'approval_trust_registry_snapshots_append_only',
    'approval_trust_registry_snapshots_truncate_denied',
    'GRANT SELECT, INSERT ON kidults_control.approval_trust_registry_snapshots',
    'GRANT SELECT ON kidults_control.approval_trust_registry_snapshots',
    'CREATE ROLE kidults_control_trust_current_head',
    'KIDULTS_TRUST_CURRENT_HEAD_ROLE_DRIFT',
    "'kpmo-trust-current-head-writer-v1'",
    'CREATE TABLE kidults_control.approval_trust_current_heads',
    'approval_trust_current_heads_append_only',
    'approval_trust_current_heads_truncate_denied',
    'GRANT SELECT, INSERT ON kidults_control.approval_trust_current_heads',
    'GRANT SELECT ON kidults_control.approval_trust_current_heads',
  ];
  for (const control of requiredControls) if (!sql.includes(control)) errors.push(`POSTGRES_CONTROL_MISSING:${control}`);
  for (const table of [
    'workflow_run_receipts', 'workflow_canonical_run_claims', 'workflow_canonical_run_aliases',
    'autonomous_task_snapshots', 'autonomous_task_transitions',
    'autonomous_supervisor_invocation_requests',
    'autonomous_supervisor_invocation_decisions',
    'autonomous_supervisor_invocation_consumptions',
    'cryptographic_approval_consumptions',
    'protected_launch_manifest_consumptions',
    'approval_trust_root_candidates', 'approval_trust_root_lifecycle_events',
    'approval_trust_registry_snapshots', 'approval_trust_current_heads',
  ]) {
    const grants = [...sql.matchAll(new RegExp(`GRANT\\s+([^;]+?)\\s+ON\\s+kidults_control\\.${table}\\s+TO\\s+([^;]+);`, 'gi'))];
    if (grants.some((match) => /\b(?:UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)\b/i.test(match[1]))) {
      const family = table.startsWith('workflow_') ? 'WORKFLOW' : 'AUTONOMOUS_TASK';
      errors.push(`POSTGRES_${family}_LEDGER_MUTATION_GRANT_PROHIBITED:${table}`);
    }
  }
  if (!/^BEGIN;/m.test(sql) || !/^COMMIT;/m.test(sql)) errors.push('POSTGRES_MIGRATION_TRANSACTION_MISSING');
  return { requiredTables, errors };
}

export function loadOrderedPostgresMigrations(migrationsDirectory) {
  const errors = [];
  const entries = fs.readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'));
  const malformed = entries.filter((entry) => !/^\d{4}_[a-z0-9][a-z0-9_]*\.sql$/.test(entry.name));
  for (const entry of malformed) errors.push(`POSTGRES_MIGRATION_FILENAME_INVALID:${entry.name}`);
  const migrations = entries
    .filter((entry) => /^\d{4}_[a-z0-9][a-z0-9_]*\.sql$/.test(entry.name))
    .map((entry) => ({
      file: entry.name,
      sequence: Number(entry.name.slice(0, 4)),
      sql: fs.readFileSync(path.join(migrationsDirectory, entry.name), 'utf8'),
    }))
    .sort((left, right) => left.sequence - right.sequence || left.file.localeCompare(right.file));

  migrations.forEach((migration, index) => {
    const expected = index + 1;
    if (migration.sequence !== expected) {
      errors.push(`POSTGRES_MIGRATION_SEQUENCE_INVALID:${migration.file}:EXPECTED_${String(expected).padStart(4, '0')}`);
    }
    if (index > 0 && migrations[index - 1].sequence === migration.sequence) {
      errors.push(`POSTGRES_MIGRATION_SEQUENCE_DUPLICATE:${migration.file}`);
    }
    const beginCount = (migration.sql.match(/^BEGIN;/gm) || []).length;
    const commitCount = (migration.sql.match(/^COMMIT;/gm) || []).length;
    if (beginCount !== 1 || commitCount !== 1 || !/^BEGIN;/.test(migration.sql) || !/COMMIT;\s*$/.test(migration.sql)) {
      errors.push(`POSTGRES_MIGRATION_TRANSACTION_INVALID:${migration.file}`);
    }
  });
  if (!migrations.some((migration) => migration.file === '0001_system_of_record.sql')) {
    errors.push('POSTGRES_MIGRATION_REQUIRED_MISSING:0001_system_of_record.sql');
  }
  if (!migrations.some((migration) => migration.file === '0002_workflow_run_receipts.sql')) {
    errors.push('POSTGRES_MIGRATION_REQUIRED_MISSING:0002_workflow_run_receipts.sql');
  }
  if (!migrations.some((migration) => migration.file === '0003_autonomous_task_ledger.sql')) {
    errors.push('POSTGRES_MIGRATION_REQUIRED_MISSING:0003_autonomous_task_ledger.sql');
  }

  return {
    files: migrations.map((migration) => migration.file),
    sql: migrations.map((migration) => migration.sql).join('\n'),
    errors,
  };
}

export function inspectWorkflowReceiptRuntime(source) {
  const errors = [];
  const requiredControls = [
    "const WRITER_ID = 'kpmo-workflow-receipt-writer-v1'",
    'const MAX_RESULT_BYTES = 256 * 1024',
    'RESULT_SECRET_LIKE_MATERIAL_DENIED',
    'RESULT_JSON_TOO_LARGE',
    'SUCCESS_ARTIFACT_REQUIRED',
    'ARTIFACT_EXPIRED_OR_INVALID',
    'ON CONFLICT DO NOTHING',
    'WORKFLOW_RECEIPT_REPLAY_CONFLICT',
    'verifyCanonicalRelationBinding',
    "const relation = leader ? 'LEADER' : 'ALIAS'",
    'WORKFLOW_RECEIPT_CANONICAL_${relation}_BINDING_INVALID',
    'FROM kidults_control.workflow_canonical_run_claims c',
    'FROM kidults_control.workflow_canonical_run_aliases a',
    'JOIN kidults_control.workflow_canonical_run_claims c',
    'c.canonical_claim_id=$1 AND c.repository=$2',
    'a.canonical_claim_id=$1 AND a.repository=$2 AND c.repository=$2',
    'c.leader_workflow_path=$3 AND c.leader_workflow_run_id=$4',
    'c.leader_workflow_run_attempt=$5 AND c.leader_claim_binding_digest=$6',
    'a.alias_workflow_path=$3 AND a.alias_workflow_run_id=$4',
    'a.alias_workflow_run_attempt=$5 AND a.alias_binding_digest=$6',
    "verifyCanonicalRelationBinding(client, normalized, 'PRE_INSERT')",
    "verifyCanonicalRelationBinding(client, normalized, 'READBACK')",
    "state: inserted.rows?.length ? 'RECORDED' : 'IDEMPOTENT_REPLAY'",
    "await client.query('ROLLBACK')",
    "production: 'HOLD'",
    "publicRelease: 'HOLD'",
    "g5: 'HOLD'",
  ];
  for (const control of requiredControls) {
    if (!source.includes(control)) errors.push(`WORKFLOW_RECEIPT_RUNTIME_CONTROL_MISSING:${control}`);
  }
  if (/\bFOR\s+(?:UPDATE|NO\s+KEY\s+UPDATE|SHARE|KEY\s+SHARE)\b/i.test(source)) {
    errors.push('WORKFLOW_RECEIPT_RUNTIME_ROW_LOCK_REQUIRES_PROHIBITED_UPDATE_PRIVILEGE');
  }
  return { errors };
}

export function inspectRuntimeRegistrationLedgerAdmission(source) {
  const errors = [];
  for (const control of [
    "import { appendWorkflowRunReceipt, workflowReceiptLedgerInternals } from '../src/workflow-receipt-ledger.mjs'",
    'verifyProtectedRuntimeRegistrationReceipt(admission.registrationGate)',
    'digestObject(admission.ledgerReceiptInput) === digestObject(ledgerReceiptInputForGate(gate))',
    'workflowReceiptLedgerInternals.normalizeInput(admission.ledgerReceiptInput)',
    'await appendWorkflowRunReceipt({ client, receipt: verified.ledgerReceiptInput, id })',
    'ledgerAppendRequired: true', 'governedCanaryEligible: false',
    'credentialResolutionPerformed: false', 'remoteConnectionPerformed: false',
    "activationAuthorized: false", "production: 'HOLD'", "publicRelease: 'HOLD'", "g5: 'HOLD'",
  ]) if (!source.includes(control)) {
    errors.push(`RUNTIME_REGISTRATION_LEDGER_ADMISSION_CONTROL_MISSING:${control}`);
  }
  for (const pattern of [
    /\b(?:INSERT|UPDATE|DELETE)\s+INTO?\b/i, /\bnew\s+(?:Pool|Client)\s*\(/,
    /process\.env\.(?:PG|DATABASE|POSTGRES|DSN|TOKEN|SECRET|PASSWORD)/i,
  ]) if (pattern.test(source)) {
    errors.push(`RUNTIME_REGISTRATION_LEDGER_ADMISSION_BOUNDARY_VIOLATION:${pattern.source}`);
  }
  return { errors };
}

export function inspectCanonicalClaimRuntime(source) {
  const errors = [];
  const requiredControls = [
    "domain: 'kidults.workflow-canonical-run-claim.v1'",
    "domain: 'kidults.workflow-canonical-run-alias.v1'",
    'TRUSTED_CLASSIFIER_CONTRACT_BYTES_REQUIRED',
    'CLASSIFIER_CONTRACT_DIGEST_MISMATCH',
    'CANONICAL_CLAIM_DEDUPE_INELIGIBLE',
    'CANONICAL_CLAIM_EXACT_ARTIFACT_BINDING_REQUIRED',
    'ON CONFLICT ON CONSTRAINT workflow_canonical_run_claims_key DO NOTHING',
    'ON CONFLICT ON CONSTRAINT workflow_canonical_run_aliases_run_key DO NOTHING',
    "state: 'INPUT_DIVERGENCE_HOLD'",
    "state: aliasInserted.rows?.length ? 'DEDUPED_ALIAS' : 'IDEMPOTENT_ALIAS_REPLAY'",
    "await client.query('ROLLBACK')",
    "remoteActivation: 'HOLD'",
    "production: 'HOLD'",
    "g5: 'HOLD'",
  ];
  for (const control of requiredControls) {
    if (!source.includes(control)) errors.push(`CANONICAL_CLAIM_RUNTIME_CONTROL_MISSING:${control}`);
  }
  if (/\bFOR\s+(?:UPDATE|NO\s+KEY\s+UPDATE|SHARE|KEY\s+SHARE)\b/i.test(source)) {
    errors.push('CANONICAL_CLAIM_RUNTIME_ROW_LOCK_REQUIRES_PROHIBITED_UPDATE_PRIVILEGE');
  }
  return { errors };
}

export function inspectWorkflowReceiptRelationTruth(contract, readme, runbook) {
  const errors = [];
  const ledger = contract.workflow_receipt_ledger || {};
  const relation = ledger.canonical_relation_binding || {};
  const expectedLeaderMatch = [
    'canonical_claim_id', 'repository', 'leader_workflow_path',
    'leader_workflow_run_id', 'leader_workflow_run_attempt', 'leader_claim_binding_digest',
  ];
  const expectedAliasMatch = [
    'canonical_claim_id', 'parent_claim_repository', 'repository', 'alias_workflow_path',
    'alias_workflow_run_id', 'alias_workflow_run_attempt', 'alias_binding_digest',
  ];
  if (JSON.stringify(ledger.database_privileges) !== JSON.stringify(['SELECT', 'INSERT'])) {
    errors.push('WORKFLOW_RECEIPT_DATABASE_PRIVILEGES_NOT_SELECT_INSERT_ONLY');
  }
  if (relation.state !== 'DATABASE_AND_RUNTIME_EXACT_FAIL_CLOSED') {
    errors.push('WORKFLOW_RECEIPT_CANONICAL_RELATION_STATE_WEAKENED');
  }
  if (relation.none !== 'ALL_CANONICAL_FIELDS_NULL') {
    errors.push('WORKFLOW_RECEIPT_CANONICAL_NONE_NOT_ALL_NULL');
  }
  if (JSON.stringify(relation.leader_match) !== JSON.stringify(expectedLeaderMatch)) {
    errors.push('WORKFLOW_RECEIPT_CANONICAL_LEADER_MATCH_INCOMPLETE');
  }
  if (JSON.stringify(relation.alias_match) !== JSON.stringify(expectedAliasMatch)) {
    errors.push('WORKFLOW_RECEIPT_CANONICAL_ALIAS_MATCH_INCOMPLETE');
  }
  if (JSON.stringify(relation.runtime_verification) !== JSON.stringify(['PRE_INSERT', 'READBACK'])) {
    errors.push('WORKFLOW_RECEIPT_CANONICAL_RUNTIME_VERIFICATION_INCOMPLETE');
  }
  if (relation.forged_relation_digest_run_cross_claim_or_missing_alias !== 'ROLLBACK_AND_HOLD') {
    errors.push('WORKFLOW_RECEIPT_CANONICAL_FORGERY_NOT_HOLD');
  }
  if (relation.row_locking !== 'NOT_USED_UPDATE_PRIVILEGE_NOT_GRANTED') {
    errors.push('WORKFLOW_RECEIPT_ROW_LOCK_PRIVILEGE_BOUNDARY_WEAKENED');
  }
  for (const marker of [
    'SECURITY INVOKER database trigger',
    'exact alias row and parent claim',
    'Forged relations, digests',
    'row-locking SELECT forms are intentionally',
    'SELECT/INSERT-only',
  ]) {
    if (!readme.includes(marker)) errors.push(`WORKFLOW_RECEIPT_README_TRUTH_MISSING:${marker}`);
  }
  for (const marker of [
    'forged LEADER/ALIAS relation',
    'cross-claim binding',
    'missing-alias negative',
    'remote receipt finalization remains `HOLD`',
  ]) {
    if (!runbook.includes(marker)) errors.push(`WORKFLOW_RECEIPT_RUNBOOK_TRUTH_MISSING:${marker}`);
  }
  return { errors };
}

export function inspectCommonControlFoundation(controlPlane, foundation, sources) {
  const errors = [];
  const boundary = controlPlane.common_control_foundation || {};
  if (boundary.state !== 'VERIFIED_PASS_LOCAL_CONTRACT_REMOTE_INTEGRATION_HOLD') errors.push('COMMON_CONTROL_STATE_OVERCLAIMED');
  if (boundary.contract !== 'contracts/common-control-foundation-v1.json') errors.push('COMMON_CONTROL_CONTRACT_POINTER_INVALID');
  if (boundary.scope !== 'LOCAL_SYNTHETIC_SHADOW_ONLY') errors.push('COMMON_CONTROL_SCOPE_WEAKENED');
  if (boundary.admission_default !== 'DENY') errors.push('COMMON_CONTROL_ADMISSION_NOT_DEFAULT_DENY');
  if (boundary.only_manifest_mode !== 'SHADOW_NO_FETCH') errors.push('COMMON_CONTROL_MANIFEST_MODE_WEAKENED');
  if (boundary.broker_external_egress !== false || boundary.broker_credential_resolution !== false) {
    errors.push('COMMON_CONTROL_BROKER_EXTERNAL_CAPABILITY_ENABLED');
  }
  if (boundary.production !== 'HOLD' || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('COMMON_CONTROL_PROTECTED_GATE_WEAKENED');
  }
  if (foundation.contract_id !== 'KIDULTS_COMMON_CONTROL_FOUNDATION_V1' || foundation.version !== '1.0.0') {
    errors.push('COMMON_CONTROL_FOUNDATION_ID_VERSION_INVALID');
  }
  if (foundation.state !== 'VERIFIED_PASS_LOCAL_CONTRACT_REMOTE_INTEGRATION_HOLD') {
    errors.push('COMMON_CONTROL_FOUNDATION_STATE_INVALID');
  }
  if (foundation.scope !== 'LOCAL_SYNTHETIC_SHADOW_ONLY') errors.push('COMMON_CONTROL_FOUNDATION_SCOPE_INVALID');
  if (foundation.production !== 'HOLD' || foundation.public_release !== 'HOLD' || foundation.g5 !== 'HOLD') {
    errors.push('COMMON_CONTROL_FOUNDATION_PROTECTED_GATE_WEAKENED');
  }
  const requiredInvariants = [
    'ORCHESTRATOR_CANNOT_CALL_EXTERNAL_SOURCE_DIRECTLY',
    'UNKNOWN_REQUEST_MODE_FAILS_CLOSED',
    'ONLY_SYNTHETIC_SHADOW_CAN_RECEIVE_A_MANIFEST',
    'MANIFEST_BINDS_REQUEST_DECISION_POLICY_REGISTRY_KILL_EPOCH_AND_ENDPOINT',
    'BROKER_REVALIDATES_CURRENT_POLICY_REGISTRY_AND_KILL_STATE',
    'RETRY_CANNOT_REUSE_CHANGED_OR_EXPIRED_AUTHORITY',
    'BROKER_PERFORMS_NO_NETWORK_OR_CREDENTIAL_OPERATION',
    'EVERY_ACCEPTED_SHADOW_ATTEMPT_EMITS_A_DIGEST_BOUND_RECEIPT',
    'PRODUCTION_PUBLIC_G5_REMAIN_HOLD',
  ];
  for (const invariant of requiredInvariants) {
    if (!foundation.invariants?.includes(invariant)) errors.push(`COMMON_CONTROL_INVARIANT_MISSING:${invariant}`);
  }
  const sourceText = Object.values(sources).join('\n');
  for (const pattern of [
    /\bfetch\s*\(/, /node:(?:http|https|net|tls|dgram|dns|child_process)/,
    /\b(?:axios|undici|XMLHttpRequest|WebSocket)\b/, /process\.env/,
  ]) {
    if (pattern.test(sourceText)) errors.push(`COMMON_CONTROL_EXTERNAL_CAPABILITY_PROHIBITED:${pattern.source}`);
  }
  for (const marker of [
    "requestedMode === 'EXTERNAL_FETCH'", "requestedMode === 'CREDENTIAL_ACCESS'",
    "requestedMode === 'PRODUCTION'", "requestedMode === 'PUBLIC'", "requestedMode === 'G5'",
    "allowedMode: 'SHADOW_NO_FETCH'", 'manifest.killEpoch !== state.killEpoch',
    'manifest.policyRevision !== state.policyRevision', 'manifest.registryRevision !== state.registryRevision',
    'egressAttempted: false', 'credentialResolved: false',
  ]) {
    if (!sourceText.includes(marker)) errors.push(`COMMON_CONTROL_RUNTIME_MARKER_MISSING:${marker}`);
  }
  return { errors };
}

export function inspectCryptographicApprovalEnvelope(controlPlane, approvalContract, source) {
  const errors = [];
  const boundary = controlPlane.cryptographic_approval_envelope || {};
  if (boundary.state !== 'LOCAL_SIGNATURE_VERIFIER_READY_TRUST_ROOTS_UNREGISTERED_HOLD'
    || boundary.contract !== 'contracts/approval-authority-matrix-v1.json'
    || boundary.scope !== 'OFFLINE_EXACT_ENVELOPE_VERIFICATION_ONLY') {
    errors.push('CRYPTOGRAPHIC_APPROVAL_BOUNDARY_INVALID');
  }
  if (boundary.trust_roots !== 'NOT_REGISTERED_HOLD'
    || boundary.supervisor_invocation_wiring !== 'NOT_WIRED_HOLD'
    || boundary.provider_preflight_wiring !== 'NOT_WIRED_HOLD'
    || boundary.protected_action_wiring !== 'NOT_WIRED_HOLD'
    || boundary.signing_capability !== false || boundary.activation_authorized !== false
    || boundary.provider_contact !== false || boundary.external_egress !== false
    || boundary.credential_resolution !== false || boundary.production !== 'HOLD'
    || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('CRYPTOGRAPHIC_APPROVAL_CAPABILITY_ENABLED');
  }
  if (approvalContract.contract_id !== 'KIDULTS_APPROVAL_AUTHORITY_MATRIX_V1'
    || approvalContract.version !== '1.0.0'
    || approvalContract.state !== 'LOCAL_SIGNATURE_VERIFIER_READY_TRUST_ROOTS_UNREGISTERED_HOLD'
    || approvalContract.scope !== 'OFFLINE_EXACT_ENVELOPE_VERIFICATION_ONLY'
    || approvalContract.runtime_module !== 'src/common-control/approval-envelope-v1.mjs') {
    errors.push('CRYPTOGRAPHIC_APPROVAL_CONTRACT_INVALID');
  }
  if (approvalContract.integration?.single_use_consumption_contract
      !== 'contracts/approval-consumption-ledger-v1.json'
    || approvalContract.integration?.single_use_consumption_state
      !== 'LOCAL_APPEND_ONLY_CONSUMPTION_READY_TRUST_ROOTS_AND_WIRING_HOLD') {
    errors.push('CRYPTOGRAPHIC_APPROVAL_CONSUMPTION_POINTER_INVALID');
  }
  const expectedClasses = {
    LOCAL_SYNTHETIC_SHADOW: ['SUPERVISOR_INVOCATION', ['KPMO'], 300, false],
    PROVIDER_PREFLIGHT_NO_FETCH: ['PROVIDER_ACTION', ['KPMO', 'TRACK_A', 'TRACK_Z'], 3600, false],
    PROTECTED_ACTION_PACKAGE: ['PROTECTED_ACTION_PACKAGE', ['KPMO', 'PROGRAM_OWNER'], 900, true],
  };
  for (const [authorityClass, [subjectType, roles, lifetime, protectedAllowed]]
    of Object.entries(expectedClasses)) {
    const actual = approvalContract.authority_classes?.[authorityClass];
    if (actual?.subject_type !== subjectType
      || JSON.stringify(actual?.required_roles) !== JSON.stringify(roles)
      || actual?.maximum_lifetime_seconds !== lifetime
      || actual?.protected_capability_requests_allowed !== protectedAllowed) {
      errors.push(`CRYPTOGRAPHIC_APPROVAL_AUTHORITY_CLASS_INVALID:${authorityClass}`);
    }
  }
  const trust = approvalContract.trust_registry || {};
  if (trust.state !== 'CALLER_PINNED_PUBLIC_KEYS_ONLY_HOLD'
    || trust.expected_registry_digest_required !== true || trust.algorithm !== 'Ed25519'
    || JSON.stringify(trust.registered_repository_trust_roots) !== '[]'
    || trust.private_key_storage !== 'PROHIBITED'
    || trust.key_generation_or_signing !== 'NOT_IMPLEMENTED_HOLD'
    || trust.real_role_identity_binding !== 'NOT_REGISTERED_HOLD') {
    errors.push('CRYPTOGRAPHIC_APPROVAL_TRUST_ROOT_BOUNDARY_INVALID');
  }
  if (approvalContract.verification_receipt?.state
      !== 'SIGNATURES_VERIFIED_AUTHORITY_NOT_ACTIVATED'
    || approvalContract.verification_receipt?.activation_authorized !== false
    || approvalContract.verification_receipt?.provider_contact_executed !== false
    || approvalContract.verification_receipt?.external_egress !== false
    || approvalContract.verification_receipt?.credential_resolution !== false
    || approvalContract.verification_receipt?.production !== 'HOLD'
    || approvalContract.verification_receipt?.public !== 'HOLD'
    || approvalContract.verification_receipt?.g5 !== 'HOLD') {
    errors.push('CRYPTOGRAPHIC_APPROVAL_RECEIPT_OVERCLAIMED');
  }
  for (const marker of [
    "verify as verifySignature", 'createPublicKey', "entry.algorithm === 'Ed25519'",
    'expectedTrustRegistryDigest',
    'APPROVAL_TRUST_REGISTRY_PIN_MISMATCH', 'APPROVAL_SIGNATURE_ROLE_QUORUM_INVALID',
    'APPROVAL_SIGNATURE_TRUST_BINDING_INVALID', 'APPROVAL_ENVELOPE_EXPIRED_OR_NOT_YET_VALID',
    "state: 'SIGNATURES_VERIFIED_AUTHORITY_NOT_ACTIVATED'", 'activationAuthorized: false',
    'providerContactExecuted: false', 'externalEgress: false', 'credentialResolution: false',
    "production: 'HOLD'", "publicRelease: 'HOLD'", "g5: 'HOLD'",
  ]) if (!source.includes(marker)) {
    errors.push(`CRYPTOGRAPHIC_APPROVAL_RUNTIME_CONTROL_MISSING:${marker}`);
  }
  for (const pattern of [
    /generateKeyPair|createPrivateKey|privateKeyPem|\bsign\s*\(/, /\bfetch\s*\(/,
    /node:(?:http|https|net|tls|dgram|dns|fs|child_process)/,
    /\b(?:axios|undici|XMLHttpRequest|WebSocket)\b/, /process\.env/, /\bimport\s*\(/,
    /setInterval|setTimeout|cron|scheduleEvent/,
  ]) if (pattern.test(source)) {
    errors.push(`CRYPTOGRAPHIC_APPROVAL_PROHIBITED_CAPABILITY:${pattern.source}`);
  }
  return { errors };
}

export function inspectCryptographicApprovalConsumption(controlPlane, consumptionContract,
  source, sql) {
  const errors = [];
  const boundary = controlPlane.cryptographic_approval_consumption || {};
  if (boundary.state !== 'LOCAL_APPEND_ONLY_CONSUMPTION_READY_TRUST_ROOTS_AND_WIRING_HOLD'
    || boundary.contract !== 'contracts/approval-consumption-ledger-v1.json'
    || boundary.scope !== 'OFFLINE_SIGNATURE_VERIFICATION_AND_SINGLE_USE_RECORDING_ONLY') {
    errors.push('APPROVAL_CONSUMPTION_BOUNDARY_INVALID');
  }
  if (boundary.trust_roots !== 'NOT_REGISTERED_HOLD'
    || boundary.single_use_fence !== 'POSTGRESQL_UNIQUE_ENVELOPE_AND_NONCE_INSERT_CAS'
    || boundary.remote_postgresql !== 'HOLD'
    || boundary.real_postgresql_concurrency !== 'NOT_VERIFIED'
    || boundary.supervisor_invocation_wiring !== 'NOT_WIRED_HOLD'
    || boundary.provider_preflight_wiring !== 'NOT_WIRED_HOLD'
    || boundary.protected_action_wiring !== 'NOT_WIRED_HOLD'
    || boundary.activation_authorized !== false || boundary.external_egress !== false
    || boundary.credential_resolution !== false || boundary.production !== 'HOLD'
    || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('APPROVAL_CONSUMPTION_CAPABILITY_ENABLED');
  }
  if (consumptionContract.contract_id !== 'KIDULTS_APPROVAL_CONSUMPTION_LEDGER_V1'
    || consumptionContract.version !== '1.0.0'
    || consumptionContract.state
      !== 'LOCAL_APPEND_ONLY_CONSUMPTION_READY_TRUST_ROOTS_AND_WIRING_HOLD'
    || consumptionContract.runtime_module !== 'src/common-control/approval-consumption-v1.mjs'
    || consumptionContract.migration
      !== 'migrations/postgres/0007_cryptographic_approval_consumption.sql') {
    errors.push('APPROVAL_CONSUMPTION_CONTRACT_INVALID');
  }
  if (consumptionContract.consumption_boundary?.signature_verification_before_database !== true
    || consumptionContract.consumption_boundary?.exact_expected_subject_required !== true
    || consumptionContract.consumption_boundary?.unique_envelope_id !== true
    || consumptionContract.consumption_boundary?.unique_envelope_digest !== true
    || consumptionContract.consumption_boundary?.unique_nonce_digest !== true
    || consumptionContract.consumption_boundary?.same_envelope_replay !== 'ALREADY_CONSUMED_HOLD'
    || consumptionContract.consumption_boundary?.nonce_reuse_with_different_envelope
      !== 'REPLAY_CONFLICT_ROLLBACK'
    || consumptionContract.consumption_boundary?.activation_authorized !== false
    || consumptionContract.persistence_boundary?.database_role
      !== 'kidults_control_approval_consumer'
    || JSON.stringify(consumptionContract.persistence_boundary?.database_privileges)
      !== JSON.stringify(['SELECT', 'INSERT'])
    || consumptionContract.persistence_boundary?.append_only !== true) {
    errors.push('APPROVAL_CONSUMPTION_FENCE_WEAKENED');
  }
  if (consumptionContract.integration?.supervisor_invocation_wiring !== 'NOT_WIRED_HOLD'
    || consumptionContract.integration?.provider_preflight_wiring !== 'NOT_WIRED_HOLD'
    || consumptionContract.integration?.protected_action_wiring !== 'NOT_WIRED_HOLD'
    || consumptionContract.integration?.automatic_trigger !== 'NOT_REGISTERED_HOLD'
    || consumptionContract.external_egress !== false
    || consumptionContract.credential_resolution !== false
    || consumptionContract.production !== 'HOLD'
    || consumptionContract.public_release !== 'HOLD' || consumptionContract.g5 !== 'HOLD') {
    errors.push('APPROVAL_CONSUMPTION_CONTRACT_CAPABILITY_ENABLED');
  }
  for (const invariant of [
    'SIGNATURE_QUORUM_AND_EXPECTED_SUBJECT_VERIFY_BEFORE_DATABASE_ACCESS',
    'ENVELOPE_ID_ENVELOPE_DIGEST_AND_NONCE_DIGEST_ARE_SINGLE_USE',
    'EXACT_REPLAY_NEVER_EMITS_A_SECOND_CONSUMPTION_RECEIPT',
    'NONCE_REUSE_ACROSS_DIFFERENT_ENVELOPES_ROLLS_BACK',
    'VALID_CONSUMPTION_NEVER_ACTIVATES_RUNTIME_OR_PROTECTED_CAPABILITY',
  ]) if (!consumptionContract.invariants?.includes(invariant)) {
    errors.push(`APPROVAL_CONSUMPTION_INVARIANT_MISSING:${invariant}`);
  }
  for (const marker of [
    "const WRITER_ID = 'kpmo-approval-consumption-writer-v1'",
    'verifyCryptographicApprovalEnvelope({', 'bindExpectedSubject(verification, expectedSubject)',
    'ON CONFLICT DO NOTHING RETURNING *', 'WHERE envelope_id=$1 OR nonce_digest=$2',
    "state: 'ALREADY_CONSUMED_HOLD'", "state: 'CONSUMED_AUTHORITY_NOT_ACTIVATED'",
    'activationAuthorized: false', 'providerContactExecuted: false',
    'externalEgress: false', 'credentialResolution: false',
    "production: 'HOLD'", "publicRelease: 'HOLD'", "g5: 'HOLD'",
  ]) if (!source.includes(marker)) {
    errors.push(`APPROVAL_CONSUMPTION_RUNTIME_CONTROL_MISSING:${marker}`);
  }
  const preparedBeforeDatabase = source.indexOf('const prepared = prepareCryptographicApprovalConsumption({')
    < source.indexOf('await begin(client)');
  const directVerificationBeforeDatabase = source.indexOf('verifyCryptographicApprovalEnvelope({')
    < source.indexOf('await begin(client)');
  if (!preparedBeforeDatabase && !directVerificationBeforeDatabase) {
    errors.push('APPROVAL_CONSUMPTION_VERIFY_AFTER_DATABASE');
  }
  for (const marker of [
    'CREATE ROLE kidults_control_approval_consumer',
    'CREATE TABLE kidults_control.cryptographic_approval_consumptions',
    'nonce_digest text NOT NULL UNIQUE', 'cryptographic_approval_consumptions_append_only',
    'cryptographic_approval_consumptions_truncate_denied',
    'REVOKE ALL ON kidults_control.cryptographic_approval_consumptions FROM PUBLIC',
    'GRANT SELECT, INSERT ON kidults_control.cryptographic_approval_consumptions',
  ]) if (!sql.includes(marker)) {
    errors.push(`APPROVAL_CONSUMPTION_SCHEMA_CONTROL_MISSING:${marker}`);
  }
  for (const pattern of [
    /generateKeyPair|createPrivateKey|privateKeyPem|\bsign\s*\(/, /\bfetch\s*\(/,
    /node:(?:http|https|net|tls|dgram|dns|fs|child_process)/,
    /\b(?:axios|undici|XMLHttpRequest|WebSocket)\b/, /process\.env/, /\bimport\s*\(/,
    /setInterval|setTimeout|cron|scheduleEvent/,
  ]) if (pattern.test(source)) {
    errors.push(`APPROVAL_CONSUMPTION_PROHIBITED_CAPABILITY:${pattern.source}`);
  }
  return { errors };
}

export function inspectApprovalTrustRootLifecycle(controlPlane, lifecycleContract, source, sql) {
  const errors = [];
  const boundary = controlPlane.approval_trust_root_lifecycle || {};
  if (boundary.state !== 'LOCAL_SYNTHETIC_LIFECYCLE_READY_REAL_KEYS_AND_WIRING_HOLD'
    || boundary.contract !== 'contracts/approval-trust-root-lifecycle-v1.json'
    || boundary.scope !== 'PUBLIC_KEY_ONLY_LOCAL_SYNTHETIC_TEST') {
    errors.push('TRUST_ROOT_LIFECYCLE_BOUNDARY_INVALID');
  }
  if (boundary.real_keys_registered !== 0 || boundary.private_key_capability !== false
    || boundary.verifier_wiring !== 'NOT_WIRED_HOLD' || boundary.remote_postgresql !== 'HOLD'
    || boundary.real_postgresql_concurrency !== 'NOT_VERIFIED'
    || boundary.activation_authorized !== false || boundary.external_egress !== false
    || boundary.credential_resolution !== false || boundary.production !== 'HOLD'
    || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('TRUST_ROOT_LIFECYCLE_CAPABILITY_ENABLED');
  }
  if (lifecycleContract.contract_id !== 'KIDULTS_APPROVAL_TRUST_ROOT_LIFECYCLE_V1'
    || lifecycleContract.version !== '1.0.0'
    || lifecycleContract.state !== 'LOCAL_SYNTHETIC_LIFECYCLE_READY_REAL_KEYS_AND_WIRING_HOLD'
    || lifecycleContract.runtime_module !== 'src/common-control/approval-trust-root-lifecycle-v1.mjs'
    || lifecycleContract.migration !== 'migrations/postgres/0008_approval_trust_root_lifecycle.sql') {
    errors.push('TRUST_ROOT_LIFECYCLE_CONTRACT_INVALID');
  }
  if (lifecycleContract.controls?.public_key_only !== true
    || lifecycleContract.controls?.unique_key_id !== true
    || lifecycleContract.controls?.unique_key_fingerprint !== true
    || lifecycleContract.controls?.exact_role_binding !== true
    || lifecycleContract.controls?.exact_predecessor_rotation !== true
    || lifecycleContract.controls?.single_active_synthetic_key_per_role !== true
    || lifecycleContract.controls?.revocation_priority !== 'TERMINAL_AND_IRREVERSIBLE'
    || lifecycleContract.controls?.verifier_wiring !== 'NOT_WIRED_HOLD'
    || lifecycleContract.controls?.real_role_identity_binding !== 'NOT_REGISTERED_HOLD'
    || lifecycleContract.controls?.activation_authorized !== false
    || lifecycleContract.persistence_boundary?.database_role !== 'kidults_control_trust_root_lifecycle'
    || JSON.stringify(lifecycleContract.persistence_boundary?.database_privileges)
      !== JSON.stringify(['SELECT', 'INSERT'])
    || lifecycleContract.persistence_boundary?.append_only !== true
    || lifecycleContract.external_egress !== false
    || lifecycleContract.credential_resolution !== false
    || lifecycleContract.production !== 'HOLD'
    || lifecycleContract.public_release !== 'HOLD' || lifecycleContract.g5 !== 'HOLD') {
    errors.push('TRUST_ROOT_LIFECYCLE_FENCE_WEAKENED');
  }
  for (const marker of [
    "const ROLES = Object.freeze(['KPMO', 'PROGRAM_OWNER', 'TRACK_A', 'TRACK_Z'])",
    "const OPERATIONS = Object.freeze(['ACTIVATE_SYNTHETIC_ONLY', 'REVOKE'])",
    "scope: 'LOCAL_SYNTHETIC_TEST_ONLY'", "state: 'CANDIDATE_HOLD'",
    "'TRUST_ROOT_CANDIDATE_DUPLICATE'", "'TRUST_ROOT_ROTATION_PREDECESSOR_MISMATCH'",
    "'TRUST_ROOT_TERMINAL_STATE'", 'verifierWired: false', 'activationAuthorized: false',
    "production: 'HOLD'", "publicRelease: 'HOLD'", "g5: 'HOLD'",
  ]) if (!source.includes(marker)) errors.push(`TRUST_ROOT_LIFECYCLE_RUNTIME_CONTROL_MISSING:${marker}`);
  for (const marker of [
    'CREATE ROLE kidults_control_trust_root_lifecycle',
    'CREATE TABLE kidults_control.approval_trust_root_candidates',
    'CREATE TABLE kidults_control.approval_trust_root_lifecycle_events',
    'UNIQUE (key_id, candidate_digest)', 'UNIQUE (key_id, revision)',
    'approval_trust_root_candidates_append_only',
    'approval_trust_root_lifecycle_events_append_only',
    'approval_trust_root_candidates_truncate_denied',
    'approval_trust_root_lifecycle_events_truncate_denied',
    'GRANT SELECT, INSERT ON kidults_control.approval_trust_root_candidates',
    'GRANT SELECT, INSERT ON kidults_control.approval_trust_root_lifecycle_events',
  ]) if (!sql.includes(marker)) errors.push(`TRUST_ROOT_LIFECYCLE_SCHEMA_CONTROL_MISSING:${marker}`);
  for (const pattern of [
    /generateKeyPair|createPrivateKey|privateKeyPem|\bsign\s*\(/, /\bfetch\s*\(/,
    /node:(?:http|https|net|tls|dgram|dns|fs|child_process)/,
    /\b(?:axios|undici|XMLHttpRequest|WebSocket)\b/, /process\.env/, /\bimport\s*\(/,
    /setInterval|setTimeout|cron|scheduleEvent/,
  ]) if (pattern.test(source)) errors.push(`TRUST_ROOT_LIFECYCLE_PROHIBITED_CAPABILITY:${pattern.source}`);
  return { errors };
}

export function inspectApprovalTrustRegistryCompiler(controlPlane, compilerContract, source) {
  const errors = [];
  const boundary = controlPlane.approval_trust_registry_compiler || {};
  if (boundary.state !== 'LOCAL_SYNTHETIC_COMPILER_READY_EXPLICIT_CALLER_HANDOFF_ONLY'
    || boundary.contract !== 'contracts/approval-trust-registry-compiler-v1.json'
    || boundary.scope !== 'DETERMINISTIC_ACTIVE_SYNTHETIC_PUBLIC_KEY_COMPILATION') {
    errors.push('TRUST_REGISTRY_COMPILER_BOUNDARY_INVALID');
  }
  if (boundary.real_keys_registered !== 0 || boundary.private_key_capability !== false
    || boundary.caller_registry_digest_pin_required !== true
    || boundary.automatic_verifier_wiring !== 'NOT_WIRED_HOLD'
    || boundary.supervisor_invocation_wiring !== 'NOT_WIRED_HOLD'
    || boundary.provider_preflight_wiring !== 'NOT_WIRED_HOLD'
    || boundary.protected_action_wiring !== 'NOT_WIRED_HOLD'
    || boundary.activation_authorized !== false || boundary.external_egress !== false
    || boundary.credential_resolution !== false || boundary.production !== 'HOLD'
    || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('TRUST_REGISTRY_COMPILER_CAPABILITY_ENABLED');
  }
  if (compilerContract.contract_id !== 'KIDULTS_APPROVAL_TRUST_REGISTRY_COMPILER_V1'
    || compilerContract.version !== '1.0.0'
    || compilerContract.state !== 'LOCAL_SYNTHETIC_COMPILER_READY_EXPLICIT_CALLER_HANDOFF_ONLY'
    || compilerContract.scope !== 'DETERMINISTIC_ACTIVE_SYNTHETIC_PUBLIC_KEY_COMPILATION'
    || compilerContract.runtime_module
      !== 'src/common-control/approval-trust-registry-compiler-v1.mjs'
    || compilerContract.input_contract !== 'contracts/approval-trust-root-lifecycle-v1.json') {
    errors.push('TRUST_REGISTRY_COMPILER_CONTRACT_INVALID');
  }
  const controls = compilerContract.controls || {};
  if (controls.full_lifecycle_revalidation !== true
    || controls.active_synthetic_keys_only !== true
    || controls.maximum_one_active_key_per_role !== true
    || controls.deterministic_role_and_key_order !== true
    || controls.candidate_set_digest_bound !== true || controls.event_set_digest_bound !== true
    || controls.lifecycle_state_digest_bound !== true
    || controls.exact_registry_digest_pin_required !== true
    || controls.reproducible_handoff_required !== true
    || controls.revoked_or_superseded_key_emission !== 'PROHIBITED'
    || controls.private_key_capability !== false
    || controls.automatic_verifier_wiring !== 'NOT_WIRED_HOLD'
    || controls.activation_authorized !== false
    || compilerContract.external_egress !== false
    || compilerContract.credential_resolution !== false
    || compilerContract.production !== 'HOLD'
    || compilerContract.public_release !== 'HOLD' || compilerContract.g5 !== 'HOLD') {
    errors.push('TRUST_REGISTRY_COMPILER_FENCE_WEAKENED');
  }
  for (const marker of [
    'deriveTrustRootLifecycle({', 'verifyTrustRootCandidate', 'verifyTrustRootLifecycleEvent',
    'candidateSetDigest = digestObject(orderedCandidates)',
    'eventSetDigest = digestObject(orderedEvents)',
    'lifecycleStateDigest = digestObject(lifecycle)',
    "state: 'CALLER_PINNED_PUBLIC_KEYS_ONLY_HOLD'",
    "state: 'SYNTHETIC_REGISTRY_COMPILED_CALLER_PIN_REQUIRED'",
    "'TRUST_REGISTRY_NO_ACTIVE_SYNTHETIC_KEYS'", 'verifierWired: false',
    'activationAuthorized: false', "production: 'HOLD'", "publicRelease: 'HOLD'", "g5: 'HOLD'",
  ]) if (!source.includes(marker)) errors.push(`TRUST_REGISTRY_COMPILER_CONTROL_MISSING:${marker}`);
  for (const pattern of [
    /generateKeyPair|createPrivateKey|privateKeyPem|\bsign\s*\(/, /\bfetch\s*\(/,
    /node:(?:http|https|net|tls|dgram|dns|fs|child_process)/,
    /\b(?:axios|undici|XMLHttpRequest|WebSocket)\b/, /process\.env/, /\bimport\s*\(/,
    /setInterval|setTimeout|cron|scheduleEvent/,
  ]) if (pattern.test(source)) errors.push(`TRUST_REGISTRY_COMPILER_PROHIBITED_CAPABILITY:${pattern.source}`);
  return { errors };
}

export function inspectTrustHandoffControlBundle(controlPlane, bundleContract, sources, sql) {
  const errors = [];
  const boundary = controlPlane.approval_trust_handoff_control_bundle || {};
  if (boundary.state !== 'LOCAL_SYNTHETIC_EXACT_HANDOFF_FENCE_READY_NONATOMIC_GATEWAY_RETIRED'
    || boundary.contract !== 'contracts/approval-trust-handoff-control-bundle-v1.json'
    || boundary.scope !== 'EXACT_SNAPSHOT_RESOLUTION_AND_DETERMINISTIC_CURRENT_STATE_FENCE') {
    errors.push('TRUST_HANDOFF_BUNDLE_BOUNDARY_INVALID');
  }
  if (boundary.real_keys_registered !== 0 || boundary.current_lifecycle_digest_pin_required !== true
    || boundary.stale_registry_policy !== 'DENY_BEFORE_VERIFICATION_OR_CONSUMPTION'
    || boundary.remote_postgresql !== 'HOLD'
    || boundary.real_postgresql_concurrency !== 'NOT_VERIFIED'
    || boundary.automatic_trigger !== 'NOT_REGISTERED_HOLD'
    || boundary.activation_authorized !== false || boundary.external_egress !== false
    || boundary.credential_resolution !== false || boundary.production !== 'HOLD'
    || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('TRUST_HANDOFF_BUNDLE_CAPABILITY_ENABLED');
  }
  if (bundleContract.contract_id !== 'KIDULTS_APPROVAL_TRUST_HANDOFF_CONTROL_BUNDLE_V1'
    || bundleContract.version !== '1.0.0'
    || bundleContract.state !== 'LOCAL_SYNTHETIC_EXACT_HANDOFF_FENCE_READY_NONATOMIC_GATEWAY_RETIRED'
    || bundleContract.migration !== 'migrations/postgres/0009_approval_trust_registry_snapshots.sql'
    || bundleContract.modules?.length !== 4) errors.push('TRUST_HANDOFF_BUNDLE_CONTRACT_INVALID');
  const controls = bundleContract.controls || {};
  if (controls.append_only_snapshot !== true
    || controls.exact_registry_id_and_digest_resolution !== true
    || controls.externally_pinned_current_lifecycle_digest_required !== true
    || controls.stale_rotated_or_revoked_snapshot_denied !== true
    || controls.fence_before_signature_verification !== true
    || controls.fence_before_nonce_consumption !== true
    || controls.non_atomic_gateway !== 'RETIRED_FAIL_CLOSED'
    || controls.real_role_keys_registered !== 0
    || controls.automatic_trigger !== 'NOT_REGISTERED_HOLD'
    || controls.activation_authorized !== false
    || bundleContract.external_egress !== false || bundleContract.credential_resolution !== false
    || bundleContract.production !== 'HOLD' || bundleContract.public_release !== 'HOLD'
    || bundleContract.g5 !== 'HOLD') errors.push('TRUST_HANDOFF_BUNDLE_FENCE_WEAKENED');
  const sourceText = Object.values(sources).join('\n');
  for (const marker of [
    'recordCompiledTrustRegistrySnapshot', 'resolveExactTrustRegistrySnapshot',
    'fenceCurrentTrustRegistry', 'verifyAndConsumeWithCurrentTrustRegistry',
    'expectedCurrentLifecycleStateDigest', 'TRUST_REGISTRY_FENCE_STALE_OR_REVOKED',
    'TRUST_HANDOFF_GATEWAY_RETIRED_USE_ATOMIC_CURRENT_HEAD',
  ]) if (!sourceText.includes(marker)) errors.push(`TRUST_HANDOFF_BUNDLE_CONTROL_MISSING:${marker}`);
  for (const marker of [
    'CREATE ROLE kidults_control_trust_registry_snapshot',
    'CREATE TABLE kidults_control.approval_trust_registry_snapshots',
    'approval_trust_registry_snapshots_append_only',
    'approval_trust_registry_snapshots_truncate_denied',
    'GRANT SELECT, INSERT ON kidults_control.approval_trust_registry_snapshots',
    'GRANT SELECT ON kidults_control.approval_trust_registry_snapshots',
  ]) if (!sql.includes(marker)) errors.push(`TRUST_HANDOFF_BUNDLE_SCHEMA_MISSING:${marker}`);
  return { errors };
}

export function inspectApprovalTrustAtomicHead(controlPlane, atomicContract, sources, sql) {
  const errors = [];
  const boundary = controlPlane.approval_trust_atomic_head || {};
  if (boundary.state !== 'LOCAL_SYNTHETIC_ATOMIC_CURRENT_HEAD_GATEWAY_READY_REMOTE_AND_REAL_KEYS_HOLD'
    || boundary.contract !== 'contracts/approval-trust-atomic-head-v1.json'
    || boundary.scope !== 'APPEND_ONLY_CURRENT_HEAD_TOMBSTONE_AND_LOCKED_SINGLE_USE_CONSUMPTION') {
    errors.push('TRUST_ATOMIC_HEAD_BOUNDARY_INVALID');
  }
  if (boundary.real_keys_registered !== 0 || boundary.revocation_tombstone !== true
    || boundary.publisher_consumer_shared_transaction_lock !== true
    || boundary.remote_postgresql !== 'HOLD'
    || boundary.real_postgresql_concurrency !== 'NOT_VERIFIED'
    || boundary.automatic_trigger !== 'NOT_REGISTERED_HOLD'
    || boundary.activation_authorized !== false || boundary.external_egress !== false
    || boundary.credential_resolution !== false || boundary.production !== 'HOLD'
    || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('TRUST_ATOMIC_HEAD_CAPABILITY_ENABLED');
  }
  if (atomicContract.contract_id !== 'KIDULTS_APPROVAL_TRUST_ATOMIC_HEAD_V1'
    || atomicContract.version !== '1.0.0'
    || atomicContract.state !== boundary.state
    || atomicContract.migration !== 'migrations/postgres/0010_approval_trust_current_heads.sql'
    || atomicContract.modules?.length !== 4) errors.push('TRUST_ATOMIC_HEAD_CONTRACT_INVALID');
  const controls = atomicContract.controls || {};
  if (controls.append_only_current_head !== true || controls.revocation_tombstone !== true
    || controls.previous_head_digest_chain !== true
    || controls.publisher_consumer_shared_transaction_lock !== 'kidults.approval-trust-current-head.v1'
    || controls.current_head_read_and_nonce_insert_same_transaction !== true
    || controls.stale_rotated_or_revoked_registry_denied_before_consumption !== true
    || controls.non_atomic_gateway !== 'RETIRED_FAIL_CLOSED'
    || controls.runtime_consumption_entrypoint !== 'verifyAndConsumeCurrentApprovalTrust'
    || controls.exact_lifecycle_digest_pin_required !== true
    || controls.real_role_keys_registered !== 0 || controls.activation_authorized !== false
    || atomicContract.external_egress !== false || atomicContract.production !== 'HOLD'
    || atomicContract.public_release !== 'HOLD' || atomicContract.g5 !== 'HOLD') {
    errors.push('TRUST_ATOMIC_HEAD_FENCE_WEAKENED');
  }
  const sourceText = Object.values(sources).join('\n');
  for (const marker of [
    'publishTrustCurrentHead', 'atomicallyVerifyAndConsumeCurrentTrust',
    'publishCurrentApprovalTrust', 'verifyAndConsumeCurrentApprovalTrust',
    "pg_advisory_xact_lock(hashtextextended('kidults.approval-trust-current-head.v1', 0))",
    'consumePreparedCryptographicApprovalInTransaction',
    'ATOMIC_TRUST_GATEWAY_STALE_ROTATED_OR_REVOKED', 'activeRegistryId: current.activeRegistryId',
  ]) if (!sourceText.includes(marker)) errors.push(`TRUST_ATOMIC_HEAD_CONTROL_MISSING:${marker}`);
  for (const marker of [
    'CREATE ROLE kidults_control_trust_current_head',
    'CREATE TABLE kidults_control.approval_trust_current_heads',
    'approval_trust_current_heads_append_only', 'approval_trust_current_heads_truncate_denied',
    'GRANT SELECT, INSERT ON kidults_control.approval_trust_current_heads',
    'GRANT SELECT ON kidults_control.approval_trust_current_heads TO kidults_control_approval_consumer',
  ]) if (!sql.includes(marker)) errors.push(`TRUST_ATOMIC_HEAD_SCHEMA_MISSING:${marker}`);
  return { errors };
}

export function inspectApprovalTrustRuntimeImports(sourceFiles) {
  const errors = [];
  for (const [relativePath, source] of Object.entries(sourceFiles)) {
    if (relativePath.endsWith('/approval-trust-verification-gateway-v1.mjs')) {
      if (!source.includes('TRUST_HANDOFF_GATEWAY_RETIRED_USE_ATOMIC_CURRENT_HEAD')) {
        errors.push('TRUST_RUNTIME_NONATOMIC_GATEWAY_NOT_RETIRED');
      }
      continue;
    }
    if (/from ['"].*approval-trust-verification-gateway-v1\.mjs['"]/.test(source)) {
      errors.push(`TRUST_RUNTIME_RETIRED_GATEWAY_IMPORT:${relativePath}`);
    }
    if (relativePath.endsWith('/approval-trust-atomic-gateway-v1.mjs')) continue;
    if (/from ['"].*approval-consumption-v1\.mjs['"]/.test(source)
      && !relativePath.endsWith('/approval-trust-runtime-v1.mjs')) {
      errors.push(`TRUST_RUNTIME_DIRECT_CONSUMPTION_IMPORT:${relativePath}`);
    }
    if (/from ['"].*approval-trust-atomic-gateway-v1\.mjs['"]/.test(source)
      && !relativePath.endsWith('/approval-trust-runtime-v1.mjs')) {
      errors.push(`TRUST_RUNTIME_ATOMIC_GATEWAY_BYPASS:${relativePath}`);
    }
  }
  return { errors };
}

export function inspectAutonomousTaskLifecycle(controlPlane, lifecycle, source) {
  const errors = [];
  const boundary = controlPlane.autonomous_task_lifecycle || {};
  if (boundary.state !== 'VERIFIED_PASS_LOCAL_SCHEMA_RUNTIME_REMOTE_POSTGRESQL_HOLD') errors.push('AUTONOMOUS_TASK_STATE_OVERCLAIMED');
  if (boundary.contract !== 'contracts/autonomous-task-lifecycle-v1.json') errors.push('AUTONOMOUS_TASK_CONTRACT_POINTER_INVALID');
  if (boundary.scope !== 'LOCAL_DETERMINISTIC_STATE_MACHINE_AND_APPEND_ONLY_LEDGER_ADAPTER') errors.push('AUTONOMOUS_TASK_SCOPE_WEAKENED');
  if (boundary.durable_persistence !== 'LOCAL_SCHEMA_AND_RUNTIME_READY_REMOTE_POSTGRESQL_HOLD'
    || boundary.remote_worker_activation !== 'HOLD') {
    errors.push('AUTONOMOUS_TASK_REMOTE_AUTHORITY_ENABLED');
  }
  if (boundary.external_egress !== false || boundary.production !== 'HOLD'
    || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('AUTONOMOUS_TASK_PROTECTED_GATE_WEAKENED');
  }
  if (lifecycle.contract_id !== 'KIDULTS_AUTONOMOUS_TASK_LIFECYCLE_V1' || lifecycle.version !== '1.0.0') {
    errors.push('AUTONOMOUS_TASK_CONTRACT_ID_VERSION_INVALID');
  }
  if (lifecycle.state !== 'VERIFIED_PASS_LOCAL_SCHEMA_RUNTIME_REMOTE_POSTGRESQL_HOLD'
    || lifecycle.scope !== 'LOCAL_DETERMINISTIC_STATE_MACHINE_AND_APPEND_ONLY_LEDGER_ADAPTER') {
    errors.push('AUTONOMOUS_TASK_CONTRACT_STATE_INVALID');
  }
  if (lifecycle.persistence_boundary?.state !== 'LOCAL_SCHEMA_AND_RUNTIME_READY_REMOTE_POSTGRESQL_HOLD'
    || lifecycle.persistence_boundary?.authority !== 'POSTGRESQL_APPEND_ONLY_TASK_SNAPSHOT_AND_TRANSITION_LEDGER'
    || JSON.stringify(lifecycle.persistence_boundary?.database_privileges) !== JSON.stringify(['SELECT', 'INSERT'])
    || lifecycle.persistence_boundary?.snapshot_transition_pair
      !== 'DATABASE_DEFERRED_CONSTRAINT_REQUIRED_FOR_EVERY_NONINITIAL_REVISION'
    || lifecycle.persistence_boundary?.d1_authority !== false) {
    errors.push('AUTONOMOUS_TASK_PERSISTENCE_BOUNDARY_WEAKENED');
  }
  if (lifecycle.scheduler_contract !== 'contracts/autonomous-task-scheduler-v1.json') {
    errors.push('AUTONOMOUS_TASK_SCHEDULER_CONTRACT_POINTER_INVALID');
  }
  if (lifecycle.worker_contract !== 'contracts/autonomous-task-worker-v1.json') {
    errors.push('AUTONOMOUS_TASK_WORKER_CONTRACT_POINTER_INVALID');
  }
  if (lifecycle.admission_proof_store_contract !== 'contracts/autonomous-admission-proof-store-v1.json'
    || lifecycle.single_cycle_runner_contract !== 'contracts/autonomous-single-cycle-runner-v1.json'
    || lifecycle.control_tick_contract !== 'contracts/autonomous-control-tick-v1.json'
    || lifecycle.shadow_supervisor_contract !== 'contracts/autonomous-shadow-supervisor-v1.json'
    || lifecycle.supervisor_invocation_admission_contract
      !== 'contracts/autonomous-supervisor-invocation-admission-v1.json') {
    errors.push('AUTONOMOUS_TASK_RUNNER_CONTRACT_POINTER_INVALID');
  }
  if (lifecycle.production !== 'HOLD' || lifecycle.public_release !== 'HOLD' || lifecycle.g5 !== 'HOLD') {
    errors.push('AUTONOMOUS_TASK_CONTRACT_PROTECTED_GATE_WEAKENED');
  }
  const requiredInvariants = [
    'EVERY_MUTATION_INCREMENTS_REVISION',
    'EVERY_MUTATION_EMITS_DIGEST_BOUND_TRANSITION_RECEIPT',
    'EVERY_NONINITIAL_SNAPSHOT_REQUIRES_SAME_TRANSACTION_TRANSITION_PAIR',
    'LEASE_OWNER_AND_EPOCH_FENCE_EVERY_WORKER_MUTATION',
    'EXPIRED_LEASE_CANNOT_COMPLETE_OR_CHECKPOINT',
    'RETRY_CLEARS_LEASE_AND_PRESERVES_CHECKPOINT',
    'LEASED_TASK_CAN_BE_FENCED_AND_RETURNED_BEFORE_START',
    'ATTEMPT_EXHAUSTION_QUARANTINES',
    'TERMINAL_TASKS_ARE_IMMUTABLE',
    'TASK_BINDS_ADMISSION_REQUEST_DIGEST_NOT_PROVIDER_STATE',
    'NO_NETWORK_DATABASE_CREDENTIAL_PRODUCTION_PUBLIC_OR_G5_CAPABILITY',
  ];
  for (const invariant of requiredInvariants) {
    if (!lifecycle.invariants?.includes(invariant)) errors.push(`AUTONOMOUS_TASK_INVARIANT_MISSING:${invariant}`);
  }
  for (const pattern of [
    /\bfetch\s*\(/, /node:(?:http|https|net|tls|dgram|dns|fs|child_process)/,
    /\b(?:axios|undici|XMLHttpRequest|WebSocket)\b/, /process\.env/, /\b(?:INSERT|UPDATE|DELETE)\b/i,
  ]) {
    if (pattern.test(source)) errors.push(`AUTONOMOUS_TASK_EXTERNAL_CAPABILITY_PROHIBITED:${pattern.source}`);
  }
  for (const marker of [
    'TASK_LEASE_FENCE_MISMATCH', 'TASK_LEASE_EXPIRED', 'TASK_ATTEMPTS_EXHAUSTED',
    'TASK_TERMINAL_IMMUTABLE', "state: exhausted ? 'QUARANTINED' : 'RETRY_SCHEDULED'",
    "externalEgress: false", "production: 'HOLD'", "publicRelease: 'HOLD'", "g5: 'HOLD'",
  ]) {
    if (!source.includes(marker)) errors.push(`AUTONOMOUS_TASK_RUNTIME_MARKER_MISSING:${marker}`);
  }
  return { errors };
}

export function inspectAutonomousTaskLedgerRuntime(source) {
  const errors = [];
  const requiredControls = [
    "const WRITER_ID = 'kpmo-autonomous-task-writer-v1'",
    'TASK_LEDGER_RECEIPT_DIGEST_MISMATCH', 'TASK_LEDGER_TRANSITION_BINDING_INVALID',
    'TASK_LEDGER_PROTECTED_GATE_INVALID', 'TASK_LEDGER_STALE_REVISION',
    'TASK_LEDGER_REVISION_CONFLICT', 'TASK_LEDGER_TRANSITION_CONFLICT',
    'ON CONFLICT (task_id, revision) DO NOTHING RETURNING *',
    'ORDER BY revision DESC LIMIT 1', "await client.query('ROLLBACK')",
    "state: 'IDEMPOTENT_REPLAY'", "remoteActivation: 'HOLD'",
  ];
  for (const control of requiredControls) {
    if (!source.includes(control)) errors.push(`AUTONOMOUS_TASK_LEDGER_RUNTIME_CONTROL_MISSING:${control}`);
  }
  for (const pattern of [
    /\bfetch\s*\(/, /node:(?:http|https|net|tls|dgram|dns|child_process)/,
    /\b(?:UPDATE|DELETE|TRUNCATE)\b/i, /\bFOR\s+(?:UPDATE|NO\s+KEY\s+UPDATE|SHARE|KEY\s+SHARE)\b/i,
  ]) {
    if (pattern.test(source)) errors.push(`AUTONOMOUS_TASK_LEDGER_PROHIBITED_CAPABILITY:${pattern.source}`);
  }
  return { errors };
}

export function inspectAutonomousTaskScheduler(controlPlane, scheduler, source) {
  const errors = [];
  const boundary = controlPlane.autonomous_task_scheduler || {};
  if (boundary.state !== 'LOCAL_SCHEDULER_PRIMITIVE_READY_REMOTE_ACTIVATION_HOLD') {
    errors.push('AUTONOMOUS_SCHEDULER_STATE_OVERCLAIMED');
  }
  if (boundary.contract !== 'contracts/autonomous-task-scheduler-v1.json'
    || boundary.scope !== 'LOCAL_SYNTHETIC_SHADOW_ONLY') {
    errors.push('AUTONOMOUS_SCHEDULER_BOUNDARY_INVALID');
  }
  if (boundary.trigger !== 'NOT_REGISTERED_HOLD' || boundary.task_payload_execution !== false
    || boundary.external_egress !== false || boundary.credential_resolution !== false
    || boundary.remote_postgresql_concurrency !== 'NOT_VERIFIED'
    || boundary.remote_worker_activation !== 'HOLD') {
    errors.push('AUTONOMOUS_SCHEDULER_REMOTE_CAPABILITY_ENABLED');
  }
  if (boundary.production !== 'HOLD' || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('AUTONOMOUS_SCHEDULER_PROTECTED_GATE_WEAKENED');
  }
  if (scheduler.contract_id !== 'KIDULTS_AUTONOMOUS_TASK_SCHEDULER_V1'
    || scheduler.version !== '1.0.0'
    || scheduler.state !== 'LOCAL_SCHEDULER_PRIMITIVE_READY_REMOTE_ACTIVATION_HOLD'
    || scheduler.scope !== 'LOCAL_SYNTHETIC_SHADOW_ONLY') {
    errors.push('AUTONOMOUS_SCHEDULER_CONTRACT_INVALID');
  }
  if (scheduler.selection?.candidate_batch_maximum !== 16
    || scheduler.selection?.row_locking !== false
    || scheduler.selection?.contention !== 'BOUNDED_SKIP_THEN_CONTENDED_RETRY') {
    errors.push('AUTONOMOUS_SCHEDULER_SELECTION_BOUNDARY_WEAKENED');
  }
  const requiredInvariants = [
    'ONLY_LATEST_TASK_REVISION_IS_ELIGIBLE',
    'ONLY_SYNTHETIC_SHADOW_WORKFLOW_IS_ELIGIBLE',
    'ONLY_SYNTHETIC_WORKER_NAMESPACE_CAN_CLAIM',
    'FUTURE_TASK_CANNOT_BE_CLAIMED',
    'ACTIVE_LEASE_CANNOT_BE_RECOVERED',
    'EVERY_CLAIM_OR_RECOVERY_USES_APPEND_ONLY_CAS_TRANSITION',
    'CAS_CONTENTION_NEVER_OVERWRITES_A_WINNER',
    'ATTEMPT_EXHAUSTION_QUARANTINES',
    'SCAN_IS_BOUNDED_TO_SIXTEEN_CANDIDATES',
    'NO_NETWORK_CREDENTIAL_PROVIDER_PRODUCTION_PUBLIC_OR_G5_CAPABILITY',
  ];
  for (const invariant of requiredInvariants) {
    if (!scheduler.invariants?.includes(invariant)) errors.push(`AUTONOMOUS_SCHEDULER_INVARIANT_MISSING:${invariant}`);
  }
  const requiredMarkers = [
    'AUTONOMOUS_SCHEDULER_CLAIM_CANDIDATES_V1',
    'AUTONOMOUS_SCHEDULER_EXPIRED_LEASES_V1',
    'SELECT DISTINCT ON (task_id)',
    "task_json->>'workflowType' = 'synthetic-shadow'",
    "const SYNTHETIC_WORKER = /^synthetic-worker:",
    'TASK_SCHEDULER_WORKER_SCOPE_DENIED',
    'TASK_SCHEDULER_CANDIDATE_LIMIT_INVALID',
    "return boundary(contended ? 'CONTENDED_RETRY' : 'IDLE'",
    'persistTaskTransition(client, before, result)',
    "remoteWorkerActivation: 'HOLD'",
    "production: 'HOLD'", "publicRelease: 'HOLD'", "g5: 'HOLD'",
  ];
  for (const marker of requiredMarkers) {
    if (!source.includes(marker)) errors.push(`AUTONOMOUS_SCHEDULER_RUNTIME_CONTROL_MISSING:${marker}`);
  }
  for (const pattern of [
    /\bfetch\s*\(/, /node:(?:http|https|net|tls|dgram|dns|child_process)/,
    /\b(?:axios|undici|XMLHttpRequest|WebSocket)\b/, /process\.env/,
    /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i,
    /\bFOR\s+(?:UPDATE|NO\s+KEY\s+UPDATE|SHARE|KEY\s+SHARE)\b/i,
  ]) {
    if (pattern.test(source)) errors.push(`AUTONOMOUS_SCHEDULER_PROHIBITED_CAPABILITY:${pattern.source}`);
  }
  return { errors };
}

export function inspectAutonomousTaskWorker(controlPlane, worker, sources) {
  const errors = [];
  const boundary = controlPlane.autonomous_task_worker || {};
  if (boundary.state !== 'LOCAL_SYNTHETIC_EXECUTION_ENVELOPE_READY_REMOTE_ACTIVATION_HOLD'
    || boundary.contract !== 'contracts/autonomous-task-worker-v1.json'
    || boundary.scope !== 'LOCAL_SYNTHETIC_SHADOW_HANDLER_ONLY') {
    errors.push('AUTONOMOUS_WORKER_BOUNDARY_INVALID');
  }
  if (boundary.handler_registry !== 'STATIC_REPOSITORY_REGISTERED'
    || boundary.untrusted_handler_sandbox !== false
    || boundary.trigger !== 'NOT_REGISTERED_HOLD'
    || boundary.aggregate_receipt_separate_persistence
      !== 'NOT_IMPLEMENTED_REBUILDABLE_FROM_DURABLE_TRANSITION_LEDGER'
    || boundary.external_egress !== false || boundary.credential_resolution !== false
    || boundary.remote_worker_activation !== 'HOLD') {
    errors.push('AUTONOMOUS_WORKER_CAPABILITY_BOUNDARY_WEAKENED');
  }
  if (boundary.production !== 'HOLD' || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('AUTONOMOUS_WORKER_PROTECTED_GATE_WEAKENED');
  }
  if (worker.contract_id !== 'KIDULTS_AUTONOMOUS_TASK_WORKER_V1'
    || worker.version !== '1.0.0'
    || worker.state !== 'LOCAL_SYNTHETIC_EXECUTION_ENVELOPE_READY_REMOTE_ACTIVATION_HOLD'
    || worker.scope !== 'LOCAL_SYNTHETIC_SHADOW_HANDLER_ONLY') {
    errors.push('AUTONOMOUS_WORKER_CONTRACT_INVALID');
  }
  if (worker.handler_boundary?.dynamic_import !== false
    || worker.handler_boundary?.untrusted_code_sandbox !== false
    || worker.handler_boundary?.network_credential_filesystem_process_capabilities !== false
    || worker.aggregate_receipt?.separate_persistence
      !== 'NOT_IMPLEMENTED_REBUILDABLE_FROM_DURABLE_TRANSITION_LEDGER') {
    errors.push('AUTONOMOUS_WORKER_CONTRACT_CAPABILITY_WEAKENED');
  }
  if (worker.scale_boundary?.throughput !== 'NOT_MEASURED'
    || worker.scale_boundary?.horizontal_partitioning !== 'TASK_ID_AND_REVISION_CAS_READY_NOT_REMOTE_PROVEN'
    || worker.scale_boundary?.slo_and_recovery !== 'NOT_MEASURED_EXPIRED_LEASE_RECOVERY_PRIMITIVE_AVAILABLE') {
    errors.push('AUTONOMOUS_WORKER_SCALE_TRUTH_OVERCLAIMED');
  }
  for (const dimension of [
    'autonomous_effect', 'global_effect', 'irreplaceable_value_effect', 'transparency_effect',
  ]) {
    if (typeof worker.constitutional_effects?.[dimension] !== 'string') {
      errors.push(`AUTONOMOUS_WORKER_CONSTITUTIONAL_EFFECT_MISSING:${dimension}`);
    }
  }
  const requiredInvariants = [
    'COMMON_CONTROL_PREFLIGHT_PASSES_BEFORE_START',
    'START_TRANSITION_PERSISTS_BEFORE_HANDLER_INVOCATION',
    'ONLY_SYNTHETIC_WORKER_AND_WORKFLOW_ARE_ELIGIBLE',
    'CHECKPOINT_TRANSITIONS_ARE_SERIALIZED',
    'ACCEPTED_CHECKPOINT_SETTLES_BEFORE_CANCELLATION_FINALIZATION',
    'TIMEOUT_ABORTS_CONTEXT_AND_SCHEDULES_BOUNDED_RETRY',
    'CANCELLATION_CLEARS_LEASE',
    'ATTEMPT_EXHAUSTION_QUARANTINES',
    'RAW_HANDLER_ERROR_IS_NOT_EMITTED_IN_RECEIPT',
    'EXECUTION_RECEIPT_IS_EXACT_SELF_DIGEST_BOUND_AND_VERIFIABLE',
    'NO_EXTERNAL_EGRESS_CREDENTIAL_PRODUCTION_PUBLIC_OR_G5_CAPABILITY',
  ];
  for (const invariant of requiredInvariants) {
    if (!worker.invariants?.includes(invariant)) errors.push(`AUTONOMOUS_WORKER_INVARIANT_MISSING:${invariant}`);
  }
  const workerSource = sources.worker || '';
  const registrySource = sources.registry || '';
  const source = `${workerSource}\n${registrySource}`;
  const requiredMarkers = [
    'executeShadowBroker({', 'digestObject(source) === task.admissionRequestDigest',
    'const preflightReceipt = verifyPreflight(task',
    "receipt.state === 'SHADOW_NO_FETCH_RECORDED'", 'await apply(startTask(currentTask',
    'handler.execute(context)', 'let transitionTail = Promise.resolve()', 'await transitionTail',
    "stop('TASK_EXECUTION_TIMEOUT')", "stop('TASK_EXECUTION_CANCELLED')",
    "reason: 'TASK_EXECUTION_CANCELLED_BEFORE_START'", 'scheduleRetry(currentTask',
    "outcome = currentTask.state === 'QUARANTINED' ? 'QUARANTINED' : 'RETRY_SCHEDULED'",
    'verifySyntheticExecutionReceipt', 'verifySelfDigest(receipt',
    "const SYNTHETIC_HANDLER_REGISTRY_V1 = createSyntheticHandlerRegistry([",
    "workflowType: 'synthetic-shadow'", "handlerId: 'synthetic-shadow-control-v1'",
    'externalEgress: false', 'credentialResolution: false',
    "production: 'HOLD'", "publicRelease: 'HOLD'", "g5: 'HOLD'",
  ];
  for (const marker of requiredMarkers) {
    if (!source.includes(marker)) errors.push(`AUTONOMOUS_WORKER_RUNTIME_CONTROL_MISSING:${marker}`);
  }
  if (workerSource.indexOf('const preflightReceipt = verifyPreflight(task')
      > workerSource.indexOf('await apply(startTask(currentTask')
    || workerSource.indexOf('await apply(startTask(currentTask') > workerSource.indexOf('handler.execute(context)')) {
    errors.push('AUTONOMOUS_WORKER_EXECUTION_ORDER_INVALID');
  }
  for (const pattern of [
    /\bfetch\s*\(/, /node:(?:http|https|net|tls|dgram|dns|fs|child_process)/,
    /\b(?:axios|undici|XMLHttpRequest|WebSocket)\b/, /process\.env/, /\bimport\s*\(/,
  ]) {
    if (pattern.test(source)) errors.push(`AUTONOMOUS_WORKER_PROHIBITED_CAPABILITY:${pattern.source}`);
  }
  return { errors };
}

export function inspectAutonomousAdmissionProofStore(controlPlane, contract, source, sql) {
  const errors = [];
  const boundary = controlPlane.autonomous_admission_proof_store || {};
  if (boundary.state !== 'LOCAL_APPEND_ONLY_PROOF_STORE_READY_REMOTE_ACTIVATION_HOLD'
    || boundary.contract !== 'contracts/autonomous-admission-proof-store-v1.json'
    || boundary.scope !== 'LOCAL_SYNTHETIC_SHADOW_ONLY') {
    errors.push('AUTONOMOUS_ADMISSION_PROOF_BOUNDARY_INVALID');
  }
  if (boundary.remote_postgresql !== 'HOLD' || boundary.external_egress !== false
    || boundary.credential_resolution !== false || boundary.production !== 'HOLD'
    || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('AUTONOMOUS_ADMISSION_PROOF_CAPABILITY_ENABLED');
  }
  if (contract.contract_id !== 'KIDULTS_AUTONOMOUS_ADMISSION_PROOF_STORE_V1'
    || contract.version !== '1.0.0'
    || contract.state !== 'LOCAL_APPEND_ONLY_PROOF_STORE_READY_REMOTE_ACTIVATION_HOLD'
    || contract.remote_activation !== 'HOLD') {
    errors.push('AUTONOMOUS_ADMISSION_PROOF_CONTRACT_INVALID');
  }
  for (const marker of [
    "const WRITER_ID = 'kpmo-autonomous-admission-proof-writer-v1'",
    'validateAdmissionLifetime(decision, manifest', 'ADMISSION_PROOF_REQUEST_BINDING_INVALID',
    'ADMISSION_PROOF_CONTROL_BINDING_INVALID', 'AUTONOMOUS_ADMISSION_PROOF_RESOLVE_V1',
    'ORDER BY issued_at DESC, proof_id ASC LIMIT 1', 'ADMISSION_PROOF_CONFLICT',
    "remoteActivation: 'HOLD'",
  ]) if (!source.includes(marker)) errors.push(`AUTONOMOUS_ADMISSION_PROOF_RUNTIME_CONTROL_MISSING:${marker}`);
  for (const marker of [
    'CREATE TABLE kidults_control.autonomous_admission_proofs',
    'autonomous_admission_proofs_append_only', 'autonomous_admission_proofs_truncate_denied',
    'REVOKE ALL ON kidults_control.autonomous_admission_proofs FROM PUBLIC',
    'GRANT SELECT ON kidults_control.autonomous_admission_proofs',
  ]) if (!sql.includes(marker)) errors.push(`AUTONOMOUS_ADMISSION_PROOF_SCHEMA_CONTROL_MISSING:${marker}`);
  for (const pattern of [
    /\bfetch\s*\(/, /node:(?:http|https|net|tls|dgram|dns|child_process)/,
    /\b(?:axios|undici|XMLHttpRequest|WebSocket)\b/, /process\.env/,
    /\b(?:UPDATE|DELETE|TRUNCATE)\b/i,
  ]) if (pattern.test(source)) errors.push(`AUTONOMOUS_ADMISSION_PROOF_PROHIBITED_CAPABILITY:${pattern.source}`);
  return { errors };
}

export function inspectAutonomousSingleCycleRunner(controlPlane, contract, source) {
  const errors = [];
  const boundary = controlPlane.autonomous_single_cycle_runner || {};
  if (boundary.state !== 'LOCAL_SINGLE_CYCLE_RUNNER_READY_REMOTE_ACTIVATION_HOLD'
    || boundary.contract !== 'contracts/autonomous-single-cycle-runner-v1.json'
    || boundary.scope !== 'ONE_LOCAL_SYNTHETIC_SHADOW_TASK_PER_CALL') {
    errors.push('AUTONOMOUS_RUNNER_BOUNDARY_INVALID');
  }
  if (boundary.trigger !== 'NOT_REGISTERED_HOLD' || boundary.remote_worker_activation !== 'HOLD'
    || boundary.external_egress !== false || boundary.credential_resolution !== false
    || boundary.production !== 'HOLD' || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('AUTONOMOUS_RUNNER_CAPABILITY_ENABLED');
  }
  if (boundary.postgres_runtime_integration
      !== 'SINGLE_CONNECTION_ADAPTER_WIRED_LIVE_CONNECTION_HOLD'
    || contract.postgres_runtime_integration?.state
      !== 'SINGLE_CONNECTION_ADAPTER_WIRED_LIVE_CONNECTION_HOLD'
    || contract.postgres_runtime_integration?.client_contract
      !== 'contracts/autonomous-postgres-runtime-client-v1.json'
    || contract.postgres_runtime_integration?.task_and_proof_client_shared !== true
    || contract.postgres_runtime_integration?.caller_client_override !== 'PROHIBITED'
    || contract.postgres_runtime_integration?.explicit_close !== true
    || contract.postgres_runtime_integration?.primary_failure_preserved_on_close_failure !== true) {
    errors.push('AUTONOMOUS_RUNNER_POSTGRES_INTEGRATION_INVALID');
  }
  if (contract.contract_id !== 'KIDULTS_AUTONOMOUS_SINGLE_CYCLE_RUNNER_V1'
    || contract.version !== '1.0.0'
    || contract.state !== 'LOCAL_SINGLE_CYCLE_RUNNER_READY_REMOTE_ACTIVATION_HOLD'
    || contract.trigger !== 'NOT_REGISTERED_HOLD') {
    errors.push('AUTONOMOUS_RUNNER_CONTRACT_INVALID');
  }
  for (const marker of [
    'claimNextSyntheticTask(taskClient', 'resolveAdmissionProof(proofClient',
    'executeClaimedSyntheticTask(taskClient', 'releaseLeasedTaskForRetry(task',
    "reason: 'TASK_ADMISSION_PROOF_UNAVAILABLE'", "reason: 'TASK_ADMISSION_PREFLIGHT_DENIED'",
    'verifySingleCycleReceipt', "remoteWorkerActivation: 'HOLD'",
    'runOnePostgresSyntheticTaskCycle', 'withAutonomousPostgresRuntime',
    "'TASK_RUNNER_POSTGRES_CLIENT_OVERRIDE_DENIED'", 'taskClient: client, proofClient: client',
    "externalEgress: false", "credentialResolution: false",
    "production: 'HOLD'", "publicRelease: 'HOLD'", "g5: 'HOLD'",
  ]) if (!source.includes(marker)) errors.push(`AUTONOMOUS_RUNNER_RUNTIME_CONTROL_MISSING:${marker}`);
  for (const pattern of [
    /\bfetch\s*\(/, /node:(?:http|https|net|tls|dgram|dns|fs|child_process)/,
    /\b(?:axios|undici|XMLHttpRequest|WebSocket)\b/, /process\.env/,
    /setInterval|setTimeout|cron|scheduleEvent/,
  ]) if (pattern.test(source)) errors.push(`AUTONOMOUS_RUNNER_PROHIBITED_CAPABILITY:${pattern.source}`);
  return { errors };
}

export function inspectAutonomousControlTick(controlPlane, contract, source) {
  const errors = [];
  const boundary = controlPlane.autonomous_control_tick || {};
  if (boundary.state !== 'LOCAL_RECOVERY_FIRST_CONTROL_TICK_READY_REMOTE_ACTIVATION_HOLD'
    || boundary.contract !== 'contracts/autonomous-control-tick-v1.json'
    || boundary.scope !== 'ONE_RECOVERY_OR_ONE_SYNTHETIC_TASK_PER_CALL') {
    errors.push('AUTONOMOUS_CONTROL_TICK_BOUNDARY_INVALID');
  }
  if (boundary.trigger !== 'NOT_REGISTERED_HOLD'
    || boundary.aggregate_receipt_separate_persistence
      !== 'NOT_IMPLEMENTED_REBUILDABLE_FROM_TRANSITION_LEDGER_AND_BOUND_RECEIPTS'
    || boundary.remote_worker_activation !== 'HOLD' || boundary.external_egress !== false
    || boundary.credential_resolution !== false || boundary.production !== 'HOLD'
    || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('AUTONOMOUS_CONTROL_TICK_CAPABILITY_ENABLED');
  }
  if (boundary.postgres_runtime_integration
      !== 'RECOVERY_FIRST_SINGLE_CONNECTION_WIRED_LIVE_CONNECTION_HOLD'
    || contract.postgres_runtime_integration?.state
      !== 'RECOVERY_FIRST_SINGLE_CONNECTION_WIRED_LIVE_CONNECTION_HOLD'
    || contract.postgres_runtime_integration?.client_contract
      !== 'contracts/autonomous-postgres-runtime-client-v1.json'
    || contract.postgres_runtime_integration?.recovery_task_and_proof_client_shared !== true
    || contract.postgres_runtime_integration?.caller_client_override !== 'PROHIBITED'
    || contract.postgres_runtime_integration?.explicit_close !== true) {
    errors.push('AUTONOMOUS_CONTROL_TICK_POSTGRES_INTEGRATION_INVALID');
  }
  if (contract.contract_id !== 'KIDULTS_AUTONOMOUS_CONTROL_TICK_V1'
    || contract.version !== '1.0.0'
    || contract.state !== 'LOCAL_RECOVERY_FIRST_CONTROL_TICK_READY_REMOTE_ACTIVATION_HOLD'
    || contract.scope !== 'ONE_RECOVERY_OR_ONE_SYNTHETIC_TASK_PER_CALL'
    || contract.trigger !== 'NOT_REGISTERED_HOLD') {
    errors.push('AUTONOMOUS_CONTROL_TICK_CONTRACT_INVALID');
  }
  for (const invariant of [
    'RECOVERY_SCAN_ALWAYS_PRECEDES_NEW_CLAIM',
    'AT_MOST_ONE_MATERIAL_RECOVERY_OR_EXECUTION_ACTION_PER_CALL',
    'RECOVERY_CONTENTION_BLOCKS_NEW_CLAIM',
    'EXHAUSTED_RECOVERY_QUARANTINES',
    'RECOVERY_AND_CYCLE_RECEIPTS_ARE_MUTUALLY_EXCLUSIVE',
    'NO_LOOP_TIMER_TRIGGER_NETWORK_CREDENTIAL_PROVIDER_PRODUCTION_PUBLIC_OR_G5_CAPABILITY',
  ]) if (!contract.invariants?.includes(invariant)) {
    errors.push(`AUTONOMOUS_CONTROL_TICK_INVARIANT_MISSING:${invariant}`);
  }
  for (const marker of [
    'recoverNextExpiredSyntheticLease(taskClient', 'runOneSyntheticTaskCycle({',
    'runOnePostgresAutonomousControlTick', 'withAutonomousPostgresRuntime',
    "'CONTROL_TICK_POSTGRES_CLIENT_OVERRIDE_DENIED'", 'taskClient: client, proofClient: client',
    "if (recovery.state !== 'IDLE')", "'RECOVERY_CONTENDED_RETRY'",
    'verifyAutonomousControlTickReceipt', 'CONTROL_TICK_RECOVERY_PRIORITY_INVALID',
    "externalEgress: false", "credentialResolution: false",
    "remoteWorkerActivation: 'HOLD'", "production: 'HOLD'",
    "publicRelease: 'HOLD'", "g5: 'HOLD'",
  ]) if (!source.includes(marker)) {
    errors.push(`AUTONOMOUS_CONTROL_TICK_RUNTIME_CONTROL_MISSING:${marker}`);
  }
  for (const pattern of [
    /\bfetch\s*\(/, /node:(?:http|https|net|tls|dgram|dns|fs|child_process)/,
    /\b(?:axios|undici|XMLHttpRequest|WebSocket)\b/, /process\.env/,
    /setInterval|setTimeout|cron|scheduleEvent|while\s*\(|for\s*\(\s*;;/,
  ]) if (pattern.test(source)) {
    errors.push(`AUTONOMOUS_CONTROL_TICK_PROHIBITED_CAPABILITY:${pattern.source}`);
  }
  return { errors };
}

export function inspectAutonomousShadowSupervisor(controlPlane, contract, source) {
  const errors = [];
  const boundary = controlPlane.autonomous_shadow_supervisor || {};
  if (boundary.state !== 'LOCAL_BOUNDED_SHADOW_SUPERVISOR_READY_TRIGGER_HOLD'
    || boundary.contract !== 'contracts/autonomous-shadow-supervisor-v1.json'
    || boundary.scope !== 'MAX_SIXTEEN_RECOVERY_FIRST_TICKS_PER_EXPLICIT_CALL') {
    errors.push('AUTONOMOUS_SHADOW_SUPERVISOR_BOUNDARY_INVALID');
  }
  if (boundary.trigger !== 'NOT_REGISTERED_HOLD' || boundary.maximum_ticks !== 16
    || boundary.maximum_duration_ms !== 60000
    || boundary.in_flight_database_call_hard_preemption !== 'NOT_IMPLEMENTED_HOLD'
    || boundary.aggregate_receipt_separate_persistence
      !== 'NOT_IMPLEMENTED_REBUILDABLE_FROM_BOUND_TICK_AND_TRANSITION_RECEIPTS'
    || boundary.remote_worker_activation !== 'HOLD' || boundary.external_egress !== false
    || boundary.credential_resolution !== false || boundary.production !== 'HOLD'
    || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('AUTONOMOUS_SHADOW_SUPERVISOR_CAPABILITY_ENABLED');
  }
  if (boundary.postgres_runtime_integration
      !== 'BOUNDED_SUPERVISOR_SINGLE_CONNECTION_WIRED_LIVE_CONNECTION_HOLD'
    || contract.postgres_runtime_integration?.state
      !== 'BOUNDED_SUPERVISOR_SINGLE_CONNECTION_WIRED_LIVE_CONNECTION_HOLD'
    || contract.postgres_runtime_integration?.client_contract
      !== 'contracts/autonomous-postgres-runtime-client-v1.json'
    || contract.postgres_runtime_integration?.all_ticks_share_one_client !== true
    || contract.postgres_runtime_integration?.caller_client_override !== 'PROHIBITED'
    || contract.postgres_runtime_integration?.explicit_close !== true) {
    errors.push('AUTONOMOUS_SHADOW_SUPERVISOR_POSTGRES_INTEGRATION_INVALID');
  }
  if (contract.contract_id !== 'KIDULTS_AUTONOMOUS_SHADOW_SUPERVISOR_V1'
    || contract.version !== '1.0.0'
    || contract.state !== 'LOCAL_BOUNDED_SHADOW_SUPERVISOR_READY_TRIGGER_HOLD'
    || contract.scope !== 'MAX_SIXTEEN_RECOVERY_FIRST_TICKS_PER_EXPLICIT_CALL'
    || contract.trigger !== 'NOT_REGISTERED_HOLD') {
    errors.push('AUTONOMOUS_SHADOW_SUPERVISOR_CONTRACT_INVALID');
  }
  if (contract.budgets?.maximum_ticks !== 16
    || contract.budgets?.maximum_duration_ms !== 60000
    || contract.budgets?.maximum_recovery_events !== 1
    || contract.budgets?.maximum_quarantine_events !== 1
    || contract.budgets?.in_flight_database_call_hard_preemption !== 'NOT_IMPLEMENTED_HOLD'
    || contract.continuation_policy?.continue_only_after !== 'CYCLE_EXECUTED') {
    errors.push('AUTONOMOUS_SHADOW_SUPERVISOR_BUDGET_WEAKENED');
  }
  for (const dimension of [
    'autonomous_effect', 'global_effect', 'irreplaceable_value_effect', 'transparency_effect',
  ]) if (typeof contract.constitutional_effects?.[dimension] !== 'string') {
    errors.push(`AUTONOMOUS_SHADOW_SUPERVISOR_CONSTITUTIONAL_EFFECT_MISSING:${dimension}`);
  }
  for (const invariant of [
    'SUPERVISOR_REQUIRES_EXPLICIT_CALL_AND_EXPLICIT_BUDGETS',
    'NO_MORE_THAN_SIXTEEN_TICKS_PER_CALL',
    'ONLY_SUCCESSFUL_EXECUTION_CAN_CONTINUE_TO_ANOTHER_TICK',
    'RECOVERY_RETRY_QUARANTINE_OR_CONTENTION_STOPS_THE_RUN',
    'GLOBAL_KILL_OR_CANCELLATION_STOPS_BEFORE_NEXT_DATABASE_ACCESS',
    'REMAINING_DURATION_LIMITS_WORKER_TIMEOUT',
    'UNEXPECTED_FAILURE_IS_REDUCED_TO_A_NON_SECRET_CLASS',
    'NO_TIMER_CRON_EVENT_TRIGGER_NETWORK_CREDENTIAL_PROVIDER_PRODUCTION_PUBLIC_OR_G5_CAPABILITY',
  ]) if (!contract.invariants?.includes(invariant)) {
    errors.push(`AUTONOMOUS_SHADOW_SUPERVISOR_INVARIANT_MISSING:${invariant}`);
  }
  for (const marker of [
    'runOneAutonomousControlTick({', 'verifyAutonomousControlTickReceipt(tick.receipt)',
    'runPostgresBoundedShadowSupervisor', 'withAutonomousPostgresRuntime',
    "'SHADOW_SUPERVISOR_POSTGRES_CLIENT_OVERRIDE_DENIED'",
    'taskClient: client, proofClient: client',
    'while (ticks.length < maxTicks && state === null)',
    "boundedInteger(maxTicks, 1, 16", "boundedInteger(maxDurationMs, 1, 60000",
    'Math.min(timeoutMs, remainingMs)', 'snapshotJson(controlState)',
    "state = 'GLOBAL_KILL_STOP'", "state = 'CANCELLED_STOP'",
    "return 'RECOVERY_APPLIED_STOP'", "return 'RETRY_SCHEDULED_STOP'",
    "return 'TASK_QUARANTINED_STOP'", "return 'CONTENTION_STOP'",
    "return 'UNEXPECTED_DEPENDENCY_FAILURE'", 'verifyShadowSupervisorReceipt',
    "automaticTrigger: 'NOT_REGISTERED_HOLD'", "externalEgress: false",
    "credentialResolution: false", "remoteWorkerActivation: 'HOLD'",
    "production: 'HOLD'", "publicRelease: 'HOLD'", "g5: 'HOLD'",
  ]) if (!source.includes(marker)) {
    errors.push(`AUTONOMOUS_SHADOW_SUPERVISOR_RUNTIME_CONTROL_MISSING:${marker}`);
  }
  for (const pattern of [
    /\bfetch\s*\(/, /node:(?:http|https|net|tls|dgram|dns|fs|child_process)/,
    /\b(?:axios|undici|XMLHttpRequest|WebSocket)\b/, /process\.env/,
    /setInterval|setTimeout|cron|scheduleEvent|while\s*\(\s*true\s*\)|for\s*\(\s*;;/,
  ]) if (pattern.test(source)) {
    errors.push(`AUTONOMOUS_SHADOW_SUPERVISOR_PROHIBITED_CAPABILITY:${pattern.source}`);
  }
  return { errors };
}

export function inspectAutonomousSupervisorInvocationAdmission(controlPlane, contract, source, sql) {
  const errors = [];
  const boundary = controlPlane.autonomous_supervisor_invocation_admission || {};
  if (boundary.state
      !== 'LOCAL_APPEND_ONLY_INVOCATION_ADMISSION_READY_AUTHENTICATED_APPROVAL_HOLD'
    || boundary.contract !== 'contracts/autonomous-supervisor-invocation-admission-v1.json'
    || boundary.scope !== 'LOCAL_SYNTHETIC_SHADOW_SUPERVISOR_ONLY') {
    errors.push('AUTONOMOUS_INVOCATION_ADMISSION_BOUNDARY_INVALID');
  }
  if (boundary.reviewer_authentication !== 'CURRENT_TRUST_CRYPTOGRAPHIC_APPROVAL_AT_LAUNCHER'
    || boundary.program_owner_authority !== false
    || boundary.single_use_consumption !== 'POSTGRESQL_UNIQUE_COMMAND_ID_INSERT_CAS'
    || boundary.remote_postgresql !== 'HOLD' || boundary.automatic_trigger !== 'NOT_REGISTERED_HOLD'
    || boundary.real_postgresql_single_use_concurrency !== 'NOT_VERIFIED'
    || boundary.external_egress !== false || boundary.credential_resolution !== false
    || boundary.production !== 'HOLD' || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('AUTONOMOUS_INVOCATION_ADMISSION_CAPABILITY_ENABLED');
  }
  if (contract.contract_id !== 'KIDULTS_AUTONOMOUS_SUPERVISOR_INVOCATION_ADMISSION_V1'
    || contract.version !== '1.0.0'
    || contract.state
      !== 'LOCAL_APPEND_ONLY_INVOCATION_ADMISSION_READY_AUTHENTICATED_APPROVAL_HOLD'
    || contract.scope !== 'LOCAL_SYNTHETIC_SHADOW_SUPERVISOR_ONLY'
    || contract.approval_authority?.current !== 'CURRENT_TRUST_CRYPTOGRAPHIC_APPROVAL_AT_LAUNCHER'
    || contract.approval_authority?.program_owner_authority !== false
    || contract.approval_authority?.cryptographic_reviewer_authentication
      !== 'REQUIRED_AND_CONSUMED_AT_LAUNCHER'
    || contract.approval_authority?.required_authority_class !== 'LOCAL_SYNTHETIC_SHADOW'
    || contract.approval_authority?.required_subject_type !== 'SUPERVISOR_INVOCATION'
    || contract.approval_authority?.required_reviewer_role !== 'KPMO'
    || contract.approval_authority?.decision_subject_binding !== 'EXACT_REQUEST_ID_AND_DIGEST'
    || contract.authenticated_approval !== 'LOCAL_SYNTHETIC_ENFORCED_AT_LAUNCHER'
    || contract.real_postgresql_single_use_concurrency !== 'NOT_VERIFIED') {
    errors.push('AUTONOMOUS_INVOCATION_ADMISSION_CONTRACT_INVALID');
  }
  if (contract.single_use_consumption?.authority !== 'POSTGRESQL_UNIQUE_COMMAND_ID_INSERT_CAS'
    || contract.single_use_consumption?.approved_decision_required !== true
    || contract.single_use_consumption?.exact_control_state_digest_required !== true
    || contract.single_use_consumption?.consume_before_supervisor_execution !== true
    || contract.single_use_consumption?.replay !== 'ALREADY_CONSUMED_HOLD'
    || contract.persistence_boundary?.database_role !== 'kidults_control_autonomous_invocation'
    || JSON.stringify(contract.persistence_boundary?.database_privileges) !== JSON.stringify(['SELECT', 'INSERT'])
    || contract.persistence_boundary?.separate_admission_and_task_clients !== true
    || contract.execution_receipt?.exact_self_digest !== true
    || contract.execution_receipt?.separate_persistence
      !== 'NOT_IMPLEMENTED_REBUILDABLE_FROM_CONSUMPTION_AND_SUPERVISOR_RECEIPTS') {
    errors.push('AUTONOMOUS_INVOCATION_ADMISSION_PERSISTENCE_WEAKENED');
  }
  for (const invariant of [
    'REQUEST_DECISION_AND_CONSUMPTION_HAVE_EXACT_SELF_DIGEST_SHAPES',
    'DECISION_BINDS_EXACT_REQUEST_ID_AND_DIGEST',
    'CONSUMPTION_BINDS_EXACT_REQUEST_DECISION_AND_CONTROL_DIGESTS',
    'ONLY_ONE_CONSUMPTION_CAN_COMMIT_PER_COMMAND_ID',
    'REJECTION_EXPIRY_CONTROL_CHANGE_OR_REPLAY_NEVER_INVOKES_SUPERVISOR',
    'CONSUMPTION_COMMITS_BEFORE_SUPERVISOR_EXECUTION_AND_IS_NEVER_REOPENED',
    'EXECUTION_RECEIPT_BINDS_CONSUMPTION_AND_SUPERVISOR_RECEIPTS',
    'DECISION_DECLARED_AUTHORITY_MUST_MATCH_CURRENT_TRUST_VERIFICATION_AND_CONSUMPTION',
    'LOCAL_SYNTHETIC_AUTHORITY_NEVER_CLAIMS_OWNER_OR_REMOTE_AUTHORITY',
    'NO_DYNAMIC_HANDLER_NETWORK_CREDENTIAL_PROVIDER_PRODUCTION_PUBLIC_OR_G5_CAPABILITY',
  ]) if (!contract.invariants?.includes(invariant)) {
    errors.push(`AUTONOMOUS_INVOCATION_ADMISSION_INVARIANT_MISSING:${invariant}`);
  }
  for (const marker of [
    "const WRITER_ID = 'kpmo-autonomous-invocation-writer-v1'",
    "reviewerAuthentication: 'CRYPTOGRAPHIC_APPROVAL_REQUIRED_AT_LAUNCHER'",
    "authorityClass: 'LOCAL_SYNTHETIC_SHADOW'", "subjectType: 'SUPERVISOR_INVOCATION'",
    "requiredReviewerRole: 'KPMO'",
    'validateSupervisorInvocationRequest', 'validateSupervisorInvocationDecision',
    'validateSupervisorInvocationConsumption', 'AUTONOMOUS_SUPERVISOR_INVOCATION_ADMISSION_V1',
    'verifySupervisorInvocationExecutionReceipt',
    'consumptionReceiptDigest: consumption.receiptDigest',
    'supervisorReceiptDigest: verifiedSupervisor.receiptDigest',
    'ON CONFLICT (command_id) DO NOTHING RETURNING *', "state: 'ALREADY_CONSUMED_HOLD'",
    'const admission = await consumeSupervisorInvocation(admissionClient',
    'if (admission.state !== \'CONSUMED\')', 'runBoundedShadowSupervisor({',
    'taskClient, proofClient', 'snapshotJson(controlState)',
    "externalEgress: false", "credentialResolution: false",
    "remoteWorkerActivation: 'HOLD'", "production: 'HOLD'",
    "publicRelease: 'HOLD'", "g5: 'HOLD'",
  ]) if (!source.includes(marker)) {
    errors.push(`AUTONOMOUS_INVOCATION_ADMISSION_RUNTIME_CONTROL_MISSING:${marker}`);
  }
  if (source.indexOf('const admission = await consumeSupervisorInvocation(admissionClient')
      > source.indexOf('const supervisor = await runBoundedShadowSupervisor({')) {
    errors.push('AUTONOMOUS_INVOCATION_ADMISSION_EXECUTION_ORDER_INVALID');
  }
  for (const marker of [
    'CREATE ROLE kidults_control_autonomous_invocation',
    'CREATE TABLE kidults_control.autonomous_supervisor_invocation_requests',
    'CREATE TABLE kidults_control.autonomous_supervisor_invocation_decisions',
    'CREATE TABLE kidults_control.autonomous_supervisor_invocation_consumptions',
    'FOREIGN KEY (command_id, request_id, request_digest)',
    'FOREIGN KEY (command_id, decision_id, decision_digest)',
    "decision_json->>'reviewerAuthentication' = 'CRYPTOGRAPHIC_APPROVAL_REQUIRED_AT_LAUNCHER'",
    "decision_json->>'authorityClass' = 'LOCAL_SYNTHETIC_SHADOW'",
    "decision_json->>'subjectType' = 'SUPERVISOR_INVOCATION'",
    "decision_json->>'subjectId' = request_id",
    "decision_json->>'subjectDigest' = request_digest",
    "decision_json->>'requiredReviewerRole' = 'KPMO'",
    'autonomous_supervisor_invocation_requests_append_only',
    'autonomous_supervisor_invocation_decisions_append_only',
    'autonomous_supervisor_invocation_consumptions_append_only',
    'REVOKE ALL ON kidults_control.autonomous_supervisor_invocation_consumptions FROM PUBLIC',
    'GRANT SELECT, INSERT ON kidults_control.autonomous_supervisor_invocation_consumptions',
  ]) if (!sql.includes(marker)) {
    errors.push(`AUTONOMOUS_INVOCATION_ADMISSION_SCHEMA_CONTROL_MISSING:${marker}`);
  }
  for (const pattern of [
    /\bfetch\s*\(/, /node:(?:http|https|net|tls|dgram|dns|fs|child_process)/,
    /\b(?:axios|undici|XMLHttpRequest|WebSocket)\b/, /process\.env/, /\bimport\s*\(/,
    /setInterval|setTimeout|cron|scheduleEvent/,
  ]) if (pattern.test(source)) {
    errors.push(`AUTONOMOUS_INVOCATION_ADMISSION_PROHIBITED_CAPABILITY:${pattern.source}`);
  }
  return { errors };
}

export function inspectAutonomousLauncher(controlPlane, contract, source, verificationWorkflow = '',
  runtimeRegistrationWorkflow = '') {
  const errors = [];
  const boundary = controlPlane.autonomous_launcher || {};
  if (boundary.state !== 'LOCAL_SYNTHETIC_MINIMAL_PATH_READY_REMOTE_HOLD'
    || boundary.contract !== 'contracts/autonomous-launcher-v1.json'
    || boundary.scope !== 'EXACT_CURRENT_TRUST_TO_EXISTING_INVOCATION_AND_SUPERVISOR') {
    errors.push('AUTONOMOUS_LAUNCHER_BOUNDARY_INVALID');
  }
  if (boundary.new_persistence !== true || boundary.new_policy_engine !== false
    || boundary.verification_trigger !== 'PROTECTED_MAIN_PUSH_AND_DAILY_LOCAL_SYNTHETIC'
    || boundary.verification_workflow
      !== '.github/workflows/kidults-control-plane-autonomous-verification-v1.yml'
    || boundary.operational_trigger_readiness
      !== 'FAIL_CLOSED_GATE_READY_REQUIREMENTS_HOLD'
    || boundary.postgres_runtime_integration
      !== 'SINGLE_CONNECTION_GOVERNED_CHAIN_READY_LIVE_CONNECTION_HOLD'
    || boundary.protected_runtime_entry
      !== 'SOURCE_BOUND_MANIFEST_READY_EXTERNAL_LAUNCHER_HOLD'
    || boundary.bounded_credential_injection
      !== 'POST_VALIDATION_SINGLE_RESOLUTION_READY_PROVIDER_HOLD'
    || boundary.durable_manifest_consumption
      !== 'POSTGRESQL_APPEND_ONLY_SINGLE_USE_READY_REMOTE_HOLD'
    || boundary.automatic_trigger !== 'NOT_REGISTERED_HOLD'
    || boundary.remote_worker_activation !== 'HOLD' || boundary.production !== 'HOLD'
    || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('AUTONOMOUS_LAUNCHER_CAPABILITY_ENABLED');
  }
  if (contract.contract_id !== 'KIDULTS_AUTONOMOUS_LAUNCHER_V1'
    || contract.version !== '1.0.0' || contract.state !== boundary.state
    || contract.runtime_module !== 'src/autonomous-control/launcher-v1.mjs'
    || contract.plane !== 'EXECUTION' || contract.new_persistence !== true
    || contract.new_policy_engine !== false || contract.new_controller_gate_or_registry !== false
    || contract.postgres_runtime_integration?.state
      !== 'SINGLE_CONNECTION_GOVERNED_LAUNCHER_CHAIN_READY_LIVE_CONNECTION_HOLD'
    || contract.postgres_runtime_integration?.runtime_function
      !== 'runPostgresAutonomousLauncher'
    || JSON.stringify(contract.postgres_runtime_integration?.shared_client_scope)
      !== JSON.stringify(['CONTAINMENT_FENCE', 'CURRENT_APPROVAL_TRUST',
        'INVOCATION_ADMISSION', 'TASK_LEDGER', 'PROOF_LEDGER'])
    || contract.postgres_runtime_integration?.caller_client_override !== 'PROHIBITED'
    || contract.postgres_runtime_integration?.explicit_close !== true
    || contract.postgres_runtime_integration?.new_persistence !== false
    || contract.postgres_runtime_integration?.live_remote_connection !== 'NOT_VERIFIED_HOLD'
    || contract.protected_runtime_entry?.state
      !== 'SOURCE_BOUND_EXACT_MANIFEST_READY_EXTERNAL_PROTECTED_LAUNCHER_HOLD'
    || contract.protected_runtime_entry?.runtime_function
      !== 'runProtectedPostgresAutonomousLauncher'
    || contract.protected_runtime_entry?.manifest_creator
      !== 'createProtectedAutonomousLaunchManifest'
    || contract.protected_runtime_entry?.manifest_verifier
      !== 'verifyProtectedAutonomousLaunchManifest'
    || contract.protected_runtime_entry?.maximum_validity_ms !== 300000
    || contract.protected_runtime_entry?.current_source_sha_required !== true
    || contract.protected_runtime_entry?.automatic_trigger !== 'NOT_REGISTERED_HOLD'
    || contract.protected_runtime_entry?.external_protected_launcher !== 'NOT_VERIFIED_HOLD'
    || contract.protected_runtime_entry?.production !== 'HOLD'
    || contract.protected_runtime_entry?.public_release !== 'HOLD'
    || contract.protected_runtime_entry?.g5 !== 'HOLD'
    || contract.bounded_credential_injection?.state
      !== 'POST_VALIDATION_SINGLE_RESOLUTION_READY_PROVIDER_INTEGRATION_HOLD'
    || contract.bounded_credential_injection?.runtime_function
      !== 'runCredentialInjectedProtectedPostgresLauncher'
    || contract.bounded_credential_injection?.manifest_contains_credential !== false
    || contract.bounded_credential_injection?.resolution_order
      !== 'AFTER_MANIFEST_AND_SOURCE_SHA_VERIFICATION'
    || contract.bounded_credential_injection?.maximum_resolutions_per_launch !== 1
    || contract.bounded_credential_injection?.raw_provider_error_exposed !== false
    || contract.bounded_credential_injection?.credential_material_in_result !== false
    || contract.bounded_credential_injection?.evidence_receipt
      !== 'kidults-bounded-credential-injection-evidence-v1'
    || contract.bounded_credential_injection?.evidence_verifier
      !== 'verifyBoundedCredentialInjectionEvidence'
    || contract.bounded_credential_injection?.provider_integration !== 'NOT_VERIFIED_HOLD'
    || contract.durable_manifest_consumption?.state
      !== 'POSTGRESQL_APPEND_ONLY_SINGLE_USE_READY_REMOTE_HOLD'
    || contract.durable_manifest_consumption?.runtime_store
      !== 'src/autonomous-control/protected-launch-manifest-store-v1.mjs'
    || contract.durable_manifest_consumption?.migration
      !== 'migrations/postgres/0012_protected_launch_manifest_consumptions.sql'
    || contract.durable_manifest_consumption?.uniqueness !== 'MANIFEST_DIGEST_PRIMARY_KEY'
    || contract.durable_manifest_consumption?.consumption_order
      !== 'BEFORE_AUTHORITY_AND_INVOCATION_CONSUMPTION'
    || contract.durable_manifest_consumption?.exact_replay !== 'MANIFEST_ALREADY_CONSUMED_HOLD'
    || contract.durable_manifest_consumption?.append_only !== true
    || contract.durable_manifest_consumption?.remote_postgresql !== 'NOT_VERIFIED_HOLD'
    || contract.verification_trigger?.state !== 'REGISTERED_LOCAL_SYNTHETIC_ONLY'
    || contract.verification_trigger?.workflow !== boundary.verification_workflow
    || JSON.stringify(contract.verification_trigger?.events)
      !== JSON.stringify(['PROTECTED_MAIN_PUSH', 'DAILY_SCHEDULE'])
    || contract.verification_trigger?.credentials_persisted !== false
    || contract.verification_trigger?.external_egress_authority !== false
    || contract.verification_trigger?.remote_worker_activation !== 'HOLD'
    || contract.operational_trigger_readiness?.state
      !== 'FAIL_CLOSED_GATE_READY_REQUIREMENTS_HOLD'
    || contract.operational_trigger_readiness?.runtime_function
      !== 'assessAutonomousRuntimeTriggerReadiness'
    || contract.operational_trigger_readiness?.receipt_verifier
      !== 'verifyAutonomousRuntimeTriggerReadiness'
    || JSON.stringify(contract.operational_trigger_readiness?.required) !== JSON.stringify([
      'CURRENT_TRUST_HEAD_VERIFIED', 'REMOTE_POSTGRESQL_VERIFIED',
      'SINGLE_USE_CONCURRENCY_VERIFIED', 'PROTECTED_LAUNCHER_VERIFIED',
      'DURABLE_NONCE_STORE_VERIFIED', 'BOUNDED_CREDENTIAL_INJECTION_VERIFIED',
      'CONTAINMENT_RECOVERY_VERIFIED'])
    || contract.operational_trigger_readiness?.all_requirements_mandatory !== true
    || contract.operational_trigger_readiness?.remote_postgresql_evidence?.source
      !== 'VERIFIED_AUTONOMOUS_POSTGRES_EVIDENCE_RECEIPT_V1_2'
    || contract.operational_trigger_readiness?.remote_postgresql_evidence
      ?.derived_not_caller_asserted !== true
    || JSON.stringify(contract.operational_trigger_readiness?.remote_postgresql_evidence
      ?.required_checks) !== JSON.stringify([
      'EXACT_SOURCE_SHA', 'EXACT_MIGRATION_DIGEST', 'FRESH_EPHEMERAL_DATABASE',
      'ROLE_ISOLATION', 'SERVER_VERSION_RECORDED'])
    || contract.operational_trigger_readiness?.remote_postgresql_evidence?.scope
      !== 'EPHEMERAL_REMOTE_POSTGRESQL_EVIDENCE_NOT_PRODUCTION_ACTIVATION'
    || contract.operational_trigger_readiness?.remote_postgresql_evidence?.absent_receipt
      !== 'REMOTE_POSTGRESQL_VERIFIED_BLOCKER'
    || contract.operational_trigger_readiness?.remote_postgresql_evidence?.invalid_receipt
      !== 'FAIL_CLOSED'
    || contract.operational_trigger_readiness?.current_trust_evidence?.source
      !== 'VERIFIED_AUTONOMOUS_POSTGRES_EVIDENCE_RECEIPT_V1_2'
    || contract.operational_trigger_readiness?.current_trust_evidence
      ?.derived_not_caller_asserted !== true
    || JSON.stringify(contract.operational_trigger_readiness?.current_trust_evidence
      ?.required_checks) !== JSON.stringify([
      'TRUST_REVOCATION_WINS_TWO_CLIENT_RACE',
      'TRUST_CONSUMPTION_WINS_TWO_CLIENT_RACE',
      'TRUST_CURRENT_HEADS_EXACTLY_FOUR',
      'CRYPTOGRAPHIC_APPROVAL_CONSUMPTIONS_EXACTLY_ONE'])
    || contract.operational_trigger_readiness?.current_trust_evidence?.scope
      !== 'EPHEMERAL_IMPLEMENTATION_EVIDENCE_NOT_LIVE_OPERATIONAL_ACTIVATION'
    || contract.operational_trigger_readiness?.current_trust_evidence?.absent_receipt
      !== 'CURRENT_TRUST_HEAD_VERIFIED_BLOCKER'
    || contract.operational_trigger_readiness?.current_trust_evidence?.invalid_receipt
      !== 'FAIL_CLOSED'
    || contract.operational_trigger_readiness?.invocation_concurrency_evidence?.source
      !== 'VERIFIED_AUTONOMOUS_POSTGRES_EVIDENCE_RECEIPT_V1_2'
    || contract.operational_trigger_readiness?.invocation_concurrency_evidence
      ?.derived_not_caller_asserted !== true
    || JSON.stringify(contract.operational_trigger_readiness?.invocation_concurrency_evidence
      ?.required_checks) !== JSON.stringify([
      'INVOCATION_ADMISSION_LEAST_PRIVILEGE', 'TWO_CLIENT_CAS_SINGLE_WINNER',
      'SNAPSHOTS_EXACTLY_TWO', 'TRANSITIONS_EXACTLY_ONE'])
    || contract.operational_trigger_readiness?.invocation_concurrency_evidence?.scope
      !== 'EPHEMERAL_IMPLEMENTATION_EVIDENCE_NOT_LIVE_OPERATIONAL_ACTIVATION'
    || contract.operational_trigger_readiness?.invocation_concurrency_evidence?.absent_receipt
      !== 'SINGLE_USE_CONCURRENCY_VERIFIED_BLOCKER'
    || contract.operational_trigger_readiness?.invocation_concurrency_evidence?.invalid_receipt
      !== 'FAIL_CLOSED'
    || contract.operational_trigger_readiness?.protected_launcher_evidence?.source
      !== 'VERIFIED_AUTONOMOUS_POSTGRES_EVIDENCE_RECEIPT_V1_2'
    || contract.operational_trigger_readiness?.protected_launcher_evidence
      ?.derived_not_caller_asserted !== true
    || JSON.stringify(contract.operational_trigger_readiness?.protected_launcher_evidence
      ?.required_checks) !== JSON.stringify([
      'PROTECTED_MANIFEST_LEAST_PRIVILEGE',
      'PROTECTED_MANIFEST_TWO_CLIENT_SINGLE_WINNER',
      'PROTECTED_MANIFEST_RESTART_REPLAY_HELD',
      'PROTECTED_MANIFEST_APPEND_ONLY_MUTATION_DENIED',
      'PROTECTED_MANIFEST_CONSUMPTIONS_EXACTLY_ONE'])
    || contract.operational_trigger_readiness?.protected_launcher_evidence?.scope
      !== 'EPHEMERAL_IMPLEMENTATION_EVIDENCE_EXTERNAL_PROTECTED_LAUNCHER_HOLD'
    || contract.operational_trigger_readiness?.protected_launcher_evidence?.absent_receipt
      !== 'PROTECTED_LAUNCHER_VERIFIED_BLOCKER'
    || contract.operational_trigger_readiness?.protected_launcher_evidence?.invalid_receipt
      !== 'FAIL_CLOSED'
    || contract.operational_trigger_readiness?.durable_nonce_evidence?.source
      !== 'VERIFIED_AUTONOMOUS_POSTGRES_EVIDENCE_RECEIPT_V1_2'
    || contract.operational_trigger_readiness?.durable_nonce_evidence
      ?.derived_not_caller_asserted !== true
    || JSON.stringify(contract.operational_trigger_readiness?.durable_nonce_evidence
      ?.required_checks) !== JSON.stringify([
      'PROTECTED_MANIFEST_LEAST_PRIVILEGE',
      'PROTECTED_MANIFEST_TWO_CLIENT_SINGLE_WINNER',
      'PROTECTED_MANIFEST_RESTART_REPLAY_HELD',
      'PROTECTED_MANIFEST_APPEND_ONLY_MUTATION_DENIED',
      'PROTECTED_MANIFEST_CONSUMPTIONS_EXACTLY_ONE'])
    || contract.operational_trigger_readiness?.durable_nonce_evidence?.absent_receipt
      !== 'DURABLE_NONCE_STORE_VERIFIED_BLOCKER'
    || contract.operational_trigger_readiness?.durable_nonce_evidence?.invalid_receipt
      !== 'FAIL_CLOSED'
    || contract.operational_trigger_readiness?.containment_recovery_evidence?.source
      !== 'VERIFIED_AUTONOMOUS_POSTGRES_EVIDENCE_RECEIPT_V1_2'
    || contract.operational_trigger_readiness?.containment_recovery_evidence
      ?.derived_not_caller_asserted !== true
    || JSON.stringify(contract.operational_trigger_readiness?.containment_recovery_evidence
      ?.required_checks) !== JSON.stringify([
      'CONTAINMENT_STOP_FENCE_BLOCKS', 'CONTAINMENT_RELEASE_FENCE_ALLOWS',
      'CONTAINMENT_RELEASE_CHAIN_ENFORCED', 'CONTAINMENT_APPEND_ONLY_MUTATION_DENIED',
      'CONTAINMENT_MONOTONIC_EVENT_ORDER', 'CONTAINMENT_FENCE_EVENTS_EXACTLY_TWO'])
    || contract.operational_trigger_readiness?.containment_recovery_evidence?.scope
      !== 'EPHEMERAL_IMPLEMENTATION_EVIDENCE_NOT_LIVE_OPERATIONAL_RECOVERY'
    || contract.operational_trigger_readiness?.containment_recovery_evidence?.absent_receipt
      !== 'CONTAINMENT_RECOVERY_VERIFIED_BLOCKER'
    || contract.operational_trigger_readiness?.containment_recovery_evidence?.invalid_receipt
      !== 'FAIL_CLOSED'
    || contract.operational_trigger_readiness?.credential_injection_evidence?.source
      !== 'VERIFIED_BOUNDED_CREDENTIAL_INJECTION_EVIDENCE_V1'
    || contract.operational_trigger_readiness?.credential_injection_evidence
      ?.derived_not_caller_asserted !== true
    || JSON.stringify(contract.operational_trigger_readiness?.credential_injection_evidence
      ?.required_checks) !== JSON.stringify([
      'EXACT_SOURCE_SHA_BINDING', 'MANIFEST_VERIFIED_BEFORE_RESOLUTION',
      'RESOLUTION_COUNT_EXACTLY_ONE', 'CREDENTIAL_MATERIAL_NOT_RETAINED',
      'RAW_PROVIDER_ERROR_NOT_EXPOSED'])
    || contract.operational_trigger_readiness?.credential_injection_evidence?.scope
      !== 'LOCAL_IMPLEMENTATION_EVIDENCE_PROVIDER_INTEGRATION_HOLD'
    || contract.operational_trigger_readiness?.credential_injection_evidence?.absent_receipt
      !== 'BOUNDED_CREDENTIAL_INJECTION_VERIFIED_BLOCKER'
    || contract.operational_trigger_readiness?.credential_injection_evidence?.invalid_receipt
      !== 'FAIL_CLOSED'
    || contract.operational_trigger_readiness?.activation_authorized !== false
    || contract.operational_trigger_readiness?.automatic_trigger !== 'NOT_REGISTERED_HOLD'
    || contract.runtime_evidence_bundle?.state
      !== 'VERIFIED_EXACT_SOURCE_BOUND_BUNDLE_READY'
    || contract.runtime_evidence_bundle?.assembler
      !== 'assembleAutonomousRuntimeEvidenceBundle'
    || contract.runtime_evidence_bundle?.verifier
      !== 'verifyAutonomousRuntimeEvidenceBundle'
    || JSON.stringify(contract.runtime_evidence_bundle?.binds)
      !== JSON.stringify(['POSTGRES_EVIDENCE_RECEIPT',
        'BOUNDED_CREDENTIAL_INJECTION_EVIDENCE'])
    || contract.runtime_evidence_bundle?.source_substitution !== 'FAIL_CLOSED'
    || contract.runtime_evidence_bundle?.provider_integration !== 'NOT_VERIFIED_HOLD'
    || contract.runtime_evidence_bundle?.activation_authorized !== false
    || contract.shadow_trigger_dry_run?.state !== 'NON_MUTATING_SHADOW_DRY_RUN_READY'
    || contract.shadow_trigger_dry_run?.runtime_function
      !== 'runAutonomousRuntimeShadowTriggerDryRun'
    || contract.shadow_trigger_dry_run?.receipt_verifier
      !== 'verifyAutonomousRuntimeShadowTriggerDryRun'
    || contract.shadow_trigger_dry_run?.external_mutation !== false
    || contract.shadow_trigger_dry_run?.automatic_trigger !== 'NOT_REGISTERED_HOLD'
    || contract.shadow_trigger_dry_run?.activation_authorized !== false
    || contract.shadow_soak_verdict?.state
      !== 'THREE_SAMPLE_ORDERED_SOAK_READY_REGISTRATION_HOLD'
    || contract.shadow_soak_verdict?.runtime_function
      !== 'evaluateAutonomousRuntimeShadowSoak'
    || contract.shadow_soak_verdict?.verdict_verifier
      !== 'verifyAutonomousRuntimeShadowSoakVerdict'
    || contract.shadow_soak_verdict?.minimum_samples !== 3
    || contract.shadow_soak_verdict?.same_evidence_bundle_required !== true
    || contract.shadow_soak_verdict?.strict_time_order_required !== true
    || contract.shadow_soak_verdict?.containment_recovery_required !== true
    || contract.shadow_soak_verdict?.automatic_trigger !== 'NOT_REGISTERED_HOLD'
    || contract.shadow_soak_verdict?.activation_authorized !== false
    || contract.trigger_registration_package?.state
      !== 'EXACT_SOURCE_AND_SOAK_BOUND_EXTERNAL_REGISTRATION_REVIEW_HOLD'
    || contract.trigger_registration_package?.creator
      !== 'createAutonomousTriggerRegistrationPackage'
    || contract.trigger_registration_package?.verifier
      !== 'verifyAutonomousTriggerRegistrationPackage'
    || contract.trigger_registration_package?.external_receipt_verifier
      !== 'verifyExternalAutonomousTriggerRegistrationReceipt'
    || contract.trigger_registration_package?.registration_performed_by_creator !== false
    || contract.trigger_registration_package?.workflow_path
      !== '.github/workflows/kidults-control-plane-autonomous-runtime-v1.yml'
    || contract.trigger_registration_package?.trigger_class !== 'SCHEDULE'
    || contract.trigger_registration_package?.automatic_trigger !== 'NOT_REGISTERED_HOLD'
    || contract.trigger_registration_package?.activation_authorized !== false
    || contract.runtime_activation_gate?.state
      !== 'EXTERNAL_REGISTRATION_RECEIPT_REQUIRED_CANARY_ONLY'
    || contract.runtime_activation_gate?.runtime_function
      !== 'assessAutonomousRuntimeActivationGate'
    || contract.runtime_activation_gate?.receipt_verifier
      !== 'verifyAutonomousRuntimeActivationGate'
    || contract.runtime_activation_gate?.missing_external_registration !== 'ACTIVATION_HOLD'
    || contract.runtime_activation_gate?.verified_external_registration
      !== 'ELIGIBLE_FOR_GOVERNED_CANARY'
    || contract.runtime_activation_gate?.production_activation_authorized !== false
    || contract.runtime_activation_gate?.public_release_authorized !== false
    || contract.runtime_activation_gate?.g5_authorized !== false
    || contract.runtime_registration_workflow?.state
      !== 'GITHUB_API_READBACK_REQUIRED_EXTERNAL_REGISTRATION_HOLD'
    || contract.runtime_registration_workflow?.workflow
      !== '.github/workflows/kidults-control-plane-autonomous-runtime-v1.yml'
    || contract.runtime_registration_workflow?.gate_runner
      !== 'scripts/protected-runtime-registration-gate-v1.mjs'
    || contract.runtime_registration_workflow?.receipt_verifier
      !== 'verifyProtectedRuntimeRegistrationReceipt'
    || JSON.stringify(contract.runtime_registration_workflow?.events)
      !== JSON.stringify(['SCHEDULE', 'WORKFLOW_DISPATCH'])
    || contract.runtime_registration_workflow?.schedule !== '17 3 * * *'
    || contract.runtime_registration_workflow?.live_main_verified_before_evidence !== true
    || contract.runtime_registration_workflow?.github_run_api_readback_required !== true
    || JSON.stringify(contract.runtime_registration_workflow?.github_run_api_readback_binds)
      !== JSON.stringify(['REPOSITORY', 'RUN_ID', 'RUN_ATTEMPT', 'EVENT', 'MAIN_SHA', 'WORKFLOW_PATH'])
    || contract.runtime_registration_workflow?.manual_recovery_proves_automatic_trigger !== false
    || contract.runtime_registration_workflow?.ledger_admission_builder
      !== 'scripts/runtime-registration-ledger-admission-v1.mjs'
    || contract.runtime_registration_workflow?.ledger_admission_verifier
      !== 'verifyRuntimeRegistrationLedgerAdmission'
    || contract.runtime_registration_workflow?.ledger_writer !== 'kpmo-workflow-receipt-writer-v1'
    || contract.runtime_registration_workflow?.canary_eligibility_before_ledger_append !== false
    || contract.runtime_registration_workflow?.new_persistence !== false
    || contract.runtime_registration_workflow?.credential_resolution_performed !== false
    || contract.runtime_registration_workflow?.remote_connection_performed !== false
    || contract.runtime_registration_workflow?.missing_external_registration
      !== 'EXTERNAL_REGISTRATION_REQUIRED_HOLD'
    || contract.runtime_registration_workflow?.verified_external_registration
      !== 'GOVERNED_CANARY_ELIGIBLE_ACTIVATION_HOLD'
    || contract.runtime_registration_workflow?.activation_authorized !== false
    || contract.runtime_registration_workflow?.production !== 'HOLD'
    || contract.runtime_registration_workflow?.public_release !== 'HOLD'
    || contract.runtime_registration_workflow?.g5 !== 'HOLD'
    || contract.authority_binding?.authority_class !== 'LOCAL_SYNTHETIC_SHADOW'
    || contract.authority_binding?.subject_type !== 'SUPERVISOR_INVOCATION'
    || contract.authority_binding?.subject_id !== 'INVOCATION_REQUEST_ID'
    || contract.authority_binding?.subject_digest !== 'INVOCATION_REQUEST_DIGEST'
    || contract.authority_binding?.single_use !== true
    || contract.authority_binding?.current_trust_head_required !== true
    || contract.operational_evidence?.state !== 'PURE_EXACT_CHAIN_VERIFIER_READY'
    || contract.operational_evidence?.persisted !== false
    || contract.operational_status_projection?.state
      !== 'LOCAL_SYNTHETIC_READ_ONLY_PROJECTION_READY'
    || contract.operational_status_projection?.authoritative !== false
    || contract.operational_status_projection?.activation_authority !== false
    || contract.operational_status_projection?.new_persistence !== false
    || contract.control_tower_observation?.state !== 'READ_ONLY_OBSERVATION_ADAPTER_READY'
    || contract.control_tower_observation?.surface !== 'CONTROL_TOWER_READ_ONLY_OBSERVATION'
    || contract.control_tower_observation?.action !== 'OBSERVE_ONLY'
    || contract.control_tower_observation?.authoritative !== false
    || contract.control_tower_observation?.activation_authority !== false
    || contract.control_tower_observation?.mutation_allowed !== false
    || contract.control_tower_observation?.new_dashboard !== false
    || contract.containment_recommendation?.state !== 'PURE_RECOMMENDATION_READY'
    || JSON.stringify(contract.containment_recommendation?.outcomes)
      !== JSON.stringify(['CONTINUE', 'QUARANTINE', 'STOP'])
    || contract.containment_recommendation?.automatic_action_taken !== false
    || contract.containment_recommendation?.authoritative !== false
    || contract.containment_recommendation?.activation_authority !== false
    || contract.containment_recommendation?.mutation_allowed !== false
    || contract.containment_recommendation?.new_persistence !== false
    || contract.containment_action_package?.state
      !== 'EXACT_PROTECTED_ACTION_HANDOFF_READY'
    || JSON.stringify(contract.containment_action_package?.created_for)
      !== JSON.stringify(['QUARANTINE', 'STOP'])
    || contract.containment_action_package?.continue_result !== 'NO_PACKAGE'
    || contract.containment_action_package?.authority_class !== 'PROTECTED_ACTION_PACKAGE'
    || contract.containment_action_package?.subject_type !== 'PROTECTED_ACTION_PACKAGE'
    || contract.containment_action_package?.operator_approval_required !== true
    || contract.containment_action_package?.automatic_action_taken !== false
    || contract.containment_action_package?.mutation_allowed !== false
    || contract.containment_action_package?.new_persistence !== false
    || contract.containment_approval_consumption?.state
      !== 'ATOMIC_CURRENT_TRUST_CONSUMPTION_READY'
    || JSON.stringify(contract.containment_approval_consumption?.required_roles)
      !== JSON.stringify(['KPMO', 'PROGRAM_OWNER'])
    || contract.containment_approval_consumption?.single_use !== true
    || contract.containment_approval_consumption?.current_trust_head_required !== true
    || contract.containment_approval_consumption?.expired_or_substituted !== 'FAIL_CLOSED'
    || contract.containment_approval_consumption?.automatic_action_taken !== false
    || contract.containment_approval_consumption?.activation_authorized !== false
    || contract.containment_approval_consumption?.mutation_allowed !== false
    || contract.containment_approval_consumption?.new_persistence !== false
    || contract.containment_execution_fence?.state
      !== 'APPEND_ONLY_POSTGRESQL_RECOVERED_PRE_INVOCATION_FENCE_READY'
    || contract.containment_execution_fence?.runtime_store
      !== 'src/autonomous-control/containment-fence-store-v1.mjs'
    || contract.containment_execution_fence?.migration
      !== 'migrations/postgres/0011_autonomous_containment_fence_events.sql'
    || contract.containment_execution_fence?.clear_state !== 'ALLOW_INVOCATION'
    || contract.containment_execution_fence?.quarantine_state
      !== 'CONTAINMENT_QUARANTINE_HOLD'
    || contract.containment_execution_fence?.stop_state !== 'CONTAINMENT_STOP_HOLD'
    || contract.containment_execution_fence?.checked_before_authority_consumption !== true
    || contract.containment_execution_fence?.caller_supplied_fence_trusted !== false
    || contract.containment_execution_fence?.append_only !== true
    || contract.containment_execution_fence?.current_event_order
      !== 'MONOTONIC_EVENT_SEQUENCE'
    || contract.containment_execution_fence?.approval_and_fence_atomic !== true
    || contract.containment_execution_fence?.release_state
      !== 'APPROVED_CONTAINMENT_RELEASED'
    || JSON.stringify(contract.containment_execution_fence?.release_required_roles)
      !== JSON.stringify(['KPMO', 'PROGRAM_OWNER'])
    || contract.containment_execution_fence?.release_requires_latest_active_fence !== true
    || contract.containment_execution_fence?.release_replay_or_stale !== 'ROLLBACK_AND_HOLD'
    || contract.containment_execution_fence?.automatic_action_taken !== false
    || contract.containment_execution_fence?.mutation_allowed !== false
    || contract.containment_execution_fence?.remote_postgresql !== 'HOLD') {
    errors.push('AUTONOMOUS_LAUNCHER_CONTRACT_INVALID');
  }
  for (const marker of [
    'validateSupervisorInvocationRequest(requestInput)',
    'assessAutonomousRuntimeTriggerReadiness(input)',
    'verifyAutonomousRuntimeTriggerReadiness(input)',
    'assembleAutonomousRuntimeEvidenceBundle(input)',
    'verifyAutonomousRuntimeEvidenceBundle(input)',
    'runAutonomousRuntimeShadowTriggerDryRun(input)',
    'verifyAutonomousRuntimeShadowTriggerDryRun(input)',
    'evaluateAutonomousRuntimeShadowSoak(input)',
    'verifyAutonomousRuntimeShadowSoakVerdict(input)',
    'createAutonomousTriggerRegistrationPackage(input)',
    'verifyAutonomousTriggerRegistrationPackage(input)',
    'verifyExternalAutonomousTriggerRegistrationReceipt(input, options = {})',
    'assessAutonomousRuntimeActivationGate(input)',
    'verifyAutonomousRuntimeActivationGate(input)',
    'verifyAutonomousPostgresEvidenceReceipt(readiness.postgresEvidenceReceipt',
    "currentTrustHead = 'CURRENT_TRUST_HEAD_VERIFIED'",
    "remotePostgresql = 'REMOTE_POSTGRESQL_VERIFIED'",
    "'AUTONOMOUS_TRIGGER_READINESS_CURRENT_TRUST_EVIDENCE_INVALID'",
    "invocationConcurrency = 'SINGLE_USE_CONCURRENCY_VERIFIED'",
    "'AUTONOMOUS_TRIGGER_READINESS_INVOCATION_CONCURRENCY_EVIDENCE_INVALID'",
    "protectedLauncher = 'PROTECTED_LAUNCHER_VERIFIED'",
    "durableNonceStore = 'DURABLE_NONCE_STORE_VERIFIED'",
    "'AUTONOMOUS_TRIGGER_READINESS_DURABLE_NONCE_EVIDENCE_INVALID'",
    "containmentRecovery = 'CONTAINMENT_RECOVERY_VERIFIED'",
    "'AUTONOMOUS_TRIGGER_READINESS_CONTAINMENT_RECOVERY_EVIDENCE_INVALID'",
    'verifyBoundedCredentialInjectionEvidence(readiness.credentialInjectionEvidence',
    "credentialInjection = 'BOUNDED_CREDENTIAL_INJECTION_VERIFIED'",
    "state: blockers.length === 0 ? 'READY_FOR_TRIGGER_REGISTRATION'",
    ": 'TRIGGER_REGISTRATION_HOLD'",
    "automaticTrigger: 'NOT_REGISTERED_HOLD', activationAuthorized: false",
    'validateSupervisorInvocationDecision(decisionInput, request)',
    'authorityClass: decision.authorityClass', 'subjectType: decision.subjectType',
    'subjectId: decision.subjectId', 'subjectDigest: decision.subjectDigest',
    'await verifyAndConsumeCurrentApprovalTrust(authorityClient',
    "authority.state !== 'CONSUMED_AUTHORITY_NOT_ACTIVATED'",
    'await runAdmittedShadowSupervisor({',
    'runPostgresAutonomousLauncher(input, dependencies = {})',
    "'AUTONOMOUS_LAUNCHER_POSTGRES_CLIENT_OVERRIDE_DENIED'",
    'withAutonomousPostgresRuntime(postgres, client => runAutonomousLauncher({',
    'runProtectedPostgresAutonomousLauncher(input, dependencies = {})',
    "'PROTECTED_AUTONOMOUS_LAUNCH_SOURCE_RESOLVER_REQUIRED'",
    "'PROTECTED_AUTONOMOUS_LAUNCH_SOURCE_MISMATCH'",
    'runCredentialInjectedProtectedPostgresLauncher(input, dependencies = {})',
    'await consumeProtectedLaunchManifest(',
    "state: 'MANIFEST_ALREADY_CONSUMED_HOLD'",
    "'PROTECTED_AUTONOMOUS_CREDENTIAL_RESOLUTION_FAILED'",
    "purpose: 'AUTONOMOUS_POSTGRES_LAUNCH'",
    'verifyAutonomousOperationalEvidence({',
    'verifyAutonomousControlTickReceipt(tick?.receipt)',
    'verifySingleCycleReceipt(tick?.cycle?.receipt)',
    'verifySyntheticExecutionReceipt(tick?.cycle?.executionReceipt)',
    'projectAutonomousOperationalStatus(evidence)',
    'projectAutonomousControlTowerObservation(operationalStatus)',
    'recommendAutonomousContainment(controlTowerObservation)',
    'createAutonomousContainmentActionPackage(',
    'consumeAutonomousContainmentApproval(client, {',
    'consumeAutonomousContainmentReleaseApproval(client, {',
    'createAutonomousContainmentReleasePackage(',
    "state: 'APPROVED_CONTAINMENT_RELEASED'",
    'await verifyAndConsumeCurrentApprovalTrust(client, {',
    'const containmentFence = await resolveCurrentAutonomousContainmentFence(containmentClient, {',
    "? 'CONTAINMENT_STOP_HOLD' : 'CONTAINMENT_QUARANTINE_HOLD'",
    "surface: 'CONTROL_TOWER_READ_ONLY_OBSERVATION', action: 'OBSERVE_ONLY'",
    "state: 'LOCAL_SYNTHETIC_CONTAINMENT_RECOMMENDATION'",
    "state: 'OPERATOR_APPROVAL_REQUIRED_NO_ACTION_TAKEN'",
    "state: 'APPROVAL_CONSUMED_NO_ACTION_TAKEN'",
    "state: 'CONTAINMENT_APPROVAL_ALREADY_CONSUMED_HOLD'",
    "authorityClass: 'PROTECTED_ACTION_PACKAGE'",
    "subjectType: 'PROTECTED_ACTION_PACKAGE'",
    'automaticActionTaken: false',
    'mutationAllowed: false',
    "authoritative: false, activationAuthority: false",
    "state: 'AUTHORITY_ALREADY_CONSUMED_HOLD'", "remoteWorkerActivation: 'HOLD'",
    "production: 'HOLD'", "publicRelease: 'HOLD'", "g5: 'HOLD'",
  ]) if (!source.includes(marker)) errors.push(`AUTONOMOUS_LAUNCHER_RUNTIME_CONTROL_MISSING:${marker}`);
  for (const marker of [
    'name: KIDULTS Control Plane Autonomous Verification v1',
    'branches: [main]', "cron: '17 2 * * *'", 'permissions:', 'contents: read',
    'persist-credentials: false', 'timeout-minutes: 10',
    'npm --prefix services/kidults-control-plane run validate',
    'npm --prefix services/kidults-control-plane test',
    'node --test apps/kidults-enterprise-staging/executive-control-tower.test.mjs',
  ]) if (!verificationWorkflow.includes(marker)) {
    errors.push(`AUTONOMOUS_LAUNCHER_VERIFICATION_TRIGGER_MISSING:${marker}`);
  }
  for (const pattern of [/\bsecrets\s*\./, /permissions:\s*[\s\S]*?contents:\s*write/,
    /\b(?:deploy|release|publish)\b/i]) if (pattern.test(verificationWorkflow)) {
    errors.push(`AUTONOMOUS_LAUNCHER_VERIFICATION_TRIGGER_UNSAFE:${pattern.source}`);
  }
  for (const marker of [
    'name: KIDULTS Control Plane Autonomous Runtime Registration Gate',
    "cron: '17 3 * * *'", 'workflow_dispatch:', 'permissions:', 'contents: read',
    "if: github.ref == 'refs/heads/main'",
    'Verify exact live main without resolving provider credentials',
    'persist-credentials: false', 'protected-runtime-registration-gate-v1.mjs',
    'KIDULTS_AUTONOMOUS_REGISTRATION_PACKAGE_B64',
    'KIDULTS_AUTONOMOUS_REGISTRATION_RECEIPT_B64',
    'actions/runs/$GITHUB_RUN_ID', '--github-run-readback',
    '--github-run-id "$GITHUB_RUN_ID"', '--github-run-attempt "$GITHUB_RUN_ATTEMPT"',
    '--github-event "$GITHUB_EVENT_NAME"',
    'runtime-registration-ledger-admission-v1.mjs',
    '--registration-gate artifacts/autonomous-runtime/registration-gate.json',
    '--output artifacts/autonomous-runtime/ledger-admission.json',
  ]) if (!runtimeRegistrationWorkflow.includes(marker)) {
    errors.push(`AUTONOMOUS_RUNTIME_REGISTRATION_WORKFLOW_MISSING:${marker}`);
  }
  for (const pattern of [/\bsecrets\s*\./, /contents:\s*write/,
    /\b(?:deploy|release|publish)\b/i]) if (pattern.test(runtimeRegistrationWorkflow)) {
    errors.push(`AUTONOMOUS_RUNTIME_REGISTRATION_WORKFLOW_UNSAFE:${pattern.source}`);
  }
  if (source.indexOf('await verifyAndConsumeCurrentApprovalTrust(authorityClient')
    > source.indexOf('await runAdmittedShadowSupervisor({')) {
    errors.push('AUTONOMOUS_LAUNCHER_EXECUTION_ORDER_INVALID');
  }
  const launcherRuntime = source.slice(source.indexOf('export async function runAutonomousLauncher'));
  if (launcherRuntime.indexOf('resolveCurrentAutonomousContainmentFence(containmentClient')
    > launcherRuntime.indexOf('validateSupervisorInvocationRequest(requestInput)')) {
    errors.push('AUTONOMOUS_LAUNCHER_CONTAINMENT_FENCE_ORDER_INVALID');
  }
  for (const pattern of [
    /\bfetch\s*\(/, /node:(?:http|https|net|tls|dgram|dns|fs|child_process)/,
    /\b(?:axios|undici|XMLHttpRequest|WebSocket)\b/, /process\.env/,
    /\b(?:INSERT|UPDATE|DELETE|CREATE TABLE)\b/, /setInterval|setTimeout|cron|scheduleEvent/,
  ]) if (pattern.test(source)) errors.push(`AUTONOMOUS_LAUNCHER_PROHIBITED_CAPABILITY:${pattern.source}`);
  return { errors };
}

export function inspectAutonomousPostgresRuntimeClient(controlPlane, clientContract, source,
  packageJson, packageLock) {
  const errors = [];
  const boundary = controlPlane.autonomous_postgres_runtime_client || {};
  if (boundary.state !== 'RUNTIME_CLIENT_IMPLEMENTED_LIVE_CONNECTION_NOT_VERIFIED'
    || boundary.contract !== 'contracts/autonomous-postgres-runtime-client-v1.json'
    || boundary.scope !== 'ONE_TLS_VERIFIED_TRANSACTION_SESSION_WITH_BOUNDED_FAILURES'
    || boundary.driver !== 'pg@8.23.0'
    || boundary.live_remote_connection !== 'NOT_VERIFIED_HOLD'
    || boundary.single_use_concurrency !== 'NOT_VERIFIED_HOLD'
    || boundary.automatic_trigger !== 'NOT_REGISTERED_HOLD'
    || boundary.production !== 'HOLD' || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('AUTONOMOUS_POSTGRES_RUNTIME_BOUNDARY_INVALID');
  }
  if (clientContract.contract_id !== 'KIDULTS_AUTONOMOUS_POSTGRES_RUNTIME_CLIENT_V1'
    || clientContract.version !== '1.0.0' || clientContract.state !== boundary.state
    || clientContract.module !== 'src/autonomous-control/postgres-runtime-client-v1.mjs'
    || clientContract.driver !== boundary.driver
    || clientContract.connection_model !== 'ONE_CONNECTED_CLIENT_PRESERVES_TRANSACTION_SESSION'
    || clientContract.dsn_handling !== 'DECOMPOSED_NOT_LOGGED'
    || clientContract.tls !== 'CERTIFICATE_VERIFICATION_REQUIRED'
    || clientContract.failure_surface !== 'BOUNDED_CODES_NO_DRIVER_OR_CREDENTIAL_MATERIAL'
    || clientContract.explicit_close !== true
    || clientContract.bounded_operation_lifecycle_helper !== true
    || clientContract.credential_adapter?.state
      !== 'PROVIDER_NEUTRAL_SINGLE_RESOLUTION_READY_EXTERNAL_PROVIDER_HOLD'
    || clientContract.credential_adapter?.factory
      !== 'createBoundedPostgresCredentialResolver'
    || JSON.stringify(clientContract.credential_adapter?.request_binding)
      !== JSON.stringify(['SOURCE_SHA', 'MANIFEST_DIGEST', 'REQUEST_ID', 'APPLICATION_NAME'])
    || clientContract.credential_adapter?.secret_name_stored_as_digest_only !== true
    || clientContract.credential_adapter?.maximum_resolutions !== 1
    || clientContract.credential_adapter?.raw_provider_error_exposed !== false
    || clientContract.credential_adapter?.external_provider_verified !== false
    || clientContract.live_remote_connection !== 'NOT_VERIFIED_HOLD'
    || clientContract.single_use_concurrency !== 'NOT_VERIFIED_HOLD'
    || clientContract.automatic_trigger !== 'NOT_REGISTERED_HOLD'
    || clientContract.production !== 'HOLD' || clientContract.public_release !== 'HOLD'
    || clientContract.g5 !== 'HOLD') {
    errors.push('AUTONOMOUS_POSTGRES_RUNTIME_CONTRACT_INVALID');
  }
  if (packageJson.dependencies?.pg !== '8.23.0'
    || packageLock.packages?.['']?.dependencies?.pg !== '8.23.0'
    || packageLock.packages?.['node_modules/pg']?.version !== '8.23.0') {
    errors.push('AUTONOMOUS_POSTGRES_RUNTIME_DRIVER_NOT_PINNED');
  }
  for (const marker of [
    "import { Client as PostgresClient } from 'pg'", 'new URL(options.dsn)',
    "parsed.searchParams.get('sslmode') === 'require'",
    'ssl: Object.freeze({ rejectUnauthorized: true })', 'connectionTimeoutMillis:',
    'statement_timeout:', 'query_timeout:', 'await client.connect()',
    'return await client.query(...args)', 'await client.end()',
    'withAutonomousPostgresRuntime', 'await operation(client)',
    'createBoundedPostgresCredentialResolver(input, dependencies = {})',
    "throw new Error('AUTONOMOUS_POSTGRES_CREDENTIAL_PROVIDER_FAILED')",
    'await client.close()', 'if (failure === undefined) failure = error',
    "throw new Error('AUTONOMOUS_POSTGRES_RUNTIME_CONNECT_FAILED')",
    "throw new Error('AUTONOMOUS_POSTGRES_RUNTIME_QUERY_FAILED')",
  ]) if (!source.includes(marker)) {
    errors.push(`AUTONOMOUS_POSTGRES_RUNTIME_CONTROL_MISSING:${marker}`);
  }
  for (const pattern of [/console\./, /process\.env/, /connectionString\s*:/, /rejectUnauthorized:\s*false/]) {
    if (pattern.test(source)) errors.push(`AUTONOMOUS_POSTGRES_RUNTIME_UNSAFE:${pattern.source}`);
  }
  return { errors };
}

export function inspectLeaseCheckpointReconciliation(controlPlane, contract, sources) {
  const errors = [];
  const boundary = controlPlane.autonomous_lease_checkpoint_reconciliation || {};
  if (boundary.state !== 'LOCAL_APPEND_ONLY_RECOVERY_CHAIN_VERIFIED_REMOTE_HOLD'
    || boundary.contract !== 'contracts/autonomous-lease-checkpoint-reconciliation-v1.json'
    || boundary.scope !== 'LEASE_CHECKPOINT_AGENT_LOSS_SUCCESSOR_EPOCH_AND_TERMINAL_TRUTH') {
    errors.push('LEASE_CHECKPOINT_RECONCILIATION_BOUNDARY_INVALID');
  }
  if (boundary.new_runtime_module !== false || boundary.new_persistence !== false
    || boundary.automatic_trigger !== 'NOT_REGISTERED_HOLD'
    || boundary.remote_worker_activation !== 'HOLD' || boundary.production !== 'HOLD'
    || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('LEASE_CHECKPOINT_RECONCILIATION_CAPABILITY_ENABLED');
  }
  if (contract.contract_id !== 'KIDULTS_AUTONOMOUS_LEASE_CHECKPOINT_RECONCILIATION_V1'
    || contract.version !== '1.0.0' || contract.state !== boundary.state
    || contract.truth_authority !== 'POSTGRESQL_LATEST_APPEND_ONLY_TASK_SNAPSHOT'
    || contract.reconciliation?.selection !== 'LATEST_REVISION_ONLY'
    || contract.reconciliation?.checkpoint_preserved !== true
    || contract.reconciliation?.stale_worker_fenced !== true
    || contract.reconciliation?.bounded_candidate_scan !== true
    || contract.new_runtime_module !== false || contract.new_persistence !== false
    || contract.new_policy_engine !== false || contract.new_controller_gate_or_registry !== false) {
    errors.push('LEASE_CHECKPOINT_RECONCILIATION_CONTRACT_INVALID');
  }
  const required = {
    lifecycle: ['task.leaseEpoch + 1', 'checkpointDigest', 'recoverExpiredLease',
      "transition: exhausted ? 'QUARANTINE_EXHAUSTED' : 'RECOVER_EXPIRED_LEASE'"],
    ledger: ['ORDER BY revision DESC LIMIT 1', 'TASK_LEDGER_STALE_REVISION',
      'INSERT INTO kidults_control.autonomous_task_transitions'],
    scheduler: ['AUTONOMOUS_SCHEDULER_EXPIRED_LEASES_V1',
      "state IN ('LEASED', 'RUNNING')", 'recoverNextExpiredSyntheticLease',
      'candidateLimit(maxCandidates)'],
  };
  for (const [name, markers] of Object.entries(required)) {
    for (const marker of markers) if (!sources[name]?.includes(marker)) {
      errors.push(`LEASE_CHECKPOINT_RECONCILIATION_CONTROL_MISSING:${name}:${marker}`);
    }
  }
  return { errors };
}

export function inspectProviderRightsPreflight(controlPlane, contract, source) {
  const errors = [];
  const boundary = controlPlane.provider_rights_preflight || {};
  if (boundary.state !== 'READ_ONLY_TRACK_AZ_RIGHTS_PROJECTION_READY_EXECUTION_HOLD'
    || boundary.contract !== 'contracts/provider-rights-preflight-v1.json'
    || boundary.scope !== 'CURRENT_SOLD_PRIVATE_EVALUATION_ONLY'
    || boundary.canonical_input
      !== 'coordination/kidults/market/provider-rights-decision-gate-v1.json') {
    errors.push('PROVIDER_RIGHTS_PREFLIGHT_BOUNDARY_INVALID');
  }
  if (boundary.provider_contact !== false || boundary.external_egress !== false
    || boundary.credential_resolution !== false || boundary.production !== 'HOLD'
    || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('PROVIDER_RIGHTS_PREFLIGHT_CAPABILITY_ENABLED');
  }
  if (contract.contract_id !== 'KIDULTS_PROVIDER_RIGHTS_PREFLIGHT_V1'
    || contract.version !== '1.0.0' || contract.state !== boundary.state
    || contract.scope !== boundary.scope || contract.canonical_input !== boundary.canonical_input
    || contract.projection?.PASS !== 'PREFLIGHT_ELIGIBLE_NO_FETCH'
    || contract.projection?.NO_GO !== 'DENY'
    || contract.projection?.NEEDS_CLARIFICATION !== 'HOLD') {
    errors.push('PROVIDER_RIGHTS_PREFLIGHT_CONTRACT_INVALID');
  }
  for (const marker of [
    'projectProviderRightsPreflight', 'verifyProviderRightsPreflight',
    'RIGHTS_PASS_EXECUTION_NOT_AUTHORIZED', 'PROVIDER_RIGHTS_ACTIVATION_NOT_DISABLED',
    'providerContact: false', 'externalEgress: false', 'credentialResolution: false',
  ]) if (!source.includes(marker)) {
    errors.push(`PROVIDER_RIGHTS_PREFLIGHT_CONTROL_MISSING:${marker}`);
  }
  for (const pattern of [
    /\bfetch\s*\(/, /node:(?:http|https|net|tls|dgram|dns|fs|child_process)/,
    /process\.env/, /setInterval|setTimeout|cron|scheduleEvent/,
  ]) if (pattern.test(source)) {
    errors.push(`PROVIDER_RIGHTS_PREFLIGHT_PROHIBITED_CAPABILITY:${pattern.source}`);
  }
  return { errors };
}

export function inspectProviderRightsApprovalEvidence(controlPlane, contract, source) {
  const errors = [];
  const boundary = controlPlane.provider_rights_approval_evidence || {};
  if (boundary.state !== 'TRACK_AZ_KPMO_CONSUMED_APPROVAL_EVIDENCE_READY_NO_ACTIVATION'
    || boundary.contract !== 'contracts/provider-rights-approval-evidence-v1.json'
    || boundary.scope !== 'PROVIDER_PREFLIGHT_NO_FETCH_ONLY') {
    errors.push('PROVIDER_RIGHTS_APPROVAL_EVIDENCE_BOUNDARY_INVALID');
  }
  if (boundary.runtime_provider_wiring !== 'NOT_WIRED_HOLD'
    || boundary.activation_authorized !== false || boundary.provider_contact_executed !== false
    || boundary.external_egress !== false || boundary.credential_resolution !== false
    || boundary.production !== 'HOLD' || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('PROVIDER_RIGHTS_APPROVAL_EVIDENCE_CAPABILITY_ENABLED');
  }
  if (contract.contract_id !== 'KIDULTS_PROVIDER_RIGHTS_APPROVAL_EVIDENCE_V1'
    || contract.version !== '1.0.0' || contract.state !== boundary.state
    || contract.scope !== boundary.scope
    || contract.eligible_preflight_verdict !== 'PREFLIGHT_ELIGIBLE_NO_FETCH'
    || contract.result_state !== 'VERIFIED_PROVIDER_PREFLIGHT_EVIDENCE_NO_ACTIVATION'
    || contract.runtime_provider_wiring !== 'NOT_WIRED_HOLD'
    || contract.activation_authorized !== false) {
    errors.push('PROVIDER_RIGHTS_APPROVAL_EVIDENCE_CONTRACT_INVALID');
  }
  for (const marker of [
    'bindProviderRightsApprovalEvidence', 'verifyProviderRightsApprovalEvidence',
    'verifyCurrentApprovalEvidence', 'PROVIDER_RIGHTS_APPROVAL_PREFLIGHT_NOT_ELIGIBLE',
    "['KPMO', 'TRACK_A', 'TRACK_Z']", 'activationAuthorized: false',
    'providerContactExecuted: false',
  ]) if (!source.includes(marker)) {
    errors.push(`PROVIDER_RIGHTS_APPROVAL_EVIDENCE_CONTROL_MISSING:${marker}`);
  }
  for (const pattern of [
    /\bfetch\s*\(/, /node:(?:http|https|net|tls|dgram|dns|fs|child_process)/,
    /process\.env/, /setInterval|setTimeout|cron|scheduleEvent/,
  ]) if (pattern.test(source)) {
    errors.push(`PROVIDER_RIGHTS_APPROVAL_EVIDENCE_PROHIBITED_CAPABILITY:${pattern.source}`);
  }
  return { errors };
}

export function inspectAutonomousPostgresEvidence(controlPlane, contract, source, verifierSource,
  independentVerifierSource, orchestratorSource) {
  const errors = [];
  const boundary = controlPlane.autonomous_postgres_evidence || {};
  if (boundary.state !== 'IMPLEMENTED_NOT_EXECUTED_NO_APPROVED_EPHEMERAL_POSTGRES'
    || boundary.contract !== 'contracts/autonomous-postgres-evidence-v1.json'
    || boundary.scope
      !== 'EPHEMERAL_POSTGRES_SCHEMA_PRIVILEGE_CAS_TRUST_CONTAINMENT_AND_MANIFEST_REPLAY') {
    errors.push('AUTONOMOUS_POSTGRES_EVIDENCE_BOUNDARY_INVALID');
  }
  if (boundary.runtime_runner_database_execution !== false || boundary.remote_postgresql !== 'HOLD'
    || boundary.automatic_trigger !== 'NOT_REGISTERED_HOLD' || boundary.production !== 'HOLD'
    || boundary.public !== 'HOLD' || boundary.g5 !== 'HOLD') {
    errors.push('AUTONOMOUS_POSTGRES_EVIDENCE_OVERCLAIMED');
  }
  if (boundary.receipt_verification
    !== 'EXACT_SHAPE_DIGEST_SOURCE_MIGRATION_RESULTS_AND_AUTHORITY_VERIFIED') {
    errors.push('AUTONOMOUS_POSTGRES_RECEIPT_VERIFICATION_MISSING');
  }
  if (boundary.governed_canary_orchestration !== 'READY_NOT_EXECUTED') {
    errors.push('AUTONOMOUS_POSTGRES_CANARY_ORCHESTRATION_INVALID');
  }
  if (contract.contract_id !== 'KIDULTS_AUTONOMOUS_POSTGRES_EVIDENCE_V1'
    || contract.version !== '1.2.0'
    || contract.state !== 'IMPLEMENTED_NOT_EXECUTED_NO_APPROVED_EPHEMERAL_POSTGRES'
    || contract.scope
      !== 'EPHEMERAL_POSTGRES_SCHEMA_PRIVILEGE_CAS_TRUST_CONTAINMENT_AND_MANIFEST_REPLAY') {
    errors.push('AUTONOMOUS_POSTGRES_EVIDENCE_CONTRACT_INVALID');
  }
  if (contract.receipt_verifier?.module
      !== 'src/common-control/autonomous-postgres-evidence-receipt-v1.mjs'
    || contract.receipt_verifier?.independent_cli
      !== 'scripts/verify-autonomous-postgres-evidence-v1.mjs'
    || contract.receipt_verifier?.state
      !== 'EXACT_SHAPE_DIGEST_SOURCE_MIGRATION_RESULTS_AND_AUTHORITY_VERIFIED') {
    errors.push('AUTONOMOUS_POSTGRES_RECEIPT_VERIFIER_CONTRACT_INVALID');
  }
  if (contract.governed_canary_orchestrator?.script
      !== 'scripts/run-autonomous-postgres-canary-v1.mjs'
    || contract.governed_canary_orchestrator?.state
      !== 'RUNNER_THEN_CREDENTIAL_FREE_INDEPENDENT_VERIFIER_READY_NOT_EXECUTED') {
    errors.push('AUTONOMOUS_POSTGRES_CANARY_ORCHESTRATOR_CONTRACT_INVALID');
  }
  for (const marker of [
    "const SAFE_DATABASE = /^kidults_ephemeral_", "const CONFIRMATION = 'EPHEMERAL_NON_PRODUCTION_APPROVED'",
    "'0006_autonomous_supervisor_invocation_admission.sql'",
    "'0007_cryptographic_approval_consumption.sql'",
    "'0008_approval_trust_root_lifecycle.sql'",
    "'0009_approval_trust_registry_snapshots.sql'", 'AUTONOMOUS_POSTGRES_NONEMPTY_TARGET_DENIED',
    "'0010_approval_trust_current_heads.sql'",
    "'0011_autonomous_containment_fence_events.sql'",
    "'0012_protected_launch_manifest_consumptions.sql'",
    'AUTONOMOUS_POSTGRES_DIRTY_SOURCE', 'permission denied for table autonomous_admission_proofs',
    'KIDULTS_APPEND_ONLY_MUTATION_DENIED', 'KIDULTS_AUTONOMOUS_TASK_TRANSITION_PAIR_REQUIRED',
    "rolname='kidults_control_autonomous_invocation'",
    "rolname='kidults_control_approval_consumer'",
    "rolname='kidults_control_trust_root_lifecycle'",
    "rolname='kidults_control_trust_registry_snapshot'",
    "rolname='kidults_control_trust_current_head'",
    'kidults_control.autonomous_supervisor_invocation_consumptions',
    'kidults_control.cryptographic_approval_consumptions',
    'kidults_control.approval_trust_root_candidates',
    'kidults_control.approval_trust_root_lifecycle_events',
    'kidults_control.approval_trust_registry_snapshots',
    'kidults_control.approval_trust_current_heads',
    'kidults_control.protected_launch_manifest_consumptions',
    "results.sort().join(',') !== '0,1'", "pairCount !== '2|1'",
    'TRUST_PUBLISHER_LOCK_HELD', 'AUTONOMOUS_POSTGRES_TRUST_REVOCATION_RACE_FAILED',
    "trustRaceCounts !== '2|0'", 'trustRevocationWinsTwoClientRace: true',
    'TRUST_CONSUMER_LOCK_HELD', 'AUTONOMOUS_POSTGRES_TRUST_CONSUMPTION_FIRST_RACE_FAILED',
    "bidirectionalRaceCounts !== '4|1'", 'trustConsumptionWinsTwoClientRace: true',
    'AUTONOMOUS_POSTGRES_CONTAINMENT_STOP_NOT_ENFORCED',
    'AUTONOMOUS_POSTGRES_CONTAINMENT_RELEASE_NOT_ENFORCED',
    "containmentOrder !== 'true|2'", 'containmentStopFenceBlocks: true',
    'AUTONOMOUS_POSTGRES_MANIFEST_TWO_CLIENT_RACE_FAILED',
    'AUTONOMOUS_POSTGRES_MANIFEST_RESTART_REPLAY_FAILED',
    'protectedManifestTwoClientSingleWinner: true',
    'protectedManifestRestartReplayHeld: true',
    'containmentReleaseFenceAllows: true', 'containmentReleaseChainEnforced: true',
    'containmentAppendOnlyMutationDenied: true',
    'containmentMonotonicEventOrder: true',
    'ORDER BY event_sequence DESC LIMIT 1',
    "setTimeout(() => child.kill('SIGKILL'), 30000)",
    'runtimeRunnerDatabaseExecution: false', 'credentialMaterialRetained: false',
    'PGHOST: parsed.hostname', 'PGDATABASE: decodeURIComponent(parsed.pathname.slice(1))',
    'AUTONOMOUS_POSTGRES_OUTPUT_DIRECTORY_OWNER_INVALID',
    'AUTONOMOUS_POSTGRES_ORIGIN_INVALID',
    "production: 'HOLD'", "publicRelease: 'HOLD'", "g5: 'HOLD'",
  ]) if (!`${source}\n${verifierSource}`.includes(marker)) {
    errors.push(`AUTONOMOUS_POSTGRES_EVIDENCE_CONTROL_MISSING:${marker}`);
  }
  for (const forbidden of ['console.log(dsn)', "writeFileSync(path.join(output, 'dsn",
    "'--dbname'", 'EPHEMERAL_PRODUCTION_APPROVED']) {
    if (source.includes(forbidden)) errors.push(`AUTONOMOUS_POSTGRES_EVIDENCE_SECRET_OR_GATE_VIOLATION:${forbidden}`);
  }
  for (const marker of [
    'verifyAutonomousPostgresEvidenceReceipt', 'AUTONOMOUS_POSTGRES_MIGRATIONS_V1',
    'AUTONOMOUS_POSTGRES_RECEIPT_CHECKS_SHAPE_INVALID',
    'AUTONOMOUS_POSTGRES_RECEIPT_COUNTS_INVALID',
    'AUTONOMOUS_POSTGRES_RECEIPT_AUTHORITY_INVALID', 'verifySelfDigest',
  ]) if (!verifierSource.includes(marker)) {
    errors.push(`AUTONOMOUS_POSTGRES_RECEIPT_VERIFIER_CONTROL_MISSING:${marker}`);
  }
  for (const marker of [
    'verifyEvidenceReceiptAgainstRepository', 'readSafeEvidenceReceipt',
    'POSTGRES_EVIDENCE_RECEIPT_INSIDE_REPOSITORY_DENIED',
    'POSTGRES_EVIDENCE_RECEIPT_PERMISSIONS_INVALID',
    'POSTGRES_EVIDENCE_DIRTY_SOURCE', 'expectedMigrationDigest: migrationDigest()',
    "state: 'VERIFIED_PASS_READ_ONLY'", 'credentialMaterialRead: false',
  ]) if (!independentVerifierSource.includes(marker)) {
    errors.push(`AUTONOMOUS_POSTGRES_INDEPENDENT_VERIFIER_CONTROL_MISSING:${marker}`);
  }
  for (const marker of [
    'runGovernedPostgresCanary', 'canaryRunnerEnvironment', 'canaryVerifierEnvironment',
    'POSTGRES_CANARY_RUNNER_FAILED', 'POSTGRES_CANARY_INDEPENDENT_VERIFICATION_FAILED',
    'credentialForwardedOnlyToRunner: true', 'credentialForwardedToVerifier: false',
    'timeout: 180000', 'timeout: 30000', "state: 'VERIFIED_PASS_EPHEMERAL_ONLY'",
  ]) if (!orchestratorSource.includes(marker)) {
    errors.push(`AUTONOMOUS_POSTGRES_CANARY_ORCHESTRATOR_CONTROL_MISSING:${marker}`);
  }
  return { errors };
}

export function discoverProductionD1Writers(root) {
  const sourceRoot = path.join(root, 'services');
  return walk(sourceRoot, (file) => {
    const normalized = file.replaceAll('\\', '/');
    return /\/src\/.*\.(?:ts|js|mjs)$/.test(normalized) && !normalized.endsWith('.d.ts');
  })
    .filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return writeSql.test(source) && d1Signal.test(source);
    })
    .map((file) => path.relative(root, file).replaceAll('\\', '/'))
    .sort();
}

export function discoverD1Bindings(root) {
  return walk(root, (file) => path.basename(file) === 'wrangler.jsonc')
    .flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes('"d1_databases"')) return [];
      const relative = path.relative(root, file).replaceAll('\\', '/');
      const d1Block = source.match(/"d1_databases"\s*:\s*\[([\s\S]*?)\]\s*,\s*"(?:queues|durable_objects|kv_namespaces|r2_buckets|vars|triggers)"/);
      if (!d1Block) return [`${relative}#UNPARSEABLE_D1_BLOCK`];
      return [...d1Block[1].matchAll(/"binding"\s*:\s*"([A-Za-z0-9_]+)"/g)]
        .map((match) => `${relative}#${match[1]}`);
    })
    .sort();
}

export function validateBoundary(root = defaultRoot) {
  const contract = readJson(path.join(root, 'services/kidults-control-plane/contracts/control-plane-v1.json'));
  const fivePlaneContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/five-plane-runtime-authority-v1.json'));
  const commonControlContract = readJson(path.join(root, 'services/kidults-control-plane/contracts/common-control-foundation-v1.json'));
  const approvalAuthorityContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/approval-authority-matrix-v1.json'));
  const approvalConsumptionContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/approval-consumption-ledger-v1.json'));
  const approvalTrustRootLifecycleContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/approval-trust-root-lifecycle-v1.json'));
  const approvalTrustRegistryCompilerContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/approval-trust-registry-compiler-v1.json'));
  const trustHandoffBundleContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/approval-trust-handoff-control-bundle-v1.json'));
  const approvalTrustAtomicHeadContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/approval-trust-atomic-head-v1.json'));
  const autonomousTaskContract = readJson(path.join(root, 'services/kidults-control-plane/contracts/autonomous-task-lifecycle-v1.json'));
  const autonomousSchedulerContract = readJson(path.join(root, 'services/kidults-control-plane/contracts/autonomous-task-scheduler-v1.json'));
  const autonomousWorkerContract = readJson(path.join(root, 'services/kidults-control-plane/contracts/autonomous-task-worker-v1.json'));
  const autonomousAdmissionProofContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/autonomous-admission-proof-store-v1.json'));
  const autonomousRunnerContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/autonomous-single-cycle-runner-v1.json'));
  const autonomousControlTickContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/autonomous-control-tick-v1.json'));
  const autonomousShadowSupervisorContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/autonomous-shadow-supervisor-v1.json'));
  const autonomousInvocationAdmissionContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/autonomous-supervisor-invocation-admission-v1.json'));
  const autonomousLauncherContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/autonomous-launcher-v1.json'));
  const autonomousPostgresRuntimeClientContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/autonomous-postgres-runtime-client-v1.json'));
  const leaseCheckpointReconciliationContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/autonomous-lease-checkpoint-reconciliation-v1.json'));
  const autonomousPostgresEvidenceContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/autonomous-postgres-evidence-v1.json'));
  const providerRightsPreflightContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/provider-rights-preflight-v1.json'));
  const providerRightsApprovalEvidenceContract = readJson(path.join(root,
    'services/kidults-control-plane/contracts/provider-rights-approval-evidence-v1.json'));
  const canonicalIdentityContractPath = contract.workflow_receipt_ledger?.canonical_dedupe?.classifier_contract;
  const canonicalIdentityContract = canonicalIdentityContractPath
    ? readJson(path.join(root, canonicalIdentityContractPath))
    : null;
  const registry = readJson(path.join(root, 'services/kidults-control-plane/contracts/d1-writer-registry-v1.json'));
  const postgresMigrations = loadOrderedPostgresMigrations(path.join(root, 'services/kidults-control-plane/migrations/postgres'));
  const postgresSql = postgresMigrations.sql;
  const d1Sql = fs.readFileSync(path.join(root, 'services/kidults-control-plane/migrations/d1/0001_read_models.sql'), 'utf8');
  const workflowReceiptRuntime = fs.readFileSync(path.join(root, 'services/kidults-control-plane/src/workflow-receipt-ledger.mjs'), 'utf8');
  const runtimeRegistrationLedgerAdmission = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/scripts/runtime-registration-ledger-admission-v1.mjs'), 'utf8');
  const canonicalClaimRuntime = fs.readFileSync(path.join(root, 'services/kidults-control-plane/src/workflow-canonical-run-claims.mjs'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'services/kidults-control-plane/README.md'), 'utf8');
  const runbook = fs.readFileSync(path.join(root, 'services/kidults-control-plane/ACTIVATION_RUNBOOK.md'), 'utf8');
  const commonControlSources = Object.fromEntries([
    'canonical-v1.mjs', 'admission-v1.mjs', 'shadow-broker-v1.mjs',
  ].map((file) => [file, fs.readFileSync(path.join(root, 'services/kidults-control-plane/src/common-control', file), 'utf8')]));
  const approvalEnvelopeSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/src/common-control/approval-envelope-v1.mjs'), 'utf8');
  const approvalConsumptionSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/src/common-control/approval-consumption-v1.mjs'), 'utf8');
  const approvalTrustRootLifecycleSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/src/common-control/approval-trust-root-lifecycle-v1.mjs'), 'utf8');
  const approvalTrustRegistryCompilerSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/src/common-control/approval-trust-registry-compiler-v1.mjs'), 'utf8');
  const trustHandoffBundleSources = Object.fromEntries([
    'approval-trust-registry-snapshot-v1.mjs', 'approval-trust-registry-resolver-v1.mjs',
    'approval-trust-registry-fence-v1.mjs', 'approval-trust-verification-gateway-v1.mjs',
  ].map((file) => [file, fs.readFileSync(path.join(root,
    'services/kidults-control-plane/src/common-control', file), 'utf8')]));
  const approvalTrustAtomicHeadSources = Object.fromEntries([
    'approval-trust-current-head-v1.mjs', 'approval-trust-atomic-gateway-v1.mjs',
    'approval-consumption-v1.mjs', 'approval-trust-runtime-v1.mjs',
  ].map((file) => [file, fs.readFileSync(path.join(root,
    'services/kidults-control-plane/src/common-control', file), 'utf8')]));
  const controlPlaneRuntimeSources = Object.fromEntries(walk(path.join(root,
    'services/kidults-control-plane/src'), (file) => file.endsWith('.mjs')).map((file) => [
    path.relative(root, file).replaceAll('\\', '/'), fs.readFileSync(file, 'utf8'),
  ]));
  const autonomousTaskSource = fs.readFileSync(
    path.join(root, 'services/kidults-control-plane/src/autonomous-control/task-lifecycle-v1.mjs'), 'utf8'
  );
  const autonomousTaskLedgerSource = fs.readFileSync(
    path.join(root, 'services/kidults-control-plane/src/autonomous-control/task-ledger-v1.mjs'), 'utf8'
  );
  const autonomousTaskSchedulerSource = fs.readFileSync(
    path.join(root, 'services/kidults-control-plane/src/autonomous-control/task-scheduler-v1.mjs'), 'utf8'
  );
  const autonomousTaskWorkerSources = {
    worker: fs.readFileSync(path.join(root, 'services/kidults-control-plane/src/autonomous-control/task-worker-v1.mjs'), 'utf8'),
    registry: fs.readFileSync(path.join(root, 'services/kidults-control-plane/src/autonomous-control/synthetic-handler-registry-v1.mjs'), 'utf8'),
  };
  const autonomousAdmissionProofSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/src/autonomous-control/admission-proof-store-v1.mjs'), 'utf8');
  const autonomousRunnerSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/src/autonomous-control/task-runner-v1.mjs'), 'utf8');
  const autonomousControlTickSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/src/autonomous-control/control-tick-v1.mjs'), 'utf8');
  const autonomousShadowSupervisorSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/src/autonomous-control/shadow-supervisor-v1.mjs'), 'utf8');
  const autonomousInvocationAdmissionSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/src/autonomous-control/invocation-admission-v1.mjs'), 'utf8');
  const autonomousLauncherSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/src/autonomous-control/launcher-v1.mjs'), 'utf8');
  const autonomousPostgresRuntimeClientSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/src/autonomous-control/postgres-runtime-client-v1.mjs'), 'utf8');
  const controlPlanePackage = readJson(path.join(root,
    'services/kidults-control-plane/package.json'));
  const controlPlanePackageLock = readJson(path.join(root,
    'services/kidults-control-plane/package-lock.json'));
  const autonomousLauncherVerificationWorkflow = fs.readFileSync(path.join(root,
    '.github/workflows/kidults-control-plane-autonomous-verification-v1.yml'), 'utf8');
  const autonomousLauncherRuntimeRegistrationWorkflow = fs.readFileSync(path.join(root,
    '.github/workflows/kidults-control-plane-autonomous-runtime-v1.yml'), 'utf8');
  const autonomousPostgresEvidenceSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/scripts/autonomous-postgres-evidence-v1.mjs'), 'utf8');
  const autonomousPostgresEvidenceVerifierSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/src/common-control/autonomous-postgres-evidence-receipt-v1.mjs'), 'utf8');
  const autonomousPostgresIndependentVerifierSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/scripts/verify-autonomous-postgres-evidence-v1.mjs'), 'utf8');
  const autonomousPostgresCanaryOrchestratorSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/scripts/run-autonomous-postgres-canary-v1.mjs'), 'utf8');
  const providerRightsPreflightSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/src/common-control/provider-rights-preflight-v1.mjs'), 'utf8');
  const providerRightsApprovalEvidenceSource = fs.readFileSync(path.join(root,
    'services/kidults-control-plane/src/common-control/provider-rights-approval-evidence-v1.mjs'), 'utf8');
  const errors = [];

  if (contract.canonical_system_of_record?.engine !== 'POSTGRESQL') errors.push('SYSTEM_OF_RECORD_NOT_POSTGRESQL');
  if (contract.canonical_system_of_record?.authority !== 'SOLE_CANONICAL_WRITABLE_LEDGER') errors.push('POSTGRESQL_AUTHORITY_WEAKENED');
  if (contract.d1?.role !== 'READ_MODEL_ONLY') errors.push('D1_ROLE_NOT_READ_MODEL_ONLY');
  if (contract.d1?.direct_product_writes !== 'PROHIBITED') errors.push('D1_DIRECT_PRODUCT_WRITES_NOT_PROHIBITED');
  if (contract.five_plane_runtime_authority?.contract !== 'contracts/five-plane-runtime-authority-v1.json' ||
      contract.five_plane_runtime_authority?.state !== fivePlaneContract.state ||
      contract.five_plane_runtime_authority?.plane_count !== 5 ||
      contract.five_plane_runtime_authority?.unclassified_runtime_modules_allowed !== 0 ||
      contract.five_plane_runtime_authority?.multi_owner_runtime_modules_allowed !== 0 ||
      fivePlaneContract.structure_limits?.new_controller_gate_or_registry_allowed !== false) {
    errors.push('FIVE_PLANE_RUNTIME_AUTHORITY_BOUNDARY_DRIFT');
  }
  if (fivePlaneContract.activation?.remote_runtime !== 'HOLD' ||
      fivePlaneContract.activation?.production !== 'HOLD' ||
      fivePlaneContract.activation?.public !== 'HOLD' || fivePlaneContract.activation?.g5 !== 'HOLD') {
    errors.push('FIVE_PLANE_PROTECTED_BOUNDARY_WEAKENED');
  }
  if (contract.activation?.production !== 'HOLD' || contract.activation?.g5 !== 'HOLD') errors.push('PRODUCTION_OR_G5_NOT_HOLD');
  if (contract.activation?.public !== 'HOLD' || contract.activation?.remote_postgresql !== 'HOLD') errors.push('PUBLIC_OR_REMOTE_POSTGRESQL_NOT_HOLD');
  if (contract.workflow_receipt_ledger?.state !== 'IMPLEMENTED_NOT_REMOTE_VERIFIED') errors.push('WORKFLOW_RECEIPT_LEDGER_STATE_OVERCLAIMED');
  if (contract.workflow_receipt_ledger?.remote_persistence !== 'HOLD') errors.push('WORKFLOW_RECEIPT_REMOTE_PERSISTENCE_NOT_HOLD');
  if (contract.workflow_receipt_ledger?.finalizer_activation !== 'HOLD') errors.push('WORKFLOW_RECEIPT_FINALIZER_ACTIVATION_NOT_HOLD');
  if (contract.workflow_receipt_ledger?.continuous_assurance_direct_database_writes !== 'PROHIBITED') errors.push('CONTINUOUS_ASSURANCE_DATABASE_WRITE_BOUNDARY_WEAKENED');
  if (contract.workflow_receipt_ledger?.canonical_dedupe?.state !== 'SCHEMA_AND_LOCAL_RUNTIME_READY_NOT_REMOTE_ACTIVATED') errors.push('CANONICAL_DEDUPE_STATE_OVERCLAIMED');
  if (contract.workflow_receipt_ledger?.canonical_dedupe?.failed_or_stale_leader_takeover !== 'NOT_IMPLEMENTED_HOLD') errors.push('CANONICAL_DEDUPE_TAKEOVER_BOUNDARY_WEAKENED');
  if (contract.workflow_receipt_ledger?.canonical_dedupe?.provisional_special_class_digest_claim !== 'PROHIBITED') errors.push('CANONICAL_DEDUPE_PROVISIONAL_EXACT_ARTIFACT_CLAIM_ALLOWED');
  if (!String(canonicalIdentityContract?.state || '').startsWith('IMPLEMENTED_') || !String(canonicalIdentityContract?.state || '').endsWith('_REMOTE_LEDGER_ACTIVATION_HOLD')) errors.push('CANONICAL_IDENTITY_CLASSIFIER_STATE_OVERCLAIMED');
  if (canonicalIdentityContract?.runtime_dedupe?.state !== 'REMOTE_LEDGER_ACTIVATION_HOLD' || canonicalIdentityContract?.truth_boundary?.runtime_dedupe_active !== false) errors.push('CANONICAL_IDENTITY_REMOTE_LEDGER_HOLD_WEAKENED');
  if (JSON.stringify(canonicalIdentityContract?.canonical_key_components) !== JSON.stringify(contract.workflow_receipt_ledger?.canonical_dedupe?.business_key)) errors.push('CANONICAL_IDENTITY_LEDGER_KEY_MISMATCH');

  errors.push(...postgresMigrations.errors);
  errors.push(...inspectPostgresSchema(postgresSql).errors);
  errors.push(...inspectD1Schema(d1Sql).errors);
  errors.push(...inspectWorkflowReceiptRuntime(workflowReceiptRuntime).errors);
  errors.push(...inspectRuntimeRegistrationLedgerAdmission(runtimeRegistrationLedgerAdmission).errors);
  errors.push(...inspectCanonicalClaimRuntime(canonicalClaimRuntime).errors);
  errors.push(...inspectWorkflowReceiptRelationTruth(contract, readme, runbook).errors);
  errors.push(...inspectCommonControlFoundation(contract, commonControlContract, commonControlSources).errors);
  errors.push(...inspectCryptographicApprovalEnvelope(contract, approvalAuthorityContract,
    approvalEnvelopeSource).errors);
  errors.push(...inspectCryptographicApprovalConsumption(contract, approvalConsumptionContract,
    approvalConsumptionSource, postgresSql).errors);
  errors.push(...inspectApprovalTrustRootLifecycle(contract, approvalTrustRootLifecycleContract,
    approvalTrustRootLifecycleSource, postgresSql).errors);
  errors.push(...inspectApprovalTrustRegistryCompiler(contract, approvalTrustRegistryCompilerContract,
    approvalTrustRegistryCompilerSource).errors);
  errors.push(...inspectTrustHandoffControlBundle(contract, trustHandoffBundleContract,
    trustHandoffBundleSources, postgresSql).errors);
  errors.push(...inspectApprovalTrustAtomicHead(contract, approvalTrustAtomicHeadContract,
    approvalTrustAtomicHeadSources, postgresSql).errors);
  errors.push(...inspectApprovalTrustRuntimeImports(controlPlaneRuntimeSources).errors);
  errors.push(...inspectAutonomousTaskLifecycle(contract, autonomousTaskContract, autonomousTaskSource).errors);
  errors.push(...inspectAutonomousTaskLedgerRuntime(autonomousTaskLedgerSource).errors);
  errors.push(...inspectAutonomousTaskScheduler(contract, autonomousSchedulerContract, autonomousTaskSchedulerSource).errors);
  errors.push(...inspectAutonomousTaskWorker(contract, autonomousWorkerContract, autonomousTaskWorkerSources).errors);
  errors.push(...inspectAutonomousAdmissionProofStore(contract, autonomousAdmissionProofContract,
    autonomousAdmissionProofSource, postgresSql).errors);
  errors.push(...inspectAutonomousSingleCycleRunner(contract, autonomousRunnerContract,
    autonomousRunnerSource).errors);
  errors.push(...inspectAutonomousControlTick(contract, autonomousControlTickContract,
    autonomousControlTickSource).errors);
  errors.push(...inspectAutonomousShadowSupervisor(contract, autonomousShadowSupervisorContract,
    autonomousShadowSupervisorSource).errors);
  errors.push(...inspectAutonomousSupervisorInvocationAdmission(contract,
    autonomousInvocationAdmissionContract, autonomousInvocationAdmissionSource, postgresSql).errors);
  errors.push(...inspectAutonomousLauncher(contract, autonomousLauncherContract,
    autonomousLauncherSource, autonomousLauncherVerificationWorkflow,
    autonomousLauncherRuntimeRegistrationWorkflow).errors);
  errors.push(...inspectAutonomousPostgresRuntimeClient(contract,
    autonomousPostgresRuntimeClientContract, autonomousPostgresRuntimeClientSource,
    controlPlanePackage, controlPlanePackageLock).errors);
  errors.push(...inspectLeaseCheckpointReconciliation(contract,
    leaseCheckpointReconciliationContract, { lifecycle: autonomousTaskSource,
      ledger: autonomousTaskLedgerSource, scheduler: autonomousTaskSchedulerSource }).errors);
  errors.push(...inspectAutonomousPostgresEvidence(contract, autonomousPostgresEvidenceContract,
    autonomousPostgresEvidenceSource, autonomousPostgresEvidenceVerifierSource,
    autonomousPostgresIndependentVerifierSource,
    autonomousPostgresCanaryOrchestratorSource).errors);
  errors.push(...inspectProviderRightsPreflight(contract, providerRightsPreflightContract,
    providerRightsPreflightSource).errors);
  errors.push(...inspectProviderRightsApprovalEvidence(contract,
    providerRightsApprovalEvidenceContract, providerRightsApprovalEvidenceSource).errors);

  const normalWriters = registry.writers.filter((writer) => writer.state === 'REGISTERED_REMOTE_HOLD_NOT_DEPLOYED');
  if (registry.permitted_normal_writer_cardinality !== 1 || normalWriters.length !== 1) errors.push('D1_PERMITTED_NORMAL_WRITER_CARDINALITY_NOT_ONE');
  if (registry.deployed_governed_writer_cardinality !== 0) errors.push('D1_GOVERNED_WRITER_DEPLOYMENT_UNSUPPORTED');
  if (normalWriters[0]?.writer_id !== 'kpmo-d1-projector-v1') errors.push('D1_PERMITTED_WRITER_NOT_GOVERNED_PROJECTOR');
  if (normalWriters[0]?.remote_activation !== 'HOLD') errors.push('D1_PROJECTOR_REMOTE_ACTIVATION_NOT_HOLD');

  const discoveredWriters = discoverProductionD1Writers(root);
  const registeredWriters = registry.writers.flatMap((writer) => writer.source_paths || []).sort();
  for (const file of discoveredWriters) if (!registeredWriters.includes(file)) errors.push(`D1_UNREGISTERED_WRITER_SOURCE:${file}`);
  for (const file of registeredWriters) if (!discoveredWriters.includes(file)) errors.push(`D1_WRITER_REGISTRY_STALE:${file}`);

  const discoveredBindings = discoverD1Bindings(root);
  const registeredBindings = registry.writers.flatMap((writer) => writer.d1_bindings || []).sort();
  for (const binding of discoveredBindings) if (!registeredBindings.includes(binding)) errors.push(`D1_UNREGISTERED_BINDING:${binding}`);
  for (const binding of registeredBindings) if (!discoveredBindings.includes(binding)) errors.push(`D1_BINDING_REGISTRY_STALE:${binding}`);

  const legacy = registry.writers.find((writer) => writer.writer_id === 'kidults-autonomous-intelligence-legacy');
  if (legacy?.state !== 'LEGACY_MIGRATION_HOLD') errors.push('LEGACY_D1_WRITER_NOT_ON_HOLD');
  const legacyWrangler = fs.readFileSync(path.join(root, 'services/kidults-autonomous-intelligence/wrangler.jsonc'), 'utf8');
  if (!legacyWrangler.includes('"D1_WRITER_MODE": "LEGACY_MIGRATION_HOLD"')) errors.push('LEGACY_D1_WRITER_MODE_NOT_DECLARED');
  const legacyPackage = readJson(path.join(root, 'services/kidults-autonomous-intelligence/package.json'));
  if (!String(legacyPackage.scripts?.deploy || '').includes('d1:writer:remote-guard')) errors.push('LEGACY_REMOTE_DEPLOY_GUARD_NOT_WIRED');

  for (const runtime of [
    'enterprise-access.mjs', 'billing-ledger.mjs', 'observability-ledger.mjs',
    'outbox-delivery.mjs', 'supply-chain-admission.mjs',
    'psa-cert-verification-adapter.mjs',
    'workflow-receipt-ledger.mjs', 'workflow-canonical-run-claims.mjs'
  ]) {
    if (!fs.existsSync(path.join(root, 'services/kidults-control-plane/src', runtime))) {
      errors.push(`ENTERPRISE_RUNTIME_ADAPTER_MISSING:${runtime}`);
    }
  }

  const psaFacade = path.join(root, 'services/kidults-control-plane/src/psa-cert-verification-adapter.mjs');
  const psaPrivateModules = new Set([
    path.join(root, 'services/kidults-control-plane/src/psa-private-evaluation.mjs'),
    path.join(root, 'services/kidults-control-plane/src/psa-private-evaluation-store.mjs'),
  ]);
  const psaBoundaryValidator = path.join(root, 'services/kidults-control-plane/scripts/validate-boundary-v1.mjs');
  for (const file of walk(root, (candidate) => /\.(?:mjs|js)$/.test(candidate))) {
    if (file === psaFacade || file === psaBoundaryValidator || psaPrivateModules.has(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (/psa-private-evaluation(?:-store)?\.mjs/.test(source)) {
      errors.push(`PSA_PRIVATE_MODULE_BYPASS:${path.relative(root, file).replaceAll('\\', '/')}`);
    }
  }

  return {
    suite: 'KIDULTS_POSTGRES_D1_BOUNDARY_V1',
    result: errors.length ? 'FAIL' : 'PASS',
    state: errors.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS_LOCAL_CONTRACT',
    system_of_record: 'POSTGRESQL',
    d1_role: 'READ_MODEL_ONLY',
    five_plane_runtime_authority: contract.five_plane_runtime_authority?.state,
    permitted_normal_d1_writer: normalWriters.map((writer) => writer.writer_id),
    deployed_governed_d1_writer_count: registry.deployed_governed_writer_cardinality,
    registered_legacy_d1_writer_count: registry.writers.filter((writer) => writer.state === 'LEGACY_MIGRATION_HOLD').length,
    discovered_production_d1_writer_sources: discoveredWriters,
    discovered_d1_bindings: discoveredBindings,
    postgres_migrations: postgresMigrations.files,
    workflow_receipt_ledger: contract.workflow_receipt_ledger?.state,
    workflow_receipt_remote_persistence: contract.workflow_receipt_ledger?.remote_persistence,
    canonical_identity_classifier: canonicalIdentityContract?.state,
    canonical_dedupe_remote_ledger: canonicalIdentityContract?.runtime_dedupe?.state,
    common_control_foundation: contract.common_control_foundation?.state,
    common_control_scope: contract.common_control_foundation?.scope,
    common_control_external_egress: contract.common_control_foundation?.broker_external_egress,
    provider_rights_preflight: contract.provider_rights_preflight?.state,
    provider_rights_approval_evidence: contract.provider_rights_approval_evidence?.state,
    cryptographic_approval_envelope: contract.cryptographic_approval_envelope?.state,
    cryptographic_approval_trust_roots: contract.cryptographic_approval_envelope?.trust_roots,
    cryptographic_approval_activation: contract.cryptographic_approval_envelope?.activation_authorized,
    cryptographic_approval_consumption: contract.cryptographic_approval_consumption?.state,
    cryptographic_approval_consumption_remote_postgresql:
      contract.cryptographic_approval_consumption?.remote_postgresql,
    approval_trust_root_lifecycle: contract.approval_trust_root_lifecycle?.state,
    approval_trust_root_verifier_wiring: contract.approval_trust_root_lifecycle?.verifier_wiring,
    approval_trust_registry_compiler: contract.approval_trust_registry_compiler?.state,
    approval_trust_registry_automatic_wiring:
      contract.approval_trust_registry_compiler?.automatic_verifier_wiring,
    approval_trust_handoff_control_bundle: contract.approval_trust_handoff_control_bundle?.state,
    approval_trust_handoff_automatic_trigger:
      contract.approval_trust_handoff_control_bundle?.automatic_trigger,
    approval_trust_atomic_head: contract.approval_trust_atomic_head?.state,
    approval_trust_atomic_head_concurrency:
      contract.approval_trust_atomic_head?.real_postgresql_concurrency,
    autonomous_task_lifecycle: contract.autonomous_task_lifecycle?.state,
    autonomous_task_scope: contract.autonomous_task_lifecycle?.scope,
    autonomous_task_remote_worker_activation: contract.autonomous_task_lifecycle?.remote_worker_activation,
    autonomous_task_durable_persistence: contract.autonomous_task_lifecycle?.durable_persistence,
    autonomous_task_scheduler: contract.autonomous_task_scheduler?.state,
    autonomous_task_scheduler_trigger: contract.autonomous_task_scheduler?.trigger,
    autonomous_task_worker: contract.autonomous_task_worker?.state,
    autonomous_task_worker_trigger: contract.autonomous_task_worker?.trigger,
    autonomous_admission_proof_store: contract.autonomous_admission_proof_store?.state,
    autonomous_single_cycle_runner: contract.autonomous_single_cycle_runner?.state,
    autonomous_single_cycle_runner_trigger: contract.autonomous_single_cycle_runner?.trigger,
    autonomous_control_tick: contract.autonomous_control_tick?.state,
    autonomous_control_tick_trigger: contract.autonomous_control_tick?.trigger,
    autonomous_shadow_supervisor: contract.autonomous_shadow_supervisor?.state,
    autonomous_shadow_supervisor_trigger: contract.autonomous_shadow_supervisor?.trigger,
    autonomous_supervisor_invocation_admission:
      contract.autonomous_supervisor_invocation_admission?.state,
    autonomous_supervisor_invocation_automatic_trigger:
      contract.autonomous_supervisor_invocation_admission?.automatic_trigger,
    autonomous_launcher: contract.autonomous_launcher?.state,
    autonomous_launcher_verification_trigger:
      contract.autonomous_launcher?.verification_trigger,
    autonomous_launcher_automatic_trigger: contract.autonomous_launcher?.automatic_trigger,
    autonomous_postgres_runtime_client: contract.autonomous_postgres_runtime_client?.state,
    autonomous_postgres_runtime_live_connection:
      contract.autonomous_postgres_runtime_client?.live_remote_connection,
    autonomous_lease_checkpoint_reconciliation:
      contract.autonomous_lease_checkpoint_reconciliation?.state,
    autonomous_postgres_evidence: contract.autonomous_postgres_evidence?.state,
    remote_postgresql: 'NOT_PROVISIONED',
    remote_d1_mutation: false,
    production: 'HOLD',
    errors
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Resolve from this script so the validator is invocation-directory agnostic.
  // CI and local callers may run it from the service directory or repository root.
  const receipt = validateBoundary();
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.errors.length) process.exit(1);
}
