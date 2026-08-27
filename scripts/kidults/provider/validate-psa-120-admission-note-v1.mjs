import fs from 'node:fs';
const text = fs.readFileSync('coordination/kidults/provider/psa-120-admission-controls-note-v1.md','utf8');
for (const required of ['AES-256-GCM','PRIVATE_ONLY','30-day','lawful-known-cert-only','does not authorize live acquisition','Production','Track B','G5']) {
  if (!text.includes(required)) throw new Error(`PSA_ADMISSION_NOTE_MISSING_${required.replace(/[^A-Za-z0-9]+/g,'_')}`);
}
console.log('PSA_ADMISSION_NOTE_VERIFIED_PASS');
