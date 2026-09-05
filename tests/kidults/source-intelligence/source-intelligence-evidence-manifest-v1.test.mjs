import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  appendEvidenceManifest,
  artifactDigest,
  manifestDigest,
  validateEvidenceManifest
} from '../../../scripts/kidults/source-intelligence/source-intelligence-evidence-manifest-v1.mjs';

const registryPath = 'coordination/kidults/source-intelligence/global-sold-source-registry-v1.json';
const contractPath = 'coordination/kidults/source-intelligence/source-intelligence-evidence-manifest-contract-v1.json';
const manifestPath = 'coordination/kidults/source-intelligence/global-sold-source-registry-evidence-manifest-v1.json';
const read = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const clone = (value) => structuredClone(value);

class MemoryClient {
  constructor() {
    this.rows = new Map();
    this.commands = [];
  }

  async query(sql, params = []) {
    this.commands.push(sql);
    if (sql.startsWith('SELECT manifest_digest')) {
      const row = this.rows.get(`${params[0]}:${params[1]}`);
      return {rowCount: row ? 1 : 0, rows: row ? [row] : []};
    }
    if (sql.includes('INSERT INTO kidults_control.source_evidence_manifest_ledger')) {
      this.rows.set(`${params[0]}:${params[1]}`, {
        manifest_digest: params[3],
        manifest_payload: JSON.parse(params[13])
      });
      return {rowCount: 1, rows: []};
    }
    return {rowCount: 0, rows: []};
  }
}

test('binds the 19-source registry artifact and remains non-authoritative', () => {
  const result = validateEvidenceManifest(read(manifestPath), read(registryPath), read(contractPath), {artifactPath: registryPath});
  assert.equal(result.state, 'VERIFIED_PASS');
  assert.equal(result.source_count, 19);
  assert.equal(result.external_raw_content, false);
  assert.equal(result.database_mutation_authorized, false);
  assert.equal(result.production, 'HOLD');
});

test('rejects artifact drift and manifest digest drift', () => {
  const registry = read(registryPath);
  const contract = read(contractPath);
  const drifted = clone(read(manifestPath));
  drifted.artifact.digest = `sha256:${'a'.repeat(64)}`;
  drifted.manifest_digest = manifestDigest(drifted);
  assert.throws(() => validateEvidenceManifest(drifted, registry, contract, {artifactPath: registryPath}), /EVIDENCE_ARTIFACT_CONTENT_MISMATCH/);
  const digestDrift = clone(read(manifestPath));
  digestDrift.lineage.claim = 'MUTATED';
  assert.throws(() => validateEvidenceManifest(digestDrift, registry, contract, {artifactPath: registryPath}), /EVIDENCE_MANIFEST_DIGEST_MISMATCH/);
});

test('rejects external bytes, evidence-volume writes and release authority', () => {
  const registry = read(registryPath);
  const contract = read(contractPath);
  for (const mutation of [
    (manifest) => { manifest.artifact.contains_external_raw_content = true; },
    (manifest) => { manifest.artifact.evidence_uri = '/mnt/ih_prod_01/evidence/current-sold/unapproved'; },
    (manifest) => { manifest.release_boundary.database_mutation = true; },
    (manifest) => { manifest.release_boundary.production = 'PASS'; }
  ]) {
    const candidate = clone(read(manifestPath));
    mutation(candidate);
    candidate.manifest_digest = manifestDigest(candidate);
    assert.throws(() => validateEvidenceManifest(candidate, registry, contract, {artifactPath: registryPath}));
  }
});

