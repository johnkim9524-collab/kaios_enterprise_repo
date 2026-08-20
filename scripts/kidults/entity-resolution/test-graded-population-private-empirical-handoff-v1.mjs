import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const dir='/tmp/kidults-graded-handoff-contract-test';await fs.rm(dir,{recursive:true,force:true});await fs.mkdir(dir,{recursive:true});
const sampling=JSON.parse(await fs.readFile('coordination/kidults/entity-resolution/empirical-validation-sampling-plan-r1.json','utf8'));
const operational=JSON.parse(await fs.readFile('coordination/kidults/entity-resolution/human-review-gate-operational-contract-r1.json','utf8'));
const hex=v=>createHash('sha256').update(String(v)).digest('hex');
const expand=o=>Object.entries(o).flatMap(([k,n])=>Array.from({length:n},()=>k));
function casesFor(s){const cls=expand(s.case_class_targets),b=expand(s.identity_boundary_targets);return Array.from({length:s.cases},(_,i)=>({case_id:`fixture-${s.stratum_id}-${String(i+1).padStart(3,'0')}`,stratum_id:s.stratum_id,case_class:cls[i],identity_boundary:b[i],source_a_reference:`fixture-private://a/${s.stratum_id}/${i}`,source_b_reference:`fixture-private://b/${s.stratum_id}/${i}`,source_a_payload_sha256:`sha256:${hex(`a:${s.stratum_id}:${i}`)}`,source_b_payload_sha256:`sha256:${hex(`b:${s.stratum_id}:${i}`)}`,license_evidence_refs:['https://example.invalid/license/contract-test'],rights_state:'ALLOW',provenance_refs:[`CONTRACT_TEST_FIXTURE_ONLY:${s.stratum_id}:${i}`]}));}
const graded=sampling.strata.find(s=>s.stratum_id==='er-stratum-graded-population');const nongraded=sampling.strata.filter(s=>s.stratum_id!=='er-stratum-graded-population');
const base={id:'kidults-er-720-contract-test-fixture',fixture_classification:'CONTRACT_TEST_FIXTURE_ONLY',dataset_class:operational.input.dataset_class_required,production:'HOLD',cases:nongraded.flatMap(casesFor)};
const handoff={schema_version:'1.0.0',handoff_id:'kidults-er-graded-120-contract-test-fixture',state:'PRIVATE_EMPIRICAL_HANDOFF_READY',provider_id:'fixture-provider',rights_attestation_id:'fixture-rights-1',private_only:true,raw_provider_payload_embedded:false,secrets_embedded:false,cases:casesFor(graded),production:'HOLD',public_release:'HOLD',fixture_classification:'CONTRACT_TEST_FIXTURE_ONLY'};
const rights={schema_version:'1.0.0',rights_attestation_id:'fixture-rights-1',provider_id:'fixture-provider',status:'FIELD_BY_PURPOSE_RIGHTS_PASS',purpose_rights:{collect:'PASS',store_private:'PASS',derive_internal_er_calibration:'PASS',internal_reviewer_display:'PASS',retention:'PASS',public_display:'BLOCK',redistribute:'BLOCK'},terms_or_license_evidence_refs:['https://example.invalid/terms/contract-test'],attested_by:'FIXTURE_ONLY',attested_at:'2026-08-20T00:00:00Z',production:'HOLD',public_release:'HOLD',fixture_classification:'CONTRACT_TEST_FIXTURE_ONLY'};
const write=async(n,v)=>{const p=`${dir}/${n}`;await fs.writeFile(p,`${JSON.stringify(v,null,2)}\n`);return p;};
const baseP=await write('base.json',base),handP=await write('handoff.json',handoff),rightsP=await write('rights.json',rights),receiptP=`${dir}/receipt.json`,outP=`${dir}/combined.json`;
const run=(args)=>execFileSync(process.execPath,args,{stdio:['ignore','pipe','pipe'],encoding:'utf8'}).trim();
run(['scripts/kidults/entity-resolution/validate-graded-population-private-empirical-handoff-v1.mjs',handP,rightsP,receiptP,'--contract-test-fixture']);
run(['scripts/kidults/entity-resolution/assemble-er-840-from-graded-private-handoff-v1.mjs',baseP,handP,rightsP,receiptP,outP,'--contract-test-fixture']);
const combined=JSON.parse(await fs.readFile(outP,'utf8'));if(combined.cases.length!==840)throw new Error('CONTRACT_TEST_840_REQUIRED');
function mustFail(name,mutate){const x=structuredClone(handoff);mutate(x);const p=`${dir}/${name}.json`;return fs.writeFile(p,`${JSON.stringify(x,null,2)}\n`).then(()=>{try{run(['scripts/kidults/entity-resolution/validate-graded-population-private-empirical-handoff-v1.mjs',p,rightsP,`${dir}/${name}-receipt.json`,'--contract-test-fixture']);throw new Error(`NEGATIVE_TEST_DID_NOT_FAIL:${name}`);}catch(e){if(String(e.message).includes('NEGATIVE_TEST_DID_NOT_FAIL'))throw e;}});}
await mustFail('secret-field',x=>{x.cases[0].authorization='Bearer fixture-secret-value-123456789';});
await mustFail('label-field',x=>{x.cases[0].expected='MATCH';});
await mustFail('quota-drift',x=>{x.cases[0].case_class='HARD_NEGATIVE';});
console.log(JSON.stringify({status:'PASS',fixture_only:true,provider_network_requests:0,base_cases:720,graded_cases:120,combined_cases:840,negative_secret_rejection:'PASS',negative_label_rejection:'PASS',negative_quota_rejection:'PASS',production:'HOLD'}));
