#!/usr/bin/env node
import fs from 'node:fs';
const x=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/asi-any-site-source-family-classification-v1.json','utf8'));
const fail=m=>{throw new Error(m)};
if(x.id!=='kidults-asi-any-site-source-family-classification-v1'||x.status!=='SHADOW_METADATA_ONLY_SOURCE_FAMILY_CLASSIFICATION_COMPLETE')fail('IDENTITY');
if(x.universe_target!=='GLOBAL_ANY_SITE_SOURCE_UNIVERSE'||x.universe_restricted_by_classification!==false)fail('UNIVERSE_BOUNDARY');
if(x.production!=='HOLD'||x.public_release!=='HOLD'||x.acquisition_authorized!==false)fail('RELEASE_BOUNDARY');
if(x.rules?.metadata_only!==true||x.rules?.classification_is_candidate_only!==true||x.rules?.listing_is_not_sold!==true||x.rules?.sold_transaction_requires_terminal_event_assertion!==true||x.rules?.unknown_remains_unclassified!==true||x.rules?.rights_never_promoted!==true||x.rules?.admission_never_promoted!==true)fail('RULES');
if(!Array.isArray(x.candidates)||x.candidates.length!==x.input_candidate_count)fail('COUNT');
const allowedFamilies=new Set(['UNCLASSIFIED_ANY_SITE_CANDIDATE','OPEN_MARKETPLACE_OR_DEALER','PRIMARY_OR_OFFICIAL_AUTHORITY','GRADING_AUTHENTICATION_OR_CONDITION','MEDIA_COMMUNITY_OR_EVENT_CONTEXT','MUSEUM_OR_INSTITUTIONAL_CONTEXT']);
const allowedRoles={UNCLASSIFIED_ANY_SITE_CANDIDATE:['UNCLASSIFIED_PENDING_RELEVANCE'],OPEN_MARKETPLACE_OR_DEALER:['LISTING_SUPPLY','SOLD_TRANSACTION','AUTHENTICATION_CONDITION'],PRIMARY_OR_OFFICIAL_AUTHORITY:['PRIMARY_AUTHORITY','CATALOG_REFERENCE','PROVENANCE_HISTORY'],GRADING_AUTHENTICATION_OR_CONDITION:['AUTHENTICATION_CONDITION','CATALOG_REFERENCE'],MEDIA_COMMUNITY_OR_EVENT_CONTEXT:['CULTURE_ATTENTION'],MUSEUM_OR_INSTITUTIONAL_CONTEXT:['CATALOG_REFERENCE','PROVENANCE_HISTORY','CULTURE_ATTENTION']};
for(const c of x.candidates){
 if(!allowedFamilies.has(c.source_family_hint))fail(`FAMILY:${c.candidate_id}`);
 if(c.rights_state!=='UNASSESSED'||c.admission_state!=='NOT_ADMITTED'||c.acquisition_authorized!==false||c.target_site_body_crawled!==false||c.production!=='HOLD')fail(`PROMOTION:${c.candidate_id}`);
 if(!Array.isArray(c.candidate_source_roles)||!c.candidate_source_roles.length)fail(`ROLES:${c.candidate_id}`);
 for(const r of c.candidate_source_roles){if(!allowedRoles[c.source_family_hint].includes(r))fail(`ROLE_FAMILY_MISMATCH:${c.candidate_id}:${r}`);if(r==='SOLD_TRANSACTION'&&c.terminal_transaction_asserted!==true)fail(`LISTING_IS_NOT_SOLD:${c.candidate_id}`)}
 if(c.source_family_classification?.rights_effect!=='NONE'||c.source_family_classification?.admission_effect!=='NONE'||c.source_family_classification?.market_claim_effect!=='NONE')fail(`CLASSIFICATION_EFFECT:${c.candidate_id}`);
}
console.log(JSON.stringify({status:'PASS',input:x.input_candidate_count,classified:x.classified_candidate_count,unclassified:x.unclassified_candidate_count,families:x.source_family_counts,production:'HOLD'}));
