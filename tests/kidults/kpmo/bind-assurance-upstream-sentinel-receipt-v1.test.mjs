import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {digest} from '../../../scripts/kidults/kpmo/validate-sentinel-producer-content-v1.mjs';
import {bindAssuranceUpstreamSentinelReceipt} from '../../../scripts/kidults/kpmo/bind-assurance-upstream-sentinel-receipt-v1.mjs';

const repository='johnkim9524-collab/kaios_enterprise_repo',sha='a'.repeat(40);
const text=x=>JSON.stringify(x,null,2)+'\n';
const zip=(entries)=>Buffer.from(entries.map(([name,value])=>`${name}\0${value}`).join('\0'));
function fixture(){
  const run={id:901,name:'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1',
    path:'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',event:'workflow_run',
    status:'completed',conclusion:'success',run_attempt:1,head_sha:sha,head_branch:'main',
    created_at:'2026-10-11T10:59:00Z',run_started_at:'2026-10-11T10:59:01Z',
    repository:{full_name:repository,id:1281328888},head_repository:{full_name:repository}};
  const body={receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',version:'1.0.0',
    repository,source_sha:sha,observer_run_id:901,observer_run_attempt:1,
    coverage_scope:'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',runtime_health_proven:false,
    whole_platform_authority:false,promotion_eligible:false,provider_authority:false,database_authority:false,
    public:'HOLD',production:'HOLD',g5:'HOLD',empirical_delta:0,state:'VERIFIED_PASS',
    semantic_content_verified:true,
    producers:['SHADOW','REQUIREMENT','RESERVE','CANONICAL_TRUTH'].map(id=>({id,state:'VERIFIED_PASS',artifact_content_validated:true})),
    failed_producers:[],waiting_producers:[]};
  const receipt={...body,receipt_digest:sha256(canonicalJson(body))};
  const receiptText=text(receipt),bytes=zip([['kpmo-continuous-assurance-sentinel-health-v1.json',receiptText]]),artifact={
    id:902,name:`kpmo-continuous-assurance-sentinel-health-v1-${sha}-901-1`,size_in_bytes:bytes.length,
    expired:false,digest:digest(bytes),created_at:'2026-10-11T11:00:00Z',expires_at:'2027-01-09T11:00:00Z',
    workflow_run:{id:901,head_sha:sha}};
  const calls=[];
  const get=async route=>{calls.push(route);if(route==='actions/runs/901')return run;
    if(route==='actions/runs/901/artifacts?per_page=100')return {total_count:1,artifacts:[artifact]};
    throw new Error(`unexpected ${route}`);};
  const archiveReader=(input,expected)=>{
    assert.equal(digest(input),expected);
    return {archive_digest:expected,extraction_performed:false,members:[{
      name:'kpmo-continuous-assurance-sentinel-health-v1.json',encoding:'utf-8',text:receiptText,
      sha256:digest(receiptText)}]};
  };
  return {run,receipt,bytes,artifact,calls,get,readBytes:async()=>bytes,archiveReader};
}
test('binds the exact live Sentinel run, artifact bytes, and sealed receipt digest',async()=>{
  const f=fixture(),result=await bindAssuranceUpstreamSentinelReceipt({run:f.run,sourceSha:sha,get:f.get,readBytes:f.readBytes,archiveReader:f.archiveReader,observedAt:'2026-10-11T11:30:00Z'});
  assert.equal(result.receipt_digest,f.receipt.receipt_digest);
  assert.deepEqual(f.calls,['actions/runs/901','actions/runs/901/artifacts?per_page=100']);
});
for(const [name,mutate] of [
  ['manual Sentinel event',f=>{f.run.event='workflow_dispatch';}],
  ['borrowed source SHA',f=>{f.run.head_sha='b'.repeat(40);}],
  ['wrong artifact digest',f=>{f.artifact.digest='sha256:'+'0'.repeat(64);}],
  ['duplicate exact artifact',f=>{f.get=async route=>route==='actions/runs/901'?f.run:
    route.endsWith('/artifacts?per_page=100')?{total_count:2,artifacts:[f.artifact,{...f.artifact,id:903}]}:null;}],
  ['archive bytes mismatch',f=>{f.readBytes=async()=>Buffer.from('tampered');}],
])test(`rejects ${name}`,async()=>{const f=fixture();mutate(f);await assert.rejects(bindAssuranceUpstreamSentinelReceipt({run:f.run,sourceSha:sha,get:f.get,readBytes:f.readBytes,archiveReader:f.archiveReader,observedAt:'2026-10-11T11:30:00Z'}));});
