#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  PSA_HMAC_TOKEN_PATTERN,
  PSA_SHA256_DIGEST_PATTERN,
  createPsaCertReferenceToken,
  createPsaSourceBundleToken,
  createPsaSourceRecordToken,
  equalPsaReferenceTokens,
  sha256PsaCanonical,
} from '../../../services/kidults-control-plane/src/psa-reference-token.mjs';
import {
  assertPsaKnownCertManifest as assertCanonicalPsaKnownCertManifest,
  validatePsaSourceAuthorityRegistry as validateCanonicalPsaSourceAuthorityRegistry,
} from './validate-psa-manifest-provenance-contract-v1.mjs';

export const PSA_REFERENCE_KEY_ID = 'PSA_CERT_REFERENCE_KEY_V1';
export const PSA_MANIFEST_TARGET_COUNT = 120;
export const PSA_PRIVATE_BATCH_MAX_BYTES = 1_048_576;
export const PSA_SOURCE_AUTHORITY_REGISTRY_PATH = 'coordination/kidults/provider/psa-source-authority-registry-v1.json';
export const PSA_KNOWN_CERT_MANIFEST_PATH = 'coordination/kidults/provider/psa-120-known-cert-manifest-v1.json';

const SOURCE_CLASSES = new Set(['PROGRAM_OWNER_KNOWN_CERT_RECORD', 'RIGHTS_CLEAR_PRIVATE_SOURCE_RECORD']);
const COLLECTORS = new Set(['PROGRAM_OWNER', 'KPMO_AUTHORIZED_OPERATOR']);
const AUTHORITY_ID_PATTERN = /^PSA_SOURCE_AUTHORITY_[A-Z0-9][A-Z0-9_-]{2,63}$/;
const REQUIRED_RIGHTS_BASIS = 'PSA_BOUNDED_PRIVATE_EVALUATION_2026_08_24';
const REQUIRED_PURPOSE = 'PRIVATE_ER_EVALUATION_ONLY';

const BATCH_KEYS = [
  'schema_version', 'batch_type', 'authority_id', 'reference_key_id', 'source_class',
  'rights_basis_id', 'collector_id', 'admission_purpose', 'enumeration_method',
  'non_enumeration_verified', 'records',
];
const BATCH_RECORD_KEYS = ['cert_number', 'source_record_locator', 'source_observed_at'];
const REGISTRY_KEYS = ['id', 'schema_version', 'state', 'reference_key_id', 'authorities'];
const AUTHORITY_KEYS = [
  'authority_id', 'status', 'reference_key_id', 'source_class', 'source_bundle_token',
  'expected_record_count', 'rights_basis_id', 'rights_evidence_digest', 'rights_evidence_ref', 'collector_id',
  'admission_purpose', 'enumeration_method', 'non_enumeration_verified', 'authorized_at',
  'expires_at', 'revoked_at',
];
export const PSA_MANIFEST_ENTRY_KEYS = Object.freeze([
  'cert_reference_digest', 'source_authority_id', 'source_authority_entry_digest',
  'source_bundle_token', 'source_record_token', 'source_receipt_digest', 'source_class',
  'rights_basis_id', 'collector_id', 'source_observed_at', 'admission_purpose',
  'non_enumeration_verified', 'enumeration_used', 'raw_cert_value_in_repository',
  'empirical_admissible',
]);
const MANIFEST_KEYS = [
  'id', 'state', 'target_count', 'declared_known_count', 'provenance_bound_admissible_count',
  'remaining_required', 'cert_values_in_repository', 'reference_key_id', 'entries',
  'required_entry_contract', 'source_receipt_contract', 'truth_boundary', 'rules',
  'promotion_authority', 'live_acquisition', 'production', 'public', 'g5',
];
const REQUIRED_ENTRY_CONTRACT_KEYS = [...PSA_MANIFEST_ENTRY_KEYS];
const SOURCE_RECEIPT_CONTRACT_KEYS = [
  'schema_version', 'receipt_type', 'synthetic', 'enumeration_method',
  'source_authority_registry_binding_required', 'exact_cert_to_source_record_binding_required',
  'self_asserted_provenance_rejected',
];
const RULE_KEYS = [
  'bulk_enumeration', 'brute_force_discovery', 'synthetic_or_guessed_identifiers', 'duplicates',
  'exact_120_provenance_bound_entries_required_before_live_wave', 'provider_daily_limit',
  'minimum_execution_waves',
];
const schemaProperties = keys => Object.fromEntries(keys.map(key => [key, {}]));

