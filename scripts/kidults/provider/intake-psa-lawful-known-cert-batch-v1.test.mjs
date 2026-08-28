import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  PSA_REFERENCE_KEY_ID,
  buildPsaAdmissionPreviewOutput,
  buildPsaSourceAuthorityProposal,
  derivePsaManifestState,
  digestPsaSourceAuthorityEntry,
  digestPsaSourceAuthorityRegistry,
  intakePsaLawfulKnownCertBatch as runPsaLawfulKnownCertBatch,
  assertPsaTrustAnchorSeparation,
  readPsaPrivateBatchFile,
  validatePsaPrivateBatch,
  validatePsaSourceAuthorityRegistry,
  writePsaManifestAtomicCas,
} from './intake-psa-lawful-known-cert-batch-v1.mjs';

const keyBase64 = Buffer.alloc(32, 0x5a).toString('base64');
const asOf = new Date('2026-08-28T12:00:00.000Z');

function intakePsaLawfulKnownCertBatch(args) {
  return runPsaLawfulKnownCertBatch({
    ...args,
    protectedBaseRegistryDigest: digestPsaSourceAuthorityRegistry(args.authorityRegistry),
  });
}

function makeBatch(count, authorityId = 'PSA_SOURCE_AUTHORITY_SYNTHETIC_A', offset = 0) {
  return {
    schema_version: '1.0.0',
    batch_type: 'KIDULTS_PSA_LAWFUL_KNOWN_CERT_PRIVATE_BATCH',
    authority_id: authorityId,
    reference_key_id: PSA_REFERENCE_KEY_ID,
    source_class: 'PROGRAM_OWNER_KNOWN_CERT_RECORD',
    rights_basis_id: 'PSA_BOUNDED_PRIVATE_EVALUATION_2026_08_24',
    collector_id: 'PROGRAM_OWNER',
    admission_purpose: 'PRIVATE_ER_EVALUATION_ONLY',
    enumeration_method: 'NONE',
    non_enumeration_verified: true,
    records: Array.from({ length: count }, (_, index) => ({
      cert_number: String(10_000_000 + offset + index),
      source_record_locator: `synthetic-fixture-record-${offset + index}`,
      source_observed_at: '2026-08-28T02:00:00.000Z',
    })),
  };
}

function makeAuthority(batch) {
  const proposal = buildPsaSourceAuthorityProposal({ batch, keyBase64, asOf });
  assert.equal(proposal.rights_evidence_digest_required, true);
  assert.equal(proposal.program_owner_approval_on_protected_main_required, true);
  return {
    authority_id: batch.authority_id,
    status: 'ACTIVE',
    reference_key_id: PSA_REFERENCE_KEY_ID,
    source_class: batch.source_class,
    source_bundle_token: proposal.source_bundle_token,
    expected_record_count: batch.records.length,
    rights_basis_id: batch.rights_basis_id,
    rights_evidence_digest: `sha256:${createHash('sha256').update('synthetic-test-rights-evidence-only').digest('hex')}`,
    rights_evidence_ref: 'github:synthetic-test-evidence-only',
    collector_id: batch.collector_id,
    admission_purpose: batch.admission_purpose,
    enumeration_method: 'NONE',
    non_enumeration_verified: true,
    authorized_at: '2026-08-28T01:00:00.000Z',
    expires_at: '2026-08-29T01:00:00.000Z',
    revoked_at: null,
  };
}

function makeRegistry(authorities = []) {
  return {
    id: 'KIDULTS_PSA_SOURCE_AUTHORITY_REGISTRY_V1',
    schema_version: '1.0.0',
    state: authorities.some(authority => authority.status === 'ACTIVE') ? 'ACTIVE_SOURCE_AUTHORITIES_PRESENT' : 'NO_ACTIVE_SOURCE_AUTHORITIES',
    reference_key_id: PSA_REFERENCE_KEY_ID,
    authorities,
  };
}

