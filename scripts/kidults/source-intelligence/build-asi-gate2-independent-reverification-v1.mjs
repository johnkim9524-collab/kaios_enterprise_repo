#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const input=process.argv[2]||'/tmp/asi-gate1-safe-candidate-pool-v1.json';
const out=process.argv[3]||'/tmp/asi-gate2-independent-reverification-v1.json';
const x=JSON.parse(fs.readFileSync(input,'utf8'));
const now=new Date();
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const openPatterns=['cc0','creative commons zero','public domain','cc by 4.0','cc-by-4.0','creative commons attribution 4.0','odc-by','open data commons attribution','pddl','open data commons public domain dedication'];
const rightsText=v=>JSON.stringify(v||'').toLowerCase();
const explicitOpen=v=>openPatterns.some(p=>rightsText(v).includes(p));
async function fetchJson(url,opts={},attempt=0){const c=new AbortController();const t=setTimeout(()=>c.abort(),15000);try{const r=await fetch(url,{...opts,signal:c.signal});if((r.status===429||r.status>=500)&&attempt<2){await sleep(700*(2**attempt));return fetchJson(url,opts,attempt+1)}if(!r.ok)throw new Error(`HTTP_${r.status}`);return await r.json()}finally{clearTimeout(t)}}

const receipts=[],verified=[],conditional=[],clarify=[],blocked=[],stale=[];
for(const c of x.safe_candidate_pool||[]){
  const g1=c.gate_1_receipt||{};const g1At=new Date(g1.verified_at||0);const ageH=(now-g1At)/36e5;const fresh=Number.isFinite(ageH)&&ageH>=0&&ageH<=24;
  let decision='NEEDS_CLARIFICATION';let independentEvidence=null;const reasons=[];
  if(g1.decision!=='PASS_TO_SAFE_CANDIDATE_POOL'){decision='BLOCKED';reasons.push('GATE1_PASS_REQUIRED');}
  else if(!fresh){decision='NEEDS_CLARIFICATION';reasons.push('GATE1_RECEIPT_STALE_OR_INVALID');stale.push(c.candidate_id);}
  else if(c.discovery_provider==='DATACITE_OPEN_RESEARCH_METADATA'&&c.provider_record_id){
    try{
      const doi=encodeURIComponent(c.provider_record_id);const d=await fetchJson(`https://api.datacite.org/dois/${doi}`,{headers:{Accept:'application/vnd.api+json','User-Agent':'KIDULTS-ASI-Gate2-Reverification-v1'}});
      const a=d.data?.attributes||{};const rights=a.rightsList||[];
      independentEvidence={source:'DATACITE_PRIMARY_METADATA_API',provider_record_id:a.doi||c.provider_record_id,observed_at:new Date().toISOString(),rights_list:rights,publisher:a.publisher||null,url:a.url||null,evidence_fingerprint:sha(JSON.stringify({doi:a.doi||c.provider_record_id,rights,publisher:a.publisher||null,url:a.url||null}))};
      if(explicitOpen(rights)){decision='VERIFIED_FOR_GATE_3';reasons.push('INDEPENDENT_PRIMARY_METADATA_REVERIFICATION_CONFIRMED_OPEN_RIGHTS_FOR_DISCOVERY_METADATA_ONLY');}
      else {decision='NEEDS_CLARIFICATION';reasons.push('INDEPENDENT_REVERIFICATION_DID_NOT_CONFIRM_RECOGNIZED_OPEN_RIGHTS');}
    }catch(e){decision='NEEDS_CLARIFICATION';reasons.push(`INDEPENDENT_REVERIFICATION_FAILED:${e.message}`);}
  } else {decision='NEEDS_CLARIFICATION';reasons.push('NO_INDEPENDENT_MACHINE_REVERIFICATION_ADAPTER_FOR_SOURCE');}

  const purposeRights={discover_metadata:decision==='VERIFIED_FOR_GATE_3'?'ALLOW':'UNKNOWN',collect:'UNKNOWN',store:'UNKNOWN',derive:'UNKNOWN',internal_calibration:'UNKNOWN',retention:'UNKNOWN',redistribute:'UNKNOWN',public_project:'UNKNOWN',sold_event_fields:'UNKNOWN',listing_fields:'UNKNOWN',population_or_census_fields:'UNKNOWN'};
  const receipt={receipt_type:'GATE_2_INDEPENDENT_REVERIFICATION_RECEIPT',gate:'GATE_2_INDEPENDENT_LEGAL_COMMERCIAL_REVERIFICATION',source_candidate_id:c.candidate_id,canonical_locator:c.endpoint_url,gate1_receipt_fingerprint:g1.input_fingerprint||null,gate1_decision_used_as_evidence:false,reverified_at:new Date().toISOString(),freshness:{gate1_receipt_age_hours:Number(ageH.toFixed(3)),gate1_receipt_fresh:fresh,ttl_hours:24},decision,reasons,purpose_rights_matrix:purposeRights,independent_evidence:independentEvidence,collection_right_created:false,store_right_created:false,derive_right_created:false,redistribution_right_created:false,acquisition_authorized:false,gate3_required:true,public_projection:false,production:'HOLD'};
  receipts.push(receipt);const wrapped={...c,gate_2_state:decision,gate_2_receipt:receipt,acquisition_authorized:false,production:'HOLD'};
  if(decision==='VERIFIED_FOR_GATE_3')verified.push(wrapped);else if(decision==='VERIFIED_CONDITIONAL_APPROVAL_REQUIRED')conditional.push(wrapped);else if(decision==='BLOCKED')blocked.push(wrapped);else clarify.push(wrapped);
}
const output={id:'kidults-asi-gate2-independent-reverification-v1',version:'1.0.0',status:'SHADOW_GATE2_INDEPENDENT_REVERIFICATION_COMPLETE',requested_purpose:'DISCOVERY_METADATA_INDEX_ONLY',input_safe_candidate_count:(x.safe_candidate_pool||[]).length,verified_for_gate3_count:verified.length,conditional_approval_required_count:conditional.length,needs_clarification_count:clarify.length,blocked_count:blocked.length,stale_gate1_count:stale.length,verified_eligible_pool:verified,conditional_approval_queue:conditional,needs_clarification_queue:clarify,blocked_queue:blocked,stale_gate1_revalidation_queue:stale,receipts,gate1_decision_reuse_forbidden:true,collection_right_created:false,acquisition_authorized:false,public_release:'HOLD',production:'HOLD'};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,input:output.input_safe_candidate_count,verified_for_gate3:output.verified_for_gate3_count,clarification:output.needs_clarification_count,stale_gate1:output.stale_gate1_count,production:'HOLD'},null,2));
