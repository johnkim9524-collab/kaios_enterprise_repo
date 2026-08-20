import fs from 'node:fs';
const x=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/empirical-regional-baseline-with-data-usability-r1.json','utf8'));
const fail=m=>{throw new Error(m)};
if(x.production!=='HOLD'||x.public_release!=='HOLD')fail('RELEASE_BOUNDARY');
const s=x.category_specific_factor_summary;if(!s||s.category_scope!=='vinyl_recorded_music'||s.canonical_factor!=='DATA_TRANSPARENCY_AND_EVIDENCE_QUALITY'||s.feedback_alias!=='EVIDENCE_QUALITY'||s.state!=='VERIFIED')fail('SUMMARY');
if(!(Number(s.score)>0&&Number(s.score)<1)||s.confidence!=='MEDIUM'||Number(s.source_owner_count)!==1)fail('SCORE_CONFIDENCE');
if(s.market_scale_verified!==false||s.market_maturity_verified!==false||s.transaction_activity_verified!==false)fail('OVERCLAIM');
const cells=(x.cells||[]).filter(c=>c.category_scope==='vinyl_recorded_music');if(!cells.length||cells.length!==s.verified_region_cells)fail('CELL_COUNT');
for(const c of cells){const a=c.factors?.DATA_TRANSPARENCY_AND_EVIDENCE_QUALITY,b=c.factors?.EVIDENCE_QUALITY;if(!a||!b||a.state!=='VERIFIED'||b.state!=='VERIFIED'||b.alias_of!=='DATA_TRANSPARENCY_AND_EVIDENCE_QUALITY'||a.value!==b.value)fail(`FACTOR_ALIAS:${c.macroregion_id}`);if(a.confidence!=='MEDIUM'||a.source_owner_count!==1||a.rights_state!=='ALLOW_CORE_CC0')fail(`FACTOR_BOUNDARY:${c.macroregion_id}`);if(a.score_detail?.TRANSACTION_PRICE_CURRENCY_VENUE_COMPLETENESS?.pass!==false||a.score_detail?.TRANSACTION_PRICE_CURRENCY_VENUE_COMPLETENESS?.contribution!==0)fail(`TRANSACTION_ABSENCE_NOT_PRESERVED:${c.macroregion_id}`);if(c.collection_quota!==null||c.analytical_weight!==null)fail(`WEIGHT_MUTATION:${c.macroregion_id}`);}
console.log(JSON.stringify({status:'PASS',category:s.category_scope,score:s.score,confidence:s.confidence,verified_region_cells:cells.length,regions:cells.map(c=>c.macroregion_id),market_scale_verified:false,transaction_activity_verified:false,production:'HOLD'}));