function makeManifest() {
  return {
    id: 'KIDULTS_PSA_120_KNOWN_CERT_MANIFEST_V1',
    state: 'WAITING_FOR_PROVENANCE_BOUND_SOURCE_COMPLETION',
    target_count: 120,
    declared_known_count: 2,
    provenance_bound_admissible_count: 0,
    remaining_required: 120,
    cert_values_in_repository: false,
    reference_key_id: PSA_REFERENCE_KEY_ID,
    entries: [],
    required_entry_contract: {
      cert_reference_digest: 'hmac-sha256:v1:<64hex>', source_authority_id: 'governed active source authority id',
      source_authority_entry_digest: 'sha256:<64hex> of canonical authority entry including rights_evidence_digest', source_bundle_token: 'hmac-sha256:v1:<64hex>',
      source_record_token: 'hmac-sha256:v1:<64hex>', source_receipt_digest: 'sha256:<64hex>',
      source_class: 'PROGRAM_OWNER_KNOWN_CERT_RECORD|RIGHTS_CLEAR_PRIVATE_SOURCE_RECORD',
      rights_basis_id: 'PSA_BOUNDED_PRIVATE_EVALUATION_2026_08_24', collector_id: 'PROGRAM_OWNER|KPMO_AUTHORIZED_OPERATOR',
      source_observed_at: 'ISO-8601 required', admission_purpose: 'PRIVATE_ER_EVALUATION_ONLY',
      non_enumeration_verified: true, enumeration_used: false, raw_cert_value_in_repository: false, empirical_admissible: true,
    },
    source_receipt_contract: {
      schema_version: '2.0.0', receipt_type: 'KIDULTS_PSA_KNOWN_CERT_SOURCE_RECEIPT', synthetic: false,
      enumeration_method: 'NONE', source_authority_registry_binding_required: true,
      exact_cert_to_source_record_binding_required: true, self_asserted_provenance_rejected: true,
    },
    truth_boundary: 'DECLARED_KNOWN_COUNT_IS_NOT_ADMISSIBLE_PROGRESS. ONLY MACHINE-VALIDATED, AUTHORITY-BOUND SOURCE RECORDS WITH EXACT CERT HMAC BINDING COUNT TOWARD 120. REGISTRY METADATA AND RIGHTS EVIDENCE DIGESTS DO NOT ALONE PROVE LAWFULNESS; EACH ACTUAL SOURCE AUTHORITY REQUIRES EXPLICIT PROGRAM OWNER APPROVAL ON PROTECTED MAIN.',
    rules: {
      bulk_enumeration: 'PROHIBITED', brute_force_discovery: 'PROHIBITED', synthetic_or_guessed_identifiers: 'PROHIBITED',
      duplicates: 'PROHIBITED', exact_120_provenance_bound_entries_required_before_live_wave: true,
      provider_daily_limit: 100, minimum_execution_waves: 2,
    },
    promotion_authority: 'NONE', live_acquisition: 'HOLD_UNTIL_120_PROVENANCE_BOUND_ENTRIES',
    production: 'HOLD', public: 'HOLD', g5: 'HOLD',
  };
}

test('manifest state is exact at 0, 1, 119, 120 and rejects 121', () => {
  assert.deepEqual([0, 1, 119].map(count => derivePsaManifestState(count).state), Array(3).fill('WAITING_FOR_PROVENANCE_BOUND_SOURCE_COMPLETION'));
  assert.equal(derivePsaManifestState(120).state, 'MANIFEST_READY_RUNTIME_GATES_PENDING');
  assert.equal(derivePsaManifestState(120).live_acquisition, 'HOLD_UNTIL_RUNTIME_GATES');
  assert.throws(() => derivePsaManifestState(121), /PSA_MANIFEST_TARGET_EXCEEDED/);
});

test('source authority and manifest cannot change in the same transaction', () => {
  assert.equal(assertPsaTrustAnchorSeparation(['coordination/kidults/provider/psa-source-authority-registry-v1.json']), true);
  assert.throws(() => assertPsaTrustAnchorSeparation([
    'coordination/kidults/provider/psa-source-authority-registry-v1.json',
    'coordination/kidults/provider/psa-120-known-cert-manifest-v1.json',
  ]), /SAME_TRANSACTION_PROHIBITED/);
  const batch = makeBatch(1);
  const registry = makeRegistry([makeAuthority(batch)]);
  assert.throws(() => runPsaLawfulKnownCertBatch({
    batch,
    authorityRegistry: registry,
    currentManifest: makeManifest(),
    keyBase64,
    protectedBaseRegistryDigest: `sha256:${'0'.repeat(64)}`,
    asOf,
  }), /PROTECTED_BASE_REGISTRY_DIGEST_MISMATCH/);
});

