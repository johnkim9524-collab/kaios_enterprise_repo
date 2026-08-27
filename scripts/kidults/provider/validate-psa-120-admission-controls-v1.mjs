import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { buildPrivatePsaRecord, decryptPrivatePsaRecord, buildDeletionReceipt, PSA_ALLOWED_PAYLOAD_FIELDS } from '../../../services/kidults-control-plane/src/psa-private-evaluation-store.mjs';

const fieldMap = JSON.parse(fs.readFileSync('coordination/kidults/provider/psa-120-field-map-v1.json','utf8'));
const retention = JSON.parse(fs.readFileSync('coordination/kidults/provider/psa-120-private-store-retention-v1.json','utf8'));
const manifest = JSON.parse(fs.readFileSync('coordination/kidults/provider/psa-120-known-cert-manifest-v1.json','utf8'));
const executionPlan = JSON.parse(fs.readFileSync('coordination/kidults/provider/psa-120-execution-plan-v1.json','utf8'));

function validateManifest(x) {
  const errors = [];
  if (x.target_count !== 120) errors.push('PSA_MANIFEST_TARGET_INVALID');
  if (!Array.isArray(x.entries)) errors.push('PSA_MANIFEST_ENTRIES_REQUIRED');
  const entries = Array.isArray(x.entries) ? x.entries : [];
  if (x.provenance_bound_admissible_count !== entries.length) errors.push('PSA_MANIFEST_ADMISSIBLE_COUNT_MISMATCH');
  if (x.remaining_required !== 120 - entries.length) errors.push('PSA_MANIFEST_REMAINING_COUNT_MISMATCH');
  if (x.cert_values_in_repository !== false) errors.push('PSA_RAW_CERT_PERSISTENCE_BOUNDARY_INVALID');
  if (entries.length > 120) errors.push('PSA_MANIFEST_OVER_TARGET');
  const digests = new Set();
  for (const [i, entry] of entries.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { errors.push(`PSA_MANIFEST_ENTRY_${i}_INVALID`); continue; }
    if (!/^sha256:[0-9a-f]{64}$/.test(String(entry.cert_reference_digest || ''))) errors.push(`PSA_MANIFEST_ENTRY_${i}_DIGEST_INVALID`);
    if (digests.has(entry.cert_reference_digest)) errors.push(`PSA_MANIFEST_ENTRY_${i}_DUPLICATE_DIGEST`);
    digests.add(entry.cert_reference_digest);
    if (typeof entry.lawful_source_ref !== 'string' || entry.lawful_source_ref.trim().length < 6) errors.push(`PSA_MANIFEST_ENTRY_${i}_SOURCE_REF_INVALID`);
    if (Number.isNaN(Date.parse(String(entry.source_observed_at || '')))) errors.push(`PSA_MANIFEST_ENTRY_${i}_OBSERVED_AT_INVALID`);
    if (entry.admission_purpose !== 'PRIVATE_ER_EVALUATION_ONLY') errors.push(`PSA_MANIFEST_ENTRY_${i}_PURPOSE_INVALID`);
    if (entry.enumeration_used !== false) errors.push(`PSA_MANIFEST_ENTRY_${i}_ENUMERATION_INVALID`);
    for (const forbidden of ['cert_number','certNumber','CertNumber','raw_cert_value','cert_value']) {
      if (Object.prototype.hasOwnProperty.call(entry, forbidden)) errors.push(`PSA_MANIFEST_ENTRY_${i}_RAW_CERT_VALUE_PRESENT`);
    }
  }
  if (entries.length === 120 && x.state !== 'READY_FOR_GOVERNED_LIVE_ACQUISITION') errors.push('PSA_MANIFEST_READY_STATE_MISMATCH');
  if (entries.length !== 120 && !String(x.state || '').startsWith('WAITING_')) errors.push('PSA_MANIFEST_INCOMPLETE_STATE_MISMATCH');
  return errors;
}

