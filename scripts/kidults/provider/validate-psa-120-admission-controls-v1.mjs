import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { buildPrivatePsaRecord, decryptPrivatePsaRecord, buildDeletionReceipt, PSA_ALLOWED_PAYLOAD_FIELDS } from '../../../services/kidults-control-plane/src/psa-private-evaluation-store.mjs';

const fieldMap = JSON.parse(fs.readFileSync('coordination/kidults/provider/psa-120-field-map-v1.json','utf8'));
const retention = JSON.parse(fs.readFileSync('coordination/kidults/provider/psa-120-private-store-retention-v1.json','utf8'));
const manifest = JSON.parse(fs.readFileSync('coordination/kidults/provider/psa-120-known-cert-manifest-v1.json','utf8'));

if (fieldMap.state !== 'APPROVED_FOR_BOUNDED_PRIVATE_EVALUATION') throw new Error('PSA_FIELD_MAP_NOT_APPROVED');
if (fieldMap.allowed_fields.length !== 17) throw new Error('PSA_FIELD_MAP_CARDINALITY_DRIFT');
if (fieldMap.allowed_fields.includes('Price') || fieldMap.market_or_transaction_fields_admitted !== false) throw new Error('PSA_MARKET_FIELD_SCOPE_INFLATION');
if (JSON.stringify([...fieldMap.allowed_fields].sort()) !== JSON.stringify([...PSA_ALLOWED_PAYLOAD_FIELDS].sort())) throw new Error('PSA_STORE_FIELD_MAP_DRIFT');
if (retention.encryption.algorithm !== 'AES-256-GCM' || retention.retention.max_days !== 30) throw new Error('PSA_RETENTION_ENCRYPTION_CONTRACT_INVALID');
if (retention.boundaries.d1_raw_write !== 'PROHIBITED' || retention.boundaries.public_api_raw_output !== 'PROHIBITED') throw new Error('PSA_RAW_BOUNDARY_INVALID');
if (manifest.target_count !== 120 || manifest.current_known_count + manifest.remaining_required !== 120) throw new Error('PSA_MANIFEST_COUNT_INVALID');
if (manifest.rules.provider_daily_limit !== 100 || manifest.rules.minimum_execution_waves < 2) throw new Error('PSA_QUOTA_PLAN_INVALID');
if (manifest.rules.bulk_enumeration !== 'PROHIBITED' || manifest.rules.brute_force_discovery !== 'PROHIBITED') throw new Error('PSA_DISCOVERY_POLICY_INVALID');

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
try { buildPrivatePsaRecord({ certNumber: '08178895', payload: {}, key: Buffer.alloc(16), observedAt }); } catch (e) { negativePass = e.message === 'PSA_CERT_PAYLOAD_REQUIRED'; }
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
try { buildDeletionReceipt(record, { deletedAt: new Date('2026-09-28T00:00:00.000Z'), deletionSucceeeded: true }); } catch (e) { negativePass = e.message === 'PSA_DELETION_AFTER_RETENTION_DEADLINE'; }
if (!negativePass) throw new Error('PSA_LATE_DELETION_NEGATIVE_TEST_FAILED');
negativePass = false;
try { buildDeletionReceipt({ ...record, ciphertext_b64: Buffer.from('tampered').toString('base64') }, { deletionSucceeded: true }); } catch (e) { negativePass = e.message === 'PSA_RECORD_DIGEST_REQUIRED'; }
if (!negativePass) throw new Error('PSA_DELETION_RECORD_BINDING_NEGATIVE_TEST_FAILED');

console.log(JSON.stringify({
  validator: 'KIDULTS_PSA_120_ADMISSION_CONTROLS_V1',
  state: 'VERIFIED_PASS',
  field_map: 'APPROVED_AND_RUNTIME_ENFORCED',
  encrypted_private_store_boundary: 'AES_256_GCM_WITH_AUTHENTICATED_METADATA',
  exact_record_deletion_receipt: 'IMPLEMENTED',
  retention_deletion_receipt: 'IMPLEMENTED',
  lawful_manifest_progress: `${manifest.current_known_count}/120`,
  live_acquisition_authorized: false,
  empirical_delta: 0,
  production: 'HOLD',
  public: 'HOLD'
}, null, 2));
