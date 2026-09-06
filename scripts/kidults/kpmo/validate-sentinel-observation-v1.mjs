import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {readSentinelEvent} from './validate-sentinel-trigger-v1.mjs';

const stable=x=>Array.isArray(x)?`[${x.map(stable).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${stable(x[k])}`).join(',')}}`:JSON.stringify(x);
const digest=x=>`sha256:${crypto.createHash('sha256').update(stable(x)).digest('hex')}`;
const ids=['SHADOW','REQUIREMENT','RESERVE','CANONICAL_TRUTH'];
const states=new Set(['VERIFIED_PASS','VERIFIED_HOLD','VERIFIED_FAIL']);
// A successful classification transport does NOT mean healthy producers. Keep
// the strict, separate sentinel gate intact; FAIL/HOLD remain FAIL/HOLD in the
// artifact and summary. Never accept bootstrap, mismatched or unsealed content.
export function validateSentinelObservation(r,env){
  assert.equal(env.GITHUB_REPOSITORY,'johnkim9524-collab/kaios_enterprise_repo');
  assert.match(env.GITHUB_SHA||'',/^[0-9a-f]{40}$/);
  assert.equal(r?.receipt_id,'kpmo-continuous-assurance-sentinel-health-v1');
  assert.equal(r.version,'1.0.0');
  assert.equal(r.repository,env.GITHUB_REPOSITORY);
  assert.equal(r.source_sha,env.GITHUB_SHA);
  for(const [key,value] of [['observer_run_id',env.GITHUB_RUN_ID],['observer_run_attempt',env.GITHUB_RUN_ATTEMPT]]){
    assert.match(value||'',/^[1-9][0-9]*$/);assert.ok(Number.isSafeInteger(Number(value)));
    assert.ok(r[key]===Number(value)||r[key]===value);
  }
  assert.equal(r.coverage_scope,'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM');
  for(const key of ['runtime_health_proven','whole_platform_authority','promotion_eligible','provider_authority','database_authority'])assert.equal(r[key],false);
  for(const key of ['public','production','g5'])assert.equal(r[key],'HOLD');
  assert.equal(r.empirical_delta,0);assert.ok(states.has(r.state));
  assert.equal(r.semantic_content_verified,r.state==='VERIFIED_PASS');
  const {receipt_digest,...body}=r;
  assert.match(receipt_digest||'',/^sha256:[0-9a-f]{64}$/);
  assert.equal(receipt_digest,digest(body));
  if(Object.hasOwn(r,'producers')){
    assert.ok(Array.isArray(r.producers));
    assert.deepEqual(r.producers.map(p=>p.id),ids);
    assert.ok(r.producers.every(p=>states.has(p.state)));
    const failures=r.producers.filter(p=>p.state==='VERIFIED_FAIL').map(p=>p.id);
    const waiting=r.producers.filter(p=>p.state==='VERIFIED_HOLD').map(p=>p.id);
    assert.deepEqual(r.failed_producers,failures);assert.deepEqual(r.waiting_producers,waiting);
    assert.equal(r.state,failures.length?'VERIFIED_FAIL':waiting.length?'VERIFIED_HOLD':'VERIFIED_PASS');
    if(r.state==='VERIFIED_PASS')assert.ok(r.producers.every(p=>p.artifact_content_validated===true));
  }else{
    assert.equal(r.state,'VERIFIED_FAIL');assert.equal(typeof r.failure_class,'string');assert.ok(r.failure_class.length>0);
  }
  assert.equal(env.SENTINEL_RESOLVER_OUTCOME,r.state==='VERIFIED_PASS'?'success':'failure');
  return {observation_integrity:'VERIFIED_PASS',semantic_health_state:r.state,
    classification_only:true,producer_health_authority:false,promotion_eligible:false,
    strict_separate_gate_required:true,public:'HOLD',production:'HOLD',g5:'HOLD'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=validateSentinelObservation(readSentinelEvent(process.argv[2]),process.env);
  console.log(JSON.stringify(result));
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Producer classification (not health authorization)\n\nSemantic health: **${result.semantic_health_state}**.\n\nThis job validates receipt integrity only. Separate strict health gate and Production/Public/G5 HOLD remain.\n`);
}