test('private batch and registry reject unknown fields, duplicates, revocation and expiry', () => {
  const batch = makeBatch(2);
  assert.throws(() => validatePsaPrivateBatch({ ...batch, unexpected: true }), /SCHEMA_INVALID/);
  assert.throws(() => validatePsaPrivateBatch({ ...batch, records: [batch.records[0], { ...batch.records[1], cert_number: batch.records[0].cert_number }] }), /CERT_NUMBER_DUPLICATE/);
  const authority = makeAuthority(batch);
  assert.throws(() => validatePsaSourceAuthorityRegistry(makeRegistry([{ ...authority, unexpected: true }])), /AUTHORITY_SCHEMA_INVALID/);
  const { rights_evidence_digest: _missingEvidenceDigest, ...missingEvidenceDigest } = authority;
  assert.throws(() => validatePsaSourceAuthorityRegistry(makeRegistry([missingEvidenceDigest])), /AUTHORITY_SCHEMA_INVALID/);
  assert.throws(() => validatePsaSourceAuthorityRegistry(makeRegistry([{ ...authority, rights_evidence_digest: 'sha256:not-a-digest' }])), /RIGHTS_EVIDENCE_DIGEST_INVALID/);
  const substitutedEvidenceDigest = { ...authority, rights_evidence_digest: `sha256:${'f'.repeat(64)}` };
  assert.notEqual(digestPsaSourceAuthorityEntry(substitutedEvidenceDigest), digestPsaSourceAuthorityEntry(authority));
  const revoked = { ...authority, status: 'REVOKED', revoked_at: '2026-08-28T02:00:00.000Z' };
  const registry = makeRegistry([revoked]);
  assert.doesNotThrow(() => validatePsaSourceAuthorityRegistry(registry));
  assert.throws(() => intakePsaLawfulKnownCertBatch({ batch, authorityRegistry: registry, currentManifest: makeManifest(), keyBase64, asOf }), /NOT_ACTIVE/);
  assert.throws(() => intakePsaLawfulKnownCertBatch({ batch, authorityRegistry: makeRegistry([authority]), currentManifest: makeManifest(), keyBase64, asOf: '2026-08-30T00:00:00.000Z' }), /EXPIRED/);
});

test('119 plus one reaches 120, output has no raw cert or locator, and replay is rejected', () => {
  const batch119 = makeBatch(119, 'PSA_SOURCE_AUTHORITY_SYNTHETIC_A');
  const batch1 = makeBatch(1, 'PSA_SOURCE_AUTHORITY_SYNTHETIC_B', 500);
  const authority119 = makeAuthority(batch119);
  const authority1 = makeAuthority(batch1);
  const registry = makeRegistry([authority119, authority1]);
  const first = intakePsaLawfulKnownCertBatch({ batch: batch119, authorityRegistry: registry, currentManifest: makeManifest(), keyBase64, asOf });
  assert.equal(first.manifest.provenance_bound_admissible_count, 119);
  const previewOutput = buildPsaAdmissionPreviewOutput(first);
  const previewSerialized = JSON.stringify(previewOutput);
  assert.equal(previewOutput.action, 'ADMISSION_PREVIEW');
  assert.equal(previewOutput.candidate_manifest.provenance_bound_admissible_count, 119);
  assert(!previewSerialized.includes(batch119.records[0].cert_number));
  assert(!previewSerialized.includes(batch119.records[0].source_record_locator));
  const complete = intakePsaLawfulKnownCertBatch({ batch: batch1, authorityRegistry: registry, currentManifest: first.manifest, keyBase64, asOf });
  assert.equal(complete.manifest.provenance_bound_admissible_count, 120);
  assert.equal(complete.manifest.state, 'MANIFEST_READY_RUNTIME_GATES_PENDING');
  const serialized = JSON.stringify(complete);
  assert(!serialized.includes(batch1.records[0].cert_number));
  assert(!serialized.includes(batch1.records[0].source_record_locator));
  assert.throws(() => intakePsaLawfulKnownCertBatch({ batch: batch1, authorityRegistry: registry, currentManifest: complete.manifest, keyBase64, asOf }), /REPLAY/);
});

