#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import {URL} from 'node:url';

const [discoveryPath='/tmp/discovery.json',backfillPath='/tmp/asi-product-value-backfill-v1.json',outputPath='/tmp/asi-product-value-gated-discovery-v1.json']=process.argv.slice(2);
const discovery=JSON.parse(fs.readFileSync(discoveryPath,'utf8'));
const backfill=JSON.parse(fs.readFileSync(backfillPath,'utf8'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const canonicalUrl=value=>{try{const u=new URL(value);u.hash='';u.search='';u.hostname=u.hostname.toLowerCase();u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.toString()}catch{return null}};
const ownerScope=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,'');
const digestPayload=structuredClone(backfill);delete digestPayload.digest;
const computedBackfillDigest='sha256:'+sha(JSON.stringify(digestPayload));
if(backfill.digest!==computedBackfillDigest)throw new Error('PRODUCT_VALUE_UPSTREAM_DIGEST_INVALID');

const bySourceId=new Map();
const canonicalLocatorOwners=new Map();
for(const record of backfill.records||[]){
  if(!record.source_id||bySourceId.has(record.source_id))throw new Error('PRODUCT_VALUE_SOURCE_ID_DUPLICATE_OR_MISSING');
  const locators=[record.official_url,record.official_documentation_url].map(canonicalUrl).filter(Boolean);
  if(!locators.length)throw new Error(`PRODUCT_VALUE_CANONICAL_LOCATOR_MISSING:${record.source_id}`);
  const scope=ownerScope(record.display_name);
  if(!scope)throw new Error(`PRODUCT_VALUE_OWNER_SCOPE_MISSING:${record.source_id}`);
  const bound={record,locators:new Set(locators),owner_scope:scope};bySourceId.set(record.source_id,bound);
  for(const locator of locators){const owners=canonicalLocatorOwners.get(locator)||new Set();owners.add(record.source_id);canonicalLocatorOwners.set(locator,owners)}
}

const admitted=[],enrichment=[];
for(const candidate of discovery.candidates||[]){
  const sourceId=String(candidate.provider_record_id||'');
  const locator=canonicalUrl(candidate.endpoint_url);
  const bound=bySourceId.get(sourceId);
  let reason=null;
  if(!bound)reason='SOURCE_ID_NOT_BOUND_TO_CURATED_VALUE_RECORD';
  else if(!locator||!bound.locators.has(locator))reason='CANONICAL_URL_PATH_MISMATCH';
  else if(ownerScope(candidate.source_owner_hint)!==bound.owner_scope)reason='SOURCE_OWNER_SCOPE_MISMATCH';
  else if((canonicalLocatorOwners.get(locator)?.size||0)>1)reason='AMBIGUOUS_CANONICAL_LOCATOR_COLLISION';
  else if(bound.record.value_admission_status!=='VALUE_ELIGIBLE_CONTINUE_RIGHTS_REVIEW'||!Number.isFinite(bound.record.value_score)||bound.record.value_score<70||bound.record.hard_minimum_complete!==true)reason='CURATED_SOURCE_VALUE_ENRICHMENT_INCOMPLETE';

  if(!reason){
    admitted.push({...candidate,product_value_source_id:bound.record.source_id,product_value_score:bound.record.value_score,product_value_gate:'PASS',product_value_binding:{source_id:bound.record.source_id,canonical_locator:locator,owner_scope:bound.owner_scope,upstream_digest:computedBackfillDigest,hard_minimum_complete:true}});
  }else{
    enrichment.push({candidate_id:candidate.candidate_id,endpoint_url:candidate.endpoint_url,matched_curated_source_id:bound?.record.source_id||null,reason,acquisition_authorized:false});
  }
}
const output={...discovery,id:'kidults-asi-product-value-gated-discovery-v1',version:'1.1.0',status:'PRODUCT_VALUE_GATE_APPLIED_BEFORE_RIGHTS_GATE1',product_value_upstream_id:backfill.id,product_value_upstream_digest:computedBackfillDigest,product_value_binding_mode:'SOURCE_ID_CANONICAL_URL_PATH_AND_OWNER_SCOPE',pre_value_gate_candidate_count:(discovery.candidates||[]).length,candidates:admitted,candidate_count:admitted.length,live_external_candidate_count:admitted.filter(x=>x.live_external_observation).length,product_value_admitted_count:admitted.length,product_value_enrichment_queue_count:enrichment.length,product_value_enrichment_queue:enrichment,product_value_gate_fail_closed:true,acquisition_authorized:false,public_release:'HOLD',production:'HOLD'};
fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({pre_value_gate:output.pre_value_gate_candidate_count,admitted:output.product_value_admitted_count,enrichment:output.product_value_enrichment_queue_count,upstream_digest:computedBackfillDigest},null,2));