test('rejects unapproved transaction acquisition and unknown sources', () => {
  const registry = read(registryPath);
  const contract = read(contractPath);
  const acquisition = clone(read(manifestPath));
  acquisition.manifest_type = 'ACQUISITION_EVIDENCE';
  acquisition.status = 'ADMITTED_RESTRICTED_EVIDENCE_NOT_RELEASE_AUTHORITY';
  acquisition.scope.source_ids = ['bring-a-trailer-results'];
  acquisition.scope.source_count = 1;
  acquisition.artifact.storage_mode = 'RESTRICTED_EVIDENCE_BYTES';
  acquisition.artifact.contains_external_raw_content = true;
  acquisition.artifact.evidence_uri = '/mnt/ih_prod_01/evidence/current-sold/acquisition/bring-a-trailer-results/run/manifest.json';
  acquisition.admission = {
    rights_decision_id: '11111111-1111-4111-8111-111111111111',
    supply_chain_run_id: '22222222-2222-4222-8222-222222222222'
  };
  acquisition.manifest_digest = manifestDigest(acquisition);
  assert.throws(() => validateEvidenceManifest(acquisition, registry, contract, {artifactPath: registryPath}), /EVIDENCE_RESTRICTED_BYTES_HARD_DISABLED_RECEIPT_RESOLUTION_NOT_IMPLEMENTED/);
  const unknown = clone(read(manifestPath));
  unknown.scope.source_ids = ['unknown-source'];
  unknown.scope.source_count = 1;
  unknown.manifest_digest = manifestDigest(unknown);
  assert.throws(() => validateEvidenceManifest(unknown, registry, contract, {artifactPath: registryPath}), /EVIDENCE_SOURCE_ID_UNKNOWN/);
});

test('rejects UUID-shaped restricted-byte receipts until authoritative content-bound resolution exists', () => {
  const registry = read(registryPath);
  const contract = read(contractPath);
  const admitted = clone(read(manifestPath));
  admitted.manifest_type = 'OBJECT_IDENTITY';
  admitted.status = 'ADMITTED_RESTRICTED_EVIDENCE_NOT_RELEASE_AUTHORITY';
  admitted.scope.source_ids = ['wikidata-cc0-identity'];
  admitted.scope.source_count = 1;
  admitted.artifact.storage_mode = 'RESTRICTED_EVIDENCE_BYTES';
  admitted.artifact.contains_external_raw_content = true;
  admitted.artifact.evidence_uri = '/mnt/ih_prod_01/evidence/current-sold/objects/wikidata-cc0-identity/manifest.json';
  admitted.admission = {
    rights_decision_id: '11111111-1111-4111-8111-111111111111',
    supply_chain_run_id: '22222222-2222-4222-8222-222222222222'
  };
  admitted.manifest_digest = manifestDigest(admitted);
  assert.throws(
    () => validateEvidenceManifest(admitted, registry, contract),
    /EVIDENCE_RESTRICTED_BYTES_HARD_DISABLED_RECEIPT_RESOLUTION_NOT_IMPLEMENTED/
  );
});

test('append is transactional and replay-idempotent', async () => {
  const client = new MemoryClient();
  const args = [read(manifestPath), read(registryPath), read(contractPath), {artifactPath: registryPath}];
  const first = await appendEvidenceManifest(client, ...args);
  assert.equal(first.state, 'COMMITTED');
  assert.equal(first.disposition, 'INSERTED');
  const second = await appendEvidenceManifest(client, ...args);
  assert.equal(second.disposition, 'IDEMPOTENT');
  assert.equal(client.commands.filter((command) => command === 'COMMIT').length, 2);
  assert.equal(client.commands.filter((command) => command === 'ROLLBACK').length, 0);
});

test('migration is append-only, registered-writer bound and release neutral', () => {
  const sql = fs.readFileSync('infrastructure/postgres/source-intelligence/0002_source_evidence_manifest_ledger_v1.sql', 'utf8');
  for (const required of [
    'kidults_control.source_evidence_manifest_ledger',
    'kidults_control.enforce_registered_writer()',
    'kidults_control.reject_mutation()',
    'BEFORE UPDATE OR DELETE',
    'BEFORE TRUNCATE',
    'source_acquisition',
    'database_mutation',
    'rights_decision_id',
    'supply_chain_run_id',
    "production}' = 'HOLD'",
    "source_evidence_manifest_restricted_bytes_hard_stop_ck",
    "storage_mode <> 'RESTRICTED_EVIDENCE_BYTES'"
  ]) assert.match(sql, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(sql, /GRANT\s+(UPDATE|DELETE|TRUNCATE)/i);
  assert.equal(artifactDigest(registryPath), read(manifestPath).artifact.digest);
});
