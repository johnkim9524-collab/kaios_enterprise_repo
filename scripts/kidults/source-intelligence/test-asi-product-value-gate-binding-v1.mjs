#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'asi-product-value-binding-'));
const apply='scripts/kidults/source-intelligence/apply-asi-product-value-gate-v1.mjs';
const validate='scripts/kidults/source-intelligence/validate-asi-product-value-gate-binding-v1.mjs';
const digest=payload=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
const record=(source_id,display_name,url)=>({source_id,display_name,official_url:url,official_documentation_url:url+'/docs',value_admission_status:'VALUE_ELIGIBLE_CONTINUE_RIGHTS_REVIEW',value_score:80,hard_minimum_complete:true});
const backfill={id:'kidults-asi-product-value-backfill-v1',records:[record('alpha','Alpha Auctions','https://example.com/alpha'),record('beta','Beta Auctions','https://example.com/beta')]};backfill.digest=digest(backfill);
const candidate=(overrides={})=>({candidate_id:'candidate-alpha',provider_record_id:'alpha',endpoint_url:'https://example.com/alpha/',source_owner_hint:'Alpha Auctions',observed_at:new Date().toISOString(),...overrides});
const run=(name,discovery,mutateOutput)=>{const d=path.join(dir,name+'-d.json'),b=path.join(dir,name+'-b.json'),o=path.join(dir,name+'-o.json');fs.writeFileSync(d,JSON.stringify({candidates:[discovery]}));fs.writeFileSync(b,JSON.stringify(backfill));let result=spawnSync(process.execPath,[apply,d,b,o],{encoding:'utf8'});if(result.status!==0)throw new Error(`${name}:APPLY:${result.stderr}`);if(mutateOutput){const x=JSON.parse(fs.readFileSync(o));mutateOutput(x);fs.writeFileSync(o,JSON.stringify(x))}result=spawnSync(process.execPath,[validate,o,b],{encoding:'utf8'});return{result,output:JSON.parse(fs.readFileSync(o))}};
let test=run('positive',candidate());if(test.result.status!==0||test.output.candidate_count!==1)throw new Error('POSITIVE_BINDING_FAILED');
test=run('hostname-collision',candidate({provider_record_id:'beta'}));if(test.result.status!==0||test.output.candidate_count!==0||test.output.product_value_enrichment_queue[0].reason!=='CANONICAL_URL_PATH_MISMATCH')throw new Error('HOSTNAME_PATH_COLLISION_NOT_REJECTED');
test=run('owner-mismatch',candidate({source_owner_hint:'Beta Auctions'}));if(test.result.status!==0||test.output.candidate_count!==0||test.output.product_value_enrichment_queue[0].reason!=='SOURCE_OWNER_SCOPE_MISMATCH')throw new Error('OWNER_SCOPE_MISMATCH_NOT_REJECTED');
test=run('forged-score',candidate(),x=>{x.candidates[0].product_value_score=99});if(test.result.status===0)throw new Error('FORGED_SCORE_ACCEPTED');
test=run('forged-digest',candidate(),x=>{x.product_value_upstream_digest='sha256:'+'0'.repeat(64)});if(test.result.status===0)throw new Error('FORGED_DIGEST_ACCEPTED');
console.log(JSON.stringify({suite:'KIDULTS_ASI_PRODUCT_VALUE_GATE_BINDING_NEGATIVE_V1',result:'PASS',positive_cases:1,negative_cases:4}));
