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
    'outbox_delivery_claims', 'observability_events'
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

export function legacyRemoteDeployFailsClosed(deployCommand) {
  const command = String(deployCommand || '').trim();
  return command === 'node scripts/cloudflare-global-no-rerun.mjs'
    || command.includes('d1:writer:remote-guard');
}

export function inspectPostgresSchema(sql) {
  const errors = [];
  const requiredTables = [
    'writer_principals', 'users', 'organizations', 'memberships', 'resource_grants',
    'plans', 'subscriptions', 'entitlements', 'usage_events', 'billing_events',
    'data_sources', 'source_aliases', 'source_rights_decisions', 'supply_chain_runs',
    'source_control_plane_snapshots', 'commands',
    'audit_events', 'outbox_events', 'outbox_delivery_receipts',
    'outbox_delivery_claims', 'observability_events'
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
    "CHECK (rights_clear_collector_current_sold_count > 0 OR activation_backlog_count = 0)"
  ];
  for (const control of requiredControls) if (!sql.includes(control)) errors.push(`POSTGRES_CONTROL_MISSING:${control}`);
  if (!/^BEGIN;/m.test(sql) || !/^COMMIT;/m.test(sql)) errors.push('POSTGRES_MIGRATION_TRANSACTION_MISSING');
  return { requiredTables, errors };
}

export function discoverProductionD1Writers(root) {
  const sourceRoot = path.join(root, 'services');
  return walk(sourceRoot, (file) => /\/src\/.*\.(?:ts|js|mjs)$/.test(file.replaceAll('\\', '/')))
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
  const registry = readJson(path.join(root, 'services/kidults-control-plane/contracts/d1-writer-registry-v1.json'));
  const postgresSql = fs.readFileSync(path.join(root, 'services/kidults-control-plane/migrations/postgres/0001_system_of_record.sql'), 'utf8');
  const d1Sql = fs.readFileSync(path.join(root, 'services/kidults-control-plane/migrations/d1/0001_read_models.sql'), 'utf8');
  const errors = [];

  if (contract.canonical_system_of_record?.engine !== 'POSTGRESQL') errors.push('SYSTEM_OF_RECORD_NOT_POSTGRESQL');
  if (contract.canonical_system_of_record?.authority !== 'SOLE_CANONICAL_WRITABLE_LEDGER') errors.push('POSTGRESQL_AUTHORITY_WEAKENED');
  if (contract.d1?.role !== 'READ_MODEL_ONLY') errors.push('D1_ROLE_NOT_READ_MODEL_ONLY');
  if (contract.d1?.direct_product_writes !== 'PROHIBITED') errors.push('D1_DIRECT_PRODUCT_WRITES_NOT_PROHIBITED');
  if (contract.activation?.production !== 'HOLD' || contract.activation?.g5 !== 'HOLD') errors.push('PRODUCTION_OR_G5_NOT_HOLD');

  errors.push(...inspectPostgresSchema(postgresSql).errors);
  errors.push(...inspectD1Schema(d1Sql).errors);

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
  if (!legacyRemoteDeployFailsClosed(legacyPackage.scripts?.deploy)) errors.push('LEGACY_REMOTE_DEPLOY_GUARD_NOT_WIRED');

  for (const runtime of [
    'enterprise-access.mjs', 'billing-ledger.mjs', 'observability-ledger.mjs',
    'outbox-delivery.mjs', 'supply-chain-admission.mjs',
    'psa-cert-verification-adapter.mjs', 'psa-private-evaluation.mjs'
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
