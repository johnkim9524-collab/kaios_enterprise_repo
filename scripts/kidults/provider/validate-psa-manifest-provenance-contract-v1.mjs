#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256PsaCanonical } from '../../../services/kidults-control-plane/src/psa-reference-token.mjs';

export const PSA_MANIFEST_PATH = 'coordination/kidults/provider/psa-120-known-cert-manifest-v1.json';
export const PSA_SOURCE_AUTHORITY_REGISTRY_PATH = 'coordination/kidults/provider/psa-source-authority-registry-v1.json';
export const PSA_MANIFEST_TARGET = 120;
export const PSA_WAITING_STATE = 'WAITING_FOR_PROVENANCE_BOUND_SOURCE_COMPLETION';
export const PSA_READY_STATE = 'MANIFEST_READY_RUNTIME_GATES_PENDING';
export const PSA_WAITING_LIVE_STATE = 'HOLD_UNTIL_120_PROVENANCE_BOUND_ENTRIES';
export const PSA_READY_LIVE_STATE = 'HOLD_UNTIL_RUNTIME_GATES';

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const HMAC_SHA256_V1_PATTERN = /^hmac-sha256:v1:[0-9a-f]{64}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SOURCE_AUTHORITY_ID_PATTERN = /^PSA_SOURCE_AUTHORITY_[A-Z0-9][A-Z0-9_-]{2,63}$/;

const MANIFEST_KEYS = [
  'cert_values_in_repository',
  'declared_known_count',
  'entries',
  'g5',
  'id',
  'live_acquisition',
  'production',
  'promotion_authority',
  'provenance_bound_admissible_count',
  'public',
  'reference_key_id',
  'remaining_required',
  'required_entry_contract',
  'rules',
  'source_receipt_contract',
  'state',
  'target_count',
  'truth_boundary'
];

const REGISTRY_KEYS = ['authorities', 'id', 'reference_key_id', 'schema_version', 'state'];
const AUTHORITY_KEYS = [
  'admission_purpose',
  'authority_id',
  'authorized_at',
  'collector_id',
  'enumeration_method',
  'expected_record_count',
  'expires_at',
  'non_enumeration_verified',
  'reference_key_id',
  'revoked_at',
  'rights_basis_id',
  'rights_evidence_digest',
  'rights_evidence_ref',
  'source_bundle_token',
  'source_class',
  'status'
];

export const PSA_ENTRY_KEYS = [
  'admission_purpose',
  'cert_reference_digest',
  'collector_id',
  'empirical_admissible',
  'enumeration_used',
  'non_enumeration_verified',
  'raw_cert_value_in_repository',
  'rights_basis_id',
  'source_authority_entry_digest',
  'source_authority_id',
  'source_bundle_token',
  'source_class',
  'source_observed_at',
  'source_receipt_digest',
  'source_record_token'
];

const REQUIRED_ENTRY_CONTRACT = {
  cert_reference_digest: 'hmac-sha256:v1:<64hex>',
  source_authority_id: 'governed active source authority id',
  source_authority_entry_digest: 'sha256:<64hex> of canonical authority entry including rights_evidence_digest',
  source_bundle_token: 'hmac-sha256:v1:<64hex>',
  source_record_token: 'hmac-sha256:v1:<64hex>',
  source_receipt_digest: 'sha256:<64hex>',
  source_class: 'PROGRAM_OWNER_KNOWN_CERT_RECORD|RIGHTS_CLEAR_PRIVATE_SOURCE_RECORD',
  rights_basis_id: 'PSA_BOUNDED_PRIVATE_EVALUATION_2026_08_24',
  collector_id: 'PROGRAM_OWNER|KPMO_AUTHORIZED_OPERATOR',
  source_observed_at: 'ISO-8601 required',
  admission_purpose: 'PRIVATE_ER_EVALUATION_ONLY',
  non_enumeration_verified: true,
  enumeration_used: false,
  raw_cert_value_in_repository: false,
  empirical_admissible: true
};

const SOURCE_RECEIPT_CONTRACT = {
  schema_version: '2.0.0',
  receipt_type: 'KIDULTS_PSA_KNOWN_CERT_SOURCE_RECEIPT',
  synthetic: false,
  enumeration_method: 'NONE',
  source_authority_registry_binding_required: true,
  exact_cert_to_source_record_binding_required: true,
  self_asserted_provenance_rejected: true
};

const MANIFEST_RULES = {
  bulk_enumeration: 'PROHIBITED',
  brute_force_discovery: 'PROHIBITED',
  synthetic_or_guessed_identifiers: 'PROHIBITED',
  duplicates: 'PROHIBITED',
  exact_120_provenance_bound_entries_required_before_live_wave: true,
  provider_daily_limit: 100,
  minimum_execution_waves: 2
};

const TRUTH_BOUNDARY = 'DECLARED_KNOWN_COUNT_IS_NOT_ADMISSIBLE_PROGRESS. ONLY MACHINE-VALIDATED, AUTHORITY-BOUND SOURCE RECORDS WITH EXACT CERT HMAC BINDING COUNT TOWARD 120. REGISTRY METADATA AND RIGHTS EVIDENCE DIGESTS DO NOT ALONE PROVE LAWFULNESS; EACH ACTUAL SOURCE AUTHORITY REQUIRES EXPLICIT PROGRAM OWNER APPROVAL ON PROTECTED MAIN.';

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const sortedKeys = value => isObject(value) ? Object.keys(value).sort() : [];
const sameKeys = (value, expected) => JSON.stringify(sortedKeys(value)) === JSON.stringify([...expected].sort());
const sameExactObject = (value, expected) => isObject(value)
  && sameKeys(value, Object.keys(expected))
  && Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue);

