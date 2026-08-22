#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const input=process.argv[2]||'/tmp/asi-gate2-independent-reverification-v1.json';
const out=process.argv[3]||'/tmp/asi-gate3-admission-runtime-v1.json';
const x=JSON.parse(fs.readFileSync(input,'utf8'));
const now=new Date();
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const admitted=[],approval=[],hold=[],rejected=[],receipts=[];

for(const c of x.verified_eligible_pool||[]){
  const g2=c.gate_2_receipt||{};
  const reverifiedAt=new Date(g2.reverified_at||0);
  const ageH=(now-reverifiedAt)/36e5;
  const fresh=Number.isFinite(ageH)&&ageH>=0&&ageH<=24;
  const rights=g2.purpose_rights_matrix||{};
  const externalCommitment=Boolean(c.new_eula_or_contract||c.paid_plan_or_spend||c.new_or_expanded_credential_permission||c.provider_activation_with_external_commitment||c.ambiguous_or_custom_license);
  let decision='CONDITIONAL_HOLD';const reasons=[];

  if(g2.decision!=='VERIFIED_FOR_GATE_3'){decision='REJECTED';reasons.push('GATE2_VERIFIED_FOR_GATE3_REQUIRED');}
  else if(!fresh){decision='CONDITIONAL_HOLD';reasons.push('GATE2_RECEIPT_STALE_OR_INVALID');}
  else if(rights.discover_metadata!=='ALLOW'){decision='CONDITIONAL_HOLD';reasons.push('DISCOVERY_METADATA_RIGHT_NOT_VERIFIED');}
  else if(externalCommitment){decision='EXTERNAL_APPROVAL_REQUIRED';reasons.push('EXTERNAL_COMMITMENT_OR_APPROVAL_GATE_REQUIRED');}
  else {
    decision='ADMITTED_FOR_BOUNDED_AUTOMATED_ACQUISITION';
    reasons.push('GATE2_CURRENT_AND_PURPOSE_SUBSET_VERIFIED_NO_EXTERNAL_COMMITMENT');
  }

  const requestedPurpose='DISCOVERY_METADATA_INDEX_ONLY';
  const receipt={
    receipt_type:'GATE_3_ADMISSION_ACTIVATION_RECEIPT',gate:'GATE_3_ADMISSION_ACTIVATION_VERIFICATION',source_candidate_id:c.candidate_id,
    canonical_locator:c.endpoint_url,gate2_receipt_fingerprint:sha(JSON.stringify(g2)),gate2_reverified_at:g2.reverified_at||null,
    verified_at:new Date().toISOString(),freshness:{gate2_receipt_age_hours:Number(ageH.toFixed(3)),gate2_receipt_fresh:fresh,ttl_hours:24},
    requested_purpose:requestedPurpose,decision,reasons,
    runtime_controls:{target_site_body_crawl:false,content_acquisition:false,credential_activation:false,kill_switch_required:true,revocation_revalidation_required:true,alias_reentry_block_required:true},
    collection_right_created:false,store_right_created:false,derive_right_created:false,redistribution_right_created:false,
    content_acquisition_authorized:false,metadata_index_admission_authorized:decision==='ADMITTED_FOR_BOUNDED_AUTOMATED_ACQUISITION',
    public_projection:false,production:'HOLD'
  };
  receipts.push(receipt);
  const wrapped={...c,gate_3_state:decision,gate_3_receipt:receipt,admission_state:decision==='ADMITTED_FOR_BOUNDED_AUTOMATED_ACQUISITION'?'ADMITTED_DISCOVERY_METADATA_INDEX_ONLY':decision,acquisition_authorized:false,content_acquisition_authorized:false,production:'HOLD'};
  if(decision==='ADMITTED_FOR_BOUNDED_AUTOMATED_ACQUISITION')admitted.push(wrapped);
  else if(decision==='EXTERNAL_APPROVAL_REQUIRED')approval.push(wrapped);
  else if(decision==='REJECTED')rejected.push(wrapped);
  else hold.push(wrapped);
}

const output={
  id:'kidults-asi-gate3-admission-runtime-v1',version:'1.0.0',status:'SHADOW_GATE3_ADMISSION_CLASSIFICATION_COMPLETE',
  requested_purpose:'DISCOVERY_METADATA_INDEX_ONLY',input_verified_for_gate3_count:(x.verified_eligible_pool||[]).length,
  admitted_count:admitted.length,external_approval_required_count:approval.length,conditional_hold_count:hold.length,rejected_count:rejected.length,
  bounded_metadata_index_admission_pool:admitted,external_approval_queue:approval,conditional_hold_queue:hold,rejected_queue:rejected,receipts,
  content_acquisition_authorized:false,collection_right_created:false,admission_scope_limited_to_discovery_metadata_index_only:true,
  public_release:'HOLD',production:'HOLD'
};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,input:output.input_verified_for_gate3_count,admitted:output.admitted_count,external_approval:output.external_approval_required_count,hold:output.conditional_hold_count,production:'HOLD'},null,2));
