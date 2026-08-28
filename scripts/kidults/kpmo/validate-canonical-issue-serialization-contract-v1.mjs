import fs from 'node:fs';
const c=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/canonical-issue-serialization-v1.json','utf8'));
if(c.id!=='KPMO_CANONICAL_ISSUE_SERIALIZATION_V1') process.exit(1);
if(!c.correction.includes('cancel-in-progress false')) process.exit(1);
if(c.production!=='HOLD'||c.public!=='HOLD'||c.g5!=='HOLD') process.exit(1);
console.log('CANONICAL_ISSUE_SERIALIZATION_CONTRACT_VERIFIED_PASS');
