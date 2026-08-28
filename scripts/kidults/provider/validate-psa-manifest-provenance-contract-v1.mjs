#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const manifestPath = 'coordination/kidults/provider/psa-120-known-cert-manifest-v1.json';
const builderPath = 'scripts/kidults/provider/build-psa-lawful-manifest-entry-v1.mjs';
const receiptDir = 'coordination/kidults/provider/psa-source-receipts';
const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const b = fs.readFileSync(builderPath, 'utf8');
const fail = code => { console.error(code); process.exit(1); };
const sha256 = value => `sha256:${crypto.createHash('sha256').update(String(value),'utf8').digest('hex')}`;
const stable = value => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}` : JSON.stringify(value);

if (m.id !== 'KIDULTS_PSA_120_KNOWN_CERT_MANIFEST_V1') fail('MANIFEST_ID_INVALID');
if (m.target_count !== 120) fail('MANIFEST_TARGET_INVALID');
if (!Array.isArray(m.entries)) fail('MANIFEST_ENTRIES_INVALID');
if (m.provenance_bound_admissible_count !== m.entries.length) fail('MANIFEST_COUNT_MISMATCH');
if (m.remaining_required !== 120 - m.entries.length) fail('MANIFEST_REMAINING_MISMATCH');
if (m.cert_values_in_repository !== false) fail('RAW_CERT_BOUNDARY_INVALID');

const receiptFiles = fs.existsSync(receiptDir) ? fs.readdirSync(receiptDir).filter(f=>f.endsWith('.json')) : [];
const receipts = receiptFiles.map(f=>JSON.parse(fs.readFileSync(path.join(receiptDir,f),'utf8')));
const byDigest = new Map();
for (const r of receipts) {
  if (r.receipt_type !== 'KIDULTS_PSA_KNOWN_CERT_SOURCE_RECEIPT') continue;
  const {receipt_digest,...payload}=r;
  if (!/^sha256:[0-9a-f]{64}$/.test(receipt_digest||'')) fail('SOURCE_RECEIPT_DIGEST_INVALID');
  if (receipt_digest !== sha256(stable(payload))) fail('SOURCE_RECEIPT_DIGEST_MISMATCH');
  if (r.synthetic !== false || r.enumeration_method !== 'NONE' || r.non_enumeration_verified !== true) fail('SOURCE_RECEIPT_PROVENANCE_INVALID');
  if (r.source_class === 'PUBLICLY_OBSERVED_KNOWN_CERT_RECORD' && !/^https:\/\/www\.psacard\.com\/cert\//.test(String(r.source_ref||''))) fail('PUBLIC_SOURCE_REF_INVALID');
  byDigest.set(receipt_digest,r);
}

const seenCert = new Set();
for (const e of m.entries) {
  if (!/^sha256:[0-9a-f]{64}$/.test(e.cert_reference_digest||'')) fail('ENTRY_CERT_DIGEST_INVALID');
  if (seenCert.has(e.cert_reference_digest)) fail('ENTRY_DUPLICATE_CERT_DIGEST');
  seenCert.add(e.cert_reference_digest);
  const r = byDigest.get(e.source_receipt_digest);
  if (!r) fail('ENTRY_SOURCE_RECEIPT_MISSING');
  if (r.cert_reference_digest !== e.cert_reference_digest || r.source_record_digest !== e.source_record_digest) fail('ENTRY_SOURCE_BINDING_MISMATCH');
  if (r.source_class !== e.source_class || r.collector_id !== e.collector_id || r.rights_basis_id !== e.rights_basis_id) fail('ENTRY_PROVENANCE_METADATA_MISMATCH');
  if (e.admission_purpose !== 'PRIVATE_ER_EVALUATION_ONLY' || e.non_enumeration_verified !== true || e.enumeration_used !== false || e.raw_cert_value_in_repository !== false || e.empirical_admissible !== true) fail('ENTRY_ADMISSION_BOUNDARY_INVALID');
}

for (const token of ['PUBLICLY_OBSERVED_KNOWN_CERT_RECORD','PSA_ENUMERATION_OR_DISCOVERY_PROHIBITED','PSA_CERT_NOT_BOUND_TO_SOURCE_RECEIPT']) if (!b.includes(token)) fail(`BUILDER_CONTRACT_TOKEN_MISSING_${token}`);
if (m.production !== 'HOLD' || m.public !== 'HOLD' || m.g5 !== 'HOLD') fail('RELEASE_HOLD_INVALID');
console.log(JSON.stringify({state:'VERIFIED_PASS', manifest_target:120, admissible:m.entries.length, remaining:m.remaining_required, provenance_bound:true, production:'HOLD', public:'HOLD', g5:'HOLD'}, null, 2));