if (fieldMap.state !== 'APPROVED_FOR_BOUNDED_PRIVATE_EVALUATION') throw new Error('PSA_FIELD_MAP_NOT_APPROVED');
if (fieldMap.allowed_fields.length !== 17) throw new Error('PSA_FIELD_MAP_CARDINALITY_DRIFT');
if (fieldMap.allowed_fields.includes('Price') || fieldMap.market_or_transaction_fields_admitted !== false) throw new Error('PSA_MARKET_FIELD_SCOPE_INFLATION');
if (JSON.stringify([...fieldMap.allowed_fields].sort()) !== JSON.stringify([...PSA_ALLOWED_PAYLOAD_FIELDS].sort())) throw new Error('PSA_STORE_FIELD_MAP_DRIFT');
if (retention.encryption.algorithm !== 'AES-256-GCM' || retention.retention.max_days !== 30) throw new Error('PSA_RETENTION_ENCRYPTION_CONTRACT_INVALID');
if (retention.boundaries.d1_raw_write !== 'PROHIBITED' || retention.boundaries.public_api_raw_output !== 'PROHIBITED') throw new Error('PSA_RAW_BOUNDARY_INVALID');
const manifestErrors = validateManifest(manifest);
if (manifestErrors.length) throw new Error(manifestErrors.join(';'));
if (manifest.rules.provider_daily_limit !== 100 || manifest.rules.minimum_execution_waves < 2) throw new Error('PSA_QUOTA_PLAN_INVALID');
if (manifest.rules.bulk_enumeration !== 'PROHIBITED' || manifest.rules.brute_force_discovery !== 'PROHIBITED' || manifest.rules.synthetic_or_guessed_identifiers !== 'PROHIBITED') throw new Error('PSA_DISCOVERY_POLICY_INVALID');
if (executionPlan.provider_daily_limit !== 100 || executionPlan.internal_daily_ceiling > 90) throw new Error('PSA_EXECUTION_QUOTA_INVALID');
if (executionPlan.provenance_bound_admissible_manifest !== manifest.provenance_bound_admissible_count || executionPlan.remaining_admissible_manifest !== manifest.remaining_required) throw new Error('PSA_EXECUTION_MANIFEST_BINDING_INVALID');
if (executionPlan.live_execution !== 'HOLD_UNTIL_PRECONDITIONS') throw new Error('PSA_LIVE_EXECUTION_MUST_HOLD');

const key = randomBytes(32);
const observedAt = new Date('2026-08-28T00:00:00.000Z');
const record = buildPrivatePsaRecord({ certNumber: '08178895', payload: { PSACert: { Brand: 'TEST', TotalPopulation: 1 } }, key, observedAt });
if (record.record_version !== '1.1.0' || record.classification !== 'PRIVATE_ONLY' || record.plaintext_persisted !== false || record.delete_at !== '2026-09-27T00:00:00.000Z') throw new Error('PSA_PRIVATE_RECORD_CONTRACT_INVALID');
if (!/^sha256:[0-9a-f]{64}$/.test(record.record_digest) || !/^sha256:[0-9a-f]{64}$/.test(record.aad_digest)) throw new Error('PSA_PRIVATE_RECORD_INTEGRITY_BINDING_INVALID');
const decoded = decryptPrivatePsaRecord(record, key);
if (decoded.PSACert.Brand !== 'TEST') throw new Error('PSA_ENCRYPTION_ROUNDTRIP_FAILED');
const receipt = buildDeletionReceipt(record, { deletedAt: new Date('2026-09-27T00:00:00.000Z'), deletionSucceeded: true });
if (receipt.deletion_verified !== true || receipt.raw_payload_retained !== false || receipt.record_digest !== record.record_digest) throw new Error('PSA_DELETION_RECEIPT_INVALID');