export const PSA_PRIVATE_BATCH_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false, required: BATCH_KEYS,
  properties: {
    ...schemaProperties(BATCH_KEYS),
    records: {
      type: 'array', minItems: 1, maxItems: PSA_MANIFEST_TARGET_COUNT,
      items: {
        type: 'object', additionalProperties: false, required: BATCH_RECORD_KEYS,
        properties: schemaProperties(BATCH_RECORD_KEYS),
      },
    },
  },
});
export const PSA_SOURCE_AUTHORITY_REGISTRY_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false, required: REGISTRY_KEYS,
  properties: {
    ...schemaProperties(REGISTRY_KEYS),
    authorities: {
      type: 'array', maxItems: PSA_MANIFEST_TARGET_COUNT,
      items: {
        type: 'object', additionalProperties: false, required: AUTHORITY_KEYS,
        properties: schemaProperties(AUTHORITY_KEYS),
      },
    },
  },
});
export const PSA_KNOWN_CERT_MANIFEST_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false, required: MANIFEST_KEYS,
  properties: {
    ...schemaProperties(MANIFEST_KEYS),
    entries: {
      type: 'array', maxItems: PSA_MANIFEST_TARGET_COUNT,
      items: {
        type: 'object', additionalProperties: false, required: PSA_MANIFEST_ENTRY_KEYS,
        properties: schemaProperties(PSA_MANIFEST_ENTRY_KEYS),
      },
    },
  },
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactObject(value, keys, code) {
  if (!isPlainObject(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
  return value;
}

function parseInstant(value, code) {
  if (typeof value !== 'string') fail(code);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) fail(code);
  return parsed;
}

function assertReferenceKeyId(value) {
  if (value !== PSA_REFERENCE_KEY_ID) fail('PSA_REFERENCE_KEY_ID_INVALID');
}

function assertAuthorityId(value) {
  if (typeof value !== 'string' || !AUTHORITY_ID_PATTERN.test(value)) fail('PSA_SOURCE_AUTHORITY_ID_INVALID');
}

function assertSourceClass(value) {
  if (!SOURCE_CLASSES.has(value)) fail('PSA_SOURCE_CLASS_NOT_ALLOWED');
}

function assertCollector(value) {
  if (!COLLECTORS.has(value)) fail('PSA_COLLECTOR_ID_NOT_ALLOWED');
}

function assertFixedProvenanceFields(value) {
  assertSourceClass(value.source_class);
  assertCollector(value.collector_id);
  if (value.rights_basis_id !== REQUIRED_RIGHTS_BASIS) fail('PSA_RIGHTS_BASIS_INVALID');
  if (value.admission_purpose !== REQUIRED_PURPOSE) fail('PSA_ADMISSION_PURPOSE_INVALID');
  if (value.enumeration_method !== 'NONE' || value.non_enumeration_verified !== true) {
    fail('PSA_ENUMERATION_OR_DISCOVERY_PROHIBITED');
  }
}

export function validatePsaPrivateBatch(batch) {
  assertExactObject(batch, BATCH_KEYS, 'PSA_PRIVATE_BATCH_SCHEMA_INVALID');
  if (batch.schema_version !== '1.0.0' || batch.batch_type !== 'KIDULTS_PSA_LAWFUL_KNOWN_CERT_PRIVATE_BATCH') {
    fail('PSA_PRIVATE_BATCH_TYPE_INVALID');
  }
  assertAuthorityId(batch.authority_id);
  assertReferenceKeyId(batch.reference_key_id);
  assertFixedProvenanceFields(batch);
  if (!Array.isArray(batch.records) || batch.records.length < 1) fail('PSA_PRIVATE_BATCH_RECORD_COUNT_INVALID');
  if (batch.records.length > PSA_MANIFEST_TARGET_COUNT) fail('PSA_MANIFEST_TARGET_EXCEEDED');
  const certs = new Set();
  const locators = new Set();
  for (const record of batch.records) {
    assertExactObject(record, BATCH_RECORD_KEYS, 'PSA_PRIVATE_BATCH_RECORD_SCHEMA_INVALID');
    if (typeof record.cert_number !== 'string' || !/^\d{4,16}$/.test(record.cert_number)) fail('PSA_CERT_NUMBER_INVALID');
    if (typeof record.source_record_locator !== 'string' || record.source_record_locator.length < 1 || record.source_record_locator.length > 512 || /[\r\n\0]/.test(record.source_record_locator)) {
      fail('PSA_SOURCE_RECORD_LOCATOR_INVALID');
    }
    parseInstant(record.source_observed_at, 'PSA_SOURCE_OBSERVED_AT_INVALID');
    if (certs.has(record.cert_number)) fail('PSA_CERT_NUMBER_DUPLICATE');
    if (locators.has(record.source_record_locator)) fail('PSA_SOURCE_RECORD_LOCATOR_DUPLICATE');
    certs.add(record.cert_number);
    locators.add(record.source_record_locator);
  }
  return batch;
}

export function validatePsaSourceAuthorityRegistry(registry) {
  assertExactObject(registry, REGISTRY_KEYS, 'PSA_SOURCE_AUTHORITY_REGISTRY_SCHEMA_INVALID');
  if (registry.id !== 'KIDULTS_PSA_SOURCE_AUTHORITY_REGISTRY_V1' || registry.schema_version !== '1.0.0') {
    fail('PSA_SOURCE_AUTHORITY_REGISTRY_ID_INVALID');
  }
  assertReferenceKeyId(registry.reference_key_id);
  if (!Array.isArray(registry.authorities) || registry.authorities.length > PSA_MANIFEST_TARGET_COUNT) {
    fail('PSA_SOURCE_AUTHORITY_REGISTRY_SCHEMA_INVALID');
  }
  const authorityIds = new Set();
  const bundleTokens = new Set();
  let activeCount = 0;
  for (const authority of registry.authorities) {
    assertExactObject(authority, AUTHORITY_KEYS, 'PSA_SOURCE_AUTHORITY_SCHEMA_INVALID');
    assertAuthorityId(authority.authority_id);
    if (authorityIds.has(authority.authority_id)) fail('PSA_SOURCE_AUTHORITY_DUPLICATE');
    authorityIds.add(authority.authority_id);
    if (authority.status !== 'ACTIVE' && authority.status !== 'REVOKED') fail('PSA_SOURCE_AUTHORITY_STATUS_INVALID');
    assertReferenceKeyId(authority.reference_key_id);
    assertFixedProvenanceFields(authority);
    if (!PSA_HMAC_TOKEN_PATTERN.test(String(authority.source_bundle_token || ''))) fail('PSA_SOURCE_BUNDLE_TOKEN_INVALID');
    if (bundleTokens.has(authority.source_bundle_token)) fail('PSA_SOURCE_BUNDLE_TOKEN_DUPLICATE');
    bundleTokens.add(authority.source_bundle_token);
    if (!Number.isInteger(authority.expected_record_count) || authority.expected_record_count < 1 || authority.expected_record_count > PSA_MANIFEST_TARGET_COUNT) {
      fail('PSA_SOURCE_AUTHORITY_RECORD_COUNT_INVALID');
    }
    if (!PSA_SHA256_DIGEST_PATTERN.test(String(authority.rights_evidence_digest || ''))) fail('PSA_RIGHTS_EVIDENCE_DIGEST_INVALID');
    if (typeof authority.rights_evidence_ref !== 'string' || authority.rights_evidence_ref.length < 3 || authority.rights_evidence_ref.length > 2048 || /[\r\n]/.test(authority.rights_evidence_ref)) fail('PSA_RIGHTS_EVIDENCE_REF_INVALID');
    const authorizedAt = parseInstant(authority.authorized_at, 'PSA_SOURCE_AUTHORIZED_AT_INVALID');
    const expiresAt = parseInstant(authority.expires_at, 'PSA_SOURCE_AUTHORITY_EXPIRES_AT_INVALID');
    if (expiresAt <= authorizedAt) fail('PSA_SOURCE_AUTHORITY_WINDOW_INVALID');
    if (authority.status === 'ACTIVE') {
      if (authority.revoked_at !== null) fail('PSA_ACTIVE_SOURCE_AUTHORITY_REVOKED_AT_INVALID');
      activeCount += 1;
    } else {
      const revokedAt = parseInstant(authority.revoked_at, 'PSA_SOURCE_AUTHORITY_REVOKED_AT_INVALID');
      if (revokedAt < authorizedAt) fail('PSA_SOURCE_AUTHORITY_REVOKED_AT_INVALID');
    }
  }
  const expectedState = activeCount ? 'ACTIVE_SOURCE_AUTHORITIES_PRESENT' : 'NO_ACTIVE_SOURCE_AUTHORITIES';
  if (registry.state !== expectedState) fail('PSA_SOURCE_AUTHORITY_REGISTRY_STATE_INVALID');
  const canonicalErrors = validateCanonicalPsaSourceAuthorityRegistry(registry);
  if (canonicalErrors.length) fail(canonicalErrors.join(';'));
  return registry;
}

export function digestPsaSourceAuthorityEntry(authority) {
  assertExactObject(authority, AUTHORITY_KEYS, 'PSA_SOURCE_AUTHORITY_SCHEMA_INVALID');
  return sha256PsaCanonical(authority);
}

export function digestPsaSourceAuthorityRegistry(registry) {
  validatePsaSourceAuthorityRegistry(registry);
  return sha256PsaCanonical(registry);
}

export function assertPsaTrustAnchorSeparation(changedPaths) {
  if (!Array.isArray(changedPaths) || changedPaths.some(value => typeof value !== 'string')) fail('PSA_CHANGED_PATHS_INVALID');
  const normalized = new Set(changedPaths.map(value => value.replaceAll('\\', '/').replace(/^\.\//, '')));
  if (normalized.has(PSA_SOURCE_AUTHORITY_REGISTRY_PATH) && normalized.has(PSA_KNOWN_CERT_MANIFEST_PATH)) {
    fail('PSA_SOURCE_AUTHORITY_AND_MANIFEST_SAME_TRANSACTION_PROHIBITED');
  }
  return true;
}

function sourceReceiptPayload(entry, referenceKeyId) {
  return {
    admission_purpose: entry.admission_purpose,
    cert_reference_digest: entry.cert_reference_digest,
    collector_id: entry.collector_id,
    enumeration_method: 'NONE',
    non_enumeration_verified: true,
    receipt_type: 'KIDULTS_PSA_KNOWN_CERT_SOURCE_RECEIPT',
    reference_key_id: referenceKeyId,
    rights_basis_id: entry.rights_basis_id,
    schema_version: '2.0.0',
    source_authority_entry_digest: entry.source_authority_entry_digest,
    source_authority_id: entry.source_authority_id,
    source_bundle_token: entry.source_bundle_token,
    source_class: entry.source_class,
    source_observed_at: entry.source_observed_at,
    source_record_token: entry.source_record_token,
    synthetic: false,
  };
}

function assertManifestEntry(entry) {
  assertExactObject(entry, PSA_MANIFEST_ENTRY_KEYS, 'PSA_MANIFEST_ENTRY_SCHEMA_INVALID');
  if (!PSA_HMAC_TOKEN_PATTERN.test(String(entry.cert_reference_digest || ''))) fail('PSA_CERT_REFERENCE_TOKEN_INVALID');
  assertAuthorityId(entry.source_authority_id);
  if (!PSA_SHA256_DIGEST_PATTERN.test(String(entry.source_authority_entry_digest || ''))) fail('PSA_SOURCE_AUTHORITY_ENTRY_DIGEST_INVALID');
  if (!PSA_HMAC_TOKEN_PATTERN.test(String(entry.source_bundle_token || ''))) fail('PSA_SOURCE_BUNDLE_TOKEN_INVALID');
  if (!PSA_HMAC_TOKEN_PATTERN.test(String(entry.source_record_token || ''))) fail('PSA_SOURCE_RECORD_TOKEN_INVALID');
  if (!PSA_SHA256_DIGEST_PATTERN.test(String(entry.source_receipt_digest || ''))) fail('PSA_SOURCE_RECEIPT_DIGEST_INVALID');
  assertSourceClass(entry.source_class);
  assertCollector(entry.collector_id);
  if (entry.rights_basis_id !== REQUIRED_RIGHTS_BASIS || entry.admission_purpose !== REQUIRED_PURPOSE) fail('PSA_MANIFEST_ENTRY_RIGHTS_INVALID');
  parseInstant(entry.source_observed_at, 'PSA_SOURCE_OBSERVED_AT_INVALID');
  if (entry.non_enumeration_verified !== true || entry.enumeration_used !== false || entry.raw_cert_value_in_repository !== false || entry.empirical_admissible !== true) {
    fail('PSA_MANIFEST_ENTRY_BOUNDARY_INVALID');
  }
}

export function derivePsaManifestState(count, targetCount = PSA_MANIFEST_TARGET_COUNT) {
  if (!Number.isInteger(count) || count < 0) fail('PSA_MANIFEST_COUNT_INVALID');
  if (targetCount !== PSA_MANIFEST_TARGET_COUNT) fail('PSA_MANIFEST_TARGET_INVALID');
  if (count > targetCount) fail('PSA_MANIFEST_TARGET_EXCEEDED');
  return {
    state: count === targetCount ? 'MANIFEST_READY_RUNTIME_GATES_PENDING' : 'WAITING_FOR_PROVENANCE_BOUND_SOURCE_COMPLETION',
    provenance_bound_admissible_count: count,
    remaining_required: targetCount - count,
    live_acquisition: count === targetCount ? 'HOLD_UNTIL_RUNTIME_GATES' : 'HOLD_UNTIL_120_PROVENANCE_BOUND_ENTRIES',
  };
}

export function validatePsaKnownCertManifest(manifest, { authorityRegistry, asOf = new Date(), requireCompleteAuthorityGroups = true } = {}) {
  assertCanonicalPsaKnownCertManifest(manifest, { authorityRegistry, asOf });
  assertExactObject(manifest, MANIFEST_KEYS, 'PSA_MANIFEST_SCHEMA_INVALID');
  if (manifest.id !== 'KIDULTS_PSA_120_KNOWN_CERT_MANIFEST_V1' || manifest.target_count !== PSA_MANIFEST_TARGET_COUNT) fail('PSA_MANIFEST_ID_OR_TARGET_INVALID');
  if (!Number.isInteger(manifest.declared_known_count) || manifest.declared_known_count < 0) fail('PSA_DECLARED_KNOWN_COUNT_INVALID');
  if (manifest.cert_values_in_repository !== false) fail('PSA_RAW_CERT_REPOSITORY_BOUNDARY_INVALID');
  assertReferenceKeyId(manifest.reference_key_id);
  if (!Array.isArray(manifest.entries) || manifest.entries.length > PSA_MANIFEST_TARGET_COUNT) fail('PSA_MANIFEST_TARGET_EXCEEDED');
  assertExactObject(manifest.required_entry_contract, REQUIRED_ENTRY_CONTRACT_KEYS, 'PSA_MANIFEST_ENTRY_CONTRACT_SCHEMA_INVALID');
  assertExactObject(manifest.source_receipt_contract, SOURCE_RECEIPT_CONTRACT_KEYS, 'PSA_SOURCE_RECEIPT_CONTRACT_SCHEMA_INVALID');
  assertExactObject(manifest.rules, RULE_KEYS, 'PSA_MANIFEST_RULES_SCHEMA_INVALID');
  const derived = derivePsaManifestState(manifest.entries.length);
  for (const [key, value] of Object.entries(derived)) if (manifest[key] !== value) fail('PSA_MANIFEST_DERIVED_STATE_INVALID');
  if (manifest.production !== 'HOLD' || manifest.public !== 'HOLD' || manifest.g5 !== 'HOLD' || manifest.promotion_authority !== 'NONE') fail('PSA_MANIFEST_RELEASE_HOLD_INVALID');

  const certTokens = new Set();
  const recordTokens = new Set();
  const receiptDigests = new Set();
  const groups = new Map();
  for (const entry of manifest.entries) {
    assertManifestEntry(entry);
    if (certTokens.has(entry.cert_reference_digest)) fail('PSA_MANIFEST_CERT_REPLAY');
    if (recordTokens.has(entry.source_record_token)) fail('PSA_MANIFEST_SOURCE_RECORD_REPLAY');
    if (receiptDigests.has(entry.source_receipt_digest)) fail('PSA_MANIFEST_SOURCE_RECEIPT_REPLAY');
    certTokens.add(entry.cert_reference_digest);
    recordTokens.add(entry.source_record_token);
    receiptDigests.add(entry.source_receipt_digest);
    const expectedReceiptDigest = sha256PsaCanonical(sourceReceiptPayload(entry, manifest.reference_key_id));
    if (entry.source_receipt_digest !== expectedReceiptDigest) fail('PSA_SOURCE_RECEIPT_DIGEST_MISMATCH');
    const group = groups.get(entry.source_authority_id) || [];
    group.push(entry);
    groups.set(entry.source_authority_id, group);
  }

  if (authorityRegistry === undefined) {
    if (manifest.entries.length) fail('PSA_SOURCE_AUTHORITY_REGISTRY_REQUIRED');
    return manifest;
  }
  validatePsaSourceAuthorityRegistry(authorityRegistry);
  if (manifest.reference_key_id !== authorityRegistry.reference_key_id) fail('PSA_REFERENCE_KEY_ID_MISMATCH');
  const at = asOf instanceof Date ? new Date(asOf) : new Date(asOf);
  if (Number.isNaN(at.valueOf())) fail('PSA_INTAKE_AS_OF_INVALID');
  const authorityMap = new Map(authorityRegistry.authorities.map(authority => [authority.authority_id, authority]));
  for (const [authorityId, entries] of groups) {
    const authority = authorityMap.get(authorityId);
    if (!authority) fail('PSA_SOURCE_AUTHORITY_NOT_FOUND');
    if (authority.status !== 'ACTIVE' || authority.revoked_at !== null) fail('PSA_SOURCE_AUTHORITY_NOT_ACTIVE');
    if (at < new Date(authority.authorized_at) || at >= new Date(authority.expires_at)) fail('PSA_SOURCE_AUTHORITY_EXPIRED_OR_NOT_YET_ACTIVE');
    const authorityDigest = digestPsaSourceAuthorityEntry(authority);
    for (const entry of entries) {
      if (entry.source_authority_entry_digest !== authorityDigest || entry.source_bundle_token !== authority.source_bundle_token ||
          entry.source_class !== authority.source_class || entry.rights_basis_id !== authority.rights_basis_id ||
          entry.collector_id !== authority.collector_id || entry.admission_purpose !== authority.admission_purpose) {
        fail('PSA_MANIFEST_SOURCE_AUTHORITY_BINDING_MISMATCH');
      }
    }
    if (requireCompleteAuthorityGroups && entries.length !== authority.expected_record_count) fail('PSA_SOURCE_AUTHORITY_RECORD_COUNT_MISMATCH');
  }
  return manifest;
}

function prepareBatchTokens(batch, keyBase64, asOf) {
  validatePsaPrivateBatch(batch);
  const at = asOf instanceof Date ? new Date(asOf) : new Date(asOf);
  if (Number.isNaN(at.valueOf())) fail('PSA_INTAKE_AS_OF_INVALID');
  const records = batch.records.map(record => {
    const observedAt = parseInstant(record.source_observed_at, 'PSA_SOURCE_OBSERVED_AT_INVALID');
    if (observedAt > at) fail('PSA_SOURCE_OBSERVED_AT_FUTURE');
    const certReferenceDigest = createPsaCertReferenceToken({ keyBase64, certNumber: record.cert_number });
    const sourceRecordToken = createPsaSourceRecordToken({
      keyBase64,
      authorityId: batch.authority_id,
      certReferenceToken: certReferenceDigest,
      sourceRecordLocator: record.source_record_locator,
      sourceObservedAt: record.source_observed_at,
    });
    return { certReferenceDigest, sourceRecordToken, sourceObservedAt: record.source_observed_at };
  }).sort((left, right) => left.certReferenceDigest.localeCompare(right.certReferenceDigest));
  const sourceBundleToken = createPsaSourceBundleToken({
    keyBase64,
    authorityId: batch.authority_id,
    records: records.map(record => ({
      cert_reference_digest: record.certReferenceDigest,
      source_record_token: record.sourceRecordToken,
    })),
  });
  return { records, sourceBundleToken };
}

export function buildPsaSourceAuthorityProposal({ batch, keyBase64, asOf = new Date() }) {
  const prepared = prepareBatchTokens(batch, keyBase64, asOf);
  return {
    proposal_type: 'KIDULTS_PSA_SOURCE_AUTHORITY_BINDING_PROPOSAL_V1',
    state: 'PREAUTH_BINDING_ONLY_NOT_ADMISSIBLE',
    authority_id: batch.authority_id,
    reference_key_id: batch.reference_key_id,
    source_bundle_token: prepared.sourceBundleToken,
    expected_record_count: prepared.records.length,
    source_class: batch.source_class,
    rights_basis_id: batch.rights_basis_id,
    collector_id: batch.collector_id,
    admission_purpose: batch.admission_purpose,
    enumeration_method: batch.enumeration_method,
    non_enumeration_verified: batch.non_enumeration_verified,
    empirical_admissible_count: 0,
    authority_registry_entry_required: true,
    rights_evidence_digest_required: true,
    program_owner_approval_on_protected_main_required: true,
  };
}

export function intakePsaLawfulKnownCertBatch({
  batch,
  authorityRegistry,
  currentManifest,
  keyBase64,
  protectedBaseRegistryDigest,
  asOf = new Date(),
}) {
  validatePsaSourceAuthorityRegistry(authorityRegistry);
  if (!PSA_SHA256_DIGEST_PATTERN.test(String(protectedBaseRegistryDigest || '')) ||
      digestPsaSourceAuthorityRegistry(authorityRegistry) !== protectedBaseRegistryDigest) {
    fail('PSA_PROTECTED_BASE_REGISTRY_DIGEST_MISMATCH');
  }
  validatePsaKnownCertManifest(currentManifest, { authorityRegistry, asOf });
  if (batch.reference_key_id !== authorityRegistry.reference_key_id || batch.reference_key_id !== currentManifest.reference_key_id) fail('PSA_REFERENCE_KEY_ID_MISMATCH');
  const prepared = prepareBatchTokens(batch, keyBase64, asOf);
  const authority = authorityRegistry.authorities.find(candidate => candidate.authority_id === batch.authority_id);
  if (!authority) fail('PSA_SOURCE_AUTHORITY_NOT_FOUND');
  if (authority.status !== 'ACTIVE' || authority.revoked_at !== null) fail('PSA_SOURCE_AUTHORITY_NOT_ACTIVE');
  const at = asOf instanceof Date ? new Date(asOf) : new Date(asOf);
  if (at < new Date(authority.authorized_at) || at >= new Date(authority.expires_at)) fail('PSA_SOURCE_AUTHORITY_EXPIRED_OR_NOT_YET_ACTIVE');
  if (authority.reference_key_id !== batch.reference_key_id || authority.source_class !== batch.source_class ||
      authority.rights_basis_id !== batch.rights_basis_id || authority.collector_id !== batch.collector_id ||
      authority.admission_purpose !== batch.admission_purpose || authority.enumeration_method !== batch.enumeration_method ||
      authority.non_enumeration_verified !== batch.non_enumeration_verified) {
    fail('PSA_PRIVATE_BATCH_SOURCE_AUTHORITY_BINDING_MISMATCH');
  }
  if (authority.expected_record_count !== prepared.records.length) fail('PSA_SOURCE_AUTHORITY_RECORD_COUNT_MISMATCH');
  if (!equalPsaReferenceTokens(authority.source_bundle_token, prepared.sourceBundleToken)) fail('PSA_SOURCE_BUNDLE_TOKEN_MISMATCH');
  for (const record of prepared.records) {
    const observedAt = new Date(record.sourceObservedAt);
    if (observedAt < new Date(authority.authorized_at) || observedAt >= new Date(authority.expires_at)) {
      fail('PSA_SOURCE_OBSERVATION_OUTSIDE_AUTHORITY_WINDOW');
    }
  }
  if (currentManifest.entries.some(entry => entry.source_authority_id === authority.authority_id || entry.source_bundle_token === authority.source_bundle_token)) {
    fail('PSA_SOURCE_AUTHORITY_REPLAY');
  }
  if (currentManifest.entries.length + prepared.records.length > PSA_MANIFEST_TARGET_COUNT) fail('PSA_MANIFEST_TARGET_EXCEEDED');
  const existingCerts = new Set(currentManifest.entries.map(entry => entry.cert_reference_digest));
  const existingRecords = new Set(currentManifest.entries.map(entry => entry.source_record_token));
  const authorityDigest = digestPsaSourceAuthorityEntry(authority);
  const entries = prepared.records.map(record => {
    if (existingCerts.has(record.certReferenceDigest)) fail('PSA_MANIFEST_CERT_REPLAY');
    if (existingRecords.has(record.sourceRecordToken)) fail('PSA_MANIFEST_SOURCE_RECORD_REPLAY');
    const base = {
      cert_reference_digest: record.certReferenceDigest,
      source_authority_id: authority.authority_id,
      source_authority_entry_digest: authorityDigest,
      source_bundle_token: prepared.sourceBundleToken,
      source_record_token: record.sourceRecordToken,
      source_receipt_digest: '',
      source_class: authority.source_class,
      rights_basis_id: authority.rights_basis_id,
      collector_id: authority.collector_id,
      source_observed_at: record.sourceObservedAt,
      admission_purpose: authority.admission_purpose,
      non_enumeration_verified: true,
      enumeration_used: false,
      raw_cert_value_in_repository: false,
      empirical_admissible: true,
    };
    return { ...base, source_receipt_digest: sha256PsaCanonical(sourceReceiptPayload(base, currentManifest.reference_key_id)) };
  });
  const mergedEntries = [...currentManifest.entries, ...entries]
    .sort((left, right) => left.cert_reference_digest.localeCompare(right.cert_reference_digest));
  const candidateManifest = {
    ...currentManifest,
    ...derivePsaManifestState(mergedEntries.length),
    entries: mergedEntries,
  };
  validatePsaKnownCertManifest(candidateManifest, { authorityRegistry, asOf });
  return {
    manifest: candidateManifest,
    receipt: {
      receipt_type: 'KIDULTS_PSA_LAWFUL_BATCH_INTAKE_RECEIPT_V1',
      state: 'VERIFIED_PROVENANCE_BOUND_PREVIEW',
      source_authority_id: authority.authority_id,
      source_authority_entry_digest: authorityDigest,
      source_bundle_token: prepared.sourceBundleToken,
      admitted_count: entries.length,
      resulting_admissible_count: mergedEntries.length,
      remaining_required: PSA_MANIFEST_TARGET_COUNT - mergedEntries.length,
      candidate_manifest_digest: sha256PsaCanonical(candidateManifest),
      raw_cert_value_in_output: false,
      raw_source_record_in_output: false,
      provider_call_performed: false,
    },
  };
}

export function buildPsaAdmissionPreviewOutput(result) {
  if (!isPlainObject(result) || !isPlainObject(result.receipt) || !isPlainObject(result.manifest)) {
    fail('PSA_ADMISSION_PREVIEW_RESULT_INVALID');
  }
  if (result.receipt.state !== 'VERIFIED_PROVENANCE_BOUND_PREVIEW') fail('PSA_ADMISSION_PREVIEW_RECEIPT_INVALID');
  return {
    action: 'ADMISSION_PREVIEW',
    receipt: result.receipt,
    candidate_manifest: result.manifest,
  };
}

function modeBits(stat) {
  return stat.mode & 0o777;
}

function isPathWithin(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function assertNoSymlinkComponents(rootRealPath, candidatePath) {
  const relative = path.relative(rootRealPath, candidatePath);
  let cursor = rootRealPath;
  for (const component of relative.split(path.sep)) {
    cursor = path.join(cursor, component);
    if (fs.lstatSync(cursor).isSymbolicLink()) fail('PSA_PRIVATE_BATCH_SYMLINK_PROHIBITED');
  }
}

export function readPsaPrivateBatchFile({ privateRoot, batchRelativePath, repositoryRoot = process.cwd(), maxBytes = PSA_PRIVATE_BATCH_MAX_BYTES }) {
  if (typeof privateRoot !== 'string' || !privateRoot || typeof batchRelativePath !== 'string' || !batchRelativePath || path.isAbsolute(batchRelativePath)) {
    fail('PSA_PRIVATE_BATCH_PATH_INVALID');
  }
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > PSA_PRIVATE_BATCH_MAX_BYTES) fail('PSA_PRIVATE_BATCH_SIZE_LIMIT_INVALID');
  const rootLstat = fs.lstatSync(privateRoot);
  if (rootLstat.isSymbolicLink() || !rootLstat.isDirectory()) fail('PSA_PRIVATE_ROOT_INVALID');
  if (modeBits(rootLstat) !== 0o700) fail('PSA_PRIVATE_ROOT_MODE_INVALID');
  const rootRealPath = fs.realpathSync(privateRoot);
  const repositoryRealPath = fs.realpathSync(repositoryRoot);
  if (rootRealPath === repositoryRealPath || isPathWithin(rootRealPath, repositoryRealPath) || isPathWithin(repositoryRealPath, rootRealPath)) {
    fail('PSA_PRIVATE_ROOT_REPOSITORY_OVERLAP');
  }
  const candidatePath = path.resolve(rootRealPath, batchRelativePath);
  if (!isPathWithin(candidatePath, rootRealPath)) fail('PSA_PRIVATE_BATCH_PATH_ESCAPE');
  assertNoSymlinkComponents(rootRealPath, candidatePath);
  const candidateRealPath = fs.realpathSync(candidatePath);
  if (!isPathWithin(candidateRealPath, rootRealPath)) fail('PSA_PRIVATE_BATCH_PATH_ESCAPE');
  const before = fs.lstatSync(candidatePath);
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1) fail('PSA_PRIVATE_BATCH_FILE_INVALID');
  if (modeBits(before) !== 0o600) fail('PSA_PRIVATE_BATCH_MODE_INVALID');
  const descriptor = fs.openSync(candidatePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || modeBits(opened) !== 0o600 || opened.dev !== before.dev || opened.ino !== before.ino) fail('PSA_PRIVATE_BATCH_FILE_RACE');
    if (opened.size < 2 || opened.size > maxBytes) fail('PSA_PRIVATE_BATCH_SIZE_INVALID');
    const bytes = Buffer.alloc(opened.size);
    const count = fs.readSync(descriptor, bytes, 0, bytes.length, 0);
    if (count !== bytes.length) fail('PSA_PRIVATE_BATCH_READ_INCOMPLETE');
    let parsed;
    try { parsed = JSON.parse(bytes.toString('utf8')); } catch { fail('PSA_PRIVATE_BATCH_JSON_INVALID'); }
    bytes.fill(0);
    return validatePsaPrivateBatch(parsed);
  } finally {
    fs.closeSync(descriptor);
  }
}

function sha256Bytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function readJsonFileStrict(filePath, code) {
  let bytes;
  try { bytes = fs.readFileSync(filePath); } catch { fail(code); }
  try { return { value: JSON.parse(bytes.toString('utf8')), bytes }; } catch { fail(code); }
}

export function writePsaManifestAtomicCas({ manifestPath, candidateManifest, expectedManifestDigest }) {
  if (!PSA_SHA256_DIGEST_PATTERN.test(String(expectedManifestDigest || ''))) fail('PSA_EXPECTED_MANIFEST_DIGEST_REQUIRED');
  const absolutePath = path.resolve(manifestPath);
  const directory = path.dirname(absolutePath);
  const basename = path.basename(absolutePath);
  const lockPath = path.join(directory, `.${basename}.intake.lock`);
  const tempPath = path.join(directory, `.${basename}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
  let lockDescriptor;
  try {
    lockDescriptor = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  } catch { fail('PSA_MANIFEST_WRITE_LOCKED'); }
  try {
    const current = fs.readFileSync(absolutePath);
    if (sha256Bytes(current) !== expectedManifestDigest) fail('PSA_MANIFEST_CAS_MISMATCH');
    const serialized = `${JSON.stringify(candidateManifest, null, 2)}\n`;
    const descriptor = fs.openSync(tempPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
    try {
      fs.writeFileSync(descriptor, serialized, 'utf8');
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.chmodSync(tempPath, 0o644);
    fs.renameSync(tempPath, absolutePath);
    const directoryDescriptor = fs.openSync(directory, fs.constants.O_RDONLY);
    try { fs.fsyncSync(directoryDescriptor); } finally { fs.closeSync(directoryDescriptor); }
    return sha256Bytes(Buffer.from(serialized, 'utf8'));
  } finally {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* best-effort cleanup */ }
    try { if (lockDescriptor !== undefined) fs.closeSync(lockDescriptor); } catch { /* already closed */ }
    try { fs.unlinkSync(lockPath); } catch { /* best-effort cleanup */ }
  }
}

function main() {
  const action = String(process.env.PSA_LAWFUL_INTAKE_ACTION || 'ADMISSION_PREVIEW');
  if (!new Set(['PREAUTH_PREVIEW', 'ADMISSION_PREVIEW', 'ADMISSION_WRITE']).has(action)) fail('PSA_LAWFUL_INTAKE_ACTION_INVALID');
  const batch = readPsaPrivateBatchFile({
    privateRoot: String(process.env.PSA_PRIVATE_INTAKE_ROOT || ''),
    batchRelativePath: String(process.env.PSA_PRIVATE_BATCH_RELATIVE_PATH || ''),
    repositoryRoot: process.cwd(),
  });
  const keyBase64 = String(process.env.PSA_CERT_REFERENCE_KEY_B64 || '');
  const asOf = process.env.PSA_INTAKE_AS_OF ? new Date(process.env.PSA_INTAKE_AS_OF) : new Date();
  if (action === 'PREAUTH_PREVIEW') {
    process.stdout.write(`${JSON.stringify(buildPsaSourceAuthorityProposal({ batch, keyBase64, asOf }), null, 2)}\n`);
    return;
  }
  const registryPath = PSA_SOURCE_AUTHORITY_REGISTRY_PATH;
  const manifestPath = PSA_KNOWN_CERT_MANIFEST_PATH;
  const registry = readJsonFileStrict(registryPath, 'PSA_SOURCE_AUTHORITY_REGISTRY_READ_INVALID').value;
  const manifestRead = readJsonFileStrict(manifestPath, 'PSA_MANIFEST_READ_INVALID');
  const result = intakePsaLawfulKnownCertBatch({
    batch,
    authorityRegistry: registry,
    currentManifest: manifestRead.value,
    keyBase64,
    protectedBaseRegistryDigest: String(process.env.PSA_PROTECTED_BASE_REGISTRY_DIGEST || ''),
    asOf,
  });
  if (action === 'ADMISSION_WRITE') {
    const writtenDigest = writePsaManifestAtomicCas({
      manifestPath,
      candidateManifest: result.manifest,
      expectedManifestDigest: String(process.env.PSA_EXPECTED_MANIFEST_DIGEST || ''),
    });
    result.receipt.state = 'VERIFIED_PROVENANCE_BOUND_WRITTEN';
    result.receipt.written_manifest_digest = writtenDigest;
    process.stdout.write(`${JSON.stringify(result.receipt, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(buildPsaAdmissionPreviewOutput(result), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    process.stderr.write(`${error?.code || 'PSA_LAWFUL_INTAKE_FAILED'}\n`);
    process.exitCode = 1;
  }
}
