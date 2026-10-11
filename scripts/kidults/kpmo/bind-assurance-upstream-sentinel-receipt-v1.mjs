// Resolve the exact natural Sentinel archive consumed by this Assurance run.
// Read-only GitHub API access only; no dispatch, retry, or authority mutation.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {canonicalJson,sha256} from './lib/canonical-json-v1.mjs';
import {checkTransport,readArchive} from './validate-sentinel-producer-content-v1.mjs';
import {validateSentinelObservation} from './validate-sentinel-observation-v1.mjs';

const REPOSITORY='johnkim9524-collab/kaios_enterprise_repo';
const SENTINEL_PATH='.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml';
const SENTINEL_NAME='KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1';
const DIGEST=/^sha256:[a-f0-9]{64}$/;
const requireEvidence=(ok,code)=>{if(!ok)throw new Error(`ASSURANCE_SENTINEL_BINDING_${code}`);};

export async function bindAssuranceUpstreamSentinelReceipt({run,sourceSha,get,readBytes,archiveReader=readArchive,observedAt=new Date().toISOString()}){
  requireEvidence(/^[a-f0-9]{40}$/.test(sourceSha||''),'SOURCE_SHA');
  requireEvidence(run?.name===SENTINEL_NAME&&run.path===SENTINEL_PATH&&run.event==='workflow_run'
    &&run.status==='completed'&&run.conclusion==='success'&&run.run_attempt===1
    &&run.head_sha===sourceSha&&run.head_branch==='main'
    &&run.repository?.full_name===REPOSITORY&&String(run.repository?.id)==='1281328888'
    &&run.head_repository?.full_name===REPOSITORY,'EVENT_RUN');
  const live=await get(`actions/runs/${run.id}`);
  requireEvidence(['id','name','path','event','status','conclusion','run_attempt','head_sha','head_branch'].every(k=>live[k]===run[k])
    &&live.repository?.full_name===REPOSITORY&&String(live.repository?.id)==='1281328888'
    &&live.head_repository?.full_name===REPOSITORY,'LIVE_RUN');
  const listing=await get(`actions/runs/${live.id}/artifacts?per_page=100`);
  requireEvidence(Array.isArray(listing.artifacts)&&listing.total_count===listing.artifacts.length&&listing.total_count<=100,'ARTIFACT_LIST');
  const name=`kpmo-continuous-assurance-sentinel-health-v1-${sourceSha}-${live.id}-1`;
  const artifacts=listing.artifacts.filter(a=>a.name===name);
  requireEvidence(artifacts.length===1,'ARTIFACT_CARDINALITY');
  const artifact=artifacts[0];
  checkTransport(live,artifact,sourceSha,observedAt);
  requireEvidence(artifact.workflow_run?.id===live.id&&artifact.workflow_run?.head_sha===sourceSha,'ARTIFACT_RUN');
  const bytes=await readBytes(`actions/artifacts/${artifact.id}/zip`);
  requireEvidence(Buffer.isBuffer(bytes)&&bytes.length===artifact.size_in_bytes,'ARCHIVE_SIZE');
  const packet=archiveReader(bytes,artifact.digest);
  const members=packet.members.filter(m=>m.encoding==='utf-8'&&m.name.split('/').at(-1)==='kpmo-continuous-assurance-sentinel-health-v1.json');
  requireEvidence(members.length===1&&members[0].sha256===sha256(members[0].text),'RECEIPT_MEMBER');
  const receipt=JSON.parse(members[0].text);
  const expectedOutcome=receipt.state==='VERIFIED_PASS'?'success':'failure';
  validateSentinelObservation(receipt,{GITHUB_REPOSITORY:REPOSITORY,GITHUB_SHA:sourceSha,
    GITHUB_RUN_ID:String(live.id),GITHUB_RUN_ATTEMPT:'1',SENTINEL_RESOLVER_OUTCOME:expectedOutcome});
  requireEvidence(receipt.state==='VERIFIED_PASS'&&receipt.observer_run_id===live.id
    &&receipt.observer_run_attempt===1&&receipt.receipt_digest===sha256(canonicalJson(Object.fromEntries(
      Object.entries(receipt).filter(([k])=>k!=='receipt_digest')))),'RECEIPT_BINDING');
  return {run_id:live.id,run_attempt:1,source_sha:sourceSha,artifact_id:artifact.id,
    artifact_digest:artifact.digest,archive_digest:packet.archive_digest,receipt_digest:receipt.receipt_digest};
}

const api=route=>JSON.parse(execFileSync('gh',['api','-H','Accept: application/vnd.github+json',`repos/${REPOSITORY}/${route}`],
  {encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}));
const bytes=route=>execFileSync('gh',['api','-H','Accept: application/vnd.github+json',`repos/${REPOSITORY}/${route}`],
  {timeout:30000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const env=process.env,event=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  requireEvidence(env.GITHUB_EVENT_NAME==='workflow_run'&&env.GITHUB_RUN_ATTEMPT==='1'
    &&env.GITHUB_REPOSITORY===REPOSITORY&&env.GITHUB_REPOSITORY_ID==='1281328888'
    &&env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_WORKFLOW_SHA===env.GITHUB_SHA,'CONTEXT');
  const result=await bindAssuranceUpstreamSentinelReceipt({run:event.workflow_run,sourceSha:env.GITHUB_SHA,get:api,readBytes:bytes});
  requireEvidence(env.GITHUB_ENV,'GITHUB_ENV');
  fs.appendFileSync(env.GITHUB_ENV,`KPMO_UPSTREAM_SOURCE_RECEIPT_DIGEST=${result.receipt_digest}\n`);
  console.log(JSON.stringify({state:'VERIFIED_PASS',...result,authority_granted:false,promotion_eligible:false,
    production:'HOLD',public:'HOLD',g5:'HOLD'}));
}
