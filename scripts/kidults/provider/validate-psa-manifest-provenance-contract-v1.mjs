#!/usr/bin/env node
import fs from 'node:fs';

const manifestPath = 'coordination/kidults/provider/psa-120-known-cert-manifest-v1.json';
const builderPath = 'scripts/kidults/provider/build-psa-lawful-manifest-entry-v1.mjs';
const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const b = fs.readFileSync(builderPath, 'utf8');
const fail = code => { console.error(code); process.exit(1); };

if (m.id !== 'KIDULTS_PSA_120_KNOWN_CERT_MANIFEST_V1') fail('MANIFEST_ID_INVALID');
if (m.target_count !== 120 || m.provenance_bound_admissible_count !== 0 || m.remaining_required !== 120) fail('EMPIRICAL_TRUTH_INFLATED');
if (m.entries?.length !== 0 || m.cert_values_in_repository !== false) fail('RAW_OR_UNVERIFIED_ENTRY_PRESENT');

const required = {
  cert_reference_digest: 'sha256:<64hex>',
  source_receipt_digest: 'sha256:<64hex>',
  source_record_digest: 'sha256:<64hex>',
  rights_basis_id: 'PSA_BOUNDED_PRIVATE_EVALUATION_2026_08_24',
  admission_purpose: 'PRIVATE_ER_EVALUATION_ONLY',
  non_enumeration_verified: true,
  enumeration_used: false,
  raw_cert_value_in_repository: false,
  empirical_admissible: true
};
for (const [k,v] of Object.entries(required)) if (m.required_entry_contract?.[k] !== v) fail(`MANIFEST_CONTRACT_${k.toUpperCase()}_INVALID`);
if (m.source_receipt_contract?.receipt_type !== 'KIDULTS_PSA_KNOWN_CERT_SOURCE_RECEIPT') fail('SOURCE_RECEIPT_TYPE_INVALID');
if (m.source_receipt_contract?.synthetic !== false || m.source_receipt_contract?.enumeration_method !== 'NONE') fail('SOURCE_RECEIPT_PROVENANCE_BOUNDARY_INVALID');
if (m.source_receipt_contract?.exact_cert_to_receipt_digest_binding_required !== true || m.source_receipt_contract?.self_asserted_provenance_rejected !== true) fail('SOURCE_RECEIPT_BINDING_INVALID');

for (const token of [
  "KIDULTS_PSA_KNOWN_CERT_SOURCE_RECEIPT",
  "PROGRAM_OWNER_KNOWN_CERT_RECORD",
  "RIGHTS_CLEAR_PRIVATE_SOURCE_RECORD",
  "PROGRAM_OWNER",
  "KPMO_AUTHORIZED_OPERATOR",
  "PSA_BOUNDED_PRIVATE_EVALUATION_2026_08_24",
  "PRIVATE_ER_EVALUATION_ONLY",
  "PSA_ENUMERATION_OR_DISCOVERY_PROHIBITED",
  "PSA_SYNTHETIC_SOURCE_RECEIPT_REJECTED",
  "PSA_CERT_NOT_BOUND_TO_SOURCE_RECEIPT"
]) if (!b.includes(token)) fail(`BUILDER_CONTRACT_TOKEN_MISSING_${token}`);

if (m.production !== 'HOLD' || m.public !== 'HOLD' || m.g5 !== 'HOLD') fail('RELEASE_HOLD_INVALID');
console.log(JSON.stringify({state:'VERIFIED_PASS', manifest_target:120, admissible:0, remaining:120, provenance_bound:true, production:'HOLD', public:'HOLD', g5:'HOLD'}, null, 2));
