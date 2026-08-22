#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const input=process.argv[2]||'discovery-out/global-low-risk-discovery.json';
const out=process.argv[3]||'/tmp/asi-gate1-safe-candidate-pool-v1.json';
const x=JSON.parse(fs.readFileSync(input,'utf8'));
const now=new Date().toISOString();
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const text=v=>JSON.stringify(v||'').toLowerCase();
const openLicensePatterns=[
  'cc0','creative commons zero','public domain','cc by 4.0','cc-by-4.0','creative commons attribution 4.0',
  'odc-by','open data commons attribution','pddl','open data commons public domain dedication','mit license','apache license 2.0'
];
const explicitOpen=c=>openLicensePatterns.some(p=>text(c.metadata?.rights_list).includes(p));
const hardBlock=c=>Boolean(c.circumvention_required||c.credential_sharing_required||c.explicit_terms_prohibition||c.known_unauthorized_source||c.malicious_or_deceptive_identity);
const completeIdentity=c=>Boolean(c.candidate_id&&c.endpoint_url&&c.discovery_provider&&c.discovery_channel&&c.observed_at);

const receipts=[];const safe=[];const review=[];const blocked=[];
for(const c of x.candidates||[]){
  let decision='REVIEW_REQUIRED';const reasons=[];
  if(!completeIdentity(c)){decision='HARD_BLOCK';reasons.push('INCOMPLETE_SOURCE_IDENTITY_OR_PROVENANCE');}
  else if(hardBlock(c)){decision='HARD_BLOCK';reasons.push('EXPLICIT_HARD_BLOCK_SIGNAL');}
  else if(c.discovery_provider==='DATACITE_OPEN_RESEARCH_METADATA'&&explicitOpen(c)){
    decision='PASS_TO_SAFE_CANDIDATE_POOL';
    reasons.push('EXPLICIT_OPEN_RIGHTS_SIGNAL_FOR_DISCOVERY_METADATA_INDEX_ONLY');
  } else {
    reasons.push('TARGET_SOURCE_TERMS_OR_PURPOSE_RIGHTS_NOT_YET_PROVEN');
  }
  const receipt={
    receipt_type:'GATE_1_INGRESS_RECEIPT',gate:'GATE_1_ASI_INGRESS_VERIFICATION',source_candidate_id:c.candidate_id,
    canonical_locator:c.endpoint_url,source_owner_hint:c.source_owner_hint||'UNKNOWN',discovery_provider:c.discovery_provider,
    observed_at:c.observed_at,verified_at:now,purpose:'DISCOVERY_METADATA_INDEX_ONLY',decision,reasons,
    primary_reference_signals:{rights_list:c.metadata?.rights_list||[],documentation_url:c.metadata?.documentation_url||null,access_mode:c.metadata?.access_mode||null},
    input_fingerprint:sha(JSON.stringify({candidate_id:c.candidate_id,endpoint_url:c.endpoint_url,provider:c.discovery_provider,observed_at:c.observed_at,metadata:c.metadata||{}})),
    collection_right_created:false,store_right_created:false,derive_right_created:false,redistribution_right_created:false,
    acquisition_authorized:false,public_projection:false,production:'HOLD'
  };
  receipts.push(receipt);
  const wrapped={...c,gate_1_state:decision==='PASS_TO_SAFE_CANDIDATE_POOL'?'PASS':decision,gate_1_receipt:receipt,acquisition_authorized:false,production:'HOLD'};
  if(decision==='PASS_TO_SAFE_CANDIDATE_POOL')safe.push(wrapped);else if(decision==='HARD_BLOCK')blocked.push(wrapped);else review.push(wrapped);
}
const output={
  id:'kidults-asi-gate1-safe-candidate-pool-v1',version:'1.0.0',status:'SHADOW_GATE1_INGRESS_CLASSIFICATION_COMPLETE',
  purpose:'DISCOVERY_METADATA_INDEX_ONLY',input_candidate_count:(x.candidates||[]).length,
  safe_candidate_count:safe.length,review_required_count:review.length,hard_block_count:blocked.length,
  safe_candidate_pool:safe,review_required_queue:review,hard_block_queue:blocked,receipts,
  gate2_required_before_any_collection_right:true,gate3_required_before_bounded_acquisition:true,
  rights_promoted_automatically:false,admission_promoted_automatically:false,acquisition_authorized:false,
  public_release:'HOLD',production:'HOLD'
};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,input:output.input_candidate_count,safe:output.safe_candidate_count,review:output.review_required_count,blocked:output.hard_block_count,production:'HOLD'},null,2));
