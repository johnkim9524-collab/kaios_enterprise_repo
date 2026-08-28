#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const sha256 = value => `sha256:${createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
};
const fail = code => { console.error(code); process.exit(1); };

const ALLOWED_SOURCE_CLASSES = new Set(['PROGRAM_OWNER_KNOWN_CERT_RECORD','RIGHTS_CLEAR_PRIVATE_SOURCE_RECORD']);
const ALLOWED_COLLECTORS = new Set(['PROGRAM_OWNER','KPMO_AUTHORIZED_OPERATOR']);
const REQUIRED_RIGHTS_BASIS = 'PSA_BOUNDED_PRIVATE_EVALUATION_2026_08_24';
const REQUIRED_PURPOSE = 'PRIVATE_ER_EVALUATION_ONLY';

const certNumber = String(process.env.PSA_CERT_NUMBER || '').trim();
const receiptPath = String(process.env.PSA_SOURCE_RECEIPT_PATH || '').trim();

if (!/^\d{4,16}$/.test(certNumber)) fail('PSA_CERT_NUMBER_INVALID');
if (!receiptPath) fail('PSA_SOURCE_RECEIPT_PATH_REQUIRED');
if (!receiptPath.startsWith('coordination/kidults/provider/psa-source-receipts/') || !receiptPath.endsWith('.json')) fail('PSA_SOURCE_RECEIPT_PATH_NOT_APPROVED');
if (!fs.existsSync(receiptPath)) fail('PSA_SOURCE_RECEIPT_NOT_FOUND');

let receipt;
try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); } catch { fail('PSA_SOURCE_RECEIPT_JSON_INVALID'); }
if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) fail('PSA_SOURCE_RECEIPT_INVALID');
if (receipt.schema_version !== '1.0.0' || receipt.receipt_type !== 'KIDULTS_PSA_KNOWN_CERT_SOURCE_RECEIPT') fail('PSA_SOURCE_RECEIPT_TYPE_INVALID');
if (!ALLOWED_SOURCE_CLASSES.has(receipt.source_class)) fail('PSA_SOURCE_CLASS_NOT_ALLOWED');
if (!ALLOWED_COLLECTORS.has(receipt.collector_id)) fail('PSA_COLLECTOR_ID_NOT_ALLOWED');
if (receipt.rights_basis_id !== REQUIRED_RIGHTS_BASIS) fail('PSA_RIGHTS_BASIS_INVALID');
if (receipt.admission_purpose !== REQUIRED_PURPOSE) fail('PSA_ADMISSION_PURPOSE_INVALID');
if (receipt.enumeration_method !== 'NONE' || receipt.non_enumeration_verified !== true) fail('PSA_ENUMERATION_OR_DISCOVERY_PROHIBITED');
if (receipt.synthetic !== false) fail('PSA_SYNTHETIC_SOURCE_RECEIPT_REJECTED');
if (Number.isNaN(Date.parse(String(receipt.source_observed_at || '')))) fail('PSA_SOURCE_OBSERVED_AT_INVALID');
if (!/^sha256:[0-9a-f]{64}$/.test(String(receipt.cert_reference_digest || ''))) fail('PSA_SOURCE_CERT_DIGEST_INVALID');
if (!/^sha256:[0-9a-f]{64}$/.test(String(receipt.source_record_digest || ''))) fail('PSA_SOURCE_RECORD_DIGEST_INVALID');
if (!/^sha256:[0-9a-f]{64}$/.test(String(receipt.receipt_digest || ''))) fail('PSA_SOURCE_RECEIPT_DIGEST_INVALID');

const { receipt_digest: suppliedReceiptDigest, ...receiptPayload } = receipt;
const expectedReceiptDigest = sha256(stable(receiptPayload));
if (suppliedReceiptDigest !== expectedReceiptDigest) fail('PSA_SOURCE_RECEIPT_DIGEST_MISMATCH');
const certReferenceDigest = sha256(certNumber);
if (receipt.cert_reference_digest !== certReferenceDigest) fail('PSA_CERT_NOT_BOUND_TO_SOURCE_RECEIPT');

const entry = {
  cert_reference_digest: certReferenceDigest,
  source_receipt_digest: suppliedReceiptDigest,
  source_record_digest: receipt.source_record_digest,
  source_class: receipt.source_class,
  rights_basis_id: receipt.rights_basis_id,
  collector_id: receipt.collector_id,
  source_observed_at: new Date(receipt.source_observed_at).toISOString(),
  admission_purpose: REQUIRED_PURPOSE,
  non_enumeration_verified: true,
  enumeration_used: false,
  raw_cert_value_in_repository: false,
  empirical_admissible: true
};

const serialized = JSON.stringify(entry, null, 2);
if (serialized.includes(certNumber)) fail('PSA_RAW_CERT_LEAK_DETECTED');
process.stdout.write(`${serialized}\n`);
