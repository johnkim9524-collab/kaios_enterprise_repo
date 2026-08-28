#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  PSA_REFERENCE_KEY_ID,
  assertPsaTrustAnchorSeparation,
  buildPsaSourceAuthorityProposal,
  derivePsaManifestState,
  digestPsaSourceAuthorityRegistry,
  intakePsaLawfulKnownCertBatch,
  validatePsaPrivateBatch,
  validatePsaSourceAuthorityRegistry,
} from './intake-psa-lawful-known-cert-batch-v1.mjs';

const keyBase64 = Buffer.alloc(32, 0x56).toString('base64');
const asOf = new Date('2026-08-28T12:00:00.000Z');
const syntheticCert = '0'.repeat(8);
const syntheticLocator = 'synthetic-validator-record-only';

const batch = {
  schema_version: '1.0.0',
  batch_type: 'KIDULTS_PSA_LAWFUL_KNOWN_CERT_PRIVATE_BATCH',
  authority_id: 'PSA_SOURCE_AUTHORITY_SYNTHETIC_VALIDATOR_V1',
  reference_key_id: PSA_REFERENCE_KEY_ID,
  source_class: 'RIGHTS_CLEAR_PRIVATE_SOURCE_RECORD',
  rights_basis_id: 'PSA_BOUNDED_PRIVATE_EVALUATION_2026_08_24',
  collector_id: 'KPMO_AUTHORIZED_OPERATOR',
  admission_purpose: 'PRIVATE_ER_EVALUATION_ONLY',
  enumeration_method: 'NONE',
  non_enumeration_verified: true,
  records: [{
    cert_number: syntheticCert,
    source_record_locator: syntheticLocator,
    source_observed_at: '2026-08-28T02:00:00.000Z',
  }],
};

const proposal = buildPsaSourceAuthorityProposal({ batch, keyBase64, asOf });
if (proposal.rights_evidence_digest_required !== true || proposal.program_owner_approval_on_protected_main_required !== true) {
  throw new Error('PSA_PREAUTH_RIGHTS_TRUTH_BOUNDARY_INVALID');
}
const authority = {
  authority_id: batch.authority_id,
  status: 'ACTIVE',
  reference_key_id: PSA_REFERENCE_KEY_ID,
  source_class: batch.source_class,
  source_bundle_token: proposal.source_bundle_token,
  expected_record_count: batch.records.length,
  rights_basis_id: batch.rights_basis_id,
  rights_evidence_digest: `sha256:${createHash('sha256').update('synthetic-intake-validator-rights-evidence-only').digest('hex')}`,
  rights_evidence_ref: 'urn:kaios:psa:synthetic-intake-validator-only',
  collector_id: batch.collector_id,
  admission_purpose: batch.admission_purpose,
  enumeration_method: batch.enumeration_method,
  non_enumeration_verified: batch.non_enumeration_verified,
  authorized_at: '2026-08-28T01:00:00.000Z',
  expires_at: '2026-08-29T01:00:00.000Z',
  revoked_at: null,
};
const registry = {
  id: 'KIDULTS_PSA_SOURCE_AUTHORITY_REGISTRY_V1',
  schema_version: '1.0.0',
  state: 'ACTIVE_SOURCE_AUTHORITIES_PRESENT',
  reference_key_id: PSA_REFERENCE_KEY_ID,
  authorities: [authority],
};
const manifest = JSON.parse(fs.readFileSync('coordination/kidults/provider/psa-120-known-cert-manifest-v1.json', 'utf8'));

function expectExactError(name, expectedCode, operation) {
  try {
    operation();
  } catch (error) {
    if (error?.code === expectedCode) return;
    throw new Error(`PSA_INTAKE_NEGATIVE_WRONG_ERROR:${name}`);
  }
  throw new Error(`PSA_INTAKE_NEGATIVE_FALSE_GREEN:${name}`);
}

const protectedBaseRegistryDigest = digestPsaSourceAuthorityRegistry(registry);
const preview = intakePsaLawfulKnownCertBatch({
  batch,
  authorityRegistry: registry,
  currentManifest: manifest,
  keyBase64,
  protectedBaseRegistryDigest,
  asOf,
});
if (preview.receipt.state !== 'VERIFIED_PROVENANCE_BOUND_PREVIEW' || preview.receipt.provider_call_performed !== false) {
  throw new Error('PSA_INTAKE_PREVIEW_BOUNDARY_INVALID');
}
const serializedPreview = JSON.stringify(preview);
if (serializedPreview.includes(syntheticCert) || serializedPreview.includes(syntheticLocator)) {
  throw new Error('PSA_INTAKE_RAW_PRIVATE_VALUE_LEAK');
}