let negativePass = false;
try { buildPrivatePsaRecord({ certNumber: '08178895', payload: {}, key, observedAt }); } catch (e) { negativePass = e.message === 'PSA_CERT_PAYLOAD_REQUIRED'; }
if (!negativePass) throw new Error('PSA_PAYLOAD_SHAPE_NEGATIVE_TEST_FAILED');
negativePass = false;
try { buildPrivatePsaRecord({ certNumber: '08178895', payload: { PSACert: { Brand: 'TEST', Price: 100 } }, key, observedAt }); } catch (e) { negativePass = e.message === 'PSA_PAYLOAD_FIELD_NOT_ALLOWED:Price'; }
if (!negativePass) throw new Error('PSA_UNAPPROVED_FIELD_NEGATIVE_TEST_FAILED');
negativePass = false;
try { buildPrivatePsaRecord({ certNumber: '08178895', payload: { PSACert: { Brand: 'TEST' } }, key: Buffer.alloc(16), observedAt }); } catch (e) { negativePass = e.message === 'PSA_AES_256_KEY_REQUIRED'; }
if (!negativePass) throw new Error('PSA_WEAK_KEY_NEGATIVE_TEST_FAILED');
negativePass = false;
try { decryptPrivatePsaRecord({ ...record, delete_at: '2026-09-28T00:00:00.000Z' }, key); } catch (e) { negativePass = e.message === 'PSA_RECORD_DIGEST_INVALID'; }
if (!negativePass) throw new Error('PSA_METADATA_TAMPER_NEGATIVE_TEST_FAILED');
negativePass = false;
try { buildDeletionReceipt(record, { deletionSucceeded: false }); } catch (e) { negativePass = e.message === 'PSA_DELETION_NOT_VERIFIED'; }
if (!negativePass) throw new Error('PSA_FALSE_DELETION_NEGATIVE_TEST_FAILED');
negativePass = false;
try { buildDeletionReceipt(record, { deletedAt: new Date('2026-09-28T00:00:00.000Z'), deletionSucceeded: true }); } catch (e) { negativePass = e.message === 'PSA_DELETION_AFTER_RETENTION_DEADLINE'; }
if (!negativePass) throw new Error('PSA_LATE_DELETION_NEGATIVE_TEST_FAILED');
negativePass = false;
try { buildDeletionReceipt({ ...record, ciphertext_b64: Buffer.from('tampered').toString('base64') }, { deletionSucceeded: true }); } catch (e) { negativePass = e.message === 'PSA_RECORD_DIGEST_REQUIRED'; }
if (!negativePass) throw new Error('PSA_DELETION_RECORD_BINDING_NEGATIVE_TEST_FAILED');

const fixture = {
  cert_reference_digest: `sha256:${'a'.repeat(64)}`,
  lawful_source_ref: 'source:lawful-public-record:1',
  source_observed_at: '2026-08-28T00:00:00.000Z',
  admission_purpose: 'PRIVATE_ER_EVALUATION_ONLY',
  enumeration_used: false
};
for (const mutate of [
  x => { x.provenance_bound_admissible_count = 1; },
  x => { x.entries = [fixture, { ...fixture }]; x.provenance_bound_admissible_count = 2; x.remaining_required = 118; },
  x => { x.entries = [{ ...fixture, cert_number: '08178895' }]; x.provenance_bound_admissible_count = 1; x.remaining_required = 119; },
  x => { x.entries = [{ ...fixture, enumeration_used: true }]; x.provenance_bound_admissible_count = 1; x.remaining_required = 119; }
]) {
  const x = structuredClone(manifest);
  mutate(x);
  if (!validateManifest(x).length) throw new Error('PSA_MANIFEST_NEGATIVE_MUTATION_NOT_REJECTED');
}

console.log(JSON.stringify({
  validator: 'KIDULTS_PSA_120_ADMISSION_CONTROLS_V1',
  state: 'VERIFIED_PASS',
  field_map: 'APPROVED_AND_RUNTIME_ENFORCED',
  encrypted_private_store_boundary: 'AES_256_GCM_WITH_AUTHENTICATED_METADATA',
  exact_record_deletion_receipt: 'IMPLEMENTED',
  retention_deletion_receipt: 'IMPLEMENTED',
  declared_known_count: manifest.declared_known_count,
  provenance_bound_admissible_manifest: manifest.provenance_bound_admissible_count,
  lawful_manifest_progress: `${manifest.provenance_bound_admissible_count}/120`,
  count_only_progress_rejected: true,
  duplicate_digest_rejected: true,
  raw_cert_persistence_rejected: true,
  enumeration_rejected: true,
  live_acquisition_authorized: false,
  empirical_delta: 0,
  production: 'HOLD',
  public: 'HOLD'
}, null, 2));
