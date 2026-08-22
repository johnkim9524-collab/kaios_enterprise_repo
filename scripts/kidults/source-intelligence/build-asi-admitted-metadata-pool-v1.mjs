#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const gate3Path=process.argv[2]||'/tmp/asi-gate3-admission-runtime-v1.json';
const prevPath=process.argv[3]||'/tmp/previous-any-site-pool/asi-admitted-metadata-pool-v1.json';
const registryPath=process.argv[4]||'coordination/kidults/source-intelligence/asi-admitted-metadata-revocation-registry-v1.json';
const out=process.argv[5]||'/tmp/asi-admitted-metadata-pool-v1.json';
const gate3=JSON.parse(fs.readFileSync(gate3Path,'utf8'));
const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
const previous=fs.existsSync(prevPath)?JSON.parse(fs.readFileSync(prevPath,'utf8')):null;
const now=new Date();
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
function canonicalKey(raw){
  const u=new URL(raw);u.hash='';u.hostname=u.hostname.toLowerCase().replace(/^www\./,'');
  if((u.protocol==='https:'&&u.port==='443')||(u.protocol==='http:'&&u.port==='80'))u.port='';
  u.pathname=u.pathname.replace(/\/+$/,'')||'/';
  return `${u.protocol}//${u.host}${u.pathname}${u.search}`;
}
const revocations=registry.revocations||[];
const revoked=new Set();
for(const r of revocations){for(const v of [r.canonical_key,...(r.aliases||[])].filter(Boolean)){try{revoked.add(canonicalKey(v))}catch{revoked.add(String(v).toLowerCase())}}}
const admitted=[];const stale=[];const revokedQueue=[];const receipts=[];const seen=new Set();
for(const c of gate3.bounded_metadata_index_admission_pool||[]){
  const g3=c.gate_3_receipt||{};const at=new Date(g3.verified_at||0);const ageH=(now-at)/36e5;const fresh=Number.isFinite(ageH)&&ageH>=0&&ageH<=24;
  let key;try{key=canonicalKey(c.endpoint_url)}catch{continue}
  const isRevoked=revoked.has(key);const receipt={candidate_id:c.candidate_id,canonical_key:key,endpoint_url:c.endpoint_url,checked_at:new Date().toISOString(),gate3_receipt_age_hours:Number(ageH.toFixed(3)),freshness_ttl_hours:24,fresh,is_revoked:isRevoked,alias_reentry_blocked:isRevoked,content_acquisition_authorized:false,collection_right_created:false,production:'HOLD'};
  receipts.push(receipt);
  const wrapped={...c,canonical_source_key:key,admitted_pool_receipt:receipt,content_acquisition_authorized:false,acquisition_authorized:false,production:'HOLD'};
  if(isRevoked){revokedQueue.push(wrapped);continue}
  if(!fresh){stale.push(wrapped);continue}
  if(!seen.has(key)){seen.add(key);admitted.push(wrapped)}
}
for(const c of previous?.active_admitted_metadata_pool||[]){
  let key;try{key=canonicalKey(c.endpoint_url)}catch{continue}
  if(seen.has(key)||revoked.has(key))continue;
  const g3=c.gate_3_receipt||{};const at=new Date(g3.verified_at||0);const ageH=(now-at)/36e5;const fresh=Number.isFinite(ageH)&&ageH>=0&&ageH<=24;
  if(fresh){seen.add(key);admitted.push({...c,canonical_source_key:key})}else stale.push({...c,canonical_source_key:key});
}
const output={id:'kidults-asi-admitted-metadata-pool-v1',version:'1.0.0',status:'SHADOW_ADMITTED_METADATA_POOL_REVALIDATED',scope:'DISCOVERY_METADATA_INDEX_ONLY',freshness_ttl_hours:24,active_count:admitted.length,stale_revalidation_count:stale.length,revoked_block_count:revokedQueue.length,active_admitted_metadata_pool:admitted,stale_revalidation_queue:stale,revoked_block_queue:revokedQueue,receipts,revocation_registry_fingerprint:sha(JSON.stringify(registry)),alias_reentry_block_required:true,content_acquisition_authorized:false,collection_right_created:false,public_release:'HOLD',production:'HOLD'};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,active:output.active_count,stale:output.stale_revalidation_count,revoked:output.revoked_block_count,production:'HOLD'},null,2));
