import {authenticatedGithubRead} from '../kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs';
import {checkTransport,REPOSITORY} from '../kpmo/validate-sentinel-producer-content-v1.mjs';

const fail=code=>{throw new Error(`REGISTERED_RUNTIME_DISCOVERY_${code}`);};
const need=(ok,code)=>{if(!ok)fail(code);};
const positive=n=>Number.isSafeInteger(n)&&n>0;
const natural=new Set(['push','schedule','workflow_run','repository_dispatch']);
const holds=['production','public','g5','provider_activation'];

// Selection only: subsequent readers must still check ZIP bytes and content.
// No registration, dispatch, provider request, write, or certificate is emitted.
export async function discoverRegisteredRuntimeReferences({inputContract,domainContract,sourceSha,token,
  inputReference,domainReferences={},read=authenticatedGithubRead,now=new Date()}){
  need(/^[a-f0-9]{40}$/.test(sourceSha||'')&&now instanceof Date&&Number.isFinite(now.getTime()),'CONTEXT');
  need(inputContract?.id==='kidults-authenticated-business-input-connection-v1'
    &&domainContract?.id==='kidults-whole-platform-operating-proof-v1'
    &&[inputContract,domainContract].every(c=>c.repository===REPOSITORY&&holds.every(k=>c[k]==='HOLD')),'CONTRACT');
  need(Array.isArray(inputContract.producers)&&inputContract.producers.length<=32
    &&Array.isArray(domainContract.runtime_domain_sources)&&domainContract.runtime_domain_sources.length<=14,'REGISTRY_BOUND');
  need(domainReferences&&typeof domainReferences==='object'&&!Array.isArray(domainReferences),'REFERENCES');
  const inputs=inputContract.producers,domains=domainContract.runtime_domain_sources;
  need(new Set(inputs.map(p=>p.id)).size===inputs.length&&new Set(domains.map(p=>p.domain_id)).size===domains.length,'DUPLICATE_REGISTRATION');
  const registrations=[...inputs.map(p=>({...p,kind:'INPUT',key:p.id})),...domains.map(p=>({...p,kind:'DOMAIN',key:p.domain_id}))];
  for(const p of registrations){
    need(typeof p.key==='string'&&p.key.length>0&&p.key.length<=128
      &&/^kidults-[a-z0-9-]+\.yml$/.test(p.workflow||'')&&/^kidults-[a-z0-9-]+$/.test(p.artifact_prefix||''),'REGISTRATION');
    if(p.kind==='INPUT')need(Array.isArray(p.source_ids)&&p.source_ids.length>0&&p.source_ids.length<=100
      &&new Set(p.source_ids).size===p.source_ids.length&&p.source_ids.every(id=>typeof id==='string'&&id.length>0),'INPUT_SOURCE_SET');
    else need(Array.isArray(domainContract.value_chain_dimensions)&&domainContract.value_chain_dimensions.includes(p.domain_id),'DOMAIN_ID');
  }
  const refs={...domainReferences},diagnostics=[];
  const result=(state,selected)=>({id:'kidults-registered-runtime-reference-discovery-v1',state,source_sha:sourceSha,
    input_reference:selected??inputReference,domain_references:refs,diagnostics,
    selection_is_content_verification:false,dispatch:false,registration:false,external_writes:0,
    production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'});
  const pending=registrations.filter(p=>p.kind==='INPUT'?!inputReference:!refs[p.key]);
  if(!inputs.length&&!inputReference)diagnostics.push({kind:'INPUT',state:'HOLD',blocker:'BUSINESS_INPUT_PRODUCER_NOT_REGISTERED'});
  if(!pending.length)return result('NO_DISCOVERY_REQUIRED');
  if(typeof token!=='string'||!token){diagnostics.push({state:'HOLD',blocker:'REGISTERED_PRODUCER_READ_TOKEN_MISSING'});return result('HOLD');}
  const get=route=>read(`https://api.github.com/repos/${REPOSITORY}/${route}`,token);
  const main=await get('branches/main');
  need(main.name==='main'&&main.protected===true&&main.commit?.sha===sourceSha,'EXACT_PROTECTED_MAIN');
  // Shared workflows and run indexes are read once in this selection pass.
  // Authentication later re-reads the selected run/artifact and live main.
  const runIndexes=new Map(),artifactIndexes=new Map(),candidates=[];
  for(const p of pending){
    if(!runIndexes.has(p.workflow)){
      const query=new URLSearchParams({branch:'main',head_sha:sourceSha,per_page:'100',page:'1'});
      const index=await get(`actions/workflows/${p.workflow}/runs?${query}`);
      need(Array.isArray(index.workflow_runs)&&index.workflow_runs.length<=100
        &&Number.isSafeInteger(index.total_count)&&index.total_count===index.workflow_runs.length,'RUN_INDEX_BOUND');
      need(new Set(index.workflow_runs.map(r=>r.id)).size===index.workflow_runs.length,'RUN_INDEX_DUPLICATE');
      need(index.workflow_runs.every(r=>positive(r.id)&&Number.isFinite(Date.parse(r.created_at))
        &&Date.parse(r.created_at)<=now.getTime()),'RUN_INDEX_IDENTITY');
      runIndexes.set(p.workflow,index.workflow_runs);
    }
    const matching=runIndexes.get(p.workflow).filter(r=>r.path===`.github/workflows/${p.workflow}`
      &&r.repository?.full_name===REPOSITORY&&r.head_branch==='main'&&r.head_sha===sourceSha
      &&r.run_attempt===1&&natural.has(r.event)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id-a.id);
    const run=matching[0];
    let blocker=!run?'NATURAL_EXACT_MAIN_RUN_MISSING':run.status!=='completed'||run.conclusion!=='success'?'LATEST_NATURAL_RUN_NOT_SUCCESS':null;
    const age=p.kind==='INPUT'?inputContract.maximum_age_seconds:Math.min(domainContract.maximum_evidence_age_seconds,7200);
    need(Number.isSafeInteger(age)&&age>0&&age<=7200,'AGE_BOUND');
    if(!blocker&&now.getTime()-Date.parse(run.created_at)>age*1000)blocker='LATEST_NATURAL_RUN_STALE';
    if(blocker){diagnostics.push({kind:p.kind,key:p.key,state:'HOLD',blocker});continue;}
    if(!artifactIndexes.has(run.id)){
      const index=await get(`actions/runs/${run.id}/artifacts?per_page=100`);
      need(Array.isArray(index.artifacts)&&index.artifacts.length<=100
        &&index.total_count===index.artifacts.length,'ARTIFACT_INDEX_BOUND');
      need(new Set(index.artifacts.map(a=>a.id)).size===index.artifacts.length,'ARTIFACT_INDEX_DUPLICATE');
      artifactIndexes.set(run.id,index.artifacts);
    }
    const name=`${p.artifact_prefix}-${sourceSha}-${run.id}-1`;
    const artifacts=artifactIndexes.get(run.id).filter(a=>a.name===name);
    if(!artifacts.length){diagnostics.push({kind:p.kind,key:p.key,state:'HOLD',blocker:'EXACT_NATIVE_ARTIFACT_MISSING'});continue;}
    need(artifacts.length===1,'ARTIFACT_CARDINALITY');
    const artifact=artifacts[0];checkTransport(run,artifact,sourceSha,now.toISOString());
    const reference={run_id:run.id,artifact_id:artifact.id};
    if(p.kind==='INPUT')candidates.push({producer_id:p.id,...reference});else refs[p.key]=reference;
    diagnostics.push({kind:p.kind,key:p.key,state:'REFERENCE_SELECTED_NOT_CONTENT_VERIFIED',run_id:run.id,artifact_id:artifact.id});
  }
  // Distinct input feeds must not be silently combined or selected by recency.
  need(candidates.length<=1,'AMBIGUOUS_BUSINESS_INPUT');
  const fresh=await get('branches/main');
  need(fresh.name==='main'&&fresh.protected===true&&fresh.commit?.sha===sourceSha,'MAIN_CHANGED');
  return result('DISCOVERY_FINISHED_NOT_CONTENT_VERIFIED',candidates[0]);
}
