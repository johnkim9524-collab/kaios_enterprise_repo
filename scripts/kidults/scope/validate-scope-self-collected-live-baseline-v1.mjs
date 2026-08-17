import fs from 'node:fs';
const dir=process.argv[2]||'scope-poc-live-out';const p=`${dir}/scope-self-collected-live-baseline-v1.json`;const x=JSON.parse(fs.readFileSync(p,'utf8'));const fail=s=>{console.error('FAIL',s);process.exit(1)};
if(x.scope_count!==32||x.scope_summaries.length!==32)fail('32 scopes required');
if(x.product_count!==64||x.product_results.length!==64||x.products_attempted!==64)fail('64 products required');
if(new Set(x.product_results.map(r=>r.representative_product_id)).size!==64)fail('unique product IDs');
for(const s of x.scope_summaries)if(s.products_attempted!==2)fail(`${s.scope_id}: products_attempted`);
if(x.generic_github_repository_discovery!==false||x.restricted_scraping!==false)fail('discovery safety');
if(x.provider_contact_authorized!==false||x.qualification_authorized!==false||x.index_authorized!==false||x.production!=='HOLD')fail('governance hold');
if(x.provider_gap_status!=='NOT_FROZEN_MORE_SELF_COLLECTION_REQUIRED')fail('provider gap must not freeze after open metadata baseline');
for(const r of x.product_results){if(r.collectible_qualified||r.representative_qualified||r.index_eligible)fail(`${r.representative_product_id}: qualification shortcut`)}
for(const c of x.candidates){if(c.provider==='WIKIDATA_OFFICIAL_WEBSITE_POINTER'&&c.content_acquired)fail('official pointer content must not be acquired');if(!c.rights_state)fail('rights state required')}
for(const g of ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'])if(!x.north_star[g])fail(`north-star ${g}`);
if(!x.scope_summaries.some(s=>s.semantic_review_required))fail('scope semantic review signal must survive');
console.log(JSON.stringify({status:'PASS',scopes:32,products:64,candidates:x.candidate_count,request_errors:x.request_error_count,semantic_reviews:x.scope_summaries.filter(s=>s.semantic_review_required).length,provider_contact:'HOLD',production:'HOLD',north_star:x.north_star},null,2));