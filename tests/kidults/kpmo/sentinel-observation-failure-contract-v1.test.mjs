import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildSentinelObservationFailure,sealHealthReceipt,validateHealthReceipt,isUnevaluatedSentinelFailure} from '../../../scripts/kidults/kpmo/sentinel-health-receipt-contract-v1.mjs';
import {validateSentinelObservation} from '../../../scripts/kidults/kpmo/validate-sentinel-observation-v1.mjs';

// Actual factory, actual consumers, actual file reader and actual CLI.
// The receipt identity is synthetic: no workflow, provider or database is invoked.
const env=Object.freeze({GITHUB_REPOSITORY:'johnkim9524-collab/kaios_enterprise_repo',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'900',GITHUB_RUN_ATTEMPT:'1',SENTINEL_RESOLVER_OUTCOME:'failure'});
const fresh=()=>buildSentinelObservationFailure(new Error('SENTINEL_GENERATION_CHANGED_DURING_READ'),env,'2026-09-16T00:00:00Z');
const reseal=(r)=>{const {receipt_digest,...body}=r;return sealHealthReceipt(body);};

test('native classification accepts complete observer failure without downgrading its FAIL',()=>{
 const r=fresh();
 assert.equal(validateHealthReceipt(r,env),env.GITHUB_SHA);
 assert.equal(isUnevaluatedSentinelFailure(r),true);
 const result=validateSentinelObservation(r,env);
 assert.equal(result.observation_integrity,'VERIFIED_PASS');
 assert.equal(result.semantic_health_state,'VERIFIED_FAIL');
 assert.equal(result.classification_only,true);
 assert.equal(result.producer_health_authority,false);
 assert.equal(result.promotion_eligible,false);
 assert.equal(result.strict_separate_gate_required,true);
 assert.deepEqual([result.public,result.production,result.g5],['HOLD','HOLD','HOLD']);
 assert.equal(r.failure_class,'SENTINEL_GENERATION_CHANGED_DURING_READ');
});

test('legacy sealed resolver error is still accepted as error, never producer health',()=>{
 const r=fresh();delete r.producers;delete r.failed_producers;delete r.waiting_producers;
 assert.equal(validateSentinelObservation(reseal(r),env).semantic_health_state,'VERIFIED_FAIL');
});

for(const state of ['VERIFIED_PASS','VERIFIED_HOLD','VERIFIED_FAIL'])test(`native ordinary ${state} aggregation remains unchanged`,()=>{
 const r=fresh();delete r.failure_class;r.state=state;r.semantic_content_verified=state==='VERIFIED_PASS';
 r.producers=r.producers.map(p=>({id:p.id,state,artifact_content_validated:state==='VERIFIED_PASS'}));
 r.failed_producers=state==='VERIFIED_FAIL'?r.producers.map(p=>p.id):[];
 r.waiting_producers=state==='VERIFIED_HOLD'?r.producers.map(p=>p.id):[];
 const result=validateSentinelObservation(reseal(r),{...env,SENTINEL_RESOLVER_OUTCOME:state==='VERIFIED_PASS'?'success':'failure'});
 assert.equal(result.semantic_health_state,state);assert.equal(result.producer_health_authority,false);
});

for(const [name,mutate] of [
 ['missing root cause',r=>{delete r.failure_class;}],
 ['empty root cause',r=>{r.failure_class='';}],
 ['blank root cause',r=>{r.failure_class='  ';}],
 ['missing producer cause',r=>{delete r.producers[0].failure_class;}],
 ['wrong producer cause',r=>{r.producers[0].failure_class='GUESSED_FAILURE';}],
 ['invented selected run',r=>{r.producers[0].selected_run_id=5;}],
 ['invented superseded run',r=>{r.producers[0].superseded_red_run_ids=[4];}],
 ['missing superseded list',r=>{delete r.producers[0].superseded_red_run_ids;}],
 ['invented transport proof',r=>{r.producers[0].artifact_transport_verified=true;}],
 ['invented content proof',r=>{r.producers[0].artifact_content_validated=true;}],
 ['false-string transport flag',r=>{r.producers[0].artifact_transport_verified='false';}],
 ['unobserved producer failure',r=>{r.producers[0].state='VERIFIED_FAIL';r.failed_producers=[r.producers[0].id];r.waiting_producers=r.waiting_producers.slice(1);}],
 ['observer failure downgraded to HOLD',r=>{r.state='VERIFIED_HOLD';}],
 ['failure converted to PASS',r=>{r.state='VERIFIED_PASS';r.semantic_content_verified=true;}],
 ['removed producer',r=>{r.producers.pop();}],
 ['duplicated producer',r=>{r.producers[1]=r.producers[0];}],
 ['wrong failed list',r=>{r.failed_producers=['SHADOW'];}],
 ['wrong waiting list',r=>{r.waiting_producers=[];}],
 ['wrong source',r=>{r.source_sha='b'.repeat(40);}],
 ['wrong attempt',r=>{r.observer_run_attempt='2';}],
 ['provider authority',r=>{r.provider_authority=true;}],
 ['runtime proof',r=>{r.runtime_health_proven=true;}],
 ['publication permission',r=>{r.public='PASS';}],
])test(`native error consumption rejects ${name} even after resealing`,()=>{
 const r=fresh();mutate(r);assert.throws(()=>validateSentinelObservation(reseal(r),env));
});

test('ordinary incorrect aggregate is not excused by error-path support',()=>{
 const r=fresh();delete r.failure_class;r.producers=r.producers.map(p=>({id:p.id,state:'VERIFIED_HOLD'}));
 assert.throws(()=>validateSentinelObservation(reseal(r),env));
});

test('resolver outcome must match FAIL even for a correctly sealed observer error',()=>{
 assert.throws(()=>validateSentinelObservation(fresh(),{...env,SENTINEL_RESOLVER_OUTCOME:'success'}));
});

test('tampering without resealing remains rejected',()=>{
 const r=fresh();r.failure_class='CHANGED';assert.throws(()=>validateSentinelObservation(r,env));
});

for(const tamper of [false,true])test(`real classification CLI preserves failure with tamper=${tamper}`,t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sentinel-native-consumer-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const input=path.join(dir,'receipt.json'),summary=path.join(dir,'summary.md');
 const r=fresh();if(tamper)r.state='VERIFIED_HOLD';
 fs.writeFileSync(input,JSON.stringify(r));
 const script=fileURLToPath(new URL('../../../scripts/kidults/kpmo/validate-sentinel-observation-v1.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[script,input],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,...env,GITHUB_STEP_SUMMARY:summary}});
 assert.equal(result.error,undefined,result.stderr);
 if(tamper){assert.notEqual(result.status,0);assert.equal(fs.existsSync(summary),false);}
 else{
  assert.equal(result.status,0,result.stderr);const output=JSON.parse(result.stdout);
  assert.equal(output.semantic_health_state,'VERIFIED_FAIL');assert.equal(output.producer_health_authority,false);
  assert.ok(fs.readFileSync(summary,'utf8').includes('**VERIFIED_FAIL**'));
 }
});
