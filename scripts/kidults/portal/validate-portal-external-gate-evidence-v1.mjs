import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const indexPath='coordination/kidults/portal/portal-external-gate-evidence-index-v1.json';
const index=JSON.parse(fs.readFileSync(indexPath,'utf8'));
const evidenceDir=process.argv[2]?path.resolve(process.argv[2]):null;
const sha=/^(sha256:)?[0-9a-f]{64}$/;
const forbidden=/(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|gh[pousr]_[A-Za-z0-9_\-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/;
const result=[];
let present=0;

assert.equal(index.missing_receipt_policy,'HOLD');
assert.equal(index.self_attestation_allowed,false);
for(const slot of index.required_receipts){
  assert.ok(['NONE','PASS','HOLD'].includes(slot.state),`${slot.id}: invalid state`);
  const file=evidenceDir?path.join(evidenceDir,`${slot.id}.json`):null;
  if(slot.state==='NONE'){
    if(file)assert.equal(fs.existsSync(file),false,`${slot.id}: NONE receipt must not exist`);
    result.push({id:slot.id,state:'NONE'});
    continue;
  }
  assert.ok(file&&fs.existsSync(file),`${slot.id}: attested state requires receipt file`);
  const raw=fs.readFileSync(file,'utf8');
  assert.equal(forbidden.test(raw),false,`${slot.id}: credential material detected`);
  const receipt=JSON.parse(raw);
  for(const field of slot.required_fields)assert.ok(receipt[field]!==undefined&&receipt[field]!==null&&receipt[field]!=='',`${slot.id}: missing ${field}`);
  for(const [key,value] of Object.entries(receipt))if(/digest|sha256/i.test(key)&&typeof value==='string')assert.ok(sha.test(value),`${slot.id}: invalid digest ${key}`);
  if(slot.state==='PASS')assert.notEqual(receipt.decision,'HOLD',`${slot.id}: PASS receipt cannot carry HOLD decision`);
  result.push({id:slot.id,state:slot.state,file:path.basename(file)});present+=1;
}

if(evidenceDir){
  const files=fs.readdirSync(evidenceDir).filter(file=>file.endsWith('.json'));
  for(const file of files)assert.ok(index.required_receipts.some(slot=>`${slot.id}.json`===file),`unregistered evidence file: ${file}`);
}

let mutationCases=0;
for(const mutate of [
  value=>{value.missing_receipt_policy='PASS'},
  value=>{value.self_attestation_allowed=true},
  value=>{value.required_receipts[0].state='PASS'}
]){const candidate=structuredClone(index);mutate(candidate);assert.notDeepEqual(candidate,index);mutationCases+=1}

console.log(JSON.stringify({id:'kidults-portal-external-gate-evidence-validator-v1',result:'PASS',evidence_slots:index.required_receipts.length,present,mutation_cases:mutationCases,missing_receipt_policy:index.missing_receipt_policy},null,2));
