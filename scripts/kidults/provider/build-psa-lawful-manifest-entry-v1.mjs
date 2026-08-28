#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const sha256 = value => `sha256:${createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
};
const ALLOWED_SOURCE_CLASSES = new Set(['PROGRAM_OWNER_KNOWN_CERT_RECORD','RIGHTS_CLEAR_PRIVATE_SOURCE_RECORD']);
const ALLOWED_COLLECTORS = new Set(['PROGRAM_OWNER','KPMO_AUTHORIZED_OPERATOR']);
const REQUIRED_RIGHTS_BASIS = 'PSA_BOUNDED_PRIVATE_EVALUATION_2026_08_24';
const REQUIRED_PURPOSE = 'PRIVATE_ER_EVALUATION_ONLY';

export function validateSourceReceipt(receipt, certNumber, { controlValidation = false } = {}) {
  const cert = String(certNumber || '').trim();
  if (!/^\d{4,16}$/.test(cert)) throw new Error('PSA_CERT_NUMBER_INVALID');
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('PSA_SOURCE_RECEIPT_INVALID');
  if (receipt.schema_version !== '1.0.0' || receipt.receipt_type !== 'KIDULTS_PSA_KNOWN_CERT_SOURCE_RECEIPT') throw new Error('PSA_SOURCE_RECEIPT_TYPE_INVALID');
  if (!ALLOWED_SOURCE_CLASSES.has(receipt.source_class)) throw new Error('PSA_SOURCE_CLASS_NOT_ALLOWED');
  if (!ALLOWED_COLLECTORS.has(receipt.collector_id)) throw new Error('PSA_COLLECTOR_ID_NOT_ALLOWED');
  if (receipt.rights_basis_id !== REQUIRED_RIGHTS_BASIS) throw new Error('PSA_RIGHTS_BASIS_INVALID');
  if (receipt.admission_purpose !== REQUIRED_PURPOSE) throw new Error('PSA_ADMISSION_PURPOSE_INVALID');
  if (receipt.enumeration_method !== 'NONE' || receipt.non_enumeration_verified !== true) throw new Error('PSA_ENUMERATION_OR_DISCOVERY_PROHIBITED');
  if (receipt.synthetic !== false && !(controlValidation && receipt.synthetic === true)) throw new Error('PSA_SYNTHETIC_SOURCE_RECEIPT_REJECTED');
  if (Number.isNaN(Date.parse(String(receipt.source_observed_at || '')))) throw new Error('PSA_SOURCE_OBSERVED_AT_INVALID');
  if (!/^sha256:[0-9a-f]{64}$/.test(String(receipt.cert_reference_digest || ''))) throw new Error('PSA_SOURCE_CERT_DIGEST_INVALID');
  if (!/^sha256:[0-9a-f]{64}$/.test(String(receipt.source_record_digest || ''))) throw new Error('PSA_SOURCE_RECORD_DIGEST_INVALID');
  if (!/^sha256:[0-9a-f]{64}$/.test(String(receipt.receipt_digest || ''))) throw new Error('PSA_SOURCE_RECEIPT_DIGEST_INVALID');
  const { receipt_digest: suppliedReceiptDigest, ...receiptPayload } = receipt;
  if (suppliedReceiptDigest !== sha256(stable(receiptPayload))) throw new Error('PSA_SOURCE_RECEIPT_DIGEST_MISMATCH');
  const certReferenceDigest = sha256(cert);
  if (receipt.cert_reference_digest !== certReferenceDigest) throw new Error('PSA_CERT_NOT_BOUND_TO_SOURCE_RECEIPT');
  return { certReferenceDigest, receiptDigest: suppliedReceiptDigest };
}

export function buildManifestEntry({ certNumber, receipt, controlValidation = false }) {
  const { certReferenceDigest, receiptDigest } = validateSourceReceipt(receipt, certNumber, { controlValidation });
  return {
    cert_reference_digest: certReferenceDigest,
    source_receipt_digest: receiptDigest,
    source_record_digest: receipt.source_record_digest,
    source_class: receipt.source_class,
    rights_basis_id: receipt.rights_basis_id,
    collector_id: receipt.collector_id,
    source_observed_at: new Date(receipt.source_observed_at).toISOString(),
    admission_purpose: REQUIRED_PURPOSE,
    non_enumeration_verified: true,
    enumeration_used: false,
    raw_cert_value_in_repository: false,
    empirical_admissible: controlValidation ? false : true
  };
}

function fail(code) { console.error(code); process.exit(1); }
function main() {
  const certNumber = String(process.env.PSA_CERT_NUMBER || '').trim();
  const receiptPath = String(process.env.PSA_SOURCE_RECEIPT_PATH || '').trim();
  if (!/^\d{4,16}$/.test(certNumber)) fail('PSA_CERT_NUMBER_INVALID');
  if (!receiptPath) fail('PSA_SOURCE_RECEIPT_PATH_REQUIRED');
  if (!receiptPath.startsWith('coordination/kidults/provider/psa-source-receipts/') || !receiptPath.endsWith('.json')) fail('PSA_SOURCE_RECEIPT_PATH_NOT_APPROVED');
  if (!fs.existsSync(receiptPath)) fail('PSA_SOURCE_RECEIPT_NOT_FOUND');
  let receipt;
  try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); } catch { fail('PSA_SOURCE_RECEIPT_JSON_INVALID'); }
  let entry;
  try { entry = buildManifestEntry({ certNumber, receipt, controlValidation: false }); } catch (e) { fail(e.message); }
  const serialized = JSON.stringify(entry, null, 2);
  if (serialized.includes(certNumber)) fail('PSA_RAW_CERT_LEAK_DETECTED');
  process.stdout.write(`${serialized}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
