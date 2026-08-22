#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex').slice(0,24);

async function get(url,attempt=0){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(url,{
      signal:controller.signal,
      headers:{Accept:'application/json,text/plain','User-Agent':'KIDULTS-ASI-Common-Crawl-Host-Expansion-v2'}
    });
    if((response.status===429||response.status>=500)&&attempt<2){
      await sleep(700*(2**attempt));
      return get(url,attempt+1);
    }
    if(!response.ok)throw new Error(`HTTP_${response.status}`);
    return response;
  }finally{
    clearTimeout(timer);
  }
}

function normalizedHost(value){
  try{
    return new URL(String(value||'')).hostname.toLowerCase().replace(/^www\./,'');
  }catch{
    return null;
  }
}

export async function expandCommonCrawlHosts(discovery,options={}){
  const maxSeedHosts=Math.min(8,Math.max(0,Number(options.maxSeedHosts??8)));
  const pageSize=Math.min(8,Math.max(1,Number(options.pageSize??8)));
  const inputCandidates=Array.isArray(discovery?.candidates)?discovery.candidates:[];
  const seedHosts=[];

  for(const candidate of inputCandidates){
    const host=normalizedHost(candidate?.endpoint_url);
    if(host&&!seedHosts.includes(host))seedHosts.push(host);
    if(seedHosts.length>=maxSeedHosts)break;
  }

  let indexId=null;
  let indexApi=null;
  const observations=[];
  const errors=[];

  try{
    const response=await get('https://index.commoncrawl.org/collinfo.json');
    const indexes=await response.json();
    const latest=indexes?.[0];
    indexId=latest?.id||null;
    indexApi=latest?.['cdx-api']||null;
    if(!indexApi)throw new Error('NO_LATEST_INDEX_API');
  }catch(error){
    errors.push(`INDEX_DISCOVERY:${error.message}`);
  }

  if(indexApi){
    for(const host of seedHosts){
      try{
        const url=new URL(indexApi);
        url.searchParams.set('url',host);
        url.searchParams.set('matchType','domain');
        url.searchParams.set('output','json');
        url.searchParams.set('filter','status:200');
        url.searchParams.set('collapse','urlkey');
        url.searchParams.set('pageSize',String(pageSize));
        const response=await get(url);
        const body=await response.text();
        let emittedForHost=0;

        for(const line of body.split(/\r?\n/)){
          if(!line.trim())continue;
          let row;
          try{row=JSON.parse(line);}catch{continue;}
          const observedHost=normalizedHost(row?.url);
          if(!observedHost||!(observedHost===host||observedHost.endsWith(`.${host}`)))continue;

          observations.push({
            candidate_id:`cand-cc-host-${hash(`${host}|${observedHost}`)}`,
            seed_host:host,
            observed_host:observedHost,
            endpoint_url:`https://${observedHost}`,
            source_name:observedHost,
            source_owner_hint:'UNKNOWN',
            discovery_provider:'COMMON_CRAWL_URL_INDEX_HOST_EXPANSION',
            discovery_channel:'COMMON_CRAWL_AND_WEB_DATA_COMMONS_STRUCTURED_WEB_INDEX',
            provider_record_id:row.urlkey||row.digest||null,
            observed_at:new Date().toISOString(),
            common_crawl_index_id:indexId,
            common_crawl_observed_url_metadata:row.url||null,
            http_status_metadata:row.status||null,
            mime_metadata:row.mime||null,
            live_external_observation:true,
            source_family_hint:'UNCLASSIFIED_ANY_SITE_CANDIDATE',
            candidate_source_roles:['UNCLASSIFIED_PENDING_RELEVANCE'],
            rights_state:'UNASSESSED',
            admission_state:'NOT_ADMITTED',
            gate_1_state:'PENDING',
            evidence_state:'DISCOVERY_METADATA_ONLY',
            metadata_index_only:true,
            acquisition_authorized:false,
            target_site_body_crawled:false,
            content_acquired:false,
            provider_contacted:false,
            account_created:false,
            eula_accepted:false,
            spend_authorized:false,
            production:'HOLD'
          });
          emittedForHost++;
          if(emittedForHost>=pageSize)break;
        }
        await sleep(120);
      }catch(error){
        errors.push(`${host}:${error.message}`);
      }
    }
  }

  const candidates=[...new Map(observations.map(candidate=>[candidate.endpoint_url,candidate])).values()]
    .sort((a,b)=>a.endpoint_url.localeCompare(b.endpoint_url));

  return {
    id:'kidults-asi-common-crawl-host-expansion-v1',
    version:'1.1.0',
    status:candidates.length?'SHADOW_COMMON_CRAWL_HOST_EXPANSION_COMPLETE':'SHADOW_COMMON_CRAWL_HOST_EXPANSION_ZERO_RESULTS',
    universe_target:'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',
    input_candidate_count:Number(discovery?.candidate_count??inputCandidates.length),
    seed_host_count:seedHosts.length,
    seed_hosts:seedHosts,
    common_crawl_index_id:indexId,
    common_crawl_index_api:indexApi,
    expanded_candidate_count:candidates.length,
    candidates,
    errors,
    metadata_index_only:true,
    target_site_body_crawled:false,
    content_acquired:false,
    rights_promoted:false,
    admission_promoted:false,
    acquisition_authorized:false,
    public_release:'HOLD',
    production:'HOLD'
  };
}

async function runCli(){
  const input=process.argv[2]||'discovery-out/global-low-risk-discovery.json';
  const out=process.argv[3]||'/tmp/asi-common-crawl-host-expansion-v1.json';
  const discovery=JSON.parse(fs.readFileSync(input,'utf8'));
  const output=await expandCommonCrawlHosts(discovery);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify({
    status:output.status,
    index_id:output.common_crawl_index_id,
    seed_hosts:output.seed_host_count,
    expanded_candidates:output.expanded_candidate_count,
    errors:output.errors.length,
    production:'HOLD'
  }));
}

const invokedAsCli=Boolean(process.argv[1])&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url;
if(invokedAsCli)await runCli();