function isCanonicalUtc(value) {
  if (typeof value !== 'string' || !ISO_UTC_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

export function validatePsaSourceAuthorityRegistry(registry) {
  const errors = [];
  if (!isObject(registry)) return ['PSA_SOURCE_AUTHORITY_REGISTRY_ROOT_INVALID'];
  if (!sameKeys(registry, REGISTRY_KEYS)) errors.push('PSA_SOURCE_AUTHORITY_REGISTRY_SCHEMA_KEYS_INVALID');
  if (registry.id !== 'KIDULTS_PSA_SOURCE_AUTHORITY_REGISTRY_V1') errors.push('PSA_SOURCE_AUTHORITY_REGISTRY_ID_INVALID');
  if (registry.schema_version !== '1.0.0') errors.push('PSA_SOURCE_AUTHORITY_REGISTRY_VERSION_INVALID');
  if (registry.reference_key_id !== 'PSA_CERT_REFERENCE_KEY_V1') errors.push('PSA_SOURCE_AUTHORITY_REGISTRY_KEY_ID_INVALID');
  if (!Array.isArray(registry.authorities)) errors.push('PSA_SOURCE_AUTHORITY_REGISTRY_AUTHORITIES_REQUIRED');

  const authorities = Array.isArray(registry.authorities) ? registry.authorities : [];
  if (authorities.length > PSA_MANIFEST_TARGET) errors.push('PSA_SOURCE_AUTHORITY_REGISTRY_OVER_TARGET');
  const seenAuthorityIds = new Set();
  const seenBundleTokens = new Set();
  let activeCount = 0;
  for (const [index, authority] of authorities.entries()) {
    const prefix = `PSA_SOURCE_AUTHORITY_${index}`;
    if (!isObject(authority)) {
      errors.push(`${prefix}_INVALID`);
      continue;
    }
    if (!sameKeys(authority, AUTHORITY_KEYS)) errors.push(`${prefix}_SCHEMA_KEYS_INVALID`);
    if (!SOURCE_AUTHORITY_ID_PATTERN.test(String(authority.authority_id || ''))) {
      errors.push(`${prefix}_ID_INVALID`);
    } else if (seenAuthorityIds.has(authority.authority_id)) {
      errors.push(`${prefix}_DUPLICATE_ID`);
    } else {
      seenAuthorityIds.add(authority.authority_id);
    }
    if (!['ACTIVE', 'REVOKED'].includes(authority.status)) errors.push(`${prefix}_STATUS_INVALID`);
    if (authority.status === 'ACTIVE') activeCount += 1;
    if (authority.reference_key_id !== registry.reference_key_id) errors.push(`${prefix}_KEY_ID_INVALID`);
    if (!['PROGRAM_OWNER_KNOWN_CERT_RECORD', 'RIGHTS_CLEAR_PRIVATE_SOURCE_RECORD'].includes(authority.source_class)) errors.push(`${prefix}_SOURCE_CLASS_INVALID`);
    if (!HMAC_SHA256_V1_PATTERN.test(String(authority.source_bundle_token || ''))) {
      errors.push(`${prefix}_SOURCE_BUNDLE_TOKEN_INVALID`);
    } else if (seenBundleTokens.has(authority.source_bundle_token)) {
      errors.push(`${prefix}_DUPLICATE_SOURCE_BUNDLE_TOKEN`);
    } else {
      seenBundleTokens.add(authority.source_bundle_token);
    }
    if (!Number.isSafeInteger(authority.expected_record_count) || authority.expected_record_count < 1 || authority.expected_record_count > PSA_MANIFEST_TARGET) errors.push(`${prefix}_EXPECTED_RECORD_COUNT_INVALID`);
    if (authority.rights_basis_id !== 'PSA_BOUNDED_PRIVATE_EVALUATION_2026_08_24') errors.push(`${prefix}_RIGHTS_BASIS_INVALID`);
    if (!SHA256_PATTERN.test(String(authority.rights_evidence_digest || ''))) errors.push(`${prefix}_RIGHTS_EVIDENCE_DIGEST_INVALID`);
    if (typeof authority.rights_evidence_ref !== 'string' || authority.rights_evidence_ref.length < 3 || authority.rights_evidence_ref.length > 2048 || /[\r\n]/.test(authority.rights_evidence_ref)) errors.push(`${prefix}_RIGHTS_EVIDENCE_REF_INVALID`);
    if (!['PROGRAM_OWNER', 'KPMO_AUTHORIZED_OPERATOR'].includes(authority.collector_id)) errors.push(`${prefix}_COLLECTOR_INVALID`);
    if (authority.admission_purpose !== 'PRIVATE_ER_EVALUATION_ONLY') errors.push(`${prefix}_PURPOSE_INVALID`);
    if (authority.enumeration_method !== 'NONE' || authority.non_enumeration_verified !== true) errors.push(`${prefix}_NON_ENUMERATION_INVALID`);
    if (!isCanonicalUtc(authority.authorized_at)) errors.push(`${prefix}_AUTHORIZED_AT_INVALID`);
    if (!isCanonicalUtc(authority.expires_at)) errors.push(`${prefix}_EXPIRES_AT_INVALID`);
    if (isCanonicalUtc(authority.authorized_at) && isCanonicalUtc(authority.expires_at)
      && Date.parse(authority.authorized_at) >= Date.parse(authority.expires_at)) errors.push(`${prefix}_AUTHORIZATION_WINDOW_INVALID`);
    if (authority.status === 'ACTIVE' && authority.revoked_at !== null) errors.push(`${prefix}_ACTIVE_REVOCATION_INVALID`);
    if (authority.status === 'REVOKED' && !isCanonicalUtc(authority.revoked_at)) errors.push(`${prefix}_REVOKED_AT_INVALID`);
    if (isCanonicalUtc(authority.authorized_at) && isCanonicalUtc(authority.revoked_at)
      && Date.parse(authority.revoked_at) < Date.parse(authority.authorized_at)) errors.push(`${prefix}_REVOCATION_WINDOW_INVALID`);
  }

  const expectedState = activeCount > 0 ? 'ACTIVE_SOURCE_AUTHORITIES_PRESENT' : 'NO_ACTIVE_SOURCE_AUTHORITIES';
  if (registry.state !== expectedState) errors.push('PSA_SOURCE_AUTHORITY_REGISTRY_STATE_INVALID');
  return errors;
}

export function validatePsaManifestAuthorityPreexistence(manifest, protectedBaseRegistry) {
  const errors = [];
  if (!isObject(manifest) || !Array.isArray(manifest.entries)) return ['PSA_MANIFEST_PREEXISTENCE_MANIFEST_INVALID'];
  const registryErrors = validatePsaSourceAuthorityRegistry(protectedBaseRegistry);
  if (registryErrors.length) return registryErrors.map(code => `PSA_MANIFEST_PROTECTED_BASE_${code}`);
  const baseAuthorities = new Map(protectedBaseRegistry.authorities.map(authority => [authority.authority_id, authority]));
  for (const [index, entry] of manifest.entries.entries()) {
    if (!isObject(entry)) continue;
    const authority = baseAuthorities.get(entry.source_authority_id);
    if (!authority) {
      errors.push(`PSA_MANIFEST_ENTRY_${index}_SOURCE_AUTHORITY_NOT_PREEXISTING_PROTECTED_BASE`);
      continue;
    }
    if (entry.source_authority_entry_digest !== sha256PsaCanonical(authority)) {
      errors.push(`PSA_MANIFEST_ENTRY_${index}_SOURCE_AUTHORITY_PROTECTED_BASE_DIGEST_MISMATCH`);
    }
  }
  return errors;
}

export function validatePsaAuthorityManifestChangeSeparation({
  manifest,
  authorityRegistry,
  protectedBaseManifest,
  protectedBaseRegistry
}) {
  if (!isObject(manifest) || !Array.isArray(manifest.entries)
    || !isObject(protectedBaseManifest) || !Array.isArray(protectedBaseManifest.entries)) {
    return ['PSA_AUTHORITY_MANIFEST_SEPARATION_MANIFEST_INVALID'];
  }
  if (!isObject(authorityRegistry) || !isObject(protectedBaseRegistry)) {
    return ['PSA_AUTHORITY_MANIFEST_SEPARATION_REGISTRY_INVALID'];
  }
  const registryChanged = sha256PsaCanonical(authorityRegistry) !== sha256PsaCanonical(protectedBaseRegistry);
  const manifestEntriesChanged = sha256PsaCanonical(manifest.entries) !== sha256PsaCanonical(protectedBaseManifest.entries);
  return registryChanged && manifestEntriesChanged
    ? ['PSA_SOURCE_AUTHORITY_AND_MANIFEST_ENTRIES_SAME_CHANGE_PROHIBITED']
    : [];
}

function validateEntry(entry, index, seenCertReferences, seenSourceRecords, seenSourceReceipts) {
  const errors = [];
  const prefix = `PSA_MANIFEST_ENTRY_${index}`;
  if (!isObject(entry)) return [`${prefix}_INVALID`];
  if (!sameKeys(entry, PSA_ENTRY_KEYS)) errors.push(`${prefix}_SCHEMA_KEYS_INVALID`);

  if (!HMAC_SHA256_V1_PATTERN.test(String(entry.cert_reference_digest || ''))) {
    errors.push(`${prefix}_CERT_REFERENCE_HMAC_INVALID`);
  } else if (seenCertReferences.has(entry.cert_reference_digest)) {
    errors.push(`${prefix}_DUPLICATE_CERT_REFERENCE`);
  } else {
    seenCertReferences.add(entry.cert_reference_digest);
  }

  if (typeof entry.source_authority_id !== 'string' || !SOURCE_AUTHORITY_ID_PATTERN.test(entry.source_authority_id)) {
    errors.push(`${prefix}_SOURCE_AUTHORITY_ID_INVALID`);
  }
  if (!SHA256_PATTERN.test(String(entry.source_authority_entry_digest || ''))) errors.push(`${prefix}_SOURCE_AUTHORITY_ENTRY_DIGEST_INVALID`);
  if (!HMAC_SHA256_V1_PATTERN.test(String(entry.source_bundle_token || ''))) errors.push(`${prefix}_SOURCE_BUNDLE_TOKEN_INVALID`);
  if (!HMAC_SHA256_V1_PATTERN.test(String(entry.source_record_token || ''))) {
    errors.push(`${prefix}_SOURCE_RECORD_TOKEN_INVALID`);
  } else if (seenSourceRecords.has(entry.source_record_token)) {
    errors.push(`${prefix}_DUPLICATE_SOURCE_RECORD_TOKEN`);
  } else {
    seenSourceRecords.add(entry.source_record_token);
  }
  if (!SHA256_PATTERN.test(String(entry.source_receipt_digest || ''))) {
    errors.push(`${prefix}_SOURCE_RECEIPT_DIGEST_INVALID`);
  } else if (seenSourceReceipts.has(entry.source_receipt_digest)) {
    errors.push(`${prefix}_DUPLICATE_SOURCE_RECEIPT_DIGEST`);
  } else {
    seenSourceReceipts.add(entry.source_receipt_digest);
  }
  if (!['PROGRAM_OWNER_KNOWN_CERT_RECORD', 'RIGHTS_CLEAR_PRIVATE_SOURCE_RECORD'].includes(entry.source_class)) errors.push(`${prefix}_SOURCE_CLASS_INVALID`);
  if (entry.rights_basis_id !== 'PSA_BOUNDED_PRIVATE_EVALUATION_2026_08_24') errors.push(`${prefix}_RIGHTS_BASIS_INVALID`);
  if (!['PROGRAM_OWNER', 'KPMO_AUTHORIZED_OPERATOR'].includes(entry.collector_id)) errors.push(`${prefix}_COLLECTOR_INVALID`);
  if (!isCanonicalUtc(entry.source_observed_at)) errors.push(`${prefix}_OBSERVED_AT_INVALID`);
  if (entry.admission_purpose !== 'PRIVATE_ER_EVALUATION_ONLY') errors.push(`${prefix}_PURPOSE_INVALID`);
  if (entry.non_enumeration_verified !== true) errors.push(`${prefix}_NON_ENUMERATION_INVALID`);
  if (entry.enumeration_used !== false) errors.push(`${prefix}_ENUMERATION_INVALID`);
  if (entry.raw_cert_value_in_repository !== false) errors.push(`${prefix}_RAW_CERT_BOUNDARY_INVALID`);
  if (entry.empirical_admissible !== true) errors.push(`${prefix}_EMPIRICAL_ADMISSIBILITY_INVALID`);
  return errors;
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
    synthetic: false
  };
}

export function validatePsaKnownCertManifest(manifest, { authorityRegistry, asOf = new Date() } = {}) {
  const errors = [];
  if (!isObject(manifest)) return ['PSA_MANIFEST_ROOT_INVALID'];
  if (!sameKeys(manifest, MANIFEST_KEYS)) errors.push('PSA_MANIFEST_ROOT_SCHEMA_KEYS_INVALID');
  if (manifest.id !== 'KIDULTS_PSA_120_KNOWN_CERT_MANIFEST_V1') errors.push('PSA_MANIFEST_ID_INVALID');
  if (manifest.target_count !== PSA_MANIFEST_TARGET) errors.push('PSA_MANIFEST_TARGET_INVALID');
  if (!Number.isSafeInteger(manifest.declared_known_count) || manifest.declared_known_count < 0) errors.push('PSA_MANIFEST_DECLARED_COUNT_INVALID');
  if (manifest.reference_key_id !== 'PSA_CERT_REFERENCE_KEY_V1') errors.push('PSA_MANIFEST_REFERENCE_KEY_ID_INVALID');
  if (manifest.cert_values_in_repository !== false) errors.push('PSA_MANIFEST_RAW_CERT_PERSISTENCE_BOUNDARY_INVALID');
  if (!Array.isArray(manifest.entries)) errors.push('PSA_MANIFEST_ENTRIES_REQUIRED');

  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  if (entries.length > PSA_MANIFEST_TARGET) errors.push('PSA_MANIFEST_OVER_TARGET');
  if (manifest.provenance_bound_admissible_count !== entries.length) errors.push('PSA_MANIFEST_ADMISSIBLE_COUNT_MISMATCH');
  if (manifest.remaining_required !== PSA_MANIFEST_TARGET - entries.length) errors.push('PSA_MANIFEST_REMAINING_COUNT_MISMATCH');

  const seenCertReferences = new Set();
  const seenSourceRecords = new Set();
  const seenSourceReceipts = new Set();
  entries.forEach((entry, index) => {
    errors.push(...validateEntry(entry, index, seenCertReferences, seenSourceRecords, seenSourceReceipts));
    if (isObject(entry) && PSA_ENTRY_KEYS.every(key => Object.prototype.hasOwnProperty.call(entry, key))) {
      try {
        const expectedReceiptDigest = sha256PsaCanonical(sourceReceiptPayload(entry, manifest.reference_key_id));
        if (entry.source_receipt_digest !== expectedReceiptDigest) errors.push(`PSA_MANIFEST_ENTRY_${index}_SOURCE_RECEIPT_DIGEST_MISMATCH`);
      } catch {
        errors.push(`PSA_MANIFEST_ENTRY_${index}_SOURCE_RECEIPT_DIGEST_MISMATCH`);
      }
    }
  });

  const ready = entries.length === PSA_MANIFEST_TARGET;
  const expectedState = ready ? PSA_READY_STATE : PSA_WAITING_STATE;
  const expectedLiveState = ready ? PSA_READY_LIVE_STATE : PSA_WAITING_LIVE_STATE;
  if (manifest.state !== expectedState) errors.push(ready ? 'PSA_MANIFEST_READY_STATE_MISMATCH' : 'PSA_MANIFEST_INCOMPLETE_STATE_MISMATCH');
  if (manifest.live_acquisition !== expectedLiveState) errors.push(ready ? 'PSA_MANIFEST_READY_LIVE_STATE_MISMATCH' : 'PSA_MANIFEST_INCOMPLETE_LIVE_STATE_MISMATCH');

  if (!sameExactObject(manifest.required_entry_contract, REQUIRED_ENTRY_CONTRACT)) errors.push('PSA_MANIFEST_ENTRY_CONTRACT_INVALID');
  if (!sameExactObject(manifest.source_receipt_contract, SOURCE_RECEIPT_CONTRACT)) errors.push('PSA_MANIFEST_SOURCE_RECEIPT_CONTRACT_INVALID');
  if (!sameExactObject(manifest.rules, MANIFEST_RULES)) errors.push('PSA_MANIFEST_RULES_INVALID');
  if (manifest.truth_boundary !== TRUTH_BOUNDARY) errors.push('PSA_MANIFEST_TRUTH_BOUNDARY_INVALID');
  if (manifest.promotion_authority !== 'NONE') errors.push('PSA_MANIFEST_PROMOTION_AUTHORITY_INVALID');
  if (manifest.production !== 'HOLD' || manifest.public !== 'HOLD' || manifest.g5 !== 'HOLD') errors.push('PSA_MANIFEST_RELEASE_HOLD_INVALID');

  if (!authorityRegistry) {
    errors.push('PSA_MANIFEST_AUTHORITY_REGISTRY_REQUIRED');
    return errors;
  }
  errors.push(...validatePsaSourceAuthorityRegistry(authorityRegistry));
  if (!isObject(authorityRegistry) || !Array.isArray(authorityRegistry.authorities)) return errors;
  if (manifest.reference_key_id !== authorityRegistry.reference_key_id) errors.push('PSA_MANIFEST_AUTHORITY_REGISTRY_KEY_ID_MISMATCH');

  const asOfDate = asOf instanceof Date ? new Date(asOf.valueOf()) : new Date(asOf);
  if (Number.isNaN(asOfDate.valueOf())) {
    errors.push('PSA_MANIFEST_AUTHORITY_AS_OF_INVALID');
    return errors;
  }
  const authoritiesById = new Map(authorityRegistry.authorities
    .filter(isObject)
    .map(authority => [authority.authority_id, authority]));
  const manifestCountByAuthority = new Map();
  for (const [index, entry] of entries.entries()) {
    if (!isObject(entry)) continue;
    const prefix = `PSA_MANIFEST_ENTRY_${index}`;
    const authority = authoritiesById.get(entry.source_authority_id);
    if (!authority) {
      errors.push(`${prefix}_SOURCE_AUTHORITY_NOT_FOUND`);
      continue;
    }
    manifestCountByAuthority.set(authority.authority_id, (manifestCountByAuthority.get(authority.authority_id) || 0) + 1);
    if (authority.status !== 'ACTIVE' || authority.revoked_at !== null) errors.push(`${prefix}_SOURCE_AUTHORITY_NOT_ACTIVE`);
    if (entry.source_authority_entry_digest !== sha256PsaCanonical(authority)) errors.push(`${prefix}_SOURCE_AUTHORITY_ENTRY_DIGEST_MISMATCH`);
    if (entry.source_bundle_token !== authority.source_bundle_token) errors.push(`${prefix}_SOURCE_BUNDLE_AUTHORITY_MISMATCH`);
    if (manifest.reference_key_id !== authority.reference_key_id) errors.push(`${prefix}_REFERENCE_KEY_ID_AUTHORITY_MISMATCH`);
    if (entry.source_class !== authority.source_class) errors.push(`${prefix}_SOURCE_CLASS_AUTHORITY_MISMATCH`);
    if (entry.rights_basis_id !== authority.rights_basis_id) errors.push(`${prefix}_RIGHTS_BASIS_AUTHORITY_MISMATCH`);
    if (entry.collector_id !== authority.collector_id) errors.push(`${prefix}_COLLECTOR_AUTHORITY_MISMATCH`);
    if (entry.admission_purpose !== authority.admission_purpose) errors.push(`${prefix}_PURPOSE_AUTHORITY_MISMATCH`);
    const authorizedAt = Date.parse(String(authority.authorized_at || ''));
    const expiresAt = Date.parse(String(authority.expires_at || ''));
    const observedAt = Date.parse(String(entry.source_observed_at || ''));
    if (!Number.isFinite(authorizedAt) || !Number.isFinite(expiresAt)
      || asOfDate.valueOf() < authorizedAt || asOfDate.valueOf() >= expiresAt) errors.push(`${prefix}_SOURCE_AUTHORITY_OUTSIDE_ACTIVE_WINDOW`);
    if (!Number.isFinite(observedAt) || !Number.isFinite(authorizedAt) || !Number.isFinite(expiresAt)
      || observedAt < authorizedAt || observedAt >= expiresAt) errors.push(`${prefix}_SOURCE_OBSERVATION_OUTSIDE_AUTHORITY_WINDOW`);
  }
  for (const [authorityId, observedCount] of manifestCountByAuthority.entries()) {
    const authority = authoritiesById.get(authorityId);
    if (authority && observedCount !== authority.expected_record_count) errors.push(`PSA_MANIFEST_AUTHORITY_RECORD_COUNT_MISMATCH:${authorityId}`);
  }
  return errors;
}

export function assertPsaKnownCertManifest(manifest, options) {
  const errors = validatePsaKnownCertManifest(manifest, options);
  if (errors.length) throw new Error(errors.join(';'));
  return manifest;
}

function syntheticToken(prefix, index) {
  const hex = index.toString(16).padStart(64, '0');
  return `${prefix}${hex}`;
}

function syntheticAuthority(count) {
  return {
    authority_id: 'PSA_SOURCE_AUTHORITY_SYNTHETIC_VALIDATOR_V1',
    status: 'ACTIVE',
    reference_key_id: 'PSA_CERT_REFERENCE_KEY_V1',
    source_class: 'RIGHTS_CLEAR_PRIVATE_SOURCE_RECORD',
    source_bundle_token: syntheticToken('hmac-sha256:v1:', 20_000),
    expected_record_count: count,
    rights_basis_id: 'PSA_BOUNDED_PRIVATE_EVALUATION_2026_08_24',
    rights_evidence_digest: sha256PsaCanonical('synthetic-validator-rights-evidence-only'),
    rights_evidence_ref: 'urn:kaios:psa:synthetic-validator-only',
    collector_id: 'KPMO_AUTHORIZED_OPERATOR',
    admission_purpose: 'PRIVATE_ER_EVALUATION_ONLY',
    enumeration_method: 'NONE',
    non_enumeration_verified: true,
    authorized_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2099-01-01T00:00:00.000Z',
    revoked_at: null
  };
}

function syntheticEntry(index, authority, authorityDigest) {
  const entry = {
    cert_reference_digest: syntheticToken('hmac-sha256:v1:', index + 1),
    source_authority_id: authority.authority_id,
    source_authority_entry_digest: authorityDigest,
    source_bundle_token: authority.source_bundle_token,
    source_record_token: syntheticToken('hmac-sha256:v1:', 30_000 + index),
    source_receipt_digest: '',
    source_class: authority.source_class,
    rights_basis_id: authority.rights_basis_id,
    collector_id: authority.collector_id,
    source_observed_at: '2026-08-28T00:00:00.000Z',
    admission_purpose: authority.admission_purpose,
    non_enumeration_verified: true,
    enumeration_used: false,
    raw_cert_value_in_repository: false,
    empirical_admissible: true
  };
  entry.source_receipt_digest = sha256PsaCanonical(sourceReceiptPayload(entry, authority.reference_key_id));
  return entry;
}

function manifestCaseAtCount(base, count) {
  const ready = count === PSA_MANIFEST_TARGET;
  const authority = count > 0 ? syntheticAuthority(count) : null;
  const authorityDigest = authority ? sha256PsaCanonical(authority) : null;
  const manifest = {
    ...structuredClone(base),
    state: ready ? PSA_READY_STATE : PSA_WAITING_STATE,
    provenance_bound_admissible_count: count,
    remaining_required: PSA_MANIFEST_TARGET - count,
    entries: Array.from({ length: count }, (_, index) => syntheticEntry(index, authority, authorityDigest)),
    live_acquisition: ready ? PSA_READY_LIVE_STATE : PSA_WAITING_LIVE_STATE
  };
  const authorityRegistry = {
    id: 'KIDULTS_PSA_SOURCE_AUTHORITY_REGISTRY_V1',
    schema_version: '1.0.0',
    state: authority ? 'ACTIVE_SOURCE_AUTHORITIES_PRESENT' : 'NO_ACTIVE_SOURCE_AUTHORITIES',
    reference_key_id: 'PSA_CERT_REFERENCE_KEY_V1',
    authorities: authority ? [authority] : []
  };
  return { manifest, authorityRegistry };
}

function requireError(manifest, authorityRegistry, expectedCode, asOf = '2026-08-28T12:00:00.000Z') {
  const errors = validatePsaKnownCertManifest(manifest, { authorityRegistry, asOf });
  if (!errors.includes(expectedCode)) throw new Error(`PSA_MANIFEST_NEGATIVE_FALSE_GREEN:${expectedCode}:${errors.join(',')}`);
}

export function runManifestContractValidation(
  manifestPath = PSA_MANIFEST_PATH,
  authorityRegistryPath = PSA_SOURCE_AUTHORITY_REGISTRY_PATH,
  protectedBaseRegistryPath = process.env.PSA_AUTHORITY_PROTECTED_BASE_REGISTRY_PATH,
  protectedBaseManifestPath = process.env.PSA_AUTHORITY_PROTECTED_BASE_MANIFEST_PATH
) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const authorityRegistry = JSON.parse(fs.readFileSync(authorityRegistryPath, 'utf8'));
  assertPsaKnownCertManifest(manifest, { authorityRegistry });
  if (protectedBaseRegistryPath) {
    const protectedBaseRegistry = JSON.parse(fs.readFileSync(protectedBaseRegistryPath, 'utf8'));
    const preexistenceErrors = validatePsaManifestAuthorityPreexistence(manifest, protectedBaseRegistry);
    if (preexistenceErrors.length) throw new Error(preexistenceErrors.join(';'));
    if (!protectedBaseManifestPath) throw new Error('PSA_AUTHORITY_PROTECTED_BASE_MANIFEST_PATH_REQUIRED');
    const protectedBaseManifest = JSON.parse(fs.readFileSync(protectedBaseManifestPath, 'utf8'));
    const separationErrors = validatePsaAuthorityManifestChangeSeparation({
      manifest,
      authorityRegistry,
      protectedBaseManifest,
      protectedBaseRegistry
    });
    if (separationErrors.length) throw new Error(separationErrors.join(';'));
  } else if (protectedBaseManifestPath) {
    throw new Error('PSA_AUTHORITY_PROTECTED_BASE_REGISTRY_PATH_REQUIRED');
  }

  for (const count of [0, 1, 119, 120]) {
    const testCase = manifestCaseAtCount(manifest, count);
    assertPsaKnownCertManifest(testCase.manifest, {
      authorityRegistry: testCase.authorityRegistry,
      asOf: '2026-08-28T12:00:00.000Z'
    });
  }

  const overTargetCase = manifestCaseAtCount(manifest, 120);
  const overTarget = overTargetCase.manifest;
  overTarget.entries.push({
    ...structuredClone(overTarget.entries[119]),
    cert_reference_digest: syntheticToken('hmac-sha256:v1:', 121),
    source_record_token: syntheticToken('hmac-sha256:v1:', 30_120),
    source_receipt_digest: syntheticToken('sha256:', 40_120)
  });
  overTarget.provenance_bound_admissible_count = 121;
  overTarget.remaining_required = -1;
  requireError(overTarget, overTargetCase.authorityRegistry, 'PSA_MANIFEST_OVER_TARGET');

  const duplicateCertCase = manifestCaseAtCount(manifest, 2);
  const duplicateCert = duplicateCertCase.manifest;
  duplicateCert.entries[1].cert_reference_digest = duplicateCert.entries[0].cert_reference_digest;
  requireError(duplicateCert, duplicateCertCase.authorityRegistry, 'PSA_MANIFEST_ENTRY_1_DUPLICATE_CERT_REFERENCE');

  const duplicateSourceRecordCase = manifestCaseAtCount(manifest, 2);
  const duplicateSourceRecord = duplicateSourceRecordCase.manifest;
  duplicateSourceRecord.entries[1].source_record_token = duplicateSourceRecord.entries[0].source_record_token;
  requireError(duplicateSourceRecord, duplicateSourceRecordCase.authorityRegistry, 'PSA_MANIFEST_ENTRY_1_DUPLICATE_SOURCE_RECORD_TOKEN');

  const duplicateSourceReceiptCase = manifestCaseAtCount(manifest, 2);
  const duplicateSourceReceipt = duplicateSourceReceiptCase.manifest;
  duplicateSourceReceipt.entries[1].source_receipt_digest = duplicateSourceReceipt.entries[0].source_receipt_digest;
  requireError(duplicateSourceReceipt, duplicateSourceReceiptCase.authorityRegistry, 'PSA_MANIFEST_ENTRY_1_DUPLICATE_SOURCE_RECEIPT_DIGEST');

  const substitutedSourceReceiptCase = manifestCaseAtCount(manifest, 1);
  substitutedSourceReceiptCase.manifest.entries[0].source_receipt_digest = syntheticToken('sha256:', 99_998);
  requireError(substitutedSourceReceiptCase.manifest, substitutedSourceReceiptCase.authorityRegistry, 'PSA_MANIFEST_ENTRY_0_SOURCE_RECEIPT_DIGEST_MISMATCH');

  const unknownEntryFieldCase = manifestCaseAtCount(manifest, 1);
  const unknownEntryField = unknownEntryFieldCase.manifest;
  unknownEntryField.entries[0].raw_cert_number = { nested: ['not-admitted'] };
  requireError(unknownEntryField, unknownEntryFieldCase.authorityRegistry, 'PSA_MANIFEST_ENTRY_0_SCHEMA_KEYS_INVALID');

  const nestedKnownFieldCase = manifestCaseAtCount(manifest, 1);
  const nestedKnownField = nestedKnownFieldCase.manifest;
  nestedKnownField.entries[0].collector_id = { value: 'KPMO_AUTHORIZED_OPERATOR' };
  requireError(nestedKnownField, nestedKnownFieldCase.authorityRegistry, 'PSA_MANIFEST_ENTRY_0_COLLECTOR_INVALID');

  const unkeyedCertDigestCase = manifestCaseAtCount(manifest, 1);
  const unkeyedCertDigest = unkeyedCertDigestCase.manifest;
  unkeyedCertDigest.entries[0].cert_reference_digest = syntheticToken('sha256:', 1);
  requireError(unkeyedCertDigest, unkeyedCertDigestCase.authorityRegistry, 'PSA_MANIFEST_ENTRY_0_CERT_REFERENCE_HMAC_INVALID');

  const unknownRootFieldCase = manifestCaseAtCount(manifest, 0);
  const unknownRootField = unknownRootFieldCase.manifest;
  unknownRootField.raw_identifiers = [];
  requireError(unknownRootField, unknownRootFieldCase.authorityRegistry, 'PSA_MANIFEST_ROOT_SCHEMA_KEYS_INVALID');

  const incompleteStateCase = manifestCaseAtCount(manifest, 119);
  const incompleteState = incompleteStateCase.manifest;
  incompleteState.state = PSA_READY_STATE;
  requireError(incompleteState, incompleteStateCase.authorityRegistry, 'PSA_MANIFEST_INCOMPLETE_STATE_MISMATCH');

  const readyStateCase = manifestCaseAtCount(manifest, 120);
  const readyState = readyStateCase.manifest;
  readyState.state = PSA_WAITING_STATE;
  requireError(readyState, readyStateCase.authorityRegistry, 'PSA_MANIFEST_READY_STATE_MISMATCH');

  const contractInflationCase = manifestCaseAtCount(manifest, 0);
  const contractInflation = contractInflationCase.manifest;
  contractInflation.required_entry_contract.raw_cert_number = 'string';
  requireError(contractInflation, contractInflationCase.authorityRegistry, 'PSA_MANIFEST_ENTRY_CONTRACT_INVALID');

  const registryInflationCase = manifestCaseAtCount(manifest, 0);
  registryInflationCase.authorityRegistry.raw_cert_values = { nested: [] };
  requireError(registryInflationCase.manifest, registryInflationCase.authorityRegistry, 'PSA_SOURCE_AUTHORITY_REGISTRY_SCHEMA_KEYS_INVALID');

  const authorityInflationCase = manifestCaseAtCount(manifest, 1);
  authorityInflationCase.authorityRegistry.authorities[0].raw_cert_number = { nested: ['not-admitted'] };
  requireError(authorityInflationCase.manifest, authorityInflationCase.authorityRegistry, 'PSA_SOURCE_AUTHORITY_0_SCHEMA_KEYS_INVALID');

  const missingRightsEvidenceDigestCase = manifestCaseAtCount(manifest, 1);
  delete missingRightsEvidenceDigestCase.authorityRegistry.authorities[0].rights_evidence_digest;
  requireError(missingRightsEvidenceDigestCase.manifest, missingRightsEvidenceDigestCase.authorityRegistry, 'PSA_SOURCE_AUTHORITY_0_SCHEMA_KEYS_INVALID');

  const invalidRightsEvidenceDigestCase = manifestCaseAtCount(manifest, 1);
  invalidRightsEvidenceDigestCase.authorityRegistry.authorities[0].rights_evidence_digest = 'sha256:not-a-digest';
  requireError(invalidRightsEvidenceDigestCase.manifest, invalidRightsEvidenceDigestCase.authorityRegistry, 'PSA_SOURCE_AUTHORITY_0_RIGHTS_EVIDENCE_DIGEST_INVALID');

  const substitutedRightsEvidenceDigestCase = manifestCaseAtCount(manifest, 1);
  substitutedRightsEvidenceDigestCase.authorityRegistry.authorities[0].rights_evidence_digest = syntheticToken('sha256:', 88_888);
  requireError(substitutedRightsEvidenceDigestCase.manifest, substitutedRightsEvidenceDigestCase.authorityRegistry, 'PSA_MANIFEST_ENTRY_0_SOURCE_AUTHORITY_ENTRY_DIGEST_MISMATCH');

  const noRegistry = manifestCaseAtCount(manifest, 1);
  const noRegistryErrors = validatePsaKnownCertManifest(noRegistry.manifest);
  if (!noRegistryErrors.includes('PSA_MANIFEST_AUTHORITY_REGISTRY_REQUIRED')) throw new Error('PSA_MANIFEST_NEGATIVE_FALSE_GREEN:PSA_MANIFEST_AUTHORITY_REGISTRY_REQUIRED');

  const unknownAuthorityCase = manifestCaseAtCount(manifest, 1);
  unknownAuthorityCase.manifest.entries[0].source_authority_id = 'PSA_SOURCE_AUTHORITY_UNKNOWN_V1';
  requireError(unknownAuthorityCase.manifest, unknownAuthorityCase.authorityRegistry, 'PSA_MANIFEST_ENTRY_0_SOURCE_AUTHORITY_NOT_FOUND');

  const substitutedAuthorityDigestCase = manifestCaseAtCount(manifest, 1);
  substitutedAuthorityDigestCase.manifest.entries[0].source_authority_entry_digest = syntheticToken('sha256:', 99_999);
  requireError(substitutedAuthorityDigestCase.manifest, substitutedAuthorityDigestCase.authorityRegistry, 'PSA_MANIFEST_ENTRY_0_SOURCE_AUTHORITY_ENTRY_DIGEST_MISMATCH');

  const substitutedBundleCase = manifestCaseAtCount(manifest, 1);
  substitutedBundleCase.manifest.entries[0].source_bundle_token = syntheticToken('hmac-sha256:v1:', 99_999);
  requireError(substitutedBundleCase.manifest, substitutedBundleCase.authorityRegistry, 'PSA_MANIFEST_ENTRY_0_SOURCE_BUNDLE_AUTHORITY_MISMATCH');

  const expiredAuthorityCase = manifestCaseAtCount(manifest, 1);
  requireError(expiredAuthorityCase.manifest, expiredAuthorityCase.authorityRegistry, 'PSA_MANIFEST_ENTRY_0_SOURCE_AUTHORITY_OUTSIDE_ACTIVE_WINDOW', '2099-01-01T00:00:00.000Z');

  const revokedAuthorityCase = manifestCaseAtCount(manifest, 1);
  revokedAuthorityCase.authorityRegistry.authorities[0].status = 'REVOKED';
  revokedAuthorityCase.authorityRegistry.authorities[0].revoked_at = '2026-08-28T01:00:00.000Z';
  revokedAuthorityCase.authorityRegistry.state = 'NO_ACTIVE_SOURCE_AUTHORITIES';
  requireError(revokedAuthorityCase.manifest, revokedAuthorityCase.authorityRegistry, 'PSA_MANIFEST_ENTRY_0_SOURCE_AUTHORITY_NOT_ACTIVE');

  const wrongRecordCountCase = manifestCaseAtCount(manifest, 1);
  wrongRecordCountCase.authorityRegistry.authorities[0].expected_record_count = 2;
  wrongRecordCountCase.manifest.entries[0].source_authority_entry_digest = sha256PsaCanonical(wrongRecordCountCase.authorityRegistry.authorities[0]);
  requireError(wrongRecordCountCase.manifest, wrongRecordCountCase.authorityRegistry, 'PSA_MANIFEST_AUTHORITY_RECORD_COUNT_MISMATCH:PSA_SOURCE_AUTHORITY_SYNTHETIC_VALIDATOR_V1');

  const preexistingAuthorityCase = manifestCaseAtCount(manifest, 1);
  const preexistingAuthorityErrors = validatePsaManifestAuthorityPreexistence(
    preexistingAuthorityCase.manifest,
    preexistingAuthorityCase.authorityRegistry
  );
  if (preexistingAuthorityErrors.length) throw new Error(`PSA_MANIFEST_PREEXISTENCE_POSITIVE_FAILED:${preexistingAuthorityErrors.join(',')}`);

  const sameChangeAuthorityCase = manifestCaseAtCount(manifest, 1);
  const emptyProtectedBase = manifestCaseAtCount(manifest, 0).authorityRegistry;
  const sameChangeErrors = validatePsaManifestAuthorityPreexistence(sameChangeAuthorityCase.manifest, emptyProtectedBase);
  if (!sameChangeErrors.includes('PSA_MANIFEST_ENTRY_0_SOURCE_AUTHORITY_NOT_PREEXISTING_PROTECTED_BASE')) {
    throw new Error(`PSA_MANIFEST_PREEXISTENCE_NEGATIVE_FALSE_GREEN:${sameChangeErrors.join(',')}`);
  }

  const modifiedAuthorityCase = manifestCaseAtCount(manifest, 1);
  const protectedBaseWithDifferentAuthority = structuredClone(modifiedAuthorityCase.authorityRegistry);
  protectedBaseWithDifferentAuthority.authorities[0].rights_evidence_ref = 'urn:kaios:psa:different-protected-base-evidence';
  const modifiedAuthorityErrors = validatePsaManifestAuthorityPreexistence(
    modifiedAuthorityCase.manifest,
    protectedBaseWithDifferentAuthority
  );
  if (!modifiedAuthorityErrors.includes('PSA_MANIFEST_ENTRY_0_SOURCE_AUTHORITY_PROTECTED_BASE_DIGEST_MISMATCH')) {
    throw new Error(`PSA_MANIFEST_PROTECTED_BASE_DIGEST_NEGATIVE_FALSE_GREEN:${modifiedAuthorityErrors.join(',')}`);
  }

  const sameChangeSeparationCase = manifestCaseAtCount(manifest, 1);
  const separationBase = manifestCaseAtCount(manifest, 0);
  const sameChangeSeparationErrors = validatePsaAuthorityManifestChangeSeparation({
    manifest: sameChangeSeparationCase.manifest,
    authorityRegistry: sameChangeSeparationCase.authorityRegistry,
    protectedBaseManifest: separationBase.manifest,
    protectedBaseRegistry: separationBase.authorityRegistry
  });
  if (!sameChangeSeparationErrors.includes('PSA_SOURCE_AUTHORITY_AND_MANIFEST_ENTRIES_SAME_CHANGE_PROHIBITED')) {
    throw new Error(`PSA_AUTHORITY_MANIFEST_SEPARATION_NEGATIVE_FALSE_GREEN:${sameChangeSeparationErrors.join(',')}`);
  }

  const manifestOnlySeparationErrors = validatePsaAuthorityManifestChangeSeparation({
    manifest: sameChangeSeparationCase.manifest,
    authorityRegistry: sameChangeSeparationCase.authorityRegistry,
    protectedBaseManifest: separationBase.manifest,
    protectedBaseRegistry: sameChangeSeparationCase.authorityRegistry
  });
  if (manifestOnlySeparationErrors.length) throw new Error(`PSA_MANIFEST_ONLY_SEPARATION_POSITIVE_FAILED:${manifestOnlySeparationErrors.join(',')}`);

  return {
    state: 'VERIFIED_PASS',
    manifest_target: PSA_MANIFEST_TARGET,
    admissible: manifest.provenance_bound_admissible_count,
    remaining: manifest.remaining_required,
    state_mapping_verified_at: [0, 1, 119, 120],
    over_target_rejected: true,
    duplicate_cert_reference_rejected: true,
    duplicate_source_record_rejected: true,
    duplicate_source_receipt_rejected: true,
    source_receipt_binding_verified: true,
    exact_flat_entry_schema: true,
    hmac_cert_reference_required: true,
    governed_authority_registry_required: true,
    authority_digest_bundle_count_expiry_revocation_bound: true,
    immutable_rights_evidence_digest_bound: true,
    protected_base_authority_preexistence_check: protectedBaseRegistryPath ? 'VERIFIED' : 'WORKFLOW_ENFORCED',
    same_change_authority_rejected: true,
    registry_and_manifest_entry_same_change_rejected: true,
    provenance_bound: true,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD'
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    console.log(JSON.stringify(runManifestContractValidation(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
