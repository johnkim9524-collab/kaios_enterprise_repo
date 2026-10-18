import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {coverageGenerationId} from '../../../scripts/kidults/kpmo/validate-kir-coverage-assurance-continuation-v1.mjs';
const repository='johnkim9524-collab/kaios_enterprise_repo',source='a'.repeat(40),time=Date.parse('2026-10-10T00:00:00Z');
const sentinelPath='.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',coveragePath='.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml';
function row({id,upstream=9,conclusion='success',archive=true,pending=false,manual=false,tamper=false}){
  const run={id,run_attempt:1,name:'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1',path:sentinelPath,
    head_branch:'main',head_sha:source,event:'workflow_dispatch',repository:{full_name:repository},head_repository:{full_name:repository},
    created_at:new Date(time-90000+id*1000).toISOString(),status:pending?'in_progress':'completed',conclusion:pending?null:conclusion};
  if(!archive)return {run,artifacts:[]};
  const b={slot:'SENTINEL_CHAIN',exact_main_sha:source,path:coveragePath,coverage_workflow_path:coveragePath,upstream_run_id:upstream,
    upstream_run_attempt:1,run_id:upstream,run_attempt:1,upstream_event:'workflow_run',generation_id:coverageGenerationId({sourceSha:source,runId:upstream,runAttempt:1}),
    continuation_artifact_id:99,continuation_artifact_digest:'sha256:'+'b'.repeat(64),continuation_key:'sha256:'+'c'.repeat(64)};
  const receipt={receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',state:conclusion==='success'?'VERIFIED_PASS':'VERIFIED_FAIL',
    repository,source_sha:source,observer_run_id:id,observer_run_attempt:1,whole_platform_authority:false,promotion_eligible:false,
    public:'HOLD',production:'HOLD',g5:'HOLD',semantic_content_verified:true,producer_cohort_bound:true,
    producers:Array.from({length:4},()=>({state:'VERIFIED_PASS'})),continuation_binding:manual?null:b};
  receipt.receipt_digest=sha256(canonicalJson(receipt));
  const zip=spawnSync('python3',['-c',"import sys,io,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,'w'); z.writestr('kpmo-continuous-assurance-sentinel-health-v1.json',sys.stdin.buffer.read()); z.close(); sys.stdout.buffer.write(b.getvalue())"],{input:JSON.stringify(receipt)});
  assert.equal(zip.status,0);const digest=`sha256:${crypto.createHash('sha256').update(zip.stdout).digest('hex')}`;
  return {run,artifacts:[{id:1000+id,name:`kpmo-continuous-assurance-sentinel-health-v1-${source}-${id}-1`,expired:false,
    workflow_run:{id,head_sha:source},digest:tamper?'sha256:'+'f'.repeat(64):digest}],zip:zip.stdout.toString('base64')};
}
function execute(rows){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sentinel-causal-order-'));
  try{
    const fixture={rows,coverage:{id:9,run_attempt:1,path:coveragePath,head_sha:source,head_branch:'main',event:'workflow_run',status:'completed',conclusion:'success',
      repository:{full_name:repository},head_repository:{full_name:repository},created_at:new Date(time-100000).toISOString()}};
    const preload=`const f=${JSON.stringify(fixture)};let indexReads=0;Date.now=()=>${time}+(indexReads>0?2401000:0);const realTimeout=globalThis.setTimeout;globalThis.setTimeout=(cb,_ms,...args)=>realTimeout(cb,0,...args);globalThis.fetch=async url=>{let value; if(url.includes('/actions/workflows/')){indexReads++;value={total_count:f.rows.length,workflow_runs:f.rows.map(x=>x.run)};}else if(url.endsWith('/actions/runs/9'))value=f.coverage;else if(url.includes('/artifacts?')){const id=Number(url.match(/runs\\/(\\d+)/)[1]);const r=f.rows.find(x=>x.run.id===id);value={total_count:r.artifacts.length,artifacts:r.artifacts};}else if(url.endsWith('/zip')){const id=Number(url.match(/artifacts\\/(\\d+)/)[1]);const r=f.rows.find(x=>x.artifacts[0]?.id===id);return {ok:true,arrayBuffer:async()=>Buffer.from(r.zip,'base64')};}else throw Error('unexpected offline route');return {ok:true,json:async()=>value};};`;
    fs.writeFileSync(path.join(root,'preload.mjs'),preload);
    const result=spawnSync(process.execPath,['--import',path.join(root,'preload.mjs'),'scripts/kidults/kpmo/wait-for-natural-sentinel-terminal-v1.mjs'],{
      cwd:process.cwd(),encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,GITHUB_REPOSITORY:repository,GITHUB_SHA:source,KPMO_SOURCE_SHA:source,
        GITHUB_EVENT_NAME:'workflow_dispatch',GH_TOKEN:'offline',KPMO_COVERAGE_RUN_ID:'9',KPMO_COVERAGE_RUN_ATTEMPT:'1',KPMO_SENTINEL_BARRIER_OUTPUT:path.join(root,'receipt.json')}});
    assert.ifError(result.error);return {result,receipt:JSON.parse(fs.readFileSync(path.join(root,'receipt.json')))};
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('actual barrier binds Coverage C1 despite newer unrelated cancellation and manual success',()=>{
  const {result,receipt}=execute([row({id:10}),row({id:11,upstream:8,conclusion:'cancelled'}),row({id:12,manual:true}),row({id:13,conclusion:'cancelled',archive:false})]);
  assert.equal(result.status,0,result.stderr);assert.equal(receipt.sentinel_run_id,10);assert.equal(receipt.state,'VERIFIED_PASS');
});
test('authenticated matching failure cannot be hidden by unrelated or earlier success',()=>{
  const {result,receipt}=execute([row({id:10}),row({id:11,conclusion:'failure'}),row({id:12,upstream:8})]);
  assert.notEqual(result.status,0);assert.equal(receipt.failure_class,'ASSURANCE_SENTINEL_BARRIER_SENTINEL_FAILURE');
});
test('unbound pending generation exhausts the original deadline without unrelated PASS fallback',()=>{
  const {result,receipt}=execute([row({id:10,upstream:8}),row({id:11,pending:true,archive:false})]);
  assert.notEqual(result.status,0);assert.equal(receipt.failure_class,'ASSURANCE_SENTINEL_BARRIER_NO_AUTHENTICATED_COVERAGE_SENTINEL_TIMEOUT');
});
test('tampered unrelated archive fails closed rather than being silently skipped',()=>{
  const {result,receipt}=execute([row({id:10}),row({id:11,upstream:8,tamper:true})]);
  assert.notEqual(result.status,0);assert.equal(receipt.failure_class,'ASSURANCE_SENTINEL_BARRIER_ARCHIVE_INVALID');
});
