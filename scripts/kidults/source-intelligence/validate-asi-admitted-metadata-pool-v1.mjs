#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'/tmp/asi-admitted-metadata-pool-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
if(x.id!=='kidults-asi-admitted-metadata-pool-v1')fail('id mismatch');
if(x.status!=='SHADOW_ADMITTED_METADATA_POOL_REVALIDATED')fail('status mismatch');
if(x.scope!=='DISCOVERY_METADATA_INDEX_ONLY')fail('scope expansion');
if(Number(x.freshness_ttl_hours)!==24)fail('freshness ttl mismatch');
if(x.alias_reentry_block_required!==true)fail('alias reentry block required');
if(x.product_value_gate_required_for_active!==true)fail('product value gate required for active pool');
if(x.content_acquisition_authorized!==false||x.collection_right_created!==false)fail('acquisition or collection right promoted');
if(x.public_release!=='HOLD'||x.production!=='HOLD')fail('public/production must HOLD');
if(Number(x.active_count)!==(x.active_admitted_metadata_pool||[]).length)fail('active count mismatch');
if(Number(x.stale_revalidation_count)!==(x.stale_revalidation_queue||[]).length)fail('stale count mismatch');
if(Number(x.revoked_block_count)!==(x.revoked_block_queue||[]).length)fail('revoked count mismatch');
if(Number(x.product_value_revalidation_count)!==(x.product_value_revalidation_queue||[]).length)fail('product value revalidation count mismatch');
const activeKeys=new Set();
for(const c of x.active_admitted_metadata_pool||[]){
 if(!c.canonical_source_key)fail('canonical key missing');
 if(activeKeys.has(c.canonical_source_key))fail('duplicate canonical key');activeKeys.add(c.canonical_source_key);
 if(c.content_acquisition_authorized!==false||c.acquisition_authorized!==false)fail('active candidate crossed acquisition boundary');
 if(c.admission_state!=='ADMITTED_DISCOVERY_METADATA_INDEX_ONLY')fail('active admission scope mismatch');
 if(c.product_value_gate!=='PASS'||!Number.isFinite(c.product_value_score)||c.product_value_score<70||!c.product_value_source_id)fail('active candidate lacks product value proof');
 const r=c.admitted_pool_receipt||{};if(r.fresh!==true||r.is_revoked!==false)fail('active candidate stale or revoked');
}
for(const c of x.stale_revalidation_queue||[]){if(activeKeys.has(c.canonical_source_key))fail('stale candidate also active')}
for(const c of x.revoked_block_queue||[]){if(activeKeys.has(c.canonical_source_key))fail('revoked candidate reentered active pool');const r=c.admitted_pool_receipt||{};if(r.is_revoked!==true||r.alias_reentry_blocked!==true)fail('revocation receipt invalid')}
for(const c of x.product_value_revalidation_queue||[]){if(activeKeys.has(c.canonical_source_key))fail('product value hold candidate reentered active pool');if(c.product_value_gate==='PASS'&&Number.isFinite(c.product_value_score)&&c.product_value_score>=70&&c.product_value_source_id)fail('proven candidate incorrectly held');for(const f of ['acquisition_authorized','content_acquisition_authorized','market_claim_authorized','evidence_admission_authorized','track_b_authorized','projection_authorized','public_projection'])if(c[f]!==false)fail('product value hold authority widened:'+f);if(c.production!=='HOLD')fail('product value hold production widened')}
console.log(JSON.stringify({status:'PASS',active:x.active_count,stale:x.stale_revalidation_count,revoked:x.revoked_block_count,product_value_revalidation:x.product_value_revalidation_count,production:x.production},null,2));
