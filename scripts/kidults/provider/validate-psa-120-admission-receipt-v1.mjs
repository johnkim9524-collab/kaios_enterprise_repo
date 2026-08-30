import fs from 'node:fs';
const r = JSON.parse(fs.readFileSync('coordination/kidults/provider/psa-120-admission-controls-receipt-v1.json','utf8'));
if (r.state !== 'CONTROL_IMPLEMENTATION_STAGED') throw new Error('PSA_RECEIPT_STATE_INVALID');
for (const [k,v] of Object.entries(r.controls)) if (v !== 'IMPLEMENTED') throw new Error(`PSA_CONTROL_NOT_IMPLEMENTED_${k}`);
if (r.empirical.declared_known_cert_hints !== 2 ||
    r.empirical.declared_known_cert_hints_count_as_progress !== false ||
    r.empirical.provenance_bound_admissible_manifest !== '0/120' ||
    r.empirical.remaining_provenance_bound_admissible !== 120 ||
    r.empirical.live_acquisition !== 'NOT_RUN' ||
    r.empirical.graded_population !== '0/120') throw new Error('PSA_EMPIRICAL_TRUTH_INFLATED');
if ('lawful_known_cert_manifest' in r.empirical) throw new Error('PSA_DECLARED_HINTS_MUST_NOT_BE_LABELED_LAWFUL_PROGRESS');
if (r.authority.live_acquisition_authorized_by_this_receipt !== false || r.authority.production !== 'HOLD' || r.authority.public !== 'HOLD' || r.authority.g5 !== 'HOLD') throw new Error('PSA_AUTHORITY_BOUNDARY_INVALID');
console.log('PSA_ADMISSION_RECEIPT_VERIFIED_PASS');