const negatives = [
  ['BATCH_EXTRA_FIELD', 'PSA_PRIVATE_BATCH_SCHEMA_INVALID', () => validatePsaPrivateBatch({ ...batch, caller_asserted: true })],
  ['RECORD_EXTRA_FIELD', 'PSA_PRIVATE_BATCH_RECORD_SCHEMA_INVALID', () => validatePsaPrivateBatch({ ...batch, records: [{ ...batch.records[0], caller_asserted: true }] })],
  ['DUPLICATE_CERT', 'PSA_CERT_NUMBER_DUPLICATE', () => validatePsaPrivateBatch({ ...batch, records: [batch.records[0], { ...batch.records[0], source_record_locator: 'synthetic-validator-record-two' }] })],
  ['ENUMERATION', 'PSA_ENUMERATION_OR_DISCOVERY_PROHIBITED', () => validatePsaPrivateBatch({ ...batch, enumeration_method: 'SEQUENTIAL_SCAN', non_enumeration_verified: false })],
  ['RIGHTS_EVIDENCE_DIGEST_MISSING', 'PSA_SOURCE_AUTHORITY_SCHEMA_INVALID', () => {
    const { rights_evidence_digest: _drop, ...withoutDigest } = authority;
    return validatePsaSourceAuthorityRegistry({ ...registry, authorities: [withoutDigest] });
  }],
  ['RIGHTS_EVIDENCE_DIGEST_INVALID', 'PSA_RIGHTS_EVIDENCE_DIGEST_INVALID', () => validatePsaSourceAuthorityRegistry({
    ...registry,
    authorities: [{ ...authority, rights_evidence_digest: 'sha256:not-a-digest' }],
  })],
  ['PROTECTED_BASE_SUBSTITUTION', 'PSA_PROTECTED_BASE_REGISTRY_DIGEST_MISMATCH', () => intakePsaLawfulKnownCertBatch({ batch, authorityRegistry: registry, currentManifest: manifest, keyBase64, protectedBaseRegistryDigest: `sha256:${'0'.repeat(64)}`, asOf })],
  ['BUNDLE_SUBSTITUTION', 'PSA_SOURCE_BUNDLE_TOKEN_MISMATCH', () => {
    const substitutedRegistry = { ...registry, authorities: [{ ...authority, source_bundle_token: `hmac-sha256:v1:${'0'.repeat(64)}` }] };
    return intakePsaLawfulKnownCertBatch({ batch, authorityRegistry: substitutedRegistry, currentManifest: manifest, keyBase64, protectedBaseRegistryDigest: digestPsaSourceAuthorityRegistry(substitutedRegistry), asOf });
  }],
  ['EXPIRED_AUTHORITY', 'PSA_SOURCE_AUTHORITY_EXPIRED_OR_NOT_YET_ACTIVE', () => {
    const expiredRegistry = { ...registry, authorities: [{ ...authority, expires_at: '2026-08-28T03:00:00.000Z' }] };
    return intakePsaLawfulKnownCertBatch({ batch, authorityRegistry: expiredRegistry, currentManifest: manifest, keyBase64, protectedBaseRegistryDigest: digestPsaSourceAuthorityRegistry(expiredRegistry), asOf });
  }],
  ['SAME_TRANSACTION_AUTHORITY', 'PSA_SOURCE_AUTHORITY_AND_MANIFEST_SAME_TRANSACTION_PROHIBITED', () => assertPsaTrustAnchorSeparation([
    'coordination/kidults/provider/psa-source-authority-registry-v1.json',
    'coordination/kidults/provider/psa-120-known-cert-manifest-v1.json',
  ])],
  ['OVER_TARGET', 'PSA_MANIFEST_TARGET_EXCEEDED', () => derivePsaManifestState(121)],
];
for (const [name, expectedCode, operation] of negatives) expectExactError(name, expectedCode, operation);

console.log(JSON.stringify({
  validator: 'KIDULTS_PSA_LAWFUL_PRIVATE_BATCH_INTAKE_V3',
  state: 'VERIFIED_PASS',
  keyed_reference_tokens: true,
  preexisting_governed_authority_required: true,
  protected_base_registry_digest_required: true,
  rights_evidence_digest_required: true,
  registry_manifest_same_transaction_rejected: true,
  exact_schema_unknown_fields_rejected: true,
  duplicate_and_over_target_rejected: true,
  raw_private_values_in_output: false,
  negative_mutations_rejected: negatives.length,
  live_provider_call: false,
  empirical_delta: 0,
  promotion_eligible: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD',
}, null, 2));
