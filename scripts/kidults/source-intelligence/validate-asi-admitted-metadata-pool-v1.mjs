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
if(x.content_acquisition_authorized!==false||x.collection_right_created!==false)fail('acquisition or collection right promoted');
if(x.public_release!=='HOLD'||x.production!=='HOLD')fail('public/production must HOLD');
if(Number(x.active_count)!==(x.active_admitted_metadata_pool||[]).length)fail('active count mismatch');
if(Number(x.stale_revalidation_count)!==(x.stale_revalidation_queue||[]).length)fail('stale count mismatch');
if(Number(x.revoked_block_count)!==(x.revoked_block_queue||[]).length)fail('revoked count mismatch');
const activeKeys=new Set();
for(const c of x.active_admitted_metadata_pool||[]){
 if(!c.canonical_source_key)fail('canonical key missing');
 if(activeKeys.has(c.canonical_source_key))fail('duplicate canonical key');activeKeys.add(c.canonical_source_key);
 if(c.content_acquisition_authorized!==false||c.acquisition_authorized!==false)fail('active candidate crossed acquisition boundary');
 if(c.admission_state!=='ADMITTED_DISCOVERY_METADATA_INDEX_ONLY')fail('active admission scope mismatch');
 const r=c.admitted_pool_receipt||{};if(r.fresh!==true||r.is_revoked!==false)fail('active candidate stale or revoked');
}
for(const c of x.stale_revalidation_queue||[]){if(activeKeys.has(c.canonical_source_key))fail('stale candidate also active')}
for(const c of x.revoked_block_queue||[]){if(activeKeys.has(c.canonical_source_key))fail('revoked candidate reentered active pool');const r=c.admitted_pool_receipt||{};if(r.is_revoked!==true||r.alias_reentry_blocked!==true)fail('revocation receipt invalid')}
console.log(JSON.stringify({status:'PASS',active:x.active_count,stale:x.stale_revalidation_count,revoked:x.revoked_block_count,production:x.production},null,2));
