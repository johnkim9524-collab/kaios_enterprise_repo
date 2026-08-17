import fs from 'node:fs';
const dir=process.argv[2]||'scope-poc-live-out';const x=JSON.parse(fs.readFileSync(`${dir}/scope-self-collection-gap-queue-v1.json`,'utf8'));const fail=s=>{console.error('FAIL',s);process.exit(1)};
if(x.scope_count!==32||x.scopes.length!==32)fail('32 scopes');if(x.product_count!==64)fail('64 products');if(!x.tasks.length)fail('tasks required');
if(x.provider_contact_authorized!==false||x.production!=='HOLD')fail('hold');
for(const s of x.scopes){if(s.provider_requirement_state!=='PENDING_SELF_COLLECTION_EXHAUSTION'||s.provider_contact_authorized!==false)fail(`${s.scope_id}: provider state`)}
for(const t of x.tasks){if(t.provider_contact!==false)fail(`${t.scope_id}: provider contact`);if(!['P0','P1'].includes(t.priority))fail('priority')}
const by=new Set(x.tasks.map(t=>t.representative_product_id));if(by.size!==64)fail('all products must have next tasks');
console.log(JSON.stringify({status:'PASS',scopes:32,products:64,tasks:x.task_count,provider_requirement:'PENDING_SELF_COLLECTION_EXHAUSTION',provider_contact:'HOLD',production:'HOLD'},null,2));