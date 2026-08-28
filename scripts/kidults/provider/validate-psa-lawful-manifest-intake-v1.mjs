#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { buildManifestEntry, validateSourceReceipt } from './build-psa-lawful-manifest-entry-v1.mjs';

const sha256 = value => `sha256:${createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
};
const fixtureCert = '08178895';

function makeReceipt(overrides = {}) {
  const base = {
    schema_version: '1.0.0',
    receipt_type: 'KIDULTS_PSA_KNOWN_CERT_SOURCE_RECEIPT',
    source_class: 'PROGRAM_OWNER_KNOWN_CERT_RECORD',
    rights_basis_id: 'PSA_BOUNDED_PRIVATE_EVALUATION_2026_08_24',
    admission_purpose: 'PRIVATE_ER_EVALUATION_ONLY',
    collector_id: 'PROGRAM_OWNER',
    source_observed_at: '2026-08-28T00:00:00.000Z',
    cert_reference_digest: sha256(fixtureCert),
    source_record_digest: sha256('control-source-record'),
    enumeration_method: 'NONE',
    non_enumeration_verified: true,
    synthetic: true,
    ...overrides
  };
  const { receipt_digest: _drop, ...payload } = base;
  return { ...payload, receipt_digest: sha256(stable(payload)) };
}

const controlReceipt = makeReceipt();
const controlEntry = buildManifestEntry({ certNumber: fixtureCert, receipt: controlReceipt, controlValidation: true });
if (controlEntry.empirical_admissible !== false) throw new Error('PSA_CONTROL_FIXTURE_MUST_NOT_BE_EMPIRICAL');
if (controlEntry.source_authority_verified !== false || controlEntry.empirical_admission_state !== 'HOLD_INDEPENDENT_SOURCE_AUTHORITY_NOT_PROVEN') throw new Error('PSA_SOURCE_AUTHORITY_HOLD_MISSING');
if (controlEntry.raw_cert_value_in_repository !== false || controlEntry.enumeration_used !== false || controlEntry.non_enumeration_verified !== true) throw new Error('PSA_CONTROL_ENTRY_BOUNDARY_INVALID');
if (!/^sha256:[0-9a-f]{64}$/.test(controlEntry.source_receipt_digest)) throw new Error('PSA_SOURCE_RECEIPT_BINDING_INVALID');
if (JSON.stringify(controlEntry).includes(fixtureCert)) throw new Error('PSA_CONTROL_ENTRY_RAW_CERT_LEAK');

const selfHashedReceipt = makeReceipt({ synthetic: false });
validateSourceReceipt(selfHashedReceipt, fixtureCert);
const selfHashedEntry = buildManifestEntry({ certNumber: fixtureCert, receipt: selfHashedReceipt, controlValidation: false });
if (selfHashedEntry.empirical_admissible !== false || selfHashedEntry.source_authority_verified !== false || selfHashedEntry.empirical_admission_state !== 'HOLD_INDEPENDENT_SOURCE_AUTHORITY_NOT_PROVEN') {
  throw new Error('PSA_SELF_HASHED_RECEIPT_FALSE_EMPIRICAL_PROMOTION');
}

const negatives = [
  ['SYNTHETIC_EMPIRICAL', () => validateSourceReceipt(controlReceipt, fixtureCert)],
  ['WRONG_RIGHTS_SCOPE', () => validateSourceReceipt(makeReceipt({ synthetic:false, rights_basis_id:'ARBITRARY_RIGHTS' }), fixtureCert)],
  ['WRONG_PURPOSE', () => validateSourceReceipt(makeReceipt({ synthetic:false, admission_purpose:'PUBLIC_DISPLAY' }), fixtureCert)],
  ['UNAUTHORIZED_COLLECTOR', () => validateSourceReceipt(makeReceipt({ synthetic:false, collector_id:'CALLER_ASSERTED' }), fixtureCert)],
  ['UNAPPROVED_SOURCE_CLASS', () => validateSourceReceipt(makeReceipt({ synthetic:false, source_class:'ARBITRARY_STRING' }), fixtureCert)],
  ['ENUMERATION', () => validateSourceReceipt(makeReceipt({ synthetic:false, enumeration_method:'SEQUENTIAL_SCAN', non_enumeration_verified:false }), fixtureCert)],
  ['CERT_SUBSTITUTION', () => validateSourceReceipt(makeReceipt({ synthetic:false }), '99999999')],
  ['RECEIPT_DIGEST_SUBSTITUTION', () => validateSourceReceipt({ ...makeReceipt({ synthetic:false }), receipt_digest: sha256('forged') }, fixtureCert)],
  ['SOURCE_DIGEST_MISSING', () => validateSourceReceipt(makeReceipt({ synthetic:false, source_record_digest:'NONE' }), fixtureCert)]
];
for (const [name, fn] of negatives) {
  let rejected = false;
  try { fn(); } catch { rejected = true; }
  if (!rejected) throw new Error(`PSA_PROVENANCE_NEGATIVE_FALSE_GREEN:${name}`);
}

console.log(JSON.stringify({
  validator: 'KIDULTS_PSA_LAWFUL_MANIFEST_INTAKE_V3',
  state: 'VERIFIED_PASS',
  provenance_receipt_required: true,
  receipt_digest_verified: true,
  rights_basis_allowlisted: true,
  source_class_allowlisted: true,
  collector_identity_allowlisted: true,
  cert_digest_bound_to_receipt: true,
  non_enumeration_machine_verified: true,
  synthetic_control_fixture_empirical_admissible: false,
  self_hashed_receipt_empirical_admissible: false,
  independent_source_authority_proven: false,
  empirical_admission_state: 'HOLD_INDEPENDENT_SOURCE_AUTHORITY_NOT_PROVEN',
  negative_mutations_rejected: negatives.length,
  live_provider_call: false,
  empirical_delta: 0,
  promotion_eligible: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}, null, 2));
