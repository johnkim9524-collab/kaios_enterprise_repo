import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, registryDigest, validateGlobalSoldSourceRegistry } from './global-sold-source-registry-v1.mjs';

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9-]{2,127}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireValue(condition, code) {
  if (!condition) throw new Error(code);
}

export function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

export function manifestDigest(manifest) {
  const payload = structuredClone(manifest);
  delete payload.manifest_digest;
  return sha256(canonicalJson(payload));
}

export function artifactDigest(filePath) {
  return sha256(fs.readFileSync(filePath));
}

export function validateEvidenceManifest(manifest, registry, contract, options = {}) {
  requireValue(contract?.id === 'kidults-source-intelligence-evidence-manifest-contract-v1', 'EVIDENCE_CONTRACT_INVALID');
  requireValue(contract?.status === 'MANDATORY_FAIL_CLOSED', 'EVIDENCE_CONTRACT_NOT_FAIL_CLOSED');
  requireValue(contract?.rules?.restricted_bytes_hard_disabled_until_authoritative_receipt_resolution === true, 'EVIDENCE_RESTRICTED_BYTES_HARD_STOP_MISSING');
  validateGlobalSoldSourceRegistry(registry);
  requireValue(contract.manifest_types.includes(manifest?.manifest_type), 'EVIDENCE_MANIFEST_TYPE_INVALID');
  requireValue(typeof manifest?.id === 'string' && SAFE_ID.test(manifest.id), 'EVIDENCE_MANIFEST_ID_INVALID');
  requireValue(contract.manifest_statuses.includes(manifest.status), 'EVIDENCE_MANIFEST_STATUS_INVALID');
  requireValue(manifest.registry_id === registry.id, 'EVIDENCE_REGISTRY_ID_MISMATCH');
  requireValue(manifest.registry_snapshot_digest === registry.snapshot_digest, 'EVIDENCE_REGISTRY_DIGEST_MISMATCH');
  requireValue(registry.snapshot_digest === registryDigest(registry), 'EVIDENCE_BOUND_REGISTRY_DIGEST_INVALID');
  requireValue(Array.isArray(manifest.scope?.source_ids), 'EVIDENCE_SOURCE_IDS_INVALID');
  const registryIds = registry.sources.map((source) => source.source_id).sort();
  const manifestIds = manifest.scope.source_ids.length === 0 ? registryIds : [...manifest.scope.source_ids].sort();
  requireValue(new Set(manifestIds).size === manifestIds.length, 'EVIDENCE_SOURCE_IDS_DUPLICATE');
  requireValue(manifestIds.every((id) => registryIds.includes(id)), 'EVIDENCE_SOURCE_ID_UNKNOWN');
  requireValue(manifest.scope.source_count === manifestIds.length, 'EVIDENCE_SOURCE_COUNT_MISMATCH');
  requireValue(SHA256.test(manifest.artifact?.digest ?? ''), 'EVIDENCE_ARTIFACT_DIGEST_INVALID');
  requireValue(contract.storage_modes.includes(manifest.artifact?.storage_mode), 'EVIDENCE_STORAGE_MODE_INVALID');
  requireValue(manifest.release_boundary?.source_acquisition === false, 'EVIDENCE_ACQUISITION_AUTHORITY_FORBIDDEN');
  requireValue(manifest.release_boundary?.adapter_activation === false, 'EVIDENCE_ADAPTER_AUTHORITY_FORBIDDEN');
  requireValue(manifest.release_boundary?.database_mutation === false, 'EVIDENCE_DB_AUTHORITY_FORBIDDEN');
  requireValue(manifest.release_boundary?.d1_projection === false, 'EVIDENCE_D1_AUTHORITY_FORBIDDEN');
  requireValue(manifest.release_boundary?.public === 'HOLD', 'EVIDENCE_PUBLIC_MUST_HOLD');
  requireValue(manifest.release_boundary?.production === 'HOLD', 'EVIDENCE_PRODUCTION_MUST_HOLD');
  requireValue(manifest.release_boundary?.g5 === 'HOLD', 'EVIDENCE_G5_MUST_HOLD');
  requireValue(typeof manifest.artifact?.contains_external_raw_content === 'boolean', 'EVIDENCE_RAW_CONTENT_FLAG_INVALID');
  const storesExternalBytes = manifest.artifact.contains_external_raw_content === true;
  const restrictedMode = manifest.artifact.storage_mode === 'RESTRICTED_EVIDENCE_BYTES';
  requireValue(storesExternalBytes === restrictedMode, 'EVIDENCE_RAW_STORAGE_MODE_MISMATCH');
  requireValue(!storesExternalBytes && !restrictedMode, 'EVIDENCE_RESTRICTED_BYTES_HARD_DISABLED_RECEIPT_RESOLUTION_NOT_IMPLEMENTED');
  if (storesExternalBytes) {
    requireValue(manifest.status === 'ADMITTED_RESTRICTED_EVIDENCE_NOT_RELEASE_AUTHORITY', 'EVIDENCE_RAW_STATUS_INVALID');
    requireValue(typeof manifest.artifact.evidence_uri === 'string', 'EVIDENCE_VOLUME_URI_REQUIRED');
    const root = `${contract.evidence_root}/`;
    requireValue(manifest.artifact.evidence_uri.startsWith(root), 'EVIDENCE_VOLUME_URI_OUTSIDE_ROOT');
    const suffix = manifest.artifact.evidence_uri.slice(root.length);
    requireValue(suffix.length > 0 && !suffix.split('/').includes('..') && path.posix.normalize(suffix) === suffix, 'EVIDENCE_VOLUME_URI_UNSAFE');
    requireValue(UUID.test(manifest.admission?.rights_decision_id ?? ''), 'EVIDENCE_RIGHTS_DECISION_ID_REQUIRED');
    requireValue(UUID.test(manifest.admission?.supply_chain_run_id ?? ''), 'EVIDENCE_SUPPLY_CHAIN_RUN_ID_REQUIRED');
    for (const sourceId of manifestIds) {
      const source = registry.sources.find((candidate) => candidate.source_id === sourceId);
      requireValue(source.rights.store === 'PASS' && source.rights.raw_archive === 'PASS', `EVIDENCE_RAW_ARCHIVE_RIGHTS_NOT_PASS:${sourceId}`);
    }
  } else {
    requireValue(manifest.artifact.evidence_uri === null, 'EVIDENCE_VOLUME_WRITE_UNAUTHORIZED');
    requireValue(manifest.status !== 'ADMITTED_RESTRICTED_EVIDENCE_NOT_RELEASE_AUTHORITY', 'EVIDENCE_ADMITTED_STATUS_WITHOUT_BYTES');
    requireValue(manifest.admission?.rights_decision_id == null, 'EVIDENCE_UNUSED_RIGHTS_DECISION_ID');
    requireValue(manifest.admission?.supply_chain_run_id == null, 'EVIDENCE_UNUSED_SUPPLY_CHAIN_RUN_ID');
  }
  requireValue(manifest.retention?.mode === 'APPEND_ONLY_INSTITUTIONAL_HISTORY', 'EVIDENCE_RETENTION_INVALID');
  requireValue(manifest.retention?.expires_at === null, 'EVIDENCE_RETENTION_EXPIRY_FORBIDDEN');
  requireValue(manifest.retention?.deletion_required === false, 'EVIDENCE_DELETION_FLAG_INVALID');
  if (manifest.manifest_type === 'ACQUISITION_EVIDENCE') {
    requireValue(storesExternalBytes, 'EVIDENCE_ACQUISITION_BYTES_REQUIRED');
    for (const sourceId of manifestIds) {
      const source = registry.sources.find((candidate) => candidate.source_id === sourceId);
      requireValue(source.source_roles.includes('SOLD_TRANSACTION') || source.source_roles.includes('PLATFORM_SOLD_SIGNAL'), `EVIDENCE_SOURCE_NOT_TRANSACTIONAL:${sourceId}`);
      requireValue(source.rights.collect === 'PASS' && source.rights.store === 'PASS', `EVIDENCE_SOURCE_RIGHTS_NOT_PASS:${sourceId}`);
    }
  }
  const expectedArtifactPath = options.artifactPath;
  if (expectedArtifactPath) {
    requireValue(manifest.artifact.path === expectedArtifactPath, 'EVIDENCE_ARTIFACT_PATH_MISMATCH');
    requireValue(manifest.artifact.digest === artifactDigest(expectedArtifactPath), 'EVIDENCE_ARTIFACT_CONTENT_MISMATCH');
  }
  const digest = manifestDigest(manifest);
  requireValue(manifest.manifest_digest === digest, `EVIDENCE_MANIFEST_DIGEST_MISMATCH:${digest}`);
  return {
    state: 'VERIFIED_PASS',
    manifest_id: manifest.id,
    manifest_digest: digest,
    registry_snapshot_digest: registry.snapshot_digest,
    source_count: manifestIds.length,
    storage_mode: manifest.artifact.storage_mode,
    external_raw_content: storesExternalBytes,
    database_mutation_authorized: false,
    production: 'HOLD'
  };
}

