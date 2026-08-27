import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { buildPrivatePsaRecord, decryptPrivatePsaRecord, buildDeletionReceipt } from '../../../services/kidults-control-plane/src/psa-private-evaluation-store.mjs';

const fieldMap = JSON.parse(fs.readFileSync('coordination/kidults/provider/psa-120-field-map-v1.json','utf8'));
const retention = JSON.parse(fs.readFileSync('coordination/kidults/provider/psa-120-private-store-retention-v1.json','utf8'));
const manifest = JSON.parse(fs.readFileSync('coordination/kidults/provider/psa-120-known-cert-manifest-v1.json','utf8'));

if (fieldMap.state !== 'APPROVED_FOR_BOUNDED_PRIVATE_EVALUATION') throw new Error('PSA_FIELD_MAP_NOT_APPROVED');
if (fieldMap.allowed_fields.length !== 17) throw new Error('PSA_FIELD_MAP_CARDINALITY_DRIFT');
if (fieldMap.allowed_fields.includes('Price') || fieldMap.market_or_transaction_fields_admitted !== false) throw new Error('PSA_MARKET_FIELD_SCOPE_INFLATION');
if (retention.encryption.algorithm !== 'AES-256-GCM' || retention.retention.max_days !== 30) throw new Error('PSA_RETENTION_ENCRYPTION_CONTRACT_INVALID');
if (retention.boundaries.d1_raw_write !== 'PROHIBITED' || retention.boundaries.public_api_raw_output !== 'PROHIBITED') throw new Error('PSA_RAW_BOUNDARY_INVALID');
if (manifest.target_count !== 120 || manifest.current_known_count + manifest.remaining_required !== 120) throw new Error('PSA_MANIFEST_COUNT_INVALID');
if (manifest.rules.provider_daily_limit !== 100 || manifest.rules.minimum_execution_waves < 2) throw new Error('PSA_QUOTA_PLAN_INVALID');
if (manifest.rules.bulk_enumeration !== 'PROHIBITED' || manifest.rules.brute_force_discovery !== 'PROHIBITED') throw new Error('PSA_DISCOVERY_POLICY_INVALID');

const key = randomBytes(32);
const observedAt = new Date('2026-08-28T00:00:00.000Z');
const record = buildPrivatePsaRecord({ certNumber: '08178895', payload: { PSACert: { Brand: 'TEST', TotalPopulation: 1 } }, key, observedAt });
if (record.classification !== 'PRIVATE_ONLY' || record.plaintext_persisted !== false || record.delete_at !== '2026-09-27T00:00:00.000Z') throw new Error('PSA_PRIVATE_RECORD_CONTRACT_INVALID');
const decoded = decryptPrivatePsaRecord(record, key);
if (decoded.PSACert.Brand !== 'TEST') throw new Error('PSA_ENCRYPTION_ROUNDTRIP_FAILED');
const receipt = buildDeletionReceipt(record, { deletedAt: new Date('2026-09-27T00:00:00.000Z'), deletionSucceeded: true });
if (receipt.deletion_verified !== true || receipt.raw_payload_retained !== false) throw new Error('PSA_DELETION_RECEIPT_INVALID');

let negativePass = false;
try { buildPrivatePsaRecord({ certNumber: '08178895', payload: {}, key: Buffer.alloc(16), observedAt }); } catch (e) { negativePass = e.message === 'PSA_AES_256_KEY_REQUIRED'; }
if (!negativePass) throw new Error('PSA_WEAK_KEY_NEGATIVE_TEST_FAILED');
negativePass = false;
try { buildDeletionReceipt(record, { deletionSucceeded: false }); } catch (e) { negativePass = e.message === 'PSA_DELETION_NOT_VERIFIED'; }
if (!negativePass) throw new Error('PSA_FALSE_DELETION_NEGATIVE_TEST_FAILED');

console.log(JSON.stringify({
  validator: 'KIDULTS_PSA_120_ADMISSION_CONTROLS_V1',
  state: 'VERIFIED_PASS',
  field_map: 'APPROVED',
  encrypted_private_store_boundary: 'IMPLEMENTED',
  retention_deletion_receipt: 'IMPLEMENTED',
  lawful_manifest_progress: `${manifest.current_known_count}/120`,
  live_acquisition_authorized: false,
  production: 'HOLD',
  public: 'HOLD'
}, null, 2));
