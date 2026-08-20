import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const config=JSON.parse(await fs.readFile('coordination/kidults/source-intelligence/coins-na-authentication-grading-infrastructure-r1.json','utf8'));
const outPath=process.argv[2]||'/tmp/coins-na-authentication-grading-infrastructure-r1.json';
const sha=s=>`sha256:${createHash('sha256').update(String(s)).digest('hex')}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const retryable=new Set([429,500,502,503,504]);

async function fetchText(url,owner){
  let last=null;const attempts=[];
  for(let i=0;i<4;i++){
    if(i>0) await sleep(1000);
    try{
      const r=await fetch(url,{headers:{accept:'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1','user-agent':'Mozilla/5.0 (compatible; KIDULTS-ASI-GradingInfra/1.0; bounded internal research)'},redirect:'follow',signal:AbortSignal.timeout(30000)});
      attempts.push({attempt:i+1,status:r.status});
      if(r.ok){const text=await r.text();return {owner,url,status:r.status,final_url:r.url,content_length:Buffer.byteLength(text),content_sha256:sha(text),text,attempts};}
      if(!retryable.has(r.status)) throw new Error(`${owner}_HTTP_${r.status}`);
      const ra=Number(r.headers.get('retry-after')); const wait=Number.isFinite(ra)&&ra>0?Math.min(15000,ra*1000):Math.min(8000,1000*(2**i));
      last=new Error(`${owner}_HTTP_${r.status}`); if(i<3) await sleep(wait);
    }catch(e){last=e;attempts.push({attempt:i+1,error:e?.name||'ERROR'});if(i<3)await sleep(Math.min(8000,1000*(2**i)));}
  }
  throw last||new Error(`${owner}_FETCH_FAILED`);
}
const norm=s=>String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').toLowerCase();
const has=(txt,re)=>re.test(txt);
const observations=[];
for(const s of config.sources){
  const service=await fetchText(s.service_url,s.source_owner_id);
  await sleep(1100);
  const regional=await fetchText(s.regional_access_url,s.source_owner_id);
  const st=norm(service.text), rt=norm(regional.text);
  let servicePass=false, regionalPass=false, semanticChecks={};
  if(s.source_owner_id==='pcgs'){
    semanticChecks={grading:has(st,/\bgrad(?:e|es|ed|ing)\b/),authenticity_or_guarantee:has(st,/\bauthentic(?:ity|ation|ate|ated)\b|\bguarantee\b/),north_america_access:has(rt,/\bunited states\b|\bu\.s\.\b|\busa\b|\bstate\b|\bdealer\b/)};
    servicePass=semanticChecks.grading&&semanticChecks.authenticity_or_guarantee; regionalPass=semanticChecks.north_america_access;
  } else if(s.source_owner_id==='ngc'){
    semanticChecks={grading:has(st,/\bgrad(?:e|es|ed|ing)\b/),service_or_tier:has(st,/\bservice\b|\btier\b|\bfee(?:s)?\b/),north_america_access:has(st+' '+rt,/\bunited states\b|\bu\.s\.\b|\busa\b|\bsarasota\b|\bflorida\b/)};
    servicePass=semanticChecks.grading&&semanticChecks.service_or_tier; regionalPass=semanticChecks.north_america_access;
  }
  observations.push({source_observation_id:`${s.source_owner_id}-official-grading-na-r1`,source_owner_id:s.source_owner_id,service_url:s.service_url,regional_access_url:s.regional_access_url,service_http_status:service.status,regional_http_status:regional.status,service_content_length:service.content_length,regional_content_length:regional.content_length,service_content_sha256:service.content_sha256,regional_content_sha256:regional.content_sha256,service_transport_attempts:service.attempts,regional_transport_attempts:regional.attempts,semantic_checks:semanticChecks,service_semantics_pass:servicePass,regional_access_semantics_pass:regionalPass,observation_pass:servicePass&&regionalPass});
}
const passed=observations.filter(o=>o.observation_pass);
const owners=[...new Set(passed.map(o=>o.source_owner_id))];
const verified=owners.length>=config.minimum_independent_source_owners;
const observedAt=new Date().toISOString();
const assertion={factor_id:config.factor_id,category_scope:config.category_scope,macroregion_id:config.macroregion_id,value_or_unknown:verified?{state:'OBSERVED_MULTI_AUTHORITY_INFRASTRUCTURE',independent_source_owner_count:owners.length}: 'UNKNOWN',observed_at:observedAt,source_observation_ids:passed.map(o=>o.source_observation_id),evidence_refs:config.sources.flatMap(s=>[s.service_url,s.regional_access_url]),rights_state:config.rights_state,provenance_refs:passed.flatMap(o=>[o.service_url,o.regional_access_url,o.service_content_sha256,o.regional_content_sha256]),methodology_version:'regional-market-factor-registry-v1/1.0.0',confidence:verified?config.confidence_ceiling:'NOT_VERIFIED',freshness_state:verified?'CURRENT_OBSERVED':'NOT_VERIFIED'};
const artifact={id:config.id,version:'1.0.0',status:verified?'VERIFIED_BOUNDED_STRUCTURAL_FACTOR':'NOT_VERIFIED_INSUFFICIENT_INDEPENDENT_OFFICIAL_EVIDENCE',factor_assertion:assertion,independent_source_owner_count:owners.length,source_observations:observations,market_scale_claim:false,market_maturity_claim:false,transaction_activity_claim:false,price_claim:false,liquidity_claim:false,demand_claim:false,sales_claim:false,market_share_claim:false,global_weight_claim:false,public_release:'HOLD',production:'HOLD',truth_boundary:config.truth_boundary};
await fs.writeFile(outPath,JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({status:artifact.status,independent_source_owner_count:artifact.independent_source_owner_count,factor_id:assertion.factor_id,category_scope:assertion.category_scope,macroregion_id:assertion.macroregion_id,confidence:assertion.confidence,verified_market_factor:verified,production:'HOLD'},null,2));
if(!verified) process.exitCode=2;