export async function appendEvidenceManifest(client, manifest, registry, contract, options = {}) {
  manifest = structuredClone(manifest);
  registry = structuredClone(registry);
  contract = structuredClone(contract);
  const validation = validateEvidenceManifest(manifest, registry, contract, options);
  const writerId = options.writerId ?? 'kpmo-supply-chain-admission-v1';
  const sourceIds = manifest.scope.source_ids.length === 0
    ? registry.sources.map((source) => source.source_id).sort()
    : [...manifest.scope.source_ids].sort();
  await client.query('BEGIN');
  try {
    await client.query("SELECT set_config('kidults.writer_id', $1, true)", [writerId]);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [manifest.id]);
    const existing = await client.query(
      'SELECT manifest_digest, manifest_payload FROM kidults_control.source_evidence_manifest_ledger WHERE manifest_id = $1 AND manifest_version = $2',
      [manifest.id, manifest.version]
    );
    let disposition = 'IDEMPOTENT';
    if (existing.rowCount === 0) {
      await client.query(
        `INSERT INTO kidults_control.source_evidence_manifest_ledger
          (manifest_id, manifest_version, manifest_type, manifest_digest, registry_snapshot_digest,
           source_ids, source_count, artifact_digest, storage_mode, evidence_uri,
           contains_external_raw_content, rights_decision_id, supply_chain_run_id,
           manifest_payload, writer_id)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15)`,
        [manifest.id, manifest.version, manifest.manifest_type, manifest.manifest_digest,
         manifest.registry_snapshot_digest, canonicalJson(sourceIds), sourceIds.length,
         manifest.artifact.digest, manifest.artifact.storage_mode, manifest.artifact.evidence_uri,
         manifest.artifact.contains_external_raw_content, manifest.admission?.rights_decision_id ?? null,
         manifest.admission?.supply_chain_run_id ?? null, canonicalJson(manifest), writerId]
      );
      disposition = 'INSERTED';
    } else {
      requireValue(existing.rows[0].manifest_digest === manifest.manifest_digest, 'EVIDENCE_MANIFEST_VERSION_CONFLICT');
      requireValue(canonicalJson(existing.rows[0].manifest_payload) === canonicalJson(manifest), 'EVIDENCE_MANIFEST_PAYLOAD_CONFLICT');
    }
    await client.query('COMMIT');
    return { ...validation, state: 'COMMITTED', disposition };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'EVIDENCE_WRITE_AND_ROLLBACK_FAILED', { cause: error });
    }
    throw error;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const registryArtifactPath = 'coordination/kidults/source-intelligence/global-sold-source-registry-v1.json';
  const registryPath = path.resolve(registryArtifactPath);
  const contractPath = path.resolve('coordination/kidults/source-intelligence/source-intelligence-evidence-manifest-contract-v1.json');
  const manifestPath = path.resolve('coordination/kidults/source-intelligence/global-sold-source-registry-evidence-manifest-v1.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(validateEvidenceManifest(manifest, registry, contract, {artifactPath: registryArtifactPath}), null, 2)}\n`);
}
