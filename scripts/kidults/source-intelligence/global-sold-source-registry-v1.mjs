import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RIGHTS_FACETS = Object.freeze([
  'collect', 'store', 'derive', 'commercial_use', 'display', 'raw_archive'
]);
export const RIGHTS_DECISIONS = new Set(['PASS', 'CONDITIONAL', 'HOLD', 'NO_GO', 'NOT_APPLICABLE']);
export const SOURCE_DECISIONS = new Set(['PASS', 'CONDITIONAL', 'HOLD', 'NO_GO']);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

export function registryDigest(registry) {
  const payload = structuredClone(registry);
  delete payload.snapshot_digest;
  return sha256(canonicalJson(payload));
}

function requireValue(condition, code) {
  if (!condition) throw new Error(code);
}

export function validateGlobalSoldSourceRegistry(registry) {
  requireValue(registry?.id === 'kidults-global-sold-source-registry-v1', 'REGISTRY_ID_INVALID');
  requireValue(registry?.status === 'CANONICAL_RESEARCH_REGISTRY_NOT_ACQUISITION_AUTHORITY', 'REGISTRY_STATUS_INVALID');
  requireValue(Array.isArray(registry?.sources) && registry.sources.length > 0, 'REGISTRY_SOURCES_EMPTY');
  requireValue(registry.release_boundary?.acquisition_authorized === false, 'REGISTRY_ACQUISITION_AUTHORITY_FORBIDDEN');
  requireValue(registry.release_boundary?.adapter_activation_authorized === false, 'REGISTRY_ADAPTER_AUTHORITY_FORBIDDEN');
  requireValue(registry.release_boundary?.postgres_migration_authorized === false, 'REGISTRY_DB_MUTATION_AUTHORITY_FORBIDDEN');
  requireValue(registry.release_boundary?.d1_projection_authorized === false, 'REGISTRY_D1_AUTHORITY_FORBIDDEN');
  requireValue(registry.release_boundary?.public_release === 'HOLD', 'REGISTRY_PUBLIC_MUST_HOLD');
  requireValue(registry.release_boundary?.production === 'HOLD', 'REGISTRY_PRODUCTION_MUST_HOLD');
  requireValue(registry.release_boundary?.g5 === 'HOLD', 'REGISTRY_G5_MUST_HOLD');
  requireValue(registry.canonical_store?.system_of_record === 'DIGITALOCEAN_MANAGED_POSTGRESQL', 'REGISTRY_SYSTEM_OF_RECORD_INVALID');
  requireValue(registry.canonical_store?.d1_role === 'READ_ONLY_APPROVED_PROJECTION', 'REGISTRY_D1_ROLE_INVALID');

  const ids = new Set();
  for (const source of registry.sources) {
    requireValue(typeof source.source_id === 'string' && /^[a-z0-9][a-z0-9-]{2,127}$/.test(source.source_id), 'SOURCE_ID_INVALID');
    requireValue(!ids.has(source.source_id), `SOURCE_ID_DUPLICATE:${source.source_id}`);
    ids.add(source.source_id);
    requireValue(typeof source.source_name === 'string' && source.source_name.length > 0, `SOURCE_NAME_MISSING:${source.source_id}`);
    requireValue(typeof source.owner_name === 'string' && source.owner_name.length > 0, `SOURCE_OWNER_MISSING:${source.source_id}`);
    requireValue(SOURCE_DECISIONS.has(source.decision), `SOURCE_DECISION_INVALID:${source.source_id}`);
    requireValue(Array.isArray(source.source_roles) && source.source_roles.length > 0, `SOURCE_ROLE_MISSING:${source.source_id}`);
    requireValue(Array.isArray(source.verticals) && source.verticals.length > 0, `SOURCE_VERTICAL_MISSING:${source.source_id}`);
    requireValue(Array.isArray(source.official_urls) && source.official_urls.length > 0, `SOURCE_URL_MISSING:${source.source_id}`);
    for (const url of source.official_urls) requireValue(/^https:\/\//.test(url), `SOURCE_URL_INVALID:${source.source_id}`);
    for (const facet of RIGHTS_FACETS) {
      requireValue(RIGHTS_DECISIONS.has(source.rights?.[facet]), `SOURCE_RIGHTS_FACET_INVALID:${source.source_id}:${facet}`);
    }
    requireValue(source.activation_authorized === false, `SOURCE_ACTIVATION_MUST_BE_FALSE:${source.source_id}`);
    requireValue(source.production_authorized === false, `SOURCE_PRODUCTION_MUST_BE_FALSE:${source.source_id}`);
    requireValue(typeof source.claim_ceiling === 'string' && source.claim_ceiling.length > 0, `SOURCE_CLAIM_CEILING_MISSING:${source.source_id}`);
    requireValue(typeof source.next_action === 'string' && source.next_action.length > 0, `SOURCE_NEXT_ACTION_MISSING:${source.source_id}`);
    if (source.decision === 'PASS') {
      for (const facet of ['collect', 'store', 'derive', 'commercial_use']) {
        requireValue(source.rights[facet] === 'PASS', `PASS_SOURCE_REQUIRED_RIGHT_NOT_PASS:${source.source_id}:${facet}`);
      }
    }
    if (source.decision === 'NO_GO') {
      for (const facet of ['collect', 'store', 'derive', 'commercial_use']) {
        requireValue(source.rights[facet] === 'NO_GO', `NO_GO_SOURCE_RIGHT_NOT_BLOCKED:${source.source_id}:${facet}`);
      }
    }
    if (!source.source_roles.includes('SOLD_TRANSACTION') && !source.source_roles.includes('PLATFORM_SOLD_SIGNAL')) {
      requireValue(!/SOLD_TRANSACTION$/.test(source.claim_ceiling), `NON_TRANSACTION_SOURCE_CLAIM_OVERREACH:${source.source_id}`);
    }
  }

  const digest = registryDigest(registry);
  requireValue(registry.snapshot_digest === digest, `REGISTRY_DIGEST_MISMATCH:${digest}`);
  return {
    status: 'PASS',
    source_count: registry.sources.length,
    decisions: Object.fromEntries([...SOURCE_DECISIONS].map((decision) => [decision, registry.sources.filter((source) => source.decision === decision).length])),
    snapshot_digest: digest,
    acquisition_authorized: false,
    production: 'HOLD'
  };
}

export function assessmentDigest(source) {
  return sha256(canonicalJson(source));
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function emitRegistrySnapshotSql(registry, options = {}) {
  validateGlobalSoldSourceRegistry(registry);
  const writerId = options.writerId ?? 'kpmo-supply-chain-admission-v1';
  const statements = [
    '\\set ON_ERROR_STOP on',
    'BEGIN;',
    "CREATE TEMP TABLE _kidults_role_state(was_member boolean NOT NULL) ON COMMIT DROP;",
    "INSERT INTO _kidults_role_state VALUES (pg_has_role(session_user, 'kidults_control_supply', 'MEMBER'));",
    "DO $grant$ BEGIN IF NOT (SELECT was_member FROM _kidults_role_state) THEN EXECUTE format('GRANT kidults_control_supply TO %I', session_user); END IF; END $grant$;",
    'SET ROLE kidults_control_supply;',
    `SELECT set_config('kidults.writer_id', ${sqlLiteral(writerId)}, true);`,
    "SELECT pg_advisory_xact_lock(hashtextextended('global-sold-source-registry-v1', 0));",
    `INSERT INTO kidults_control.global_source_registry_snapshot_ledger
      (registry_id, registry_version, snapshot_digest, generated_at, source_count, registry_payload, writer_id)
     VALUES (${sqlLiteral(registry.id)}, ${sqlLiteral(registry.version)}, ${sqlLiteral(registry.snapshot_digest)},
       ${sqlLiteral(registry.generated_at)}::timestamptz, ${registry.sources.length}, ${sqlLiteral(canonicalJson(registry))}::jsonb, ${sqlLiteral(writerId)})
     ON CONFLICT (snapshot_digest) DO NOTHING;`
  ];
  for (const source of registry.sources) {
    statements.push(`INSERT INTO kidults_control.global_source_assessment_ledger
      (snapshot_digest, source_id, source_name, owner_name, region, decision, rights_matrix,
       claim_ceiling, source_roles, verticals, official_urls, freshness, evidence_state,
       activation_authorized, production_authorized, assessment_digest, assessment_payload, writer_id)
     VALUES (${sqlLiteral(registry.snapshot_digest)}, ${sqlLiteral(source.source_id)}, ${sqlLiteral(source.source_name)},
       ${sqlLiteral(source.owner_name)}, ${sqlLiteral(source.region)}, ${sqlLiteral(source.decision)},
       ${sqlLiteral(canonicalJson(source.rights))}::jsonb, ${sqlLiteral(source.claim_ceiling)},
       ${sqlLiteral(canonicalJson(source.source_roles))}::jsonb, ${sqlLiteral(canonicalJson(source.verticals))}::jsonb,
       ${sqlLiteral(canonicalJson(source.official_urls))}::jsonb, ${sqlLiteral(source.freshness)},
       ${sqlLiteral(source.evidence_state)}, false, false, ${sqlLiteral(assessmentDigest(source))},
       ${sqlLiteral(canonicalJson(source))}::jsonb, ${sqlLiteral(writerId)})
     ON CONFLICT (snapshot_digest, source_id) DO NOTHING;`);
  }
  statements.push(
    'RESET ROLE;',
    `DO $verify$ DECLARE snapshot_rows integer; assessment_rows integer; BEGIN
       SELECT count(*) INTO snapshot_rows FROM kidults_control.global_source_registry_snapshot_ledger
        WHERE snapshot_digest=${sqlLiteral(registry.snapshot_digest)} AND registry_payload=${sqlLiteral(canonicalJson(registry))}::jsonb;
       SELECT count(*) INTO assessment_rows FROM kidults_control.global_source_assessment_ledger
        WHERE snapshot_digest=${sqlLiteral(registry.snapshot_digest)};
       IF snapshot_rows <> 1 OR assessment_rows <> ${registry.sources.length} THEN
         RAISE EXCEPTION 'GLOBAL_SOURCE_REGISTRY_SNAPSHOT_BINDING_FAILED';
       END IF;
     END $verify$;`,
    "DO $revoke$ BEGIN IF NOT (SELECT was_member FROM _kidults_role_state) THEN EXECUTE format('REVOKE kidults_control_supply FROM %I', session_user); END IF; END $revoke$;",
    'COMMIT;'
  );
  return `${statements.join('\n')}\n`;
}

export async function appendRegistrySnapshot(client, registry, options = {}) {
  registry = structuredClone(registry);
  const validation = validateGlobalSoldSourceRegistry(registry);
  const writerId = options.writerId ?? 'kpmo-supply-chain-admission-v1';
  const counts = { snapshots_inserted: 0, snapshots_idempotent: 0, assessments_inserted: 0, assessments_idempotent: 0 };
  await client.query('BEGIN');
  try {
    await client.query("SELECT set_config('kidults.writer_id', $1, true)", [writerId]);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('global-sold-source-registry-v1', 0))");
    const existingSnapshot = await client.query(
      'SELECT snapshot_digest, registry_payload FROM kidults_control.global_source_registry_snapshot_ledger WHERE registry_id = $1 AND snapshot_digest = $2',
      [registry.id, registry.snapshot_digest]
    );
    if (existingSnapshot.rowCount === 0) {
      await client.query(
        `INSERT INTO kidults_control.global_source_registry_snapshot_ledger
          (registry_id, registry_version, snapshot_digest, generated_at, source_count, registry_payload, writer_id)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [registry.id, registry.version, registry.snapshot_digest, registry.generated_at, registry.sources.length, canonicalJson(registry), writerId]
      );
      counts.snapshots_inserted += 1;
    } else {
      requireValue(canonicalJson(existingSnapshot.rows[0].registry_payload) === canonicalJson(registry), 'REGISTRY_SNAPSHOT_DIGEST_COLLISION');
      counts.snapshots_idempotent += 1;
    }

    for (const source of registry.sources) {
      const digest = assessmentDigest(source);
      const existing = await client.query(
        'SELECT assessment_digest, assessment_payload FROM kidults_control.global_source_assessment_ledger WHERE snapshot_digest = $1 AND source_id = $2',
        [registry.snapshot_digest, source.source_id]
      );
      if (existing.rowCount === 0) {
        await client.query(
          `INSERT INTO kidults_control.global_source_assessment_ledger
            (snapshot_digest, source_id, source_name, owner_name, region, decision, rights_matrix,
             claim_ceiling, source_roles, verticals, official_urls, freshness, evidence_state,
             activation_authorized, production_authorized, assessment_digest, assessment_payload, writer_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10::jsonb, $11::jsonb,
                   $12, $13, $14, $15, $16, $17::jsonb, $18)`,
          [registry.snapshot_digest, source.source_id, source.source_name, source.owner_name, source.region,
           source.decision, canonicalJson(source.rights), source.claim_ceiling, canonicalJson(source.source_roles),
           canonicalJson(source.verticals), canonicalJson(source.official_urls), source.freshness, source.evidence_state,
           source.activation_authorized, source.production_authorized, digest, canonicalJson(source), writerId]
        );
        counts.assessments_inserted += 1;
      } else {
        requireValue(existing.rows[0].assessment_digest === digest, `SOURCE_ASSESSMENT_DIGEST_CONFLICT:${source.source_id}`);
        requireValue(canonicalJson(existing.rows[0].assessment_payload) === canonicalJson(source), `SOURCE_ASSESSMENT_PAYLOAD_CONFLICT:${source.source_id}`);
        counts.assessments_idempotent += 1;
      }
    }
    await client.query('COMMIT');
    return { ...validation, status: 'COMMITTED', counts };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'REGISTRY_WRITE_AND_ROLLBACK_FAILED', { cause: error });
    }
    throw error;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const emitSql = process.argv[2] === '--emit-postgres-sql';
  const registryPath = path.resolve(process.argv[emitSql ? 3 : 2] ?? 'coordination/kidults/source-intelligence/global-sold-source-registry-v1.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  process.stdout.write(emitSql ? emitRegistrySnapshotSql(registry) : `${JSON.stringify(validateGlobalSoldSourceRegistry(registry), null, 2)}\n`);
}