test('an over-target merge and a cross-authority cert replay fail closed', () => {
  const batch119 = makeBatch(119, 'PSA_SOURCE_AUTHORITY_SYNTHETIC_A');
  const batch2 = makeBatch(2, 'PSA_SOURCE_AUTHORITY_SYNTHETIC_B', 500);
  const registry = makeRegistry([makeAuthority(batch119), makeAuthority(batch2)]);
  const first = intakePsaLawfulKnownCertBatch({ batch: batch119, authorityRegistry: registry, currentManifest: makeManifest(), keyBase64, asOf });
  assert.throws(() => intakePsaLawfulKnownCertBatch({ batch: batch2, authorityRegistry: registry, currentManifest: first.manifest, keyBase64, asOf }), /TARGET_EXCEEDED/);

  const duplicateBatch = makeBatch(1, 'PSA_SOURCE_AUTHORITY_SYNTHETIC_C');
  duplicateBatch.records[0] = { ...batch119.records[0], source_record_locator: 'different-lawful-record' };
  const replayRegistry = makeRegistry([makeAuthority(batch119), makeAuthority(duplicateBatch)]);
  const replayBase = intakePsaLawfulKnownCertBatch({ batch: batch119, authorityRegistry: replayRegistry, currentManifest: makeManifest(), keyBase64, asOf });
  assert.throws(() => intakePsaLawfulKnownCertBatch({ batch: duplicateBatch, authorityRegistry: replayRegistry, currentManifest: replayBase.manifest, keyBase64, asOf }), /CERT_REPLAY/);
});

test('private file reader enforces disjoint root, 0700/0600, no symlink and nlink=1', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'psa-intake-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const repositoryRoot = path.join(base, 'repo');
  const privateRoot = path.join(base, 'private');
  fs.mkdirSync(repositoryRoot, { mode: 0o700 });
  fs.mkdirSync(privateRoot, { mode: 0o700 });
  const batchPath = path.join(privateRoot, 'batch.json');
  fs.writeFileSync(batchPath, JSON.stringify(makeBatch(1)), { mode: 0o600 });
  assert.equal(readPsaPrivateBatchFile({ privateRoot, batchRelativePath: 'batch.json', repositoryRoot }).records.length, 1);
  fs.chmodSync(batchPath, 0o644);
  assert.throws(() => readPsaPrivateBatchFile({ privateRoot, batchRelativePath: 'batch.json', repositoryRoot }), /MODE_INVALID/);
  fs.chmodSync(batchPath, 0o600);
  fs.symlinkSync(batchPath, path.join(privateRoot, 'linked.json'));
  assert.throws(() => readPsaPrivateBatchFile({ privateRoot, batchRelativePath: 'linked.json', repositoryRoot }), /SYMLINK/);
  fs.linkSync(batchPath, path.join(privateRoot, 'hardlink.json'));
  assert.throws(() => readPsaPrivateBatchFile({ privateRoot, batchRelativePath: 'batch.json', repositoryRoot }), /FILE_INVALID/);
  assert.throws(() => readPsaPrivateBatchFile({ privateRoot: repositoryRoot, batchRelativePath: 'missing.json', repositoryRoot }), /REPOSITORY_OVERLAP/);
});

test('atomic manifest writer requires a matching compare-and-swap digest', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'psa-manifest-cas-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const manifestPath = path.join(base, 'manifest.json');
  const original = `${JSON.stringify(makeManifest(), null, 2)}\n`;
  fs.writeFileSync(manifestPath, original, { mode: 0o644 });
  const digest = `sha256:${createHash('sha256').update(original).digest('hex')}`;
  const candidate = { ...makeManifest(), declared_known_count: 3 };
  assert.match(writePsaManifestAtomicCas({ manifestPath, candidateManifest: candidate, expectedManifestDigest: digest }), /^sha256:/);
  assert.equal(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).declared_known_count, 3);
  assert.throws(() => writePsaManifestAtomicCas({ manifestPath, candidateManifest: makeManifest(), expectedManifestDigest: digest }), /CAS_MISMATCH/);
});
