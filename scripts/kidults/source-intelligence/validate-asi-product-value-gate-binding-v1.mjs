#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import {URL} from 'node:url';

const outputPath=process.argv[2]||'/tmp/asi-product-value-gated-discovery-v1.json';
const backfillPath=process.argv[3]||'/tmp/asi-product-value-backfill-v1.json';
const value=JSON.parse(fs.readFileSync(outputPath,'utf8'));
const backfill=JSON.parse(fs.readFileSync(backfillPath,'utf8'));
const assert=(condition,code)=>{if(!condition)throw new Error(code)};
const sha=input=>crypto.createHash('sha256').update(input).digest('hex');
const canonicalUrl=input=>{try{const u=new URL(input);u.hash='';u.search='';u.hostname=u.hostname.toLowerCase();u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.toString()}catch{return null}};
const ownerScope=input=>String(input||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,'');
const digestPayload=structuredClone(backfill);delete digestPayload.digest;
const upstreamDigest='sha256:'+sha(JSON.stringify(digestPayload));
assert(backfill.digest===upstreamDigest,'UPSTREAM_DIGEST_INVALID');
assert(value.product_value_upstream_digest===upstreamDigest&&value.product_value_upstream_id===backfill.id,'UPSTREAM_BINDING_MISMATCH');
assert(value.id==='kidults-asi-product-value-gated-discovery-v1'&&value.version==='1.1.0'&&value.status==='PRODUCT_VALUE_GATE_APPLIED_BEFORE_RIGHTS_GATE1','IDENTITY');
assert(value.product_value_binding_mode==='SOURCE_ID_CANONICAL_URL_PATH_AND_OWNER_SCOPE','BINDING_MODE');
assert(value.pre_value_gate_candidate_count===value.product_value_admitted_count+value.product_value_enrichment_queue_count,'ACCOUNTING');
assert(value.candidate_count===value.candidates.length&&value.product_value_admitted_count===value.candidates.length,'ADMITTED_COUNT');
assert(value.product_value_gate_fail_closed===true&&value.acquisition_authorized===false,'BOUNDARY');
const records=new Map((backfill.records||[]).map(record=>[record.source_id,record]));
assert(records.size===(backfill.records||[]).length,'UPSTREAM_SOURCE_ID_DEDUPE');
for(const candidate of value.candidates){
  const binding=candidate.product_value_binding||{};const record=records.get(binding.source_id);
  assert(record&&candidate.product_value_source_id===record.source_id,'SOURCE_ID_MISBINDING');
  assert(candidate.provider_record_id===record.source_id,'PROVIDER_RECORD_SOURCE_ID_MISBINDING');
  const locator=canonicalUrl(candidate.endpoint_url);const allowed=[record.official_url,record.official_documentation_url].map(canonicalUrl);
  assert(locator&&allowed.includes(locator)&&binding.canonical_locator===locator,'CANONICAL_URL_PATH_MISBINDING');
  assert(ownerScope(candidate.source_owner_hint)===ownerScope(record.display_name)&&binding.owner_scope===ownerScope(record.display_name),'OWNER_SCOPE_MISBINDING');
  const collisions=(backfill.records||[]).filter(r=>[r.official_url,r.official_documentation_url].map(canonicalUrl).includes(locator));
  assert(collisions.length===1,'AMBIGUOUS_CANONICAL_LOCATOR_COLLISION');
  assert(record.value_admission_status==='VALUE_ELIGIBLE_CONTINUE_RIGHTS_REVIEW'&&Number.isFinite(record.value_score)&&record.value_score>=70&&record.hard_minimum_complete===true,'UNQUALIFIED_GATE1');
  assert(candidate.product_value_gate==='PASS'&&candidate.product_value_score===record.value_score&&binding.upstream_digest===upstreamDigest&&binding.hard_minimum_complete===true,'VALUE_RECEIPT_MISBINDING');
}
for(const candidate of value.product_value_enrichment_queue)assert(candidate.acquisition_authorized===false&&candidate.reason,'ENRICHMENT_PROMOTION');
assert(new Set(value.product_value_enrichment_queue.map(x=>x.candidate_id)).size===value.product_value_enrichment_queue.length,'ENRICHMENT_DEDUPE');
console.log(JSON.stringify({suite:'KIDULTS_ASI_PRODUCT_VALUE_GATE_BINDING_V1',result:'PASS',gate1_candidates:value.candidate_count,enrichment_queue:value.product_value_enrichment_queue_count,upstream_digest:upstreamDigest},null,2));
