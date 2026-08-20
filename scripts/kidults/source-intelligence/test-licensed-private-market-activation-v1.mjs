import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const contract=JSON.parse(await fs.readFile('coordination/kidults/source-intelligence/classiccom-licensed-private-market-activation-v1.json','utf8'));
const dir='/tmp/kidults-private-market-activation-test';await fs.rm(dir,{recursive:true,force:true});await fs.mkdir(dir,{recursive:true});
const h=s=>`sha256:${createHash('sha256').update(s).digest('hex')}`;
const base={schema_version:'1.0.0',activation_attestation_id:'fixture-activation-1',provider_id:contract.provider_id,provider_path:contract.provider_path,claim_class:contract.claim_class_target,fields:[...contract.required_fields],regional_fields_admitted:false,rights_status:'FIELD_BY_PURPOSE_RIGHTS_PASS',purpose_rights:{collect:'PASS',store_private:'PASS',derive_internal_market_metrics:'PASS',internal_review_display:'PASS',retention:'PASS',raw_public_display:'BLOCK',redistribute:'BLOCK'},private_store_runtime:'PASS',ttl_days:7,credential_boundary:'SECRET_MANAGER_ONLY',automation_rights:'PASS',historical_cleanup_review:'COMPLETE',agreement_reference_hash:h('fixture-agreement'),rights_decision_ref:h('fixture-rights'),attested_by:'FIXTURE_ONLY',attested_at:'2026-08-20T00:00:00Z',production:'HOLD',public_release:'HOLD',fixture_classification:'CONTRACT_TEST_FIXTURE_ONLY'};
const run=p=>execFileSync(process.execPath,['scripts/kidults/source-intelligence/validate-licensed-private-market-activation-v1.mjs',p,`${p}.receipt.json`,'--contract-test-fixture'],{stdio:['ignore','pipe','pipe'],encoding:'utf8'}).trim();
async function write(n,v){const p=`${dir}/${n}.json`;await fs.writeFile(p,`${JSON.stringify(v,null,2)}\n`);return p;}
run(await write('valid',base));
async function mustFail(name,mutate){const x=structuredClone(base);mutate(x);const p=await write(name,x);try{run(p);throw new Error(`NEGATIVE_TEST_DID_NOT_FAIL:${name}`);}catch(e){if(String(e.message).includes('NEGATIVE_TEST_DID_NOT_FAIL'))throw e;}}
await mustFail('rights-pending',x=>{x.rights_status='PENDING';});
await mustFail('field-expansion',x=>{x.fields.push('image_url');});
await mustFail('cleanup-pending',x=>{x.historical_cleanup_review='PENDING';});
await mustFail('redistribution-pass',x=>{x.purpose_rights.redistribute='PASS';});
await mustFail('private-runtime-pending',x=>{x.private_store_runtime='PENDING';});
console.log(JSON.stringify({status:'PASS',fixture_only:true,provider_network_requests:0,positive_activation_preflight:'PASS',negative_rights_pending:'PASS',negative_field_expansion:'PASS',negative_cleanup_pending:'PASS',negative_redistribution:'PASS',negative_private_runtime:'PASS',active_market_evidence_created:false,production:'HOLD'}));
