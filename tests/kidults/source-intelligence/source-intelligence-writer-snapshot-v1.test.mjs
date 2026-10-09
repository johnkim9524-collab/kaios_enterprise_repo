import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  appendRegistrySnapshot, registryDigest, canonicalJson
} from '../../../scripts/kidults/source-intelligence/global-sold-source-registry-v1.mjs';
import {
  appendEvidenceManifest, manifestDigest, validateEvidenceManifest
} from '../../../scripts/kidults/source-intelligence/source-intelligence-evidence-manifest-v1.mjs';

// Deterministic transport only: no connection, real SQL, persistence or recovery proof.
const root = 'coordination/kidults/source-intelligence/';
const read = name => JSON.parse(fs.readFileSync(root + name, 'utf8'));
const fixture = () => ({
  registry: read('global-sold-source-registry-v1.json'),
  manifest: read('global-sold-source-registry-evidence-manifest-v1.json'),
  contract: read('source-intelligence-evidence-manifest-contract-v1.json')
});
class QueryRecorder {
  calls = [];
  constructor(hook = () => {}) { this.hook = hook; }
  async query(sql, params = []) {
    this.calls.push({sql, params: structuredClone(params)});
    await this.hook(sql, params);
    return {rowCount: 0, rows: []};
  }
}
const run = (kind, client, x, options = {}) => kind === 'registry'
  ? appendRegistrySnapshot(client, x.registry, options)
  : appendEvidenceManifest(client, x.manifest, x.registry, x.contract, options);
const payload = (kind, client) => {
  const table = kind === 'registry' ? 'global_source_registry_snapshot_ledger' : 'source_evidence_manifest_ledger';
  const row = client.calls.find(c => c.sql.includes(`INSERT INTO kidults_control.${table}`));
  assert.ok(row, 'expected actual writer INSERT request');
  return JSON.parse(row.params[kind === 'registry' ? 5 : 13]);
};
const mutate = (kind, x) => {
  if (kind === 'registry') {
    x.registry.sources[0].claim_ceiling = 'MUTATED_AFTER_VALIDATION';
    x.registry.sources[0].official_urls.push('https://synthetic.invalid/not-read');
  } else {
    x.manifest.lineage.claim = 'MUTATED_AFTER_VALIDATION';
    x.manifest.scope.source_ids.reverse();
  }
};

for (const kind of ['registry', 'manifest']) {
  for (const stage of ['BEGIN', 'LOCK', 'LOOKUP']) {
    test(`${kind} uses the same validated snapshot despite caller mutation during ${stage}`, async () => {
      const x = fixture(), before = structuredClone(x[kind]);
      let injected = false;
      const client = new QueryRecorder(sql => {
        const match = stage === 'BEGIN' ? sql === 'BEGIN' : stage === 'LOCK'
          ? sql.includes('pg_advisory_xact_lock') : /^SELECT (snapshot_digest|manifest_digest)/.test(sql);
        if (match && !injected) { injected = true; mutate(kind, x); }
      });
      const result = await run(kind, client, x);
      assert.equal(injected, true);
      const stored = payload(kind, client);
      assert.deepEqual(stored, before);
      const compute = kind === 'registry' ? registryDigest : manifestDigest;
      const key = kind === 'registry' ? 'snapshot_digest' : 'manifest_digest';
      assert.equal(compute(stored), before[key]);
      assert.equal(result[key], before[key]);
      if (kind === 'registry') {
        const assessments = client.calls.filter(c => c.sql.includes('INSERT INTO kidults_control.global_source_assessment_ledger'));
        assert.equal(assessments.length, before.sources.length);
        assert.deepEqual(assessments.map(c => JSON.parse(c.params[16])), before.sources);
      }
    });
  }
  test(`${kind} preserves the original error and distinguishes rollback failure`, async () => {
    const x = fixture(), rootError = new Error('SIMULATED_INSERT_FAILURE'), rollbackError = new Error('SIMULATED_ROLLBACK_FAILURE');
    const client = new QueryRecorder(sql => {
      if (sql.includes('INSERT INTO')) throw rootError;
      if (sql === 'ROLLBACK') throw rollbackError;
    });
    await assert.rejects(run(kind, client, x), error => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.cause, rootError);
      assert.deepEqual(error.errors, [rootError, rollbackError]);
      return true;
    });
    assert.equal(client.calls.filter(c => c.sql === 'ROLLBACK').length, 1);
    assert.equal(client.calls.some(c => c.sql === 'COMMIT'), false);
  });
  test(`${kind} preserves the original failure when rollback succeeds`, async () => {
    const x = fixture(), rootError = new Error('SIMULATED_INSERT_FAILURE');
    const client = new QueryRecorder(sql => { if (sql.includes('INSERT INTO')) throw rootError; });
    await assert.rejects(run(kind, client, x), error => error === rootError);
    assert.equal(client.calls.filter(c => c.sql === 'ROLLBACK').length, 1);
    assert.equal(client.calls.some(c => c.sql === 'COMMIT'), false);
  });
  test(`${kind} never starts SQL for an invalid initial digest`, async () => {
    const x = fixture(), client = new QueryRecorder(); mutate(kind, x);
    await assert.rejects(run(kind, client, x), /DIGEST_MISMATCH/);
    assert.equal(client.calls.length, 0);
  });
  test(`${kind} does not mutate the caller input on normal success`, async () => {
    const x = fixture(), before = canonicalJson(x), client = new QueryRecorder();
    await run(kind, client, x);
    assert.equal(canonicalJson(x), before);
  });
}

test('manifest admission validates the bound registry semantics, not only its recomputed digest', async () => {
  const x = fixture();
  x.registry.release_boundary.adapter_activation_authorized = true;
  x.registry.snapshot_digest = registryDigest(x.registry);
  x.manifest.registry_snapshot_digest = x.registry.snapshot_digest;
  x.manifest.manifest_digest = manifestDigest(x.manifest);
  const client = new QueryRecorder();
  await assert.rejects(appendEvidenceManifest(client, x.manifest, x.registry, x.contract), /REGISTRY_ADAPTER_AUTHORITY_FORBIDDEN/);
  assert.equal(client.calls.length, 0);
});
for (const value of [undefined, null, 'false', 0]) {
  test(`manifest raw-content flag rejects ${typeof value}:${String(value)} rather than coercing it to false`, () => {
    const x = fixture();
    if (value === undefined) delete x.manifest.artifact.contains_external_raw_content;
    else x.manifest.artifact.contains_external_raw_content = value;
    x.manifest.manifest_digest = manifestDigest(x.manifest);
    assert.throws(() => validateEvidenceManifest(x.manifest, x.registry, x.contract), /EVIDENCE_RAW_CONTENT_FLAG_INVALID/);
  });
}
