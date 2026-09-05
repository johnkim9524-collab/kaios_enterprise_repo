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
        manifest_payload: JSON.parse(params[11])
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
  acquisition.scope.source_ids = ['bring-a-trailer-results'];
  acquisition.scope.source_count = 1;
  acquisition.admission_receipt_ids = ['rights', 'schema', 'activation'];
  acquisition.manifest_digest = manifestDigest(acquisition);
  assert.throws(() => validateEvidenceManifest(acquisition, registry, contract, {artifactPath: registryPath}), /EVIDENCE_SOURCE_RIGHTS_NOT_PASS/);
  const unknown = clone(read(manifestPath));
  unknown.scope.source_ids = ['unknown-source'];
  unknown.scope.source_count = 1;
  unknown.manifest_digest = manifestDigest(unknown);
  assert.throws(() => validateEvidenceManifest(unknown, registry, contract, {artifactPath: registryPath}), /EVIDENCE_SOURCE_ID_UNKNOWN/);
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
    "production}' = 'HOLD'"
  ]) assert.match(sql, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(sql, /GRANT\s+(UPDATE|DELETE|TRUNCATE)/i);
  assert.equal(artifactDigest(registryPath), read(manifestPath).artifact.digest);
});
