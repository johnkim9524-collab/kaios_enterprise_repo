import fs from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('usage: node validate-source-admission-record-v1.mjs <record.json>');
const r = JSON.parse(fs.readFileSync(file, 'utf8'));
const purposes = ['discover','collect','store','derive','display_internal','display_public'];
const allowed = new Set(['ALLOW','CONDITIONAL','DENY','UNKNOWN']);
for (const p of purposes) {
  if (!r.rights || !allowed.has(r.rights[p])) throw new Error(`invalid rights.${p}`);
}
const hardFail = ['collect','store','derive'].some((p) => ['DENY','UNKNOWN'].includes(r.rights[p]));
if (hardFail && r.state === 'ADMITTED') throw new Error('fail-closed violation: ADMITTED with DENY/UNKNOWN collect/store/derive');
if (r.state === 'ADMITTED' && r.technical_validity !== 'PASS') throw new Error('ADMITTED requires technical_validity PASS');
if (r.state === 'ADMITTED' && !['SUFFICIENT','LIMITED'].includes(r.evidence_validity)) throw new Error('ADMITTED requires non-UNKNOWN evidence validity');
if (r.rights.display_public !== 'ALLOW' && r.publication_eligible === true) throw new Error('publication requires display_public ALLOW');
console.log(JSON.stringify({source_id:r.source_id,state:r.state,validation:'PASS',production:'HOLD'}));
