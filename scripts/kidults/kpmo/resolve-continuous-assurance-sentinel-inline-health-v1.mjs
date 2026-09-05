#!/usr/bin/env node
import crypto from 'node:crypto';
import process from 'node:process';
import { evaluateHealth, SPECS } from './resolve-continuous-assurance-sentinel-health-v1.mjs';

const SHA=/^[0-9a-f]{40}$/;
const sha256=(value)=>`sha256:${crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex')}`;

function stable(value){
  if(Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object') return `{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function normalizeSentinelRuns(spec,runs){
  const rows=Array.isArray(runs)?runs:[];
  if(spec.id==='REQUIREMENT') return rows.filter((run)=>run?.conclusion!=='skipped');
  return rows;
}

async function apiJson(apiBase,token,resource,attempts=3){
  let last='UNKNOWN';
  for(let attempt=1;attempt<=attempts;attempt+=1){
    const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'kidults-continuous-assurance-inline-sentinel-v1'};
    if(token) headers.Authorization=`Bearer ${token}`;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(`${apiBase}${resource}`,{headers,signal:controller.signal});
      last=`HTTP_${response.status}`;
      if(response.ok) return await response.json();
      if(![403,429,500,502,503,504].includes(response.status)) throw new Error(`GITHUB_API_${last}`);
    }catch(error){last=String(error?.name==='AbortError'?'TIMEOUT':error?.message||error);}
    finally{clearTimeout(timer);}
    if(attempt<attempts) await new Promise((resolve)=>setTimeout(resolve,attempt*1000));
  }
  throw new Error(`GITHUB_API_READBACK_FAILED:${last}`);
}

async function workflowRuns(repository,spec,sha,apiBase,token){
  const out=[];
  for(let page=1;page<=5;page+=1){
    const data=await apiJson(apiBase,token,`/repos/${repository}/actions/workflows/${spec.workflow}/runs?branch=main&head_sha=${sha}&per_page=100&page=${page}`);
    const rows=Array.isArray(data?.workflow_runs)?data.workflow_runs:[];
    out.push(...rows);
    if(rows.length<100) break;
  }
  return normalizeSentinelRuns(spec,out);
}

function latestApplicable(spec,runs,sha){
  return [...runs]
    .filter((run)=>run?.path===spec.path&&run?.head_branch==='main'&&run?.head_sha===sha&&spec.events.includes(run?.event))
    .sort((a,b)=>Date.parse(a.created_at||0)-Date.parse(b.created_at||0)||Number(a.id)-Number(b.id))
    .at(-1)||null;
}

async function artifacts(repository,runId,apiBase,token){
  for(let attempt=1;attempt<=3;attempt+=1){
    const data=await apiJson(apiBase,token,`/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`,2);
    const rows=Array.isArray(data?.artifacts)?data.artifacts:[];
    if(Number(data?.total_count||0)!==rows.length) throw new Error(`ARTIFACT_INDEX_TRUNCATED:${runId}`);
    if(rows.length||attempt===3) return rows;
    await new Promise((resolve)=>setTimeout(resolve,1500));
  }
  return [];
}

export function failureReceipt(repository,sha,failureClass,observedAt=new Date().toISOString()){
  const base={receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',version:'1.0.0',state:'VERIFIED_FAIL',coverage_scope:'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',repository,source_sha:sha,observed_at:observedAt,producers:[],failed_producers:[],waiting_producers:[],failure_class:String(failureClass||'INLINE_SENTINEL_UNKNOWN_FAILURE').slice(0,300),whole_platform_authority:false,promotion_eligible:false,empirical_delta:0,provider_authority:false,database_authority:false,public:'HOLD',production:'HOLD',g5:'HOLD'};
  return {...base,receipt_digest:sha256(stable(base))};
}

export async function resolveInlineSentinelHealth({repository,sha,apiBase=process.env.GITHUB_API_URL||'https://api.github.com',token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN||'',observedAt=new Date().toISOString()}={}){
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository||'')) throw new Error('SENTINEL_REPOSITORY_INVALID');
  if(!SHA.test(sha||'')) throw new Error('SENTINEL_SOURCE_SHA_INVALID');
  const runs={};
  const artifactsByRun={};
  for(const spec of SPECS){
    runs[spec.id]=await workflowRuns(repository,spec,sha,apiBase,token);
    const latest=latestApplicable(spec,runs[spec.id],sha);
    if(latest?.status==='completed'&&latest?.conclusion==='success') artifactsByRun[latest.id]=await artifacts(repository,latest.id,apiBase,token);
  }
  const receipt=evaluateHealth({repository,source_sha:sha,observed_at:observedAt,runs,artifacts_by_run:artifactsByRun});
  if(receipt.source_sha!==sha||receipt.repository!==repository||receipt.whole_platform_authority!==false||receipt.promotion_eligible!==false) throw new Error('SENTINEL_RECEIPT_BOUNDARY_INVALID');
  return receipt;
}
