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
    'workflow_canonical_run_claims', 'workflow_canonical_run_aliases'
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
    'workflow_canonical_run_claims', 'workflow_canonical_run_aliases'
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
    'GRANT SELECT, INSERT ON kidults_control.workflow_canonical_run_aliases TO kidults_control_workflow_receipt'
  ];
  for (const control of requiredControls) if (!sql.includes(control)) errors.push(`POSTGRES_CONTROL_MISSING:${control}`);
  for (const table of [
    'workflow_run_receipts', 'workflow_canonical_run_claims', 'workflow_canonical_run_aliases',
  ]) {
    const grants = [...sql.matchAll(new RegExp(`GRANT\\s+([^;]+?)\\s+ON\\s+kidults_control\\.${table}\\s+TO\\s+([^;]+);`, 'gi'))];
    if (grants.some((match) => /\b(?:UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)\b/i.test(match[1]))) {
      errors.push(`POSTGRES_WORKFLOW_LEDGER_MUTATION_GRANT_PROHIBITED:${table}`);
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
  const canonicalIdentityContractPath = contract.workflow_receipt_ledger?.canonical_dedupe?.classifier_contract;
  const canonicalIdentityContract = canonicalIdentityContractPath
    ? readJson(path.join(root, canonicalIdentityContractPath))
    : null;
  const registry = readJson(path.join(root, 'services/kidults-control-plane/contracts/d1-writer-registry-v1.json'));
  const postgresMigrations = loadOrderedPostgresMigrations(path.join(root, 'services/kidults-control-plane/migrations/postgres'));
  const postgresSql = postgresMigrations.sql;
  const d1Sql = fs.readFileSync(path.join(root, 'services/kidults-control-plane/migrations/d1/0001_read_models.sql'), 'utf8');
  const workflowReceiptRuntime = fs.readFileSync(path.join(root, 'services/kidults-control-plane/src/workflow-receipt-ledger.mjs'), 'utf8');
  const canonicalClaimRuntime = fs.readFileSync(path.join(root, 'services/kidults-control-plane/src/workflow-canonical-run-claims.mjs'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'services/kidults-control-plane/README.md'), 'utf8');
  const runbook = fs.readFileSync(path.join(root, 'services/kidults-control-plane/ACTIVATION_RUNBOOK.md'), 'utf8');
  const errors = [];

  if (contract.canonical_system_of_record?.engine !== 'POSTGRESQL') errors.push('SYSTEM_OF_RECORD_NOT_POSTGRESQL');
  if (contract.canonical_system_of_record?.authority !== 'SOLE_CANONICAL_WRITABLE_LEDGER') errors.push('POSTGRESQL_AUTHORITY_WEAKENED');
  if (contract.d1?.role !== 'READ_MODEL_ONLY') errors.push('D1_ROLE_NOT_READ_MODEL_ONLY');
  if (contract.d1?.direct_product_writes !== 'PROHIBITED') errors.push('D1_DIRECT_PRODUCT_WRITES_NOT_PROHIBITED');
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
  errors.push(...inspectCanonicalClaimRuntime(canonicalClaimRuntime).errors);
  errors.push(...inspectWorkflowReceiptRelationTruth(contract, readme, runbook).errors);

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
    'psa-cert-verification-adapter.mjs', 'psa-private-evaluation.mjs',
    'workflow-receipt-ledger.mjs', 'workflow-canonical-run-claims.mjs'
  ]) {
    if (!fs.existsSync(path.join(root, 'services/kidults-control-plane/src', runtime))) {
      errors.push(`ENTERPRISE_RUNTIME_ADAPTER_MISSING:${runtime}`);
    }
  }

  return {
    suite: 'KIDULTS_POSTGRES_D1_BOUNDARY_V1',
    result: errors.length ? 'FAIL' : 'PASS',
    state: errors.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS_LOCAL_CONTRACT',
    system_of_record: 'POSTGRESQL',
    d1_role: 'READ_MODEL_ONLY',
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
