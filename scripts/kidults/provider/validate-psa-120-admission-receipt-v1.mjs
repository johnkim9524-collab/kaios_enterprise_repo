import fs from 'node:fs';
const r = JSON.parse(fs.readFileSync('coordination/kidults/provider/psa-120-admission-controls-receipt-v1.json','utf8'));
if (r.state !== 'CONTROL_IMPLEMENTATION_STAGED') throw new Error('PSA_RECEIPT_STATE_INVALID');
for (const [k,v] of Object.entries(r.controls)) if (v !== 'IMPLEMENTED') throw new Error(`PSA_CONTROL_NOT_IMPLEMENTED_${k}`);
if (r.empirical.lawful_known_cert_manifest !== '2/120' || r.empirical.live_acquisition !== 'NOT_RUN' || r.empirical.graded_population !== '0/120') throw new Error('PSA_EMPIRICAL_TRUTH_INFLATED');
if (r.authority.live_acquisition_authorized_by_this_receipt !== false || r.authority.production !== 'HOLD' || r.authority.public !== 'HOLD' || r.authority.g5 !== 'HOLD') throw new Error('PSA_AUTHORITY_BOUNDARY_INVALID');
console.log('PSA_ADMISSION_RECEIPT_VERIFIED_PASS');
